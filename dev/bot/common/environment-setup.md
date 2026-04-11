## Environment Setup

### Detect session mode

Run `./bin/mage -autobot-status` to determine if you are running inside an autobot session.

- If the output shows `autobot: false` — you are NOT in an autobot session. **Skip the dev environment setup** and continue to the next phase. The user is responsible for providing a working environment (running backend, database, etc.).
- If the output shows `autobot: true` — you ARE in an autobot session. Continue setting up the environment

### Set up the dev environment (autobot sessions only)

Run:
```
./bin/mage -nvoxland-dev-env --app-db <APP_DB> --bot {{BOT_NAME}}
```

Where `<APP_DB>` is the database type determined by the agent from the issue/task context:
- `postgres` — the default, use unless the issue specifically requires another database
- `mysql` — if the issue mentions MySQL problems, MySQL-specific SQL syntax, or MySQL error messages
- `mariadb` — if the issue mentions MariaDB specifically

**If you cannot determine which database to use** (e.g., the issue context was not provided or is ambiguous about database requirements), **STOP and tell the user** — do not guess. Ask them which app-db to use.

This command:
- Configures the database as needed
- Starts the frontend and backend servers
- Creates bot output directories

After running, continue with the rest of the environment discovery (waiting for backend health, etc.).
