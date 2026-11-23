(ns metabase-enterprise.advanced-permissions.models.permissions.data-permissions
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.malli :as mu]))

(defmulti ^:private download-perms-sources
  "What the download level of `query` is read from: `{:database-id id}` for every Table of its Database, which a
  native query or one with a native stage or join needs, or `{:database-id id :table-ids ids}` for the Tables it reads."
  {:arglists '([mbql5-query])}
  (mu/fn [query :- ::lib.schema/query]
    (:lib/type (lib/query-stage query -1))))

(defmethod download-perms-sources :mbql.stage/native
  [{database-id :database, :as _query}]
  {:database-id database-id})

(mu/defmethod download-perms-sources :mbql.stage/mbql
  [{db-id :database, :as query} :- ::lib.schema/query]
  (let [{:keys [table-ids native?]} (query-perms/query->source-ids query)]
    (if (or native? (lib/any-native-stage-not-introduced-by-sandbox? query))
      {:database-id db-id}
      {:database-id db-id :table-ids table-ids})))

(defn- lowest-level
  "The lowest download level among `levels`, which is the full level when there are none."
  [levels]
  (or (levels :no)
      (levels :ten-thousand-rows)
      :one-million-rows))

(defenterprise download-perms-levels
  "The user's download permission level for each of `queries`, in order, from one bulk question for all of them."
  :feature :advanced-permissions
  [queries user-id]
  (let [sources         (mapv download-perms-sources queries)
        user-info       (perms/user-info user-id)
        database-values (perms/every-table-in-database-permissions-for-user
                         user-info :perms/download-results
                         (into [] (comp (remove #(contains? % :table-ids)) (map :database-id) (distinct)) sources))
        table-values    (perms/table-permissions-for-user
                         user-info :perms/download-results
                         (into {}
                               (comp (filter #(contains? % :table-ids))
                                     (mapcat (fn [{:keys [database-id table-ids]}]
                                               (map #(vector % database-id) table-ids))))
                               sources))]
    (mapv (fn [{:keys [database-id table-ids] :as source}]
            (if (contains? source :table-ids)
              (lowest-level (into #{} (map table-values) table-ids))
              (lowest-level #{(get database-values database-id)})))
          sources)))

(defenterprise download-perms-level
  "The user's permission level for the given query"
  :feature :advanced-permissions
  [query user-id]
  (first (download-perms-levels [query] user-id)))
