(ns metabase-enterprise.advanced-permissions.models.permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-permissions.models.permissions :as ee-perms]
   [metabase.driver :as driver]
   [metabase.models :refer [Database Permissions PermissionsGroup]]
   [metabase.models.database :as database]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Download permissions                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- download-perms-by-group-id [group-id]
  (get-in (perms/data-perms-graph) [:groups group-id (mt/id) :download]))

(deftest update-db-download-permissions-test
  (mt/with-model-cleanup [Permissions]
    (t2.with-temp/with-temp [PermissionsGroup {group-id :id}]
      (premium-features-test/with-premium-features #{:advanced-permissions}
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
                   (download-perms-by-group-id group-id)))))

        (testing "Download perms are revoked when block perms are set"
          (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas :full :native :full})
          (is (= {:schemas :full :native :full} (download-perms-by-group-id group-id)))
          (@#'perms/update-db-data-access-permissions! group-id (mt/id) {:schemas :block})
          (is (= nil (download-perms-by-group-id group-id)))))

      (premium-features-test/with-premium-features #{}
        (testing "Download permissions cannot be modified without the :advanced-permissions feature flag"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"The download permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
               (ee-perms/update-db-download-permissions! group-id (mt/id) {:schemas :full}))))))))



;; The following tests are for the specific edge case of updating native download perms during sync if new tables are
;; discovered, or if tables are removed, since both events can potentially change the expected native download perms
;; for the database. This behavior should apply to both EE and OSS, but the test lives here for the convenience of
;; being able to call [[ee-perms/update-db-download-permissions!]].

(driver/register! ::download-permissions, :abstract? true)

