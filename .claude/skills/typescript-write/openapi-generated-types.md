# Auto-Generated OpenAPI Types (Frontend API Layer)

Rules for working with generated backend API types. Applies when adding or changing RTK Query endpoints, editing request/response types in `metabase-types/api`, or migrating an endpoint's handwritten types to generated types.

## Pipeline facts

- **`frontend/src/metabase-types/openapi` is generated, gitignored, and never edited by hand.** It is produced from backend Malli schemas. If it's missing, run `bun run types:ensure`; after changing backend schemas, run `bun run types:ensure --force-local` (requires Clojure/JVM) to regenerate from source.
- **Type names derive from the HTTP route or the named Malli schema**: `GetApiEeErdData` (request — with `query` / `body` / `path` slots), `GetApiEeErdResponse` (2xx response body), `MetabaseEnterpriseErdImplErdNode` (named schema). These names are not meant for humans — consumers keep human-readable names via the alias layer below.
- **`import type` only** — eslint-enforced. The module is declaration-only; a value import resolves to nothing at runtime.
- **The backend Malli schema is the contract, not the handwritten frontend type.** Responses are runtime-validated against response schemas outside prod, so backend endpoint tests are ground truth for what a schema should say.

## Migrating an endpoint to generated types

1. **Find where the endpoint's request/response types are declared today** (usually `metabase-types/api/*.ts`, sometimes next to the RTK endpoint). That file is the integration point — no new layer, folder, or architecture.
2. **Replace the handwritten declarations with aliases over generated types, keeping the same exported names.** Consumers continue to import `ErdParams` / `ErdResponse`; only the declaration site changes. A pure rename needs no more than:
   ```ts
   import type { GetApiEeErdData, GetApiEeErdResponse } from "metabase-types/openapi";

   export type ErdParams = GetApiEeErdData["query"];
   export type ErdResponse = GetApiEeErdResponse;
   ```
3. **Re-apply frontend realities as documented overrides** in that same alias. Legitimate override reasons, each of which needs a comment:
   - semantic ID aliases (`FieldId`, `ConcreteTableId`, `DatabaseId`, `SchemaName`, …) over wire `number` / `string`
   - opaque branded types (e.g. `DatasetQuery`)
   - store-side hydration slots (e.g. an entity's `table` filled by the Redux store) — a frontend convention, never to be added to the backend schema
4. **Guard every override with a compile-time drift check** so a backend schema change fails the build instead of being silently masked:
   ```ts
   export type ErdNode = Omit<MetabaseEnterpriseErdImplErdNode, "table_id"> & {
     table_id: ConcreteTableId;
   };

   type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
   // `Expect<false>` violates the constraint → drift becomes a compile error on this line.
   type Expect<_T extends true> = never;
   type _MatchesErdNode = Expect<MutuallyAssignable<ErdNode, MetabaseEnterpriseErdImplErdNode>>;
   ```
   Pure re-exports without an override need no guard — they can't drift.
5. **Do not bind generated types directly into an RTK endpoint** (`builder.query<GetXResponse, GetXData["query"]>`) while named handwritten types and their consumers exist — migrate through the alias so every consumer moves atomically. Direct binding is acceptable only for a brand-new endpoint with no existing types.
6. **Migration is atomic per endpoint**: alias layer, all consumer fixes, and a green type-check land together.

## When type-check fails after integration

Investigate in this order — the failure is a finding about the contract, not an obstacle:

1. **Suspect the backend Malli schema first.** Read the endpoint's `defendpoint`, its implementation, and any hydration it applies. Frequent schema defects:
   - **optional vs nullable confusion**: a map-literal response builder emits every key always — such keys are required-and-nullable, not `:optional`
   - schema requires a key the handler never emits (this 400s every real response under validation, not just tsc)
   - missing or loose response schemas (`:any`, no response schema at all) — backfill the schema rather than keeping handwritten types
   - temporal fields typed loosely — use `ms/TemporalInstant` for `created_at`-style fields
   - enums missing legacy values that still occur in the wild

   **Before editing any Malli schema, read [add-malli-schemas](../add-malli-schemas/SKILL.md)** — it defines the repo's schema reference files and the checklist for route params, request bodies, and response schemas. With that skill loaded, fix incorrect schemas — or add the schema when the endpoint is missing one entirely (no request-param or response schema, or a generated type that comes out empty/loose because of it). Then rerun the endpoint's backend tests (runtime response validation makes them the ground truth), regenerate types (`bun run types:ensure --force-local`), and re-check.
2. **Then reconcile frontend drift.** For each remaining error decide explicitly which case it is:
   - **handwritten type was wrong** (claims fields the API never returns, wrong casing — e.g. wire kebab-case vs handwritten snake_case — wrong nullability) → adopt the generated shape and fix consumers
   - **generated type is right; consumers relied on the old looseness** → narrow or guard at the call sites (e.g. filter out virtual IDs before calling)
   - **frontend genuinely needs a different shape** → documented override + drift guard in the alias layer
3. **Never park type errors.** The migration isn't done while `bun run type-check-pure` is red; don't commit "temporarily accepted" errors or widen an alias just to silence tsc.

## Pitfalls

- **Trust order: backend implementation > backend Malli schema > generated type > handwritten type.** Resolve drift against the top of that chain — never by reshaping the alias to match the old handwritten type unverified.
- `type-check-pure` regenerates stale types automatically, but the editor's TS server may lag — restart it after regeneration before trusting hover/inline errors.
- Overrides are debt: prefer fixing the backend schema over adding an override, and expect the override set to shrink over time.
