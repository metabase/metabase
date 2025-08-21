(ns metabase-enterprise.database-replication.api
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.set :as set]
   [medley.core :as m]
   [metabase-enterprise.database-replication.settings :as database-replication.settings]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver.sync :as driver.s]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.log :as log]
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

(defn- schema-filter->fn [{:keys [type patterns]}]
  (fn [table-schema]
    (or (= type "all")
        (-> patterns
            driver.s/schema-pattern->re-pattern
            (re-matches table-schema)
            ((case type
               "include" identity
               "exclude" nil?))))))

(defn- schema-filters->fn [schema-filters]
  (if (seq schema-filters)
    (fn [table-schema]
      (->> schema-filters
           (map schema-filter->fn)
           (every? #(% table-schema))))
    (constantly true)))

(defn- preview [secret]
  (hm.client/call :preview-connection, :connection-id "preview", :type "pg_replication", :secret secret))

(def ^:private preview-memo
  (memoize/ttl preview :ttl/threshold (u/minutes->ms 5)))

(defn- preview-replication
  "Predicate that signals if replication looks right from the quota perspective.

   This predicate checks that the quotas we got from the latest tokencheck have enough space for the database to be
  replicated."
  [secret & {:as replication-schema-filters}]
  (let [all-quotas                 (premium-features/quotas)
        free-quota                 (or
                                    (some->> (m/find-first (comp #{"clickhouse-dwh"} :hosting-feature) all-quotas)
                                             ((juxt :soft-limit :usage))
                                             (apply -))
                                    -1)
        all-tables                 (->> secret
                                        ;; memo the slow preview call without replication-schema-filters, then
                                        ;; apply filter over the memoized result for snappy UI
                                        preview-memo
                                        :tables
                                        (filter (comp (schema-filters->fn
                                                       (when (not-empty replication-schema-filters)
                                                         [replication-schema-filters]))
                                                      :table_schema)))
        replicated-tables          (->> all-tables
                                        (filter :has_pkey)
                                        (filter :has_ownership))
        tables-without-pk          (filter (comp not :has_pkey) all-tables)
        tables-without-owner-match (filter (comp not :has_ownership) all-tables)
        total-estimated-row-count  (or
                                    (some->>
                                     replicated-tables
                                     (map :estimated_row_count)
                                     (remove nil?)
                                     (reduce +))
                                    0)]
    (log/infof "Quota left: %s. Estimate db row count: %s" free-quota total-estimated-row-count)
    {:free-quota                 free-quota
     :total-estimated-row-count  total-estimated-row-count
     :can-set-replication        (and (not-empty replicated-tables)
                                      (< total-estimated-row-count free-quota))
     :all-quotas                 all-quotas
     :all-tables                 all-tables
     :replicated-tables          replicated-tables
     :tables-without-pk          tables-without-pk
     :tables-without-owner-match tables-without-owner-match}))

(defn- m->schema-filter [m]
  (-> m
      (select-keys [:schema-filters-type :schema-filters-patterns])
      (set/rename-keys {:schema-filters-type :type, :schema-filters-patterns :patterns})))

(defn- ->secret [database & {:as replication-schema-filters}]
  (let [credentials    (-> (:details database)
                           (select-keys [:dbname :host :user :password :port])
                           (update :port #(or % 5432)) ;; port is required in the API, but optional in MB
                           (merge {:dbtype "postgresql"}))
        schema-filters (->> [(m->schema-filter (:details database))
                             (m->schema-filter replication-schema-filters)]
                            (filterv not-empty))]
    {:credentials    credentials
     :schema-filters schema-filters}))

(def ^:private body-schema
  [:map
   [:replicationSchemaFilters
    {:optional true}
    [:map
     [:schema-filters-type [:enum "include" "exclude" "all"]]
     [:schema-filters-patterns :string]]]])

(api.macros/defendpoint :post "/connection/:database-id/preview"
  "Return info about pg-replication connection that is about to be created."
  [{:keys [database-id]} :- [:map [:database-id ms/PositiveInt]] _ {:keys [replicationSchemaFilters]} :- body-schema]
  (let [database (t2/select-one :model/Database :id database-id)
        secret (->secret database)
        replication-schema-filters (m->schema-filter replicationSchemaFilters)]
    (u/recursive-map-keys u/->camelCaseEn (preview-replication secret replication-schema-filters))))

(api.macros/defendpoint :post "/connection/:database-id"
  "Create a new PG replication connection for the specified database."
  [{:keys [database-id]} :- [:map [:database-id ms/PositiveInt]] _ {:keys [replicationSchemaFilters]} :- body-schema]
  (api/check-400 (database-replication.settings/database-replication-enabled) "PG replication integration is not enabled.")
  (let [database (t2/select-one :model/Database :id database-id)]
    (api/check-404 database)
    (api/check-400 (= :postgres (:engine database)) "PG replication is only supported for PostgreSQL databases.")
    (let [conns (pruned-database-replication-connections)]
      (api/check-400 (not (database-id->connection-id conns database-id)) "Database already has an active replication connection.")
      (let [secret (->secret database replicationSchemaFilters)]
        (if (:can-set-replication (preview-replication secret))
          (let [{:keys [id]} (try
                               (hm.client/call :create-connection, :type "pg_replication", :secret secret)
                               (catch Exception e
                                 (let [{:keys [error error-detail]} (ex-data e)]
                                   (when (not= "incorrect" error)
                                     (throw e))
                                   (api/check-400 false error-detail))))
                conn         {:connection-id id}]
            (database-replication.settings/database-replication-connections! (assoc conns (kw-id database-id) conn))
            conn)
          (api/check-400 false "not enough quota"))))))

(api.macros/defendpoint :delete "/connection/:database-id"
  "Delete PG replication connection for the specified database."
  [{:keys [database-id]} :- [:map [:database-id ms/PositiveInt]]]
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
