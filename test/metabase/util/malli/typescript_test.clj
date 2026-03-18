(ns metabase.util.malli.typescript-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.typescript :as ts]))

(deftest basic-transforms-test
  (testing "basic schema transforms"
    (are [res schema] (= res (ts/schema->ts schema))
      "number"                                          number?
      "{\n\ta: number;\n\tb: string;\n}"                [:map [:a :int] [:b :string]]
      "{\n\ttype: \"main\";\n\tvalue: string;\n}"       [:map [:type [:= :main]] [:value :string]]
      "(string | number)"                               [:or :string :int]
      "Record<string, unknown>"                         [:map-of :keyword :any]
      "\"one\" | \"two\""                               [:enum :one :two]
      "(Record<string, unknown> & {\n\tkey: string;\n})" [:and
                                                         [:map-of :keyword :any]
                                                         [:map
                                                          [:key string?]]]
      "({\n\ttype: \"a\";\n} | {\n\ttype: \"b\";\n})"   [:multi {:dispatch :type}
                                                         [:a [:map
                                                              [:type [:= :a]]]]
                                                         [:b [:map
                                                              [:type [:= :b]]]]])))

(deftest union-simplification-test
  (testing "unions containing 'any' simplify to 'any'"
    (is (= "any" (ts/schema->ts [:or :string :any])))
    (is (= "any" (ts/schema->ts [:or :int :string :any]))))
  (testing "unions preserve uncertainty from unknown branches"
    (is (= "(string | { readonly __metabaseUnknownSchemaBranch: true })"
           (ts/schema->ts [:or :string [:fn {:typescript "unknown"} any?]])))
    (is (= "(string | number | { readonly __metabaseUnknownSchemaBranch: true })"
           (ts/schema->ts [:or :string :int [:fn {:typescript "unknown"} any?]]))))
  (testing "duplicate types are removed"
    (is (= "string" (ts/schema->ts [:or :string :string])))
    (is (= "(string | number)" (ts/schema->ts [:or :string :int :string])))))

(deftest intersection-safety-test
  (testing "intersections preserve uncertainty from unknown branches"
    (is (= "(string & { readonly __metabaseUnknownSchemaBranch: true })"
           (ts/schema->ts [:and :string [:fn {:typescript "unknown"} any?]]))))
  (testing "merges preserve uncertainty from unknown branches"
    (is (= "({\n\ta: string;\n} & { readonly __metabaseUnknownSchemaBranch: true })"
           (ts/schema->ts [:merge
                           [:map [:a :string]]
                           [:fn {:typescript "unknown"} any?]])))))

(deftest registry-type-names-test
  (testing "registry schemas return type names instead of inline expansions"
    ;; Registry schemas now return type names for deduplication
    ;; Entity names use CapitalCase (no underscores), namespace uses Snake_Case
    (is (= "Metabase_Lib_Schema_Binning_BinWidth"
           (ts/schema->ts ::lib.schema.binning/bin-width)))
    (is (= "Metabase_Lib_Schema_Binning_Strategy"
           (ts/schema->ts ::lib.schema.binning/strategy)))
    (is (= "Metabase_Lib_Schema_Common_NonBlankString"
           (ts/schema->ts ::lib.schema.common/non-blank-string))))
  (testing "refs in maps use type names"
    (is (= "{\n\tstrategy: Metabase_Lib_Schema_Binning_Strategy;\n}"
           (ts/schema->ts [:map [:strategy [:ref ::lib.schema.binning/strategy]]])))))

