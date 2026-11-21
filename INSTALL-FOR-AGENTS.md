# Installing a plugin from this repository (instructions for AI agents)

You have been asked to install a plugin from this repository into OpenChamber or plain OpenCode 2.x. The example below uses `session-archive`; substitute the plugin's folder name. Follow the steps in order. Tell the user what you are doing at each step that changes files.

## 1. Obtain the plugin folder

1. Get the folder `plugins/session-archive/` at a tagged version. Tags look like `session-archive-v0.2.0`. Use the newest tag unless the user names one.
2. Any way of obtaining the folder works (a release archive, a clone, a download of that folder). A git client is not required.
3. Confirm the folder contains `index.js` and `package.json`, and read `version` in `package.json`. It must match the tag.

## 2. Choose the destination

1. Global (all projects): `~/.config/opencode/plugins/session-archive/`. If `XDG_CONFIG_HOME` is set, use `$XDG_CONFIG_HOME/opencode/plugins/session-archive/`.
2. One project: `<project>/.opencode/plugins/session-archive/`. A host may ask the user to trust a project-level plugin.
3. If the user did not say which, ask.
4. If a folder of that name already exists at the destination, do not overwrite it silently. Read its `package.json` version, compare with the one you are installing, tell the user both versions, and proceed only with their agreement.

## 3. Install

1. Copy the whole folder to the destination. The destination folder must keep the name `session-archive` and contain `index.js` and `package.json` directly.
2. Do not edit the plugin files. Do not install packages; the plugin has no dependencies and no build step.

## 4. Restart the host

1. The host loads plugins at start-up, so it must be restarted.
2. If you are running inside OpenChamber, do NOT kill or restart your own host. Ask the user to restart OpenChamber, and wait.
3. If you are in a separate terminal or session, still ask before restarting anything the user may be using.

## 5. Verify

1. Primary check: after the restart, look in OpenCode's log (typically `~/.local/share/opencode/log/opencode.log`) for a line like `msg="loading plugin" id=.../plugins/session-archive`. Also look for errors mentioning the plugin.
2. Optional check: the host's plugin list (`GET /api/plugin` on the server) should show `opencode-session-archive` with state `active`, and `GET /api/command` should list `wrap-up`. Finding the right local port can be awkward (in OpenChamber, `openchamber status` prints it); if you cannot find it, rely on the log line.
3. Functional check, only in a throwaway session the user has created for this: call `session_archive` with `archived=false`. On an active session this is a no-op and should answer that the session is "not archived (active)".

## 6. Report to the user

Tell the user: the version installed and where; whether the log line appeared; whether the optional list check was done; whether the functional check was done; and what was not verified (below). If anything failed, include the exact log text.

## Update and uninstall

- Update: repeat steps 1 to 5 with the newer tag; compare versions as in step 2.4 and ask before replacing.
- Uninstall: delete the plugin folder from the plugins directory, then ask the user to restart the host.

## Optional: `wrap-up.md` override

The plugin's `/wrap-up` command normally tells the agent to write a summary of the session and call `session_wrap_up`, which saves it under `.opencode/session-summaries/` and archives the session. If an environment already has its own session-end procedure (for example a skill that closes a ledger or writes a handoff), put that procedure in a `wrap-up.md` file so `/wrap-up` runs it instead of the default steps:

- Project: `<project>/.opencode/wrap-up.md`. Global: `<config dir>/opencode/wrap-up.md` (`$XDG_CONFIG_HOME/opencode` or `~/.config/opencode`). Project wins. An empty file is ignored. At most 20,000 characters are read.
- The plugin appends one line telling the agent to finish by calling `session_wrap_up` with `summary`, or with `recordPath` if the procedure already wrote a record.
- Only create this file if the user wants it. Example:

```markdown
Close this session with the environment's own end-of-session procedure:
1. Run the project's session-end or ledger-closing skill and let it write its record.
2. Do not write a second, different summary.
3. Note the path of the file it wrote.
```

## Do not

- Do not edit the host application's own files, its settings, or its database.
- Do not archive real sessions as a test. Use a throwaway session.
- Do not add credentials, client data, project data or machine-specific paths to this repository or to issues about it.
- Do not remove or rename other plugins in the plugins directory.

## What has been verified

Verified on OpenChamber 2.7.3 (OpenCode 2.3.2): copying the folder to `~/.config/opencode/plugins/session-archive/` and restarting loads the plugin (log line; plugin list shows it active) and registers `/wrap-up`; archiving through OpenCode's session update hides a session from the default session list.

Untested: an agent actually calling `session_archive` or `session_wrap_up`; the `wrap-up.md` override in a live host (mock-tested only); loading the plugin by git spec from the sub-folder; other OpenCode or OpenChamber versions.
