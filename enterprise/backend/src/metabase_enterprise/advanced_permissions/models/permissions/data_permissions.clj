(ns metabase-enterprise.advanced-permissions.models.permissions.data-permissions
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.malli :as mu]))

(defmulti download-perms-level*
  "Returns user's download permission level for the given query."
  {:arglists '([mbql5-query user-id])}
  (mu/fn [query :- ::lib.schema/query _user-id]
    (:lib/type (lib/query-stage query -1))))

(defmethod download-perms-level* :mbql.stage/native
  [{database-id :database, :as _query} user-id]
  (get (perms/every-table-in-database-permissions-for-user (perms/user-info user-id) :perms/download-results [database-id]) database-id))

(mu/defmethod download-perms-level* :mbql.stage/mbql
  [{db-id :database, :as query} :- ::lib.schema/query user-id]
  (let [{:keys [table-ids native?]} (query-perms/query->source-ids query)
        perms (if (or native? (lib/any-native-stage-not-introduced-by-sandbox? query))
                ;; If we detect any native subqueries/joins, even with source-card IDs, require full native
                ;; download perms
                #{(get (perms/every-table-in-database-permissions-for-user (perms/user-info user-id) :perms/download-results [db-id]) db-id)}
                (set (vals (perms/table-permissions-for-user (perms/user-info user-id)
                                                             :perms/download-results
                                                             (zipmap table-ids (repeat db-id))))))]
    ;; The download perm level for a query should be equal to the lowest perm level of any table referenced by the query.
    (or (perms :no)
        (perms :ten-thousand-rows)
        :one-million-rows)))

(defenterprise download-perms-level
  "The user's permission level for the given query"
  :feature :advanced-permissions
  [query user-id]
  (download-perms-level* query user-id))
