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
  (is (=? {:value 0.0 :health 100 :message #"No orphaned items.*"} (semantic.health/garbage-result 0 10)))
  (is (=? {:value 0.2 :health 80 :message #"2 of 10 indexed items are orphaned \(20%\)\."}
          (semantic.health/garbage-result 2 10)))
  (testing "an empty index has no garbage"
    (is (=? {:value 0.0 :health 100} (semantic.health/garbage-result 0 0)))))

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
      (testing "an N/A collector (nil) sets no gauge and returns nil"
        (reset! calls [])
        (is (nil? (#'semantic.health/run-measure! {:gauge-key :metabase-ai-index/coverage-ratio
                                                   :engine    :semantic
                                                   :collect   (constantly nil)})))
        (is (empty? @calls))))))

(deftest ^:sequential report-repair-orphans!-no-active-index-test
  (testing "no active index -> no-op (no gauge write, no throw), so the hourly repair hook is always safe"
    (let [calls (atom [])]
      (with-redefs [analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
        (mt/with-dynamic-fn-redefs [semantic.util/semantic-search-available? (constantly false)]
          (is (nil? (semantic.health/report-repair-orphans! 3)))
          (is (empty? @calls)))))))
