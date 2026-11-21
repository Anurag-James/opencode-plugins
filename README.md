# opencode-plugins

Small plugins for OpenCode 2.x, written against the version bundled in OpenChamber 2.7.3 (OpenCode 2.3.2).

| Plugin | What it does | Status |
|---|---|---|
| [session-archive](plugins/session-archive/) | Lets an agent archive or restore a session, and wrap a session up by saving a written summary of the work before archiving. | 0.1.0, not yet run inside OpenCode |

## Install

Each plugin is a self-contained folder with no dependencies and no build step.

1. Download or clone this repository.
2. Copy the plugin's folder into an OpenCode plugins directory, for example `~/.config/opencode/plugins/session-archive/` (all projects) or `<project>/.opencode/plugins/session-archive/` (one project).
3. Restart OpenCode or OpenChamber.

Alternatively, list the folder's absolute path under `plugins` in `~/.config/opencode/opencode.json`.

Loading a plugin directly from this repository by a git spec has not been tested, because each plugin lives in a sub-folder. Until it has, copy the folder.

## Update

Pull the repository and copy the plugin folder again. Each plugin has its own version in its `package.json` and a `CHANGELOG.md`; releases are tagged `<plugin>-v<version>`.

## Contents policy

This repository contains plugin code and its documentation only. It holds no client data, credentials or machine-specific configuration.

## Licence

MIT. See [LICENSE](LICENSE).
