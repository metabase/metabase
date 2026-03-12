# Codebase Concerns

**Analysis Date:** 2026-03-11

## Tech Debt

**Legacy Entity Framework (Frontend):**
- Issue: The custom entity framework (`createEntity`) in `frontend/src/metabase/lib/entities.js` uses a `HACK_getObjectFromAction` pattern pervasively. This returns normalizr-formatted results that must be unwrapped with a hack method, creating brittle coupling between Redux actions and component code.
- Files: `frontend/src/metabase/lib/entities.js`, `frontend/src/metabase/entities/*.js` (22 JS entity files), plus 14 consumer files using `HACK_getObjectFromAction`
- Impact: Makes entity CRUD operations fragile and hard to type. Blocks full TypeScript migration of entity-dependent code. Every new entity operation must use the hack pattern.
- Fix approach: Migrate to RTK Query for data fetching (already partially in progress via `frontend/src/metabase/api/`). Replace entity files one-by-one with RTK Query endpoints.

**Legacy MBQL System (Backend):**
- Issue: The entire `src/metabase/legacy_mbql/` namespace (8 files) is deprecated since v0.57.0 but still referenced throughout the codebase. Functions in `src/metabase/legacy_mbql/util.cljc`, `src/metabase/legacy_mbql/schema.cljc` (2232 lines), and `src/metabase/legacy_mbql/normalize.cljc` are marked deprecated but have active consumers.
- Files: `src/metabase/legacy_mbql/*.cljc` (8 files), `src/metabase/queries_rest/api/card.clj`, `src/metabase/driver.clj`, `src/metabase/query_permissions/impl.clj`
- Impact: Dual query representations (legacy MBQL vs. pMBQL/lib) increase cognitive load, make query processing harder to reason about, and create surface area for inconsistencies.
- Fix approach: Continue migration to pMBQL. Each legacy MBQL consumer should be individually ported to use the `metabase.lib.*` namespaces.

**JavaScript/JSX Files Not Yet Migrated to TypeScript:**
- Issue: 62 non-test `.js` files and 91 non-test `.jsx` files remain in `frontend/src/metabase/`, missing type safety. Key files include `frontend/src/metabase/query_builder/selectors.js` (1098 lines), `frontend/src/metabase/query_builder/components/DataSelector/DataSelector.jsx` (1116 lines).
- Files: `frontend/src/metabase/routes.jsx`, `frontend/src/metabase/query_builder/selectors.js`, `frontend/src/metabase/query_builder/components/DataSelector/DataSelector.jsx`, `frontend/src/metabase/reference/components/Detail.jsx`, `frontend/src/metabase/entities/*.js`
- Impact: No compile-time type checking for critical query builder logic. Harder to refactor safely.
- Fix approach: Convert files per the convention in `frontend/CLAUDE.md`: create a separate PR for TypeScript conversion before making functional changes.

**Deprecated Styled Components:**
- Issue: 283 `.styled.tsx` / `.styled.ts` files remain across the frontend, despite styled-components being deprecated in favor of CSS Modules and Mantine style props. Concentrated in visualizations (67 files) and admin (24 files).
- Files: `frontend/src/metabase/visualizations/**/*.styled.tsx` (67 files), `frontend/src/metabase/admin/**/*.styled.tsx` (24 files), plus scattered across auth, home, forms, etc.
- Impact: Inconsistent styling approach. Emotion runtime overhead. New developers may copy deprecated patterns.
- Fix approach: When modifying a component with styled-components, migrate to CSS Modules (`.module.css`) or Mantine style props. 537 CSS modules already exist as the target pattern.

**metabase-lib v1 Legacy Layer:**
- Issue: `frontend/src/metabase-lib/v1/` contains 95 files of legacy query-building code, including the 920-line `Question.ts` class. This layer wraps the newer CLJS-based metabase-lib but is itself a legacy abstraction.
- Files: `frontend/src/metabase-lib/v1/Question.ts`, `frontend/src/metabase-lib/v1/metadata/Field.ts`, `frontend/src/metabase-lib/v1/parameters/**`
- Impact: Two layers of query abstraction on the frontend. The v1 layer is imperative/OOP while the newer lib is functional, creating confusion about which to use.
- Fix approach: Gradually replace v1 usages with direct calls to `frontend/src/metabase-lib/*.ts` (the newer functional wrappers over the CLJS lib).

