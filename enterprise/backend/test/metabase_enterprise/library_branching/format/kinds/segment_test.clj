(ns metabase-enterprise.library-branching.format.kinds.segment-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.segment :as segment]
   [metabase-enterprise.library-branching.format.kinds.table-item :as table-item]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private sd "Sample Database")
(def ^:private orders [sd "PUBLIC" "ORDERS"])
(def ^:private people [sd "PUBLIC" "PEOPLE"])
(def ^:private segment-id "lArGeOrDeRsSeGmEnT001")
(def ^:private other-segment-id "rEcEnToRdErSsEgMeNt01")
(def ^:private data-id "dAtAcOlLeCtIoNiD00000")

(defn- total [table] ["field" {:base-type "type/Float"} (conj table "TOTAL")])

(def ^:private definition
  {:lib/type "mbql/query"
   :database sd
   :stages   [{:lib/type     "mbql.stage/mbql"
               :source-table orders
               :filters      [[">" {} (total orders) 100]
                              ["segment" {} other-segment-id]]}]})

(defn- item
  "The segment on `place` with the definition `d`, and the references of its attributes."
  ([] (item orders definition))
  ([place d]
   {:kind  :segment
    :name  "Large orders"
    :place place
    :refs  (kinds/refs :segment segment-id {:definition d})
    :attrs {:definition d}}))

(defn- valid? [x] (mr/validate (codec/schema segment/codec) x))

(deftest encode-test
  (testing "the document of a segment: the place as table, the definition with no implied :lib/type"
    (is (= {:kind       "segment"
            :id         segment-id
            :name       "Large orders"
            :table      orders
            :definition {:database sd
                         :stages   [{:source-table orders
                                     :filters      [[">" {} (total orders) 100] ["segment" {} other-segment-id]]}]}}
           (codec/encode segment/codec segment-id (item)))))
  (testing "decode restores the implied :lib/type keys"
    (is (= [segment-id (item)] (codec/decode segment/codec (codec/encode segment/codec segment-id (item)))))))

(deftest refs-test
  (testing "the references of a segment: the database, the table and the fields of its definition, and the segments
            that it uses"
    (is (= #{[:database [:env [sd]]]
             [:source-table [:env orders]]
             [:field [:env (conj orders "TOTAL")]]
             [:segment other-segment-id]}
           (kinds/refs :segment segment-id {:definition definition})))))

