(ns metabase.util.malli.typescript-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.binning.util :as lib.binning.util]
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.util.malli.typescript :as ts]))

(deftest typescript-test
  (testing "rendering malli schema to typescript works"
    (testing "basic transforms"
      (are [res schema] (= res (ts/schema->ts schema))
        "number"                                number?
        "{a: number; b: string}"                [:map [:a :int] [:b :string]]
        "{type: \"main\"; value: string}"       [:map [:type [:= :main]] [:value :string]]
        "(string | number)"                     [:or :string :int]
        "Record<string, any>"                   [:map-of :keyword :any]
        "\"one\" | \"two\""                     [:enum :one :two]
        "(Record<string, any> & {key: string})" [:and
                                                 [:map-of :keyword :any]
                                                 [:map
                                                  [:key string?]]]
        "({type: \"a\"} | {type: \"b\"})"       [:multi {:dispatch :type}
                                                 [:a [:map
                                                      [:type [:= :a]]]]
                                                 [:b [:map
                                                      [:type [:= :b]]]]]))
    (testing "registry"
      (is (= "number"
             (ts/schema->ts ::lib.schema.binning/bin-width)))
      (is (= ""
             (ts/schema->ts :metabase.lib.metadata.calculation/returned-columns)))
      (is (= "{strategy: \"bin-width\" | \"default\" | \"num-bins\"}"
             (ts/schema->ts [:map [:strategy [:ref ::lib.schema.binning/strategy]]])))
      (is (= (str "({strategy: \"bin-width\" | \"default\" | \"num-bins\"} & "
                  "({strategy: \"default\"}"
                  " | {strategy: \"bin-width\"; 'bin-width': number}"
                  " | {strategy: \"num-bins\"; 'num-bins': number})"
                  ")")
             (ts/schema->ts ::lib.schema.binning/binning)))))
  (testing "underlying functions work properly"
    (is (= "a: number, b: number | null"
           (#'ts/format-ts-args '[a b] [:cat number? [:maybe number?]])))
    (is (= "export function some_fn(some_arg: string): string | null;"
           (#'ts/-fn->ts "some-fn" '[some-arg] [:=> [:cat :string] [:maybe :string]])))))

(comment
  (println (ts/fn->ts (meta #'lib.binning.util/resolve-options))))

