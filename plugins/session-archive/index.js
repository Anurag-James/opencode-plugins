// OpenCode (2.x) server plugin: session_archive and session_wrap_up tools,
// plus a /wrap-up command. No dependencies; everything comes from `ctx`.
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const MIN_SUMMARY_CHARS = 200
const SUMMARY_DIR = path.join(".opencode", "session-summaries")
const OVERRIDE_MAX_CHARS = 20000

// Global OpenCode config directory: $XDG_CONFIG_HOME/opencode, else ~/.config/opencode.
const globalConfigDir = () => path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "opencode")

const WRAP_UP_DESCRIPTION = [
  "Wrap up a session: record how it went, then archive the session.",
  "If the environment already defines a session-end, wrap-up, handoff or ledger-closing procedure (in its skills or project instructions),",
  "that procedure takes precedence: carry it out first, and do not write a second, different summary.",
  "Pass either `summary` (markdown you write) or `recordPath` (a file the existing procedure already wrote; relative paths resolve against the session directory), or both.",
  "With `recordPath` the file is not copied: the tool saves a short pointer to it.",
  "The tool saves its file under .opencode/session-summaries/ in the session's working directory and archives only if that save worked.",
  "A `summary` or record shorter than " + MIN_SUMMARY_CHARS + " characters is rejected and nothing is archived.",
  "A summary must cover the WHOLE session, not only the latest turn; if your context was compacted, re-read the session's earlier messages first, using whatever message-reading means you have (in OpenChamber: the openchamber tool's session.messages action with all set to true).",
  "When no existing procedure applies, the default contents are, in this order: (1) objective of the session; (2) what was done, in order; (3) decisions made and why;",
  "(4) files created or changed, with paths; (5) commands or checks run and their results;",
  "(6) what is unfinished or unverified; (7) suggested next steps.",
  "Set archive to false to save without archiving. sessionId defaults to the current session.",
].join(" ")

const WRAP_UP_PROMPT = [
  "Wrap up this session.",
  "1. Check whether this environment already defines a wrap-up, session-end, handoff or ledger-closing procedure (in its skills or project instruction files).",
  "If it does, carry that out first and use its result rather than writing a second, different summary; then skip to step 4, passing the file it wrote as recordPath (or its text as summary).",
  "2. Otherwise review the WHOLE session, not just the latest turn. If your context was compacted, re-read earlier messages first.",
  "3. Write a markdown summary with these sections, in order: Objective; What was done (in order); Decisions and why;",
  "Files created or changed (paths); Commands or checks run and results; Unfinished or unverified; Suggested next steps.",
  "4. Call the session_wrap_up tool with the summary or recordPath. It saves a record to the project folder and archives the session.",
  "5. Tell me the saved file path and the archive state.",
].join("\n")

const OVERRIDE_CLOSING =
  "Finish by calling the session_wrap_up tool: pass `summary` with the summary you wrote, or `recordPath` with the file your procedure already wrote. Then report the saved file path and the archive state."

// Reads wrap-up.md: project (<dir>/.opencode/wrap-up.md) first, then global. Empty file = absent.
const readOverride = async (directory) => {
  const candidates = [directory && path.join(directory, ".opencode", "wrap-up.md"), path.join(globalConfigDir(), "wrap-up.md")]
  for (const file of candidates.filter(Boolean)) {
    try {
      const text = (await readFile(file, "utf8")).slice(0, OVERRIDE_MAX_CHARS).trim()
      if (text) return text
    } catch {
      // missing or unreadable: try the next one
    }
  }
  return undefined
}

// Models sometimes send booleans as strings.
const toBool = (value, fallback) => (value === undefined || value === null ? fallback : value === true || value === "true")

const reply = (content, ok, extra = {}) => ({ content, metadata: { sessionArchive: { ok, ...extra } } })

const isArchived = (info) => info?.time?.archived !== undefined && info?.time?.archived !== null

const describeError = (error) => (error instanceof Error ? error.message : String(error))

const getSession = async (ctx, sessionID) => {
  try {
    return { info: await ctx.session.get({ sessionID }) }
  } catch (error) {
    return { error: `No session with id "${sessionID}" (${describeError(error)}). Nothing was changed.` }
  }
}

// Sets the archived flag and reads the result back from the host.
const applyArchived = async (ctx, sessionID, archived) => {
  await ctx.session.update({ sessionID, archived })
  return isArchived(await ctx.session.get({ sessionID }))
}

const stateWord = (archived) => (archived ? "archived" : "not archived (active)")

const archiveTool = (ctx) => ({
  name: "session_archive",
  description:
    "Archive a session, or restore it with archived=false. Omit sessionId to act on the current session. Archived sessions leave the active session list but are not deleted.",
  options: { codemode: false },
  input: {
    type: "object",
    properties: {
      sessionId: { type: "string", description: "Session id. Defaults to the current session." },
      archived: { type: "boolean", description: "true (default) archives the session; false restores it." },
    },
    additionalProperties: false,
  },
  async execute(input, context) {
    const sessionID = input?.sessionId || context.sessionID
    const wanted = toBool(input?.archived, true)
    const found = await getSession(ctx, sessionID)
    if (found.error) return reply(found.error, false, { sessionID })
    try {
      const now = await applyArchived(ctx, sessionID, wanted)
      const note = now === wanted ? "" : ` Warning: requested ${wanted ? "archive" : "restore"} but the host reports the other state.`
      return reply(`Session ${sessionID} is now ${stateWord(now)}.${note}`, now === wanted, { sessionID, archived: now })
    } catch (error) {
      return reply(`Could not change session ${sessionID}: ${describeError(error)}`, false, { sessionID })
    }
  },
})

