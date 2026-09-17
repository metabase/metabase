# Source swaps

Graphy's `lib.source-swap` module exposes query, parameter-target, and compatibility operations through `core`.

Source replacement has two distinct phases, coordinated by the enterprise replacement runner:

1. Upgrade field references across all transitive dependents while the original sources are still available. Resolve references to canonical names or aliases where possible; some table and implicit-join references remain ID-based.
2. Reload the dependents, replace their sources, and resolve references against the replacement metadata. A name/alias index supplies the old-field-ID to new-column mapping needed for remaining ID-based references.

The runner finishes the first phase before starting the second. Sharing the traversal implementation does not combine these phases or interleave upgrades with swaps.

- `compatibility` reports column mismatches using the shared column names/aliases in `util`.
- `mbql` resolves field references, then swaps sources and remaps fields. Upgrade and swap use the same clause traversal and resolution fallback. Only fields, breakouts, orderings, and join fields are deduplicated.
- `native` resolves metadata once and selects one of four table/card conversions.
- `tags` owns tag conversion, card slugs, and dimension matching. Converted tags are installed before SQL re-extraction to avoid retaining attributes from the old tag type.
- `sql` owns token rendering and AST table replacement. Parameters become temporary identifiers and optional clauses become comment markers during AST replacement; both are restored afterward.

Compatibility checks remain separate from transformation: callers decide whether to accept reported mismatches. Query upgrades preserve unresolved refs and expression names. Parameter upgrades use the target's stage. Native card swaps do not require the old card's metadata.

Queries are immutable maps with ordered vectors of stages and clauses. Field mappings are associative maps. The clause walker traverses children before their parent and returns the original reference when its semantic key is unchanged, avoiding UUID churn. SQL rendering uses ordered token sequences, tagged maps for parameters and optionals, and a local placeholder lookup map.

The surrounding replacement job persists changes incrementally. It does not provide whole-job rollback: failures or cancellation can leave earlier changes applied. The transformation helpers do not enforce authorization; that belongs to the calling API.

## Validation

Run `./bin/test-agent :module lib.source-swap` for module tests. Downstream coverage lives in `metabase-enterprise.replacement.source-swap-test`, `runner-test`, and `api-test`. Run `./bin/mage project-tests modules` for repository boundary checks.

Tests cover join, expression, temporal, deduplication, parameter, SQL-comment, optional-clause, and schema-qualification behavior. Public table-tag conversion also checks required/default preservation and removal of table-only attributes.
