# Changelog

## 0.2.0

- `/wrap-up` defers to an existing session-end procedure: the default prompt now starts by checking for one, and an optional `wrap-up.md` file (project `.opencode/wrap-up.md`, else global `<config dir>/opencode/wrap-up.md`) replaces the default steps. Empty file is ignored; at most 20,000 characters are read.
- `session_wrap_up` accepts `recordPath` (a file the existing procedure already wrote). `summary` is no longer schema-required; one of `summary` or `recordPath` must be usable. A record is not copied: the saved summary file holds a pointer to it.
- Updated tool description (existing procedure takes precedence; seven default contents otherwise).
- Confirmed live on OpenChamber 2.7.3: the plugin loads and registers `/wrap-up`; archiving through OpenCode hides the session from the default session list. An agent calling the tools is still untested.

## 0.1.0

- `session_archive` tool: archive or restore a session.
- `session_wrap_up` tool: save a written summary of the session to the project folder, then archive.
- `/wrap-up` command.
- Not yet run inside OpenCode or OpenChamber; see the README's "Verified / not verified" section.
