(ns metabase-enterprise.ai-index-health.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.ai-index-health.core :as ai-index-health]
   [metabase.analytics-interface.core :as analytics]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:sequential register-index-check!-migrates-a-legacy-registry-test
  (testing "a live upgrade migrates the defonce'd registry's former vector value"
    (let [measures @#'ai-index-health/index-measures
          before   @measures]
      (try
        (reset! measures [{:check-name :legacy-measure, :collect (constantly nil)}])
        (let [{:keys [check-name]}
              (ai-index-health/register-index-check! :test-migration :coverage (constantly nil))]
          (is (= #{:legacy-measure check-name} (set (keys @measures)))))
        (finally
          (reset! measures before))))))

(deftest ^:parallel coverage-result-test
  (testing "coverage health is the percentage; the ratio feeds the gauge"
    (is (=? {:value 0.5 :health 50 :message #"5 of 10 expected items indexed \(50%\)\."}
            (ai-index-health/coverage-result 5 10))))
  (testing "an empty candidate set is fully covered"
    (is (=? {:value 1.0 :health 100 :message #"0 of 0 .*100%.*"}
            (ai-index-health/coverage-result 0 0))))
  (testing "coverage clamps over-counts to 100 percent"
    (is (=? {:value 1.0 :health 100} (ai-index-health/coverage-result 12 10)))))

(deftest ^:parallel garbage-result-test
  (testing "zero orphans is healthy"
    (is (=? {:value 0 :health 100 :message #"No orphaned items.*"}
            (ai-index-health/garbage-result 0 5 100))))
  (testing "the value is an absolute count"
    (is (=? {:value 42 :message #"42 orphaned item\(s\) in the index\."}
            (ai-index-health/garbage-result 42 5 100))))
  (testing "health is linear between the warning and critical thresholds"
    (is (=? {:health 100} (ai-index-health/garbage-result 5 5 100)))
    (is (=? {:health 0}   (ai-index-health/garbage-result 100 5 100)))
    (is (=? {:health 50}  (ai-index-health/garbage-result 52 4 100)))))

(deftest ^:parallel staleness-result-test
  (testing "values at or below the warning threshold are healthy"
    (is (=? {:value 0 :health 100 :message #"Index current\. more"}
            (ai-index-health/staleness-result 0 60 600 "more")))
    (is (=? {:health 100} (ai-index-health/staleness-result 60 60 600 nil))))
  (testing "values at or above the critical threshold are degraded"
    (is (=? {:health 0, :message #"Oldest pending change is 2\.8h old\."}
            (ai-index-health/staleness-result 9999 60 600 nil))))
  (testing "health is linear between the warning and critical thresholds"
    (is (=? {:health 50} (ai-index-health/staleness-result 330 60 600 nil)))))

(deftest ^:sequential run-measure!-test
  (let [calls (atom [])]
    (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
      (testing "a collector result updates the gauge and returns the health row"
        (is (= {:health 75 :message "ok"}
               (#'ai-index-health/run-measure! {:gauge-key :metabase-ai-index/coverage-ratio
                                                :engine    :semantic
                                                :collect   (constantly {:value   0.75
                                                                        :health  75
                                                                        :message "ok"})})))
        (is (= [[:metabase-ai-index/coverage-ratio {:engine "semantic"} 0.75]] @calls)))
      (testing "an inapplicable collector clears a live gauge and returns nil"
        (reset! calls [])
        (is (nil? (#'ai-index-health/run-measure! {:gauge-key :metabase-ai-index/coverage-ratio
                                                   :engine    :semantic
                                                   :collect   (constantly nil)})))
        (is (= 1 (count @calls)))
        (is (= [:metabase-ai-index/coverage-ratio {:engine "semantic"}] (butlast (first @calls))))
        (is (Double/isNaN ^double (last (first @calls)))))
      (testing "a throwing collector clears the gauge and returns a degraded row"
        (#'ai-index-health/run-measure! {:gauge-key :metabase-ai-index/coverage-ratio
                                         :engine    :throwing-collector-test
                                         :collect   (constantly {:value 0.9 :health 90 :message "was fine"})})
        (reset! calls [])
        (is (=? {:health 0, :message #"Metric collector errored: collector boom"}
                (#'ai-index-health/run-measure! {:gauge-key :metabase-ai-index/coverage-ratio
                                                 :engine    :throwing-collector-test
                                                 :collect   (fn []
                                                              (throw (ex-info "collector boom" {})))})))
        (is (= [:metabase-ai-index/coverage-ratio {:engine "throwing-collector-test"}]
               (butlast (first @calls))))
        (is (Double/isNaN ^double (last (first @calls))))))))

(deftest ^:sequential inapplicable-measure-does-not-create-series-test
  (testing "an inapplicable measure does not create a NaN-only series"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [& args] (swap! calls conj (vec args)))]
        (#'ai-index-health/run-measure! {:gauge-key :metabase-ai-index/coverage-ratio
                                         :engine    :never-emitted-test-engine
                                         :collect   (constantly nil)}))
      (is (empty? @calls)))))

(deftest ^:sequential failed-first-write-does-not-mark-series-live-test
  (testing "a failed first gauge write does not make later clears create a NaN-only series"
    (let [set-index-gauge! @#'ai-index-health/set-index-gauge!
          live             @#'ai-index-health/live-gauge-series
          series           [:metabase-ai-index/coverage-ratio :failed-write-test-engine]
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
          boom  {:check-name :test-boom
                 :gauge-key  :metabase-ai-index/staleness-seconds
                 :engine     :refresh-isolation-test
                 :collect    (fn [] (throw (ex-info "collector boom" {})))}
          ok    {:check-name :test-ok
                 :gauge-key  :metabase-ai-index/coverage-ratio
                 :engine     :refresh-isolation-test
                 :collect    (constantly {:value 1.0 :health 100 :message "ok"})}]
      (mt/with-dynamic-fn-redefs [analytics/set-gauge!       (fn [& args] (swap! calls conj (vec args)))
                                  health-inspector/enabled? (constantly false)]
        (#'ai-index-health/run-measure! (assoc boom :collect
                                               (constantly {:value 5 :health 100 :message "was fine"})))
        (reset! calls [])
        (run! #'ai-index-health/refresh-index-check! [boom ok]))
      (is (=? [[:metabase-ai-index/staleness-seconds {:engine "refresh-isolation-test"}
                (fn [v] (Double/isNaN ^double v))]
               [:metabase-ai-index/coverage-ratio {:engine "refresh-isolation-test"} 1.0]]
              @calls)))))
