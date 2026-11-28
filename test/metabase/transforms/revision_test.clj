(ns metabase.transforms.revision-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest transform-serialize-instance-test
  (testing "snapshot of :model/Transform excludes the correct columns"
    (let [transform {:id 1
                     :entity_id "wyQv6yHnXS-IqPrYm1osQ"
                     :created_at "2025-09-30T00:00:00Z"
                     :updated_at "2025-09-30T00:00:00Z"
                     :name "Test Transform"
                     :description "A test transform"
                     :source {:type :query
                              :query (lib/query (mt/metadata-provider)
                                                (lib.metadata/table (mt/metadata-provider) (mt/id :venues)))}
                     :target {:type "table"
                              :name "transformed_table"
                              :schema "public"
                              :database 1}}
          exp-serialized (dissoc transform :id :entity_id :created_at :updated_at)]
      (is (= (revision/snapshot :model/Transform transform)
             exp-serialized)))))

(deftest transform-revisions-readable-with-older-snapshot-test
  (testing "a snapshot recorded with a hydrated :owner and no :id is still authorized (#86577)"
    (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Transform {transform-id :id}
                     {:name   "History Transform"
                      :source {:type  :query
                               :query (lib/native-query (lib-be/application-database-metadata-provider db-id)
                                                        "SELECT 1")}}]
        (mt/with-current-user (mt/user->id :crowberto)
          (let [transform (t2/select-one :model/Transform :id transform-id)
                current   (revision/snapshot :model/Transform transform)
                older     (assoc current :owner {:id          1
                                                 :email       "a@b.test"
                                                 :first_name  "A"
                                                 :last_name   "B"
                                                 :common_name "A B"})]
            (is (nil? (:id older)))
            (is (= [true true]
                   (revision/revisions-readable? :model/Transform [current older])))))))))
