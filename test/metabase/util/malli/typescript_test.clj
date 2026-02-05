(ns metabase.util.malli.typescript-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.typescript :as ts]))

(deftest basic-transforms-test
  (testing "basic schema transforms"
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
                                                      [:type [:= :b]]]]])))

(deftest union-simplification-test
  (testing "unions containing 'any' simplify to 'any'"
    (is (= "any" (ts/schema->ts [:or :string :any])))
    (is (= "any" (ts/schema->ts [:or :int :string :any]))))
  (testing "unions containing 'unknown' simplify to 'unknown'"
    (is (= "unknown" (ts/schema->ts [:or :string [:fn {:typescript "unknown"} any?]])))
    (is (= "unknown"
           (ts/schema->ts [:or :string :int [:fn {:typescript "unknown"} any?]]))))
  (testing "duplicate types are removed"
    (is (= "string" (ts/schema->ts [:or :string :string])))
    (is (= "(string | number)" (ts/schema->ts [:or :string :int :string])))))

(deftest registry-type-names-test
  (testing "registry schemas return type names instead of inline expansions"
    ;; Registry schemas now return type names for deduplication
    (is (= "Metabase_Lib_Schema_Binning_Bin_Width"
           (ts/schema->ts ::lib.schema.binning/bin-width)))
    (is (= "Metabase_Lib_Schema_Binning_Strategy"
           (ts/schema->ts ::lib.schema.binning/strategy)))
    (is (= "Metabase_Lib_Schema_Common_Non_Blank_String"
           (ts/schema->ts ::lib.schema.common/non-blank-string))))
  (testing "refs in maps use type names"
    (is (= "{\nstrategy: Metabase_Lib_Schema_Binning_Strategy\n}"
           (ts/schema->ts [:map [:strategy [:ref ::lib.schema.binning/strategy]]])))))

(deftest base-type-name-test
  (testing "converts qualified keywords to TypeScript type names"
    (is (= "Metabase_Lib_Schema_Binning_Strategy"
           (#'ts/base-type-name :metabase.lib.schema.binning/strategy)))
    (is (= "Metabase_Lib_Schema_Query"
           (#'ts/base-type-name :metabase.lib.schema/query))))
  (testing "handles special characters"
    ;; Special chars are replaced and then each segment is capitalized (first letter only)
    (is (= "Metabase_Lib_Schema_Mbql_Clause_Bangeq"
           (#'ts/base-type-name :metabase.lib.schema.mbql-clause/!=)))
    (is (= "Metabase_Lib_Schema_Mbql_Clause_Plus"
           (#'ts/base-type-name :metabase.lib.schema.mbql-clause/+)))
    (is (= "Metabase_Lib_Schema_Mbql_Clause_Lt"
           (#'ts/base-type-name :metabase.lib.schema.mbql-clause/<)))))

(deftest simplify-union-types-test
  (testing "any absorbs everything"
    (is (= ["any"] (#'ts/simplify-union-types ["string" "any" "number"])))
    (is (= ["any"] (#'ts/simplify-union-types ["any"]))))
  (testing "unknown absorbs everything (except any)"
    (is (= ["unknown"] (#'ts/simplify-union-types ["string" "unknown" "number"])))
    (is (= ["unknown"] (#'ts/simplify-union-types ["string" "unknown"])))
    (is (= ["unknown"] (#'ts/simplify-union-types ["unknown"]))))
  (testing "any takes precedence over unknown"
    (is (= ["any"] (#'ts/simplify-union-types ["any" "unknown"])))
    (is (= ["any"] (#'ts/simplify-union-types ["string" "any" "unknown"]))))
  (testing "duplicates are removed"
    (is (= ["string" "number"] (#'ts/simplify-union-types ["string" "number" "string"])))))

(deftest format-ts-args-test
  (testing "formats function arguments correctly"
    (is (= "a: number, b: number | null"
           (#'ts/format-ts-args '[a b] [:cat number? [:maybe number?]])))))

(deftest fn->ts-test
  (testing "generates function declaration with JSDoc"
    (is (= (str "/**\n"
                " * @param {string} some_arg\n"
                " * @returns {string | null}\n"
                " */\n"
                "export function some_fn(some_arg: string): string | null;")
           (#'ts/-fn->ts "some-fn" '[some-arg] [:=> [:cat :string] [:maybe :string]])))))

(defn run-typescript-tests
  "Run tests from shadow-cljs context."
  []
  (clojure.test/run-tests 'metabase.util.malli.typescript-test))

