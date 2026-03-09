# Common Patterns

## Setup

```bash
export METABASE_URL="http://localhost:3000"
export METABASE_API_KEY="mb_abc123..."
```

Or pass as flags: `--url`, `--api-key`, `--session-token`.

## Global Flags

| Flag | Effect |
|------|--------|
| `--fields id,name` | Only include these keys in response JSON |
| `--max-rows 200` | Override default 50-row cap on query results |
| `--dry-run` | Show API calls without executing |
| `--url <url>` | Metabase URL (overrides METABASE_URL) |
| `--api-key <key>` | API key (overrides METABASE_API_KEY) |
| `--session-token <token>` | Session token (overrides METABASE_SESSION_TOKEN) |

## JSON Payload Format

All mutation commands use `--json '<payload>'`.

Shell escaping for single quotes in SQL:
```bash
./metabase-agent create-question --json '{"sql": "SELECT * FROM t WHERE name = '"'"'test'"'"'"}'
```

## Error Handling

All errors are structured JSON on stderr:
```json
{
  "error": "error_code",
  "message": "Human-readable description",
  "hint": "Suggested fix (when available)"
}
```

Common error codes: `missing_config`, `api_error`, `unknown_field`, `invalid_parameter`, `missing_parameter`, `unknown_filter`, `field_resolution`.

## Introspection

```bash
# List all commands with JSON schemas
./metabase-agent schema

# Get exact JSON Schema for any command
./metabase-agent schema create-dashboard

# Preview API calls without executing
./metabase-agent create-dashboard --dry-run --json '...'
```
