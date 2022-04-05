(ns metabase-enterprise.advanced-permissions.common-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.advanced-permissions.models.permissions :as ee-perms]
            [metabase.models :refer [Permissions]]
            [metabase.models.database :as database]
            [metabase.models.permissions-group :as group]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.test :as mt]
            [metabase.util :as u]))

(deftest current-user-test
  (testing "GET /api/user/current returns additional fields if advanced-permissions is enabled"
    (premium-features-test/with-premium-features #{:advanced-permissions}
      (letfn [(user-permissions [user]
                (-> (mt/user-http-request user :get 200 "user/current")
                    :permissions))]
        (testing "admins should have full general permisions"
          (is (= {:can_access_setting      true
                  :can_access_subscription true
                  :can_access_monitoring   true
                  :can_access_data_model   true}
                 (user-permissions :crowberto))))

        (testing "non-admin users should only have subscriptions enabled by default"
          (is (= {:can_access_setting      false
                  :can_access_subscription true
                  :can_access_monitoring   false
                  :can_access_data_model   false}
                 (user-permissions :rasta))))

        (testing "can_access_data_model is true if a user has any data model perms"
          (mt/with-model-cleanup [Permissions]
            (let [[id-1 id-2 id-3 id-4] (map u/the-id (database/tables (mt/db)))]
              (ee-perms/update-db-data-model-permissions! (u/the-id (group/all-users))
                                                          (mt/id)
                                                          {:schemas {"PUBLIC" {id-1 :all
                                                                               id-2 :none
                                                                               id-3 :none
                                                                               id-4 :none}}}))
            (is (partial= {:can_access_data_model   true}
                          (user-permissions :rasta)))))))))

(deftest fetch-database-metadata-exclude-uneditable-test
  (testing "GET /api/database/:id/metadata?exclude_uneditable=true"
    (premium-features-test/with-premium-features #{:advanced-permissions}
      (mt/with-model-cleanup [Permissions]
        (let [[id-1 id-2 id-3 id-4] (map u/the-id (database/tables (mt/db)))]
          (ee-perms/update-db-data-model-permissions! (u/the-id (group/all-users))
                                                      (mt/id)
                                                      {:schemas {"PUBLIC" {id-1 :all
                                                                           id-2 :none
                                                                           id-3 :none
                                                                           id-4 :none}}})
          (let [tables (->> (mt/user-http-request :rasta
                                                  :get
                                                  200
                                                  (format "database/%d/metadata?exclude_uneditable=true" (mt/id)))
                            :tables)]
            (is (= [id-1] (map :id tables)))))))))
