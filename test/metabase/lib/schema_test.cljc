(ns metabase.lib.schema-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [malli.error :as me]
   [metabase.lib.metadata.protocols]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.schema.util-test :as lib.schema.util-test]
   [metabase.util.malli.registry :as mr]))

(comment
  metabase.lib.metadata.protocols/keep-me ; so `:metabase.lib.metadata.protocols/metadata-provider` gets loaded
  #?(:cljs metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel disallow-duplicate-uuids-test
  (testing "sanity check: make sure query is valid with different UUIDs"
    (is (not (mr/explain ::lib.schema/query lib.schema.util-test/query-with-no-duplicate-uuids))))
  (testing "should not validate if UUIDs are duplicated"
    (is (mr/explain ::lib.schema/query lib.schema.util-test/query-with-duplicate-uuids))
    (is (= ["Duplicate :lib/uuid #{\"00000000-0000-0000-0000-000000000001\"}"]
           (me/humanize (mr/explain ::lib.schema/query lib.schema.util-test/query-with-duplicate-uuids))))))

(deftest ^:parallel disallow-duplicate-order-bys-test
  (testing "query should validate if order-bys are not duplicated"
    (let [query-with-no-duplicate-order-bys
          {:lib/type :mbql/query
           :database 1
           :stages   [{:lib/type :mbql.stage/mbql
                       :source-table 2
                       :order-by
                       [[:asc
                         {:lib/uuid "00000000-0000-0000-0000-000000000020"}
                         [:field
                          {:lib/uuid "00000000-0000-0000-0000-000000000030"
                           :base-type :type/BigInteger}
                          3]]
                        [:desc
                         {:lib/uuid "00000000-0000-0000-0000-000000000040"}
                         [:field
                          {:lib/uuid "00000000-0000-0000-0000-000000000050"
                           :base-type :type/Integer}
                          4]]]}]}]
      (is (not (mr/explain ::lib.schema/query query-with-no-duplicate-order-bys))))))

