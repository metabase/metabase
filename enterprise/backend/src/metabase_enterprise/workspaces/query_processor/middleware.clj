(ns metabase-enterprise.workspaces.query-processor.middleware
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise apply-workspace-remapping
  "Dummy implementation — the workspaces feature has been removed."
  :feature :workspaces
  [query]
  query)
