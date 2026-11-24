(ns metabase.search.impl-statements-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.search.impl :as search.impl]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- statements
  "The number of app DB statements `thunk` runs."
  [thunk]
  (t2/with-call-count [call-count]
    (thunk)
    (call-count)))

(defn- nested-dataset-results!
  "Search results for `n` models, each in its own Collection nested in a parent Collection that `rasta` reads."
  [n]
  (let [parent  (first (t2/insert-returning-instances! :model/Collection {:name "parent" :location "/"}))
        _       (perms/grant-collection-read-permissions! (perms/all-users-group) (:id parent))
        parents (t2/insert-returning-instances! :model/Collection
                                                (repeat n {:name "child" :location (collection/children-location parent)}))]
    (mapv (fn [coll]
            {:model               "dataset"
             :collection_id       (:id coll)
             :collection_location (:location coll)})
          parents)))

(deftest dataset-ancestors-statements-do-not-grow-with-results-test
  (mt/with-model-cleanup [:model/Collection]
    (doseq [user [:crowberto :rasta]]
      (mt/with-test-user user
        (let [small-results (nested-dataset-results! 4)
              large-results (nested-dataset-results! 10)
              _             (doall (search.impl/add-dataset-collection-hierarchy small-results))
              small         (statements #(doall (search.impl/add-dataset-collection-hierarchy small-results)))
              large         (statements #(doall (search.impl/add-dataset-collection-hierarchy large-results)))]
          (is (= small large) (str "as " user)))))))
