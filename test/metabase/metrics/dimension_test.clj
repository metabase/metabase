(ns metabase.metrics.dimension-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.metrics.dimension :as metrics.dimension]
   [metabase.test :as mt]
   [metabase.util.log.capture :as log.capture]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- API Shape -------------------------------------------------

(deftest ->api-dimension-test
  (testing "snake_case keys, stringified type keywords, sources keep the kebab :field-id key"
    (is (= {:id                        "aaaaaaaa-0000-0000-0000-000000000000"
            :name                      "CATEGORY"
            :display_name              "Category"
            :effective_type            "type/Text"
            :semantic_type             "type/Category"
            :has_field_values          "list"
            :status                    :status/active
            :dimension_interestingness 0.5
            :group                     {:id "g1" :type "main" :display_name "Venues"}
            :sources                   [{:type :field :field-id 123}]}
           (metrics.dimension/->api-dimension
            {:id                        "aaaaaaaa-0000-0000-0000-000000000000"
             :name                      "CATEGORY"
             :display-name              "Category"
             :effective-type            :type/Text
             :semantic-type             :type/Category
             :has-field-values          :list
             :status                    :status/active
             :dimension-interestingness 0.5
             :group                     {:id "g1" :type "main" :display-name "Venues"}
             :sources                   [{:type :field :field-id 123}]}))))
  (testing ":display_name falls back to :name; the always-on-the-wire keys are present even when nil"
    (is (= {:id "d2" :name "FOO" :display_name "FOO" :effective_type nil :semantic_type nil}
           (metrics.dimension/->api-dimension {:id "d2" :name "FOO"}))))
  (testing "internal keys and annotated Field columns other than :dimension-interestingness are stripped"
    (is (= {:id "d3" :name "BAR" :display_name "BAR" :effective_type nil :semantic_type nil}
           (metrics.dimension/->api-dimension
            {:id "d3" :name "BAR" :lib/source :source/table-defaults :source-type :metric :description "field col"}))))
  (testing "a zero :dimension-interestingness is kept, nil is dropped"
    (is (= 0 (:dimension_interestingness (metrics.dimension/->api-dimension {:id "d4" :dimension-interestingness 0}))))
    (is (not (contains? (metrics.dimension/->api-dimension {:id "d5" :dimension-interestingness nil})
                        :dimension_interestingness))))
  (testing "source entries always carry :field-id (nil when missing) and drop other keys"
    (is (= [{:type :field :field-id nil}]
           (:sources (metrics.dimension/->api-dimension {:id "d8" :sources [{:type :field :binning true}]}))))))

(deftest ->api-dimension-mapping-test
  (testing "snake_case keys; the MBQL :target ref passes through untouched"
    (is (= {:dimension_id "m1"
            :type         :table
            :table_id     7
            :target       [:field {:source-field 1 :lib/uuid "u"} 2]}
           (metrics.dimension/->api-dimension-mapping
            {:dimension-id "m1"
             :type         :table
             :table-id     7
             :target       [:field {:source-field 1 :lib/uuid "u"} 2]}))))
  (testing "nil :type/:table-id are dropped; :dimension_id and :target are always present"
    (is (= {:dimension_id "m2" :target [:field {} 9]}
           (metrics.dimension/->api-dimension-mapping {:dimension-id "m2" :target [:field {} 9]})))))

(defn- entry-form
  "The declared form of `k`'s entry in map schema `schema`."
  [schema k]
  (some (fn [[entry-k _props entry-schema]]
          (when (= k entry-k)
            (mc/form entry-schema)))
        (mc/children (mc/deref-all (mc/schema schema)))))

(deftest wire-schemas-keep-named-references-test
  (testing "wire annotation preserves registry references instead of inlining them, so a change to a
           referenced schema propagates and OpenAPI/error output keeps the schema names"
    (is (= [:maybe :metabase.metrics.dimension/group]
           (entry-form ::metrics.dimension/dimension :group)))
    (is (= [:maybe [:sequential :metabase.metrics.dimension/source]]
           (entry-form ::metrics.dimension/dimension :sources)))
    (is (= :metabase.lib-metric.schema/dimension-id
           (entry-form ::metrics.dimension/dimension :id)))
    (is (= :metabase.lib-metric.schema/dimension-id
           (entry-form ::metrics.dimension/dimension-mapping :dimension-id)))))

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
