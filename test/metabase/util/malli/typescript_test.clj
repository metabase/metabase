(ns metabase.util.malli.typescript-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.typescript :as ts]))

(mr/def ::memo-context-ref :string)

(mr/def ::key-transform-ref
  [:map
   [:display-name :string]
   [:nested-value {:optional true} [:map [:long-display-name :string]]]])

(deftest basic-transforms-test
  (testing "basic schema transforms"
    (are [res schema] (= res (ts/schema->ts schema))
      "number"                                                  number?
      "{\n\ta: number;\n\tb: string;\n\t[key: string]: unknown;\n}" [:map [:a :int] [:b :string]]
      "{\n\ttype: \"main\";\n\tvalue: string;\n\t[key: string]: unknown;\n}" [:map [:type [:= :main]] [:value :string]]
      "\"type/Integer\""                                      [:= :type/Integer]
      "\"type/Integer\" | \"type/Text\""                    [:enum :type/Integer :type/Text]
      "(string | number)"                                       [:or :string :int]
      "[string, ...string[]]"                                   [:sequential {:min 1} :string]
      "[string, string, ...string[]]"                           [:sequential {:min 2} :string]
      "unknown"                                                  [:maybe :any]
      "Record<string, unknown>"                                 [:map-of :keyword :any]
      "Record<string, number>"                                  [:map-of [:map [:a :string]] :int]
      "Partial<Record<\"a\" | \"b\", number>>"                [:map-of [:enum :a :b] :int]
      "string[]"                                                 [:any {:ts/array-of :string}]
      "Metabase_Lib_Schema_Binning_Strategy[]"                   [:any {:ts/array-of ::lib.schema.binning/strategy}]
      "Metabase_Lib_Schema_Binning_Strategy"                     [:any {:ts/ref ::lib.schema.binning/strategy}]
      "Metabase_Lib_Schema_Binning_Strategy[]"                   [:any {:ts/array-of [:any {:ts/ref ::lib.schema.binning/strategy}]}]
      "Promise<string>"                                          [:any {:ts/promise-of :string}]
      "Promise<Metabase_Lib_Schema_Binning_Strategy>"            [:any {:ts/promise-of [:any {:ts/ref ::lib.schema.binning/strategy}]}]
      "CustomType"                                               [:any {:typescript "CustomType"}]
      "{\n\tdisplayName: string;\n\tfilterPositions?: number[];\n\tisManyPks?: boolean;\n\tgroup?: {\n\tdisplayName: string;\n\t[key: string]: unknown;\n};\n\t[key: string]: unknown;\n}" [:any {:ts/object-of [:map
                                                                                                                                                                                                                 [:display-name :string]
                                                                                                                                                                                                                 [:filter-positions {:optional true} [:sequential :int]]
                                                                                                                                                                                                                 [:many-pks? {:optional true} :boolean]
                                                                                                                                                                                                                 [:group {:optional true} [:map [:display-name :string]]]]
                                                                                                                                                                                                  :ts/key-transform :camelCase}]
      "\"one\" | \"two\""                                   [:enum :one :two]
      "(Record<string, unknown> & {\n\tkey: string;\n})"         [:and
                                                                  [:map-of :keyword :any]
                                                                  [:map {:closed true}
                                                                   [:key string?]]]
      "({\n\ttype: \"a\";\n\t[key: string]: unknown;\n} | {\n\ttype: \"b\";\n\t[key: string]: unknown;\n})" [:multi {:dispatch :type}
                                                                                                             [:a [:map
                                                                                                                  [:type [:= :a]]]]
                                                                                                             [:b [:map
                                                                                                                  [:type [:= :b]]]]]))
  (testing "closed maps omit index signatures"
    (is (= "{\n\ta: number;\n}"
           (ts/schema->ts [:map {:closed true} [:a :int]]))))
  (testing "open maps include index signatures"
    (is (= "{\n\ta: number;\n\t[key: string]: unknown;\n}"
           (ts/schema->ts [:map [:a :int]])))))

(deftest union-simplification-test
  (testing "unions containing unknown branches preserve uncertainty"
    (is (= "(string | { readonly __metabaseUnknownSchemaBranch: true })"
           (ts/schema->ts [:or :string :any])))
    (is (= "(number | string | { readonly __metabaseUnknownSchemaBranch: true })"
           (ts/schema->ts [:or :int :string :any]))))
  (testing "unions preserve uncertainty from unknown branches"
    (is (= "(string | { readonly __metabaseUnknownSchemaBranch: true })"
           (ts/schema->ts [:or :string [:fn {:typescript "unknown"} any?]])))
    (is (= "(string | number | { readonly __metabaseUnknownSchemaBranch: true })"
           (ts/schema->ts [:or :string :int [:fn {:typescript "unknown"} any?]]))))
  (testing "duplicate types are removed"
    (is (= "string" (ts/schema->ts [:or :string :string])))
    (is (= "(string | number)" (ts/schema->ts [:or :string :int :string])))))

