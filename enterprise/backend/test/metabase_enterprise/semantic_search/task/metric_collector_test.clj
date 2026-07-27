(ns metabase-enterprise.semantic-search.task.metric-collector-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.dlq :as semantic.dlq]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.task.metric-collector :as semantic.task.collector]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase-enterprise.semantic-search.util :as semantic.u]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.search.index-health :as search.index-health]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]))

(use-fixtures :once #'semantic.tu/once-fixture)

(defn- readiness-gauges
  "Every readiness gauge for both storage labels, as `{storage {:available _ :connected _ :last-success _}}`."
  [system]
  (into {}
        (for [storage ["external" "app-db"]]
          [storage {:available    (mt/metric-value system :metabase-search/pgvector-store-available
                                                   {:storage storage})
                    :connected    (mt/metric-value system :metabase-search/pgvector-store-connected
                                                   {:storage storage})
                    :last-success (mt/metric-value
                                   system :metabase-search/pgvector-store-last-success-timestamp-seconds
                                   {:storage storage})}])))

(deftest pgvector-readiness-metrics-test
  (mt/with-prometheus-system! [_ system]
    (testing "an instance without any pgvector backend is explicitly not ready"
      (mt/with-dynamic-fn-redefs
        [semantic.db.datasource/dedicated-url-configured?   (constantly false)
         semantic.db.datasource/pgvector-mode               (constantly :unavailable)
         semantic.db.datasource/probe-dedicated-connection! #(throw (ex-info "should not connect" {}))]
        (@#'semantic.task.collector/collect-pgvector-readiness-metrics!)
        (is (=? {"external" {:available zero?, :connected zero?}
                 "app-db"   {:available zero?, :connected zero?}}
                (readiness-gauges system)))))
    (testing "a connected external store is available and healthy"
      (mt/with-dynamic-fn-redefs
        [semantic.db.datasource/dedicated-url-configured?   (constantly true)
         semantic.db.datasource/probe-dedicated-connection! (constantly {:one 1})]
        (@#'semantic.task.collector/collect-pgvector-readiness-metrics!))
      (is (=? {"external" {:available #(== 1 %), :connected #(== 1 %), :last-success pos?}
               "app-db"   {:available zero?, :connected zero?}}
              (readiness-gauges system)))
      (let [last-success (get-in (readiness-gauges system) ["external" :last-success])]
        (testing "a later failure clears connected but preserves the last-success timestamp"
          (mt/with-dynamic-fn-redefs
            [semantic.db.datasource/dedicated-url-configured?   (constantly true)
             semantic.db.datasource/probe-dedicated-connection! #(throw (ex-info "probe failed" {}))]
            (@#'semantic.task.collector/collect-pgvector-readiness-metrics!))
          (is (=? {"external" {:available #(== 1 %), :connected zero?, :last-success #(== last-success %)}}
                  (readiness-gauges system))))))
    (testing "a connected app-db pgvector store is available and healthy"
      (mt/with-dynamic-fn-redefs
        [semantic.db.datasource/dedicated-url-configured? (constantly false)
         semantic.u/semantic-search-configured?           (constantly true)
         semantic.db.datasource/pgvector-mode             (constantly :app-db)
         semantic.db.datasource/probe-app-db-store!       (constantly true)]
        (@#'semantic.task.collector/collect-pgvector-readiness-metrics!))
      (is (=? {"external" {:available zero?, :connected zero?}
               "app-db"   {:available #(== 1 %), :connected #(== 1 %), :last-success pos?}}
              (readiness-gauges system))))
    (testing "an app-db store whose vector extension went away reads available but disconnected"
      (mt/with-dynamic-fn-redefs
        [semantic.db.datasource/dedicated-url-configured? (constantly false)
         semantic.u/semantic-search-configured?           (constantly true)
         semantic.db.datasource/pgvector-mode             (constantly :app-db)
         semantic.db.datasource/probe-app-db-store!       (constantly false)]
        (@#'semantic.task.collector/collect-pgvector-readiness-metrics!))
      (is (=? {"app-db" {:available #(== 1 %), :connected zero?}}
              (readiness-gauges system))))))

(deftest pgvector-readiness-skips-unlicensed-app-db-probe-test
  (testing "an unlicensed instance never resolves pgvector-mode, whose app-db arm probes the app db"
    (mt/with-premium-features #{}
      (mt/with-prometheus-system! [_ system]
        (mt/with-dynamic-fn-redefs
          [semantic.db.datasource/dedicated-url-configured? (constantly false)
           semantic.db.datasource/pgvector-mode             #(throw (ex-info "must not probe" {}))]
          (@#'semantic.task.collector/collect-pgvector-readiness-metrics!)
          (is (=? {"external" {:available zero?, :connected zero?}
                   "app-db"   {:available zero?, :connected zero?}}
                  (readiness-gauges system))))))))

(defn- fresh-probe
  [m]
  (assoc m :at (quot (t/to-millis-from-epoch (t/instant)) 1000)))

(deftest pgvector-store-health-check-test
  (let [check    @#'semantic.task.collector/pgvector-store-health-check
        probe    @#'semantic.task.collector/last-readiness-probe
        collects (atom 0)]
    (mt/with-dynamic-fn-redefs
      [semantic.task.collector/collect-pgvector-readiness-metrics! #(swap! collects inc)]
      (testing "a fresh probe is reported as-is, without running another"
        (reset! probe (fresh-probe {:storage nil, :connected? false}))
        (is (nil? (check)) "omitted when there is no store to reach")
        (reset! probe (fresh-probe {:storage "external", :connected? true}))
        (is (=? {:health 100, :message #"pgvector store \(external\) reachable\."} (check)))
        (reset! probe (fresh-probe {:storage "app-db", :connected? false}))
        (is (=? {:health 0, :message #"pgvector store \(app-db\) unreachable\."} (check)))
        (is (zero? @collects)))
      (testing "a missing or stale probe is refreshed, so an unscraped instance still reports"
        (reset! probe nil)
        (check)
        (reset! probe {:storage "external", :connected? true, :at 0})
        (check)
        (is (= 2 @collects))))))

(deftest ^:sequential pull-collector-refreshes-pgvector-metrics-on-each-instance-test
  (let [initialized? @#'semantic.task.collector/pgvector-readiness-metrics-initialized?
        running?     @#'semantic.task.collector/pgvector-readiness-refresh-running?
        collector    (analytics.core/pull-collector
                      :metabase-enterprise.semantic-search.task.metric-collector/pgvector-readiness-gauges)
        gauge-calls  (atom [])
        refreshes    (atom 0)
        submitted    (atom [])]
    (try
      (reset! initialized? false)
      (reset! running? false)
      (mt/with-dynamic-fn-redefs
        [semantic.db.datasource/dedicated-url-configured?            (constantly true)
         analytics/set-gauge!                                        #(swap! gauge-calls conj (vec %&))
         semantic.task.collector/collect-pgvector-readiness-metrics! #(swap! refreshes inc)
         semantic.task.collector/submit-pgvector-readiness-refresh!  #(swap! submitted conj %)]
        ((:f collector))
        ((:f collector))
        (is (= 4 (count @gauge-calls)) "the first scrape initializes both storage series")
        (is (= 1 (count @submitted)) "overlapping scrapes share one local refresh")
        (is (zero? @refreshes) "the database probe does not run on the synchronous scrape path")
        ((first @submitted)))
      (is (= 3600 (:min-interval-s collector)))
      (is (= 1 @refreshes))
      (is (false? @running?))
      (finally
        (reset! initialized? false)
        (reset! running? false)))))

(defn- create-test-tables!
  [pgvector index-metadata model]
  (semantic.index-metadata/create-tables-if-not-exists! pgvector index-metadata)
  (semantic.index-metadata/ensure-control-row-exists! pgvector index-metadata)
  (semantic.pgvector-api/initialize-index! pgvector index-metadata model nil #_{:force-reset? true}))

(defn- drop-test-tables!
  [pgvector index-metadata]
  (let [ai (semantic.index-metadata/get-active-index-state pgvector index-metadata)]
    (semantic.dlq/drop-dlq-table-if-exists! pgvector index-metadata (-> ai :metadata-row :id))
    (semantic.index/drop-index-table! pgvector (:index ai))
    (semantic.index-metadata/drop-tables-if-exists! pgvector index-metadata)))

(defn- mock-documents-into-gate-table!
  [pgvector index-metadata documents]
  (jdbc/execute!
   pgvector
   (sql/format {:insert-into [[:raw (:gate-table-name index-metadata)]]
                :columns [:id :model :model_id :updated_at]
                :values documents})))

(defn- mock-documents-into-dlq-table!
  [pgvector index-metadata docs]
  (let [active-index (semantic.index-metadata/get-active-index-state pgvector index-metadata)
        dlq-table-kw (semantic.dlq/dlq-table-name-kw
                      index-metadata
                      (-> active-index :metadata-row :id))]
    (jdbc/execute!
     pgvector
     (sql/format {:insert-into dlq-table-kw
                  :columns [:gate_id :retry_count :attempt_at :last_attempted_at :error_gated_at]
                  :values docs}))))

(defn- drop-dlq-table-entries!
  [pgvector index-metadata]
  (let [active-index (semantic.index-metadata/get-active-index-state pgvector index-metadata)
        dlq-table-kw (semantic.dlq/dlq-table-name-kw
                      index-metadata
                      (-> active-index :metadata-row :id))]
    (jdbc/execute!
     pgvector
     (sql/format {:delete-from dlq-table-kw}))))

(defn- drop-gate-table-entries!
  [pgvector index-metadata]
  (jdbc/execute!
   pgvector
   (sql/format {:delete-from [[:raw (:gate-table-name index-metadata)]]})))

(deftest shared-index-metrics-survive-semantic-collector-failure-test
  (let [refreshes (atom 0)]
    (mt/with-dynamic-fn-redefs
      [semantic.u/semantic-search-active?                (constantly true)
       semantic.env/get-pgvector-datasource!             #(throw (ex-info "pgvector unavailable" {}))
       search.index-health/refresh-search-index-metrics! #(swap! refreshes inc)]
      (@#'semantic.task.collector/collect-metrics!)
      (is (= 1 @refreshes)))))

(deftest interrupted-semantic-collector-skips-shared-refresh-test
  (let [refreshes (atom 0)]
    (mt/with-dynamic-fn-redefs
      [semantic.u/semantic-search-active?                (constantly true)
       semantic.env/get-pgvector-datasource!             #(throw (InterruptedException.))
       search.index-health/refresh-search-index-metrics! #(swap! refreshes inc)]
      (is (thrown? InterruptedException (@#'semantic.task.collector/collect-metrics!)))
      (is (zero? @refreshes)))))

(deftest metric-collector-test
  (mt/with-premium-features #{:semantic-search}
    (mt/with-prometheus-system! [_ system]
      (let [pgvector       (semantic.env/get-pgvector-datasource!)
            index-metadata (semantic.tu/unique-index-metadata)
            model semantic.tu/mock-embedding-model]
        (mt/with-dynamic-fn-redefs
          [semantic.env/get-index-metadata             (constantly index-metadata)
           semantic.env/get-configured-embedding-model (constantly model)
           ;; supported? requires a configured embedder for engine selection
           semantic.embedding/get-configured-model     (constantly model)
           ;; collect-metrics! only runs when semantic is the active engine; pin it so a sibling test
           ;; leaking the search-engine setting can't make this read 0
           semantic.u/semantic-search-active?          (constantly true)]
          (testing "Missing tables are handled gracefully"
            (let [result (try
                           (@#'semantic.task.collector/collect-metrics!)
                           :success
                           (catch Throwable _
                             :failure))]
              (is (= :success result))))
          (try
            (create-test-tables! pgvector index-metadata model)
            (mock-documents-into-gate-table!
             pgvector index-metadata
             [["a" "b" "c" (t/zoned-date-time)]
              ["d" "e" "f" (t/zoned-date-time)]])
            (mock-documents-into-dlq-table!
             pgvector index-metadata
             [["a" 1 (t/zoned-date-time) (t/zoned-date-time) (t/zoned-date-time)]
              ["b" 2 (t/zoned-date-time) (t/zoned-date-time) (t/zoned-date-time)]
              ["c" 3 (t/zoned-date-time) (t/zoned-date-time) (t/zoned-date-time)]])
            (testing "Metrics after insertion into gate and dlq"
              (@#'semantic.task.collector/collect-metrics!)
              (is (== 2 (mt/metric-value system :metabase-search/semantic-gate-size)))
              (is (== 3 (mt/metric-value system :metabase-search/semantic-dlq-size))))
            (drop-gate-table-entries! pgvector index-metadata)
            (drop-dlq-table-entries! pgvector index-metadata)
            (testing "Metrics after deletion from gate and dlq"
              (@#'semantic.task.collector/collect-metrics!)
              (is (== 0 (mt/metric-value system :metabase-search/semantic-gate-size)))
              (is (== 0 (mt/metric-value system :metabase-search/semantic-dlq-size))))
            (finally
              (drop-test-tables! pgvector index-metadata))))))))
