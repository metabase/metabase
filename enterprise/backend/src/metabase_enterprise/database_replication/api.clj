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
   [toucan2.core :as t2])
  (:import
   (java.util.regex PatternSyntaxException)))

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
  (if (= type "all")
    (constantly true)
    (let [pat (driver.s/schema-pattern->re-pattern patterns)
          f   (case type
                "inclusion" some?
                "exclusion" nil?)]
      (fn [table-schema]
        (f (re-matches pat table-schema))))))

(defn- schema-filters->fn [schema-filters]
  (if (seq schema-filters)
    (fn [table-schema]
      (->> schema-filters
           (map schema-filter->fn)
           (every? #(% table-schema))))
    (constantly true)))

(defn- hm-preview [secret]
  (hm.client/call :preview-connection, :connection-id "preview", :type "pg_replication", :secret secret))

(def ^:private hm-preview-memo
  (memoize/ttl hm-preview :ttl/threshold (u/minutes->ms 5)))

(defn- preview-tables
  [secret & replication-schema-filters]
  (try
    ;; realize this lazy seq here to catch the regex error, if any
    (doall
     (->> secret
          ;; memo the slow preview call without replication-schema-filters, then
          ;; apply filter over the memoized result for snappy UI
          hm-preview-memo
          :tables
          (filter (comp (schema-filters->fn replication-schema-filters) :table-schema))))
    (catch PatternSyntaxException _
      {:error "Invalid schema pattern"})))

(defn- get-free-quota [quotas]
  (or
   (some->> (m/find-first (comp #{"clickhouse-dwh"} :hosting-feature) quotas)
            ((juxt :soft-limit :usage))
            (apply -))
   -1))

(defn preview-replication
  "Predicate that signals if replication looks right from the quota perspective.

   This predicate checks that the quotas we got from the latest tokencheck have enough space for the database to be
  replicated."
  [quotas tables]
  (let [tables-error               (:error tables)
        tables                     (if tables-error [] tables)
        free-quota                 (get-free-quota quotas)
        replicated-tables          (->> tables
                                        (filter :has-pkey)
                                        (filter :has-ownership))
        tables-without-pk          (filter (comp not :has-pkey) tables)
        tables-without-owner-match (filter (comp not :has-ownership) tables)
        total-estimated-row-count  (or
                                    (some->>
                                     replicated-tables
                                     (map :estimated-row-count)
                                     (remove nil?)
                                     (reduce +))
                                    0)
        errors                     {:no-tables                      (empty? replicated-tables)
                                    :no-quota                       (> total-estimated-row-count free-quota)
                                    :invalid-schema-filters-pattern (boolean tables-error)}]
    (log/infof "Quota left: %s. Estimate db row count: %s" free-quota total-estimated-row-count)
    {:free-quota                 free-quota
     :total-estimated-row-count  total-estimated-row-count
     :errors                     errors
     :can-set-replication        (not (some second errors))
     :replicated-tables          replicated-tables
     :tables-without-pk          tables-without-pk
     :tables-without-owner-match tables-without-owner-match}))

(defn- m->schema-filter [m]
  (-> m
      (select-keys [:schema-filters-type :schema-filters-patterns])
      (set/rename-keys {:schema-filters-type :type, :schema-filters-patterns :patterns})))

(defn- ->secret [{:keys [details]} & {:as replication-schema-filters}]
  (let [dbname         (or (:dbname details) (:db details))
        credentials    (-> details
                           (select-keys [:host :user :password :port])
                           (update :port #(or % 5432)) ;; port is required in the API, but optional in MB
                           (merge {:dbname dbname
                                   :dbtype "postgresql"}))
        schema-filters (->> [(m->schema-filter details)
                             (m->schema-filter replication-schema-filters)]
                            (filterv not-empty))]
    {:credentials    credentials
     :schema-filters schema-filters}))

(def ^:private body-schema
  [:map
   [:replicationSchemaFilters
    {:optional true}
    [:map
     [:schema-filters-type [:enum "inclusion" "exclusion" "all"]]
     [:schema-filters-patterns :string]]]])

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/connection/:database-id/preview"
  "Return info about pg-replication connection that is about to be created."
  [{:keys [database-id]} :- [:map [:database-id ms/PositiveInt]] _ {:keys [replicationSchemaFilters]} :- body-schema]
  (let [database (t2/select-one :model/Database :id database-id)
        secret (->secret database)
        replication-schema-filters (m->schema-filter replicationSchemaFilters)]
    (u/recursive-map-keys u/->camelCaseEn (preview-replication (premium-features/quotas) (preview-tables secret replication-schema-filters)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/connection/:database-id"
  "Create a new PG replication connection for the specified database."
  [{:keys [database-id]} :- [:map [:database-id ms/PositiveInt]] _ {:keys [replicationSchemaFilters]} :- body-schema]
  (api/check-400 (database-replication.settings/database-replication-enabled) "PG replication integration is not enabled.")
  (let [database   (t2/select-one :model/Database :id database-id)
        db-details (:details database)]
    (api/check-404 database)
    (api/check-400 (= :postgres (:engine database)) "PG replication is only supported for PostgreSQL databases.")
    (api/check-400 (not (:tunnel-enabled db-details)) "PG replication is not supported with SSH Tunnel.")
    (api/check-400 (not (or (:ssl-client-cert db-details) (:ssl-root-cert db-details)))
                   "PG replication is not supported with root or client certificates.")
    (let [conns (pruned-database-replication-connections)]
      (api/check-400 (not (database-id->connection-id conns database-id)) "Database already has an active replication connection.")
      (let [secret (->secret database replicationSchemaFilters)]
        (if (:can-set-replication (preview-replication (premium-features/quotas) (preview-tables secret)))
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
          (api/check-400 false "Not enough quota"))))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
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
