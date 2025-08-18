(ns metabase-enterprise.database-replication.api
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.database-replication.settings :as database-replication.settings]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.premium-features.core :refer [quotas]]
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

(defn- prepare-filter
  [filter-type schema-filters]
  (some->> schema-filters
           (filter (comp #{filter-type} :type))
           (map (comp #(str/replace % #"(^|[^\\\\])\*" "$1.*") str/trim :pattern))
           not-empty
           (str/join "|")
           re-pattern))

(defn- schema-filters->fn [schema-filters]
  (let [include-pattern (prepare-filter "include" schema-filters)
        include-fn      #(re-matches include-pattern %)
        exclude-pattern (prepare-filter "exclude" schema-filters)
        exclude-fn      #(not (re-matches exclude-pattern %))]
    (cond
      (and (not include-pattern)
           (not exclude-pattern))
      (constantly true)

      (and include-pattern
           exclude-pattern)
      (every-pred include-fn exclude-fn)

      include-pattern
      include-fn

      exclude-pattern
      exclude-fn)))

(defn- preview [secret]
  (hm.client/call :preview-connection, :connection-id "preview", :type "pg_replication", :secret secret))

(def ^:private preview-memo
  (memoize/ttl preview :ttl/threshold (u/minutes->ms 5)))

(defn- token-check-quotas-info
  "Predicate that signals if replication looks right from the quota perspective.

   This predicate checks that the quotas we got from the latest tokencheck have enough space for the database to be
  replicated."
  [{:as secret, :keys [schema-filters]}]
  (let [all-quotas                 (quotas)
        free-quota                 (or
                                    (some->> (m/find-first (comp #{"clickhouse-dwh"} :hosting-feature) all-quotas)
                                             ((juxt :soft-limit :usage))
                                             (apply -))
                                    -1)
        all-tables                 (->> (dissoc secret :schema-filters)
                                        ;; memo the slow preview call without filters, then
                                        ;; filter schemas over the memoized result for snappy UI
                                        preview-memo
                                        :tables
                                        (filter (comp (schema-filters->fn schema-filters) :table_schema)))
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
                                    0)
        map-ks-fn                  #(-> (m/map-keys {:table_schema :schema, :table_name :name} %)
                                        (select-keys [:schema :name]))]
    (log/infof "Quota left: %s. Estimate db row count: %s" free-quota total-estimated-row-count)
    {:free-quota                 free-quota
     :total-estimated-row-count  total-estimated-row-count
     :can-set-replication        (< total-estimated-row-count free-quota)
     :all-quotas                 all-quotas
     :all-tables                 all-tables
     :replicated-tables          replicated-tables
     :tables-without-pk          (map map-ks-fn tables-without-pk)
     :tables-without-owner-match (map map-ks-fn tables-without-owner-match)}))

(defn- ->secret [database replication-schema-filters]
  (let [credentials    (-> (:details database)
                           (select-keys [:dbname :host :user :password :port])
                           (update :port #(or % 5432)) ;; port is required in the API, but optional in MB
                           (merge {:dbtype "postgresql"}))
        {:keys [schema-filters-type schema-filters-patterns]} (:details database)
        schema-filters (-> (when-some [k ({"inclusion" :include, "exclusion" :exclude} schema-filters-type)]
                             (for [pattern (str/split schema-filters-patterns #",")]
                               {:type k :pattern pattern}))
                           (concat (map #(select-keys % [:type :pattern]) replication-schema-filters))
                           not-empty)]
    {:credentials    credentials
     :schema-filters schema-filters}))

(api.macros/defendpoint :post "/connection/:database-id/preview"
  "Return info about pg-replication connection that is about to be created."
  [{:keys [database-id]} :- [:map [:database-id ms/PositiveInt]]
   _query-params
   {:keys [schemaFilters]} :- [:map
                               [:schemaFilters {:optional true} [:sequential
                                                                 [:map
                                                                  [:type [:enum "include" "exclude"]]
                                                                  [:pattern :string]]]]]]
  (let [database (t2/select-one :model/Database :id database-id)
        secret (->secret database schemaFilters)]
    (u/recursive-map-keys u/->camelCaseEn (token-check-quotas-info secret))))

(api.macros/defendpoint :post "/connection/:database-id"
  "Create a new PG replication connection for the specified database."
  ;; FIXME: First arg is route params, 2nd arg is query params, 3rd arg is body params:
  [{:keys [database-id]} :- [:map [:database-id ms/PositiveInt]]
   _query-params
   {:keys [schemaFilters]} :- [:map
                               [:schemaFilters {:optional true} [:sequential
                                                                 [:map
                                                                  [:type [:enum "include" "exclude"]]
                                                                  [:pattern :string]]]]]]
  (api/check-400 (database-replication.settings/database-replication-enabled) "PG replication integration is not enabled.")
  (let [database (t2/select-one :model/Database :id database-id)]
    (api/check-404 database)
    (api/check-400 (= :postgres (:engine database)) "PG replication is only supported for PostgreSQL databases.")
    (let [conns (pruned-database-replication-connections)]
      (api/check-400 (not (database-id->connection-id conns database-id)) "Database already has an active replication connection.")
      (let [secret (->secret database schemaFilters)]
        (if (:can-set-replication (token-check-quotas-info secret))
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

;; preview endpoint will be around here

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/database-replication` routes."
  (api/+check-superuser
   (api.macros/ns-handler *ns* api/+check-superuser +auth)))
