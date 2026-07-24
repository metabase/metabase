(ns metabase.metrics.dimension-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.metrics.dimension :as metrics.dimension]
   [metabase.test :as mt]
   [metabase.util.log.capture :as log.capture]
   [toucan2.core :as t2]))

(defn- metric
  "A metric-shaped map with one dimension per `[dim-id field-id]` pair."
  [& dim-id+field-id]
  {:dimensions         (for [[dim-id _] dim-id+field-id]
                         {:id dim-id})
   :dimension_mappings (for [[dim-id field-id] dim-id+field-id]
                         {:dimension-id dim-id
                          :target       [:field {} field-id]})})

(deftest annotate-dimensions-resolves-each-dimension-once-test
  (testing "annotate-dimensions-with-field-data resolves each dimension's field-id exactly once"
    ;; It used to resolve once to collect the field-ids to batch-select, then again per dimension
    ;; while merging the rows back on — double the work, and `resolve-dimension-to-field-id` walks
    ;; the mapping list for every call.
    (let [metrics    [(metric ["d1" (mt/id :venues :price)]
                              ["d2" (mt/id :venues :name)])
                      (metric ["d3" (mt/id :orders :total)])]
          calls      (atom 0)
          real-resolve lib-metric/resolve-dimension-to-field-id]
      (with-redefs [lib-metric/resolve-dimension-to-field-id
                    (fn [dims mappings dim-id]
                      (swap! calls inc)
                      (real-resolve dims mappings dim-id))]
        (metrics.dimension/annotate-dimensions-with-field-data [:description] metrics))
      (is (= 3 @calls)
          "one resolution per (metric, dimension) pair — 3 dimensions across 2 metrics"))))

(deftest annotate-dimensions-merges-field-columns-test
  (testing "requested Field columns are merged onto each dimension"
    (let [price-id (mt/id :venues :price)
          name-id  (mt/id :venues :name)
          expected (t2/select-pk->fn :description [:model/Field :id :description]
                                     :id [:in [price-id name-id]])
          [m]      (metrics.dimension/annotate-dimensions-with-field-data
                    [:description]
                    [(metric ["d1" price-id] ["d2" name-id])])]
      (is (= [(get expected price-id) (get expected name-id)]
             (map :description (:dimensions m))))
      (is (= ["d1" "d2"] (map :id (:dimensions m)))
          "dimension order and identity are preserved"))))

(deftest annotate-dimensions-nils-unresolvable-dimensions-test
  (testing "a dimension whose field-id can't be resolved still gets the columns, as nil"
    (let [[m] (metrics.dimension/annotate-dimensions-with-field-data
               [:description]
               ;; no mapping for d1 → resolve throws
               [{:dimensions [{:id "d1"}] :dimension_mappings []}])]
      (is (= [nil] (map :description (:dimensions m))))
      (is (contains? (first (:dimensions m)) :description)
          "the column key is present even when unresolvable"))))

(deftest annotate-dimensions-logs-resolution-failures-test
  (testing "an unresolvable dimension is logged rather than silently swallowed"
    (let [msgs (log.capture/with-log-messages-for-level
                 [msgs [metabase.metrics.dimension :debug]]
                 (metrics.dimension/annotate-dimensions-with-field-data
                  [:description]
                  [{:dimensions [{:id "d1"}] :dimension_mappings []}])
                 (msgs))]
      (is (some #(str/includes? (str (:message %)) "d1") msgs)
          "the failing dimension id should appear in the log"))))

(deftest annotate-dimensions-passes-through-metrics-without-dimensions-test
  (testing "metrics with no dimensions are returned untouched"
    (is (= [{:name "no dims"} {:name "empty dims" :dimensions []}]
           (metrics.dimension/annotate-dimensions-with-field-data
            [:description]
            [{:name "no dims"} {:name "empty dims" :dimensions []}])))))
