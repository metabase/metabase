(ns metabase.lib.schema.parameter-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [malli.error :as me]
   [metabase.lib.core :as lib]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.test-metadata :as meta]
   [metabase.util.malli.registry :as mr]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel parameter-schema-test
  (are [x] (not (me/humanize (mr/explain ::lib.schema.parameter/parameter x)))
    {:type   :category
     :target [:variable [:field 71725 nil]]
     :value  50}
    {:type   :date/range
     :name   "created_at"
     :target [:dimension [:template-tag "date_range"]]
     :value  "past1weeks"}))

(deftest ^:parallel normalize-dimension-test
  (are [x expected] (= expected
                       (lib.normalize/normalize
                        ::lib.schema.parameter/dimension
                        x))
    ["dimension" ["field" 29 {"base-type" "type/Integer"}]]
    [:dimension [:field 29 {:base-type :type/Integer}]]

    ["dimension" ["expression" "wow"]]
    [:dimension [:expression "wow"]]))

(deftest ^:parallel normalize-legacy-refs-inside-stage-parameters-e2e-test
  (let [query {:database 1
               :type     "query"
               :query    {:source-table 8
                          :limit        20
                          :expressions  {"my_stringExpr" [:concat "Category is " [:field 69 {:base-type :type/Text}]]}
                          :parameters   [{:type   :category
                                          :target [:dimension [:expression "my_stringExpr" {:base-type :type/Text}] {:stage-number 0}]
                                          :value  "Category is Gizmo"}]}}
        query (lib/query meta/metadata-provider query)]
    (is (=? {:stages [{:parameters [{:target [:dimension [:expression "my_stringExpr" {:base-type :type/Text}] {:stage-number 0}]}]}]}
            query))
    (is (not (me/humanize (mr/explain ::lib.schema/query query))))))

(deftest ^:parallel dimension-target-test
  (testing "Failures"
    (are [v] (not (mr/validate ::lib.schema.parameter/dimension.target v))
      [:aggregation 0]
      [:field "name" {}]))
  (testing "Successes"
    (are [v] (mr/validate ::lib.schema.parameter/dimension.target v)
      [:field 3 nil])))

(deftest ^:parallel normalize-mbql-3-refs-test
  (are [clause expected] (= expected
                            (lib/normalize ::lib.schema.parameter/dimension clause))
    [:dimension ["field-id" 76331]] [:dimension [:field 76331 nil]]
    ["dimension" ["fk->" 23 30]]    [:dimension [:field 30 {:source-field 23}]]))
