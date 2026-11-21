# opencode-session-archive

An OpenCode plugin (for the OpenCode 2.x generation bundled in OpenChamber 2.7.3) that gives the agent:

- `session_archive` - archive a session, or restore it with `archived: false`. Arguments: `sessionId` (optional, default current session), `archived` (optional, default `true`). Returns the session id and resulting state. An unknown id is refused and nothing changes.
- `session_wrap_up` - the agent writes a summary of the whole session and passes it in `summary`; the tool saves it to `<session working dir>/.opencode/session-summaries/<YYYY-MM-DD>-<session-id>.md` (appends a dated section if the file exists), then archives. Arguments: `summary` (required markdown), `archive` (default `true`), `sessionId` (optional). Summaries under 200 characters are rejected and nothing is archived; if the file write fails, nothing is archived. The tool description tells the agent what the summary must contain: objective; what was done in order; decisions and why; files changed; commands/checks and results; unfinished or unverified; next steps; and to cover the whole session, re-reading earlier messages first if its context was compacted.
- `/wrap-up` slash command - prompts the agent to carry out that procedure and call `session_wrap_up`.

The plugin makes no model calls. Summaries stay on the local disk in the project folder; the plugin sends them nowhere. Its only host calls are get/update on the session being archived.

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

Verified by reading OpenChamber 2.7.3's bundled OpenCode 2.3.2 and OpenChamber server code:
- Plugin module shape (`export default { id, setup(ctx) }`), directory/file discovery, `plugins` config key.
- `ctx.tool.transform` + `tools.add({ name, description, input (JSON schema), options, execute })`; tool `execute(input, context)` has `context.sessionID`; result is `{ content, metadata }` with no `output`.
- `ctx.session.get({ sessionID })` (returns info including `location.directory`, `title`, `time.archived`) and `ctx.session.update({ sessionID, archived })` (PATCH `/api/session/:id`, "repeating the current state is a no-op").
- `ctx.command.transform` / `commands.add({ name, description, execute })` and the `ctx.session.prompt({...command.prompt, sessionID, text, delivery})` pattern, copied from built-in `/init`.

Verified by running: `node --check`, and a mock-host script exercising both tools, the rejection paths, the append path and the command (mock `ctx`, temp directory). It does not touch real OpenCode.

Not verified (never run inside OpenCode/OpenChamber): that the plugin loads; that `codemode: false` tools are exposed in your configuration; the exact shape of an unknown-id error (handled generically); that OpenChamber's sidebar reflects the change (it reads the same OpenCode `time.archived`, so it should, but its own archive store was not traced); that the `/wrap-up` command appears in the OpenChamber UI.
- The plugin context offers only `ctx.session.context`, which returns messages after the last compaction, so a tool cannot reread pre-compaction history; the agent is told to re-read what it can.

OpenChamber note (from reading its server code, not run): its archive store only holds legacy local entries; for a session with no legacy entry it reads `time.archived` from OpenCode, so an OpenCode-only archive should show as archived. A leftover legacy entry for the same session would take precedence. OpenChamber's own "announce" push is skipped, so the sidebar may need a refresh to show the change.
