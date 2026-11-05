(ns metabase.prototype.runtime-estimate
  "Prototype: an estimate of how long a query runs, from the past runs in `query_execution`. A saved question uses
  the runs of that question. Other queries use the runs of all queries on the same source table.

  A new instance has no runs, so Metabase seeds some: a demo question with its own runs, and runs for each table of
  the prototype dataset. The seeded runtimes follow the same distribution as the delays of
  [[metabase.prototype.slow-queries]], so the estimates agree with what the user sees."
  (:require
   [buddy.core.hash :as buddy-hash]
   [metabase.app-db.core :as mdb]
   [metabase.collections.core :as collections]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.prototype.dataset :as dataset]
   [metabase.prototype.db :as prototype.db]
   [metabase.prototype.settings :as prototype.settings]
   [metabase.prototype.slow-queries :as slow-queries]
   [metabase.queries.core :as queries]
   [metabase.request.core :as request]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.time OffsetDateTime)
   (java.util Random)))

(set! *warn-on-reflection* true)

(def ^:private history-days 90)

(def ^:private min-runs
  "Fewer runs than this give no estimate."
  3)

(def ^:private run-filter
  "Runs that tell how long the query took on the database: no cached results, no errors, and no queries on the
  samples of the slow tables."
  (str "coalesce(e.cache_hit, false) = false AND e.error IS NULL"
       " AND e.started_at > now() - interval '" history-days " days'"))

(defn- query-running-times [sql-params]
  (with-open [conn (jdbc/get-connection (mdb/data-source))]
    (mapv :running_time (jdbc/execute! conn sql-params {:builder-fn jdbc.rs/as-unqualified-lower-maps}))))

(defn- card-running-times [card-id]
  (query-running-times
   [(str "SELECT e.running_time FROM query_execution e WHERE e.card_id = ? AND " run-filter
         " ORDER BY e.started_at DESC LIMIT 200")
    card-id]))

