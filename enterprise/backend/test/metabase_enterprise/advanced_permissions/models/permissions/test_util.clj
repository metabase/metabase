(ns metabase-enterprise.advanced-permissions.models.permissions.test-util
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [Permissions PermissionsGroup Table]]
   [metabase.models.permissions :as perms]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.public-settings.premium-features-test
    :as premium-features-test]
   [metabase.test :as mt]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.db :as db]))

(defn- all-schemas-path
  [perm-type perm-value db-id]
  (perms/base->feature-perms-path perm-type perm-value (perms/all-schemas-path db-id)))

(defn- grant-permissions-for-all-schemas!
  [perm-type perm-value group-id db-id]
  (perms/grant-permissions! group-id (all-schemas-path perm-type perm-value db-id)))

(defn- revoke-download-permissions!
  {:arglists '([group-id db-id]
               [group-id db-id schema-name]
               [group-id db-id schema-name table-or-id])}
  [group-id & path-components]
  (apply (partial perms/revoke-download-perms! group-id) path-components))

(defn- update-table-download-permissions!
  [group-id db-id schema table-id new-table-perms]
  (condp = new-table-perms
    :full
    (do
      (revoke-download-permissions! group-id db-id schema table-id)
      (perms/grant-permissions! group-id (perms/feature-perms-path :download :full db-id schema table-id)))

    :limited
    (do
      (revoke-download-permissions! group-id db-id schema table-id)
      (perms/grant-permissions! group-id (perms/feature-perms-path :download :limited db-id schema table-id)))

    :none
    (revoke-download-permissions! group-id db-id schema table-id)))

(defn- update-schema-download-permissions!
  [group-id db-id schema new-schema-perms]
  (condp = new-schema-perms
    :full
    (do
      (revoke-download-permissions! group-id db-id schema)
      (perms/grant-permissions! group-id (perms/feature-perms-path :download :full db-id schema)))

    :limited
    (do
      (revoke-download-permissions! group-id db-id schema)
      (perms/grant-permissions! group-id (perms/feature-perms-path :download :limited db-id schema)))

    :none
    (revoke-download-permissions! group-id db-id schema)

    (when (map? new-schema-perms)
      (doseq [[table-id table-perms] new-schema-perms]
        (update-table-download-permissions! group-id db-id schema table-id table-perms)))))

(s/defn update-db-download-permissions!
  "Update the download permissions graph for a database.

  This mostly works similar to [[metabase.models.permission/update-db-data-access-permissions!]], with a few key
  differences:
    - Permissions have three levels: full, limited, and none.
    - Native query download permissions are fully inferred from the non-native download permissions. For more details,
      see the docstring for [[metabase.models.permissions/update-native-download-permissions!]]."
  [group-id :- su/IntGreaterThanZero db-id :- su/IntGreaterThanZero new-download-perms :- perms/DownloadPermissionsGraph]
  (when-not (premium-features/enable-advanced-permissions?)
    (throw (perms/ee-permissions-exception :download)))
  (when-let [schemas (:schemas new-download-perms)]
    (condp = schemas
      :full
      (do
        (revoke-download-permissions! group-id db-id)
        (grant-permissions-for-all-schemas! :download :full group-id db-id))

      :limited
      (do
        (revoke-download-permissions! group-id db-id)
        (grant-permissions-for-all-schemas! :download :limited group-id db-id))

      :none
      (revoke-download-permissions! group-id db-id)

      (when (map? schemas)
        (doseq [[schema new-schema-perms] (seq schemas)]
          (update-schema-download-permissions! group-id db-id schema new-schema-perms))))
    ;; We need to call update-native-download-permissions! whenever any download permissions are changed, but after we've
    ;; updated non-native donwload permissions. This is because native download permissions are fully computed from the
    ;; non-native download permissions.
    (perms/update-native-download-permissions! group-id db-id)))

(defn- download-perms-by-group-id [group-id]
  (get-in (perms/data-perms-graph) [:groups group-id (mt/id) :download]))

(deftest update-db-download-permissions-test
  (mt/with-model-cleanup [Permissions]
    (mt/with-temp PermissionsGroup [{group-id :id}]
      (premium-features-test/with-premium-features #{:advanced-permissions}
        (testing "Download perms for all schemas can be set and revoked"
          (update-db-download-permissions! group-id (mt/id) {:schemas :full})
          (is (= {:schemas :full, :native :full}
                 (download-perms-by-group-id group-id)))

          (update-db-download-permissions! group-id (mt/id) {:schemas :limited})
          (is (= {:schemas :limited, :native :limited}
                 (download-perms-by-group-id group-id)))

          (update-db-download-permissions! group-id (mt/id) {:schemas :none})
          (is (nil? (download-perms-by-group-id group-id))))

        (testing "Download perms for individual schemas can be set and revoked"
          (update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" :full}})
          (is (= {:schemas {"PUBLIC" :full} :native :full}
                 (download-perms-by-group-id group-id)))

          (update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" :limited}})
          (is (= {:schemas {"PUBLIC" :limited} :native :limited}
                 (download-perms-by-group-id group-id)))

          (update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" :none}})
          (is (nil? (download-perms-by-group-id group-id))))

        (testing "Download perms for individual tables can be set and revoked"
          (let [[id-1 id-2 id-3 id-4] (sort (db/select-ids Table :db_id (mt/db)))]
            (update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" {id-1 :full
                                                                                            id-2 :full
                                                                                            id-3 :full
                                                                                            id-4 :full}}})
            (is (= {:schemas {"PUBLIC" {id-1 :full id-2 :full id-3 :full id-4 :full}}
                    :native :full}
                   (download-perms-by-group-id group-id)))

            (update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" {id-1 :limited}}})
            (is (= {:schemas {"PUBLIC" {id-1 :limited id-2 :full id-3 :full id-4 :full}}
                    :native :limited}
                   (download-perms-by-group-id group-id)))

            (update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" {id-2 :none}}})
            (is (= {:schemas {"PUBLIC" {id-1 :limited id-3 :full id-4 :full}}}
                   (download-perms-by-group-id group-id)))

            (update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" {id-1 :none
                                                                                            id-3 :none
                                                                                            id-4 :none}}})
            (is (nil? (download-perms-by-group-id group-id)))

            (update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" {id-1 :full
                                                                                            id-2 :full
                                                                                            id-3 :limited
                                                                                            id-4 :limited}}})
            (is (= {:schemas {"PUBLIC" {id-1 :full id-2 :full id-3 :limited id-4 :limited}}
                    :native :limited}
                   (download-perms-by-group-id group-id)))

            (update-db-download-permissions! group-id (mt/id) {:schemas {"PUBLIC" {id-3 :full
                                                                                            id-4 :full}}})
            (is (= {:schemas {"PUBLIC" {id-1 :full id-2 :full id-3 :full id-4 :full}}
                    :native :full}
                   (download-perms-by-group-id group-id)))))

        (testing "Download perms are revoked when block perms are set"
          (update-db-download-permissions! group-id (mt/id) {:schemas :full :native :full})
          (is (= {:schemas :full :native :full} (download-perms-by-group-id group-id)))
          (@#'perms/update-db-data-access-permissions! group-id (mt/id) {:schemas :block})
          (is (= nil (download-perms-by-group-id group-id)))))

      (premium-features-test/with-premium-features #{}
        (testing "Download permissions cannot be modified without the :advanced-permissions feature flag"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"The download permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
               (update-db-download-permissions! group-id (mt/id) {:schemas :full}))))))))
