(ns metabase-enterprise.library-branching.format.kinds.portable-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.format.kinds.portable :as portable]
   [metabase-enterprise.library-branching.format.kinds.test-util :as kinds.tu]
   [metabase-enterprise.library-branching.mutation.core :as mut]))

(set! *warn-on-reflection* true)

(def ^:private sd "Sample Database")
(def ^:private orders [sd "PUBLIC" "ORDERS"])
(def ^:private products [sd "PUBLIC" "PRODUCTS"])
(def ^:private total [sd "PUBLIC" "ORDERS" "TOTAL"])
(def ^:private product-id [sd "PUBLIC" "ORDERS" "PRODUCT_ID"])
(def ^:private card-id "cArDcArDcArDcArDcArD1")
(def ^:private metric-id "mEtRiCmEtRiCmEtRiCmE1")
(def ^:private segment-id "sEgMeNtsEgMeNtsEgMeN1")
(def ^:private measure-id "mEaSuReMeAsUrEmEaSuR1")
(def ^:private snippet-id "sNiPpEtsNiPpEtsNiPpE1")

(def ^:private query
  "A query in the JSON form with one reference of each rule."
  {:lib/type "mbql/query"
   :database sd
   :stages   [{:lib/type     "mbql.stage/mbql"
               :source-table orders
               :joins        [{:lib/type   "mbql/join"
                               :alias      "Products"
                               :stages     [{:lib/type "mbql.stage/mbql" :source-table products}]
                               :conditions [["=" {} ["field" {:source-field product-id} [sd "PUBLIC" "PRODUCTS" "ID"]]
                                             ["field" {} product-id]]]}]
               :aggregation  [["sum" {} ["field" {:base-type "type/Float"} total]]
                              ["metric" {} metric-id]
                              ["measure" {:name "m"} measure-id]]
               :filters      [["segment" {} segment-id]
                              [">" {} ["field" {} "count"] 1]]}
              {:lib/type "mbql.stage/mbql" :source-card card-id}
              {:lib/type      "mbql.stage/native"
               :native        "SELECT {{snippet: s}} {{#1-orders}} {{when}}"
               :template-tags {(keyword "snippet: s") {:type "snippet" :snippet-id snippet-id}
                               (keyword "#1-orders")  {:type "card" :card-id card-id}
                               :when                  {:type "dimension" :dimension ["field" {} [sd "PUBLIC" "ORDERS" "CREATED_AT"]]}}}]})

