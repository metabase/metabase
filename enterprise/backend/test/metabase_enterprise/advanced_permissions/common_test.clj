(ns metabase-enterprise.advanced-permissions.common-test
  (:require [cheshire.core :as json]
            [clojure.core.memoize :as memoize]
            [clojure.test :refer :all]
            [metabase.api.database :as api.database]
            [metabase.models :refer [Database Field FieldValues Permissions Table]]
            [metabase.models.database :as database]
            [metabase.models.field :as field]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.sync.concurrent :as sync.concurrent]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db]))

(defn- do-with-all-user-data-perms
  [graph f]
  (let [all-users-group-id  (u/the-id (perms-group/all-users))
        current-graph       (get-in (perms/data-perms-graph) [:groups all-users-group-id])]
    (premium-features-test/with-premium-features #{:advanced-permissions}
      (memoize/memo-clear! @#'field/cached-perms-object-set)
      (try
        (mt/with-model-cleanup [Permissions]
          (u/ignore-exceptions
           (@#'perms/update-group-permissions! all-users-group-id graph))
          (f))
        (finally
          (u/ignore-exceptions
           (@#'perms/update-group-permissions! all-users-group-id current-graph)))))))

(defmacro ^:private with-all-users-data-perms
  "Runs `body` with perms for the All Users group temporarily set to the values in `graph`. Also enables the advanced
  permissions feature flag, and clears the (5 second TTL) cache used for Field permissions, for convenience."
  [graph & body]
  `(do-with-all-user-data-perms ~graph (fn [] ~@body)))

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
                  :can_access_data_model   true
                  :is_group_manager        false
                  :can_access_db_details   true}
                 (user-permissions :crowberto))))

        (testing "non-admin users should only have subscriptions enabled by default"
          (is (= {:can_access_setting      false
                  :can_access_subscription true
                  :can_access_monitoring   false
                  :can_access_data_model   false
                  :is_group_manager        false
                  :can_access_db_details   false}
                 (user-permissions :rasta))))

        (testing "can_access_data_model is true if a user has any data model perms"
          (let [[id-1 id-2 id-3 id-4] (map u/the-id (database/tables (mt/db)))]
            (with-all-users-data-perms {(mt/id) {:data       {:schemas :all :native :write}
                                                 :data-model {:schemas {"PUBLIC" {id-1 :all
                                                                                  id-2 :none
                                                                                  id-3 :none
                                                                                  id-4 :none}}}}}
              (is (partial= {:can_access_data_model true}
                            (user-permissions :rasta))))))

        (testing "can_access_db_details is true if a user has any details perms"
          (with-all-users-data-perms {(mt/id) {:details :yes}}
            (is (partial= {:can_access_db_details true}
                          (user-permissions :rasta)))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Data model permission enforcement                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest fetch-databases-test
  (testing "GET /api/database?include_editable_data_model=true"
    (letfn [(get-test-db
              ([] (get-test-db "database?include_editable_data_model=true"))
              ([url] (->> (mt/user-http-request :rasta :get 200 url)
                          :data
                          (filter (fn [db] (= (mt/id) (:id db))))
                          first)))]
      (testing "Sanity check: a non-admin can fetch a DB when they have full data access and data model perms"
        (with-all-users-data-perms {(mt/id) {:data       {:schemas :all :native :write}
                                             :data-model {:schemas :all}}}
          (is (partial= {:id (mt/id)} (get-test-db)))))

      (testing "A non-admin cannot fetch a DB for which they do not have data model perms if
               include_editable_data_model=true"
        (with-all-users-data-perms {(mt/id) {:data       {:schemas :all :native :write}
                                             :data-model {:schemas :none}}}
            (is (= nil (get-test-db)))))

      (let [[id-1 id-2 id-3 id-4] (map u/the-id (database/tables (mt/db)))]
        (with-all-users-data-perms {(mt/id) {:data       {:schemas :all :native :write}
                                             :data-model {:schemas {"PUBLIC" {id-1 :all
                                                                              id-2 :none
                                                                              id-3 :none
                                                                              id-4 :none}}}}}
          (testing "If a non-admin has data model perms for a single table in a DB, the DB is returned when listing
                   all DBs"
            (is (partial= {:id (mt/id)} (get-test-db))))

          (testing "if include=tables, only tables with data model perms are included"
            (is (= [id-1] (->> (get-test-db "database?include_editable_data_model=true&include=tables")
                               :tables
                               (map :id))))))))))

(deftest fetch-database-test
  (testing "GET /api/database/:id?include_editable_data_model=true"
    (testing "A non-admin without data model perms for a DB cannot fetch the DB when include_editable_data_model=true"
      (with-all-users-data-perms {(mt/id) {:data       {:native :write :schemas :all}
                                           :data-model {:schemas :none}}}
        (mt/user-http-request :rasta :get 403 (format "database/%d?include_editable_data_model=true" (mt/id)))))

    (testing "A non-admin with only data model perms for a DB can fetch the DB when include_editable_data_model=true"
      (with-all-users-data-perms {(mt/id) {:data       {:native :none :schemas :none}
                                           :data-model {:schemas :all}}}
        (mt/user-http-request :rasta :get 200 (format "database/%d?include_editable_data_model=true" (mt/id)))))))

(deftest fetch-database-metadata-test
  (testing "GET /api/database/:id/metadata?include_editable_data_model=true"
    (let [[id-1 id-2 id-3 id-4] (map u/the-id (database/tables (mt/db)))]
      (with-all-users-data-perms {(mt/id) {:data       {:schemas :all :native :write}
                                           :data-model {:schemas {"PUBLIC" {id-1 :all
                                                                            id-2 :none
                                                                            id-3 :none
                                                                            id-4 :none}}}}}
        (let [tables (->> (mt/user-http-request :rasta
                                                :get
                                                200
                                                (format "database/%d/metadata?include_editable_data_model=true" (mt/id)))
                          :tables)]
          (is (= [id-1] (map :id tables))))))


    (testing "A user with data model perms can still fetch a DB name and tables if they have block perms for a DB"
      (let [[id-1 id-2 id-3 id-4] (map u/the-id (database/tables (mt/db)))]
        (with-all-users-data-perms {(mt/id) {:data       {:schemas :block :native :none}
                                             :data-model {:schemas {"PUBLIC" {id-1 :all
                                                                              id-2 :none
                                                                              id-3 :none
                                                                              id-4 :none}}}}}
          (let [result (mt/user-http-request :rasta
                                             :get
                                             200
                                             (format "database/%d/metadata?include_editable_data_model=true" (mt/id)))]
            (is (= {:id (mt/id) :name (:name (mt/db))} (dissoc result :tables)))
            (is (= [id-1] (map :id (:tables result))))))))))

(deftest fetch-id-fields-test
  (testing "GET /api/database/:id/idfields?include_editable_data_model=true"
    (testing "A non-admin without data model perms for a DB cannot fetch id fields when include_editable_data_model=true"
      (with-all-users-data-perms {(mt/id) {:data       {:native :write :schemas :all}
                                           :data-model {:schemas :none}}}
        (mt/user-http-request :rasta :get 403 (format "database/%d/idfields?include_editable_data_model=true" (mt/id)))))

    (testing "A non-admin with only data model perms for a DB can fetch id fields when include_editable_data_model=true"
      (with-all-users-data-perms {(mt/id) {:data       {:native :none :schemas :none}
                                           :data-model {:schemas :all}}}
        (mt/user-http-request :rasta :get 200 (format "database/%d/idfields?include_editable_data_model=true" (mt/id)))))))

(deftest update-field-test
  (mt/with-temp Field [{field-id :id, table-id :table_id} {:name "Field Test"}]
    (let [{table-id :id, schema :schema, db-id :db_id} (db/select-one Table :id table-id)]
      (testing "PUT /api/field/:id"
        (let [endpoint (format "field/%d" field-id)]
          (testing "a non-admin cannot update field metadata if the advanced-permissions feature flag is not present"
            (with-all-users-data-perms {db-id {:data-model {:schemas {schema {table-id :all}}}}}
              (premium-features-test/with-premium-features #{}
                (mt/user-http-request :rasta :put 403 endpoint {:name "Field Test 4"}))))

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
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {schema {table-id :none}}}}}
            (mt/user-http-request :rasta :post 403 (format "field/%d/rescan_values" field-id)))

          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {schema {table-id :all}}}}}
            (mt/user-http-request :rasta :post 200 (format "field/%d/rescan_values" field-id))))

        (testing "A non-admin with no data access can trigger a re-scan of field values if they have data model perms"
          (db/delete! FieldValues :field_id (mt/id :venues :price))
          (is (= nil (db/select-one-field :values FieldValues, :field_id (mt/id :venues :price))))
          (with-all-users-data-perms {(mt/id) {:data       {:schemas :block :native :none}
                                               :data-model {:schemas {"PUBLIC" {(mt/id :venues) :all}}}}}
            (mt/user-http-request :rasta :post 200 (format "field/%d/rescan_values" (mt/id :venues :price))))
          (is (= [1 2 3 4] (db/select-one-field :values FieldValues, :field_id (mt/id :venues :price))))))

      (testing "POST /api/field/:id/discard_values"
        (testing "A non-admin can discard field values if they have data model perms for the table"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {schema {table-id :none}}}}}
            (mt/user-http-request :rasta :post 403 (format "field/%d/discard_values" field-id)))

          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {schema {table-id :all}}}}}
            (mt/user-http-request :rasta :post 200 (format "field/%d/discard_values" field-id))))

        (testing "A non-admin with no data access can discard field values if they have data model perms"
          (is (= [1 2 3 4] (db/select-one-field :values FieldValues, :field_id (mt/id :venues :price))))
          (with-all-users-data-perms {(mt/id) {:data       {:schemas :block :native :none}
                                               :data-model {:schemas {"PUBLIC" {(mt/id :venues) :all}}}}}
            (mt/user-http-request :rasta :post 200 (format "field/%d/discard_values" (mt/id :venues :price))))
          (is (= nil (db/select-one-field :values FieldValues, :field_id (mt/id :venues :price)))))))))

(deftest update-table-test
  (mt/with-temp Table [{table-id :id} {:db_id (mt/id) :schema "PUBLIC"}]
    (testing "PUT /api/table/:id"
      (let [endpoint (format "table/%d" table-id)]
        (testing "a non-admin cannot update table metadata if the advanced-permissions feature flag is not present"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas :all}}}
            (premium-features-test/with-premium-features #{}
              (mt/user-http-request :rasta :put 403 endpoint {:name "Table Test 2"}))))

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
          (mt/user-http-request :rasta :post 200 (format "table/%d/rescan_values" table-id))))

      (testing "A non-admin with no data access can trigger a re-scan of field values if they have data model perms"
        (db/delete! FieldValues :field_id (mt/id :venues :price))
        (is (= nil (db/select-one-field :values FieldValues, :field_id (mt/id :venues :price))))
        (with-redefs [sync.concurrent/submit-task (fn [task] (task))]
          (with-all-users-data-perms {(mt/id) {:data       {:schemas :block :native :none}
                                               :data-model {:schemas {"PUBLIC" {(mt/id :venues) :all}}}}}
            (mt/user-http-request :rasta :post 200 (format "table/%d/rescan_values" (mt/id :venues)))))
        (is (= [1 2 3 4] (db/select-one-field :values FieldValues, :field_id (mt/id :venues :price))))))

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

(deftest fetch-table-test
  (testing "GET /api/table/:id"
    (mt/with-temp Table [{table-id :id} {:db_id (mt/id) :schema "PUBLIC"}]
      (testing "A non-admin without self-service perms for a table cannot fetch the table normally"
        (with-all-users-data-perms {(mt/id) {:data {:native :none :schemas :none}}}
          (mt/user-http-request :rasta :get 403 (format "table/%d?include_editable_data_model=true" table-id))))

      (testing "A non-admin without self-service perms for a table can fetch the table if they have data model perms for
               the DB"
        (with-all-users-data-perms {(mt/id) {:data       {:native :none :schemas :none}
                                             :data-model {:schemas :all}}}
          (mt/user-http-request :rasta :get 200 (format "table/%d?include_editable_data_model=true" table-id))))

      (testing "A non-admin without self-service perms for a table can fetch the table if they have data model perms for
               the schema"
        (with-all-users-data-perms {(mt/id) {:data       {:native :none :schemas :none}
                                             :data-model {:schemas {"PUBLIC" :all}}}}
          (mt/user-http-request :rasta :get 200 (format "table/%d?include_editable_data_model=true" table-id))))

      (testing "A non-admin without self-service perms for a table can fetch the table if they have data model perms for
               the table"
        (with-all-users-data-perms {(mt/id) {:data       {:native :none :schemas :none}
                                             :data-model {:schemas {"PUBLIC" {table-id :all}}}}}
          (mt/user-http-request :rasta :get 200 (format "table/%d?include_editable_data_model=true" table-id)))))))

(deftest fetch-query-metadata-test
  (testing "GET /api/table/:id/query_metadata?include_editable_data_model=true"
    (mt/with-temp Table [{table-id :id} {:db_id (mt/id) :schema "PUBLIC"}]
      (testing "A non-admin without data model perms for a table cannot fetch the query metadata when
               include_editable_data_model=true"
        (with-all-users-data-perms {(mt/id) {:data       {:native :write :schemas :all}
                                             :data-model {:schemas :none}}}
          (mt/user-http-request :rasta :get 403
                                (format "table/%d/query_metadata?include_editable_data_model=true" table-id))))

      (testing "A non-admin with only data model perms for a table can fetch the query metadata when
               include_editable_data_model=true"
        (with-all-users-data-perms {(mt/id) {:data       {:native :none :schemas :none}
                                             :data-model {:schemas :all}}}
          (mt/user-http-request :rasta :get 200
                                (format "table/%d/query_metadata?include_editable_data_model=true" table-id)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                  Database details permission enforcement                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-database-test
  (testing "PUT /api/database/:id"
    (mt/with-temp Database [{db-id :id}]
      (testing "A non-admin cannot update database metadata if the advanced-permissions feature flag is not present"
        (with-all-users-data-perms {db-id {:details :yes}}
          (premium-features-test/with-premium-features #{}
            (mt/user-http-request :rasta :put 403 (format "database/%d" db-id) {:name "Database Test"}))))

      (testing "A non-admin cannot update database metadata if they do not have DB details permissions"
        (with-all-users-data-perms {db-id {:details :no}}
          (mt/user-http-request :rasta :put 403 (format "database/%d" db-id) {:name "Database Test"})))

      (testing "A non-admin can update database metadata if they have DB details permissions"
        (with-all-users-data-perms {db-id {:details :yes}}
          (mt/user-http-request :rasta :put 200 (format "database/%d" db-id) {:name "Database Test"}))))))

(deftest delete-database-test
  (mt/with-temp Database [{db-id :id}]
    (testing "A non-admin cannot delete a database even if they have DB details permissions"
      (with-all-users-data-perms {db-id {:details :yes}}
        (mt/user-http-request :rasta :delete 403 (format "database/%d" db-id))))))

(deftest db-operations-test
  (mt/with-temp* [Database    [{db-id :id}     {:engine "h2", :details (:details (mt/db))}]
                  Table       [{table-id :id}  {:db_id db-id}]
                  Field       [{field-id :id}  {:table_id table-id}]
                  FieldValues [{values-id :id} {:field_id field-id, :values [1 2 3 4]}]]
    (with-redefs [metabase.api.database/*rescan-values-async* false]
      (testing "A non-admin can trigger a sync of the DB schema if they have DB details permissions"
        (with-all-users-data-perms {db-id {:details :yes}}
          (mt/user-http-request :rasta :post 200 (format "database/%d/sync_schema" db-id))))

      (testing "A non-admin can discard saved field values if they have DB details permissions"
        (with-all-users-data-perms {db-id {:details :yes}}
          (mt/user-http-request :rasta :post 200 (format "database/%d/discard_values" db-id))))

      (testing "A non-admin with no data access can discard field values if they have DB details perms"
        (db/insert! FieldValues :id values-id :field_id field-id :values [1 2 3 4])
        (with-all-users-data-perms {db-id {:data    {:schemas :block :native :none}
                                           :details :yes}}
          (mt/user-http-request :rasta :post 200 (format "database/%d/discard_values" db-id)))
        (is (= nil (db/select-one-field :values FieldValues, :field_id field-id)))
        (mt/user-http-request :crowberto :post 200 (format "database/%d/rescan_values" db-id)))

      ;; Use test database for rescan_values tests so we can verify that scan actually succeeds
      (testing "A non-admin can trigger a re-scan of field values if they have DB details permissions"
        (with-all-users-data-perms {(mt/id) {:details :yes}}
          (mt/user-http-request :rasta :post 200 (format "database/%d/rescan_values" (mt/id)))))

      (testing "A non-admin with no data access can trigger a re-scan of field values if they have DB details perms"
        (db/delete! FieldValues :field_id (mt/id :venues :price))
        (is (= nil (db/select-one-field :values FieldValues, :field_id (mt/id :venues :price))))
        (with-all-users-data-perms {(mt/id) {:data   {:schemas :block :native :none}
                                             :details :yes}}
          (mt/user-http-request :rasta :post 200 (format "database/%d/rescan_values" (mt/id))))
        (is (= [1 2 3 4] (db/select-one-field :values FieldValues, :field_id (mt/id :venues :price))))))))

(deftest fetch-db-test
  (mt/with-temp Database [{db-id :id}]
    (testing "A non-admin without self-service perms for a DB cannot fetch the DB normally"
      (with-all-users-data-perms {db-id {:data {:native :none :schemas :none}}}
        (mt/user-http-request :rasta :get 403 (format "database/%d?exclude_uneditable_details=true" db-id))))

    (testing "A non-admin without self-service perms for a DB can fetch the DB if they have DB details permissions"
      (with-all-users-data-perms {db-id {:data    {:native :none :schemas :none}
                                         :details :yes}}
        (mt/user-http-request :rasta :get 200 (format "database/%d?exclude_uneditable_details=true" db-id))))

    (testing "A non-admin with block perms for a DB can fetch the DB if they have DB details permissions"
      (with-all-users-data-perms {db-id {:data    {:native :none :schemas :block}
                                         :details :yes}}
        (mt/user-http-request :rasta :get 200 (format "database/%d?exclude_uneditable_details=true" db-id))))

    (testing "The returned database contains a :details field for a user with DB details permissions"
      (with-all-users-data-perms {db-id {:data    {:native :none :schemas :block}
                                         :details :yes}}
        (is (partial= {:details {}}
             (mt/user-http-request :rasta :get 200 (format "database/%d?exclude_uneditable_details=true" db-id))))))))
