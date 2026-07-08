(ns metabase-enterprise.semantic-search.health-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.health :as semantic.health]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.settings :as semantic-settings]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.analytics-interface.core :as analytics]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private active-state
  {:index {:table-name "index_test_table"} :metadata-row {:indexer_stalled_at nil}})

(defn- do-with-enabled!
  "Run `thunk` with semantic search available and the pgvector accessors stubbed to harmless values, so
  each test only has to override the signal it cares about."
  [thunk]
  (mt/with-dynamic-fn-redefs
    [semantic.util/semantic-search-available?    (constantly true)
     semantic-settings/semantic-search-enabled   (constantly true)
     semantic.env/get-pgvector-datasource!       (constantly ::pgvector)
     semantic.env/get-index-metadata             (constantly ::index-metadata)]
    (thunk)))

(deftest not-enabled-is-omitted-test
  (testing "unconfigured/unlicensed -> nil (omitted, not a misleading 100)"
    (mt/with-dynamic-fn-redefs [semantic.util/semantic-search-available? (constantly false)]
      (is (nil? (semantic.health/index-health-check)))))
  (testing "the semantic-search-enabled kill switch off -> nil, even with pgvector + license present"
    (mt/with-dynamic-fn-redefs [semantic.util/semantic-search-available?  (constantly true)
                                semantic-settings/semantic-search-enabled (constantly false)]
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
          semantic.embedding/embedder-circuit-open?       (constantly false)
          semantic.health/embedding-service-reachable?   (constantly {:reachable? true :error nil})]
         (is (=? {:health 100 :message #"Semantic search index active.*serving\."}
                 (semantic.health/index-health-check))))))))

