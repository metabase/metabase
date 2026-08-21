(ns metabase-enterprise.transforms.revision-test
  (:require
   [clojure.test :refer :all]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest transform-serialize-instance-test
  (testing "serialize-instance for :model/Transform excludes the correct columns"
    (let [transform {:id 1
                     :entity_id "wyQv6yHnXS-IqPrYm1osQ"
                     :created_at "2025-09-30T00:00:00Z"
                     :updated_at "2025-09-30T00:00:00Z"
                     :name "Test Transform"
                     :description "A test transform"
                     :source {:type :query
                              :query {:database 1
                                      :type :query
                                      :query {:source-table 2}}}
                     :target {:type :table
                              :name "transformed_table"
                              :schema "public"
                              :database 1}}
          exp-serialized (dissoc transform :id :entity_id :created_at :updated_at)]
      (is (= (revision/serialize-instance :model/Transform nil transform)
             exp-serialized)))))

(defn- push-transform-revision! [transform-id is-creation? user]
  (revision/push-revision!
   {:object       (t2/select-one :model/Transform :id transform-id)
    :entity       :model/Transform
    :id           transform-id
    :user-id      (mt/user->id user)
    :is-creation? is-creation?}))

(deftest transform-revision-readable-guards-each-snapshot-test
  (testing "each Transform revision snapshot is authorized on its own terms: on this release a Transform is
            readable only by superusers, so no snapshot - and no prior :source body - is served to a non-admin"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Database {x-db-id :id} {}
                     :model/Database {y-db-id :id} {}
                     :model/Transform {transform-id :id}
                     {:name   "Repointed Transform"
                      :source {:type  "query"
                               :query {:database x-db-id
                                       :type     "native"
                                       :native   {:query "SELECT 2 --comment"}}}}]
        (push-transform-revision! transform-id true :crowberto)
        (t2/update! :model/Transform transform-id
                    {:source {:type  "query"
                              :query {:database y-db-id
                                      :type     "native"
                                      :native   {:query "SELECT 1"}}}})
        (push-transform-revision! transform-id false :crowberto)
        (let [snapshots (t2/select-fn-vec :object :model/Revision :model "Transform" :model_id transform-id)]
          (is (= 2 (count snapshots)))
          (testing "an admin may read every snapshot"
            (mt/with-current-user (mt/user->id :crowberto)
              (is (every? #(revision/revision-readable? :model/Transform %) snapshots))))
          (testing "a non-admin may read none"
            (mt/with-current-user (mt/user->id :rasta)
              (is (not-any? #(revision/revision-readable? :model/Transform %) snapshots)))))))))