(deftest intersection-safety-test
  (testing "intersections drop unknown branches because T & unknown is T"
    (is (= "string"
           (ts/schema->ts [:and :string [:fn {:typescript "unknown"} any?]]))))
  (testing "intersections preserve array-ness when every branch is unknown-ish"
    (is (= "unknown[]"
           (ts/schema->ts [:and [:any {:ts/instance-of "Array"}] [:fn {:typescript "unknown"} any?]]))))
  (testing "merges drop unknown branches because T & unknown is T"
    (is (= "{\n\ta: string;\n\t[key: string]: unknown;\n}"
           (ts/schema->ts [:merge
                           [:map [:a :string]]
                           [:fn {:typescript "unknown"} any?]])))))

(deftest structured-ref-test
  (testing "structured refs record registry refs without relying on generated TypeScript names"
    (let [refs (atom #{})]
      (binding [ts/*registry-refs* refs]
        (is (= "Metabase_Lib_Schema_Binning_Strategy"
               (ts/schema->ts [:any {:ts/ref ::lib.schema.binning/strategy}]))))
      (is (= #{::lib.schema.binning/strategy} @refs))))
  (testing "structured refs use the shared namespace prefix when the referenced schema is shared"
    (binding [ts/*shared-types* #{::lib.schema.binning/strategy}]
      (is (= "Shared.Metabase_Lib_Schema_Binning_Strategy"
             (ts/schema->ts [:any {:ts/ref ::lib.schema.binning/strategy}])))))
  (testing "structured refs under key-transform are expanded inline with transformed keys"
    (is (= "{\n\tdisplayName: string;\n\tnestedValue?: {\n\tlongDisplayName: string;\n\t[key: string]: unknown;\n};\n\t[key: string]: unknown;\n}"
           (ts/schema->ts [:any {:ts/ref ::key-transform-ref
                                 :ts/key-transform :camelCase}])))))

(deftest key-transform-test
  (testing "explicit refs under key-transform are expanded inline with transformed keys"
    (is (= "{\n\tgroup: {\n\tdisplayName: string;\n\tnestedValue?: {\n\tlongDisplayName: string;\n\t[key: string]: unknown;\n};\n\t[key: string]: unknown;\n};\n\t[key: string]: unknown;\n}"
           (ts/schema->ts [:any {:ts/object-of [:map [:group [:ref ::key-transform-ref]]]
                                 :ts/key-transform :camelCase}]))))
  (testing "explicit refs under key-transform are not recorded for shared aliases"
    (let [refs (atom #{})]
      (binding [ts/*registry-refs* refs]
        (is (= "{\n\tgroup: {\n\tdisplayName: string;\n\tnestedValue?: {\n\tlongDisplayName: string;\n\t[key: string]: unknown;\n};\n\t[key: string]: unknown;\n};\n\t[key: string]: unknown;\n}"
               (ts/schema->ts [:any {:ts/object-of [:map [:group [:ref ::key-transform-ref]]]
                                     :ts/key-transform :camelCase}]))))
      (is (empty? @refs))))
  (testing ":ts/key-transform :none resets an inherited transform on nested :ts/object-of"
    (is (= "{\n\touterKey: {\n\t\"inner-key\": string;\n\t[key: string]: unknown;\n};\n\t[key: string]: unknown;\n}"
           (ts/schema->ts [:any {:ts/object-of [:map
                                                [:outer-key [:any {:ts/object-of [:map [:inner-key :string]]
                                                                   :ts/key-transform :none}]]]
                                 :ts/key-transform :camelCase}])))))

(deftest collect-registry-refs-test
  (testing "collects registry refs without generating TypeScript"
    (is (= #{::lib.schema.binning/strategy ::lib.schema.common/non-blank-string}
           (#'ts/collect-registry-refs [:map
                                        [:strategy [:ref ::lib.schema.binning/strategy]]
                                        [:name ::lib.schema.common/non-blank-string]
                                        [:literal [:= :not.a.real/schema]]])))))

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
    (is (= "{\n\tstrategy: Metabase_Lib_Schema_Binning_Strategy;\n\t[key: string]: unknown;\n}"
           (ts/schema->ts [:map [:strategy [:ref ::lib.schema.binning/strategy]]])))))

(deftest memoization-context-test
  (testing "registry refs are recorded even when the type string is memoized"
    (is (= "Metabase_Util_Malli_TypescriptTest_MemoContextRef"
           (ts/schema->ts ::memo-context-ref)))
    (let [refs (atom #{})]
      (binding [ts/*registry-refs* refs]
        (is (= "Metabase_Util_Malli_TypescriptTest_MemoContextRef"
               (ts/schema->ts ::memo-context-ref))))
      (is (contains? @refs ::memo-context-ref))))
  (testing "shared type context affects emitted registry type names even when memoized"
    (is (= "Metabase_Util_Malli_TypescriptTest_MemoContextRef"
           (ts/schema->ts ::memo-context-ref)))
    (binding [ts/*shared-types* #{::memo-context-ref}]
      (is (= "Shared.Metabase_Util_Malli_TypescriptTest_MemoContextRef"
             (ts/schema->ts ::memo-context-ref))))))

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
  (testing "maybe unknown remains unknown in argument context"
    (is (= "a: unknown"
           (#'ts/format-ts-args '[a] [:cat [:maybe :any]]))))
  (testing "formats variadic arguments as rest params"
    (is (= "query: string, stage: number, ...args: unknown[]"
           (#'ts/format-ts-args '[query stage & args] [:cat :string :int [:sequential :any]]))))
  (testing "formats compiler-munged variadic placeholder as ...rest"
    (is (= "query: string, ...rest: unknown[]"
           (#'ts/format-ts-args '[query _AMPERSAND_] [:cat :string [:sequential :any]]))))
  (testing "pads missing arg schemas with unknown instead of truncating runtime args"
    (is (= "a: string, b: unknown"
           (#'ts/format-ts-args '[a b] [:cat :string]))))
  (testing "pads missing rest arg schemas with an array type, not bare unknown"
    (is (= "a: string, ...rest: unknown[]"
           (#'ts/format-ts-args '[a & rest] [:cat :string])))
    (is (= "a: string, ...rest: unknown[]"
           (#'ts/format-ts-args '[a _AMPERSAND_] [:cat :string]))))
  (testing "ignores extra arg schemas after warning"
    (is (= "a: string"
           (#'ts/format-ts-args '[a] [:cat :string :int]))))
  (testing "formats named catn argument schemas"
    (is (= "a: string, b: number"
           (#'ts/format-ts-args '[a b] [:catn [:a :string] [:b :int]])))))

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
                         [:=> [:cat :string :int [:sequential :any]] :string]))))
  (testing "generates generic declaration with explicit generic bound"
    (is (= (str "/**\n"
                " * @template {(string | number)} T\n"
                " * @param {T} value\n"
                " * @returns {T}\n"
                " */\n"
                "export function identity_like<T extends (string | number)>(value: T): T;")
           (#'ts/-fn->ts "identity-like"
                         '[value]
                         [:=>
                          [:cat :any]
                          [:schema {:ts/same-as 0
                                    :ts/generic-bound [:or :string :int]}
                           :string]]))))
  (testing "standalone function schema handles named catn arguments"
    (is (= "(a: string, b: number) => boolean"
           (ts/schema->ts [:=> [:catn [:a :string] [:b :int]] :boolean])))))

(deftest primitive-and-predicate-schema-test
  (testing "common schema forms produce precise primitive types"
    (are [expected schema] (= expected (ts/schema->ts schema))
      "string" :qualified-keyword
      "string" :qualified-symbol))
  (testing "common predicate schemas produce precise primitive types"
    (are [expected schema] (= expected (ts/schema->ts schema))
      "number"  int?
      "number"  integer?
      "number"  decimal?
      "number"  pos?
      "number"  neg?
      "number"  zero?
      "boolean" boolean?
      "number"  double?
      "number"  float?
      "string"  symbol?
      "string"  simple-symbol?
      "string"  qualified-symbol?
      "string"  keyword?
      "string"  simple-keyword?
      "string"  qualified-keyword?
      "string"  ident?
      "string"  simple-ident?
      "string"  qualified-ident?
      "string"  uuid?
      "string"  char?
      "string"  bytes?
      "true"    true?
      "false"   false?))
  (testing "numeric comparator schemas fall back to number"
    (are [schema] (= "number" (ts/schema->ts schema))
      [:> 0]
      [:>= 0]
      [:< 0]
      [:<= 0])))

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

(deftest require-or-return-test
  (testing "accepts fully-qualified var symbols and plain namespace symbols"
    (is (= 'clojure.string
           (ns-name (#'ts/require-or-return 'clojure.string/blank?))))
    (is (= 'clojure.string
           (ns-name (#'ts/require-or-return 'clojure.string))))))

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

(deftest repeat-schema-test
  (testing ":+ honors min count"
    (is (= "[string, ...string[]]"
           (ts/schema->ts [:+ :string])))
    (is (= "[string, string, ...string[]]"
           (ts/schema->ts [:+ {:min 2} :string]))))
  (testing ":repeat honors min count"
    (is (= "string[]"
           (ts/schema->ts [:repeat :string])))
    (is (= "[string, ...string[]]"
           (ts/schema->ts [:repeat {:min 1} :string])))
    (is (= "[string, string, ...string[]]"
           (ts/schema->ts [:repeat {:min 2} :string])))))

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
