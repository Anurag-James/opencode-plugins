// OpenCode (2.x) server plugin: session_archive and session_wrap_up tools,
// plus a /wrap-up command. No dependencies; everything comes from `ctx`.
import { appendFile, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const MIN_SUMMARY_CHARS = 200
const SUMMARY_DIR = path.join(".opencode", "session-summaries")

const WRAP_UP_DESCRIPTION = [
  "Wrap up a session: save a written summary of all the work done, then archive the session.",
  "You write the summary yourself and pass it in `summary` (markdown). The tool saves it to",
  ".opencode/session-summaries/ in the session's working directory and archives only if the save worked.",
  "The summary must cover the WHOLE session, not only the latest turn. If your context was compacted,",
  "re-read the session's earlier messages first, using whatever message-reading means you have",
  "(in OpenChamber: the openchamber tool's session.messages action with all set to true).",
  "Contents, in this order: (1) objective of the session; (2) what was done, in order; (3) decisions made and why;",
  "(4) files created or changed, with paths; (5) commands or checks run and their results;",
  "(6) what is unfinished or unverified; (7) suggested next steps.",
  `A summary shorter than ${MIN_SUMMARY_CHARS} characters is rejected and nothing is archived.`,
  "Set archive to false to save the summary without archiving. sessionId defaults to the current session.",
].join(" ")

const WRAP_UP_PROMPT = [
  "Wrap up this session.",
  "1. Review the WHOLE session, not just the latest turn. If your context was compacted, re-read earlier messages first.",
  "2. Write a markdown summary with these sections, in order: Objective; What was done (in order); Decisions and why;",
  "Files created or changed (paths); Commands or checks run and results; Unfinished or unverified; Suggested next steps.",
  "3. Call the session_wrap_up tool with that summary. It saves the summary to the project folder and archives the session.",
  "4. Tell me the saved file path and the archive state.",
].join("\n")

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

const writeSummary = async (directory, sessionID, title, summary) => {
  const now = new Date()
  const stamp = now.toISOString()
  const folder = path.join(directory, SUMMARY_DIR)
  const file = path.join(folder, `${stamp.slice(0, 10)}-${sessionID}.md`)
  await mkdir(folder, { recursive: true })
  const section = `## Wrap-up ${stamp}\n\n${summary.trim()}\n`
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
      summary: { type: "string", description: "Markdown summary of the whole session, in the order given in the tool description." },
      archive: { type: "boolean", description: "Archive the session after saving the summary. Default true." },
      sessionId: { type: "string", description: "Session id. Defaults to the current session." },
    },
    required: ["summary"],
    additionalProperties: false,
  },
  async execute(input, context) {
    const summary = typeof input?.summary === "string" ? input.summary : ""
    if (summary.trim().length < MIN_SUMMARY_CHARS) {
      return reply(
        `Rejected: summary must be at least ${MIN_SUMMARY_CHARS} characters. Write the full summary covering the whole session ` +
          "(objective; what was done in order; decisions and why; files changed; commands/checks and results; unfinished or unverified; next steps) " +
          "and call again. Nothing was saved or archived.",
        false,
      )
    }
    const sessionID = input?.sessionId || context.sessionID
    if (!/^[A-Za-z0-9_-]+$/.test(String(sessionID))) return reply(`Invalid session id "${sessionID}". Nothing was saved or archived.`, false)
    const found = await getSession(ctx, sessionID)
    if (found.error) return reply(found.error, false, { sessionID })
    const directory = found.info?.location?.directory ?? ctx.location?.directory
    if (!directory) return reply(`Cannot tell the working directory of session ${sessionID}. Nothing was saved or archived.`, false, { sessionID })

    let file
    try {
      file = await writeSummary(directory, sessionID, found.info?.title, summary)
    } catch (error) {
      return reply(`Could not save the summary (${describeError(error)}). The session was not archived.`, false, { sessionID })
    }

    if (!toBool(input?.archive, true)) {
      return reply(`Summary saved to ${file}. Session ${sessionID} not archived (archive=false); state: ${stateWord(isArchived(found.info))}.`, true, { sessionID, file })
    }
    try {
      const now = await applyArchived(ctx, sessionID, true)
      return reply(`Summary saved to ${file}. Session ${sessionID} is now ${stateWord(now)}.`, now, { sessionID, file, archived: now })
    } catch (error) {
      return reply(`Summary saved to ${file}, but archiving failed: ${describeError(error)}`, false, { sessionID, file })
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
          execute: (command) => {
            const extra = command.prompt?.text?.trim()
            return ctx.session.prompt({
              ...command.prompt,
              sessionID: command.sessionID,
              text: extra ? `${WRAP_UP_PROMPT}\n\nExtra instructions: ${extra}` : WRAP_UP_PROMPT,
              delivery: command.delivery,
            })
          },
        })
      })
    }
  },
}