(deftest query-refs-test
  (testing "every reference of a query, by rule"
    (is (= #{[:database [:env [sd]]]
             [:source-table [:env orders]]
             [:source-table [:env products]]
             [:field [:env [sd "PUBLIC" "PRODUCTS" "ID"]]]
             [:field [:env product-id]]
             [:field [:env total]]
             [:field [:env [sd "PUBLIC" "ORDERS" "CREATED_AT"]]]
             [:metric metric-id]
             [:measure measure-id]
             [:segment segment-id]
             [:source-card card-id]
             [:snippet snippet-id]
             [:card card-id]}
           (portable/query-refs query))))
  (testing "a field by column name is no reference"
    (is (= #{} (portable/refs ["field" {:base-type "type/Integer"} "TOTAL"]))))
  (testing "a legacy field reference names its field"
    (is (= #{[:field [:env total]]} (portable/refs ["dimension" ["field" total nil]]))))
  (testing "the keys of the other attributes that hold references"
    (is (= #{[:card card-id] [:field [:env total]] [:table [:env orders]]}
           (portable/refs [{:values_source_config {:card_id card-id :value_field ["field" {} total]}}
                           {:table-id orders :sources [{:type "field" :field-id total}]}])))
    (is (= #{[:card card-id]} (portable/refs {:card-id card-id}))))
  (testing "a value of another shape at a reference position is kept as the target, so the item schema refuses it"
    (is (= #{[:metric "not an id"]} (portable/refs ["metric" {} "not an id"]))))
  (testing "the database is a reference of the query only"
    (is (= #{} (portable/refs {:database sd})))
    (is (= #{} (portable/query-refs nil)))))

(deftest implied-keys-test
  (testing "encode omits each :lib/type that the position implies"
    (is (= {:database sd
            :stages   [{:source-table orders
                        :joins        [{:alias "J" :stages [{:source-table products}]}]}
                       {:native "SELECT 1"}
                       {:filters []}]}
           (portable/omit-implied
            {:lib/type "mbql/query"
             :database sd
             :stages   [{:lib/type     "mbql.stage/mbql"
                         :source-table orders
                         :joins        [{:lib/type "mbql/join" :alias "J"
                                         :stages   [{:lib/type "mbql.stage/mbql" :source-table products}]}]}
                        {:lib/type "mbql.stage/native" :native "SELECT 1"}
                        {:lib/type "mbql.stage/mbql" :filters []}]}))))
  (testing "encode keeps a :lib/type that the position does not imply"
    (let [q {:lib/type "mbql/query"
             :stages   [{:lib/type "mbql.stage/native" :source-table orders}
                        {:lib/type "mbql.stage/mbql" :native "x"}
                        {:lib/type "mbql.stage/mbql" :joins [{:lib/type "other" :stages []}]}]}]
      (is (= {:stages [{:lib/type "mbql.stage/native" :source-table orders}
                       {:lib/type "mbql.stage/mbql" :native "x"}
                       {:joins [{:lib/type "other" :stages []}]}]}
             (portable/omit-implied q)))
      (is (= q (portable/restore-implied (portable/omit-implied q))))))
  (testing "decode adds each implied :lib/type, and keeps the written ones"
    (is (= {:lib/type "mbql/query"
            :stages   [{:lib/type "mbql.stage/native" :native "x"}
                       {:lib/type "mbql.stage/mbql" :joins [{:lib/type "mbql/join"
                                                             :stages   [{:lib/type "mbql.stage/mbql"}]}]}
                       {:lib/type "mbql.stage/native"}]}
           (portable/restore-implied {:stages [{:native "x"}
                                               {:joins [{:stages [{}]}]}
                                               {:lib/type "mbql.stage/native"}]}))))
  (testing "a value that is not a query is unchanged, and a part of a query that is not a stage or a join too"
    (doseq [x [nil "q" [] 1]]
      (is (= x (portable/restore-implied x)))
      (is (= x (portable/omit-implied x))))
    (doseq [x [{:stages "x"} {:stages [1 "s"]} {:stages [{:joins "j"}]}]]
      (is (= x (portable/omit-implied x)))
      (is (= x (portable/omit-implied (portable/restore-implied x))))))
  (testing "implied-keys? says whether each implied position has its :lib/type"
    (is (portable/implied-keys? query))
    (is (not (portable/implied-keys? (portable/omit-implied query))))
    (is (not (portable/implied-keys? (update-in query [:stages 0 :joins 0] dissoc :lib/type))))
    (is (not (portable/implied-keys? (update-in query [:stages 0 :joins 0 :stages 0] dissoc :lib/type))))))

(defspec implied-keys-round-trip-test 300
  (prop/for-all [q kinds.tu/query-gen]
    (and (portable/implied-keys? q)
         (= q (portable/restore-implied (portable/omit-implied q))))))

(def ^:private mutations
  [{:name   :no-restore
    :doc    "Decode does not restore the implied :lib/type of a stage, so a pulled query is not the pushed one."
    :target `portable/restore-implied
    :edits  [[:replace '(restore (map-joins restore-join stage) (implied-stage-type stage)) '(map-joins restore-join stage)]]}
   {:name   :no-join-restore
    :doc    "Decode does not restore the implied :lib/type of a join."
    :target `portable/restore-implied
    :edits  [[:replace '(restore (map-stages restore-stage join) "mbql/join") '(map-stages restore-stage join)]]}
   {:name   :no-omit
    :doc    "Encode writes the implied :lib/type keys."
    :target `portable/omit-implied
    :edits  [[:replace '(= implied (:lib/type m)) false]]}
   {:name   :stage-type-ignores-native
    :doc    "The implied stage type is always mbql, so a native stage gets the wrong type back."
    :target `portable/implied-stage-type
    :edits  [[:replace '(contains? stage :native) false]]}
   {:name   :no-source-card
    :doc    "A source card is not a reference, so a metric on a trashed card passes validation."
    :target `portable/item-keys
    :edits  [[:remove :source-card {:nth 0}] [:remove :source-card {:nth 0}]]}
   {:name   :no-item-clauses
    :doc    "A metric, segment or measure clause is not a reference."
    :target `portable/clause-ref
    :edits  [[:replace '(contains? item-clauses tag) false]]}
   {:name   :no-field-refs
    :doc    "A field clause is not a reference, so semantic validation cannot find a removed column."
    :target `portable/clause-ref
    :edits  [[:replace '(= "field" tag) false {:nth 0}] [:replace '(= "field" tag) false {:nth 0}]]}
   {:name   :no-database
    :doc    "The database of a query is not a reference."
    :target `portable/query-refs
    :edits  [[:replace '(string? db) false]]}])

(deftest portable-mutations-test
  (mut/check mutations {:tests [#'query-refs-test #'implied-keys-test]}))
