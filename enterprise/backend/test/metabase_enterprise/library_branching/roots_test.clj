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
   "sNiPpEtFiLtErScOlL001" (item :collection nil {:namespace "snippets"})
   "fInAnCeCoLlEcTiOnId00" (item :collection nil {:namespace "transforms"})
   "bAsEfIlTeRsNiPpEt0001" (item :snippet nil {:content "x"})
   "nEsTeDsNiPpEt00000001" (item :snippet "sNiPpEtFiLtErScOlL001" {:content "x"})
   "rOoTlEvElMeTrIc000001" (item :metric nil {:display "scalar"})
   "pErSoNaLcOlLeCtIoN001" (item :collection nil {})
   "lIbRaRyDaTaAtRoOt0001" (item :collection nil {:type "library-data"})
   ["Sample Database" "PUBLIC" "ORDERS"] (item :published-table nil {})
   "gLoSsArYtErM000000001" (item :glossary-term nil {:definition "x"})
   "pLaCeDgLoSsArYtErM001" (item :glossary-term "LiBrArYcOlLeCtIoN0001" {:definition "x"})})

(deftest ^:parallel root-ids-test
  (testing "the root-level items that are fixed roots by their content"
    (is (= #{"LiBrArYcOlLeCtIoN0001" "sNiPpEtFiLtErScOlL001" "fInAnCeCoLlEcTiOnId00" "bAsEfIlTeRsNiPpEt0001"
             "gLoSsArYtErM000000001"}
           (roots/root-ids snapshot))))
  (testing "an item that is not at the root level is never a root, whatever its content"
    (is (not (contains? (roots/root-ids snapshot) "nEsTeDsNiPpEt00000001")))
    (is (not (contains? (roots/root-ids snapshot) "pLaCeDgLoSsArYtErM001"))))
  (testing "the roots are an argument: without the snippets namespace, snippet roots are not roots"
    (is (= #{"LiBrArYcOlLeCtIoN0001" "fInAnCeCoLlEcTiOnId00" "gLoSsArYtErM000000001"}
           (roots/root-ids (update roots/roots :namespaces disj :snippets) snapshot))))
  (testing "without the glossary kind, glossary terms are not roots"
    (is (= #{"LiBrArYcOlLeCtIoN0001" "sNiPpEtFiLtErScOlL001" "fInAnCeCoLlEcTiOnId00" "bAsEfIlTeRsNiPpEt0001"}
           (roots/root-ids (update roots/roots :unplaced-kinds disj :glossary-term) snapshot)))))

(deftest ^:parallel scope-uses-these-roots-test
  (is (identical? roots/roots scope/roots)))

(def ^:private mutations
  [{:name   :type-ignored
    :doc    "A collection of the type library is not a root, so CI refuses every repository."
    :target `roots/root-ids
    :edits  [[:replace '(contains? collection-types (:type attrs)) false]]}
   {:name   :namespace-ignored
    :doc    "A collection of a root namespace is not a root."
    :target `roots/root-ids
    :edits  [[:replace '(contains? namespaces (some-> (:namespace attrs) keyword)) false]]}
   {:name   :unplaced-kinds-ignored
    :doc    "A glossary term at the root level is not a root, so CI refuses every repository with a glossary term."
    :target `roots/root-ids
    :edits  [[:replace '(contains? unplaced-kinds kind) false]]}
   {:name   :place-ignored
    :doc    "An item with a container counts as a root."
    :target `roots/root-ids
    :edits  [[:replace '(nil? place) true]]}])

(deftest roots-mutations-test
  (mut/check mutations {:tests [#'root-ids-test]}))
