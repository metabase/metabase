(ns metabase-enterprise.semantic-search.health-test
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.ai-index-health.core :as ai-index-health]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.embedding-health :as embedding-health]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.health :as semantic.health]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.analytics-interface.core :as analytics]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.test :as mt]
   [next.jdbc :as jdbc])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private active-state
  {:index {:table-name "index_test_table"} :metadata-row {:indexer_stalled_at nil}})

(defn- do-with-enabled!
  "Run `thunk` with the semantic engine active and the pgvector accessors stubbed to harmless values, so
  each test only has to override the signal it cares about."
  [thunk]
  (mt/with-dynamic-fn-redefs
    [semantic.util/semantic-search-active? (constantly true)
     semantic.env/get-pgvector-datasource! (constantly ::pgvector)
     semantic.env/get-index-metadata       (constantly ::index-metadata)]
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
            [semantic.embedding/embedder-circuit-untrusted? #(< @calls 2)]
            (is (nil? (embedding-health/request-circuit-recovery!)))
            (is (.await completed 5 TimeUnit/SECONDS) "recovery trials did not finish")
            (is (= 2 @calls))))
        (finally
          (reset! state before))))))

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
                         semantic.env/get-index-metadata (constantly {:gate-table-name gate-t})]
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
          (is (= 1 (backlog (staleness {:indexer_last_seen wm-ts :indexer_last_seen_id "b"})))))
        (testing "a nil watermark (indexer never ran) reads everything as pending"
          (is (= 3 (backlog (staleness {:indexer_last_seen nil :indexer_last_seen_id nil})))))
        (testing "a timestamp-only watermark (no id) treats same-timestamp rows as pending"
          (is (= 2 (backlog (staleness {:indexer_last_seen wm-ts :indexer_last_seen_id nil})))))
        (testing "a watermark past every row reads current"
          (is (=? {:value 0, :health 100, :message #"Index current\."}
                  (staleness {:indexer_last_seen (t/plus wm-ts (t/hours 1)) :indexer_last_seen_id ""}))))
        (finally
          (jdbc/execute! pgvector [(format "DROP TABLE IF EXISTS \"%s\"" gate-t)]))))))

(deftest ^:sequential report-repair-orphans!-test
  ;; health-inspector disabled (the default): the measure refresh skips the appdb persist; assert on the gauge
  (mt/with-temporary-setting-values [health-inspector-enabled false]
    (testing "with an active index, a pushed count lands on the labelled garbage-count gauge immediately"
      (let [calls (atom [])]
        ;; active-index truthy = available? + kill switch + an active index; the garbage collector gates on it
        (mt/with-dynamic-fn-redefs [semantic.health/active-index (constantly {:pgvector :x :state :y})
                                    analytics/set-gauge!          (fn [& args] (swap! calls conj (vec args)))]
          (semantic.health/report-repair-orphans! 3))
        (is (= [[:metabase-ai-index/garbage-count {:engine "semantic"} 3]] @calls))))
    (testing "with no active index (kill switch off / feature unavailable), the pushed count is not served:
             the measure reads N/A and the gauge only ever clears, so a disabled instance can't keep a
             garbage reading alive"
      (let [calls (atom [])]
        (mt/with-dynamic-fn-redefs [semantic.health/active-index (constantly nil)
                                    analytics/set-gauge!          (fn [& args] (swap! calls conj (vec args)))]
          (semantic.health/report-repair-orphans! 3)
          (semantic.health/report-repair-orphans! nil))
        (is (every? (fn [[_gauge _labels value]] (and (double? value) (Double/isNaN ^double value))) @calls)
            "no real value reaches the gauge while there's no active index")))
    (testing "a nil count (the orphan query failed) with an active index NaNs the gauge rather than leaving a
             stale count standing -- gauges don't age out while the process is scraped"
      (let [calls (atom [])]
        (mt/with-dynamic-fn-redefs [semantic.health/active-index (constantly {:pgvector :x :state :y})
                                    analytics/set-gauge!          (fn [& args] (swap! calls conj (vec args)))]
          (semantic.health/report-repair-orphans! 3) ; make the series live so the clear is observable
          (reset! calls [])
          (semantic.health/report-repair-orphans! nil))
        (is (= [[:metabase-ai-index/garbage-count {:engine "semantic"}]] (mapv butlast @calls)))
        (is (Double/isNaN ^double (last (first @calls))))))
    (testing "never throws -- a metric-sink error must not fail the repair job that calls it"
      (mt/with-dynamic-fn-redefs [semantic.health/active-index (constantly {:pgvector :x :state :y})
                                  analytics/set-gauge!          (fn [& _] (throw (ex-info "boom" {})))]
        (is (nil? (semantic.health/report-repair-orphans! 3)))))))

(deftest ^:sequential refresh-clears-garbage-when-inactive-test
  (testing "refresh NaNs a previously-emitted semantic garbage series when there's no active index, since no
           repair push will clear it (the collector reads N/A)"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
        (mt/with-temporary-setting-values [health-inspector-enabled false]
          ;; make the series live: a repair push while the feature was on
          (mt/with-dynamic-fn-redefs [semantic.health/active-index (constantly {:pgvector :x :state :y})]
            (semantic.health/report-repair-orphans! 3))
          (reset! calls [])
          (memoize/memo-clear! @#'semantic.health/active-index)
          (mt/with-dynamic-fn-redefs [semantic.util/semantic-search-active? (constantly false)]
            (ai-index-health/refresh-ai-index-metrics!))))
      (is (some (fn [[gauge labels value]]
                  (and (= gauge :metabase-ai-index/garbage-count)
                       (= labels {:engine "semantic"})
                       (double? value) (Double/isNaN ^double value)))
                @calls)
          "the semantic garbage-count series is cleared with NaN"))))
