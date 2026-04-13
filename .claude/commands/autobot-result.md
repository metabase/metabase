Print the most recent `result.md` for an autobot session, so the user can see how a bot is doing without attaching to its tmux session.

The user provided: `$ARGUMENTS`

Parse as: `<branch> <bot>`

- First word: branch name (e.g., `uxw-291-skip-ldap-for-non-ldap`)
- Second word: bot name (e.g., `qabot`, `fixbot`, `uxbot`, `reprobot`, `cibot`)

If either is missing, show usage and stop:
```
Usage: /autobot-result <branch> <bot>
Example: /autobot-result uxw-291-skip-ldap-for-non-ldap qabot
```

Run:
```
./bin/mage -autobot-result <BRANCH> <BOT>
```

The command will:
- Find the worktree for the branch (via `workmux list`)
- Find the most recent `result.md` file under `<worktree>/.bot/<bot>/*/result.md`
- Print its contents along with the absolute path

Show the user the full output of the command.