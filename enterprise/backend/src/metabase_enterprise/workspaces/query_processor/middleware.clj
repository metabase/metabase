(ns metabase-enterprise.workspaces.query-processor.middleware
  "QP preprocessing middleware that rewrites table references in native SQL queries for workspace transforms.

  When a query carries a `:workspace-remapping` key (attached by workspace execute code), this middleware
  rewrites table names in the native SQL using [[sql-tools/replace-names]].

  The `:workspace-remapping` value is a map with a `:tables` key — a map from source `{:schema :table}` specs
  to target `{:schema :table}` specs. This key is transient — it is attached in-memory by workspace execute
  code and never persisted."
  (:require
   [clojure.walk :as walk]
   [metabase.driver :as driver]
   [metabase.lib.schema :as lib.schema]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;; TODO (Chris 2026-02-27) -- we can remove this step after https://github.com/metabase/metabase/pull/68897 is merged.
(defn- parse-remapping
  "Recover map representation of remapping, if it has been recovered from JSON."
  [remapping]
  (let [tables (or (:tables remapping) (walk/keywordize-keys (get remapping "tables")))]
    {:tables (if (map? tables) tables (into {} tables))}))

(defenterprise apply-workspace-remapping
  "Pre-processing middleware. Rewrites table references in native SQL queries for workspace transforms."
  :feature :workspaces
  [{remapping :workspace-remapping :as query}]
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
                                                                  (parse-remapping remapping)
                                                                  {:allow-unused? true})))
        (dissoc :workspace-remapping))))
