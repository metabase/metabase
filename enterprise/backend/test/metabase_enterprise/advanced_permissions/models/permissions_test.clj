(ns metabase-enterprise.advanced-permissions.models.permissions-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.advanced-permissions.models.permissions :as ee-perms]
            [metabase.models :refer [Permissions PermissionsGroup]]
            [metabase.models.database :as database]
            [metabase.models.permissions :as perms]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.test :as mt]
            [metabase.util :as u]))

(defn- download-perms-by-group-id [group-id]
  (get-in (perms/data-perms-graph) [:groups group-id (mt/id) :download]))

(deftest update-db-download-permissions-test
  (premium-features-test/with-premium-features #{:advanced-permissions}
    (mt/with-model-cleanup [Permissions]
      (mt/with-temp PermissionsGroup [{group-id :id}]
        (testing "Download perms for all schemas can be set and revoked"
          (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas :full})
          (is (= {:schemas :full, :native :full}
                 (download-perms-by-group-id group-id)))

          (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas :limited})
          (is (= {:schemas :limited, :native :limited}
                 (download-perms-by-group-id group-id)))

          (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas :none})
          (is (nil? (download-perms-by-group-id group-id))))

        (testing "Download perms for individual schemas can be set and revoked"
          (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" :full}})
          (is (= {:schemas {"PUBLIC" :full} :native :full}
                 (download-perms-by-group-id group-id)))

          (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" :limited}})
          (is (= {:schemas {"PUBLIC" :limited} :native :limited}
                 (download-perms-by-group-id group-id)))

          (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" :none}})
          (is (nil? (download-perms-by-group-id group-id))))

        (testing "Download perms for individual tables can be set and revoked"
          (let [[id-1 id-2 id-3 id-4] (map u/the-id (database/tables (mt/db)))]
            (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" {id-1 :full
                                                                                            id-2 :full
                                                                                            id-3 :full
                                                                                            id-4 :full}}})
            (is (= {:schemas {"PUBLIC" {id-1 :full id-2 :full id-3 :full id-4 :full}}
                    :native :full}
                   (download-perms-by-group-id group-id)))

            (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" {id-1 :limited}}})
            (is (= {:schemas {"PUBLIC" {id-1 :limited id-2 :full id-3 :full id-4 :full}}
                    :native :limited}
                   (download-perms-by-group-id group-id)))

            (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" {id-2 :none}}})
            (is (= {:schemas {"PUBLIC" {id-1 :limited id-3 :full id-4 :full}}}
                   (download-perms-by-group-id group-id)))

            (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" {id-1 :none
                                                                                            id-3 :none
                                                                                            id-4 :none}}})
            (is (nil? (download-perms-by-group-id group-id)))

            (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" {id-1 :full
                                                                                            id-2 :full
                                                                                            id-3 :limited
                                                                                            id-4 :limited}}})
            (is (= {:schemas {"PUBLIC" {id-1 :full id-2 :full id-3 :limited id-4 :limited}}
                    :native :limited}
                   (download-perms-by-group-id group-id)))

            (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" {id-3 :full
                                                                                            id-4 :full}}})
            (is (= {:schemas {"PUBLIC" {id-1 :full id-2 :full id-3 :full id-4 :full}}
                    :native :full}
                   (download-perms-by-group-id group-id)))))))))
