(ns metabase-enterprise.impersonation.db
  "Application database queries for the impersonation module. Every function here is a direct Toucan 2 call with no
  additional logic."
  (:require
   [metabase-enterprise.impersonation.models.impersonation-query-cache :as impersonation-query-cache]
   [metabase-enterprise.impersonation.schema :as impersonation.schema]
   [metabase.app-db.core :as app-db]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn query-cache :- [:maybe ::impersonation.schema/impersonation-query-cache]
  "The ImpersonationQueryCache with the lookup key of `input`, or nil."
  [{:keys [input_query input_engine input_allow_write input_admin input_version]}
   :- ::impersonation.schema/impersonation-query-cache.update]
  (t2/select-one :model/ImpersonationQueryCache
                 :input_query_hash  (impersonation-query-cache/query-hash input_query)
                 :input_engine      input_engine
                 :input_allow_write input_allow_write
                 :input_admin       input_admin
                 :input_version     input_version))

(mu/defn update-or-insert-query-cache! :- ms/PositiveInt
  "Update the ImpersonationQueryCache with the lookup key of `row` to `row`, or insert `row` when there is none."
  [{:keys [input_query input_engine input_allow_write input_admin input_version] :as row}
   :- ::impersonation.schema/impersonation-query-cache.update]
  (app-db/update-or-insert! :model/ImpersonationQueryCache
                            {:input_query_hash  (impersonation-query-cache/query-hash input_query)
                             :input_engine      input_engine
                             :input_allow_write input_allow_write
                             :input_admin       input_admin
                             :input_version     input_version}
                            (constantly row)))

(mu/defn delete-outdated-query-caches! :- :int
  "Delete the ImpersonationQueryCaches cached by a Metabase version other than `version` or before `cutoff`,
  returning the number deleted."
  [version :- :string
   cutoff  :- (ms/InstanceOfClass java.time.OffsetDateTime)]
  (t2/delete! :model/ImpersonationQueryCache {:where [:or
                                                      [:not= :input_version version]
                                                      [:< :created_at cutoff]]}))
