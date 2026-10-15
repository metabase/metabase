(ns metabase-enterprise.library-branching.format.kinds.measure-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.measure :as measure]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private sd "Sample Database")
(def ^:private orders [sd "PUBLIC" "ORDERS"])
(def ^:private measure-id "tOtAlReVeNuEmEaSuRe01")
(def ^:private other-measure-id "dIsCoUnTmEaSuRe000001")
(def ^:private data-id "dAtAcOlLeCtIoNiD00000")

(def ^:private total ["field" {:base-type "type/Float"} (conj orders "TOTAL")])

(defn- with-aggregation
  [aggregation]
  {:lib/type "mbql/query"
   :database sd
   :stages   [{:lib/type "mbql.stage/mbql" :source-table orders :aggregation aggregation}]})

(def ^:private definition (with-aggregation [["sum" {} total]]))

(defn- item
  ([] (item definition))
  ([d]
   {:kind  :measure
    :name  "Total revenue"
    :place orders
    :refs  (kinds/refs :measure measure-id {:definition d})
    :attrs {:definition d}}))

(defn- valid? [x] (mr/validate (codec/schema measure/codec) x))

(deftest encode-test
  (testing "the document of a measure: the place as table, the definition with no implied :lib/type"
    (is (= {:kind       "measure"
            :id         measure-id
            :name       "Total revenue"
            :table      orders
            :definition {:database sd :stages [{:source-table orders :aggregation [["sum" {} total]]}]}}
           (codec/encode measure/codec measure-id (item)))))
  (testing "decode restores the implied :lib/type keys"
    (is (= [measure-id (item)] (codec/decode measure/codec (codec/encode measure/codec measure-id (item)))))))

(deftest refs-test
  (testing "the references of a measure: the database, the table and the fields of its definition, and the measures
            that it uses"
    (is (= #{[:database [:env [sd]]] [:source-table [:env orders]] [:field [:env (conj orders "TOTAL")]]}
           (kinds/refs :measure measure-id {:definition definition})))
    (is (= #{[:database [:env [sd]]] [:source-table [:env orders]] [:measure other-measure-id]}
           (kinds/refs :measure measure-id {:definition (with-aggregation [["measure" {} other-measure-id]])})))))

(deftest attributes-test
  (testing "the content attributes of a measure; its dimensions are not content"
    (is (= #{:description :definition} (set (keys (:attrs measure/spec)))))
    (is (not (valid? (assoc-in (item) [:attrs :dimensions] []))))))

(deftest definition-test
  (is (valid? (item)))
  (is (valid? (item (with-aggregation [["count" {}]]))))
  (is (valid? (item (with-aggregation [["measure" {} other-measure-id]]))))
  (testing "a measure's definition is one MBQL stage on its table, with one aggregation, no metric and no other clause"
    (doseq [[what d] [["no aggregation"    (update-in definition [:stages 0] dissoc :aggregation)]
                      ["two aggregations"  (with-aggregation [["count" {}] ["sum" {} total]])]
                      ["a metric"          (with-aggregation [["metric" {} other-measure-id]])]
                      ["a nested metric"   (with-aggregation [["+" {} ["count" {}] ["metric" {} other-measure-id]]])]
                      ["a filter"          (assoc-in definition [:stages 0 :filters] [[">" {} total 1]])]
                      ["a breakout"        (assoc-in definition [:stages 0 :breakout] [total])]
                      ["two stages"        (update definition :stages conj {:lib/type "mbql.stage/mbql"})]]]
      (is (not (valid? (item d))) what)))
  (testing "a measure is on the table of its definition"
    (is (not (valid? (assoc (item) :place nil))))
    (is (not (valid? (assoc (item) :place [sd "PUBLIC" "PEOPLE"]))))))

(deftest layout-test
  (testing "a measure is in the directory of its table"
    (let [table {:kind :published-table :name "Orders" :place data-id
                 :refs (kinds/refs :published-table orders {}) :attrs {}}
          data  {:kind :collection :name "Data" :place nil :refs #{} :attrs {:type "library"}}]
      (is (= "library/orders.table/total_revenue.measure.yaml"
             (get (layout/layout kinds/codecs {data-id data orders table measure-id (item)}) measure-id))))))

(def ^:private mutations
  [{:name   :any-clause
    :doc    "A measure's definition may have clauses other than its aggregation, which Metabase refuses on save."
    :target `measure/one-aggregation?
    :edits  [[:replace '(table-item/stage-keys? #{:aggregation} definition) true]]}
   {:name   :any-number-of-aggregations
    :doc    "A measure's definition may have several aggregations, or none."
    :target `measure/one-aggregation?
    :edits  [[:replace '(= 1 (count aggregation)) true]]}
   {:name   :metric-allowed
    :doc    "A measure may use a metric, which Metabase refuses on save."
    :target `measure/one-aggregation?
    :edits  [[:replace '(not-any? (comp #{:metric} first) (portable/refs aggregation)) true]]}])

(deftest measure-mutations-test
  (mut/check mutations {:tests [#'encode-test #'refs-test #'definition-test]}))
