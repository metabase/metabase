(ns metabase-enterprise.semantic-search.health-test
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.health :as semantic.health]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.settings :as semantic-settings]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.analytics-interface.core :as analytics]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]))

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
      (is (nil? (semantic.health/index-health-check)))))
  (testing "the semantic-search-enabled kill switch off -> nil through the real engine chain, even with
           pgvector + license present"
    (mt/with-premium-features #{:semantic-search}
      (mt/with-dynamic-fn-redefs [semantic.util/semantic-search-capable?    (constantly true)
                                  semantic-settings/semantic-search-enabled (constantly false)]
        (is (nil? (semantic.health/index-health-check)))))))

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
          semantic.embedding/embedder-circuit-untrusted?  (constantly false)
          semantic.health/embedding-service-reachable?   (constantly {:reachable? true :error nil})]
         (is (=? {:health 0 :message #".*indexer stalled since 2026-07-07.*"}
                 (semantic.health/index-health-check)))))
     (testing "an unqueryable active table degrades"
       (mt/with-dynamic-fn-redefs
         [semantic.index-metadata/get-active-index-state (constantly active-state)
          semantic.health/active-index-queryable?        (constantly false)
          semantic.embedding/embedder-circuit-untrusted?  (constantly false)
          semantic.health/embedding-service-reachable?   (constantly {:reachable? true :error nil})]
         (is (=? {:health 0 :message #".*active index table not queryable.*"}
                 (semantic.health/index-health-check)))))
     (testing "a non-closed breaker (open or half-open) still probes (so a recovered-but-idle embedder is
              detectable) and degrades identically in both states"
       (let [probed? (atom false)]
         (mt/with-dynamic-fn-redefs
           [semantic.index-metadata/get-active-index-state (constantly active-state)
            semantic.health/active-index-queryable?        (constantly true)
            semantic.embedding/embedder-circuit-untrusted? (constantly true)
            semantic.health/embedding-service-reachable?   (fn [] (reset! probed? true) {:reachable? true})]
           (is (=? {:health 0 :message #".*circuit open \(probe reachable.*"}
                   (semantic.health/index-health-check)))
           (is (true? @probed?) "an open circuit still probes so recovery is detectable"))))
     (testing "an open circuit with an unreachable probe reads the same as unreachable with a closed one --
              state-independent wording, so a flapping breaker's re-persisted rows dedup instead of flooding"
       (mt/with-dynamic-fn-redefs
         [semantic.index-metadata/get-active-index-state (constantly active-state)
          semantic.health/active-index-queryable?        (constantly true)
          semantic.embedding/embedder-circuit-untrusted? (constantly true)
          semantic.health/embedding-service-reachable?   (constantly {:reachable? false :error "boom"})]
         (is (=? {:health 0 :message #".*embedding service unreachable: boom.*"}
                 (semantic.health/index-health-check)))))
     (testing "an unreachable embedder degrades and names the error"
       (mt/with-dynamic-fn-redefs
         [semantic.index-metadata/get-active-index-state (constantly active-state)
          semantic.health/active-index-queryable?        (constantly true)
          semantic.embedding/embedder-circuit-untrusted?  (constantly false)
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

(deftest ^:sequential breaker-transition-probe-cache-test
  (testing "open/half-open hook runs reuse the TTL'd probe (no forced cache miss -- clearing there would
           re-probe a struggling service on every flap); only :closed forces a fresh probe"
    (let [probes (atom 0)]
      ;; get-embedding is a multimethod; with-dynamic-fn-redefs can't patch those, so with-redefs is required.
      (with-redefs [semantic.embedding/get-configured-model (constantly {:model-name "m"})
                    semantic.embedding/get-embedding        (fn [& _] (swap! probes inc) [0.1])]
        (mt/with-dynamic-fn-redefs [health-inspector/run-and-save-check! (constantly nil)]
          (memoize/memo-clear! @#'semantic.health/embedding-service-reachable?*)
          (semantic.health/embedding-service-reachable?)
          (is (= 1 @probes))
          (#'semantic.health/persist-index-check-on-breaker-change! :open)
          (#'semantic.health/persist-index-check-on-breaker-change! :half-open)
          (semantic.health/embedding-service-reachable?)
          (is (= 1 @probes) "an open<->half-open flap rides the cached probe")
          (#'semantic.health/persist-index-check-on-breaker-change! :closed)
          (semantic.health/embedding-service-reachable?)
          (is (= 2 @probes) "recovery busts the cache so the persisted row can't be a stale 'unreachable'")
          (memoize/memo-clear! @#'semantic.health/embedding-service-reachable?*))))))

(deftest ^:sequential register-index-check!-migrates-a-legacy-registry-test
  (testing "a live upgrade can leave the defonce'd registry holding its earlier vector shape; registering
           into it migrates the entries instead of throwing on assoc-by-keyword"
    (let [measures @#'semantic.health/index-measures
          before   @measures]
      (try
        (reset! measures [{:check-name :legacy-measure, :collect (constantly nil)}])
        (let [{:keys [check-name]} (semantic.health/register-index-check! :test-migration :coverage (constantly nil))]
          (is (= #{:legacy-measure check-name} (set (keys @measures)))
              "legacy entries are keyed by check-name and the new registration lands alongside"))
        (finally (reset! measures before))))))

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
    (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
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
        (is (Double/isNaN ^double (last (first @calls))) "the labelled series is cleared with NaN, not left stale"))
      (testing "a throwing collector clears the gauge (rather than freezing its last value) and reads as a
               degraded row -- not N/A, which would make an errored measure vanish like a disabled one"
        ;; make the series live first, then a failing collect must NaN-clear it rather than leave it stale-healthy
        (#'semantic.health/run-measure! {:gauge-key :metabase-ai-index/coverage-ratio
                                         :engine    :throwing-collector-test
                                         :collect   (constantly {:value 0.9 :health 90 :message "was fine"})})
        (reset! calls [])
        (is (=? {:health 0, :message #"Metric collector errored: collector boom"}
                (#'semantic.health/run-measure! {:gauge-key :metabase-ai-index/coverage-ratio
                                                 :engine    :throwing-collector-test
                                                 :collect   (fn [] (throw (ex-info "collector boom" {})))})))
        (is (= [:metabase-ai-index/coverage-ratio {:engine "throwing-collector-test"}] (butlast (first @calls))))
        (is (Double/isNaN ^double (last (first @calls))) "a throwing collector clears the gauge with NaN")))))

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

(deftest ^:sequential refresh-clears-garbage-when-disabled-test
  (testing "refresh NaNs a previously-emitted semantic garbage series when there's no active index, since no
           repair push will clear it (the collector reads N/A)"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
        (mt/with-temporary-setting-values [health-inspector-enabled false]
          ;; make the series live: a repair push while the feature was on
          (mt/with-dynamic-fn-redefs [semantic.health/active-index (constantly {:pgvector :x :state :y})]
            (semantic.health/report-repair-orphans! 3))
          (reset! calls [])
          (mt/with-dynamic-fn-redefs [semantic.util/semantic-search-available? (constantly false)]
            (semantic.health/refresh-ai-index-metrics!))))
      (is (some (fn [[gauge labels value]]
                  (and (= gauge :metabase-ai-index/garbage-count)
                       (= labels {:engine "semantic"})
                       (double? value) (Double/isNaN ^double value)))
                @calls)
          "the semantic garbage-count series is cleared with NaN"))))

(deftest ^:sequential na-measure-does-not-create-series-test
  (testing "an N/A measure whose series never emitted a real value doesn't get created just to hold NaN
           (e.g. pgvector configured but unlicensed: the collector job runs with every measure N/A)"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
        (#'semantic.health/run-measure! {:gauge-key :metabase-ai-index/coverage-ratio
                                         :engine    :never-emitted-test-engine
                                         :collect   (constantly nil)}))
      (is (= [] @calls) "no gauge write at all for a never-emitted series"))))

(deftest ^:sequential failed-first-write-does-not-mark-series-live-test
  (testing "a throwing first gauge write doesn't mark the series live, so later N/A clears can't create a
           NaN-only series that never held a real value"
    (let [set-index-gauge! @#'semantic.health/set-index-gauge!
          live             @#'semantic.health/live-gauge-series
          series           [:metabase-ai-index/coverage-ratio :failed-write-test-engine]
          calls            (atom [])]
      (try
        (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [& _] (throw (ex-info "prometheus down" {})))]
          (is (thrown? Exception (apply set-index-gauge! (conj series 1.0))))
          (is (not (contains? @live series)) "a failed write must not mark the series live"))
        (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
          (apply set-index-gauge! (conj series nil))
          (is (= [] @calls) "an N/A clear after the failed write emits nothing")
          (apply set-index-gauge! (conj series 0.5))
          (is (contains? @live series) "a successful write marks it live"))
        (finally
          (swap! live disj series))))))

(deftest ^:sequential refresh-isolates-measure-failures-test
  (mt/with-temporary-setting-values [health-inspector-enabled false]
    (testing "a throwing collector NaN-clears its gauge (instead of freezing the last healthy value) and
             doesn't stop other measures from refreshing"
      (let [calls (atom [])
            boom  {:check-name :test-boom
                   :gauge-key  :metabase-ai-index/staleness-seconds
                   :engine     :refresh-isolation-test
                   :collect    (fn [] (throw (ex-info "collector boom" {})))}
            ok    {:check-name :test-ok
                   :gauge-key  :metabase-ai-index/coverage-ratio
                   :engine     :refresh-isolation-test
                   :collect    (constantly {:value 1.0 :health 100 :message "ok"})}]
        (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
          ;; make boom's series live so the clear is observable
          (#'semantic.health/run-measure! (assoc boom :collect (constantly {:value 5 :health 100 :message "was fine"})))
          (reset! calls [])
          (run! #'semantic.health/refresh-measure! [boom ok]))
        (is (=? [[:metabase-ai-index/staleness-seconds {:engine "refresh-isolation-test"}
                  (fn [v] (Double/isNaN ^double v))]
                 [:metabase-ai-index/coverage-ratio {:engine "refresh-isolation-test"} 1.0]]
                @calls)
            "boom's series is NaN-cleared and ok still refreshes")))))
