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

(deftest ^:parallel contextual-input-alias-closure-test
  (let [nullable-graph
        {::root [:map {:closed true}
                 [:left [:ref ::node]]
                 [:right [:ref ::node]]]
         ::node [:map {:closed true}
                 [:child {:optional true} [:maybe [:ref ::node]]]]}
        {declarations :declarations definitions :definitions}
        (refs/type-aliases
         #{::root}
         {:resolve-schema nullable-graph
          :compile-options {:registry nullable-graph :argument-context? true}
          :dependency-refs :input-registry-refs
          :contextual-input? true
          :type-name test-type-name
          :ref-name test-type-name})]
    (is (= #{::root ::node} (set (keys definitions))))
    (is (= 2 (count declarations)))
    (is (some #(str/includes? % "export type Input_T_root = {\n\tleft: Input_T_node;\n\tright: Input_T_node;\n};")
              declarations))
    (is (some #(str/includes? % "export type Input_T_node = {\n\tchild?: Input_T_node | undefined | null;\n};")
              declarations))))

(deftest ^:parallel multi-extract-aliases-test
  (let [multi-schemas
        {::tagged [:multi {:dispatch :type}
                   [:field [:map {:closed true} [:x :string]]]
                   [:expression [:map {:closed true} [:y :int]]]]
         ::intersected [:and
                        [:map {:closed true} [:common :boolean]]
                        [:multi {:dispatch :type}
                         [:mbql [:map {:closed true} [:stages :int]]]
                         [:native [:map {:closed true} [:query :string]]]]]
         ::other :string}
        {declarations :declarations}
        (refs/type-aliases
         #{::tagged ::intersected}
         {:resolve-schema multi-schemas
          :compile-options {:registry multi-schemas}
          :type-name test-type-name
          :ref-name test-type-name})]
    (is (some #(re-find #"^export type T_tagged = \{\n\ttype: \"field\";\n\tx: string;\n\} \| \{\n\ttype: \"expression\";\n\ty: number;\n};$" %)
              declarations))
    (is (some #(= "export type T_tagged_Field = Extract<T_tagged, { \"type\": \"field\" }>;" %)
              declarations))
    (is (some #(= "export type T_tagged_Expression = Extract<T_tagged, { \"type\": \"expression\" }>;" %)
              declarations))
    (is (some #(= "export type T_intersected_Mbql = Extract<T_intersected, { \"type\": \"mbql\" }>;" %)
              declarations))
    (is (some #(= "export type T_intersected_Native = Extract<T_intersected, { \"type\": \"native\" }>;" %)
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
  (testing "safe object-only compounds retain phantom distinctions"
    (let [colliding-schemas
          {::union-one [:or [:map {:closed true} [:x :string]]
                        [:map {:closed true} [:y :int]]]
           ::union-two [:or [:map {:closed true} [:x :string]]
                        [:map {:closed true} [:y :int]]]
           ::intersection-one [:and [:map {:closed true} [:x :string]]
                               [:map {:closed true} [:y :int]]]
           ::intersection-two [:and [:map {:closed true} [:x :string]]
                               [:map {:closed true} [:y :int]]]}
          declarations (set (:declarations
                             (refs/type-aliases
                              (set (keys colliding-schemas))
                              {:resolve-schema colliding-schemas
                               :compile-options {:registry colliding-schemas}
                               :type-name test-type-name
                               :ref-name test-type-name})))]
      (is (contains? declarations "export type T_union-one = ({\n\tx: string;\n} | {\n\ty: number;\n}) & {\n\t__kind?: \"T_union-one\";\n};"))
      (is (contains? declarations "export type T_intersection-one = {\n\tx: string;\n} & {\n\ty: number;\n} & {\n\t__kind?: \"T_intersection-one\";\n};"))))
  (testing "object intersections retain tags and strip opaque constraint refs"
    (let [schemas {::constraint :any
                   ::query-one [:and [:map {:closed true} [:x :string]] [:ref ::constraint]]
                   ::query-two [:and [:map {:closed true} [:x :string]] [:ref ::constraint]]}
          declarations (:declarations
                        (refs/type-aliases
                         (set (keys schemas))
                         {:resolve-schema schemas
                          :compile-options {:registry schemas}
                          :type-name test-type-name
                          :ref-name test-type-name}))]
      (is (some #(= "export type T_query-one = {\n\tx: string;\n} & {\n\t__kind?: \"T_query-one\";\n};" %) declarations))
      (is (some #(= "export type T_query-two = {\n\tx: string;\n} & {\n\t__kind?: \"T_query-two\";\n};" %) declarations)))))

(deftest ^:parallel phantom-discriminant-tuples-test
  (testing "structurally identical tuples retain phantom distinctions"
    (let [schemas {::tuple-one [:tuple [:maybe :string] :int]
                   ::tuple-two [:tuple [:maybe :string] :int]}
          declarations (:declarations
                        (refs/type-aliases
                         (set (keys schemas))
                         {:resolve-schema schemas
                          :compile-options {:registry schemas}
                          :type-name test-type-name
                          :ref-name test-type-name}))]
      (is (some #(str/includes? % "export type T_tuple-one = [string | null, number] & {\n\t__kind?: \"T_tuple-one\";") declarations))
      (is (some #(str/includes? % "export type T_tuple-two = [string | null, number] & {\n\t__kind?: \"T_tuple-two\";") declarations)))))

(deftest ^:parallel phantom-discriminant-exclusions-test
  (testing "nullable and mixed aliases retain their non-object alternatives"
    (let [colliding-schemas
          {::nullable-one [:maybe [:map {:closed true} [:x :string]]]
           ::nullable-two [:maybe [:map {:closed true} [:x :string]]]
           ::mixed-one [:or [:map {:closed true} [:x :string]] :string]
           ::mixed-two [:or [:map {:closed true} [:x :string]] :string]}
          declarations (set (:declarations
                             (refs/type-aliases
                              (set (keys colliding-schemas))
                              {:resolve-schema colliding-schemas
                               :compile-options {:registry colliding-schemas}
                               :type-name test-type-name
                               :ref-name test-type-name})))]
      (is (contains? declarations "export type T_nullable-one = {\n\tx: string;\n} | null;"))
      (is (contains? declarations "export type T_nullable-two = {\n\tx: string;\n} | null;"))
      (is (contains? declarations "export type T_mixed-one = {\n\tx: string;\n} | string;"))
      (is (contains? declarations "export type T_mixed-two = {\n\tx: string;\n} | string;"))))
  (testing "real __kind fields are not intersected with phantom tags"
    (let [schemas {::one [:map {:closed true} ["__kind" [:= "runtime"]] [:x :string]]
                   ::two [:map {:closed true} ["__kind" [:= "runtime"]] [:x :string]]}
          declarations (:declarations
                        (refs/type-aliases
                         (set (keys schemas))
                         {:resolve-schema schemas
                          :compile-options {:registry schemas}
                          :type-name test-type-name
                          :ref-name test-type-name}))]
      (is (every? #(not (re-find #"__kind\?:" %)) declarations))))
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

(deftest ^:parallel readonly-ref-rewrite-test
  (let [schemas {::one [:any {:ts/object-of [:map {:closed true} ["display-name" :string]]
                              :ts/key-transform :camelCase}]}
        declarations (:declarations
                      (refs/type-aliases
                       #{::one}
                       {:resolve-schema schemas
                        :compile-options {:registry schemas :readonly? true}
                        :type-name test-type-name
                        :ref-name test-type-name}))]
    (is (= ["export type T_one = Readonly<Camel<{\n\t\"display-name\": string;\n}>>;"]
           declarations))))

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

(deftest ^:parallel inline-registry-dependency-closure-test
  (let [compiled
        (schema/schema->result
         [:schema
          {:registry {::root [:map {:closed true} [:child [:ref ::child]]]
                      ::child [:map {:closed true} [:value :string]]}}
          ::root])]
    (is (= #{::root ::child} (set (keys (:local-definitions compiled)))))
    (let [{:keys [declarations diagnostics]}
          (refs/type-aliases
           (:registry-refs compiled)
           {:resolve-schema (:local-definitions compiled)
            :compile-options {:registry (:local-definitions compiled)}
            :type-name test-type-name
            :ref-name test-type-name})]
      (is (= 2 (count declarations)))
      (is (empty? diagnostics)))))

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
  (testing "indirect recursion through a guarded target is retained"
    (let [recursive-schemas {::ref [:or :string [:ref ::clause]]
                             ::clause [:tuple [:= :op] [:ref ::ref]]}
          {:keys [declarations diagnostics]}
          (refs/type-aliases
           #{::ref}
           {:resolve-schema recursive-schemas
            :compile-options {:registry recursive-schemas}
            :type-name test-type-name
            :ref-name test-type-name})]
      (is (= ["export type T_clause = [\"op\", T_ref];"
              "export type T_ref = string | T_clause;"]
             declarations))
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
             (set (map (juxt :schema :ref) diagnostics))))))
  (testing "type-alias generics (Record and Partial<Record>) do not guard direct recursion, while Set does"
    (let [recursive-schemas {::open-dict [:map-of :string [:ref ::open-dict]]
                             ::finite-dict [:map-of [:enum :a :b] [:ref ::finite-dict]]
                             ::nested-set [:set [:ref ::nested-set]]}
          {:keys [declarations diagnostics]}
          (refs/type-aliases
           #{::open-dict ::finite-dict ::nested-set}
           {:resolve-schema recursive-schemas
            :compile-options {:registry recursive-schemas}
            :type-name test-type-name
            :ref-name test-type-name})]
      (is (= ["export type T_finite-dict = Partial<Record<\"a\" | \"b\", unknown>>;"
              "export type T_nested-set = Set<T_nested-set>;"
              "export type T_open-dict = Record<string, unknown>;"]
             declarations))
      (is (= #{[::open-dict ::open-dict]
               [::finite-dict ::finite-dict]}
             (set (map (juxt :schema :ref) diagnostics)))))))
