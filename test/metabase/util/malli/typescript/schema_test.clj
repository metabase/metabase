(ns metabase.util.malli.typescript.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.malli.typescript.schema :as schema]
   [metabase.util.malli.typescript.type :as type]))

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
  (is (= "(arg0: unknown, arg1: number) => arg1 is string"
         (schema/schema->ts
          [:=> [:cat :any :int]
           [:boolean {:ts/predicate-of {:param 1, :schema :string}}]])))
  (is (= "(value: unknown) => value is string"
         (schema/schema->ts [:fn {:ts/predicate-of :string} string?]))))
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
  (testing "branches that already declare the literal are flagged without duplication"
    (let [{:keys [type multi-branches]}
          (schema/schema->result
           [:multi {:dispatch :type}
            [:field [:map {:closed true} [:type [:= :field]] [:x :string]]]
            [:other :string]])]
      (is (= "{\n\ttype: \"field\";\n\tx: string;\n} | string" (type/render type)))
      (is (= [{:value :field, :value-string "\"field\"", :literal? true}
              {:value :other, :value-string "\"other\"", :literal? false}]
             (:branches multi-branches)))))
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
      (is (nil? multi-branches)))))
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
  (is (= "(arg0: string, arg1?: number, ...arg2: boolean[]) => string"
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
