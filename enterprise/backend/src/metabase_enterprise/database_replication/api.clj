(ns metabase-enterprise.database-replication.api
  (:require
   [medley.core :as m]
   [metabase-enterprise.database-replication.settings :as database-replication.settings]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- pruned-database-replication-connections
  "Delete any pg replication connections that don't exist anymore in Harbormaster.
  Updates the setting if needed, and returns the pruned connections."
  []
  (let [hm-conn-ids  (->> (hm.client/call :list-connections) (filter #(-> % :type (= "pg_replication"))) (map :id) set)
        conns        (database-replication.settings/database-replication-connections)
        pruned-conns (m/filter-vals #(->> % :connection-id hm-conn-ids) conns)]
    (when-not (= conns pruned-conns)
      (database-replication.settings/database-replication-connections! pruned-conns))
    pruned-conns))

(defn- kw-id [id]
  (->> id str keyword))

(defn- database-id->connection-id [conns database-id]
  (->> database-id kw-id (get conns) :connection-id))

(api.macros/defendpoint :post "/connection/:database-id"
  "Create a new PG replication connection for the specified database."
  [{:keys [database-id]} :- [:map [:database-id ::ms/PositiveInt]]]
  (api/check-400 (database-replication.settings/database-replication-enabled) "PG replication integration is not enabled.")
  (let [database (t2/select-one :model/Database :id database-id)]
    (api/check-404 database)
    (api/check-400 (= :postgres (:engine database)) "PG replication is only supported for PostgreSQL databases.")
    (let [conns (pruned-database-replication-connections)]
      (api/check-400 (not (database-id->connection-id conns database-id)) "Database already has an active replication connection.")
      (let [credentials (-> (:details database)
                            (select-keys [:dbname :host :user :password :port])
                            (update :port #(or % 5432))) ;; port is required in the API, but optional in MB
            {:keys [schema-filters-type schema-filters-patterns]} (:details database)
            schemas      (when-some [k ({"inclusion" :include, "exclusion" :exclude} schema-filters-type)]
                           (when schema-filters-patterns
                             {:schemas {k schema-filters-patterns}}))
            secret       (merge {:credentials (merge {:dbtype "postgresql"} credentials)}
                                schemas)
            {:keys [id]} (hm.client/call :create-connection, :type "pg_replication", :secret secret)
            conn         {:connection-id id}]
        (database-replication.settings/database-replication-connections! (assoc conns (kw-id database-id) conn))
        conn))))

(api.macros/defendpoint :delete "/connection/:database-id"
  "Delete PG replication connection for the specified database."
  [{:keys [database-id]} :- [:map [:database-id ::ms/PositiveInt]]]
  (api/check-400 (database-replication.settings/database-replication-enabled) "PG replication integration is not enabled.")
  (let [conns (pruned-database-replication-connections)]
    (when-let [connection-id (database-id->connection-id conns database-id)]
      (hm.client/call :delete-connection, :connection-id connection-id)
      (database-replication.settings/database-replication-connections! (dissoc conns (kw-id database-id)))
      nil)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/database-replication` routes."
  (api/+check-superuser
   (api.macros/ns-handler *ns* api/+check-superuser +auth)))
