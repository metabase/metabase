(ns metabase.usage-metadata.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.usage-metadata.core :as usage-metadata]
   [metabase.usage-metadata.insights :as insights]))

(deftest implicit-segments-delegate-to-insights-test
  (let [captured-args (atom nil)]
    (with-redefs [insights/implicit-segments
                  (fn [opts]
                    (reset! captured-args opts)
                    [{:count 1}])]
      (is (= [{:count 1}]
             (usage-metadata/implicit-segments {:source-type :card, :source-id 99, :limit 3})))
      (is (= {:source-type :card, :source-id 99, :limit 3}
             @captured-args)))))

(deftest implicit-metrics-delegate-to-insights-test
  (let [captured-args (atom nil)]
    (with-redefs [insights/implicit-metrics
                  (fn [opts]
                    (reset! captured-args opts)
                    [{:count 1}])]
      (is (= [{:count 1}]
             (usage-metadata/implicit-metrics {:source-type :table, :source-id 42, :limit 7})))
      (is (= {:source-type :table, :source-id 42, :limit 7}
             @captured-args)))))

(deftest implicit-dimensions-delegate-to-insights-test
  (let [captured-args (atom nil)]
    (with-redefs [insights/implicit-dimensions
                  (fn [opts]
                    (reset! captured-args opts)
                    [{:count 1}])]
      (is (= [{:count 1}]
             (usage-metadata/implicit-dimensions {:source-type :table, :source-id 42, :limit 9})))
      (is (= {:source-type :table, :source-id 42, :limit 9}
             @captured-args)))))
