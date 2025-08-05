(ns metabase-enterprise.database-replication.api
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.database-replication.settings :as database-replication.settings]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.premium-features.core :refer [quotas]]
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

(defn- token-check-quotas-info
  "Predicate that signals if replication looks right from the quota perspective.

   This predicate checks that the quotas we got from the latest tokencheck have enough space for the database to be
  replicated."
  [database schemas]
  (let [all-quotas                (quotas)
        free-quota                (or
                                   (some->> (m/find-first (comp #{"clickhouse-dwh"} :hosting-feature) all-quotas)
                                            ((juxt :soft-limit :usage))
                                            (apply -))
                                   -1)
        include-patterns          (->> schemas
                                       (filter (comp #{"include"} :type))
                                       (map (comp re-pattern :pattern)))
        exclude-patterns          (->> schemas
                                       (filter (comp #{"exclude"} :type))
                                       (map (comp re-pattern :pattern)))
        db-tables                 (some->> (t2/hydrate database [:tables :fields]) :tables) ; sanitized name
        sanitized-tables          (some->> db-tables
                                           (filter (comp (fn [x] (re-matches #"^[A-Za-z0-9_]+$" x)) :name))
                                           (filter (fn [{:keys [schema]}]
                                                     (cond
                                                       (empty? schemas)
                                                       true
                                                       (not-empty include-patterns)
                                                       (some #(re-matches % schema) include-patterns)
                                                       (not-empty exclude-patterns)
                                                       (not (some #(re-matches % schema) exclude-patterns))))))
        {tables-without-pk false
         tables-with-pk    true}  (group-by (fn [t] (boolean (some (comp #{:type/PK} :semantic_type) (:fields t))))
                                          sanitized-tables)
        total-estimated-row-count (or
                                   (some->>
                                    tables-with-pk
                                    (map :estimated_row_count)
                                    (remove nil?)
                                    (reduce +))
                                   0)]
    (log/infof "Quota left: %s. Estimate db row count: %s" free-quota total-estimated-row-count)
    {:free-quota                free-quota
     :total-estimated-row-count total-estimated-row-count
     :can-set-replication       (< total-estimated-row-count free-quota)
     :all-quotas                all-quotas
     :tables-without-pk         (map #(select-keys % [:name]) tables-without-pk)}))

(api.macros/defendpoint :get "/connection/:database-id/preview"
  "Return info about pg-replication connection that is about to be created."
  [{:keys [database-id]} :- [:map [:database-id ms/PositiveInt]]
   query-params]
  (token-check-quotas-info (t2/select-one :model/Database :id database-id) (:parameters query-params)))

(defn can-set-replication?
  "Predicate that signals if replication looks right from the quota perspective.

   This predicate checks that the quotas we got from the latest tokencheck have enough space for the database to be
  replicated."
  [database schemas]
  (:can-set-replication (token-check-quotas-info database schemas)))

(api.macros/defendpoint :post "/connection/:database-id"
  "Create a new PG replication connection for the specified database."
  ;; FIXME: First arg is route params, 2nd arg is query params, 3rd arg is body params:
  [{:keys [database-id]} :- [:map [:database-id ms/PositiveInt]]
   _query-params
   {:keys [schemas]} :- [:map
                         [:schemas {:optional true} [:sequential
                                                     [:map
                                                      [:type [:enum "include" "exclude"]]
                                                      [:pattern :string]]]]]]
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
            schemas     (-> (when-some [k ({"inclusion" :include, "exclusion" :exclude} schema-filters-type)]
                              (for [pattern (str/split schema-filters-patterns #",")]
                                {:type k :pattern pattern}))
                            (concat (map #(select-keys % [:type :pattern]) schemas))
                            not-empty)
            secret      {:credentials (merge {:dbtype "postgresql"} credentials)
                         :schemas     schemas}]
        (if (can-set-replication? database schemas)
          (let [{:keys [id]} (hm.client/call :create-connection, :type "pg_replication", :secret secret)
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
