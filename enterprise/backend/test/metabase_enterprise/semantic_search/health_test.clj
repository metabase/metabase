(ns metabase-enterprise.semantic-search.health-test
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.dlq :as semantic.dlq]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.embedding-health :as embedding-health]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.health :as semantic.health]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.analytics-interface.core :as analytics]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.search.index-health :as search.index-health]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private embedding-model
  {:provider "ai-service", :model-name "test-model", :vector-dimensions 3})

(def ^:private active-state
  {:index {:table-name "index_test_table", :embedding-model embedding-model}
   :metadata-row {:id 1
                  :indexer_stalled_at nil
                  :repair_orphan_count nil
                  :repair_snapshot_at nil}})

(defn- do-with-enabled!
  "Run `thunk` with the semantic engine active and the pgvector accessors stubbed to harmless values, so
  each test only has to override the signal it cares about."
  [thunk]
  (mt/with-dynamic-fn-redefs
    [semantic.util/semantic-search-active? (constantly true)
     semantic.env/get-pgvector-datasource! (constantly ::pgvector)
     semantic.env/get-index-metadata       (constantly ::index-metadata)
     semantic.env/get-configured-embedding-model (constantly embedding-model)
     semantic.settings/semantic-search-vector-strategy (constantly :brute-force)
     embedding-health/request-circuit-recovery! (constantly nil)]
    (thunk)))

(deftest not-enabled-is-omitted-test
  (testing "an inactive engine (unlicensed, unconfigured, or another engine selected) -> nil (omitted, not a
           misleading 'No active semantic search index' incident)"
    (mt/with-dynamic-fn-redefs [semantic.util/semantic-search-active? (constantly false)]
      (is (nil? (semantic.health/index-health-check))))))

