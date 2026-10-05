Linter that validates every Liquibase changelog file under `resources/migrations/` against a spec. This lets us check
and enforce additional constraints (e.g. make sure you're not using duplicate migration IDs, or including more than
one change in a single `changeSet`), plus the file-layout rules:

- `resources/migrations/<year>/<yyyymmdd>_<name>.yaml` -- the current layout: version-less ids (lower-case letters,
  digits and underscores, at least one letter, no `v<digit>` prefix, no ISO date/timestamp like the old
  `vNN.2024-03-18T16:00:00` ids). The version a changeset ships in is decided by the branch it is merged into.
- `resources/migrations/0NN/…` and `0NN_update_migrations.yaml` -- the older versioned layouts, whose ids carry the
  major (`vNN.…`). Versioned ids are refused from v66 on (`first-versionless-major`); v65 mixes both layouts.

Older/existing migrations are validated with a less-strict spec; newer ones use a stricter spec that enforces some
additional constraints. The less-strict specs are in `x.unstrict` namespaces while equivalent stricter ones are in
`x.strict` namespaces. See `.claude/skills/app-db-migrations/SKILL.md` for the rules as a checklist.

Run the linter with

```sh
./bin/lint-migrations-file.sh
```

Add some tests for the checks you add here the `test/` directory; run them with

```sh
cd bin/lint-migrations-file
clojure -M:test
```
