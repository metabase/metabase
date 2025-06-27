(ns metabase-enterprise.pg-replication.api
  (:require
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase-enterprise.pg-replication.settings
    :as pg-replication.settings
    :refer [pg-replication-connections]]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.settings.core :as setting]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- pruned-pg-replication-connections
  "Delete any pg replication connections that don't exist anymore in Harbormaster.
  Updates the setting if needed, and returns the pruned connections."
  []
  (let [hm-conn-ids (->> (hm.client/call :list-connections)
                         (filter #(-> % :type (= "pg_replication")))
                         (map :id)
                         set)
        conns       (pg-replication-connections)
        pruned-conns (->> conns
                          (filter #(->> % second :connection-id hm-conn-ids))
                          (into {}))]
    (when-not (= conns pruned-conns)
      (setting/set-value-of-type! :json :pg-replication-connections pruned-conns))
    pruned-conns))

(api.macros/defendpoint :post "/connection/:database-id"
  "Create a new PG replication connection for the specified database."
  [{:keys [database-id]} :- [:map [:database-id ms/PositiveInt]]]
  (api/check-400 (pg-replication.settings/pg-replication-enabled) "PG replication integration is not enabled.")
  (let [database (t2/select-one :model/Database :id database-id)]
    (api/check-404 database)
    (api/check-400 (= :postgres (:engine database)) "PG replication is only supported for PostgreSQL databases.")
    (pruned-pg-replication-connections)
    (api/check-400 (nil? (get (pg-replication-connections) database-id)) "Database already has an active replication connection.")
    (let [credentials (-> (:details database)
                          (select-keys [:dbname :host :user :password :port])
                          (update :port #(or % 5432))) ;; port is required in the API, but optional in MB
          {:keys [schema-filters-type schema-filters-patterns]} (:details database)
          schemas      (when-some [k ({"inclusion" :include, "exclusion" :exclude} schema-filters-type)]
                         (when schema-filters-patterns
                           {:schemas {k schema-filters-patterns}}))
          secret       (merge {:credentials (merge {:dbtype "postgresql"} credentials)}
                              schemas)
          {:keys [id]} (hm.client/call :create-connection {:type "pg_replication", :secret secret})]
      (setting/set-value-of-type! :json :pg-replication-connections
                                  (assoc (pg-replication-connections) database-id {:connection-id id})))))

(api.macros/defendpoint :delete "/connection/:database-id"
  "Delete PG replication connection for the specified database."
  [{:keys [database-id]} :- [:map [:database-id ms/PositiveInt]]]
  (api/check-400 (pg-replication.settings/pg-replication-enabled) "PG replication integration is not enabled.")
  (let [connection-id (:connection-id (get (pruned-pg-replication-connections) database-id))]
    (api/check-400 connection-id "No replication connection found for this database.")
    (hm.client/call :delete-connection :connection-id connection-id)
    (setting/set-value-of-type! :json :pg-replication-connections (dissoc (pg-replication-connections) database-id))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/pg-replication` routes."
  (api/+check-superuser
   (api.macros/ns-handler *ns* api/+check-superuser +auth)))
