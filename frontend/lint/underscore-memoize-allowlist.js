/**
 * Files still using underscore's memoize, whose cache never evicts and never
 * releases. See the no-underscore-memoize rule for what to use instead.
 *
 * This list may only shrink. Adding an entry means adding a cache that is
 * retained for the life of the tab, so fix the call site instead.
 *
 * Removing one is usually small: pick a cache whose lifetime matches the work.
 * A WeakMap keyed on a long-lived object, a Map created per call, or memoize
 * from metabase/utils/memoize. Check first whether callers depend on the
 * result's identity, because that decides which of those is safe.
 */
module.exports = [
  "frontend/src/metabase-lib/v1/Question.ts",
  "frontend/src/metabase-lib/v1/metadata/Database.ts",
  "frontend/src/metabase-lib/v1/metadata/Table.ts",
  "frontend/src/metabase/account/password/components/UserPasswordForm/UserPasswordForm.tsx",
  "frontend/src/metabase/auth/components/ResetPasswordForm/ResetPasswordForm.tsx",
  "frontend/src/metabase/common/components/Schedule/cron.ts",
  "frontend/src/metabase/common/components/Schedule/utils.tsx",
  "frontend/src/metabase/databases/components/DatabaseForm/DatabaseForm.tsx",
  "frontend/src/metabase/querying/expressions/clause.ts",
  "frontend/src/metabase/querying/expressions/resolver.ts",
  "frontend/src/metabase/querying/notebook/components/FilterStep/FilterStep.tsx",
  "frontend/src/metabase/querying/segments/components/SegmentFilterEditor/SegmentFilterEditor.tsx",
  "frontend/src/metabase/setup/components/UserForm/UserForm.tsx",
  "frontend/src/metabase/utils/cron.ts",
  "frontend/src/metabase/utils/dom.ts",
  "frontend/src/metabase/visualizations/lib/data_grid.ts",
  "frontend/src/metabase/visualizations/shared/components/RowChart/utils/data.ts",
];
