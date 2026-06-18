(ns metabase.metabot.quality.constants-test
  "Coherence tests for the metric registry. These are the guard that makes the
  registry a real single source: if the vocabulary drifts between the registry,
  the pipeline, or the observable taxonomy, one of these fails."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.quality.constants :as constants]
   [metabase.metabot.quality.metrics :as metrics]))

(set! *warn-on-reflection* true)

(deftest registry-is-coherent-test
  (testing "metric keys are unique"
    (let [ks (map :key constants/metrics)]
      (is (= (count ks) (count (distinct ks))))))
  (testing "every metric belongs to a known subscore"
    (is (every? #{:data-source-quality :execution-health :artifact-validity}
                (map :subscore constants/metrics))))
  (testing "metrics-for-subscore partitions the registry, in order, with nothing dropped"
    (is (= (map :key constants/metrics)
           (concat (constants/metrics-for-subscore :data-source-quality)
                   (constants/metrics-for-subscore :execution-health)
                   (constants/metrics-for-subscore :artifact-validity))))))

(deftest observable-metric-refs-name-real-metrics-test
  (testing "every observable maps to a metric in the registry, so no derived
            metric reference can name a metric that doesn't exist"
    (is (every? (set (map :key constants/metrics))
                (vals constants/observable->metric)))))

(deftest compute-emits-exactly-the-registry-metrics-test
  (testing "metrics/compute's output keys are exactly the registry vocabulary"
    (let [out (metrics/compute {:sets        {:authored {} :discovered {} :inspected {} :hallucinated {}}
                                :tool-events []
                                :temporal    {:terminal-state :final_response}}
                               {})]
      (is (= (set (map :key constants/metrics))
             (set (keys out)))))))

(deftest json-key-helpers-agree-test
  (testing "metric-json-key is the keyword form of metric-json-name"
    (is (every? (fn [{:keys [key]}]
                  (= (constants/metric-json-key key)
                     (keyword (constants/metric-json-name key))))
                constants/metrics))))
