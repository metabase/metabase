(ns metabase-enterprise.advanced-permissions.models.permissions-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.advanced-permissions.models.permissions :as ee-perms]
            [metabase.models :refer [Permissions PermissionsGroup]]
            [metabase.models.permissions :as perms]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.test :as mt]))


(defn- test-download-perms [group-id]
  (get-in (perms/data-perms-graph) [:groups group-id (mt/id) :download]))

(deftest update-db-download-permissions-test
  (premium-features-test/with-premium-features #{:advanced-permissions}
    (mt/with-model-cleanup [Permissions]
      (mt/with-temp PermissionsGroup [{group-id :id}]
        (testing "Download perms for all schemas can be set and revoked"
          (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas :full})
          (is (= {:schemas :full, :native :full}
                 (test-download-perms group-id)))

          (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas :limited})
          (is (= {:schemas :limited, :native :limited}
                 (test-download-perms group-id)))

          (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas :none})
          (is (nil? (test-download-perms group-id))))

        (testing "Download perms for individual schemas can be set and revoked"
          (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" :full}})
          (is (= {:schemas {"PUBLIC" :full} :native :full}
                 (test-download-perms group-id)))

          (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" :limited}})
          (is (= {:schemas {"PUBLIC" :limited} :native :limited}
                 (test-download-perms group-id)))

          (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" :none}})
          (is (nil? (test-download-perms group-id))))))))
