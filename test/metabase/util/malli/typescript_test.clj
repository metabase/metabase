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
        "number"                                  number?
        "{\na: number;\nb: string\n}"             [:map [:a :int] [:b :string]]
        "{\ntype: \"main\";\nvalue: string\n}"    [:map [:type [:= :main]] [:value :string]]
        "(string | number)"                       [:or :string :int]
        "Record<string, any>"                     [:map-of :keyword :any]
        "\"one\" | \"two\""                       [:enum :one :two]
        "(Record<string, any> & {\nkey: string\n})" [:and
                                                     [:map-of :keyword :any]
                                                     [:map
                                                      [:key string?]]]
        "({\ntype: \"a\"\n} | {\ntype: \"b\"\n})" [:multi {:dispatch :type}
                                                   [:a [:map
                                                        [:type [:= :a]]]]
                                                   [:b [:map
                                                        [:type [:= :b]]]]]))
    (testing "registry"
      (is (= "number"
             (ts/schema->ts ::lib.schema.binning/bin-width)))
      (is (= "{\nstrategy: \"bin-width\" | \"default\" | \"num-bins\"\n}"
             (ts/schema->ts [:map [:strategy [:ref ::lib.schema.binning/strategy]]])))
      (is (= (str "({\nstrategy: \"bin-width\" | \"default\" | \"num-bins\"\n} & "
                  "({\nstrategy: \"default\"\n}"
                  " | {\nstrategy: \"bin-width\";\n'bin-width': number\n}"
                  " | {\nstrategy: \"num-bins\";\n'num-bins': number\n})"
                  ")")
             (ts/schema->ts ::lib.schema.binning/binning)))))
  (testing "underlying functions work properly"
    (is (= "a: number, b: number | null"
           (#'ts/format-ts-args '[a b] [:cat number? [:maybe number?]])))
    (is (= (str "/**\n"
                " * @param {string} some_arg\n"
                " * @returns {string | null}\n"
                " */\n"
                "export function some_fn(some_arg: string): string | null;")
           (#'ts/-fn->ts "some-fn" '[some-arg] [:=> [:cat :string] [:maybe :string]])))))

(comment
  (println (ts/fn->ts (meta #'lib.binning.util/resolve-options))))

