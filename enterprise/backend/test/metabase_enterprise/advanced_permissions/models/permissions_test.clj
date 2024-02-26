(ns metabase-enterprise.advanced-permissions.models.permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-permissions.models.permissions
    :as ee-perms]
   [metabase.models :refer [Permissions PermissionsGroup]]
   [metabase.models.data-permissions.graph :as data-perms.graph]
   [metabase.models.database :as database]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.tools.with-temp :as t2.with-temp]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Download permissions                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- download-perms-by-group-id [group-id db-id]
  (get-in (data-perms.graph/api-graph) [:groups group-id db-id :download]))

(deftest update-db-download-permissions-test
  (mt/with-model-cleanup [Permissions]
    (mt/with-temp [:model/Database         {db-id :id}    {}
                   :model/Table            {table-id-1 :id} {:db_id db-id :schema "PUBLIC"}
                   :model/Table            {table-id-2 :id} {:db_id db-id :schema "PUBLIC"}
                   :model/PermissionsGroup {group-id :id} {}]
      (mt/with-premium-features #{:advanced-permissions}
        (testing "Download perms for all schemas can be set and revoked"
          (#'data-perms.graph/update-db-level-download-permissions! group-id db-id {:schemas :full})
          (is (= {:schemas :full}
                 (download-perms-by-group-id group-id db-id)))

          (#'data-perms.graph/update-db-level-download-permissions! group-id db-id {:schemas :limited})
          (is (= {:schemas :limited}
                 (download-perms-by-group-id group-id db-id)))

          (#'data-perms.graph/update-db-level-download-permissions! group-id db-id {:schemas :none})
          (is (nil? (download-perms-by-group-id group-id db-id))))

        (testing "Download perms for individual schemas can be set and revoked"
          (#'data-perms.graph/update-db-level-download-permissions! group-id db-id {:schemas {"PUBLIC" :full}})
          (is (= {:schemas {"PUBLIC" :full}}
                 (download-perms-by-group-id group-id db-id)))

          (#'data-perms.graph/update-db-level-download-permissions! group-id db-id {:schemas {"PUBLIC" :limited}})
          (is (= {:schemas {"PUBLIC" :limited}}
                 (download-perms-by-group-id group-id db-id)))

          (#'data-perms.graph/update-db-level-download-permissions! group-id db-id {:schemas {"PUBLIC" :none}})
          (is (nil? (download-perms-by-group-id group-id db-id))))

        (testing "Download perms for individual tables can be set and revoked"
          (#'data-perms.graph/update-db-level-download-permissions! group-id db-id {:schemas {"PUBLIC" {table-id-1 :full
                                                                                                        table-id-2 :full}}})
          (is (= {:schemas {"PUBLIC" :full}}
                 (download-perms-by-group-id group-id db-id)))

          (#'data-perms.graph/update-db-level-download-permissions! group-id db-id {:schemas {"PUBLIC" {table-id-1 :limited
                                                                                                        table-id-2 :full}}})
          (is (= {:schemas {"PUBLIC" {table-id-1 :limited
                                      table-id-2 :full}}}
                 (download-perms-by-group-id group-id db-id)))

          (#'data-perms.graph/update-db-level-download-permissions! group-id db-id {:schemas {"PUBLIC" {table-id-2 :none}}})
          (is (= {:schemas {"PUBLIC" {table-id-1 :limited}}}
                 (download-perms-by-group-id group-id db-id)))

          (#'data-perms.graph/update-db-level-download-permissions! group-id db-id {:schemas {"PUBLIC" {table-id-1 :none
                                                                                                        table-id-2 :none}}})
          (is (nil? (download-perms-by-group-id group-id db-id)))

          (#'data-perms.graph/update-db-level-download-permissions! group-id db-id {:schemas {"PUBLIC" {table-id-1 :full
                                                                                                        table-id-2 :limited}}})
          (is (= {:schemas {"PUBLIC" {table-id-1 :full
                                      table-id-2 :limited}}}
                 (download-perms-by-group-id group-id db-id)))

          (#'data-perms.graph/update-db-level-download-permissions! group-id db-id {:schemas {"PUBLIC" {table-id-2 :full}}})
          (is (= {:schemas :full}
                 (download-perms-by-group-id group-id db-id))))

       (testing "Download perms are revoked when block perms are set"
         (#'data-perms.graph/update-db-level-download-permissions! group-id db-id {:schemas :full :native :full})
         (is (= {:schemas :full} (download-perms-by-group-id group-id db-id)))
         (#'data-perms.graph/update-db-level-data-access-permissions! group-id db-id {:schemas :block})
         (is (= nil (download-perms-by-group-id group-id db-id)))))

     (mt/with-premium-features #{}
       (testing "Download permissions cannot be modified without the :advanced-permissions feature flag"
         (is (thrown-with-msg?
              clojure.lang.ExceptionInfo
              #"The download permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
              (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas :full}))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Data model permissions                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- data-model-perms-by-group-id [group-id]
  (get-in (data-perms.graph/api-graph) [:groups group-id (mt/id) :data-model]))

(deftest update-db-data-model-permissions-test
  (mt/with-model-cleanup [Permissions]
    (t2.with-temp/with-temp [PermissionsGroup {group-id :id}]
      (mt/with-premium-features #{:advanced-permissions}
        (testing "Data model perms for an entire DB can be set and revoked"
          (#'data-perms.graph/update-db-level-metadata-permissions! group-id (mt/id) {:schemas :all})
          (is (= {:schemas :all}
                 (data-model-perms-by-group-id group-id)))

          (#'data-perms.graph/update-db-level-metadata-permissions! group-id (mt/id) {:schemas :none})
          (is (nil? (data-model-perms-by-group-id group-id)))

          (testing "Data model perms for individual schemas can be set and revoked"
            (#'data-perms.graph/update-db-level-metadata-permissions! group-id (mt/id) {:schemas {"PUBLIC" :all}})
            (is (= {:schemas {"PUBLIC" :all}}
                   (data-model-perms-by-group-id group-id)))

            (#'data-perms.graph/update-db-level-metadata-permissions! group-id (mt/id) {:schemas {"PUBLIC" :none}})
            (is (nil? (data-model-perms-by-group-id group-id))))

          (testing "Data model perms for individual tables can be set and revoked"
            (let [[id-1 id-2 id-3 id-4] (map u/the-id (database/tables (mt/db)))]
              (#'data-perms.graph/update-db-level-metadata-permissions! group-id (mt/id) {:schemas
                                                                                          {"PUBLIC" {id-1 :all
                                                                                                     id-2 :all
                                                                                                     id-3 :all
                                                                                                     id-4 :all}}})
              (is (= {:schemas {"PUBLIC" {id-1 :all id-2 :all id-3 :all id-4 :all}}}
                     (data-model-perms-by-group-id group-id)))

              (#'data-perms.graph/update-db-level-metadata-permissions! group-id (mt/id) {:schemas
                                                                                          {"PUBLIC" {id-2 :none}}})
              (is (= {:schemas {"PUBLIC" {id-1 :all id-3 :all id-4 :all}}}
                     (data-model-perms-by-group-id group-id)))

              (#'data-perms.graph/update-db-level-metadata-permissions! group-id (mt/id) {:schemas
                                                                                          {"PUBLIC" {id-1 :none
                                                                                                     id-3 :none
                                                                                                     id-4 :none}}})
              (is (nil? (data-model-perms-by-group-id group-id)))))))

      (mt/with-premium-features #{}
        (testing "Data model permissions cannot be modified without the :advanced-permissions feature flag"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"The data model permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
               (ee-perms/update-db-data-model-permissions! group-id (mt/id) {:schemas :all}))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          DB details permissions                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- details-perms-by-group-id [group-id]
  (get-in (data-perms.graph/api-graph) [:groups group-id (mt/id) :details]))

(deftest update-db-details-permissions-test
  (mt/with-model-cleanup [Permissions]
    (t2.with-temp/with-temp [PermissionsGroup {group-id :id}]
      (mt/with-premium-features #{:advanced-permissions}
        (testing "Detail perms for a DB can be set and revoked"
          (#'data-perms.graph/update-details-perms! group-id (mt/id) :yes)
          (is (= :yes (details-perms-by-group-id group-id)))

          (#'data-perms.graph/update-details-perms! group-id (mt/id) :no)
          (is (nil? (details-perms-by-group-id group-id)))))

      (mt/with-premium-features #{}
        (testing "Detail permissions cannot be modified without the :advanced-permissions feature flag"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"The details permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
               (ee-perms/update-db-details-permissions! group-id (mt/id) :yes))))))))
