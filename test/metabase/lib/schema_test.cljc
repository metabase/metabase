(ns metabase.lib.schema-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.util-test :as lib.schema.util-test]))

(deftest ^:parallel disallow-duplicate-uuids-test
  (testing "sanity check: make sure query is valid with different UUIDs"
    (is (not (mc/explain ::lib.schema/query lib.schema.util-test/query-with-no-duplicate-uuids))))
  (testing "should not validate if UUIDs are duplicated"
    (is (mc/explain ::lib.schema/query lib.schema.util-test/query-with-duplicate-uuids))
    (is (= ["Duplicate :lib/uuid \"00000000-0000-0000-0000-000000000001\""]
           (me/humanize (mc/explain ::lib.schema/query lib.schema.util-test/query-with-duplicate-uuids))))))

(def ^:private valid-join-Y
  {:lib/type    :mbql/join
   :lib/options {:lib/uuid "00000000-0000-0000-0000-000000000005"}
   :alias       "Y"
   :conditions  [[:=
                  {:lib/uuid "00000000-0000-0000-0000-000000000006"}
                  [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 1]
                  [:field {:lib/uuid "00000000-0000-0000-0000-000000000002", :join-alias "Y"} 2]]]
   :stages      [{:lib/type     :mbql.stage/mbql
                  :source-table 2}]})

(deftest ^:parallel check-join-references-test
  (are [stage errors] (= errors
                         (me/humanize (mc/explain ::lib.schema/stage stage)))
    {:lib/type     :mbql.stage/mbql
     :source-table "card__1"
     :joins        [valid-join-Y]
     :fields       [[:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :join-alias "Y"} 1]]}
    nil

    {:lib/type     :mbql.stage/mbql
     :source-table 1
     :fields       [[:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :join-alias "X"} 1]]}
    ["Invalid :field reference: no join named \"X\""]))

(def ^:private valid-ag-1
  [:count {:lib/uuid "00000000-0000-0000-0000-000000000001"}])

(def ^:private valid-ag-2
  [:sum
   {:lib/uuid "00000000-0000-0000-0000-000000000001"}
   [:field
    {:lib/uuid "00000000-0000-0000-0000-000000000002"}
    2]])

(deftest ^:parallel check-aggregation-references-test
  (are [stage errors] (= errors
                         (me/humanize (mc/explain ::lib.schema/stage stage)))
    {:lib/type     :mbql.stage/mbql
     :source-table 1
     :aggregation  [valid-ag-1 valid-ag-2]
     :fields       [[:aggregation {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]]}
    nil

    {:lib/type     :mbql.stage/mbql
     :source-table 1
     :fields       [[:aggregation {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]]}
    ["Invalid :aggregation reference: no aggregation at index 1"]

    {:lib/type     :mbql.stage/mbql
     :source-table 1
     :aggregation  [valid-ag-1]
     :fields       [[:aggregation {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]]}
    ["Invalid :aggregation reference: no aggregation at index 1"]))

(def ^:private valid-expression
  [:+
   {:lib/uuid "00000000-0000-0000-0000-000000000001"}
   [:field
    {:lib/uuid "00000000-0000-0000-0000-000000000002"}
    2]
   2])

(deftest ^:parallel check-expression-references-test
  (are [stage errors] (= errors
                         (me/humanize (mc/explain ::lib.schema/stage stage)))
    {:lib/type     :mbql.stage/mbql
     :source-table 1
     :expressions  {"price + 2" valid-expression}
     :fields       [[:expression {:lib/uuid "00000000-0000-0000-0000-000000000000"} "price + 2"]]}
    nil

    {:lib/type     :mbql.stage/mbql
     :source-table 1
     :expressions  {"price + 1" valid-expression}
     :fields       [[:expression {:lib/uuid "00000000-0000-0000-0000-000000000000"} "price + 2"]]}
    ["Invalid :expression reference: no expression named \"price + 2\""]

    {:lib/type     :mbql.stage/mbql
     :source-table 1
     :fields       [[:expression {:lib/uuid "00000000-0000-0000-0000-000000000000"} "price + 2"]]}
    ["Invalid :expression reference: no expression named \"price + 2\""]))