(deftest ^:parallel disallow-duplicate-order-bys-test-2
  (testing "query should not validate if order-bys are duplicated"
    (let [query-with-duplicate-order-bys
          {:lib/type :mbql/query
           :database 1
           :stages   [{:lib/type :mbql.stage/mbql
                       :source-table 2
                       :order-by
                       [[:asc
                         {:lib/uuid "00000000-0000-0000-0000-000000000020"}
                         [:field
                          {:lib/uuid "00000000-0000-0000-0000-000000000030"
                           :base-type :type/Integer}
                          3]]
                        [:asc
                         {:lib/uuid "00000000-0000-0000-0000-000000000040"}
                         [:field
                          {:lib/uuid "00000000-0000-0000-0000-000000000050"
                           :base-type :type/Integer}
                          3]]]}]}]
      (is (mr/explain ::lib.schema/query query-with-duplicate-order-bys))
      (is (=? {:stages [{:order-by [#"^Duplicate values ignoring uuids in.*"]}]}
              (me/humanize (mr/explain ::lib.schema/query query-with-duplicate-order-bys)))))))

(deftest ^:parallel allow-blank-database-test
  (testing ":database field can be missing"
    (is (not (mr/explain ::lib.schema/query {:lib/type :mbql/query
                                             :stages   [{:lib/type :mbql.stage/native
                                                         :native   "SELECT 1"}]})))))

(def ^:private valid-ag-1
  [:count {:lib/uuid (str (random-uuid))}])

(def ^:private valid-ag-2
  [:sum
   {:lib/uuid (str (random-uuid))}
   [:field
    {:lib/uuid (str (random-uuid))}
    2]])

(deftest ^:parallel check-aggregation-references-test
  (let [bad-ref  (str (random-uuid))
        good-ref (:lib/uuid (second valid-ag-1))]
    (are [stage errors] (= errors
                           (me/humanize (mr/explain ::lib.schema/stage stage)))
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

      ;; if we forget to remove legacy ag refs from some part of the query make sure we get a useful error message.
      {:lib/type           :mbql.stage/mbql
       :some-other-section {:field-ref [:aggregation 0]}}
      ["Invalid :aggregation reference: [:aggregation 0]"]

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
   {:lib/uuid (str (random-uuid))
    :lib/expression-name "price + 2"}
   [:field
    {:lib/uuid (str (random-uuid))}
    2]
   2])

(deftest ^:parallel check-expression-references-test
  (are [stage errors] (= errors
                         (me/humanize (mr/explain ::lib.schema/stage stage)))
    {:lib/type     :mbql.stage/mbql
     :source-table 1
     :expressions  [valid-expression]
     :fields       [[:expression {:lib/uuid (str (random-uuid))} "price + 2"]]}
    nil

    {:lib/type     :mbql.stage/mbql
     :source-table 1
     :expressions  [valid-expression]
     :fields       [[:expression {:lib/uuid (str (random-uuid))} "price + 1"]]}
    ["Invalid :expression reference: no expression named \"price + 1\""]

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
                                    :expressions  [valid-expression]
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
                         (me/humanize (mr/explain ::lib.schema/stages stage)))
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
    [{:lib/type    :mbql.stage/mbql
      :source-card 1
      :joins       [(valid-join "A" [:=
                                     {:lib/uuid (str (random-uuid))}
                                     [:field {:lib/uuid (str (random-uuid))} 1]
                                     [:field {:lib/uuid (str (random-uuid))} 2]])
                    (valid-join "B" [:=
                                     {:lib/uuid (str (random-uuid))}
                                     [:field {:lib/uuid (str (random-uuid)), :join-alias "A"} 1]
                                     [:field {:lib/uuid (str (random-uuid)), :join-alias "B"} 2]])]
      :fields      [[:field {:lib/uuid (str (random-uuid)), :join-alias "A"} 1]
                    [:field {:lib/uuid (str (random-uuid)), :join-alias "B"} 1]]}]
    nil

    ;; reference for a join from a previous stage: should be ok
    [{:lib/type    :mbql.stage/mbql
      :source-card 1
      :joins       [(valid-join "Y")]}
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
    [{:lib/type    :mbql.stage/mbql
      :source-card 1
      :joins       [(valid-join "X")]}
     {:lib/type :mbql.stage/mbql
      :fields   [[:field {:lib/uuid (str (random-uuid)), :join-alias "Y"} 1]]}]
    nil

    ;; apparently, this is also allowed for join aliases introduced inside the joins themselves =(
    [{:lib/type    :mbql.stage/mbql
      :source-card 1
      :joins       [(assoc-in (valid-join "X") [:stages 0 :joins] [(valid-join "A")])]}
     {:lib/type :mbql.stage/mbql
      :fields   [[:field {:lib/uuid (str (random-uuid)), :join-alias "A"} 1]]}]
    nil))

(deftest ^:parallel enforce-distinct-breakouts-and-fields-test
  (let [duplicate-refs [[:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]
                        [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 1]]]
    (testing #'lib.schema.util/distinct-refs?
      (is (not (#'lib.schema.util/distinct-refs? duplicate-refs))))
    (testing "breakouts/fields schemas"
      (are [schema error] (= error
                             (me/humanize (mr/explain schema duplicate-refs)))
        ::lib.schema/breakouts ["Breakouts must be distinct"]
        ::lib.schema/fields    [":fields must be distinct"]))
    (testing "stage schema"
      (are [k error] (= error
                        (me/humanize (mr/explain ::lib.schema/stage {:lib/type :mbql.stage/mbql, k duplicate-refs})))
        :breakout {:breakout ["Breakouts must be distinct"]}
        :fields   {:fields [":fields must be distinct"]}))))

(deftest ^:parallel normalize-query-test
  (let [normalized (lib.normalize/normalize
                    ::lib.schema/query
                    {:stages [{:lib/type     :mbql.stage/mbql
                               :source-table 1
                               :aggregation  [[:count {:name "count"}]]
                               :breakout     [[:field {:temporal-unit :quarter} 2]
                                              [:field {:temporal-unit :day-of-week} 2]]
                               :order-by     [[:asc {} [:field {:temporal-unit :quarter} 2]]
                                              [:asc {} [:field {:temporal-unit :day-of-week} 2]]]}]})]
    (is (not (me/humanize (mr/explain ::lib.schema/query normalized))))))
