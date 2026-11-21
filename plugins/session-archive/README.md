# opencode-session-archive

An OpenCode plugin (for the OpenCode 2.x generation bundled in OpenChamber 2.7.3) that gives the agent:

- `session_archive` - archive a session, or restore it with `archived: false`. Arguments: `sessionId` (optional, default current session), `archived` (optional, default `true`). Returns the session id and resulting state. An unknown id is refused and nothing changes.
- `session_wrap_up` - the agent passes a summary of the whole session in `summary` and/or points `recordPath` at a record that an existing session-end procedure already wrote (see below); the tool saves it to `<session working dir>/.opencode/session-summaries/<YYYY-MM-DD>-<session-id>.md` (appends a dated section if the file exists), then archives. Arguments: `summary` (markdown), `recordPath` (optional), `archive` (default `true`), `sessionId` (optional). One of `summary` or `recordPath` is required. Summaries under 200 characters are rejected and nothing is archived; if the file write fails, nothing is archived. The tool description says an existing session-end procedure takes precedence; when none exists the default contents are: objective; what was done in order; decisions and why; files changed; commands/checks and results; unfinished or unverified; next steps; and to cover the whole session, re-reading earlier messages first if its context was compacted.
- `/wrap-up` slash command - prompts the agent to carry out the wrap-up and call `session_wrap_up`.

The plugin makes no model calls. Summaries stay on the local disk in the project folder; the plugin sends them nowhere. Its only host calls are get/update on the session being archived.

## Working with an existing session-end procedure

If your environment already has a wrap-up, handoff or ledger-closing procedure, the plugin should not produce a second, competing summary.

- **Default prompt.** `/wrap-up` first tells the agent to check for such a procedure, carry it out and use its result; only if none exists does it use the default sections.
- **Override file.** If `<session directory>/.opencode/wrap-up.md` exists, `/wrap-up` sends its text as the procedure instead of the default steps, followed by one fixed line telling the agent to finish with `session_wrap_up`. If there is no project file, the global `wrap-up.md` is used: `$XDG_CONFIG_HOME/opencode/wrap-up.md`, else `~/.config/opencode/wrap-up.md`. Project wins over global. An empty or whitespace-only file counts as absent. At most 20,000 characters are read. The file's text is given to the agent as instructions, so treat a project's `wrap-up.md` with the same care as its other instruction files, and check it before running `/wrap-up` in a repository you do not trust.
- **`recordPath`.** If the procedure already wrote a record, pass its path (relative paths resolve against the session directory). The file must exist, be a regular file and have at least 200 characters. It is not copied: the plugin writes its usual `.opencode/session-summaries/<date>-<id>.md` with a pointer line to the record, so one folder lists how every session ended. If you pass both `summary` and `recordPath`, the summary is saved and the pointer is added.

Summaries and records stay on the local disk in the project folder; the plugin sends nothing anywhere. For agent-oriented install steps see [INSTALL-FOR-AGENTS.md](../../INSTALL-FOR-AGENTS.md).

## Install

OpenCode loads plugins from a config directory's `plugin/` or `plugins/` folder (a `.js`/`.ts` file or a directory), or from the `plugins` array in `opencode.json`, whose absolute paths must be directories. Either of:

1. Copy this folder to `~/.config/opencode/plugins/session-archive/` (global), or `<project>/.opencode/plugins/session-archive/`.
2. Or add `{ "plugins": ["/absolute/path/to/session-archive"] }` to `~/.config/opencode/opencode.json`.

Restart OpenChamber (or its OpenCode server). OpenChamber may ask you to trust a project-level plugin.

## Try it

1. Open a throwaway session and ask: "Use session_archive with archived=false" (a safe no-op on an active session). Expect "Session ses_... is now not archived (active)."
2. Run `/wrap-up` in a throwaway session; check the summary file appears and the session leaves the sidebar's active list.
3. Restore with: "Use session_archive with sessionId=<id> and archived=false."

If your OpenChamber does not offer `/wrap-up`, use this prompt text instead: "Wrap up this session. Review the whole session, not just the latest turn (re-read earlier messages if your context was compacted). Write a markdown summary: objective; what was done in order; decisions and why; files created or changed; commands/checks run and results; unfinished or unverified; suggested next steps. Call session_wrap_up with it."

## Verified / not verified

Verified live on OpenChamber 2.7.3:
- Copying this folder to `~/.config/opencode/plugins/session-archive/` and restarting OpenChamber loads the plugin: OpenCode's log shows a `loading plugin` line for it, the plugin list (`GET /api/plugin`) shows `opencode-session-archive` with source `local` and state `active`, and `GET /api/command` lists `wrap-up`.
- Setting `archived: true` through OpenCode's session update hides the session from OpenChamber's default session list; it reappears with "include archived".

Verified by reading OpenChamber 2.7.3's bundled OpenCode 2.3.2 and OpenChamber server code:
- Plugin module shape (`export default { id, setup(ctx) }`), directory/file discovery, `plugins` config key.
- `ctx.tool.transform` + `tools.add({ name, description, input (JSON schema), options, execute })`; tool `execute(input, context)` has `context.sessionID`; result is `{ content, metadata }` with no `output`.
- `ctx.session.get({ sessionID })` (info including `location.directory`, `title`, `time.archived`) and `ctx.session.update({ sessionID, archived })`.
- `ctx.command.transform` / `commands.add(...)` and the `ctx.session.prompt(...)` pattern, copied from built-in `/init`.
- The documented global config directory is `$XDG_CONFIG_HOME/opencode`, else `~/.config/opencode`; the code in this plugin follows that. The bundled code also has an `OPENCODE_CONFIG_DIR` setting for an extra config directory, which this plugin does not read for `wrap-up.md`.

Verified by running a mock host (fake `ctx`, temporary directories, temporary `XDG_CONFIG_HOME`): both tools, rejection paths, append, `recordPath` happy and failing cases, project/global/empty override handling, and the command prompt. It does not touch a real OpenCode.

Not verified:
- An agent actually calling `session_archive` or `session_wrap_up` (no model provider was available for a live test).
- That `/wrap-up` with an override file works end to end in OpenChamber (only the mock host).
- That tools declared with `codemode: false` are exposed under every OpenCode configuration.
- The exact error shape for an unknown session id (handled generically).
- Loading the plugin directly by git spec from this sub-folder.
- A tool cannot re-read pre-compaction history: the host gives plugins only `ctx.session.context` (messages after the last compaction), so the agent is told to re-read what it can.

OpenChamber's own archive store only holds legacy local entries; for a session with no such entry it reads `time.archived` from OpenCode. A leftover legacy entry for the same session would take precedence.
