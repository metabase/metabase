---
name: serdes-workflow
description: Export content from a running Metabase instance, validate with checkers, edit YAML, and import back. Use when the user wants to export, import, or run the full serdes round-trip workflow.
---

# Serdes Workflow Skill

End-to-end workflow for exporting Metabase content as YAML, validating it, editing it, and importing it back.

## Prerequisites

All commands require the `:ee` alias since export, import, and checkers live in enterprise code.

You need `MB_DB_CONNECTION_URI` set to point at the target Metabase Postgres database when importing. The running dev instance's connection string is in the worktree environment (check the nREPL or startup output).

## Export

```bash
clojure -M:run:ee export /path/to/export-dir
```

Flags:
- `-c 123,456` - export only specific collection IDs
- `-f` - include field values
- `-e` - continue on error

This writes YAML files in the serdes directory layout:
```
databases/<db-name>/<db-name>.yaml
databases/<db-name>/schemas/<schema>/tables/<table>/<table>.yaml
databases/<db-name>/schemas/<schema>/tables/<table>/fields/<field>.yaml
collections/<eid>_<slug>/cards/<eid>_<slug>.yaml
```

## Validate

Always run both checkers after any modification. They skip full Metabase startup (~8s each).

### Structural checker (fast, schema-based)
```bash
clojure -M:run:ee --mode checker --checker structural --export /path/to/export-dir
```
Validates YAML shapes against Malli schemas. Catches typos, missing required fields, wrong types.

### Cards checker (query validation)
```bash
clojure -M:run:ee --mode checker --checker cards --export /path/to/export-dir
```
Validates that card queries resolve correctly against exported metadata (tables, fields, FKs). Uses MLv2 under the hood.

Additional cards checker flags:
- `--lenient` - fabricate metadata on demand (when no database schema files exist)
- `--manifest /path/to/manifest.yaml` - write manifest of all referenced entities (lenient mode only)
- `--output /path/to/results.edn` - write detailed results to file

## Edit YAML

See the **serdes-yaml-edit** skill for guidance on editing YAML files. The critical rule: **run both checkers after every edit before proceeding**.

## Import

```bash
MB_DB_CONNECTION_URI="postgres://user:pass@localhost:5432/metabase_dbname" \
  clojure -M:run:ee import /path/to/export-dir -e
```

The `-e` flag continues on error. The `MB_DB_CONNECTION_URI` must point at the same Postgres database the running Metabase instance uses - without it, import defaults to H2 which is wrong.

## Full Demo Sequence

1. Export: `clojure -M:run:ee export /tmp/metabase-export`
2. Validate baseline: run both checkers
3. Edit YAML files (see serdes-yaml-edit skill)
4. Re-validate: run both checkers again
5. Import: `MB_DB_CONNECTION_URI=... clojure -M:run:ee import /tmp/metabase-export -e`
6. Verify in browser
