(ns metabase.usage-metadata.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.usage-metadata.core :as usage-metadata]
   [metabase.usage-metadata.insights :as insights]))

(def ^:private sample-segment
  {:predicate [:= [:field 1 nil] 1]
   :source    {:type :card, :id 99, :name "Q", :display-name "Q"}
   :fields    [{:id 1, :name "f", :display-name "F"}]
   :count     1})

(def ^:private sample-metric
  {:source      {:type :table, :id 42, :name "T", :display-name "T", :db-id 1, :schema nil}
   :aggregation {:type :count, :field nil, :temporal-field nil, :temporal-unit nil}
   :count       1})

(def ^:private sample-dimension
  {:source    {:type :table, :id 42, :name "T", :display-name "T", :db-id 1, :schema nil}
   :dimension {:field {:id 1, :name "f", :display-name "F"}, :temporal-unit nil, :binning nil}
   :count     1})

(def ^:private sample-suggested-segment
  {:clause        [:and [:= [:field 1 nil] 1] [:> [:field 2 nil] 0]]
   :itemset-size  2
   :source        {:type :table, :id 42, :name "T", :display-name "T", :db-id 1, :schema nil}
   :support       3
   :support-ratio 1.0})

(def ^:private sample-profile-observation
  {:source      {:type :table, :id 42, :name "T", :display-name "T", :db-id 1, :schema nil}
   :field       {:id 1, :name "f", :display-name "F"}
   :basis       :fingerprint
   :observation {:type :low-cardinality, :value 5}
   :count       1})

(deftest ^:parallel implicit-segments-delegate-to-insights-test
  (let [captured-args (atom nil)]
    (mt/with-dynamic-fn-redefs [insights/implicit-segments
                                (fn [opts]
                                  (reset! captured-args opts)
                                  [sample-segment])]
      (is (= [sample-segment]
             (usage-metadata/implicit-segments {:source-type :card, :source-id 99, :limit 3})))
      (is (= {:source-type :card, :source-id 99, :limit 3}
             @captured-args)))))

(deftest ^:parallel implicit-metrics-delegate-to-insights-test
  (let [captured-args (atom nil)]
    (mt/with-dynamic-fn-redefs [insights/implicit-metrics
                                (fn [opts]
                                  (reset! captured-args opts)
                                  [sample-metric])]
      (is (= [sample-metric]
             (usage-metadata/implicit-metrics {:source-type :table, :source-id 42, :limit 7})))
      (is (= {:source-type :table, :source-id 42, :limit 7}
             @captured-args)))))

(deftest ^:parallel implicit-dimensions-delegate-to-insights-test
  (let [captured-args (atom nil)]
    (mt/with-dynamic-fn-redefs [insights/implicit-dimensions
                                (fn [opts]
                                  (reset! captured-args opts)
                                  [sample-dimension])]
      (is (= [sample-dimension]
             (usage-metadata/implicit-dimensions {:source-type :table, :source-id 42, :limit 9})))
      (is (= {:source-type :table, :source-id 42, :limit 9}
             @captured-args)))))

(deftest ^:parallel suggested-segments-delegate-to-insights-test
  (let [captured-args (atom nil)]
    (mt/with-dynamic-fn-redefs [insights/suggested-segments-for-owner
                                (fn [opts]
                                  (reset! captured-args opts)
                                  [sample-suggested-segment])]
      (is (= [sample-suggested-segment]
             (usage-metadata/suggested-segments {:source-type :table, :source-id 42, :limit 5})))
      (is (= {:source-type :table, :source-id 42, :limit 5}
             @captured-args)))))

(deftest ^:parallel profile-observations-delegate-to-insights-test
  (let [captured-args (atom nil)]
    (mt/with-dynamic-fn-redefs [insights/profile-observations
                                (fn [opts]
                                  (reset! captured-args opts)
                                  [sample-profile-observation])]
      (is (= [sample-profile-observation]
             (usage-metadata/profile-observations {:source-type :table, :source-id 42, :limit 4})))
      (is (= {:source-type :table, :source-id 42, :limit 4}
             @captured-args)))))
