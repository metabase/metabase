(ns metabase-enterprise.workspaces.util)

(def isolated-prefix
  "Prefix used for workspace-isolated database objects. The workspaces feature has been removed;
  this value is kept so driver test code that references it still resolves."
  "mb__isolation")
