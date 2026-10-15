(ns metabase.util.malli.typescript.schema-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase.lib-metric.schema :as metric.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.typescript.schema :as schema]
   [metabase.util.malli.typescript.type :as type]))

(deftest ^:parallel invalid-typescript-metadata-test
  (doseq [value [42 nil false '(str "string")]
          schema-form [[:any {:typescript value}]
                       [:string {:typescript value}]
                       [:fn {:typescript value} 'any?]]]
    (testing (pr-str schema-form)
      (let [error (try
                    (schema/schema->ts schema-form)
                    (catch Exception e e))]
        (is (instance? clojure.lang.ExceptionInfo error))
        (when (instance? clojure.lang.ExceptionInfo error)
          (is (= :invalid-typescript-metadata (:type (ex-data error))))
          (is (= (if (= :fn (first schema-form))
                   [:any {:typescript value}]
                   schema-form)
                 (:schema (ex-data error))))))))
  (testing "valid :typescript metadata is honored on non-:any schemas"
    (is (= "number" (schema/schema->ts [:or {:typescript "number"} :double :string])))
    (is (= "Brand" (schema/schema->ts [:string {:typescript "Brand"}])))))

(deftest ^:parallel collection-precedence-test
  (are [expected schema-form] (= expected (schema/schema->ts schema-form))
    "(\"asc\" | \"desc\")[]"
    [:sequential [:enum :asc :desc]]

    "(string | null)[]"
    [:sequential [:maybe :string]]

    "[string | null, ...(string | null)[]]"
    [:sequential {:min 1} [:maybe :string]]

    "(string | number)[]"
    [:vector [:or :string :int]]

    "[string, number][]"
    [:vector [:tuple :string :int]]

    "[[string, number], ...[string, number][]]"
    [:sequential {:min 1} [:tuple :string :int]]

    "(string | null)[]"
    [:any {:ts/array-of [:maybe :string]}]))

(deftest ^:parallel function-intersection-test
  (is (= "((arg0: string) => number) & ((arg0: string, arg1: number) => number)"
         (schema/schema->ts
          [:function
           [:=> [:cat :string] :int]
           [:=> [:cat :string :int] :int]]))))

(deftest ^:parallel callable-predicate-test
  (is (= "(...args: unknown[]) => unknown" (schema/schema->ts 'ifn?)))
  (is (= "(...args: unknown[]) => unknown" (schema/schema->ts 'fn?))))

(deftest ^:parallel type-predicate-test
  (is (= "(arg0: unknown) => arg0 is string"
         (schema/schema->ts [:=> [:cat :any] [:boolean {:ts/predicate-of :string}]])))
  (is (= "(arg0: unknown, arg1: number) => boolean"
         (schema/schema->ts
          [:=> [:cat :any :int]
           [:boolean {:ts/predicate-of {:param 1, :schema :string}}]])))
  (testing "invalid predicate metadata degrades to a boolean while preserving the callable shape"
    (are [expected args predicate]
         (= expected (schema/schema->ts [:=> args [:boolean {:ts/predicate-of predicate}]]))
      "(arg0: string) => boolean" [:cat :string] {:param 1, :schema :string}
      "(arg0: string, ...arg1: number[]) => boolean" [:cat :string [:* :int]] {:param 1, :schema :int}
      "((arg0: string) => boolean) & ((arg0: string, arg1: number) => boolean)" [:cat :string [:? :int]] {:param 1, :schema :int}
      "(arg0: string) => boolean" [:cat :string] {:param "one", :schema :string}
      "(arg0: string) => boolean" [:cat :string] {:param 0})
    (doseq [[args predicate] [[[:cat :string] {:param 1, :schema :string}]
                              [[:cat :string [:* :int]] {:param 1, :schema :int}]
                              [[:cat :string [:? :int]] {:param 1, :schema :int}]
                              [[:cat :string] {:param "one", :schema :string}]
                              [[:cat :string] {:param 0}]]]
      (is (some #(= :invalid-type-predicate (:type %))
                (:diagnostics
                 (schema/schema->result
                  [:=> args [:boolean {:ts/predicate-of predicate}]]))))))
  (testing "literal and finite-union targets remain valid subsets of primitive parameters"
    (is (= "(arg0: string) => arg0 is \"bird\""
           (schema/schema->ts [:=> [:cat :string]
                               [:boolean {:ts/predicate-of [:= "bird"]}]])))
    (is (= "(arg0: string) => arg0 is \"bird\" | \"fish\""
           (schema/schema->ts [:=> [:cat :string]
                               [:boolean {:ts/predicate-of [:enum "bird" "fish"]}]]))))
  (is (= "(value: unknown) => value is string"
         (schema/schema->ts [:fn {:ts/predicate-of :string} string?]))))

(deftest ^:parallel nested-overloads-test
  (is (= "((arg0: string) => string) & ((arg0: number) => number)"
         (schema/schema->ts
          [:=> [:cat [:or :string :int]]
           [:schema {:ts/overloads [[:=> [:cat :string] :string]
                                    [:=> [:cat :int] :int]]}
            [:or :string :int]]])))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Invalid :ts/overloads metadata"
                        (schema/schema->ts
                         [:=> [:cat :string]
                          [:schema {:ts/overloads []} :string]]))))

(deftest ^:parallel contextual-alias-discovery-test
  (testing "schema-bearing boundary metadata participates in input nullability"
    (let [registry {::wrapped [:any {:ts/object-of
                                     [:map {:closed true}
                                      [:value [:maybe :string]]]}]}
          {:keys [input-registry-refs]}
          (schema/schema->result
           [:=> [:cat [:ref ::wrapped]] :boolean]
           {:registry registry})]
      (is (= #{::wrapped} input-registry-refs))))
  (testing "nearest inline registry scope wins when definitions share a key"
    (let [{:keys [local-definitions]}
          (schema/schema->result
           [:schema {:registry {::value :string}}
            [:schema {:registry {::value :int}}
             [:ref ::value]]])]
      (is (= :int (mc/form (::value local-definitions))))))
  (testing "nullable discovery uses the nearest schema registry"
    (let [{:keys [input-registry-refs]}
          (schema/schema->result
           [:=>
            [:cat
             [:schema {:registry {::value :string}}
              [:schema {:registry {::value [:maybe :string]}}
               [:ref ::value]]]]
            :boolean])]
      (is (= #{::value} input-registry-refs)))))

(deftest registry-resolution-failure-test
  (with-redefs [mr/resolve-schema (fn [_]
                                    (throw (ex-info "broken registry schema" {})))]
    (let [{:keys [type diagnostics]} (schema/schema->result [:ref ::unresolved])]
      (is (= :unknown (:kind type)))
      (is (some #(= :invalid-schema (:type %)) diagnostics)))))

(deftest ^:parallel labeled-tuple-test
  (is (= "[op: string, value: number]"
         (schema/schema->ts [:catn [:op :keyword] [:value :int]])))
  (is (= "[string, number]"
         (schema/schema->ts [:cat :keyword :int]))))
(deftest ^:parallel multi-discriminant-test
  (testing "keyword dispatch synthesizes literal discriminants into map branches"
    (let [{:keys [type multi-branches]}
          (schema/schema->result
           [:multi {:dispatch :type}
            [:field [:map {:closed true} [:x :string]]]
            [:expression [:map {:closed true} [:y :int]]]])]
      (is (= "{\n\ttype: \"field\";\n\tx: string;\n} | {\n\ttype: \"expression\";\n\ty: number;\n}"
             (type/render type)))
      (is (= {:key-string "type"
              :branches [{:value :field, :value-string "\"field\"", :literal? true}
                         {:value :expression, :value-string "\"expression\"", :literal? true}]}
             multi-branches))))
  (testing "branches that already declare the literal (including :ref, :and, and :merge) are flagged without duplication"
    (let [registry {::field-branch [:map {:closed true} [:type [:= :field]] [:x :string]]}
          {:keys [type multi-branches]}
          (schema/schema->result
           [:multi {:dispatch :type}
            [:field [:ref ::field-branch]]
            [:expression [:and [:map {:closed true} [:type [:= :expression]] [:y :int]] :any]]
            [:merged [:merge [:map [:type [:= :merged]]] [:map [:z :boolean]]]]
            [:other :string]]
           {:registry registry})]
      (is (= "T_field-branch | {\n\ttype: \"expression\";\n\ty: number;\n} | {\n\ttype: \"merged\";\n\t[key: string]: unknown;\n} & {\n\tz: boolean;\n\t[key: string]: unknown;\n} | string"
             (type/render type {:ref-name #(str "T_" (name %))})))
      (is (= [{:value :field, :value-string "\"field\"", :literal? true}
              {:value :expression, :value-string "\"expression\"", :literal? true}
              {:value :merged, :value-string "\"merged\"", :literal? true}
              {:value :other, :value-string "\"other\"", :literal? false}]
             (:branches multi-branches)))))
  (testing ":and wrapping a :multi preserves :multi-branches"
    (let [{:keys [type multi-branches]}
          (schema/schema->result
           [:and
            [:map [:common :boolean]]
            [:multi {:dispatch :type}
             [:a [:map {:closed true} [:x :string]]]
             [:b [:map {:closed true} [:y :int]]]]])]
      (is (= :intersection (:kind type)))
      (is (= {:key-string "type"
              :branches [{:value :a, :value-string "\"a\"", :literal? true}
                         {:value :b, :value-string "\"b\"", :literal? true}]}
             multi-branches)))))

(deftest ^:parallel multi-function-and-default-dispatch-test
  (testing "function dispatch requires :ts/dispatch-key for synthesis"
    (let [{:keys [type multi-branches]}
          (schema/schema->result
           [:multi {:dispatch (fn [_] :field), :ts/dispatch-key :type}
            [:field [:map {:closed true} [:x :string]]]])]
      (is (= "{\n\ttype: \"field\";\n\tx: string;\n}" (type/render type)))
      (is (some? multi-branches))))
  (testing "opaque function dispatch stays a plain union"
    (let [{:keys [type multi-branches]}
          (schema/schema->result
           [:multi {:dispatch (fn [_] :field)}
            [:field [:map {:closed true} [:x :string]]]])]
      (is (= "{\n\tx: string;\n}" (type/render type)))
      (is (nil? multi-branches))))
  (testing "nil dispatch branches preserve maps that omit the dispatch key"
    (let [{:keys [type multi-branches]}
          (schema/schema->result
           [:multi {:dispatch :type}
            [nil [:map {:closed true} [:x :string]]]
            [:bird [:map {:closed true} [:x :string]]]
            [::mc/default [:map {:closed true} [:fallback :boolean]]]])]
      (is (= "{\n\tx: string;\n} | {\n\ttype: \"bird\";\n\tx: string;\n} | {\n\tfallback: boolean;\n}"
             (type/render type)))
      (is (= [{:value nil, :value-string "null", :literal? false}
              {:value :bird, :value-string "\"bird\"", :literal? true}
              {:value ::mc/default, :value-string nil, :literal? false}]
             (:branches multi-branches))))))
(mr/def ::preserved-keys
  [:map {:closed true} [:display-name :string]])

(deftest ^:parallel metric-filter-parts-js-shape-test
  (let [relative (schema/schema->ts (mr/registered-schema ::metric.schema/relative-date-filter-parts.js))
        exclude (schema/schema->ts (mr/registered-schema ::metric.schema/exclude-date-filter-parts.js))
        date (schema/schema->ts (mr/registered-schema ::metric.schema/specific-date-filter-parts.js))
        time (schema/schema->ts (mr/registered-schema ::metric.schema/time-filter-parts.js))]
    (is (not (str/ends-with? relative "\n\t[key: string]: unknown;\n}")))
    (is (str/includes? relative "offsetUnit?:"))
    (is (str/includes? relative "offsetValue: number | null;"))
    (is (str/includes? relative "options: {\n\tincludeCurrent?: boolean;\n\t[key: string]: unknown;\n} | null;"))
    (is (str/includes? relative "dimension: metabase.lib-metric.schema/metadata-dimension"))
    (is (not (str/includes? relative "displayName")))
    (is (str/includes? exclude "unit?:"))
    (is (str/includes? date "values: (Date | null)[]"))
    (is (str/includes? time "values: import('dayjs').Dayjs[]"))))

(deftest ^:parallel metric-temporal-input-shape-test
  (let [date (schema/schema->ts (mr/registered-schema ::metric.schema/specific-date-filter-parts.js-input))
        time (schema/schema->ts (mr/registered-schema ::metric.schema/time-filter-parts.js-input))]
    (is (str/includes? date "values: (Date | string | import('dayjs').Dayjs)[]"))
    (is (str/includes? time "values: (Date | string | import('dayjs').Dayjs)[]"))))

(deftest ^:parallel ordinary-key-transform-test
  (is (= "{\n\tdisplayName: string;\n}"
         (schema/schema->ts [:map {:closed true :ts/key-transform :camelCase}
                             [:display-name :string]])))
  (doseq [[nested expected]
          [[[:map {:closed true :ts/key-transform :none} [:display-name :string]]
            "{\n\touterKey: {\n\t\"display-name\": string;\n};\n}"]
           [[:schema {:ts/key-transform :none} [:map {:closed true} [:display-name :string]]]
            "{\n\touterKey: {\n\t\"display-name\": string;\n};\n}"]
           [[:ref {:ts/key-transform :none} ::preserved-keys]
            "{\n\touterKey: metabase.util.malli.typescript.schema-test/preserved-keys;\n}"]]]
    (is (= expected
           (schema/schema->ts [:any {:ts/object-of [:map {:closed true} [:outer-key nested]]
                                     :ts/key-transform :camelCase}])))))

(deftest ^:parallel seqex-key-transform-test
  (doseq [schema-type [:cat :catn :alt :altn :? :* :+ :repeat]
          [parent-transform properties expected-key]
          [[:camelCase {} "displayName: string"]
           [:camelCase {:ts/key-transform :none} "\"display-name\": string"]
           [:none {:ts/key-transform :camelCase} "displayName: string"]]
          child-properties [{:closed true} {:closed true :ts/key-transform :camelCase}]]
    (let [child [:map child-properties [:display-name :string]]
          entry (if (#{:catn :altn} schema-type) [:bird child] child)
          nested [schema-type properties entry]
          emitted (schema/schema->ts
                   [:any {:ts/key-transform parent-transform
                          :ts/object-of [:map {:closed true} [:outer [:cat nested]]]}])
          expected (if (:ts/key-transform child-properties) "displayName: string" expected-key)]
      (testing (pr-str [schema-type parent-transform properties child-properties])
        (is (str/includes? emitted expected))
        (is (not (str/includes? emitted (if (= expected "displayName: string")
                                          "\"display-name\": string"
                                          "displayName: string")))))))
  (is (= "(arg0: {\n\t\"display-name\": string;\n}) => null"
         (schema/schema->ts
          [:any {:ts/key-transform :camelCase
                 :ts/object-of [:=> [:cat {:ts/key-transform :none}
                                     [:map {:closed true} [:display-name :string]]] :nil]}]))))

(deftest ^:parallel camel-helper-test
  (testing "simple string keys delegate to the Camel helper"
    (is (= "Camel<{\n\t\"display-name\": string;\n\t\"enabled?\"?: boolean;\n}>"
           (schema/schema->ts
            [:any {:ts/object-of
                   [:map {:closed true}
                    ["display-name" :string]
                    ["enabled?" {:optional true} :boolean]]
                   :ts/key-transform :camelCase}]))))
  (testing "keys outside the provable grammar keep exact inline expansion"
    (is (= "{\n\turlValue: number;\n}"
           (schema/schema->ts
            [:any {:ts/object-of
                   [:map {:closed true}
                    ["URL-value" :int]]
                   :ts/key-transform :camelCase}])))))
(deftest ^:parallel finite-map-key-test
  (are [expected key-schema] (= expected (schema/schema->ts [:map-of key-schema :int]))
    "Partial<Record<\"only\", number>>"
    [:= :only]

    "Partial<Record<\"one\" | \"two\", number>>"
    [:or [:= :one] [:= :two]]

    "Partial<Record<\"one\" | \"two\", number>>"
    [:or [:= :one] [:enum :two]])
  (testing "open key schemas retain the conservative string fallback"
    (is (= "Record<string, number>"
           (schema/schema->ts [:map-of [:or :string [:= :one]] :int])))))

(deftest ^:parallel readonly-test
  (are [expected schema-form] (= expected (schema/schema->ts schema-form {:readonly? true}))
    "readonly string[]"
    [:vector :string]

    "readonly [string, ...string[]]"
    [:sequential {:min 1} :string]

    "Readonly<{\n\tx: string;\n}>"
    [:map {:closed true} [:x :string]]

    "Readonly<Record<string, number>>"
    [:map-of :string :int]

    "ReadonlySet<string>"
    [:set :string])
  (testing "parameter positions stay mutable"
    (is (= "(arg0: string[]) => number"
           (schema/schema->ts
            [:=> [:cat [:vector :string]] :int]
            {:readonly? true}))))
  (testing "camel transforms retain readonly output"
    (is (= "Readonly<Camel<{\n\t\"display-name\": string;\n}>>"
           (schema/schema->ts
            [:any {:ts/object-of [:map {:closed true} ["display-name" :string]]
                   :ts/key-transform :camelCase}]
            {:readonly? true})))))
(deftest ^:parallel unsupported-predicate-test
  (doseq [schema-form ['bytes? 'uri?]]
    (let [{:keys [type diagnostics]} (schema/schema->result schema-form)]
      (is (= "unknown" (type/render type)))
      (is (seq diagnostics)))))
(deftest ^:parallel literal-test
  (are [expected schema-form] (= expected (schema/schema->ts schema-form))
    "\"text\"" [:= "text"]
    "\"qualified/value\"" [:= :qualified/value]
    "\"x\"" [:= \x]
    "true" [:= true]
    "false" [:= false]
    "42" [:= 42]
    "4.5" [:= 4.5])
  (doseq [value ['plain
                 'qualified/name
                 1/2
                 Double/POSITIVE_INFINITY
                 Double/NEGATIVE_INFINITY
                 Double/NaN]]
    (let [{:keys [type diagnostics]} (schema/schema->result [:= value])]
      (is (= "unknown" (type/render type)))
      (is (= :unsupported-literal (:type (first diagnostics))))))
  (testing "an unsupported enum member safely widens the whole enum"
    (let [{:keys [type diagnostics]} (schema/schema->result [:enum :valid 1/2])]
      (is (= "unknown" (type/render type)))
      (is (some #(= :unsupported-literal (:type %)) diagnostics)))))
(deftest ^:parallel unsupported-map-key-test
  (doseq [key-schema [[:enum true false]
                      [:enum nil]
                      [:enum :valid true]
                      [:enum Double/POSITIVE_INFINITY]
                      [:enum Double/NEGATIVE_INFINITY]
                      [:enum Double/NaN]
                      [:enum 1/2]]]
    (let [{:keys [type diagnostics]}
          (schema/schema->result [:map-of key-schema :int])]
      (is (= "Partial<Record<string, number>>" (type/render type)))
      (is (some #(= :unsupported-map-key (:type %)) diagnostics))))
  (testing "symbols become TypeScript string literal keys"
    (let [{:keys [type diagnostics]}
          (schema/schema->result [:map-of [:enum 'plain 'qualified/name] :int])]
      (is (= "Partial<Record<\"plain\" | \"qualified/name\", number>>"
             (type/render type)))
      (is (empty? diagnostics)))))
(deftest ^:parallel seqex-test
  (are [expected schema-form] (= expected (schema/schema->ts schema-form))
    "[string, Record<string, unknown>, unknown, ...unknown[]]"
    [:cat :keyword :map [:+ :any]]

    "[string] | [string, number]"
    [:cat :string [:? :int]]

    "[\"text\", string] | [\"id\", number]"
    [:alt
     [:cat [:= :text] :string]
     [:cat [:= :id] :int]]

    "[string, number, number, ...number[]]"
    [:cat :string [:+ {:min 2} :int]]))
(deftest ^:parallel non-trailing-sequence-repetition-test
  (doseq [schema-form [[:cat [:* :string] :int]
                       [:cat [:+ :string] :int]
                       [:cat [:repeat {:min 2} :string] :int]]]
    (let [{:keys [type diagnostics]} (schema/schema->result schema-form)]
      (is (= "(string | number)[]" (type/render type)))
      (is (some #(= :non-trailing-sequence-repetition (:type %)) diagnostics)))))
(deftest ^:parallel composite-sequence-repetition-test
  (doseq [schema-form [[:+ [:cat :string [:* :boolean]]]
                       [:repeat {:min 2} [:cat :string [:* :boolean]]]
                       [:+ [:alt :string :boolean]]]]
    (let [{:keys [type diagnostics]} (schema/schema->result schema-form)]
      (is (= "(string | boolean)[]" (type/render type)))
      (is (some #(= :composite-sequence-repetition (:type %)) diagnostics)))))
(deftest ^:parallel tuple-valued-sequence-repetition-test
  (are [expected schema-form] (= expected (schema/schema->ts schema-form))
    "[[string, number], ...[string, number][]]"
    [:+ [:tuple :string :int]]

    "[[string, number], [string, number], ...[string, number][]]"
    [:repeat {:min 2} [:tuple :string :int]]))
(deftest ^:parallel sequence-alternative-limit-test
  (let [schema-form (into [:cat] (repeat 9 [:? :string]))
        {:keys [type diagnostics]} (schema/schema->result schema-form)]
    (is (= "unknown[]" (type/render type)))
    (is (some #(= :sequence-alternative-limit-exceeded (:type %)) diagnostics))))
(deftest ^:parallel function-seqex-test
  (is (= "((arg0: string, arg1: number) => boolean) & ((arg0: number, arg1: string) => boolean)"
         (schema/schema->ts
          [:=> [:cat [:alt [:cat :string :int] [:cat :int :string]]] :boolean])))
  (is (= "((arg0: string, arg1: boolean) => string) & ((arg0: number, arg1: boolean) => string)"
         (schema/schema->ts
          [:=> [:cat [:alt :string :int] :boolean] :string])))
  (is (= "((arg0: string) => string) & ((arg0: number) => string) & ((arg0: number, arg1: boolean) => string)"
         (schema/schema->ts
          [:=> [:cat [:alt [:cat :string] [:cat :int [:? :boolean]]]] :string])))
  (is (= "(...args: unknown[]) => string"
         (schema/schema->ts
          [:=> (into [:cat] (repeat 9 [:? :string])) :string])))
  (is (= "((arg0: string, ...arg1: boolean[]) => string) & ((arg0: string, arg1: number, ...arg2: boolean[]) => string)"
         (schema/schema->ts [:=> [:cat :string [:? :int] [:* :boolean]] :string])))
  (is (= "(max_rows: number, predicate_QMARK_: boolean) => string"
         (schema/schema->ts [:=> [:catn [:max-rows :int] [:predicate? :boolean]] :string])))
  (is (= "(arg0: string, arg1: number, a_b: boolean, arg3: string) => string"
         (schema/schema->ts
          [:=> [:catn [:1st :string] [:a.b :int] [:a-b :boolean] [:a_b :string]] :string]))))
(deftest ^:parallel predicate-sanitizer-test
  (testing "explicit TypeScript overrides never evaluate predicates"
    (is (= "Custom"
           (schema/schema->ts
            [:fn {:typescript "Custom"}
             '(fn [x] (unresolved-predicate? x))]))))
  (testing "unknown absorbs unions"
    (is (= "unknown" (schema/schema->ts [:or :string :any])))
    (is (= "unknown"
           (schema/schema->ts
            [:or :string [:fn '(fn [x] (unresolved-predicate? x))]]))))
  (testing "predicate intersections preserve structural branches"
    (is (= "string[]"
           (schema/schema->ts
            [:and [:sequential :string]
             [:fn '(fn [xs] (apply distinct? xs))]])))))
(deftest ^:parallel map-key-collision-test
  (testing "namespace stripping merges colliding fields"
    (let [{:keys [type diagnostics]}
          (schema/schema->result
           [:map
            [:source :string]
            [:lib/source {:optional true} :int]
            [:other/source :boolean]])]
      (is (= "{\n\tsource: string | number | boolean;\n\t[key: string]: unknown;\n}"
             (type/render type)))
      (is (= [{:type :map-key-collision
               :final-key "source"
               :source-keys [:source :lib/source :other/source]}]
             diagnostics))))
  (testing "all colliding optional fields remain optional"
    (is (= "{\n\tdisplayName?: string | number;\n}"
           (schema/schema->ts
            [:any {:ts/object-of
                   [:map {:closed true}
                    [:display-name {:optional true} :string]
                    [:display_name {:optional true} :int]]
                   :ts/key-transform :camelCase}]))))
  (testing "string keys use the same camelCase transform as runtime object conversion"
    (is (= "{\n\tdisplayName: string;\n\tunderScore: number;\n\tspaceSeparated: boolean;\n\tisEnabled: string;\n\turlValue: number;\n\talreadyUrlValue: string;\n}"
           (schema/schema->ts
            [:any {:ts/object-of
                   [:map {:closed true}
                    ["display-name" :string]
                    ["under_score" :int]
                    ["space separated" :boolean]
                    ["enabled?" :string]
                    ["URL-value" :int]
                    ["alreadyURLValue" :string]]
                   :ts/key-transform :camelCase}]))))
  (testing "keyword and string keys that transform alike are merged"
    (let [{:keys [type diagnostics]}
          (schema/schema->result
           [:any {:ts/object-of
                  [:map {:closed true}
                   [:display-name :string]
                   ["display_name" :int]]
                  :ts/key-transform :camelCase}])]
      (is (= "{\n\tdisplayName: string | number;\n}" (type/render type)))
      (is (= [{:type :map-key-collision
               :final-key "displayName"
               :source-keys [:display-name "display_name"]}]
             diagnostics))))
  (testing "non-colliding keys retain source order"
    (is (= "{\n\tfirst: string;\n\tsecond: number;\n}"
           (schema/schema->ts
            [:map {:closed true}
             [:first :string]
             [:second :int]])))))

(mr/def ::test-descendant-options
  [:map {:closed true}
   [:lib/uuid :string]])

(mr/def ::test-descendant-arg
  :int)

(mr/def ::test-descendant-repeated-args
  [:repeat {:min 2} [:schema [:ref ::test-descendant-arg]]])

(mr/def ::test-registered-parent
  [:and
   [:map {:closed true}
    [:options ::test-descendant-options]]
   [:catn
    [:tag [:= :clause]]
    [:options [:schema [:ref ::test-descendant-options]]]
    [:args ::test-descendant-repeated-args]]])

(deftest ^:parallel resolve-registered-schema-preserves-descendant-refs-test
  (let [resolved (schema/resolve-registered-schema ::test-registered-parent)
        {:keys [registry-refs]} (schema/schema->result resolved)]
    (is (= #{::test-descendant-options ::test-descendant-arg} registry-refs))
    (is (= (str "{\n\toptions: metabase.util.malli.typescript.schema-test/test-descendant-options;\n}"
                " & [\"clause\", metabase.util.malli.typescript.schema-test/test-descendant-options,"
                " metabase.util.malli.typescript.schema-test/test-descendant-arg,"
                " metabase.util.malli.typescript.schema-test/test-descendant-arg,"
                " ...metabase.util.malli.typescript.schema-test/test-descendant-arg[]]")
           (schema/schema->ts resolved)))))

(deftest ^:parallel multi-branch-literal-with-properties-test
  (is (= "t/stage-native | t/stage-mbql"
         (schema/schema->ts
          [:multi {:dispatch :lib/type}
           [:mbql.stage/native [:ref :t/stage-native]]
           [:mbql.stage/mbql [:ref :t/stage-mbql]]]
          {:registry {:t/stage-native [:map [:lib/type [:= {:decode/normalize identity} :mbql.stage/native]]]
                      :t/stage-mbql   [:map [:lib/type [:= {:decode/normalize identity} :mbql.stage/mbql]]]}}))))

(mr/def ::test-pivot-types
  [:enum :category :location :time])

(mr/def ::test-map-of-enum-ref
  [:map-of ::test-pivot-types :boolean])

(mr/def ::test-int-key
  :int)

(mr/def ::test-map-of-int-ref
  [:map-of [:ref ::test-int-key] :string])

(deftest ^:parallel map-of-preserved-ref-key-test
  (is (= "Partial<Record<\"category\" | \"location\" | \"time\", boolean>>"
         (schema/schema->ts (schema/resolve-registered-schema ::test-map-of-enum-ref))))
  (is (= "Record<number, string>"
         (schema/schema->ts (schema/resolve-registered-schema ::test-map-of-int-ref)))))

(deftest ^:parallel non-trailing-sequence-repetition-with-prefix-test
  (let [{:keys [type diagnostics]}
        (schema/schema->result
         [:cat [:enum :+ :-] :boolean [:* :string] :int [:* [:alt :string :int]]])]
    (is (= "[\"+\" | \"-\", boolean, ...(string | number)[]]"
           (type/render type)))
    (is (some #(= :non-trailing-sequence-repetition (:type %)) diagnostics))))

(mr/def ::test-plus-minus-temporal
  [:cat
   [:enum :+ :-]
   [:schema [:ref ::test-descendant-options]]
   [:* :string]
   :int
   [:* [:alt :string :int]]])

(mr/def ::test-plus-minus-numeric
  [:cat
   :keyword
   [:schema [:ref ::test-descendant-options]]
   [:+ {:min 2} :int]])

(mr/def ::test-temporal-diff
  [:tuple
   [:= :-]
   [:schema [:ref ::test-descendant-options]]
   :int
   :int])

(mr/def ::test-field-id
  [:tuple [:= :field] [:ref ::test-descendant-options] :int])

(mr/def ::test-field-literal
  [:tuple [:= :field] [:ref ::test-descendant-options] :string])

(deftest ^:parallel tuple-guard-specialization-test
  (testing ":+ , :-, and :field preserve compatible :ref branches without emitting a tuple intersection"
    (is (= (str "metabase.util.malli.typescript.schema-test/test-plus-minus-temporal"
                " | metabase.util.malli.typescript.schema-test/test-plus-minus-numeric")
           (schema/schema->ts
            [:and
             [:cat
              [:= :+]
              [:schema [:ref ::test-descendant-options]]
              [:+ {:min 2} :any]]
             [:multi {:dispatch first}
              [:temporal [:ref ::test-plus-minus-temporal]]
              [:numeric [:ref ::test-plus-minus-numeric]]]])))
    (is (= (str "metabase.util.malli.typescript.schema-test/test-plus-minus-temporal"
                " | metabase.util.malli.typescript.schema-test/test-plus-minus-numeric"
                " | metabase.util.malli.typescript.schema-test/test-temporal-diff")
           (schema/schema->ts
            [:and
             [:cat
              [:= :-]
              [:schema [:ref ::test-descendant-options]]
              [:+ {:min 2} :any]]
             [:multi {:dispatch first}
              [:temporal [:ref ::test-plus-minus-temporal]]
              [:numeric [:ref ::test-plus-minus-numeric]]
              [:diff [:ref ::test-temporal-diff]]]])))
    (is (= (str "metabase.util.malli.typescript.schema-test/test-field-id"
                " | metabase.util.malli.typescript.schema-test/test-field-literal")
           (schema/schema->ts
            [:and
             [:tuple
              [:= :field]
              [:ref ::test-descendant-options]
              [:or :string :int]]
             [:multi {:dispatch first}
              [:id ::test-field-id]
              [:literal ::test-field-literal]]]))))
  (testing "inline tuple branches are specialized with the guard's literal tag and minimum arity"
    (is (= (str "[\"+\", metabase.util.malli.typescript.schema-test/test-descendant-options,"
                " string | number, string | number, ...(string | number)[]]"
                " | [\"+\", metabase.util.malli.typescript.schema-test/test-descendant-options,"
                " number, number, ...number[]]")
           (schema/schema->ts
            [:and
             [:cat
              [:= :+]
              [:schema [:ref ::test-descendant-options]]
              [:+ {:min 2} :any]]
             [:multi {:dispatch first}
              [:temporal
               [:cat
                [:enum :+ :-]
                [:schema [:ref ::test-descendant-options]]
                [:* :string]
                :int
                [:* :string]]]
              [:numeric
               [:cat
                :keyword
                [:schema [:ref ::test-descendant-options]]
                [:+ {:min 2} :int]]]]])))))

(deftest ^:parallel schema-reference-keywords-test
  (is (= #{:ref.ns/value-schema
           :ref.ns/branch-schema
           :ref.ns/catn-schema
           :ref.ns/registry-schema
           :ref.ns/predicate-schema}
         (schema/schema-reference-keywords
          [:and
           [:map {:registry {:local.ns/def :ref.ns/registry-schema}}
            [:ignored.map.key/one :ref.ns/value-schema]
            [:ignored.map.key/two {:optional true} [:= :ignored.literal/kw]]
            [:ignored.map.key/three [:enum :ignored.enum/a :ignored.enum/b]]]
           [:catn [:item :ref.ns/catn-schema]]
           [:=> [:cat :any] [:boolean {:ts/predicate-of {:param 0 :schema :ref.ns/predicate-schema}}]]
           [:multi {:dispatch :lib/type}
            [:ignored.dispatch/value [:ref :ref.ns/branch-schema]]]]))))
