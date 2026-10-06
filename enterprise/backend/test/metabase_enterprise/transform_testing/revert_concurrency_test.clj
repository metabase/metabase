(ns metabase-enterprise.transform-testing.revert-concurrency-test
  "A revert and a concurrent edit of the same TransformTest: neither deadlocks, and neither loses its change."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transform-testing.models]
   [metabase.revisions.events]
   [metabase.revisions.revert-concurrency-test :as revert-concurrency-test]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- with-transform-test
  "Calls `f` with the id of a committed TransformTest named \"X0\" and then renamed to \"X1\". Its hooks record the
  revisions."
  [f]
  (mt/with-current-user (mt/user->id :crowberto)
    (let [transform-id (t2/insert-returning-pk! :model/Transform (mt/with-temp-defaults :model/Transform))]
      (try
        (let [id (t2/insert-returning-pk! :model/TransformTest {:transform_id transform-id :name "X0"
                                                                :inputs [] :expectations []
                                                                :creator_id (mt/user->id :crowberto)})]
          (try
            (t2/update! :model/TransformTest id {:name "X1"})
            (f id)
            (finally (t2/delete! :model/TransformTest :id id))))
        (finally (t2/delete! :model/Transform :id transform-id))))))

(deftest transform-test-edit-holds-row-during-revert-test
  (revert-concurrency-test/edit-holds-row-during-revert! :model/TransformTest with-transform-test))

(deftest transform-test-edit-during-revert-test
  (revert-concurrency-test/edit-during-revert! :model/TransformTest with-transform-test))
