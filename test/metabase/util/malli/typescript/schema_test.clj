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
         (schema/schema->ts [:=> [:cat :string [:? :int] [:* :boolean]] :string]))))

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
  (testing "non-colliding keys retain source order"
    (is (= "{\n\tfirst: string;\n\tsecond: number;\n}"
           (schema/schema->ts
            [:map {:closed true}
             [:first :string]
             [:second :int]])))))