(defn- table-running-times [table-id]
  (query-running-times
   [(str "SELECT e.running_time FROM query_execution e JOIN query q ON q.query_hash = e.hash
          WHERE coalesce(q.query::jsonb #>> '{stages,0,source-table}',
                         q.query::jsonb #>> '{query,source-table}') = ?
            AND coalesce(q.query::jsonb #>> '{middleware,prototype-sample?}', 'false') <> 'true'
            AND " run-filter
         " ORDER BY e.started_at DESC LIMIT 300")
    (str table-id)]))

(defn- percentile [sorted p]
  (nth sorted (min (dec (count sorted)) (long (Math/floor (* p (count sorted)))))))

(defn estimate
  "How long a query usually runs: the median and the 90th percentile of its past runs, in milliseconds. `:basis` is
  \"question\" when the runs are runs of the saved question `card-id`, and \"table\" when they are runs of all
  queries on `table-id`. Returns `{:basis nil}` when there are too few runs."
  [{:keys [card-id table-id]}]
  (let [[basis times] (or (when card-id
                            (let [times (card-running-times card-id)]
                              (when (>= (count times) min-runs) ["question" times])))
                          (when table-id
                            (let [times (table-running-times table-id)]
                              (when (>= (count times) min-runs) ["table" times]))))]
    (if basis
      (let [sorted (vec (sort times))]
        {:basis     basis
         :run_count (count sorted)
         :days      history-days
         :p50_ms    (percentile sorted 0.5)
         :p90_ms    (percentile sorted 0.9)})
      {:basis nil})))

;;; ------------------------------------------------ Seeded history ------------------------------------------------

(def ^:private seed-version
  "Increment it to seed the history again on existing instances. A new seed adds runs; it does not remove the old
  ones."
  1)

(def ^:private collection-name "Runtime estimates")

(def ^:private demo-question-name "Purchases by device")

(def ^:private fast-table-ms
  "Runtimes of queries on the fast tables: from 60 ms to about 400 ms."
  [60 340])

(defn- seeded-running-time [^Random r table-names]
  (let [overhead (+ 60 (.nextInt r 240))]
    (if (some dataset/slow-table-names table-names)
      (+ overhead (slow-queries/delay-ms table-names (.nextDouble r)))
      (let [[lo spread] fast-table-ms]
        (+ lo (long (* spread (Math/pow (.nextDouble r) 2))))))))

(defn- insert-runs!
  "Insert `n` runs of `dataset-query` over the past 60 days, with the `query` row that tells their source table."
  [conn ^Random r {:keys [n card-id database-id executor-id dataset-query table-names hash-key]}]
  (let [query-hash (buddy-hash/sha256 (str "prototype-runtime-seed/" hash-key))
        times      (vec (repeatedly n #(seeded-running-time r table-names)))
        now        (OffsetDateTime/now)]
    (jdbc/execute! conn ["INSERT INTO query (query_hash, average_execution_time, query) VALUES (?, ?, ?)
                          ON CONFLICT (query_hash) DO NOTHING"
                         query-hash (long (/ (reduce + times) n)) (json/encode dataset-query)])
    (doseq [running-time times]
      (jdbc/execute! conn ["INSERT INTO query_execution
                              (hash, started_at, running_time, result_rows, native, context, executor_id, card_id,
                               database_id, cache_hit)
                            VALUES (?, ?, ?, ?, false, ?, ?, ?, ?, false)"
                           query-hash
                           (.minusSeconds now (.nextInt r (* 60 24 3600)))
                           running-time
                           (+ 5 (.nextInt r 2000))
                           (if card-id "question" "ad-hoc")
                           executor-id
                           card-id
                           database-id]))))

(defn- create-demo-question! [mp table-ids admin-id]
  (let [table-id      (get table-ids "web_events")
        field-ids     (prototype.db/field-ids-by-name table-id)
        field         #(lib.metadata/field mp (get field-ids %))
        collection-id (or (prototype.db/root-collection-id-by-name collection-name)
                          (:id (collections/create-collection! {:name collection-name})))
        query         (-> (lib/query mp (lib.metadata/table mp table-id))
                          (lib/filter (lib/= (field "event_type") "purchase"))
                          (lib/filter (lib/= (field "is_bot") false))
                          (lib/aggregate (lib/count))
                          (lib/breakout (field "device")))]
    (queries/create-card! {:name                   demo-question-name
                           :display                :bar
                           :dataset_query          query
                           :visualization_settings {}
                           :collection_id          collection-id}
                          {:id admin-id})))

(defn- seed! [database-id admin-id]
  (let [mp        (lib-be/application-database-metadata-provider database-id)
        table-ids (prototype.db/table-ids-by-name database-id dataset/schema-name)
        card      (create-demo-question! mp table-ids admin-id)
        r         (Random. 42)]
    (with-open [conn (jdbc/get-connection (mdb/data-source))]
      (jdbc/with-transaction [tx conn]
        (insert-runs! tx r {:n             46
                            :card-id       (:id card)
                            :database-id   database-id
                            :executor-id   admin-id
                            :dataset-query (:dataset_query card)
                            :table-names   #{"web_events"}
                            :hash-key      (str "card/" (:id card))})
        (doseq [{table-name :name} dataset/tables
                :let  [table-id (get table-ids table-name)]
                :when table-id]
          (insert-runs! tx r {:n             (+ 20 (.nextInt r 30))
                              :database-id   database-id
                              :executor-id   admin-id
                              :dataset-query {:lib/type "mbql/query"
                                              :database database-id
                                              :stages   [{:lib/type     "mbql.stage/mbql"
                                                          :source-table table-id}]}
                              :table-names   #{table-name}
                              :hash-key      (str "table/" table-name)}))))))

(defn ensure-seeded!
  "Seed the demo question and the history of runs when they are out of date. Does nothing when there is no prototype
  Database or no admin yet."
  []
  (let [database-id (prototype.db/prototype-database-id)
        admin-id    (prototype.db/first-admin-id)]
    (when (and database-id admin-id
               (< (or (prototype.settings/prototype-runtime-seed-version) 0) seed-version))
      (log/info "Prototype data: seeding the history of query runtimes")
      (request/with-current-user admin-id
        (seed! database-id admin-id))
      (prototype.settings/prototype-runtime-seed-version! seed-version)
      (log/info "Prototype data: history of query runtimes ready"))))
