(ns metabase-enterprise.data-apps.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.test :as mt]))

(deftest delete-assignments-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/DataApp other-app {:name "owls" :display_name "Owls" :bundle_path "owls.js"}
                 :model/PermissionsGroup finches {}
                 :model/PermissionsGroup robins {}
                 :model/PermissionsGroup sparrows {}]
    (data-apps.db/insert-assignments! (:id app) [(:id finches) (:id robins) (:id sparrows)])
    (data-apps.db/insert-assignments! (:id other-app) [(:id finches)])
    (let [assignments (fn []
                        (into #{}
                              (map (juxt :data_app_id :permission_group_id))
                              (data-apps.db/app-assignments [(:id app) (:id other-app)])))
          before (assignments)]
      (testing "empty input preserves all assignments"
        (is (= 0 (data-apps.db/delete-assignments! (:id app) [])))
        (is (= before (assignments))))
      (testing "bulk deletion retains other groups and other apps' assignments"
        (data-apps.db/delete-assignments! (:id app) [(:id finches) (:id robins)])
        (is (= #{[(:id app) (:id sparrows)]
                 [(:id other-app) (:id finches)]}
               (assignments)))))))
