(ns metabase-enterprise.metabot-v3.tools.transforms-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.transforms :as metabot-v3.tools.transforms]
   [metabase.lib-be.metadata.jvm :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]))

(deftest get-transforms-test
  (testing "get-transforms correctly returns transform when the user has access to the source database"
    (mt/with-premium-features #{:metabot-v3 :transforms}
      (mt/with-temp [:model/Database {db-id :id} {}]
        (let [mp (lib-be/application-database-metadata-provider db-id)]
          (mt/with-temp [:model/Transform transform
                         {:name   "Test Transform"
                          :source {:type  "query"
                                   :query (lib/native-query mp "SELECT 1")}}]
            (testing "returns transform when user can query the source database"
              (mt/with-test-user :crowberto
                (let [result   (:structured_output (metabot-v3.tools.transforms/get-transforms {}))
                      returned (first (filter #(= (:id transform) (:id %)) result))]
                  (is (some? returned)))))
            (testing "filters out transform when user cannot query the source database"
              (mt/with-data-analyst-role! (mt/user->id :rasta)
                (mt/with-db-perm-for-group! (perms-group/all-users) db-id :perms/create-queries :no
                  (mt/with-test-user :rasta
                    (let [result   (:structured_output (metabot-v3.tools.transforms/get-transforms {}))
                          returned (first (filter #(= (:id transform) (:id %)) result))]
                      (is (nil? returned))))))))))))

  (deftest get-transform-details-test
    (testing "get-transform-details returns transform when user can query the source database"
      (mt/with-premium-features #{:metabot-v3 :transforms}
        (mt/with-temp [:model/Transform transform
                       {:name   "Test Transform"
                        :source {:type  "query"
                                 :query (lib/native-query (mt/metadata-provider) "SELECT 1")}}]
          (mt/with-test-user :crowberto
            (let [result (:structured_output (metabot-v3.tools.transforms/get-transform-details
                                              {:transform-id (:id transform)}))]
              (is (= (:id transform) (:id result)))))))))

  (deftest get-transform-details-blocked-test
    (testing "get-transform-details throws when user cannot query the source database"
      (mt/with-premium-features #{:metabot-v3 :transforms}
        (mt/with-temp [:model/Database {db-id :id} {}]
          (let [mp (lib-be/application-database-metadata-provider db-id)]
            (mt/with-temp [:model/Transform transform
                           {:name   "Blocked Transform"
                            :source {:type  "query"
                                     :query (lib/native-query mp "SELECT 1")}}]
              (mt/with-data-analyst-role! (mt/user->id :rasta)
                (mt/with-db-perm-for-group! (perms-group/all-users) db-id :perms/create-queries :no
                  (mt/with-test-user :rasta
                    (is (thrown-with-msg?
                         clojure.lang.ExceptionInfo
                         #"You don't have permissions to do that"
                         (metabot-v3.tools.transforms/get-transform-details
                          {:transform-id (:id transform)})))))))))))))