(deftest base-type-name-test
  (testing "converts qualified keywords to TypeScript type names"
    ;; Dots become underscores, dashes become CapitalCase
    (is (= "Metabase_Lib_Schema_Binning_Strategy"
           (#'ts/base-type-name :metabase.lib.schema.binning/strategy)))
    (is (= "Metabase_Lib_Schema_Query"
           (#'ts/base-type-name :metabase.lib.schema/query))))
  (testing "hyphens become CapitalCase in both namespace and entity"
    (is (= "Metabase_Lib_Schema_Binning_BinWidth"
           (#'ts/base-type-name :metabase.lib.schema.binning/bin-width)))
    (is (= "Metabase_Util_Currency_CurrencyInfo"
           (#'ts/base-type-name :metabase.util.currency/currency-info)))
    ;; Namespace with hyphen: mbql-clause -> MbqlClause
    (is (= "Metabase_Lib_Schema_MbqlClause_SomeType"
           (#'ts/base-type-name :metabase.lib.schema.mbql-clause/some-type))))
  (testing "handles special characters in entity names"
    ;; Special chars are replaced with readable names
    (is (= "Metabase_Lib_Schema_MbqlClause_BangEq"
           (#'ts/base-type-name :metabase.lib.schema.mbql-clause/!=)))
    (is (= "Metabase_Lib_Schema_MbqlClause_Plus"
           (#'ts/base-type-name :metabase.lib.schema.mbql-clause/+)))
    (is (= "Metabase_Lib_Schema_MbqlClause_Lt"
           (#'ts/base-type-name :metabase.lib.schema.mbql-clause/<)))))

(deftest simplify-union-types-test
  (testing "any absorbs everything"
    (is (= ["any"] (#'ts/simplify-union-types ["string" "any" "number"])))
    (is (= ["any"] (#'ts/simplify-union-types ["any"]))))
  (testing "unknown is preserved (filtering happens at schema level, not simplify-union-types)"
    (is (= ["string" "unknown" "number"] (#'ts/simplify-union-types ["string" "unknown" "number"])))
    (is (= ["string" "unknown"] (#'ts/simplify-union-types ["string" "unknown"])))
    (is (= ["unknown"] (#'ts/simplify-union-types ["unknown"]))))
  (testing "any takes precedence over unknown"
    (is (= ["any"] (#'ts/simplify-union-types ["any" "unknown"])))
    (is (= ["any"] (#'ts/simplify-union-types ["string" "any" "unknown"]))))
  (testing "duplicates are removed"
    (is (= ["string" "number"] (#'ts/simplify-union-types ["string" "number" "string"])))))

(deftest format-ts-args-test
  (testing "formats function arguments correctly"
    (is (= "a: number, b: number | undefined | null"
           (#'ts/format-ts-args '[a b] [:cat number? [:maybe number?]]))))
  (testing "formats variadic arguments as rest params"
    (is (= "query: string, stage: number, ...args: unknown[]"
           (#'ts/format-ts-args '[query stage & args] [:cat :string :int [:sequential :any]]))))
  (testing "formats compiler-munged variadic placeholder as ...rest"
    (is (= "query: string, ...rest: unknown[]"
           (#'ts/format-ts-args '[query _AMPERSAND_] [:cat :string [:sequential :any]])))))

(deftest fn->ts-test
  (testing "generates function declaration with JSDoc"
    (is (= (str "/**\n"
                " * @param {string} some_arg\n"
                " * @returns {string | null}\n"
                " */\n"
                "export function some_fn(some_arg: string): string | null;")
           (#'ts/-fn->ts "some-fn" '[some-arg] [:=> [:cat :string] [:maybe :string]]))))
  (testing "generates variadic declaration with rest args"
    (is (= (str "/**\n"
                " * @param {string} query\n"
                " * @param {number} stage\n"
                " * @param {unknown[]} ...args\n"
                " * @returns {string}\n"
                " */\n"
                "export function variadic_fn(query: string, stage: number, ...args: unknown[]): string;")
           (#'ts/-fn->ts "variadic-fn"
                         '[query stage & args]
                         [:=> [:cat :string :int [:sequential :any]] :string])))))

(deftest fallback-declarations-test
  (testing "fallback function declarations preserve export and arity"
    (is (= (str "/**\n"
                " * NOTE: Generated fallback declaration due to unavailable schema validator during build\n"
                " * @param {unknown} query\n"
                " * @param {unknown} stage\n"
                " * @param {unknown[]} ...args\n"
                " * @returns {unknown}\n"
                " */\n"
                "export function drill_thru(query: unknown, stage: unknown, ...args: unknown[]): unknown;")
           (#'ts/fallback-fn->ts {:name     'drill-thru
                                  :arglists '([query stage & args])
                                  :doc      nil}))))
  (testing "fallback const declarations preserve export"
    (is (= (str "/**\n"
                " * NOTE: Generated fallback declaration due to unavailable schema validator during build\n"
                " * @type {unknown}\n"
                " */\n"
                "export const SOME_CONST: unknown;")
           (#'ts/fallback-const->ts {:name 'SOME_CONST :doc nil})))))

(deftest js-interop-resolve-test
  (testing "resolve-var-refs transforms [:is-a js/X] to [:any {:ts/instance-of X}]"
    (is (= [:any {:ts/instance-of "Array"}]
           (#'ts/resolve-var-refs 'metabase.util.malli.typescript-test
                                  [:is-a 'js/Array])))
    (is (= [:any {:ts/instance-of "Object"}]
           (#'ts/resolve-var-refs 'metabase.util.malli.typescript-test
                                  [:is-a 'js/Object]))))
  (testing "js/* symbols inside other forms are preserved as-is"
    (is (= [:fn 'js/Array]
           (#'ts/resolve-var-refs 'metabase.util.malli.typescript-test
                                  [:fn 'js/Array]))))
  (testing "[:is-a js/Array] inside :and is transformed"
    (is (= [:and [:any {:ts/instance-of "Array"}] [:sequential :string]]
           (#'ts/resolve-var-refs 'metabase.util.malli.typescript-test
                                  [:and [:is-a 'js/Array] [:sequential :string]])))))

(deftest js-instance-of-ts-test
  (testing "[:is-a js/Array] generates unknown[]"
    (is (= "unknown[]"
           (ts/schema->ts [:any {:ts/instance-of "Array"}]))))
  (testing "[:is-a js/Object] generates Record<string, unknown>"
    (is (= "Record<string, unknown>"
           (ts/schema->ts [:any {:ts/instance-of "Object"}]))))
  (testing "[:and [:is-a js/Array] [:sequential X]] simplifies to X[]"
    (is (= "string[]"
           (ts/schema->ts [:and [:any {:ts/instance-of "Array"}] [:sequential :string]])))
    (is (= "number[]"
           (ts/schema->ts [:and [:any {:ts/instance-of "Array"}] [:sequential :int]])))))

(deftest unknown-type-test
  (testing "unknown-type? matches expected patterns"
    (is (#'ts/unknown-type? "unknown"))
    (is (#'ts/unknown-type? "unknown[]"))
    (is (#'ts/unknown-type? "unknown /* some comment */"))
    (is (not (#'ts/unknown-type? "string")))
    (is (not (#'ts/unknown-type? "string[]")))
    (is (not (#'ts/unknown-type? "any")))))

(defn run-typescript-tests
  "Run tests from shadow-cljs context."
  []
  (clojure.test/run-tests 'metabase.util.malli.typescript-test))

