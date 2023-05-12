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

(def ^:private valid-ag-1
  [:count {:lib/uuid (str (random-uuid))}])

(def ^:private valid-ag-2
  [:sum
   {:lib/uuid (str (random-uuid))}
   [:field
    {:lib/uuid (str (random-uuid))}
    2]])

(deftest ^:parallel check-aggregation-references-test
  (let [bad-ref (str (random-uuid))
        good-ref (:lib/uuid (second valid-ag-1))]
    (are [stage errors] (= errors
                           (me/humanize (mc/explain ::lib.schema/stage stage)))
      {:lib/type     :mbql.stage/mbql
       :source-table 1
       :aggregation  [valid-ag-1 valid-ag-2]
       :fields       [[:aggregation {:lib/uuid (str (random-uuid))} good-ref]]}
      nil

      {:lib/type     :mbql.stage/mbql
       :source-table 1
       :fields       [[:aggregation {:lib/uuid (str (random-uuid))} bad-ref]]}
      [(str "Invalid :aggregation reference: no aggregation with uuid " bad-ref)]

      {:lib/type     :mbql.stage/mbql
       :source-table 1
       :aggregation  [valid-ag-1]
       :fields       [[:aggregation {:lib/uuid (str (random-uuid))} bad-ref]]}
      [(str "Invalid :aggregation reference: no aggregation with uuid " bad-ref)]

      ;; don't recurse into joins.
      {:lib/type     :mbql.stage/mbql
       :source-table 1
       :joins        [{:lib/type    :mbql/join
                       :lib/options {:lib/uuid (str (random-uuid))}
                       :alias       "Q1"
                       :fields      :all
                       :conditions  [[:=
                                      {:lib/uuid (str (random-uuid))}
                                      [:field {:lib/uuid (str (random-uuid))} 1]
                                      [:field {:join-alias "Q1", :lib/uuid (str (random-uuid))} 2]]]
                       :stages      [{:lib/type     :mbql.stage/mbql
                                      :source-table 3
                                      :aggregation  [valid-ag-1]
                                      :order-by     [[:asc
                                                      {:lib/uuid (str (random-uuid))}
                                                      [:aggregation {:lib/uuid (str (random-uuid))} good-ref]]]}
                                     {:lib/type :mbql.stage/mbql, :lib/options {:lib/uuid (str (random-uuid))}}]}]}
      nil)))

(def ^:private valid-expression
  [:+
   {:lib/uuid (str (random-uuid))}
   [:field
    {:lib/uuid (str (random-uuid))}
    2]
   2])

(deftest ^:parallel check-expression-references-test
  (are [stage errors] (= errors
                         (me/humanize (mc/explain ::lib.schema/stage stage)))
    {:lib/type     :mbql.stage/mbql
     :source-table 1
     :expressions  {"price + 2" valid-expression}
     :fields       [[:expression {:lib/uuid (str (random-uuid))} "price + 2"]]}
    nil

    {:lib/type     :mbql.stage/mbql
     :source-table 1
     :expressions  {"price + 1" valid-expression}
     :fields       [[:expression {:lib/uuid (str (random-uuid))} "price + 2"]]}
    ["Invalid :expression reference: no expression named \"price + 2\""]

    {:lib/type     :mbql.stage/mbql
     :source-table 1
     :fields       [[:expression {:lib/uuid (str (random-uuid))} "price + 2"]]}
    ["Invalid :expression reference: no expression named \"price + 2\""]

    ;; don't recurse into joins.
    {:lib/type     :mbql.stage/mbql
     :source-table 1
     :joins        [{:lib/type    :mbql/join
                     :lib/options {:lib/uuid (str (random-uuid))}
                     :alias       "Q1"
                     :fields      :all
                     :conditions  [[:=
                                    {:lib/uuid (str (random-uuid))}
                                    [:field {:lib/uuid (str (random-uuid))} 1]
                                    [:field {:join-alias "Q1", :lib/uuid (str (random-uuid))} 2]]]
                     :stages      [{:lib/type     :mbql.stage/mbql
                                    :source-table 3
                                    :expressions  {"price + 2" valid-expression}
                                    :order-by     [[:asc
                                                    {:lib/uuid (str (random-uuid))}
                                                    [:expression {:lib/uuid (str (random-uuid))} "price + 2"]]]}
                                   {:lib/type :mbql.stage/mbql, :lib/options {:lib/uuid (str (random-uuid))}}]}]}
    nil))