(defmethod driver/describe-database ::download-permissions [& _]
  {:tables #{{:name "Table 1" :schema "PUBLIC"} {:name "Table 2" :schema "PUBLIC"}}})

(defmethod driver/describe-table ::download-permissions [& _]
  {:fields []})

(defn- replace-tables
  [table-names]
  (remove-method driver/describe-database ::download-permissions)
  (let [tables (set (for [table-name table-names] {:name table-name :schema "PUBLIC"}))]
    (defmethod driver/describe-database ::download-permissions [& _]
      {:tables tables})))

(deftest native-download-perms-sync-test
  (mt/with-temp* [Database [{db-id :id :as database} {:engine ::download-permissions}]]
    (replace-tables ["Table 1" "Table 2"])
    (letfn [(all-users-native-download-perms []
              (get-in (perms/data-perms-graph) [:groups (u/the-id (perms-group/all-users)) db-id :download :native]))]
      (testing "If a group has full download perms for a DB, native download perms are unchanged when a new table is
               found during sync"
        (is (= :full (all-users-native-download-perms)))
        (replace-tables ["Table 1" "Table 2" "Table 3"])
        (sync-tables/sync-tables-and-database! database)
        (is (= :full (all-users-native-download-perms))))

      (testing "If a group has granular download perms for a DB, native download perms are removed when a new table is
              found during sync, since the new table has no download perms"
        (let [table-ids (t2/select-pks-set 'Table :db_id db-id)
              limited-downloads-id  (apply min table-ids)
              graph {:schemas {"PUBLIC"
                               (-> (into {} (for [id table-ids] [id :full]))
                                   (assoc limited-downloads-id :limited))}}]
          (premium-features-test/with-premium-features #{:advanced-permissions}
            (@#'ee-perms/update-db-download-permissions! (u/the-id (perms-group/all-users)) db-id graph))
          (is (= :limited (all-users-native-download-perms)))
          (replace-tables ["Table 1" "Table 2" "Table 3" "Table 4"])
          (sync-tables/sync-tables-and-database! database)
          (is (= nil (all-users-native-download-perms)))))

      (testing "If a table is retired during sync and it was the only table in the DB without download perms, native
               download perms are restored"
        (replace-tables ["Table 1" "Table 2" "Table 3"])
        (sync-tables/sync-tables-and-database! database)
        (is (= :limited (all-users-native-download-perms)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Data model permissions                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- data-model-perms-by-group-id [group-id]
  (get-in (perms/data-perms-graph) [:groups group-id (mt/id) :data-model]))

(deftest update-db-data-model-permissions-test
  (mt/with-model-cleanup [Permissions]
    (t2.with-temp/with-temp [PermissionsGroup {group-id :id}]
      (premium-features-test/with-premium-features #{:advanced-permissions}
        (testing "Data model perms for an entire DB can be set and revoked"
          (ee-perms/update-db-data-model-permissions! group-id (mt/id) {:schemas :all})
          (is (= {:schemas :all}
                 (data-model-perms-by-group-id group-id)))

          (ee-perms/update-db-data-model-permissions! group-id (mt/id) {:schemas :none})
          (is (nil? (data-model-perms-by-group-id group-id)))

          (testing "Data model perms for individual schemas can be set and revoked"
            (ee-perms/update-db-data-model-permissions! group-id (mt/id) {:schemas {"PUBLIC" :all}})
            (is (= {:schemas {"PUBLIC" :all}}
                   (data-model-perms-by-group-id group-id)))

            (ee-perms/update-db-data-model-permissions! group-id (mt/id) {:schemas {"PUBLIC" :none}})
            (is (nil? (data-model-perms-by-group-id group-id))))

          (testing "Data model perms for individual tables can be set and revoked"
            (let [[id-1 id-2 id-3 id-4] (map u/the-id (database/tables (mt/db)))]
              (ee-perms/update-db-data-model-permissions! group-id (mt/id) {:schemas
                                                                            {"PUBLIC" {id-1 :all
                                                                                       id-2 :all
                                                                                       id-3 :all
                                                                                       id-4 :all}}})
              (is (= {:schemas {"PUBLIC" {id-1 :all id-2 :all id-3 :all id-4 :all}}}
                     (data-model-perms-by-group-id group-id)))

              (ee-perms/update-db-data-model-permissions! group-id (mt/id) {:schemas
                                                                            {"PUBLIC" {id-2 :none}}})
              (is (= {:schemas {"PUBLIC" {id-1 :all id-3 :all id-4 :all}}}
                     (data-model-perms-by-group-id group-id)))

              (ee-perms/update-db-data-model-permissions! group-id (mt/id) {:schemas
                                                                            {"PUBLIC" {id-1 :none
                                                                                       id-3 :none
                                                                                       id-4 :none}}})
              (is (nil? (data-model-perms-by-group-id group-id)))))))

      (premium-features-test/with-premium-features #{}
        (testing "Data model permissions cannot be modified without the :advanced-permissions feature flag"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"The data model permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
               (ee-perms/update-db-data-model-permissions! group-id (mt/id) {:schemas :all}))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          DB details permissions                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- details-perms-by-group-id [group-id]
  (get-in (perms/data-perms-graph) [:groups group-id (mt/id) :details]))

(deftest update-db-details-permissions-test
  (mt/with-model-cleanup [Permissions]
    (t2.with-temp/with-temp [PermissionsGroup {group-id :id}]
      (premium-features-test/with-premium-features #{:advanced-permissions}
            (testing "Detail perms for a DB can be set and revoked"
              (ee-perms/update-db-details-permissions! group-id (mt/id) :yes)
              (is (= :yes (details-perms-by-group-id group-id)))

              (ee-perms/update-db-details-permissions! group-id (mt/id) :no)
              (is (nil? (details-perms-by-group-id group-id)))))

      (premium-features-test/with-premium-features #{}
        (testing "Detail permissions cannot be modified without the :advanced-permissions feature flag"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"The details permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
               (ee-perms/update-db-details-permissions! group-id (mt/id) :yes))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          DB execute permissions                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- execute-perms-by-group-id [group-id]
  (get-in (perms/execution-perms-graph) [:groups group-id (mt/id)]))

(deftest update-db-execute-permissions-test
  (mt/with-model-cleanup [Permissions]
    (t2.with-temp/with-temp [PermissionsGroup {group-id :id}]
      (premium-features-test/with-premium-features #{:advanced-permissions}
        (testing "Execute perms for a DB can be set and revoked"
          (ee-perms/update-db-execute-permissions! group-id (mt/id) :all)
          (is (= :all (execute-perms-by-group-id group-id)))

          (ee-perms/update-db-execute-permissions! group-id (mt/id) :none)
          (is (nil? (execute-perms-by-group-id group-id)))))

      (premium-features-test/with-premium-features #{}
        (testing "Execute permissions cannot be modified without the :advanced-permissions feature flag"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"The execute permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
               (ee-perms/update-db-execute-permissions! group-id (mt/id) :all))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    Graph                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest get-graph-should-unescape-slashes-test
  (testing "If a schema name contains slash, getting graph should unescape it"
    (doseq [[perm-type perm-value] [[:data-model :all] [:download :full]]]
      (testing (pr-str perm-type)
        (testing "slash"
          (t2.with-temp/with-temp [PermissionsGroup group]
            (#'ee-perms/grant-permissions! perm-type perm-value (:id group) (mt/id) "schema/with_slash")
            (is (= "schema/with_slash"
                   (-> (get-in (perms/data-perms-graph) [:groups (u/the-id group) (mt/id) perm-type :schemas])
                       keys
                       first)))))

        (testing "backslash"
          (t2.with-temp/with-temp [PermissionsGroup group]
            (#'ee-perms/grant-permissions! perm-type perm-value (:id group) (mt/id) "schema\\with_backslash")
            (is (= "schema\\with_backslash"
                   (-> (get-in (perms/data-perms-graph) [:groups (u/the-id group) (mt/id) perm-type :schemas])
                       keys
                       first)))))))))
