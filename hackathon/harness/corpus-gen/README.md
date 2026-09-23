# corpus-gen

Zero-dependency TypeScript (Node ≥ 22.18, run files directly with `node x.ts`). It produces the
corpora and the labelled scenario set. It never touches an instance on its own: `apply.ts` is the
one step that talks to Metabase, and the owner of the instance (the runner) runs it.

## Pipeline

```bash
cd hackathon/harness/corpus-gen

# 1. Artifacts (deterministic; commit-safe)
node generate.ts golden                                   # -> ../artifacts/golden/{corpus.json,warehouse.sql}
node generate.ts scale --data-scale 10000 --seed 42       # -> ../artifacts/scale-10000/...

# 2. Warehouse: empty tables Metabase can sync (any Postgres the Metabase server can reach)
docker exec semantic_search-postgres-1 createdb -U postgres northwind_warehouse
docker exec -i semantic_search-postgres-1 psql -q -U postgres -d northwind_warehouse < ../artifacts/golden/warehouse.sql

# 3. Create entities through the REST API -> manifest.json (key -> {model, id}, harness user creds)
node apply.ts --corpus ../artifacts/golden/corpus.json \
  --url http://localhost:3002 --user dev@metabase.local --password devdev1234 \
  --pg-host localhost --pg-port 55432 --pg-db northwind_warehouse --pg-user postgres --pg-password postgres

# 4. Scenarios with live ids (§3 shape)
node resolve.ts --scenarios ../scenarios/src/golden.json --manifest ../artifacts/golden/manifest.json
#   -> ../scenarios/northwind-golden-v1.json

# Any time, offline:
node validate.ts --corpus ../scenarios/corpus/northwind.json --scenarios ../scenarios/src/golden.json
```

## Files

| Path | What |
|---|---|
| `../scenarios/corpus/northwind.json` | Golden corpus source, hand-written. Northwind Outdoor: 234 entities, ~20% Polish/Japanese. |
| `../scenarios/src/golden.json` | 56 hand-labelled scenarios; items are `{ref, grade}`. |
| `../artifacts/<corpus>/corpus.json` | What `apply.ts` creates. |
| `../artifacts/<corpus>/warehouse.sql` | Postgres DDL for the tables the corpus queries. |
| `../artifacts/<corpus>/manifest.json` | Written by `apply.ts`: key → `{model, id}`, harness user (incl. password), `timingsMs` per phase plus `total`. Instance-specific. Type: `Manifest` in `lib.ts`. |

## Things to know

- **Only name + description are embedded** (`search/ingestion.clj` `embeddable-text`). Collections
  embed only their name. Documents embed only their name — the body is keyword-searchable but excluded
  from embeddings. Several `rare-token` labels depend on this asymmetry.
- **Harness user.** `apply.ts` creates a non-admin user in its own group, with read access on every corpus
  collection except `restricted` ones (the golden set's *Executive Compensation*). Scenario `empty-04`
  fails if any of that collection's items come back, which would mean a permission leak.
- **Load golden into a clean instance.** Anything else in the app DB (Sample Database, earlier test
  content) shows up in results as unlabelled hits and lowers precision.
- **Scale corpora are unlabelled.** Use them for latency and agreement only. Names are built from a
  vocabulary rather than `Perf Card 00042`, so embeddings are not near-identical, which would make ANN
  latency unrealistically good.
- **Scale tables are real tables.** Tier 10k means 10k empty Postgres tables to sync. Use `--sync-timeout-s`.
- **Indexing is async.** `apply.ts` returns before engines finish indexing; wait for doc counts.

## Throwaway instances (manual use)

`local/run-golden.sh` / `local/reset-golden.sh` (gitignored `local/`). `INSTANCE=<name>` (default `golden`)
and `GOLDEN_PORT=<port>` (default 3003). App DB `local/$INSTANCE/$INSTANCE.db`, pgvector DB `mb_ss_$INSTANCE`.
The launcher records its port in `local/$INSTANCE/port`; reset kills only that port, so resetting one
instance never touches another. The runner's `pipeline.ts` has its own boot path for automated runs.

`npm run typecheck` at `hackathon/harness/` covers corpus-gen (tsconfig extends `../tsconfig.base.json`).
Scenario types come from `../shared/types.ts`; items in resolved files additionally carry `ref`.