(defn- valid-join
  ([join-alias]
   (valid-join
    join-alias
    [:=
     {:lib/uuid (str (random-uuid))}
     [:field {:lib/uuid (str (random-uuid))} 1]
     [:field {:lib/uuid (str (random-uuid)), :join-alias join-alias} 2]]))

  ([join-alias condition]
   {:lib/type    :mbql/join
    :lib/options {:lib/uuid (str (random-uuid))}
    :alias       join-alias
    :conditions  [condition]
    :stages      [{:lib/type     :mbql.stage/mbql
                   :source-table 2}]}))

(deftest ^:parallel check-join-references-test
  (are [stage errors] (= errors
                         (me/humanize (mc/explain ::lib.schema/stages stage)))
    [{:lib/type     :mbql.stage/mbql
      :source-table 1
      :joins        [(valid-join "Y")]
      :fields       [[:field {:lib/uuid (str (random-uuid)), :join-alias "Y"} 1]]}]
    nil

    [{:lib/type     :mbql.stage/mbql
      :source-table 1
      :fields       [[:field {:lib/uuid (str (random-uuid)), :join-alias "X"} 1]]}]
    ["Invalid :field reference in stage 0: no join named \"X\""]

    ;; join referencing another join: should be OK
    [{:lib/type     :mbql.stage/mbql
      :source-table "card__1"
      :joins        [(valid-join "A" [:=
                                      {:lib/uuid (str (random-uuid))}
                                      [:field {:lib/uuid (str (random-uuid))} 1]
                                      [:field {:lib/uuid (str (random-uuid))} 2]])
                     (valid-join "B" [:=
                                      {:lib/uuid (str (random-uuid))}
                                      [:field {:lib/uuid (str (random-uuid)), :join-alias "A"} 1]
                                      [:field {:lib/uuid (str (random-uuid)), :join-alias "B"} 2]])]
      :fields       [[:field {:lib/uuid (str (random-uuid)), :join-alias "A"} 1]
                     [:field {:lib/uuid (str (random-uuid)), :join-alias "B"} 1]]}]
    nil

    ;; reference for a join from a previous stage: should be ok
    [{:lib/type     :mbql.stage/mbql
      :source-table "card__1"
      :joins        [(valid-join "Y")]}
     {:lib/type :mbql.stage/mbql
      :fields   [[:field {:lib/uuid (str (random-uuid)), :join-alias "Y"} 1]]}]
    nil

    [{:lib/type     :mbql.stage/mbql
      :source-table 1
      :joins        [(valid-join "X")]}
     {:lib/type :mbql.stage/mbql
      :fields   [[:field {:lib/uuid (str (random-uuid)), :join-alias "Y"} 1]]}]
    ["Invalid :field reference in stage 1: no join named \"Y\""]

    ;; we have no way of knowing what sort of joins are inside a Card, so if we have a Card source query unfortunately
    ;; we're just going to have to skip validation for now.
    [{:lib/type     :mbql.stage/mbql
      :source-table "card__1"
      :joins        [(valid-join "X")]}
     {:lib/type :mbql.stage/mbql
      :fields   [[:field {:lib/uuid (str (random-uuid)), :join-alias "Y"} 1]]}]
    nil

    ;; apparently, this is also allowed for join aliases introduced inside the joins themselves =(
    [{:lib/type     :mbql.stage/mbql
      :source-table "card__1"
      :joins        [(assoc-in (valid-join "X") [:stages 0 :joins] [(valid-join "A")])]}
     {:lib/type :mbql.stage/mbql
      :fields   [[:field {:lib/uuid (str (random-uuid)), :join-alias "A"} 1]]}]
    nil))
