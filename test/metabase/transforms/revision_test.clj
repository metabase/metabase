(ns metabase.transforms.revision-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.revisions.impl.transform]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(comment metabase.revisions.impl.transform/keep-me)

(deftest transform-serialize-instance-test
  (testing "serialize-instance for :model/Transform excludes the correct columns"
    (let [transform {:id 1
                     :entity_id "wyQv6yHnXS-IqPrYm1osQ"
                     :created_at "2025-09-30T00:00:00Z"
                     :updated_at "2025-09-30T00:00:00Z"
                     :name "Test Transform"
                     :description "A test transform"
                     :owner {:id 1
                             :email "a@b.test"
                             :first_name "A"
                             :last_name "B"
                             :common_name "A B"}
                     :source {:type :query
                              :query (lib/query (mt/metadata-provider)
                                                (lib.metadata/table (mt/metadata-provider) (mt/id :venues)))}
                     :target {:type :table
                              :name "transformed_table"
                              :schema "public"
                              :database 1}}
          ;; `:owner` is hydrated onto the instance that `create-transform!` records. It is not a column.
          exp-serialized (dissoc transform :id :entity_id :created_at :updated_at :owner)]
      (is (= (revision/serialize-instance :model/Transform nil transform)
             exp-serialized)))))

(deftest transform-revision-readable-accepts-stored-snapshot-test
  (testing "a stored snapshot has no :id and may still carry the hydrated :owner (#86577)"
    (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Transform {transform-id :id}
                     {:name   "History Transform"
                      :source {:type  :query
                               :query (lib/native-query (lib-be/application-database-metadata-provider db-id)
                                                        "SELECT 1")}}]
        (mt/with-current-user (mt/user->id :crowberto)
          (let [transform (t2/select-one :model/Transform :id transform-id)
                ;; Revisions saved from a hydrated instance keep `:owner` and drop `:id`.
                snapshot  (-> (revision/serialize-instance :model/Transform transform-id transform)
                              (assoc :owner {:id           1
                                             :email        "a@b.test"
                                             :first_name   "A"
                                             :last_name    "B"
                                             :common_name  "A B"}))]
            (is (nil? (:id snapshot)))
            (is (map? (:owner snapshot)))
            (is (true? (revision/revision-readable? :model/Transform snapshot)))))))))
