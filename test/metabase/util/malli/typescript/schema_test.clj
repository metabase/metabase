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

    "(string | null)[]"
    [:any {:ts/array-of [:maybe :string]}]))

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
