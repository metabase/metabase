(ns metabase-enterprise.workspaces.query-processor.middleware
  "QP preprocessing middleware that rewrites table references in native SQL queries for workspace transforms.

  When a query carries a `:workspace-remapping` key in its `:middleware` map (attached by workspace execute
  code), this middleware rewrites table names in the native SQL using [[sql-tools/replace-names]]."
  (:require
   [metabase.driver :as driver]
   [metabase.lib.schema :as lib.schema]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defenterprise apply-workspace-remapping
  "Pre-processing middleware. Rewrites table references in native SQL queries for workspace transforms."
  :feature :workspaces
  [{{remapping :workspace-remapping} :middleware :as query}]
  (cond
    ;; Not in a workspace that requires remapping.
    (not remapping)
    query

    (not (lib.schema/native-only-query? query))
    (throw (ex-info "Workspace remapping is currently only supported for native queries"
                    {:query query, :remapping remapping}))

    :else
    (-> query
        (u/update-in-if-exists [:stages 0 :native]
                               (fn [sql] (sql-tools/replace-names driver/*driver*
                                                                  sql
                                                                  remapping
                                                                  {:allow-unused? true})))
        (update :middleware dissoc :workspace-remapping))))
