(ns metabase.search.index-health-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.search.index-health :as index-health]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:sequential register-index-check!-migrates-a-legacy-registry-test
  (testing "a live upgrade migrates the defonce'd registry's former vector value"
    (let [measures (atom [{:check-name :legacy-measure, :collect (constantly nil)}])
          checks   (atom {})]
      (with-redefs [index-health/index-measures measures
                    health-inspector/checks     checks]
        (let [{:keys [check-name]}
              (index-health/register-index-check! :test-migration :coverage (constantly nil))]
          (is (= #{:legacy-measure check-name} (set (keys @measures))))
          (is (contains? @checks check-name)))))))

(deftest ^:parallel coverage-result-test
  (testing "coverage health is the percentage; the ratio feeds the gauge"
    (is (=? {:value 0.5 :health 50 :message #"5 of 10 expected items indexed \(50%\)\."}
            (index-health/coverage-result 5 10))))
  (testing "an empty candidate set is fully covered"
    (is (=? {:value 1.0 :health 100 :message #"0 of 0 .*100%.*"}
            (index-health/coverage-result 0 0))))
  (testing "coverage clamps over-counts to 100 percent"
    (is (=? {:value 1.0 :health 100} (index-health/coverage-result 12 10))))
  (testing "only exact endpoints score 0 or 100"
    (is (=? {:health 99} (index-health/coverage-result 999 1000)))
    (is (=? {:health 1} (index-health/coverage-result 1 1000)))
    (is (=? {:health 0} (index-health/coverage-result 0 1000)))))

(deftest ^:parallel garbage-result-test
  (testing "zero orphans is healthy"
    (is (=? {:value 0 :health 100 :message #"No orphaned items.*"}
            (index-health/garbage-result 0 5 100))))
  (testing "the value is an absolute count"
    (is (=? {:value 42 :message #"42 orphaned item\(s\) in the index\."}
            (index-health/garbage-result 42 5 100))))
  (testing "health is linear between the warning and critical thresholds"
    (is (=? {:health 100} (index-health/garbage-result 5 5 100)))
    (is (=? {:health 0}   (index-health/garbage-result 100 5 100)))
    (is (=? {:health 50}  (index-health/garbage-result 52 4 100))))
  (testing "intermediate values do not round to an endpoint"
    (is (=? {:health 99} (index-health/garbage-result 1 0 1000)))
    (is (=? {:health 1} (index-health/garbage-result 999 0 1000)))))

(deftest ^:parallel staleness-result-test
  (testing "values at or below the warning threshold are healthy"
    (is (=? {:value 0 :health 100 :message #"Index current\. more"}
            (index-health/staleness-result 0 60 600 "more")))
    (is (=? {:health 100} (index-health/staleness-result 60 60 600 nil))))
  (testing "values at or above the critical threshold are degraded"
    (is (=? {:health 0, :message #"Oldest pending change is 2\.8h old\."}
            (index-health/staleness-result 9999 60 600 nil))))
  (testing "health is linear between the warning and critical thresholds"
    (is (=? {:health 50} (index-health/staleness-result 330 60 600 nil)))))

(deftest ^:sequential run-measure!-test
  (let [calls (atom [])
        live  (atom #{})]
    (with-redefs [index-health/live-gauge-series live]
      (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
        (testing "a collector result updates the gauge and returns the health row"
          (is (= {:health 75 :message "ok"}
                 (#'index-health/run-measure! {:gauge-key :metabase-search/index-coverage-ratio
                                               :index    :semantic
                                               :collect   (constantly {:value   0.75
                                                                       :health  75
                                                                       :message "ok"})})))
          (is (= [[:metabase-search/index-coverage-ratio {:index "semantic"} 0.75]] @calls)))
        (testing "an inapplicable collector clears a live gauge and returns nil"
          (reset! calls [])
          (is (nil? (#'index-health/run-measure! {:gauge-key :metabase-search/index-coverage-ratio
                                                  :index    :semantic
                                                  :collect   (constantly nil)})))
          (is (= 1 (count @calls)))
          (is (= [:metabase-search/index-coverage-ratio {:index "semantic"}] (butlast (first @calls))))
          (is (Double/isNaN ^double (last (first @calls)))))
        (testing "a throwing collector clears the gauge and returns a degraded row"
          (#'index-health/run-measure! {:gauge-key :metabase-search/index-coverage-ratio
                                        :index    :throwing-collector-test
                                        :collect   (constantly {:value 0.9 :health 90 :message "was fine"})})
          (reset! calls [])
          (is (=? {:health 0, :message #"Metric collector errored: collector boom"}
                  (#'index-health/run-measure! {:gauge-key :metabase-search/index-coverage-ratio
                                                :index    :throwing-collector-test
                                                :collect   (fn []
                                                             (throw (ex-info "collector boom" {})))})))
          (is (= [:metabase-search/index-coverage-ratio {:index "throwing-collector-test"}]
                 (butlast (first @calls))))
          (is (Double/isNaN ^double (last (first @calls)))))))))

(deftest run-measure!-propagates-interruption-test
  (is (thrown? InterruptedException
               (#'index-health/run-measure! {:gauge-key :metabase-search/index-coverage-ratio
                                             :index     :interrupted-test
                                             :collect   #(throw (InterruptedException.))}))))

(deftest ^:sequential inapplicable-measure-does-not-create-series-test
  (testing "an inapplicable measure does not create a NaN-only series"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
        (#'index-health/run-measure! {:gauge-key :metabase-search/index-coverage-ratio
                                      :index    :never-emitted-test-engine
                                      :collect   (constantly nil)}))
      (is (empty? @calls)))))

(deftest ^:sequential failed-first-write-does-not-mark-series-live-test
  (testing "a failed first gauge write does not make later clears create a NaN-only series"
    (let [set-index-gauge! @#'index-health/set-index-gauge!
          live             @#'index-health/live-gauge-series
          series           [:metabase-search/index-coverage-ratio :failed-write-test-engine]
          calls            (atom [])]
      (try
        (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [& _]
                                                           (throw (ex-info "prometheus down" {})))]
          (is (thrown? Exception (apply set-index-gauge! (conj series 1.0))))
          (is (not (contains? @live series))))
        (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
          (apply set-index-gauge! (conj series nil))
          (is (empty? @calls))
          (apply set-index-gauge! (conj series 0.5))
          (is (contains? @live series)))
        (finally
          (swap! live disj series))))))

(deftest ^:sequential refresh-isolates-measure-failures-test
  (testing "one collector failure does not stop later measures from refreshing"
    (let [calls (atom [])
          live  (atom #{})
          boom  {:check-name :test-boom
                 :gauge-key  :metabase-search/index-staleness-seconds
                 :index     :refresh-isolation-test
                 :collect    (fn [] (throw (ex-info "collector boom" {})))}
          ok    {:check-name :test-ok
                 :gauge-key  :metabase-search/index-coverage-ratio
                 :index     :refresh-isolation-test
                 :collect    (constantly {:value 1.0 :health 100 :message "ok"})}]
      (with-redefs [index-health/live-gauge-series live]
        (mt/with-dynamic-fn-redefs [analytics/set-gauge!       (fn [& args] (swap! calls conj (vec args)))
                                    health-inspector/enabled? (constantly false)]
          (#'index-health/run-measure! (assoc boom :collect
                                              (constantly {:value 5 :health 100 :message "was fine"})))
          (reset! calls [])
          (run! #'index-health/refresh-index-check! [boom ok])))
      (is (=? [[:metabase-search/index-staleness-seconds {:index "refresh-isolation-test"}
                (fn [v] (Double/isNaN ^double v))]
               [:metabase-search/index-coverage-ratio {:index "refresh-isolation-test"} 1.0]]
              @calls)))))

(deftest ^:sequential pull-collector-refreshes-gauges-on-each-instance-test
  (let [measures  @#'index-health/index-measures
        running?  @#'index-health/gauge-refresh-running?
        before    @measures
        seen      (atom [])
        submitted (atom [])
        one       {:check-name :one}
        two       {:check-name :two}
        collector (analytics.core/pull-collector :metabase.search.index-health/index-health-gauges)]
    (try
      (reset! measures {:one one, :two two})
      (reset! running? false)
      (mt/with-dynamic-fn-redefs
        [index-health/run-measure!          #(swap! seen conj %)
         index-health/submit-gauge-refresh! #(swap! submitted conj %)
         health-inspector/save-check-result! #(throw (ex-info "must not persist from a scrape" {}))]
        ((:f collector))
        ((:f collector))
        (is (empty? @seen) "the scrape path does not run index scans")
        (is (= 1 (count @submitted)) "overlapping scrapes share one refresh")
        ((first @submitted)))
      (is (= 600 (:min-interval-s collector)))
      (is (= #{one two} (set @seen)))
      (is (false? @running?))
      (finally
        (reset! running? false)
        (reset! measures before)))))

(deftest ^:sequential background-gauge-refresh-isolates-write-failures-test
  (let [measures (atom {:one {:check-name :one}, :two {:check-name :two}})
        running? (atom true)
        seen     (atom [])]
    (with-redefs [index-health/index-measures         measures
                  index-health/gauge-refresh-running? running?]
      (mt/with-dynamic-fn-redefs
        [index-health/run-measure! (fn [{:keys [check-name]}]
                                     (swap! seen conj check-name)
                                     (when (= :one check-name)
                                       (throw (ex-info "prometheus down" {}))))]
        (#'index-health/refresh-search-index-gauges!)))
    (is (= #{:one :two} (set @seen)))
    (is (false? @running?)))
  (testing "interruption still escapes the per-descriptor boundary"
    (is (thrown? InterruptedException
                 (#'index-health/refresh-index-gauge! {:check-name :interrupted
                                                       :gauge-key  :metabase-search/index-coverage-ratio
                                                       :index      :interrupted
                                                       :collect    #(throw (InterruptedException.))})))))
