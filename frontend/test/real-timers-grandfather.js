/**
 * Specs grandfathered OUT of the fast-test regime (fake timers + instant
 * userEvent) — they fail under it and keep stock behaviour until fixed.
 *
 * Generated from a full-suite run under the regime. Burn-down: fix a spec
 * per the playbook in fast-user-event.ts, remove it from this list, and
 * verify with: bun x jest <path>
 */
module.exports = [
  "enterprise/frontend/src/metabase-enterprise/audit_app/containers/UnsubscribeUserModal/UnsubscribeUserModal.unit.spec.tsx",
  "enterprise/frontend/src/metabase-enterprise/caching/components/StrategyEditorForDatabases.unit.spec.tsx",
  // eslint-disable-next-line metabase/no-literal-metabase-strings -- file path, not user-facing copy
  "enterprise/frontend/src/metabase-enterprise/metabot/components/MetabotAdmin/MetabaseAIProviderSetup.unit.spec.tsx",
  "frontend/src/metabase/forms/components/FormDateInput/FormDateInput.unit.spec.tsx",
  "frontend/src/metabase/monitor/tools/notifications/NotificationsAdminPage/NotificationsAdminPage.unit.spec.tsx",
  "frontend/src/metabase/visualizations/visualizations/SmartScalar/compute.unit.spec.ts",
];