(deftest degraded-conditions-test
  (do-with-enabled!
   (fn []
     (testing "a stalled indexer degrades and names the stall"
       (mt/with-dynamic-fn-redefs
         [semantic.index-metadata/get-active-index-state (constantly (assoc-in active-state [:metadata-row :indexer_stalled_at] "2026-07-07"))
          semantic.health/active-index-queryable?        (constantly true)
          semantic.embedding/embedder-circuit-open?       (constantly false)
          semantic.health/embedding-service-reachable?   (constantly {:reachable? true :error nil})]
         (is (=? {:health 0 :message #".*indexer stalled since 2026-07-07.*"}
                 (semantic.health/index-health-check)))))
     (testing "an unqueryable active table degrades"
       (mt/with-dynamic-fn-redefs
         [semantic.index-metadata/get-active-index-state (constantly active-state)
          semantic.health/active-index-queryable?        (constantly false)
          semantic.embedding/embedder-circuit-open?       (constantly false)
          semantic.health/embedding-service-reachable?   (constantly {:reachable? true :error nil})]
         (is (=? {:health 0 :message #".*active index table not queryable.*"}
                 (semantic.health/index-health-check)))))
     (testing "an open circuit still probes (so a recovered-but-idle embedder is detectable) and degrades"
       (let [probed? (atom false)]
         (mt/with-dynamic-fn-redefs
           [semantic.index-metadata/get-active-index-state (constantly active-state)
            semantic.health/active-index-queryable?        (constantly true)
            semantic.embedding/embedder-circuit-open?      (constantly true)
            semantic.health/embedding-service-reachable?   (fn [] (reset! probed? true) {:reachable? true})]
           (is (=? {:health 0 :message #".*circuit open \(probe reachable.*"}
                   (semantic.health/index-health-check)))
           (is (true? @probed?) "an open circuit still probes so recovery is detectable"))))
     (testing "an open circuit with an unreachable probe names both"
       (mt/with-dynamic-fn-redefs
         [semantic.index-metadata/get-active-index-state (constantly active-state)
          semantic.health/active-index-queryable?        (constantly true)
          semantic.embedding/embedder-circuit-open?      (constantly true)
          semantic.health/embedding-service-reachable?   (constantly {:reachable? false :error "boom"})]
         (is (=? {:health 0 :message #".*unreachable; circuit open.*"}
                 (semantic.health/index-health-check)))))
     (testing "an unreachable embedder degrades and names the error"
       (mt/with-dynamic-fn-redefs
         [semantic.index-metadata/get-active-index-state (constantly active-state)
          semantic.health/active-index-queryable?        (constantly true)
          semantic.embedding/embedder-circuit-open?       (constantly false)
          semantic.health/embedding-service-reachable?   (constantly {:reachable? false :error "boom"})]
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
                    semantic.embedding/get-embedding        (fn [_model _text opts]
                                                              (reset! seen (assoc opts :bypass semantic.embedding/*bypass-circuit-breaker*))
                                                              [0.1 0.2])]
        (is (=? {:reachable? true :error nil} (#'semantic.health/probe-embedding-service)))
        (is (=? {:bypass true :snowplow? false :record-tokens? false} @seen)
            "the probe runs with the breaker bypassed, snowplow silenced, and tokens unrecorded"))))
  (testing "an embedding failure reads as unreachable and captures the message"
    (with-redefs [semantic.embedding/get-configured-model (constantly {:model-name "m"})
                  semantic.embedding/get-embedding        (fn [& _] (throw (ex-info "connection refused" {})))]
      (is (=? {:reachable? false :error "connection refused"}
              (#'semantic.health/probe-embedding-service))))))

;;; --------------------------------------- AI index metric shaping -----------------------------------------

(deftest coverage-result-test
  (testing "coverage health is the percentage; the ratio feeds the gauge"
    (is (=? {:value 0.5 :health 50 :message #"5 of 10 expected items indexed \(50%\)\."}
            (semantic.health/coverage-result 5 10))))
  (testing "an empty candidate set is fully covered, not a divide-by-zero"
    (is (=? {:value 1.0 :health 100 :message #"0 of 0 .*100%.*"} (semantic.health/coverage-result 0 0))))
  (testing "over-count (indexed > expected, e.g. lag/garbage) clamps to 100"
    (is (=? {:value 1.0 :health 100} (semantic.health/coverage-result 12 10)))))

(deftest garbage-result-test
  (testing "zero orphans reads healthy"
    (is (=? {:value 0 :health 100 :message #"No orphaned items.*"} (semantic.health/garbage-result 0 5 100))))
  (testing "the value/gauge is the absolute orphan count, not a fraction, and the message states it"
    (is (=? {:value 42 :message #"42 orphaned item\(s\) in the index\."} (semantic.health/garbage-result 42 5 100))))
  (testing "health thresholds on the absolute count: 100 at/under warn, 0 at/over crit, linear between"
    (is (=? {:health 100} (semantic.health/garbage-result 5 5 100)))
    (is (=? {:health 0}   (semantic.health/garbage-result 100 5 100)))
    ;; warn 4, crit 100, count 52 -> (100-52)/(100-4) = 0.5
    (is (=? {:health 50}  (semantic.health/garbage-result 52 4 100)))))

(deftest staleness-result-test
  (testing "at/under warn = healthy and reported current"
    (is (=? {:value 0 :health 100 :message #"Index current\. more"} (semantic.health/staleness-result 0 60 600 "more")))
    (is (=? {:health 100} (semantic.health/staleness-result 60 60 600 nil))))
  (testing "at/over critical = 0, naming the age"
    (is (=? {:health 0 :message #"Oldest pending change is 2\.8h old\."} (semantic.health/staleness-result 9999 60 600 nil))))
  (testing "linear between warn and critical"
    ;; warn 60, crit 600, age 330 = midpoint -> 50
    (is (=? {:health 50} (semantic.health/staleness-result 330 60 600 nil)))))

(deftest ^:sequential run-measure!-test
  (let [calls (atom [])]
    ;; capture the labelled gauge write without asserting on the (env-flaky) Prometheus registry value
    (with-redefs [analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
      (testing "a collector result sets the labelled gauge and returns the health row"
        (is (= {:health 75 :message "ok"}
               (#'semantic.health/run-measure! {:gauge-key :metabase-ai-index/coverage-ratio
                                                :engine    :semantic
                                                :collect   (constantly {:value 0.75 :health 75 :message "ok"})})))
        (is (= [[:metabase-ai-index/coverage-ratio {:engine "semantic"} 0.75]] @calls)))
      (testing "an N/A collector (nil) writes NaN (clearing any stale series) and returns nil"
        (reset! calls [])
        (is (nil? (#'semantic.health/run-measure! {:gauge-key :metabase-ai-index/coverage-ratio
                                                   :engine    :semantic
                                                   :collect   (constantly nil)})))
        (is (= 1 (count @calls)))
        (is (= [:metabase-ai-index/coverage-ratio {:engine "semantic"}] (butlast (first @calls))))
        (is (Double/isNaN ^double (last (first @calls))) "the labelled series is cleared with NaN, not left stale")))))

(deftest ^:sequential report-repair-orphans!-test
  ;; health-inspector disabled (the default): emit-garbage! skips the appdb persist; assert on the gauge
  (mt/with-temporary-setting-values [health-inspector-enabled false]
    (testing "with an active index, pushes the absolute orphan count to the labelled garbage-count gauge"
      (let [calls (atom [])]
        ;; active-index truthy = available? + kill switch + an active index; the repair push gates on it
        (with-redefs [semantic.health/active-index (constantly {:pgvector :x :state :y})
                      analytics/set-gauge!          (fn [& args] (swap! calls conj (vec args)))]
          (semantic.health/report-repair-orphans! 3))
        (is (= [[:metabase-ai-index/garbage-count {:engine "semantic"} 3]] @calls))))
    (testing "with no active index (kill switch off / feature unavailable), does NOT push -- so it can't
             repopulate the gauge the refresh clearer just NaN'd"
      (let [calls (atom [])]
        (with-redefs [semantic.health/active-index (constantly nil)
                      analytics/set-gauge!          (fn [& args] (swap! calls conj (vec args)))]
          (semantic.health/report-repair-orphans! 3)
          (semantic.health/report-repair-orphans! nil))
        (is (= [] @calls))))
    (testing "a nil count (the orphan query failed) with an active index NaNs the gauge rather than leaving a
             stale count standing -- gauges don't age out while the process is scraped"
      (let [calls (atom [])]
        (with-redefs [semantic.health/active-index (constantly {:pgvector :x :state :y})
                      analytics/set-gauge!          (fn [& args] (swap! calls conj (vec args)))]
          (semantic.health/report-repair-orphans! nil))
        (is (= [[:metabase-ai-index/garbage-count {:engine "semantic"}]] (mapv butlast @calls)))
        (is (Double/isNaN ^double (last (first @calls))))))
    (testing "never throws -- a metric-sink error must not fail the repair job that calls it"
      (with-redefs [semantic.health/active-index (constantly {:pgvector :x :state :y})
                    analytics/set-gauge!          (fn [& _] (throw (ex-info "boom" {})))]
        (is (nil? (semantic.health/report-repair-orphans! 3)))))))

(deftest ^:sequential refresh-clears-push-garbage-when-disabled-test
  (testing "refresh NaNs the push-only semantic garbage series when there's no active index, since no repair
           run will (pull measures self-clear)"
    (let [calls (atom [])]
      (with-redefs [analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
        (mt/with-temporary-setting-values [health-inspector-enabled false]
          (mt/with-dynamic-fn-redefs [semantic.util/semantic-search-available? (constantly false)]
            (semantic.health/refresh-ai-index-metrics!))))
      (is (some (fn [[gauge labels value]]
                  (and (= gauge :metabase-ai-index/garbage-count)
                       (= labels {:engine "semantic"})
                       (double? value) (Double/isNaN ^double value)))
                @calls)
          "the semantic garbage-count series is cleared with NaN"))))