(deftest pgvector-unreachable-test
  (testing "a pgvector error while resolving the active index reports as degraded, not as no-index"
    (do-with-enabled!
     (fn []
       (mt/with-dynamic-fn-redefs
         [semantic.index-metadata/get-active-index-state (fn [& _] (throw (ex-info "connection refused" {})))]
         (is (=? {:health 0 :message #".*pgvector store unreachable: connection refused.*"}
                 (semantic.health/index-health-check))))))))

(deftest health-probes-propagate-interruption-test
  (testing "active-index lookup interruption propagates"
    (do-with-enabled!
     (fn []
       (mt/with-dynamic-fn-redefs
         [semantic.index-metadata/get-active-index-state (fn [& _] (throw (InterruptedException.)))]
         (is (thrown? InterruptedException (semantic.health/index-health-check)))))))
  (testing "queryability probe interruption propagates"
    (mt/with-dynamic-fn-redefs [jdbc/execute-one! (fn [& _] (throw (InterruptedException.)))]
      (is (thrown? InterruptedException
                   (#'semantic.health/active-index-queryable? ::pgvector "index_table"))))))

(deftest metric-active-index-requires-queryable-table-test
  (do-with-enabled!
   (fn []
     (mt/with-dynamic-fn-redefs
       [semantic.index-metadata/get-active-index-state (constantly active-state)
        semantic.health/active-index-queryable?        (constantly false)]
       (is (nil? (#'semantic.health/active-index*)))))))

(deftest no-active-index-test
  (testing "enabled but no active index -> degraded"
    (do-with-enabled!
     (fn []
       (mt/with-dynamic-fn-redefs
         [semantic.index-metadata/get-active-index-state (constantly nil)]
         (is (=? {:health 0 :message #"No active semantic search index\."}
                 (semantic.health/index-health-check))))))))

(deftest healthy-test
  (testing "active + queryable + un-stalled + embedder reachable -> healthy 100"
    (do-with-enabled!
     (fn []
       (mt/with-dynamic-fn-redefs
         [semantic.index-metadata/get-active-index-state (constantly active-state)
          semantic.health/active-index-queryable?        (constantly true)
          semantic.embedding/embedder-circuit-untrusted?  (constantly false)
          embedding-health/embedding-service-reachable?   (constantly {:reachable? true :error nil})]
         (is (=? {:health 100 :message #"Semantic search index active.*serving\."}
                 (semantic.health/index-health-check))))))))

(deftest degraded-conditions-test
  (do-with-enabled!
   (fn []
     (testing "a stalled indexer degrades and names the stall"
       (mt/with-dynamic-fn-redefs
         [semantic.index-metadata/get-active-index-state
          (constantly (assoc-in active-state [:metadata-row :indexer_stalled_at] "2026-07-07"))
          semantic.health/active-index-queryable?        (constantly true)
          semantic.embedding/embedder-circuit-untrusted?  (constantly false)
          embedding-health/embedding-service-reachable?   (constantly {:reachable? true :error nil})]
         (is (=? {:health 0 :message #".*indexer stalled since 2026-07-07.*"}
                 (semantic.health/index-health-check)))))
     (testing "an unqueryable active table degrades"
       (mt/with-dynamic-fn-redefs
         [semantic.index-metadata/get-active-index-state (constantly active-state)
          semantic.health/active-index-queryable?        (constantly false)
          semantic.embedding/embedder-circuit-untrusted?  (constantly false)
          embedding-health/embedding-service-reachable?   (constantly {:reachable? true :error nil})]
         (is (=? {:health 0 :message #".*active index table not queryable.*"}
                 (semantic.health/index-health-check)))))
     (testing "an index-backed strategy without its HNSW index degrades"
       (mt/with-dynamic-fn-redefs
         [semantic.index-metadata/get-active-index-state       (constantly active-state)
          semantic.health/active-index-queryable?              (constantly true)
          semantic.settings/semantic-search-vector-strategy    (constantly :hnsw)
          semantic.util/index-exists?                          (constantly false)
          semantic.embedding/embedder-circuit-untrusted?       (constantly false)
          embedding-health/embedding-service-reachable?        (constantly {:reachable? true :error nil})]
         (is (=? {:health 0 :message #".*required HNSW index is missing.*"}
                 (semantic.health/index-health-check)))))
     (testing "an active index for a different embedding model degrades without probing the wrong model"
       (mt/with-dynamic-fn-redefs
         [semantic.index-metadata/get-active-index-state
          (constantly (assoc-in active-state [:index :embedding-model :model-name] "old-model"))
          semantic.health/active-index-queryable? (constantly true)
          embedding-health/embedding-problem      #(throw (ex-info "must not probe configured model" {}))]
         (is (=? {:health 0 :message #".*active index embedding model does not match configured model.*"}
                 (semantic.health/index-health-check)))))
     (testing "a non-closed breaker (open or half-open) still probes (so a recovered-but-idle embedder is
              detectable) and degrades identically in both states"
       (let [probed? (atom false)]
         (mt/with-dynamic-fn-redefs
           [semantic.index-metadata/get-active-index-state (constantly active-state)
            semantic.health/active-index-queryable?        (constantly true)
            semantic.embedding/embedder-circuit-untrusted? (constantly true)
            embedding-health/embedding-service-reachable?   (fn [] (reset! probed? true) {:reachable? true})]
           (is (=? {:health 0 :message #".*circuit open \(probe reachable.*"}
                   (semantic.health/index-health-check)))
           (is (true? @probed?) "an open circuit still probes so recovery is detectable"))))
     (testing "an open circuit with an unreachable probe reads the same as unreachable with a closed one --
              state-independent wording, so a flapping breaker's re-persisted rows dedup instead of flooding"
       (mt/with-dynamic-fn-redefs
         [semantic.index-metadata/get-active-index-state (constantly active-state)
          semantic.health/active-index-queryable?        (constantly true)
          semantic.embedding/embedder-circuit-untrusted? (constantly true)
          embedding-health/embedding-service-reachable?   (constantly {:reachable? false :error "boom"})]
         (is (=? {:health 0 :message #".*embedding service unreachable: boom.*"}
                 (semantic.health/index-health-check)))))
     (testing "an unreachable embedder degrades and names the error"
       (mt/with-dynamic-fn-redefs
         [semantic.index-metadata/get-active-index-state (constantly active-state)
          semantic.health/active-index-queryable?        (constantly true)
          semantic.embedding/embedder-circuit-untrusted?  (constantly false)
          embedding-health/embedding-service-reachable?   (constantly {:reachable? false :error "boom"})]
         (is (=? {:health 0 :message #".*embedding service unreachable: boom.*"}
                 (semantic.health/index-health-check))))))))

;; Tests the raw probe (`embedding-service-reachable?` is TTL-memoized, so calling it across cases would
;; return a stale cached result).
;; ^:sequential: redefs the process-global `get-configured-model` / `get-embedding` via with-redefs, so it
;; must not run concurrently with other tests (e.g. entity-retrieval-available? reads get-configured-model).
(deftest ^:sequential probe-embedding-service-test
  (testing "a successful embed reads as reachable; the probe bypasses the breaker and silences snowplow"
    (let [seen (atom nil)]
      ;; get-embedding is a multimethod; with-dynamic-fn-redefs can't patch those, so with-redefs is required.
      (with-redefs [semantic.embedding/get-configured-model (constantly {:model-name "m"})
                    semantic.embedding/get-embedding
                    (fn [_model _text opts]
                      (reset! seen (assoc opts :bypass semantic.embedding/*bypass-circuit-breaker*))
                      [0.1 0.2])]
        (is (=? {:reachable? true :error nil} (#'embedding-health/probe-embedding-service)))
        (is (=? {:bypass true :snowplow? false :record-tokens? false} @seen)
            "the probe runs with the breaker bypassed, snowplow silenced, and tokens unrecorded"))))
  (testing "an embedding failure reads as unreachable and captures the message"
    (with-redefs [semantic.embedding/get-configured-model (constantly {:model-name "m"})
                  semantic.embedding/get-embedding        (fn [& _] (throw (ex-info "connection refused" {})))]
      (is (=? {:reachable? false :error "connection refused"}
              (#'embedding-health/probe-embedding-service))))))

(deftest ^:sequential breaker-transition-probe-cache-test
  (testing "open and half-open transitions reuse the probe; recovery clears it"
    (let [probes (atom 0)]
      ;; get-embedding is a multimethod; with-dynamic-fn-redefs can't patch those, so with-redefs is required.
      (with-redefs [semantic.embedding/get-configured-model (constantly {:model-name "m"})
                    semantic.embedding/get-embedding        (fn [& _] (swap! probes inc) [0.1])]
        (mt/with-dynamic-fn-redefs [health-inspector/run-and-save-check! (constantly nil)]
          (memoize/memo-clear! @#'embedding-health/embedding-service-reachable?*)
          (embedding-health/embedding-service-reachable?)
          (is (= 1 @probes))
          (#'embedding-health/clear-probe-cache-on-recovery! :open)
          (#'embedding-health/clear-probe-cache-on-recovery! :half-open)
          (embedding-health/embedding-service-reachable?)
          (is (= 1 @probes) "an open<->half-open flap rides the cached probe")
          (#'embedding-health/clear-probe-cache-on-recovery! :closed)
          (embedding-health/embedding-service-reachable?)
          (is (= 2 @probes) "recovery busts the cache so the persisted row can't be a stale 'unreachable'")
          (memoize/memo-clear! @#'embedding-health/embedding-service-reachable?*))))))

(deftest ^:sequential circuit-recovery-probe-test
  (testing "recovery runs off-thread and supplies enough successful trials to close an untrusted circuit"
    (let [calls     (atom 0)
          completed (CountDownLatch. 1)
          state     @#'embedding-health/recovery-state
          before    @state]
      (try
        (reset! state {:running? false, :last-start-ns nil})
        (with-redefs [semantic.embedding/get-configured-model (constantly {:model-name "m"})
                      semantic.embedding/get-embedding
                      (fn [& _]
                        (when (= 2 (swap! calls inc))
                          (.countDown completed))
                        [0.1])]
          (mt/with-dynamic-fn-redefs
            [semantic.embedding/embedder-circuit-untrusted? #(< @calls 2)
             embedding-health/schedule-recovery!            future-call]
            (is (nil? (embedding-health/request-circuit-recovery!)))
            (is (.await completed 5 TimeUnit/SECONDS) "recovery trials did not finish")
            (is (= 2 @calls))))
        (finally
          (reset! state before))))))

(deftest semantic-coverage-tracks-live-gate-after-repair-snapshot-test
  (when semantic.db.datasource/db-url
    (let [pgvector    (semantic.db.datasource/ensure-initialized-data-source!)
          suffix      (System/nanoTime)
          index-t     (str "coverage_index_" suffix)
          gate-t      (str "coverage_gate_" suffix)
          snapshot-at (:snapshot_at
                       (jdbc/execute-one! pgvector ["SELECT clock_timestamp() AS snapshot_at"]
                                          {:builder-fn jdbc.rs/as-unqualified-lower-maps}))
          exec!      #(jdbc/execute! pgvector [%])
          coverage   (fn []
                       (mt/with-dynamic-fn-redefs
                         [semantic.health/active-index
                          (constantly {:pgvector pgvector
                                       :state (-> active-state
                                                  (assoc-in [:index :table-name] index-t)
                                                  (assoc-in [:metadata-row :repair_orphan_count] 0)
                                                  (assoc-in [:metadata-row :repair_snapshot_at]
                                                            snapshot-at))})
                          semantic.env/get-index-metadata (constantly {:gate-table-name gate-t})]
                         (#'semantic.health/semantic-coverage)))]
      (try
        (exec! (format "CREATE TABLE \"%s\" (model text, model_id text)" index-t))
        (exec! (format "CREATE TABLE \"%s\" (model text, model_id text, document_hash text)" gate-t))
        (exec! (format "INSERT INTO \"%s\" VALUES ('card','a','ha'),('card','b','hb')" gate-t))
        (exec! (format "INSERT INTO \"%s\" VALUES ('card','a')" index-t))
        (testing "coverage starts from the live gate and active index"
          (is (=? {:value 0.5, :health 50, :message "1 of 2 expected items indexed (50%)."}
                  (coverage))))
        (testing "a post-repair addition lowers coverage until it is indexed"
          (exec! (format "INSERT INTO \"%s\" VALUES ('card','c','hc')" gate-t))
          (is (=? {:health 33, :message "1 of 3 expected items indexed (33%)."} (coverage)))
          (exec! (format "INSERT INTO \"%s\" VALUES ('card','c')" index-t))
          (is (=? {:health 67, :message "2 of 3 expected items indexed (67%)."} (coverage))))
        (testing "a tombstone leaves coverage immediately even while its index row lingers"
          (exec! (format "UPDATE \"%s\" SET document_hash = NULL WHERE model_id = 'a'" gate-t))
          (is (=? {:value 0.5, :health 50, :message "1 of 2 expected items indexed (50%)."}
                  (coverage))))
        (testing "an orphan cannot inflate the numerator"
          (exec! (format "INSERT INTO \"%s\" VALUES ('card','orphan')" index-t))
          (is (=? {:value 0.5, :health 50, :message "1 of 2 expected items indexed (50%)."}
                  (coverage))))
        (finally
          (exec! (format "DROP TABLE IF EXISTS \"%s\"" index-t))
          (exec! (format "DROP TABLE IF EXISTS \"%s\"" gate-t)))))))

(deftest semantic-coverage-requires-a-fresh-database-aged-repair-test
  (testing "no successful repair snapshot -> coverage is unknown without querying"
    (mt/with-dynamic-fn-redefs
      [semantic.health/active-index (constantly {:pgvector ::pgvector, :state active-state})
       semantic.health/scalar-row   #(throw (ex-info "must not query" {}))]
      (is (nil? (#'semantic.health/semantic-coverage)))))
  (testing "future-skewed and expired snapshots are unknown, never healthy"
    (doseq [age [-1 10801]]
      (let [queries (atom [])]
        (mt/with-dynamic-fn-redefs
          [semantic.health/active-index
           (constantly {:pgvector ::pgvector
                        :state (assoc-in active-state [:metadata-row :repair_snapshot_at] ::snapshot-at)})
           semantic.env/get-index-metadata (constantly {:gate-table-name "index_gate"})
           semantic.health/scalar-row       (fn [_ sql]
                                              (swap! queries conj sql)
                                              {:indexed 1, :expected 1, :repair_age age})]
          (is (nil? (#'semantic.health/semantic-coverage))))
        (is (= ::snapshot-at (-> @queries first second))
            "the pgvector query receives the persisted database timestamp")
        (is (re-find #"clock_timestamp" (-> @queries first first))
            "repair age and coverage populations share one database statement")))))

(deftest semantic-staleness-composite-watermark-test
  ;; Hermetic: an ad-hoc gate table stands in, exercising the composite (gated_at, id) watermark SQL.
  (when semantic.db.datasource/db-url
    (let [pgvector  (semantic.db.datasource/ensure-initialized-data-source!)
          gate-t    (str "staleness_gate_" (System/nanoTime))
          wm-ts     (t/offset-date-time "2026-01-01T12:00:00Z")
          staleness (fn [metadata-row]
                      (mt/with-dynamic-fn-redefs
                        [semantic.health/active-index    (constantly {:pgvector pgvector
                                                                      :state    {:metadata-row metadata-row}})
                         semantic.env/get-index-metadata (constantly {:gate-table-name       gate-t
                                                                      :index-table-qualifier "%s"})]
                        (#'semantic.health/semantic-staleness)))
          backlog   (fn [result] (or (some->> (:message result) (re-find #"(\d+) change\(s\)") second parse-long) 0))]
      (try
        (jdbc/execute! pgvector [(format "CREATE TABLE \"%s\" (id text, gated_at timestamptz)" gate-t)])
        (jdbc/execute! pgvector [(format (str "INSERT INTO \"%s\" VALUES "
                                              "('a', timestamptz '2026-01-01 11:00:00+00'), "
                                              "('b', timestamptz '2026-01-01 12:00:00+00'), "
                                              "('c', timestamptz '2026-01-01 12:00:00+00')")
                                         gate-t)])
        (testing "rows at the watermark timestamp with a later id are pending -- a timestamp-only bound
                 would hide them and read a stalled indexer as current"
          (is (= 1 (backlog (staleness {:id 7, :indexer_last_seen wm-ts :indexer_last_seen_id "b"})))))
        (testing "a nil watermark (indexer never ran) reads everything as pending"
          (is (= 3 (backlog (staleness {:id 7, :indexer_last_seen nil :indexer_last_seen_id nil})))))
        (testing "a timestamp-only watermark (no id) treats same-timestamp rows as pending"
          (is (= 2 (backlog (staleness {:id 7, :indexer_last_seen wm-ts :indexer_last_seen_id nil})))))
        (testing "a watermark past every row reads current"
          (is (=? {:value 0, :health 100, :message #"Index current\."}
                  (staleness {:id 7
                              :indexer_last_seen (t/plus wm-ts (t/hours 1))
                              :indexer_last_seen_id ""}))))
        (finally
          (jdbc/execute! pgvector [(format "DROP TABLE IF EXISTS \"%s\"" gate-t)]))))))

(deftest semantic-staleness-includes-active-dlq-test
  (let [rows    (atom [{:pending 0, :age nil, :observed_at ::observed-at}
                       {:pending 1, :age 25200}])
        queries (atom [])]
    (mt/with-dynamic-fn-redefs
      [semantic.health/active-index
       (constantly {:pgvector ::pgvector
                    :state {:metadata-row {:id 7, :indexer_last_seen nil, :indexer_last_seen_id nil}}})
       semantic.env/get-index-metadata (constantly {:gate-table-name "index_gate"
                                                    :index-table-qualifier "%s"})
       semantic.dlq/dlq-table-exists?  (constantly true)
       semantic.health/scalar-row       (fn [_ sql]
                                          (swap! queries conj sql)
                                          (let [row (first @rows)]
                                            (swap! rows subvec 1)
                                            row))]
      (is (=? {:value 25200
               :health 0
               :message #".*1 failed change\(s\) awaiting DLQ retry.*"}
              (#'semantic.health/semantic-staleness)))
      (is (re-find #"JOIN \"index_gate\" g ON g.id = d.gate_id\s+AND g.gated_at = d.error_gated_at"
                   (-> @queries second first))
          "obsolete DLQ generations are excluded by matching the current gate timestamp")
      (is (= ::observed-at (-> @queries second second))
          "both backlog ages use the database time captured by the first query"))))

(deftest semantic-staleness-rejects-negative-database-age-test
  (mt/with-dynamic-fn-redefs
    [semantic.health/active-index
     (constantly {:pgvector ::pgvector
                  :state {:metadata-row {:id 7, :indexer_last_seen nil, :indexer_last_seen_id nil}}})
     semantic.env/get-index-metadata (constantly {:gate-table-name "index_gate"
                                                  :index-table-qualifier "%s"})
     semantic.dlq/dlq-table-exists?  (constantly false)
     semantic.health/scalar-row       (constantly {:pending 1, :age -1, :observed_at ::observed-at})]
    (is (=? {:health 0
             :message "Index staleness unavailable: database clock precedes a pending change."}
            (#'semantic.health/semantic-staleness)))))

(deftest ^:sequential report-repair-metrics!-test
  (mt/with-dynamic-fn-redefs [health-inspector/enabled? (constantly false)]
    (testing "a stored snapshot refreshes the garbage gauge immediately"
      (let [calls  (atom [])
            shared (atom nil)]
        (mt/with-dynamic-fn-redefs
          [semantic.health/store-repair-metrics! (fn [_index-id counts] (reset! shared counts))
           semantic.health/active-index
           #(let [{:keys [orphan-count]} @shared]
              {:pgvector :x
               :state (update active-state :metadata-row assoc
                              :repair_orphan_count orphan-count
                              :repair_snapshot_at (t/offset-date-time))})
           semantic.health/repair-snapshot-age (constantly 0)
           analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
          (semantic.health/report-repair-metrics! {:orphan-count 3}))
        (is (= [[:metabase-search/index-garbage-count {:index "semantic-search"} 3]] @calls))))
    (testing "with no active index, the measure reads N/A instead of serving an old shared count"
      (let [calls (atom [])]
        (mt/with-dynamic-fn-redefs [semantic.health/store-repair-metrics! (constantly nil)
                                    semantic.health/active-index          (constantly nil)
                                    analytics/set-gauge!                  (fn [& args] (swap! calls conj (vec args)))]
          (semantic.health/report-repair-metrics! {:orphan-count 3})
          (semantic.health/report-repair-metrics! nil))
        (is (every? (fn [[_gauge _labels value]] (and (double? value) (Double/isNaN ^double value))) @calls)
            "no real value reaches the gauge while there's no active index")))
    (testing "an ordinary metric-sink error does not fail the repair job"
      (mt/with-dynamic-fn-redefs [semantic.health/store-repair-metrics! (constantly nil)
                                  semantic.health/active-index
                                  (constantly {:pgvector :x
                                               :state (update active-state :metadata-row assoc
                                                              :repair_orphan_count 3
                                                              :repair_snapshot_at (t/offset-date-time))})
                                  semantic.health/repair-snapshot-age (constantly 0)
                                  analytics/set-gauge! (fn [& _] (throw (ex-info "boom" {})))]
        (is (nil? (semantic.health/report-repair-metrics! {:orphan-count 3})))))))

(deftest invalid-repair-snapshot-age-is-omitted-test
  (doseq [age [-1 10801]]
    (mt/with-dynamic-fn-redefs
      [semantic.health/active-index
       (constantly {:pgvector :x
                    :state (update active-state :metadata-row assoc
                                   :repair_orphan_count 3
                                   :repair_snapshot_at ::snapshot-at)})
       semantic.health/repair-snapshot-age (constantly age)]
      (is (nil? (#'semantic.health/semantic-garbage))))))

(deftest store-repair-metrics!-writes-exact-index-metadata-test
  (let [calls       (atom [])
        snapshot-at (t/offset-date-time)]
    (mt/with-dynamic-fn-redefs
      [semantic.env/get-pgvector-datasource!     (constantly ::pgvector)
       semantic.env/get-index-metadata           (constantly {:metadata-table-name "index_metadata"})
       semantic.index-metadata/get-active-index-state #(throw (ex-info "explicit index id must win" {}))
       semantic.health/clear-active-index-cache! (constantly nil)
       jdbc/execute-one!                         (fn [& args] (swap! calls conj args))]
      (#'semantic.health/store-repair-metrics! 17 {:orphan-count 7, :snapshot-at snapshot-at}))
    (is (= [7 snapshot-at 17] (-> @calls first second rest vec)))
    (is (re-find #"repair_orphan_count" (-> @calls first second first)))))

(deftest store-repair-metrics!-resolves-current-index-without-the-read-cache-test
  (let [calls       (atom [])
        snapshot-at (t/offset-date-time)]
    (mt/with-dynamic-fn-redefs
      [semantic.env/get-pgvector-datasource!          (constantly ::pgvector)
       semantic.env/get-index-metadata                (constantly {:metadata-table-name "index_metadata"})
       semantic.index-metadata/get-active-index-state (constantly active-state)
       semantic.health/active-index                   (constantly nil)
       semantic.health/clear-active-index-cache!      (constantly nil)
       jdbc/execute-one!                              (fn [& args] (swap! calls conj args))]
      (#'semantic.health/store-repair-metrics! nil {:orphan-count 7, :snapshot-at snapshot-at}))
    (is (= [7 snapshot-at 1] (-> @calls first second rest vec)))))

(deftest report-repair-metrics!-propagates-interruption-test
  (mt/with-dynamic-fn-redefs
    [semantic.health/store-repair-metrics! (fn [& _] (throw (InterruptedException.)))]
    (is (thrown? InterruptedException
                 (semantic.health/report-repair-metrics! {:orphan-count 3})))))

(deftest ^:sequential refresh-clears-garbage-when-inactive-test
  (testing "refresh NaNs a previously-emitted semantic garbage series when there's no active index, since no
           repair push will clear it (the collector reads N/A)"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
        (mt/with-dynamic-fn-redefs [health-inspector/enabled? (constantly false)]
          ;; make the series live: a repair push while the feature was on
          (mt/with-dynamic-fn-redefs
            [semantic.health/store-repair-metrics! (constantly nil)
             semantic.health/active-index
             (constantly {:pgvector :x
                          :state (update active-state :metadata-row assoc
                                         :repair_orphan_count 3
                                         :repair_snapshot_at (t/offset-date-time))})]
            (mt/with-dynamic-fn-redefs
              [semantic.health/repair-snapshot-age (constantly 0)]
              (semantic.health/report-repair-metrics! {:orphan-count 3})))
          (reset! calls [])
          (memoize/memo-clear! @#'semantic.health/active-index)
          (mt/with-dynamic-fn-redefs [semantic.util/semantic-search-active? (constantly false)]
            (search.index-health/refresh-search-index-metrics!))))
      (is (some (fn [[gauge labels value]]
                  (and (= gauge :metabase-search/index-garbage-count)
                       (= labels {:index "semantic-search"})
                       (double? value) (Double/isNaN ^double value)))
                @calls)
          "the semantic garbage-count series is cleared with NaN"))))