(deftest attributes-test
  (testing "the content attributes of a segment"
    (is (= #{:description :points_of_interest :caveats :show_in_getting_started :definition}
           (set (keys (:attrs segment/spec))))))
  (testing "a segment that shows in getting started has the attribute; one that does not has none"
    (is (valid? (assoc-in (item) [:attrs :show_in_getting_started] true)))
    (is (not (valid? (assoc-in (item) [:attrs :show_in_getting_started] false)))))
  (testing "a segment needs a definition"
    (is (not (valid? (-> (item) (update :attrs dissoc :definition) (assoc :refs #{})))))))

(deftest place-test
  (is (valid? (item)))
  (testing "a segment is on a table: its place is the table key of the source table of its definition"
    (is (not (valid? (assoc (item) :place nil))))
    (is (not (valid? (assoc (item) :place data-id))))
    (is (not (valid? (assoc (item) :place people)))))
  (testing "the definition's database is the database of the place"
    (let [d (assoc definition :database "Aviary")]
      (is (not (valid? (item orders d))))))
  (testing "a definition on another table is valid with that table as the place"
    (let [d (assoc-in definition [:stages 0 :source-table] people)]
      (is (valid? (item people d)))
      (is (not (valid? (item orders d)))))))

(deftest definition-test
  (testing "a segment's definition is one MBQL stage on a table, with filters and no other clause"
    (doseq [[what d] [["no filter"        (update-in definition [:stages 0] dissoc :filters)]
                      ["empty filters"    (assoc-in definition [:stages 0 :filters] [])]
                      ["an aggregation"   (assoc-in definition [:stages 0 :aggregation] [["count" {}]])]
                      ["a breakout"       (assoc-in definition [:stages 0 :breakout] [(total orders)])]
                      ["a join"           (assoc-in definition [:stages 0 :joins] [])]
                      ["two stages"       (update definition :stages conj {:lib/type "mbql.stage/mbql"
                                                                           :filters  [[">" {} (total orders) 1]]})]
                      ["a source card"    (update-in definition [:stages 0] #(-> % (dissoc :source-table)
                                                                                 (assoc :source-card segment-id)))]
                      ["a native stage"   (assoc definition :stages [{:lib/type     "mbql.stage/native"
                                                                      :native       "SELECT 1"
                                                                      :source-table orders
                                                                      :filters      [[">" {} (total orders) 1]]}])]
                      ["no :lib/type"     (dissoc definition :lib/type)]]]
      (is (not (valid? (item orders d))) what))))

(deftest layout-test
  (testing "a segment is in the directory of its table; a segment and a measure with one name sit side by side"
    (let [table   {:kind  :published-table :name "Orders" :place data-id
                   :refs  (kinds/refs :published-table orders {}) :attrs {}}
          data    {:kind :collection :name "Data" :place nil :refs #{} :attrs {:type "library"}}
          measure-definition (-> definition
                                 (update-in [:stages 0] dissoc :filters)
                                 (assoc-in [:stages 0 :aggregation] [["count" {}]]))
          measure {:kind  :measure :name "Large orders" :place orders
                   :refs  (kinds/refs :measure "mEaSuReOfOrDeRs000001" {:definition measure-definition})
                   :attrs {:definition measure-definition}}]
      (is (= {data-id                "library/_collection.yaml"
              orders                 "library/orders.table.yaml"
              segment-id             "library/orders.table/large_orders.segment.yaml"
              "mEaSuReOfOrDeRs000001" "library/orders.table/large_orders.measure.yaml"}
             (layout/layout kinds/codecs {data-id data orders table segment-id (item)
                                          "mEaSuReOfOrDeRs000001" measure}))))))

(def ^:private mutations
  [{:name   :place-not-the-table
    :doc    "The schema does not check that the place is the table of the definition, so a file can put a segment on
            one table and filter another, and a write cannot hold PutGet."
    :target `table-item/on-its-table?
    :edits  [[:replace '(= place (source-table definition)) true]]}
   {:name   :database-unchecked
    :doc    "The schema does not check that the definition's database is the database of the place."
    :target `table-item/on-its-table?
    :edits  [[:replace '(= (first place) (:database definition)) true]]}
   {:name   :any-clause
    :doc    "A segment's definition may have clauses other than filters, which Metabase refuses on save."
    :target `segment/filters?
    :edits  [[:replace '(table-item/stage-keys? #{:filters} definition) true]]}
   {:name   :no-filter-needed
    :doc    "A segment's definition may have no filter, which Metabase refuses on save."
    :target `segment/filters?
    :edits  [[:replace '(seq filters) true]]}
   {:name   :more-stages
    :doc    "A table item's definition may have more than one stage."
    :target `table-item/stage
    :edits  [[:replace '(= 1 (count stages)) true]]}
   {:name   :definition-implied-not-restored
    :doc    "Decode does not restore the implied keys of the definition."
    :target `table-item/decode-attrs
    :edits  [[:replace '(update :definition portable/restore-implied) '(identity)]]}
   {:name   :definition-implied-written
    :doc    "Encode writes the implied keys of the definition."
    :target `table-item/encode-attrs
    :edits  [[:replace '(update :definition portable/omit-implied) '(identity)]]}
   {:name   :no-definition-refs
    :doc    "A table item has no references, so validate cannot find a removed segment that it uses."
    :target `table-item/refs
    :edits  [[:replace '(portable/query-refs (:definition attrs)) #{}]]}])

(deftest segment-mutations-test
  (mut/check mutations {:tests [#'encode-test #'refs-test #'place-test #'definition-test]}))
