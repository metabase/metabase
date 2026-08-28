(ns metabase.util.malli.typescript.refs-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.util.malli.typescript.refs :as refs]
   [metabase.util.malli.typescript.schema :as schema]))

(def ^:private schemas
  {::a [:map [:b [:ref ::b]]]
   ::b [:map [:shared [:ref ::shared]]]
   ::shared :string})

(defn- test-type-name
  [schema-keyword]
  (str "T_" (name schema-keyword)))

(deftest ^:parallel dependency-closure-test
  (let [{:keys [definitions refs-used]}
        (refs/dependency-closure
         #{::a}
         {:resolve-schema schemas
          :compile-options {:registry schemas}})]
    (is (= #{::a ::b ::shared} (set (keys definitions))))
    (is (= #{::a ::b ::shared} refs-used))))

(deftest ^:parallel type-aliases-test
  (let [{:keys [declarations refs-used]}
        (refs/type-aliases
         #{::a}
         {:resolve-schema schemas
          :compile-options {:registry schemas}
          :type-name test-type-name
          :ref-name test-type-name})]
    (is (= #{::a ::b ::shared} refs-used))
    (is (= 3 (count declarations)))
    (is (= 3 (count (distinct declarations))))))

(deftest ^:parallel multi-extract-aliases-test
  (let [multi-schemas
        {::tagged [:multi {:dispatch :type}
                   [:field [:map {:closed true} [:x :string]]]
                   [:expression [:map {:closed true} [:y :int]]]]
         ::other :string}
        {declarations :declarations}
        (refs/type-aliases
         #{::tagged}
         {:resolve-schema multi-schemas
          :compile-options {:registry multi-schemas}
          :type-name test-type-name
          :ref-name test-type-name})]
    (is (some #(re-find #"^export type T_tagged = \{\n\ttype: \"field\";\n\tx: string;\n\} \| \{\n\ttype: \"expression\";\n\ty: number;\n};$" %)
              declarations))
    (is (some #(= "export type T_tagged_Field = Extract<T_tagged, { \"type\": \"field\" }>;" %)
              declarations))
    (is (some #(= "export type T_tagged_Expression = Extract<T_tagged, { \"type\": \"expression\" }>;" %)
              declarations))))

(deftest ^:parallel phantom-discriminant-test
  (testing "structurally identical object aliases get optional phantom tags"
    (let [colliding-schemas
          {::one [:map {:closed true} [:x :string]]
           ::two [:map {:closed true} [:x :string]]
           ::three :string
           ::four :string}
          declarations (:declarations
                        (refs/type-aliases
                         #{::one ::two ::three ::four}
                         {:resolve-schema colliding-schemas
                          :compile-options {:registry colliding-schemas}
                          :type-name test-type-name
                          :ref-name test-type-name}))]
      (is (some #(= "export type T_one = {\n\tx: string;\n} & {\n\t__kind?: \"T_one\";\n};" %) declarations))
      (is (some #(= "export type T_two = {\n\tx: string;\n} & {\n\t__kind?: \"T_two\";\n};" %) declarations))
      (is (= #{"export type T_three = string;" "export type T_four = string;"}
             (set (filter #(re-find #"T_(three|four)" %) declarations))))))
  (testing "distinct object aliases stay untouched"
    (let [distinct-schemas
          {::one [:map {:closed true} [:x :string]]
           ::two [:map {:closed true} [:y :int]]}
          declarations (:declarations
                        (refs/type-aliases
                         #{::one ::two}
                         {:resolve-schema distinct-schemas
                          :compile-options {:registry distinct-schemas}
                          :type-name test-type-name
                          :ref-name test-type-name}))]
      (is (not-any? #(str/includes? % "__kind") declarations)))))

(deftest ^:parallel unresolved-schema-ref-test
  (let [{:keys [declarations diagnostics]}
        (refs/type-aliases
         #{::missing}
         {:resolve-schema (constantly nil)
          :type-name test-type-name
          :ref-name test-type-name})]
    (is (= ["export type T_missing = unknown;"] declarations))
    (is (= [{:type :unresolved-schema-ref, :schema ::missing}]
           diagnostics))))

(deftest ^:parallel inline-registry-test
  (let [compiled
        (schema/schema->result
         [:schema
          {:registry {::node
                      [:map
                       [:value :string]
                       [:children {:optional true}
                        [:sequential [:ref ::node]]]]}}
          ::node])]
    (is (= #{::node} (:registry-refs compiled)))
    (is (= #{::node} (set (keys (:local-definitions compiled))))))
  (let [compiled
        (schema/schema->result
         [:schema
          {:registry {::expression-parts
                      [:map
                       [:lib/type [:= :mbql/expression-parts]]
                       [:args [:sequential [:ref ::expression-parts]]]]}}
          ::expression-parts])
        {:keys [declarations]}
        (refs/type-aliases
         (:registry-refs compiled)
         {:resolve-schema (:local-definitions compiled)
          :compile-options {:registry (:local-definitions compiled)}
          :type-name test-type-name
          :ref-name test-type-name})]
    (is (= 1 (count declarations)))
    (is (re-find #"export type T_expression-parts" (first declarations)))
    (is (re-find #"T_expression-parts\[\]" (first declarations)))))

(deftest ^:parallel recursive-alias-safety-test
  (testing "guarded recursive refs are retained"
    (let [recursive-schemas {::node [:map [:children [:sequential [:ref ::node]]]]}
          {:keys [declarations diagnostics]}
          (refs/type-aliases
           #{::node}
           {:resolve-schema recursive-schemas
            :compile-options {:registry recursive-schemas}
            :type-name test-type-name
            :ref-name test-type-name})]
      (is (re-find #"T_node\[\]" (first declarations)))
      (is (empty? diagnostics))))
  (testing "unguarded recursive refs become unknown"
    (let [recursive-schemas {::left [:or :string [:ref ::right]]
                             ::right [:or :int [:ref ::left]]}
          {:keys [declarations diagnostics]}
          (refs/type-aliases
           #{::left}
           {:resolve-schema recursive-schemas
            :compile-options {:registry recursive-schemas}
            :type-name test-type-name
            :ref-name test-type-name})]
      (is (= ["export type T_left = unknown;"
              "export type T_right = unknown;"]
             declarations))
      (is (= #{[::left ::right] [::right ::left]}
             (set (map (juxt :schema :ref) diagnostics)))))))
