Linter that validates the Liquibase migrations file against a spec. This lets us check and enforce additional
constraints for the `000_migrations.yaml` file (e.g. make sure you're not using duplicate migration IDs, or including
more than one change in a single `changeSet`).

Older/existing migrations are validated with a less-strict spec; newer ones use a stricter spec that enforces some
additional constraints. Migrations 172 and newer use the stricter spec. The less-strict specs are in `x.unstrict`
namespaces while equivalent stricter ones are in `x.strict` namespaces.

Run the linter with

```sh
./bin/lint-migrations-yaml.sh
```

Add some tests for the checks you add here the `test/` directory; run them with

```sh
cd bin/lint-migrations-yaml
clojure -M:test
```