**`*HACK-disable-ref-validation*` Dynamic Binding:**
- Issue: A dynamic var `*HACK-disable-ref-validation*` in `src/metabase/lib/schema.cljc` disables schema validation for field/expression refs. Used in 5 files, primarily in X-Rays code that generates incomplete query fragments.
- Files: `src/metabase/lib/schema.cljc` (definition), `src/metabase/xrays/automagic_dashboards/core.clj`, `src/metabase/xrays/automagic_dashboards/populate.clj`, `src/metabase/xrays/automagic_dashboards/comparison.clj`, `src/metabase/query_processor/util/nest_query.clj`
- Impact: Bypasses validation that catches invalid refs, potentially masking bugs. Creates a code path where schema guarantees do not hold.
- Fix approach: Port X-Rays to use the lib API properly so query fragments are always valid. Remove the hack once X-Rays generates complete stages.

## Known Bugs

**Chain Filter OOM Risk (#46411):**
- Symptoms: Out-of-memory errors when chain-filtering on text columns with large values
- Files: `src/metabase/parameters/chain_filter.clj` (line ~477)
- Trigger: Dashboard parameter filter search on a text field where individual values are very large
- Workaround: None documented. Comment suggests using `field-values/distinct-text-field-rff` to stream results instead of collecting into memory.

**Incomplete Join Ref Handling:**
- Symptoms: Legacy refs that reference a `:join-alias` from another stage cause errors
- Files: `src/metabase/lib/join.cljc` (line ~210, `HACK-column-from-incomplete-join` function)
- Trigger: Queries with broken legacy refs referencing join aliases across stages
- Workaround: The `HACK-column-from-incomplete-join` function creates a special column with `::HACK-from-incomplete-join?` metadata to bypass join alias requirements.

## Security Considerations

**H2 Driver SQL Injection Hardening:**
- Risk: H2 database connections can potentially be exploited via connection string manipulation
- Files: `src/metabase/driver/h2.clj` (lines ~111, ~536)
- Current mitigation: Connection string sanitization removes dangerous patterns (INIT=, etc.). SQL execution on H2 databases is blocked for default admin accounts. The driver marks disallowed connection string options.
- Recommendations: H2 remains inherently risky as a user-connected database. Continue to validate and restrict connection parameters.

**Anti-CSRF Token for Embedded Sessions:**
- Risk: Embedded sessions require anti-CSRF tokens to prevent cross-site request forgery
- Files: `src/metabase/session/models/session.clj` (line ~19)
- Current mitigation: Random 32-character hex anti-CSRF tokens are generated for embedded sessions
- Recommendations: Ensure all embedded API endpoints validate the anti-CSRF token.

**Security Headers Middleware:**
- Risk: API responses could be cached or exploited without proper headers
- Files: `src/metabase/server/handler.clj` (references `mw.security/add-security-headers`)
- Current mitigation: Security headers middleware is applied in the handler pipeline
- Recommendations: Audit headers periodically against OWASP recommendations.

## Performance Bottlenecks

**Large Clojure Source Files:**
- Problem: Several core backend files exceed 1000 lines, making them slow to load and hard to navigate
- Files: `src/metabase/lib/js.cljs` (2801 lines), `src/metabase/collections/models/collection.clj` (2399 lines), `src/metabase/legacy_mbql/schema.cljc` (2232 lines), `src/metabase/driver/sql/query_processor.clj` (2160 lines), `src/metabase/app_db/custom_migrations.clj` (1995 lines)
- Cause: Monolithic namespaces accumulating functionality over time
- Improvement path: Break large namespaces into sub-namespaces. `custom_migrations.clj` is especially problematic as it will only grow with each release.

**N+1 Query Awareness:**
- Problem: Several areas have documented N+1 query concerns, some mitigated and some not
- Files: `src/metabase/dashboards_rest/api.clj` (line ~98, "I'm a bit worried that this is an n+1 situation"), `src/metabase/driver/sql_jdbc/sync/describe_database.clj` (line ~194), `src/metabase/app_db/custom_migrations/reserve_at_symbol_user_attributes.clj` (line ~46, intentional N+1)
- Cause: Individual entity loading instead of batched hydration
- Improvement path: Use Toucan batched hydration consistently (already applied in some places like `src/metabase/public_sharing_rest/api.clj`).

## Fragile Areas

**Query Builder Selectors:**
- Files: `frontend/src/metabase/query_builder/selectors.js` (1098 lines, still JavaScript)
- Why fragile: Large untyped selector file with complex memoization logic using `createSelector`. No TypeScript means refactoring is risky.
- Safe modification: Add TypeScript types first (separate PR), then modify. Test with the full query builder test suite.
- Test coverage: Unit tests exist but coverage of edge cases is uncertain due to lack of types.

**DataSelector Component:**
- Files: `frontend/src/metabase/query_builder/components/DataSelector/DataSelector.jsx` (1116 lines, JSX)
- Why fragile: Monolithic component handling table/database/schema selection with complex state. No TypeScript types.
- Safe modification: Convert to TypeScript first. Consider breaking into sub-components for table picker, database picker, schema picker.
- Test coverage: Limited unit tests for a component of this complexity.

**X-Rays / Automagic Dashboards:**
- Files: `src/metabase/xrays/automagic_dashboards/core.clj` (1012 lines), `src/metabase/xrays/automagic_dashboards/populate.clj`, `src/metabase/xrays/automagic_dashboards/comparison.clj`, `src/metabase/xrays/automagic_dashboards/filters.clj`
- Why fragile: Relies on `*HACK-disable-ref-validation*` to bypass schema checks. Generates partial query stages that are assembled after the fact, violating normal lib invariants.
- Safe modification: Test thoroughly after any changes. The validation bypass means schema errors may not surface until runtime.
- Test coverage: Gaps around edge cases with complex join scenarios.

**Custom Migrations:**
- Files: `src/metabase/app_db/custom_migrations.clj` (1995 lines)
- Why fragile: Append-only file that grows with every release. Each migration function runs exactly once in production. Migration failures can leave the database in a partially-migrated state.
- Safe modification: Each new migration should be self-contained and idempotent where possible. Test migrations against both H2 and PostgreSQL.
- Test coverage: Migrations are typically tested via integration tests in `test/metabase/app_db/custom_migrations_test.clj`.

## Scaling Limits

**Frontend Bundle Size:**
- Current capacity: Multiple rspack configs (`rspack.main.config.js`, `rspack.embedding-sdk-bundle.config.js`, etc.) split the build
- Limit: The main bundle includes a large CLJS-compiled metabase-lib, visualization libraries, and the full application
- Scaling path: Continue code-splitting. The embedding SDK already has separate bundle configs. Consider lazy-loading more visualization types.

## Dependencies at Risk

**Emotion / Styled Components:**
- Risk: Deprecated in favor of CSS Modules per `frontend/CLAUDE.md`, but 283 styled files remain
- Impact: Runtime CSS-in-JS overhead; potential conflict with server-side rendering if adopted
- Migration plan: Replace with CSS Modules (`.module.css`) or Mantine style props when touching affected files

**Legacy Entity Framework:**
- Risk: Custom `createEntity` in `frontend/src/metabase/lib/entities.js` is a homegrown abstraction with no external maintenance
- Impact: 22 entity definitions depend on it. The `HACK_getObjectFromAction` pattern is used in 14+ files
- Migration plan: Migrate to RTK Query endpoints in `frontend/src/metabase/api/`

## Missing Critical Features

**Streaming Chain Filter Results:**
- Problem: Chain filter for dashboard parameters loads all distinct values into memory
- Blocks: Large text columns with many or large values cause OOM (#46411)

## Test Coverage Gaps

**Frontend JavaScript Files Without Tests:**
- What's not tested: Many legacy `.js` entity files lack corresponding test files
- Files: `frontend/src/metabase/entities/segments.js`, `frontend/src/metabase/entities/dashboards.js`, `frontend/src/metabase/entities/databases.js`, etc.
- Risk: Entity CRUD operations could silently break during RTK Query migration
- Priority: Medium - these are being replaced, but should have regression tests during transition

**Query Builder Selectors:**
- What's not tested: Complex selector composition in `frontend/src/metabase/query_builder/selectors.js` (1098 lines of untyped selectors)
- Files: `frontend/src/metabase/query_builder/selectors.js`
- Risk: Selector memoization bugs could cause stale UI state in the query builder
- Priority: High - this is core query builder infrastructure

**X-Rays Validation Bypass:**
- What's not tested: Query correctness when `*HACK-disable-ref-validation*` is active
- Files: `src/metabase/xrays/automagic_dashboards/core.clj`, `src/metabase/xrays/automagic_dashboards/populate.clj`
- Risk: Invalid query refs could slip through and cause downstream QP errors
- Priority: Medium - X-Rays are a secondary feature but user-facing

---

*Concerns audit: 2026-03-11*
