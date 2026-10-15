(ns metabase-enterprise.library-branching.format.kinds.collection-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.collection :as collection]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private root-id "rOoTcOlLeCtIoNrOoT001")

(defn- root [& {:as attrs}]
  {:kind :collection :name "Some name" :place nil :refs #{} :attrs (or attrs {})})

(defn- path [item] (get (layout/layout kinds/codecs {root-id item}) root-id))

(deftest home-test
  (testing "the Library collection is the directory library/ itself"
    (is (= "library/_collection.yaml" (path (root :type "library")))))
  (testing "a root-level collection of a namespace is in the directory of its area"
    (are [ns expected] (= expected (path (root :namespace ns)))
      "snippets"     "snippets/some_name/_collection.yaml"
      "transforms"   "transforms/some_name/_collection.yaml"
      "data-actions" "actions/some_name/_collection.yaml"
      "data-apps"    "apps/some_name/_collection.yaml"))
  (testing "another root-level collection is in library/"
    (is (= "library/some_name/_collection.yaml" (path (root))))
    (is (= "library/some_name/_collection.yaml" (path (root :type "library-data"))))))

(deftest attributes-test
  (testing "the content attributes of a collection"
    (is (= #{:description :type :namespace :authority_level} (set (keys (:attrs collection/spec))))))
  (testing "a namespace outside the synced areas is not content"
    (is (not (mr/validate (codec/schema collection/codec) (root :namespace "analytics"))))
    (is (mr/validate (codec/schema collection/codec) (root :namespace "snippets"))))
  (testing "a collection has no references"
    (is (= #{} (kinds/refs :collection root-id {:description "x" :type "library"})))))

(def ^:private mutations
  [{:name   :library-root-not-library
    :doc    "The Library collection is not the directory library/, so its files are one level too deep."
    :target `collection/home
    :edits  [[:replace '(= "library" type) false]]}
   {:name   :namespace-ignored
    :doc    "A root-level snippet collection is in library/."
    :target `collection/home
    :edits  [[:replace '(get areas namespace) nil]]}])

(deftest collection-mutations-test
  (mut/check mutations {:tests [#'home-test]}))
