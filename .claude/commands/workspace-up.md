Bring up a child Metabase workspace end-to-end for $ARGUMENTS.

`$ARGUMENTS` should be: `<workspace-name> <database-name> <schema>[,<schema>...]`

- `<workspace-name>` — the workspace's name on the parent (created if it doesn't exist).
- `<database-name>` — the human name of a registered parent `metabase_database`.
- `<schema>` — one or more source schemas (comma-separated) to expose through the workspace.

If the user gave a freeform phrasing, parse it into those three fields. If any field is ambiguous, ask before proceeding.

## Pre-flight

Check that `PARENT_URL`, `MB_API_KEY`, and `MB_PREMIUM_EMBEDDING_TOKEN` are set in the environment. If not, stop and tell the user which is missing.

## Steps

Run the following against the parent. Use `curl -fsS -H "x-api-key: $MB_API_KEY"` for every call and pipe JSON through `jq`. Print one short status line per step.

1. **Resolve the database id.**
   ```bash
   curl -fsS -H "x-api-key: $MB_API_KEY" "$PARENT_URL/api/database/" \
     | jq -r --arg n "<database-name>" '.data[] | select(.name == $n) | .id'
   ```
   If that returns empty, list the available database names from the response and stop. If multiple match, stop and ask.

2. **Check whether the workspace already exists.**
   ```bash
   curl -fsS -H "x-api-key: $MB_API_KEY" "$PARENT_URL/api/ee/workspace/" \
     | jq --arg n "<workspace-name>" '[.[] | select(.name == $n)] | first'
   ```
   If a workspace with this name exists, reuse its id and skip step 3.

3. **Create the workspace.** POST to `$PARENT_URL/api/ee/workspace/` with JSON body:
   ```json
   {"name": "<workspace-name>",
    "databases": [{"database_id": <id>, "input_schemas": ["<schema>", ...]}]}
   ```
   Capture the `id` from the response.

4. **Provision if needed.** Fetch `GET /api/ee/workspace/<id>` and inspect `databases[].status`. If every entry is already `"provisioned"`, skip to step 6. Otherwise `POST /api/ee/workspace/<id>/provision`.

5. **Poll until provisioned.** Loop up to 150 times, sleeping 2s each iteration, breaking once every `databases[].status == "provisioned"`. Print a progress line every ~10 iterations. If the loop times out, stop and print the last status map.

6. **Bootstrap the child.** Pipe the bootstrap script to bash:
   ```bash
   curl -fsS -H "x-api-key: $MB_API_KEY" \
     "$PARENT_URL/api/ee/workspace/bootstrap/<workspace-name>" | bash
   ```
   The script needs `PARENT_URL`, `MB_API_KEY`, and `MB_PREMIUM_EMBEDDING_TOKEN` inherited from the current shell — they already are.

When the bootstrap script prints `Ready: http://localhost:<port>`, report that URL to the user as the child instance. On any failure, print the relevant tail of `$HOME/.metabase-workspaces/<slug>/metabase.log` and stop.

## Notes

- Name-based idempotency: re-running with the same workspace name reuses the existing workspace and will cleanly kill/replace the child process (the bootstrap script tracks it via a pidfile).
- Workspace names on the parent are not schema-unique; if two exist with the same name the bootstrap endpoint picks the lowest-id match. Use a distinct name when in doubt.
- Do not `POST /.../provision` on an already-provisioned workspace — the cluster-lock will return 409 and the skill should treat that as "already done" by re-fetching status, not as an error.
