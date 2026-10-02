(ns metabase.util.malli.typescript.declaration-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.typescript.declaration :as ts]
   [metabase.util.malli.typescript.refs :as refs]))

(mr/def ::memo-context-ref :string)

(mr/def ::auto-generic-ref :string)

(mr/def ::key-transform-ref
  [:map
   [:display-name :string]
   [:nested-value {:optional true} [:map [:long-display-name :string]]]])

(mr/def ::nullable-alias [:maybe :string])

(mr/def ::nullable-node
  [:maybe
   [:map {:closed true}
    [:next {:optional true} [:ref ::nullable-node]]]])

(mr/def ::nested-nullable-alias
  [:map {:closed true}
   [:value [:maybe :string]]])

(mr/def ::nullable-vector-alias
  [:tuple [:maybe :string]])

(mr/def ::recursive-nested-nullable-alias
  [:map {:closed true}
   [:child [:maybe [:ref ::recursive-nested-nullable-alias]]]])

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
  (testing "unknown absorbs unions"
    (is (= "unknown"
           (ts/schema->ts [:or :string :any])))
    (is (= "unknown"
           (ts/schema->ts [:or :int :string :any])))
    (is (= "unknown"
           (ts/schema->ts [:or :string [:fn {:typescript "unknown"} any?]])))
    (is (= "unknown"
           (ts/schema->ts [:or :string :int [:fn {:typescript "unknown"} any?]]))))
  (testing "unevaluated predicate branches make the whole union unknown"
    (is (= "unknown"
           (ts/schema->ts [:or :string [:fn '(fn [x] (localized-string? x))]]))))
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
  (testing "intersections drop raw predicate function branches because TypeScript cannot represent them"
    (is (= "string[]"
           (ts/schema->ts [:and [:sequential :string] [:fn (fn [xs] (apply distinct? xs))]]))))
  (testing "intersections drop unevaluated predicate function forms from CLJS analyzer metadata"
    (is (= "string[]"
           (ts/schema->ts [:and [:sequential :string] [:fn '(fn [xs] (apply distinct? xs))]]))))
  (testing "merges drop unknown branches because T & unknown is T"
    (is (= "{\n\ta: string;\n\t[key: string]: unknown;\n}"
           (ts/schema->ts [:merge
                           [:map [:a :string]]
                           [:fn {:typescript "unknown"} any?]]))))
  (testing "merges drop raw predicate function branches because TypeScript cannot represent them"
    (is (= "{\n\ta: string;\n\t[key: string]: unknown;\n}"
           (ts/schema->ts [:merge
                           [:map [:a :string]]
                           [:fn (fn [m] (contains? m :a))]]))))
  (testing "merges drop unevaluated predicate function forms from CLJS analyzer metadata"
    (is (= "{\n\ta: string;\n\t[key: string]: unknown;\n}"
           (ts/schema->ts [:merge
                           [:map [:a :string]]
                           [:fn '(fn [m] (contains? m :a))]])))))

(deftest predicate-fn-sanitizer-test
  (testing "bare predicate function schemas become unknown"
    (is (= "unknown"
           (ts/schema->ts [:fn '(fn [x] (valid? x))]))))
  (testing "map field predicate function schemas keep the field with unknown type"
    (is (= "{\n\tvalue: unknown;\n\t[key: string]: unknown;\n}"
           (ts/schema->ts [:map [:value [:fn '(fn [x] (valid? x))]]]))))
  (testing "sequential element predicate function schemas become unknown arrays"
    (is (= "unknown[]"
           (ts/schema->ts [:sequential [:fn '(fn [x] (valid? x))]]))))
  (testing "maybe predicate function schemas become unknown"
    (is (= "unknown"
           (ts/schema->ts [:maybe [:fn '(fn [x] (valid? x))]]))))
  (testing "function argument predicate function schemas become unknown parameters"
    (is (= "(arg0: unknown) => string"
           (ts/schema->ts [:=> [:cat [:fn '(fn [x] (valid? x))]] :string]))))
  (testing "catn predicate function schemas keep the parameter name with unknown type"
    (is (= "(value: unknown) => string"
           (ts/schema->ts [:=> [:catn [:value [:fn '(fn [x] (valid? x))]]] :string])))))

(deftest registry-keyword-schema-loading-test
  (testing "function schemas load their registry namespace before inspection"
    (is (re-find #"export function registry_value\(value: Metabase_Util_Malli_Typescript_RegistryFixture_Value\): Metabase_Util_Malli_Typescript_RegistryFixture_Value;"
                 (ts/fn->ts {:name 'example/registry-value
                             :ns 'example
                             :arglists '([value])
                             :schema [:=>
                                      [:cat :metabase.util.malli.typescript.registry-fixture/value]
                                      :metabase.util.malli.typescript.registry-fixture/value]}))))
  (testing "constant schemas load their registry namespace before compilation"
    (is (re-find #"export const registry_value: Metabase_Util_Malli_Typescript_RegistryFixture_Value;"
                 (ts/const->ts {:name 'example/registry-value
                                :ns 'example
                                :schema :metabase.util.malli.typescript.registry-fixture/value})))))

(deftest inline-typescript-expression-test
  (testing "function and constant metadata evaluate in their JVM namespace"
    (let [owner 'metabase.util.malli.typescript.declaration-test
          expression '(str/join " | " (map pr-str ["bird" "heron"]))]
      (is (str/includes? (ts/fn->ts {:name (symbol (str owner) "bird")
                                     :ns owner
                                     :arglists '([value])
                                     :schema [:=> [:cat :string] [:any {:typescript expression}]]})
                         "export function bird(value: string): \"bird\" | \"heron\";"))
      (is (str/includes? (ts/const->ts {:name (symbol (str owner) "bird")
                                        :ns owner
                                        :schema [:any {:typescript expression}]})
                         "export const bird: \"bird\" | \"heron\";"))))
  (testing "an analyzer-created namespace is not a loaded JVM namespace"
    (create-ns 'example.cljs-only)
    (try
      (is (str/includes? (:declaration
                          (ts/def->result {:name 'example.cljs-only/bird
                                           :ns 'example.cljs-only
                                           :requires {'s 'clojure.string}
                                           :schema [:any {:typescript '(s/join " | " (map identity ["string" "number"]))}]}))
                         "export const bird: string | number;"))
      (finally
        (remove-ns 'example.cljs-only))))
  (testing "ordinary Clojure interop is not mistaken for a namespace alias"
    (is (str/includes? (ts/const->ts {:name 'example.cljs-only/bird
                                      :schema [:any {:typescript '(String/valueOf "string")}]})
                       "export const bird: string;")))
  (testing "only :typescript expressions are evaluated"
    (is (str/includes? (ts/const->ts {:name 'metabase.util.malli.typescript.declaration-test/birds
                                      :schema [:sequential
                                               [:string {:description '(throw (Exception. "not metadata code"))}]]})
                       "export const birds: string[];"))))

(deftest inline-typescript-expression-error-test
  (doseq [expression [42 nil false '(inc 1) '(throw (ex-info "broken expression" {}))
                      '(cljs-only/type-name)]]
    (testing (pr-str expression)
      (let [error (try
                    (ts/def->result {:name 'example.cljs-only/bird
                                     :ns 'example.cljs-only
                                     :file "example/cljs_only.cljs"
                                     :line 17
                                     :column 3
                                     :requires {'cljs-only 'example.unavailable-cljs-helper}
                                     :schema [:any {:typescript expression}]})
                    (catch Exception e e))]
        (is (instance? clojure.lang.ExceptionInfo error))
        (when (instance? clojure.lang.ExceptionInfo error)
          (is (= {:type :invalid-typescript-metadata
                  :namespace 'example.cljs-only
                  :definition 'example.cljs-only/bird
                  :file "example/cljs_only.cljs"
                  :line 17
                  :column 3}
                 (select-keys (ex-data error) [:type :namespace :definition :file :line :column]))))))))

(deftest inline-typescript-entry-expression-test
  (doseq [tag [:fn :enum :=]
          schema-form (let [value [:any {:typescript '(str "string")}]]
                        [[:map [tag value]]
                         [:multi {:dispatch :type} [tag [:map [:value value]]]]
                         [:orn [tag value]]
                         [:catn [tag value]]
                         [:altn [tag value]]])]
    (testing (pr-str schema-form)
      (is (str/includes? (ts/const->ts {:name 'example.cljs-only/bird
                                        :schema schema-form})
                         "string")))))

(deftest inline-typescript-overload-expression-test
  (is (str/includes? (ts/fn->ts {:name 'example.cljs-only/bird
                                 :arglists '([])
                                 :schema [:=> [:cat]
                                          [:schema
                                           {:ts/overloads [[:=> [:cat] [:any {:typescript '(str "string")}]]]}
                                           :any]]})
                     "export function bird(): string;")))

(deftest bare-map-entry-declaration-test
  (let [result (ts/const->result {:name 'example.cljs-only/bird
                                  :schema [:map ::memo-context-ref]})]
    (is (= #{::memo-context-ref} (:registry-refs result)))
    (is (str/includes? (:declaration result) "Metabase_Util_Malli_Typescript_DeclarationTest_MemoContextRef"))))

(deftest bare-map-entry-properties-declaration-test
  (let [result (ts/const->result
                {:name 'metabase.util.malli.typescript.declaration-test/bird
                 :schema [:map
                          [::memo-context-ref
                           {:optional true
                            :description [:any {:typescript '(throw (ex-info "entry data evaluated" {}))}]}]]})]
    (is (= #{::memo-context-ref} (:registry-refs result)))
    (is (str/includes? (:declaration result)
                       "Metabase_Util_Malli_Typescript_DeclarationTest_MemoContextRef"))))

(def ^:private quoted-predicate-schema
  [:sequential [:fn '(fn [value] (unavailable-helper? value))]])

(deftest cljs-only-explicit-predicate-declaration-test
  (doseq [[schema-form expected]
          (let [typed-predicate [:fn {:typescript '(str "string")}
                                 '(fn [value] (unavailable.cljs-helper? value))]]
            [[typed-predicate "export const bird: string;"]
             [[:sequential typed-predicate] "export const bird: string[];"]
             [[:and :string typed-predicate] "export const bird: (string & string);"]
             [[:any {:ts/array-of typed-predicate}] "export const bird: string[];"]
             [[:any {:ts/object-of [:map {:closed true} [:name typed-predicate]]}] "name: string;"]
             [[:any {:ts/promise-of typed-predicate}] "export const bird: Promise<string>;"]])]
    (testing (pr-str schema-form)
      (is (str/includes? (ts/const->ts {:name 'example.cljs-only/bird :schema schema-form}) expected))))
  (testing "inline registry definitions are sanitized before resolving symbols"
    (let [result (ts/const->result {:name 'example.cljs-only/bird
                                    :schema [:schema
                                             {:registry {:example/bird [:fn {:typescript '(str "string")}
                                                                        '(fn [value] (unavailable.cljs-helper? value))]}}
                                             [:ref :example/bird]]})]
      (is (= [:any {:typescript "string"}]
             (mc/form (get (:local-definitions result) :example/bird))))))
  (testing "bare predicate bodies don't require CLJS-only helpers"
    (is (str/includes? (ts/const->ts {:name 'example.cljs-only/bird
                                      :schema [:sequential [:fn '(fn [value] (unavailable.cljs-helper? value))]]})
                       "export const bird: unknown[];")))
  (testing "schemas introduced by JVM var dereferencing still get sanitized"
    (is (str/includes? (ts/const->ts {:name 'metabase.util.malli.typescript.declaration-test/bird
                                      :schema (:name (meta #'quoted-predicate-schema))})
                       "export const bird: unknown[];"))))

(deftest broken-typescript-jvm-owner-test
  ;; Model a missing transitive dependency without adding a broken namespace
  ;; to the project's classpath. The owner itself is a real JVM namespace.
  (with-redefs-fn {#'ts/require-or-return
                   (fn [_] (throw (java.io.FileNotFoundException. "missing JVM dependency")))}
    (fn []
      (let [error (try
                    (ts/const->ts {:name 'metabase.util.malli.typescript.declaration-test/bird
                                   :schema [:any {:typescript '(str "string")}]})
                    (catch Exception e e))]
        (is (instance? clojure.lang.ExceptionInfo error))
        (when (instance? clojure.lang.ExceptionInfo error)
          (is (= :invalid-typescript-metadata (:type (ex-data error))))
          (is (some #(= "missing JVM dependency" (ex-message %))
                    (take-while some? (iterate ex-cause error)))))))))

(deftest typescript-expression-evaluation-boundary-test
  (let [temporary-namespaces #(into #{}
                                    (comp (map ns-name)
                                          (filter (fn [name]
                                                    (str/starts-with? (str name) "typescript-expression-"))))
                                    (all-ns))
        before (temporary-namespaces)]
    (is (str/includes? (ts/const->ts {:name 'example.cljs-only/bird
                                      :schema [:any {:typescript '(name 'unavailable.helper/string)}]})
                       "export const bird: string;"))
    (is (= before (temporary-namespaces)))
    (is (thrown? clojure.lang.ExceptionInfo
                 (ts/const->ts {:name 'example.cljs-only/bird
                                :schema [:any {:typescript '(throw (ex-info "broken" {}))}]})))
    (is (= before (temporary-namespaces))))
  (let [expression '(throw (ex-info "literal or validator executed" {}))
        literal {:typescript expression}]
    (doseq [schema-form [[:= literal]
                         [:enum literal]
                         [:fn {:typescript "string"} (list 'fn '[value] expression)]
                         [:sequential [:string {:description [:any literal]}]]]]
      (is (= schema-form
             (#'ts/resolve-typescript-expressions {:name 'example.cljs-only/bird} schema-form))))))

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

(deftest structured-declaration-result-test
  (let [result (ts/const->result
                {:name 'example/value
                 :schema [:schema
                          {:registry {::result-local :string}}
                          [:map
                           [:shared [:ref ::memo-context-ref]]
                           [:local [:ref ::result-local]]]]}
                {:current-ns 'example})]
    (is (re-find #"export const value:" (:declaration result)))
    (is (= #{::memo-context-ref ::result-local}
           (:registry-refs result)))
    (is (= :string
           (mc/form (get (:local-definitions result) ::result-local))))
    (is (empty? (:diagnostics result))))
  (let [result (ts/def->result
                 {:name 'example/collision
                  :schema [:any
                           {:ts/object-of [:map
                                           [:display-name :string]
                                           [:displayName :int]]
                            :ts/key-transform :camelCase}]})]
    (is (some #(= :map-key-collision (:type %))
              (:diagnostics result)))))

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
    (is (= "Metabase_Util_Malli_Typescript_DeclarationTest_MemoContextRef"
           (ts/schema->ts ::memo-context-ref)))
    (let [refs (atom #{})]
      (binding [ts/*registry-refs* refs]
        (is (= "Metabase_Util_Malli_Typescript_DeclarationTest_MemoContextRef"
               (ts/schema->ts ::memo-context-ref))))
      (is (contains? @refs ::memo-context-ref))))
  (testing "shared type context affects emitted registry type names even when memoized"
    (is (= "Metabase_Util_Malli_Typescript_DeclarationTest_MemoContextRef"
           (ts/schema->ts ::memo-context-ref)))
    (binding [ts/*shared-types* #{::memo-context-ref}]
      (is (= "Shared.Metabase_Util_Malli_Typescript_DeclarationTest_MemoContextRef"
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
           (#'ts/base-type-name :metabase.lib.schema.mbql-clause/<))))
  (testing "case-sensitive Malli registry keys remain distinct"
    (is (= "Metabase_LegacyMbql_Schema_Aggregation"
           (#'ts/base-type-name :metabase.legacy-mbql.schema/aggregation)))
    (is (= "Metabase_LegacyMbql_Schema_AggregationUpper"
           (#'ts/base-type-name :metabase.legacy-mbql.schema/Aggregation)))))

(deftest ^:parallel argument-seqex-key-transform-test
  (doseq [[args expected]
          [[[:cat {:ts/key-transform :camelCase} [:map {:closed true} [:display-name :string]]]
            "export function bird(bird: {\n\tdisplayName: string;\n}): null;"]
           [[:cat {:ts/key-transform :camelCase}
             [:cat {:ts/key-transform :none} [:map {:closed true} [:display-name :string]]]]
            "export function bird(bird: {\n\t\"display-name\": string;\n}): null;"]]]
    (is (str/includes? (ts/fn->ts {:name 'bird :arglists '([bird]) :schema [:=> args :nil]}) expected))))

(deftest ^:parallel argument-seqex-predicate-test
  (testing "transformed sequences retain valid predicates and their actual parameter names"
    (doseq [[arglist args target expected]
            [['[x] [:cat {:ts/key-transform :camelCase} :any] :string
              "export function bird_QMARK_(x: unknown): x is string;"]
             ['[category x] [:cat {:ts/key-transform :none} :any :any]
              {:param 1 :schema :string}
              "export function bird_QMARK_(category: unknown, x: unknown): x is string;"]
             ['[x] [:catn {:ts/key-transform :camelCase} [:value :string]] [:= "bird"]
              "export function bird_QMARK_(x: string): x is \"bird\";"]
             ['[x] [:cat {:ts/key-transform :camelCase} [:cat {:ts/key-transform :none} :any]] :string
              "export function bird_QMARK_(x: unknown): x is string;"]
             ['[x & more] [:cat {:ts/key-transform :camelCase} :any [:* :string]] :string
              "export function bird_QMARK_(x: unknown, ...more: string[]): x is string;"]]]
      (is (str/includes? (ts/fn->ts {:name 'bird?
                                     :arglists [arglist]
                                     :schema [:=> args [:boolean {:ts/predicate-of target}]]})
                         expected))))
  (testing "structural predicates preserve the transformed parameter shape"
    (let [args [:cat {:ts/key-transform :camelCase} [:map {:closed true} [:display-name :string]]]
          target [:map {:closed true} [:displayName :string]]]
      (is (str/includes? (ts/fn->ts {:name 'bird? :arglists '([x])
                                     :schema [:=> args [:boolean {:ts/predicate-of target}]]})
                         "): x is {\n\tdisplayName: string;\n};"))))
  (testing "invalid targets, absent parameters and rest targets stay ordinary returns"
    (doseq [[arglist args out]
            [['[x] [:cat {:ts/key-transform :camelCase} :string] [:boolean {:ts/predicate-of :int}]]
             ['[x] [:cat {:ts/key-transform :camelCase} :any] [:boolean {:ts/predicate-of {:param 1 :schema :string}}]]
             ['[x & more] [:cat {:ts/key-transform :camelCase} :any [:* :string]]
              [:boolean {:ts/predicate-of {:param 1 :schema :string}}]]
             ['[x] [:cat {:ts/key-transform :camelCase} :any] [:string {:ts/predicate-of :string}]]]]
      (is (not (str/includes? (ts/fn->ts {:name 'bird? :arglists [arglist] :schema [:=> args out]})
                              " is "))))))

(deftest ^:parallel argument-seqex-predicate-alternatives-test
  (testing "an optional argument narrows only the overload where it is present"
    (let [declaration (ts/fn->ts {:name 'bird? :arglists '([x])
                                  :schema [:=> [:cat {:ts/key-transform :camelCase} [:? :any]]
                                           [:boolean {:ts/predicate-of :string}]]})]
      (is (str/includes? declaration "export function bird_QMARK_(): boolean;"))
      (is (str/includes? declaration "export function bird_QMARK_(x: unknown): x is string;"))))
  (testing "a later argument narrows only alternatives which declare that parameter"
    (let [declaration (ts/fn->ts {:name 'bird? :arglists '([x y])
                                  :schema [:=> [:cat {:ts/key-transform :camelCase}
                                                [:alt [:cat :any] [:cat :any :int]]]
                                           [:boolean {:ts/predicate-of {:param 1 :schema :int}}]]})]
      (is (str/includes? declaration "export function bird_QMARK_(x: unknown): boolean;"))
      (is (str/includes? declaration "export function bird_QMARK_(x: unknown, y: number): y is number;")))))

(deftest format-ts-args-test
  (testing "formats function arguments correctly"
    (is (= "a: number, b: number | undefined | null"
           (#'ts/format-ts-args '[a b] [:cat number? [:maybe number?]]))))
  (testing "formats optional seqex arguments as optional parameters"
    (is (= "a: string, b?: number"
           (#'ts/format-ts-args '[a b] [:cat :string [:? :int]]))))
  (testing "formats repeated seqex arguments as array rest parameters"
    (is (= "a: string, ...rest: number[]"
           (#'ts/format-ts-args '[a & rest] [:cat :string [:* :int]]))))
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

(deftest ^:parallel correlated-alternative-declaration-test
  (is (= (str "/**\n"
              " * @param {\"text\"} kind\n"
              " * @param {string} value\n"
              " * @returns {boolean}\n"
              " */\n"
              "export function correlated(kind: \"text\", value: string): boolean;\n"
              "/**\n"
              " * @param {\"id\"} kind\n"
              " * @param {number} value\n"
              " * @returns {boolean}\n"
              " */\n"
              "export function correlated(kind: \"id\", value: number): boolean;")
         (#'ts/-fn->ts "correlated"
                       '[kind value]
                       [:=>
                        [:alt
                         [:cat [:= :text] :string]
                         [:cat [:= :id] :int]]
                        :boolean]))))

(deftest ^:parallel nested-alternative-declaration-test
  (testing "nested alt branches preserve correlated argument types"
    (let [declaration (#'ts/-fn->ts "nested-alt"
                                    '[value enabled]
                                    [:=> [:cat [:alt :string :int] :boolean] :string])]
      (is (re-find #"nested_alt\(value: string, enabled: boolean\)" declaration))
      (is (re-find #"nested_alt\(value: number, enabled: boolean\)" declaration))))
  (testing "nested altn branches preserve correlated argument types"
    (let [declaration (#'ts/-fn->ts "nested-altn"
                                    '[value enabled]
                                    [:=> [:cat [:altn [:text :string] [:id :int]] :boolean] :string])]
      (is (re-find #"nested_altn\(value: string, enabled: boolean\)" declaration))
      (is (re-find #"nested_altn\(value: number, enabled: boolean\)" declaration))))
  (testing "branches with differing and optional arities become overloads"
    (let [declaration (#'ts/-fn->ts "different-arities"
                                    '[value enabled]
                                    [:=>
                                     [:cat [:alt
                                            [:cat :string]
                                            [:cat :int [:? :boolean]]]]
                                     :string])]
      (is (re-find #"different_arities\(value: string\)" declaration))
      (is (re-find #"different_arities\(value: number\)" declaration))
      (is (re-find #"different_arities\(value: number, enabled: boolean\)" declaration))))
  (testing "nested overload alternatives preserve argument-context undefined"
    (let [declaration (#'ts/-fn->ts "maybe-alternative"
                                    '[value]
                                    [:=>
                                     [:cat [:alt [:maybe :string] :int]]
                                     :string])]
      (is (re-find #"maybe_alternative\(value: string \| undefined \| null\)" declaration))
      (is (re-find #"maybe_alternative\(value: number\)" declaration)))))

(deftest ^:parallel minimum-variadic-cardinality-declaration-test
  (is (re-find #"\.\.\.args: \[number, number, \.\.\.number\[\]\]"
               (#'ts/-fn->ts "at-least-two"
                             '[& args]
                             [:=> [:+ {:min 2} :int] :string])))
  (is (re-find #"prefix: string, \.\.\.rest: \[number, number, \.\.\.number\[\]\]"
               (#'ts/-fn->ts "munged-at-least-two"
                             '[prefix _AMPERSAND_]
                             [:=> [:cat :string [:+ {:min 2} :int]] :string])))
  (doseq [arglist ['[prefix & rest] '[prefix _AMPERSAND_]]]
    (let [declaration (#'ts/-fn->ts "alternative-rest"
                                    arglist
                                    [:=> [:cat :string [:alt [:+ :int] [:* :boolean]]] :string])]
      (is (re-find #"prefix: string, \.\.\.rest: \[number, \.\.\.number\[\]\]" declaration))
      (is (re-find #"prefix: string, \.\.\.rest: boolean\[\]" declaration)))))

(deftest ^:parallel bounded-alternative-declaration-test
  (let [arg-schema (into [:cat] (repeat 9 [:? :string]))
        declaration (#'ts/-fn->ts "bounded"
                                  '[a b c d e f g h i]
                                  [:=> arg-schema :string])]
    (is (re-find #"export function bounded\(\.\.\.args: unknown\[\]\): string;"
                 declaration))))

(deftest ^:parallel argument-alias-nullability-test
  (testing "maybe aliases use contextual definitions only for input positions"
    (is (= "export function accepts_nullable(value: Input_Metabase_Util_Malli_Typescript_DeclarationTest_NullableAlias): boolean;"
           (last (str/split-lines
                  (#'ts/fn->ts {:name 'accepts-nullable
                                :arglists '([value])
                                :schema [:=> [:cat ::nullable-alias] :boolean]}))))))
  (testing "output aliases retain their context-free nullability"
    (is (= "Metabase_Util_Malli_Typescript_DeclarationTest_NullableAlias"
           (ts/schema->ts ::nullable-alias))))
  (testing "recursive nullable aliases retain a recursive input graph"
    (let [declaration (#'ts/fn->ts {:name 'accepts-node
                                    :arglists '([value])
                                    :schema [:=> [:cat ::nullable-node] :boolean]})]
      (is (str/includes? declaration
                         "value: Input_Metabase_Util_Malli_Typescript_DeclarationTest_NullableNode"))))
  (testing "nested maybe values use bounded contextual aliases for input positions"
    (doseq [[argument-schema input-alias] [[::nested-nullable-alias
                                            "Input_Metabase_Util_Malli_Typescript_DeclarationTest_NestedNullableAlias"]
                                           [[:ref ::nullable-vector-alias]
                                            "Input_Metabase_Util_Malli_Typescript_DeclarationTest_NullableVectorAlias"]
                                           [[:schema {:registry {::local-nullable
                                                                 [:tuple [:maybe :string]]}}
                                             ::local-nullable]
                                            "Input_Metabase_Util_Malli_Typescript_DeclarationTest_LocalNullable"]
                                           [::recursive-nested-nullable-alias
                                            "Input_Metabase_Util_Malli_Typescript_DeclarationTest_RecursiveNestedNullableAlias"]]]
      (let [declaration (#'ts/fn->ts {:name 'accepts-nested
                                      :arglists '([value])
                                      :schema [:=> [:cat argument-schema] :boolean]})]
        (is (str/includes? declaration (str "value: " input-alias)))))
    (let [declarations (:declarations
                        (refs/type-aliases
                         #{::nested-nullable-alias
                           ::nullable-vector-alias
                           ::recursive-nested-nullable-alias}
                         {:resolve-schema mr/resolve-schema
                          :type-name ts/base-type-name
                          :ref-name ts/base-type-name}))]
      (is (not-any? #(str/includes? % "undefined") declarations)))))

(deftest ^:parallel generic-alternative-declaration-test
  (let [declaration (#'ts/-fn->ts "generic-correlated"
                                  '[value option]
                                  [:=>
                                   [:alt
                                    [:cat :string :int]
                                    [:cat :int :string]]
                                   [:schema {:ts/same-as 0
                                             :ts/generic-bound [:or :string :int]}
                                    [:or :string :int]]])]
    (is (re-find #"generic_correlated<T extends \(string \| number\)>\(value: T, option: number\): T;"
                 declaration))
    (is (re-find #"generic_correlated<T extends \(string \| number\)>\(value: T, option: string\): T;"
                 declaration))))

(deftest ^:parallel generic-variadic-declaration-test
  (doseq [[arglist rest-name] [['[value & args] "args"]
                               ['[value _AMPERSAND_] "rest"]]]
    (let [declaration (#'ts/-fn->ts "generic-variadic"
                                    arglist
                                    [:=>
                                     [:cat :any [:+ {:min 2} :int]]
                                     [:schema {:ts/same-as 0
                                               :ts/generic-bound :string}
                                      :string]])]
      (is (str/includes? declaration
                         (format "export function generic_variadic<T extends string>(value: T, ...%s: [number, number, ...number[]]): T;"
                                 rest-name))))))

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
                           [:or :string :int]]]))))
  (testing "standalone function schema handles named catn arguments"
    (is (= "(a: string, b: number) => boolean"
           (ts/schema->ts [:=> [:catn [:a :string] [:b :int]] :boolean]))))
  (testing "function declarations drop unevaluated predicate constraints and keep structural types"
    (is (= (str "/**\n"
                " * @param {unknown} query\n"
                " * @returns {string[]}\n"
                " */\n"
                "export function returned_columns_like(query: unknown): string[];")
           (#'ts/def->ts {:name     'metabase.util.malli.typescript-test/returned-columns-like
                          :ns       'metabase.util.malli.typescript-test
                          :arglists '([query])
                          :schema   [:=>
                                     [:cat :any]
                                     [:and
                                      [:sequential :string]
                                      [:fn '(fn [cols] (or (empty? cols)
                                                           (apply distinct? cols)))]]]})))))

(deftest untyped-export-fallback-test
  (is (= (str "/**\n"
              " * NOTE: Generated fallback declaration due to unavailable schema validator during build\n"
              " * @param {unknown} value\n"
              " * @returns {unknown}\n"
              " */\n"
              "export function untyped_export(value: unknown): unknown;")
         (#'ts/def->ts {:name 'example.entry/untyped-export
                        :arglists '([value])
                        :export true}))))

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
      "unknown" bytes?
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

(deftest type-predicate-declaration-test
  (testing "predicate returns narrow the first argument"
    (is (= "export function is_date(x: unknown): x is string;"
           (last (str/split-lines
                  (#'ts/fn->ts {:name     'is-date
                                :arglists '([x])
                                :schema   [:=> [:cat :any] [:boolean {:ts/predicate-of :string}]]}))))))
  (testing "predicate returns can target a later argument"
    (is (= "export function field_type(category: unknown, column: unknown): column is string;"
           (last (str/split-lines
                  (#'ts/fn->ts {:name     'field-type
                                :arglists '([category column])
                                :schema   [:=> [:cat :any :any]
                                           [:boolean {:ts/predicate-of {:param 1, :schema :string}}]]}))))))
  (testing "literal targets remain truthful primitive subsets"
    (is (= "export function is_bird(value: string): value is \"bird\";"
           (last (str/split-lines
                  (#'ts/fn->ts {:name 'is-bird
                                :arglists '([value])
                                :schema [:=> [:cat :string]
                                         [:boolean {:ts/predicate-of [:= "bird"]}]]}))))))
  (testing "predicate metadata requires a boolean return"
    (is (= "export function not_boolean(value: unknown): string;"
           (last (str/split-lines
                  (#'ts/fn->ts {:name 'not-boolean
                                :arglists '([value])
                                :schema [:=> [:cat :any]
                                         [:schema {:ts/predicate-of :string} :string]]})))))))

(deftest kind-specific-overload-test
  (let [declaration (ts/fn->ts
                     {:name 'update
                      :arglists '([value option])
                      :schema [:=>
                               [:cat [:or :string :int] :any]
                               [:schema {:ts/overloads
                                         [[:=> [:cat :string :any] :string]
                                          [:=> [:cat :int :any] :int]
                                          [:=> [:cat [:or :string :int] :any]
                                           [:or :string :int]]]}
                                [:or :string :int]]]})]
    (is (str/includes? declaration "export function update(value: string, option: unknown): string;"))
    (is (str/includes? declaration "export function update(value: number, option: unknown): number;"))
    (is (str/includes? declaration "export function update(value: string | number, option: unknown): (string | number);")))
  (doseq [overloads [[] [[:=> [:cat :string] :string]]]]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Invalid :ts/overloads metadata"
                          (ts/fn->ts
                           {:name 'update
                            :arglists '([value option])
                            :schema [:=> [:cat :string :any]
                                     [:schema {:ts/overloads overloads}
                                      :string]]}))))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Invalid :ts/overloads metadata"
                        (ts/fn->ts
                         {:name 'variadic
                          :arglists '([value & more])
                          :schema [:=> [:cat :string [:* :int]]
                                   [:schema {:ts/overloads [[:=> [:cat :string] :string]]}
                                    :string]]}))))

(deftest same-as-validation-test
  (testing "true explicit identity remains supported"
    (is (str/includes?
         (#'ts/-fn->ts "identity" '[value]
                       [:=> [:cat :string]
                        [:schema {:ts/same-as 0} :string]])
         "export function identity<T extends string>(value: T): T;")))
  (doseq [same-as [9 -1 0.5]
          :when (not= same-as 0)]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Invalid :ts/same-as metadata"
                          (#'ts/-fn->ts "invalid" '[value]
                                        [:=> [:cat :string]
                                         [:schema {:ts/same-as same-as} :string]]))))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Invalid :ts/same-as metadata"
                        (#'ts/-fn->ts "invalid-rest" '[value & more]
                                      [:=> [:cat :string [:* :int]]
                                       [:schema {:ts/same-as 1} :int]])))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Invalid :ts/same-as metadata"
                        (#'ts/-fn->ts "invalid-bound" '[value]
                                      [:=> [:cat :string]
                                       [:schema {:ts/same-as 0 :ts/generic-bound :int}
                                        :string]]))))

(deftest auto-generic-declaration-test
  (testing "same-schema inputs and outputs do not imply identity"
    (is (= "export function identity_like(value: Metabase_Util_Malli_Typescript_DeclarationTest_AutoGenericRef): Metabase_Util_Malli_Typescript_DeclarationTest_AutoGenericRef;"
           (last (str/split-lines
                  (#'ts/fn->ts {:name     'identity-like
                                :arglists '([value])
                                :schema   [:=> [:cat ::auto-generic-ref] ::auto-generic-ref]}))))))
  (testing "non-matching return forms stay plain"
    (is (= "export function plain(value: Metabase_Util_Malli_Typescript_DeclarationTest_AutoGenericRef): number;"
           (last (str/split-lines
                  (#'ts/fn->ts {:name     'plain
                                :arglists '([value])
                                :schema   [:=> [:cat ::auto-generic-ref] :int]})))))))

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

(defn run-typescript-tests
  "Run tests from shadow-cljs context."
  []
  (clojure.test/run-tests 'metabase.util.malli.typescript.declaration-test))
