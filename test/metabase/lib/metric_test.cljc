(ns metabase.lib.metric-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def ^:private metric-id 100)

(def ^:private metadata-provider
  (lib.tu/mock-metadata-provider
   {:database meta/metadata
    :tables   [(meta/table-metadata :venues)]
    :fields   [(meta/field-metadata :venues :price)]
    :metrics  [{:id         metric-id
                :name       "Sum of Cans"
                :definition {:source-table (meta/id :venues)
                             :aggregation [[:sum [:field (meta/id :venues :price) nil]]]
                             :filter      [:= [:field (meta/id :venues :price) nil] 4]}
                :description "Number of toucans plus number of pelicans"}]}))

(def ^:private metric-clause
  [:metric {:lib/uuid (str (random-uuid))} metric-id])

(def ^:private query
  (-> (lib/query metadata-provider (meta/table-metadata :venues))
      (lib/aggregate metric-clause)))

(def ^:private metric-metadata
  (lib.metadata/metric query metric-id))

(deftest ^:parallel query-suggested-name-test
  (is (= "Venues, Sum of Cans"
         (lib.metadata.calculation/suggested-name query))))

(deftest ^:parallel display-name-test
  (doseq [metric [metric-clause
                  metric-metadata]
          style [nil
                 :default
                 :long]]
    (testing (str "metric = " (pr-str metric) "\n"
                  "style = " (pr-str style))
      (is (= "Sum of Cans"
             (if style
               (lib.metadata.calculation/display-name query -1 metric style)
               (lib.metadata.calculation/display-name query metric)))))))

(deftest ^:parallel unknown-display-name-test
  (let [metric [:metric {} 1]]
    (doseq [style [nil
                   :default
                   :long]]
      (testing (str "style = " (pr-str style))
        (is (= "[Unknown Metric]"
               (if style
                 (lib.metadata.calculation/display-name query -1 metric style)
                 (lib.metadata.calculation/display-name query metric))))))))

(deftest ^:parallel display-info-test
  (are [metric] (=? {:name              "sum_of_cans"
                     :display-name      "Sum of Cans"
                     :long-display-name "Sum of Cans"
                     :effective-type    :type/Integer
                     :description       "Number of toucans plus number of pelicans"}
                    (lib.metadata.calculation/display-info query metric))
    metric-clause
    metric-metadata))

(deftest ^:parallel unknown-display-info-test
  (is (=? {:effective-type    :type/*
           :display-name      "[Unknown Metric]"
           :long-display-name "[Unknown Metric]"}
          (lib.metadata.calculation/display-info query [:metric {} 1]))))

(deftest ^:parallel type-of-test
  (are [metric] (= :type/Integer
                   (lib.metadata.calculation/type-of query metric))
    metric-clause
    metric-metadata))

(deftest ^:parallel unknown-type-of-test
  (is (= :type/*
         (lib.metadata.calculation/type-of query [:metric {} 1]))))
