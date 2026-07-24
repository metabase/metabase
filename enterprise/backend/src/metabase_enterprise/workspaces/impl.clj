(ns metabase-enterprise.workspaces.impl
  "EE implementations of workspace `defenterprise` hooks. Only the premium-gated pieces live
  here (workspace CRUD is in [[metabase-enterprise.workspaces.api]]); the models and the
  ID-remapping helpers are OSS, in `metabase.workspaces.*`."
  (:require
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defenterprise check-valid-workspace-id
  "Check that `workspace-id` refers to an existing workspace; throw a 400 otherwise. Nil is
  always fine — it clears the user's active workspace."
  :feature :workspaces
  [workspace-id]
  (when workspace-id
    (api/check (t2/exists? :model/Workspace :id workspace-id)
               [400 (tru "Workspace {0} does not exist." workspace-id)])))