const writeSummary = async (directory, sessionID, title, body) => {
  const now = new Date()
  const stamp = now.toISOString()
  const folder = path.join(directory, SUMMARY_DIR)
  const file = path.join(folder, `${stamp.slice(0, 10)}-${sessionID}.md`)
  await mkdir(folder, { recursive: true })
  const section = `## Wrap-up ${stamp}\n\n${body.trim()}\n`
  const header = [
    `# Session summary`,
    "",
    `- Session id: ${sessionID}`,
    `- Title: ${title || "(none)"}`,
    `- Working directory: ${directory}`,
    `- Written: ${stamp}`,
    "",
    "",
  ].join("\n")
  try {
    await writeFile(file, header + section, { flag: "wx" })
  } catch (error) {
    if (error?.code !== "EEXIST") throw error
    await appendFile(file, `\n---\n\n${section}`)
  }
  return file
}

const wrapUpTool = (ctx) => ({
  name: "session_wrap_up",
  description: WRAP_UP_DESCRIPTION,
  options: { codemode: false },
  input: {
    type: "object",
    properties: {
      summary: { type: "string", description: "Markdown summary of the whole session. Give this or recordPath (or both)." },
      recordPath: {
        type: "string",
        description: "Path to a file an existing session-end procedure already wrote; relative paths resolve against the session directory. Not copied: only a pointer is saved.",
      },
      archive: { type: "boolean", description: "Archive the session after saving. Default true." },
      sessionId: { type: "string", description: "Session id. Defaults to the current session." },
    },
    additionalProperties: false,
  },
  async execute(input, context) {
    const summary = typeof input?.summary === "string" ? input.summary.trim() : ""
    const recordArg = typeof input?.recordPath === "string" ? input.recordPath.trim() : ""
    if (!summary && !recordArg) {
      return reply(
        "Rejected: give `summary` (markdown covering the whole session) or `recordPath` (a file your session-end procedure already wrote). Nothing was saved or archived.",
        false,
      )
    }
    if (summary && summary.length < MIN_SUMMARY_CHARS) {
      return reply(
        `Rejected: summary must be at least ${MIN_SUMMARY_CHARS} characters. Write the full summary covering the whole session ` +
          "(objective; what was done in order; decisions and why; files changed; commands/checks and results; unfinished or unverified; next steps) " +
          "or point recordPath at the record your procedure wrote, and call again. Nothing was saved or archived.",
        false,
      )
    }
    const sessionID = input?.sessionId || context.sessionID
    if (!/^[A-Za-z0-9_-]+$/.test(String(sessionID))) return reply(`Invalid session id "${sessionID}". Nothing was saved or archived.`, false)
    const found = await getSession(ctx, sessionID)
    if (found.error) return reply(found.error, false, { sessionID })
    const directory = found.info?.location?.directory ?? ctx.location?.directory
    if (!directory) return reply(`Cannot tell the working directory of session ${sessionID}. Nothing was saved or archived.`, false, { sessionID })

    let pointer
    if (recordArg) {
      const record = path.resolve(directory, recordArg)
      let problem
      try {
        if (!(await stat(record)).isFile()) problem = "is not a regular file"
        else if ((await readFile(record, "utf8")).trim().length < MIN_SUMMARY_CHARS) problem = `has fewer than ${MIN_SUMMARY_CHARS} characters`
      } catch (error) {
        problem = error?.code === "ENOENT" ? "does not exist" : `cannot be read (${describeError(error)})`
      }
      if (problem) return reply(`Rejected: recordPath ${record} ${problem}. Nothing was saved or archived.`, false, { sessionID })
      const relative = path.relative(directory, record)
      pointer = `Record: ${relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : record}`
    }

    let file
    try {
      file = await writeSummary(directory, sessionID, found.info?.title, [summary, pointer].filter(Boolean).join("\n\n"))
    } catch (error) {
      return reply(`Could not save the summary (${describeError(error)}). The session was not archived.`, false, { sessionID })
    }

    if (!toBool(input?.archive, true)) {
      return reply(`Saved to ${file}. Session ${sessionID} not archived (archive=false); state: ${stateWord(isArchived(found.info))}.`, true, { sessionID, file })
    }
    try {
      const now = await applyArchived(ctx, sessionID, true)
      return reply(`Saved to ${file}. Session ${sessionID} is now ${stateWord(now)}.`, now, { sessionID, file, archived: now })
    } catch (error) {
      return reply(`Saved to ${file}, but archiving failed: ${describeError(error)}`, false, { sessionID, file })
    }
  },
})

export default {
  id: "opencode-session-archive",
  setup: async (ctx) => {
    await ctx.tool.transform((tools) => {
      tools.add(archiveTool(ctx))
      tools.add(wrapUpTool(ctx))
    })
    if (ctx.command?.transform) {
      await ctx.command.transform((commands) => {
        commands.add({
          name: "wrap-up",
          description: "write a summary of the whole session to the project folder, then archive it",
          execute: async (command) => {
            const extra = command.prompt?.text?.trim()
            const found = await getSession(ctx, command.sessionID)
            const override = await readOverride(found.info?.location?.directory ?? ctx.location?.directory)
            const procedure = override ? `${override}\n\n${OVERRIDE_CLOSING}` : WRAP_UP_PROMPT
            return ctx.session.prompt({
              ...command.prompt,
              sessionID: command.sessionID,
              text: extra ? `${procedure}\n\nExtra instructions: ${extra}` : procedure,
              delivery: command.delivery,
            })
          },
        })
      })
    }
  },
}
