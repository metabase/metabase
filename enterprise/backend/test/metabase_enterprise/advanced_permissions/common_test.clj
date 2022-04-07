(ns metabase-enterprise.advanced-permissions.common-test
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [metabase-enterprise.advanced-permissions.models.permissions :as ee-perms]
            [metabase.models :refer [Field Permissions Table]]
            [metabase.models.database :as database]
            [metabase.models.permissions :as perms]
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
        (testing "admins should have full advanced permisions"
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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Data model permission enforcement                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- do-with-all-user-data-perms
  [graph f]
  (let [all-users-group-id  (u/the-id (group/all-users))]
    (premium-features-test/with-premium-features #{:advanced-permissions}
      (mt/with-model-cleanup [Permissions]
        (@#'perms/update-group-permissions! all-users-group-id graph)
        (f)))))

(defmacro ^:private with-all-users-data-perms
  "Runs `f` with perms for the All Users group temporarily set to the values in `graph`"
  [graph & body]
  `(do-with-all-user-data-perms ~graph (fn [] ~@body)))

(deftest fetch-database-metadata-exclude-uneditable-test
  (testing "GET /api/database/:id/metadata?exclude_uneditable=true"
    (let [[id-1 id-2 id-3 id-4] (map u/the-id (database/tables (mt/db)))]
      (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {id-1 :all
                                                                            id-2 :none
                                                                            id-3 :none
                                                                            id-4 :none}}}}}
        (let [tables (->> (mt/user-http-request :rasta
                                                :get
                                                200
                                                (format "database/%d/metadata?exclude_uneditable=true" (mt/id)))
                          :tables)]
          (is (= [id-1] (map :id tables))))))))

(deftest update-field-test
  (mt/with-temp Field [{field-id :id, table-id :table_id} {:name "Field Test"}]
    (let [{table-id :id, schema :schema, db-id :db_id} (Table table-id)]
      (testing "PUT /api/field/:id"
        (let [endpoint (format "field/%d" field-id)]
          (testing "a non-admin cannot update field metadata if they have no data model permissions for the DB"
            (with-all-users-data-perms {db-id {:data-model {:schemas :none}}}
              (mt/user-http-request :rasta :put 403 endpoint {:name "Field Test 2"})))

          (testing "a non-admin cannot update field metadata if they only have data model permissions for other schemas"
            (with-all-users-data-perms {db-id {:data-model {:schemas {schema             :none
                                                                      "different schema" :all}}}}

              (mt/user-http-request :rasta :put 403 endpoint {:name "Field Test 2"})))

          (testing "a non-admin cannot update field metadata if they only have data model permissions for other tables"
            (with-all-users-data-perms {db-id {:data-model {:schemas {schema {table-id       :none
                                                                              (inc table-id) :all}}}}}
              (mt/user-http-request :rasta :put 403 endpoint {:name "Field Test 2"})))

          (testing "a non-admin can update field metadata if they have data model perms for the DB"
            (with-all-users-data-perms {db-id {:data-model {:schemas :all}}}
              (mt/user-http-request :rasta :put 200 endpoint {:name "Field Test 2"})))

          (testing "a non-admin can update field metadata if they have data model perms for the schema"
            (with-all-users-data-perms {db-id {:data-model {:schemas {schema :all}}}}
              (mt/user-http-request :rasta :put 200 endpoint {:name "Field Test 3"})))

          (testing "a non-admin can update field metadata if they have data model perms for the table"
            (with-all-users-data-perms {db-id {:data-model {:schemas {schema {table-id :all}}}}}
              (mt/user-http-request :rasta :put 200 endpoint {:name "Field Test 3"})))))

      (testing "POST /api/field/:id/rescan_values"
        (testing "A non-admin can trigger a rescan of field values if they have data model perms for the table"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :none}}}}}
            (mt/user-http-request :rasta :post 403 (format "field/%d/rescan_values" field-id)))
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :all}}}}}
            (mt/user-http-request :rasta :post 200 (format "field/%d/rescan_values" field-id)))))

      (testing "POST /api/field/:id/discard_values"
        (testing "A non-admin can discard field values if they have data model perms for the table"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :none}}}}}
            (mt/user-http-request :rasta :post 403 (format "field/%d/discard_values" field-id)))

          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :all}}}}}
            (mt/user-http-request :rasta :post 200 (format "field/%d/discard_values" field-id))))))))

(deftest update-table-test
  (mt/with-temp Table [{table-id :id} {:db_id (mt/id) :schema "PUBLIC"}]
    (testing "PUT /api/table/:id"
      (let [endpoint (format "table/%d" table-id)]
        (testing "a non-admin cannot update table metadata if they have no data model permissions for the DB"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas :none}}}
            (mt/user-http-request :rasta :put 403 endpoint {:name "Table Test 2"})))

        (testing "a non-admin cannot update table metadata if they only have data model permissions for other schemas"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC"           :none
                                                                      "different schema" :all}}}}
            (mt/user-http-request :rasta :put 403 endpoint {:name "Table Test 2"})))

        (testing "a non-admin cannot update table metadata if they only have data model permissions for other tables"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id       :none
                                                                                (inc table-id) :all}}}}}
            (mt/user-http-request :rasta :put 403 endpoint {:name "Table Test 2"})))

        (testing "a non-admin can update table metadata if they have data model perms for the DB"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas :all}}}
            (mt/user-http-request :rasta :put 200 endpoint {:name "Table Test 2"})))

        (testing "a non-admin can update table metadata if they have data model perms for the schema"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" :all}}}}
            (mt/user-http-request :rasta :put 200 endpoint {:name "Table Test 3"})))

        (testing "a non-admin can update table metadata if they have data model perms for the table"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :all}}}}}
            (mt/user-http-request :rasta :put 200 endpoint {:name "Table Test 3"})))))

    (testing "POST /api/table/:id/rescan_values"
      (testing "A non-admin can trigger a rescan of field values if they have data model perms for the table"
        (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :none}}}}}
          (mt/user-http-request :rasta :post 403 (format "table/%d/rescan_values" table-id)))
        (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :all}}}}}
          (mt/user-http-request :rasta :post 200 (format "table/%d/rescan_values" table-id)))))

    (testing "POST /api/table/:id/discard_values"
      (testing "A non-admin can discard field values if they have data model perms for the table"
        (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :none}}}}}
          (mt/user-http-request :rasta :post 403 (format "table/%d/discard_values" table-id)))

        (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :all}}}}}
          (mt/user-http-request :rasta :post 200 (format "table/%d/discard_values" table-id)))))

    (testing "POST /api/table/:id/fields/order"
      (testing "A non-admin can set a custom field ordering if they have data model perms for the table"
        (mt/with-temp* [Field [{field-1-id :id} {:table_id table-id}]
                        Field [{field-2-id :id} {:table_id table-id}]]
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :none}}}}}
            (mt/user-http-request :rasta :put 403 (format "table/%d/fields/order" table-id)
                                  {:request-options {:body (json/encode [field-2-id field-1-id])}}))

          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :all}}}}}
            (mt/user-http-request :rasta :put 200 (format "table/%d/fields/order" table-id)
                                  {:request-options {:body (json/encode [field-2-id field-1-id])}})))))))
