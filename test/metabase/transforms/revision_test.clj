(ns metabase.transforms.revision-test
  (:require
   [clojure.test :refer :all]
   [metabase.revisions.models.revision :as revision]))

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
