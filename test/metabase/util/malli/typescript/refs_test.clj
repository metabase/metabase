(ns metabase.util.malli.typescript.refs-test
  (:require
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
