(ns metabase-enterprise.library-branching.roots-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.roots :as roots]
   [metabase-enterprise.library-branching.scope :as scope]))

(set! *warn-on-reflection* true)

(defn- item
  [kind place attrs]
  {:kind kind :name "Robin" :place place :refs #{} :attrs attrs})

(def ^:private snapshot
  {"LiBrArYcOlLeCtIoN0001" (item :collection nil {:type "library"})
   "dAtAcOlLeCtIoNiD00000" (item :collection "LiBrArYcOlLeCtIoN0001" {:type "library-data"})
   "sNiPpEtFiLtErScOlL001" (item :collection "snippetssnippetssnipp" {:namespace "snippets"})
   "fInAnCeCoLlEcTiOnId00" (item :collection "transformstransformst" {:namespace "transforms"})
   "bAsEfIlTeRsNiPpEt0001" (item :snippet "snippetssnippetssnipp" {:content "x"})
   "nEsTeDsNiPpEt00000001" (item :snippet "sNiPpEtFiLtErScOlL001" {:content "x"})
   "rOoTlEvElMeTrIc000001" (item :metric nil {:display "scalar"})
   "pErSoNaLcOlLeCtIoN001" (item :collection nil {})
   "lIbRaRyDaTaAtRoOt0001" (item :collection nil {:type "library-data"})
   "nAmEsPaCeAtRoOt000001" (item :collection nil {:namespace "snippets"})
   "rOoTlEvElSnIpPeT00001" (item :snippet nil {:content "x"})
   ["Sample Database" "PUBLIC" "ORDERS"] (item :published-table nil {})
   "gLoSsArYtErM000000001" (item :glossary-term "glossaryglossarygloss" {:definition "x"})
   "uNpLaCeDgLoSsArY00001" (item :glossary-term nil {:definition "x"})
   "lIbRaRyTyPeMeTrIc0001" (item :metric nil {:type "library"})
   "nEsTeDlIbRaRy00000001" (item :collection "LiBrArYcOlLeCtIoN0001" {:type "library"})})

(deftest ^:parallel root-ids-test
  (testing "the root-level items that are fixed roots by their content: the collections of a root type"
    (is (= #{"LiBrArYcOlLeCtIoN0001"}
           (roots/root-ids snapshot))))
  (testing "an item at the root level of an area has the area root as its place, so at the root level it is no root"
    (is (not (contains? (roots/root-ids snapshot) "nAmEsPaCeAtRoOt000001")))
    (is (not (contains? (roots/root-ids snapshot) "rOoTlEvElSnIpPeT00001")))
    (is (not (contains? (roots/root-ids snapshot) "uNpLaCeDgLoSsArY00001"))))
  (testing "an item that is not at the root level is never a root, whatever its content"
    (is (not (contains? (roots/root-ids snapshot) "nEsTeDlIbRaRy00000001"))))
  (testing "an item of another kind is no root, whatever its attributes"
    (is (not (contains? (roots/root-ids snapshot) "lIbRaRyTyPeMeTrIc0001"))))
  (testing "the roots are an argument: without the library type, the Library is not a root"
    (is (= #{} (roots/root-ids (update roots/roots :collection-types disj "library") snapshot)))))

(deftest ^:parallel scope-uses-these-roots-test
  (is (identical? roots/roots scope/roots)))

(def ^:private mutations
  [{:name   :type-ignored
    :doc    "A collection of the type library is not a root, so CI refuses every repository."
    :target `roots/root-ids
    :edits  [[:replace '(contains? collection-types (:type attrs)) false]]}
   {:name   :any-collection
    :doc    "Every collection at the root level is a root, also one of a namespace that has an area root."
    :target `roots/root-ids
    :edits  [[:replace '(contains? collection-types (:type attrs)) true]]}
   {:name   :any-kind
    :doc    "An item of any kind with the type library is a root."
    :target `roots/root-ids
    :edits  [[:replace '(= :collection kind) true]]}
   {:name   :place-ignored
    :doc    "An item with a container counts as a root."
    :target `roots/root-ids
    :edits  [[:replace '(nil? place) true]]}])

(deftest roots-mutations-test
  (mut/check mutations {:tests [#'root-ids-test]}))
