(ns metabase-enterprise.workspaces.query-processor.middleware
  "QP preprocessing middleware that rewrites table references in native SQL queries for workspace transforms.

  When a query carries a `:workspace-remapping` key in its `:middleware` map (attached by workspace execute
  code), this middleware rewrites table names in the native SQL using [[sql-tools/replace-names]]."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.sql.util :as sql.u]
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
    ;; Not in a workspace that requires remapping, or no tables to remap.
    (or (not remapping) (empty? (:tables remapping)))
    query

    (not (lib.schema/native-only-query? query))
    (throw (ex-info "Workspace remapping is currently only supported for native queries"
                    {:query query, :remapping remapping}))

    :else
    (let [;; Quote replacement identifiers so the SQL parser preserves their case.
          ;; Drivers like Snowflake uppercase unquoted identifiers; without quoting, a lowercase
          ;; isolation schema like `mb__isolation_xxx` would become `MB__ISOLATION_XXX` and not match.
          ;; The same applies to table names containing lowercase characters.
          quote-id  (fn [s] (if s (sql.u/quote-name driver/*driver* :table s) s))
          ;; tables has the form {:schema,:table} => {:schema,:table}, and we want to quote the target schema + table.
          remapping (update remapping :tables update-vals #(update-vals % quote-id))]
      (u/update-in-if-exists query [:stages 0 :native]
                             (fn [sql] (sql-tools/replace-names driver/*driver*
                                                                sql
                                                                remapping
                                                                {:allow-unused? true}))))))
