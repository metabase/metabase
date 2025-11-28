(ns ^:mb/driver-tests metabase.warehouse-schema-rest.api.table-test
  "Tests for /api/table endpoints."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.api.response :as api.response]
   [metabase.api.test-util :as api.test-util]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.upload.impl-test :as upload-test]
   [metabase.util :as u]
   [metabase.warehouse-schema-rest.api.table :as api.table]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; ## /api/org/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(deftest ^:parallel unauthenticated-test
  (is (= (get api.response/response-unauthentic :body)
         (client/client :get 401 "table")))
  (is (= (get api.response/response-unauthentic :body)
         (client/client :get 401 (format "table/%d" (mt/id :users))))))

(defn- db-details []
  (merge
   (select-keys (mt/db) [:id :entity_id :created_at :updated_at :timezone :creator_id :initial_sync_status :dbms_version
                         :cache_field_values_schedule :metadata_sync_schedule :uploads_enabled :uploads_schema_name
                         :uploads_table_prefix])
   {:engine                      "h2"
    :name                        "test-data (h2)"
    :is_attached_dwh             false
    :is_sample                   false
    :is_full_sync                true
    :is_on_demand                false
    :description                 nil
    :caveats                     nil
    :points_of_interest          nil
    :features                    (mapv u/qualified-name (driver.u/features :h2 (mt/db)))
    :refingerprint               nil
    :auto_run_queries            true
    :settings                    {}
    :cache_ttl                   nil
    :provider_name               nil
    :workspace_permissions_status nil
    :is_audit                    false}))

(defn- table-defaults
  ([]
   (table-defaults (or driver/*driver* :h2)))
  ([driver]
   (merge
    (-> (mt/object-defaults :model/Table)
        (update :data_authority name)
        (update :data_layer name))
    {:db          (db-details)
     :db_id       (mt/id)
     :entity_type "entity/GenericTable"
     :field_order "database"
     :view_count  0
     :measures    []
     :metrics     []
     :segments    []
     :is_writable (or (= driver :h2) nil)})))

(defn- field-defaults []
  (merge
   (mt/object-defaults :model/Field)
   {;; Index sync is turned off across the application as it is not used ATM.
    #_#_:database_indexed         false
    :dimensions               []
    :position                 0
    :target                   nil
    :visibility_type          "normal"}))

(defn- field-details [field]
  (merge
   (field-defaults)
   (select-keys
    field
    [:created_at :fingerprint :fingerprint_version :fk_target_field_id :id :last_analyzed :updated_at
     :database_required :database_is_auto_increment :database_is_pk :database_is_generated :database_is_nullable
     :entity_id])))

(deftest ^:parallel list-table-test
  (testing "GET /api/table"
    (testing "These should come back in alphabetical order and include relevant metadata"
      (is (= #{{:name         (mt/format-name "categories")
                :display_name "Categories"
                :id           (mt/id :categories)
                :entity_type  "entity/GenericTable"}
               {:name         (mt/format-name "checkins")
                :display_name "Checkins"
                :id           (mt/id :checkins)
                :entity_type  "entity/EventTable"}
               {:name         (mt/format-name "orders")
                :display_name "Orders"
                :id           (mt/id :orders)
                :entity_type  "entity/TransactionTable"}
               {:name         (mt/format-name "people")
                :display_name "People"
                :id           (mt/id :people)
                :entity_type  "entity/UserTable"}
               {:name         (mt/format-name "products")
                :display_name "Products"
                :id           (mt/id :products)
                :entity_type  "entity/ProductTable"}
               {:name         (mt/format-name "reviews")
                :display_name "Reviews"
                :id           (mt/id :reviews)
                :entity_type  "entity/GenericTable"}
               {:name         (mt/format-name "users")
                :display_name "Users"
                :id           (mt/id :users)
                :entity_type  "entity/UserTable"}
               {:name         (mt/format-name "venues")
                :display_name "Venues"
                :id           (mt/id :venues)
                :entity_type  "entity/GenericTable"}}
             (->> (mt/user-http-request :rasta :get 200 "table")
                  (filter #(= (:db_id %) (mt/id))) ; prevent stray tables from affecting unit test results
                  (map #(select-keys % [:name :display_name :id :entity_type]))
                  set))))))

(deftest list-table-test-2
  (testing "GET /api/table"
    (testing "Schema is \"\" rather than nil, if not set"
      (mt/with-temp [:model/Database {database-id :id} {}
                     :model/Table    {}                {:db_id        database-id
                                                        :name         "schemaless_table"
                                                        :display_name "Schemaless"
                                                        :entity_type  "entity/GenericTable"
                                                        :schema       nil}]
        (is (= [""]
               (->> (mt/user-http-request :rasta :get 200 "table")
                    (filter #(= (:db_id %) database-id))
                    (map :schema))))))))

(defmacro with-tables-as-uploads
  "Temporarily mark the given tables as uploads, as an alternate to making more expensive or brittle changes to the db."
  [table-keys & body]
  `(t2/with-transaction []
     (let [where-clause# {:id [:in (map mt/id ~table-keys)]}]
       (try
         (t2/update! :model/Table where-clause# {:is_upload true})
         ~@body
         (finally
           (t2/update! :model/Table where-clause# {:is_upload false}))))))

(deftest ^:parallel get-table-test
  (testing "GET /api/table/:id"
    (is (= (merge
            (dissoc (table-defaults :h2) :segments :field_values :metrics :measures)
            (t2/hydrate (t2/select-one [:model/Table :id :created_at :updated_at :initial_sync_status
                                        :view_count]
                                       :id (mt/id :venues))
                        :pk_field :collection)
            {:schema       "PUBLIC"
             :name         "VENUES"
             :display_name "Venues"
             :db_id        (mt/id)})
           (mt/user-http-request :rasta :get 200 (format "table/%d" (mt/id :venues)))))))

(deftest ^:parallel get-table-test-2
  (testing "GET /api/table/:id"
    (testing " returns schema as \"\" not nil"
      (mt/with-temp [:model/Database {database-id :id} {}
                     :model/Table    {table-id :id}    {:db_id        database-id
                                                        :name         "schemaless_table"
                                                        :display_name "Schemaless"
                                                        :entity_type  "entity/GenericTable"
                                                        :schema       nil}]
        (is (= (merge
                (dissoc (table-defaults) :segments :field_values :metrics :measures :db)
                (t2/hydrate (t2/select-one [:model/Table :id :created_at :updated_at :initial_sync_status
                                            :view_count]
                                           :id table-id)
                            :pk_field :collection)
                {:schema       ""
                 :name         "schemaless_table"
                 :display_name "Schemaless"
                 :db_id        database-id
                 :is_writable  nil})
               (dissoc (mt/user-http-request :rasta :get 200 (str "table/" table-id))
                       :db)))))))

(deftest get-table-test-3
  (testing "GET /api/table/:id"
    (testing " should return a 403 for a user that doesn't have read permissions for the table"
      (mt/with-temp [:model/Database {database-id :id} {}
                     :model/Table    {table-id :id}    {:db_id database-id}]
        (mt/with-no-data-perms-for-all-users!
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (str "table/" table-id)))))))))

(deftest api-database-table-endpoint-test
  (testing "GET /api/table/:table-id/data"
    (mt/dataset test-data
      (let [table-id (mt/id :orders)
            published-events (atom [])]
        (mt/with-dynamic-fn-redefs [events/publish-event! (fn [& args] (swap! published-events conj args))]
          (testing "returns dataset in same format as POST /api/dataset"
            (let [response (mt/user-http-request :rasta :get 202 (format "table/%d/data" table-id))]
              (is (contains? response :data))
              (is (contains? response :row_count))
              (is (contains? response :status))
              (is (= #{"Created At"
                       "Discount"
                       "ID"
                       "Product ID"
                       "Quantity"
                       "Subtotal"
                       "Tax"
                       "Total"
                       "User ID"}
                     (into #{} (map :display_name) (:cols (:data response)))))
              (is (seq (:rows (:data response))))
              (is (empty? (set/intersection #{:json_query :context :cached :average_execution_time} (set (keys response)))))))
          (testing "we track a table-read event"
            (is (= [["public" "orders"]]
                   (->> @published-events
                        (filter (comp #{:event/table-read} first))
                        (map (comp #(mapv u/lower-case-en %)
                                   (juxt :schema :name)
                                   :object
                                   second)))))))

        (testing "returns 404 for tables that don't exist"
          (mt/user-http-request :rasta :get 404 (format "table/%d/data" 133713371337)))))))

(defn- query-metadata-defaults []
  (table-defaults))

(deftest ^:parallel sensitive-fields-included-test
  (mt/with-premium-features #{}
    (testing "GET api/table/:id/query_metadata?include_sensitive_fields"
      (testing "Sensitive fields are included"
        (is (= (merge
                (query-metadata-defaults)
                (t2/hydrate (t2/select-one [:model/Table :created_at :updated_at :initial_sync_status :view_count]
                                           :id (mt/id :users))
                            :collection)
                {:schema       "PUBLIC"
                 :name         "USERS"
                 :display_name "Users"
                 :entity_type  "entity/UserTable"
                 :fields       [(assoc (field-details (t2/select-one :model/Field :id (mt/id :users :id)))
                                       :semantic_type              "type/PK"
                                       :table_id                   (mt/id :users)
                                       :name                       "ID"
                                       :display_name               "ID"
                                       :database_type              "BIGINT"
                                       :base_type                  "type/BigInteger"
                                       :effective_type             "type/BigInteger"
                                       :visibility_type            "normal"
                                       :has_field_values           "none"
                                       :database_required          false
                                     ;; Index sync is turned off across the application as it is not used ATM.
                                       #_#_:database_indexed           true
                                       :database_is_auto_increment true
                                       :name_field                 {:base_type "type/Text",
                                                                    :display_name "Name",
                                                                    :fk_target_field_id nil,
                                                                    :has_field_values "list",
                                                                    :id (mt/id :users :name),
                                                                    :name "NAME",
                                                                    :semantic_type "type/Name",
                                                                    :table_id (mt/id :users)})
                                (assoc (field-details (t2/select-one :model/Field :id (mt/id :users :name)))
                                       :semantic_type              "type/Name"
                                       :table_id                   (mt/id :users)
                                       :name                       "NAME"
                                       :display_name               "Name"
                                       :database_type              "CHARACTER VARYING"
                                       :base_type                  "type/Text"
                                       :effective_type             "type/Text"
                                       :visibility_type            "normal"
                                       :has_field_values           "list"
                                       :position                   1
                                       :database_position          1
                                       :database_required          false
                                       :database_is_auto_increment false
                                       :name_field                 nil)
                                (assoc (field-details (t2/select-one :model/Field :id (mt/id :users :last_login)))
                                       :table_id                   (mt/id :users)
                                       :name                       "LAST_LOGIN"
                                       :display_name               "Last Login"
                                       :database_type              "TIMESTAMP"
                                       :base_type                  "type/DateTime"
                                       :effective_type             "type/DateTime"
                                       :visibility_type            "normal"
                                       :has_field_values           "none"
                                       :position                   2
                                       :database_position          2
                                       :database_required          false
                                       :database_is_auto_increment false
                                       :name_field                 nil)
                                (assoc (field-details (t2/select-one :model/Field :table_id (mt/id :users), :name "PASSWORD"))
                                       :semantic_type              "type/Category"
                                       :table_id                   (mt/id :users)
                                       :name                       "PASSWORD"
                                       :display_name               "Password"
                                       :database_type              "CHARACTER VARYING"
                                       :base_type                  "type/Text"
                                       :effective_type             "type/Text"
                                       :visibility_type            "sensitive"
                                       :has_field_values           "list"
                                       :position                   3
                                       :database_position          3
                                       :database_required          false
                                       :database_is_auto_increment false
                                       :name_field                 nil)]
                 :id           (mt/id :users)})
               (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata?include_sensitive_fields=true" (mt/id :users))))
            "Make sure that getting the User table *does* include info about the password field, but not actual values themselves")))))

(deftest ^:parallel sensitive-fields-not-included-test
  (mt/with-premium-features #{}
    (testing "GET api/table/:id/query_metadata"
      (testing "Sensitive fields should not be included"
        (is (= (merge
                (query-metadata-defaults)
                (t2/hydrate (t2/select-one [:model/Table :created_at :updated_at :initial_sync_status :view_count]
                                           :id (mt/id :users))
                            :collection)
                {:schema       "PUBLIC"
                 :name         "USERS"
                 :display_name "Users"
                 :entity_type  "entity/UserTable"
                 :fields       [(assoc (field-details (t2/select-one :model/Field :id (mt/id :users :id)))
                                       :table_id         (mt/id :users)
                                       :semantic_type    "type/PK"
                                       :name             "ID"
                                       :display_name     "ID"
                                       :database_type    "BIGINT"
                                       :base_type        "type/BigInteger"
                                       :effective_type   "type/BigInteger"
                                       :has_field_values "none"
                                     ;; Index sync is turned off across the application as it is not used ATM.
                                       #_#_:database_indexed  true
                                       :database_required false
                                       :database_is_auto_increment true
                                       :name_field {:base_type "type/Text",
                                                    :display_name "Name",
                                                    :fk_target_field_id nil,
                                                    :has_field_values "list",
                                                    :id (mt/id :users :name),
                                                    :name "NAME",
                                                    :semantic_type "type/Name",
                                                    :table_id (mt/id :users)})
                                (assoc (field-details (t2/select-one :model/Field :id (mt/id :users :name)))
                                       :table_id         (mt/id :users)
                                       :semantic_type     "type/Name"
                                       :name             "NAME"
                                       :display_name     "Name"
                                       :database_type    "CHARACTER VARYING"
                                       :base_type        "type/Text"
                                       :effective_type   "type/Text"
                                       :has_field_values "list"
                                       :position          1
                                       :database_position 1
                                       :database_required false
                                       :database_is_auto_increment false
                                       :name_field        nil)
                                (assoc (field-details (t2/select-one :model/Field :id (mt/id :users :last_login)))
                                       :table_id                 (mt/id :users)
                                       :name                     "LAST_LOGIN"
                                       :display_name             "Last Login"
                                       :database_type            "TIMESTAMP"
                                       :base_type                "type/DateTime"
                                       :effective_type           "type/DateTime"
                                       :has_field_values         "none"
                                       :position                 2
                                       :database_position        2
                                       :database_required        false
                                       :database_is_auto_increment false
                                       :name_field               nil)]
                 :id           (mt/id :users)})
               (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (mt/id :users))))
            "Make sure that getting the User table does *not* include password info")))))

(deftest fk-target-permissions-test
  (testing "GET /api/table/:id/query_metadata"
    (testing (str "Check that FK fields belonging to Tables we don't have permissions for don't come back as hydrated "
                  "`:target`(#3867)")
      ;; create a temp DB with two tables; table-2 has an FK to table-1
      (mt/with-temp [:model/Database db          {}
                     :model/Table    table-1     {:db_id (u/the-id db)}
                     :model/Table    table-2     {:db_id (u/the-id db)}
                     :model/Field    table-1-id  {:table_id (u/the-id table-1), :name "id", :base_type :type/Integer, :semantic_type :type/PK}
                     :model/Field    _table-2-id {:table_id (u/the-id table-2), :name "id", :base_type :type/Integer, :semantic_type :type/PK}
                     :model/Field    _table-2-fk {:table_id (u/the-id table-2), :name "fk", :base_type :type/Integer, :semantic_type :type/FK, :fk_target_field_id (u/the-id table-1-id)}]
        (mt/with-no-data-perms-for-all-users!
          ;; grant create-queries to table-2 only
          (data-perms/set-table-permission! (perms-group/all-users) table-2 :perms/create-queries :query-builder)
          (data-perms/set-database-permission! (perms-group/all-users) db :perms/view-data :unrestricted)
          ;; metadata for table-2 should show all fields for table-2, but the FK target info shouldn't be hydrated
          (is (= #{{:name "id", :target false}
                   {:name "fk", :target false}}
                 (set (for [field (:fields (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (u/the-id table-2))))]
                        (-> (select-keys field [:name :target])
                            (update :target boolean)))))))))))

(deftest ^:parallel update-table-test
  (testing "PUT /api/table/:id"
    (mt/with-temp [:model/Table table]
      (mt/user-http-request :crowberto :put 200 (format "table/%d" (u/the-id table))
                            {:display_name     "Userz"
                             :description      "What a nice table!"
                             :data_source      "transform"
                             :data_layer       "hidden"
                             :owner_email      "bob@org.com"
                             :owner_user_id    (mt/user->id :crowberto)})
      (is (= (merge
              (-> (table-defaults)
                  (dissoc :segments :field_values :metrics :measures :updated_at)
                  (update :db merge (select-keys (mt/db) [:details])))
              (t2/hydrate (t2/select-one [:model/Table :id :schema :name :created_at :initial_sync_status] :id (u/the-id table))
                          :pk_field :collection)
              {:description     "What a nice table!"
               :entity_type     nil
               :schema          ""
               :visibility_type "hidden"
               :display_name    "Userz"
               :is_writable     nil
               :data_source      "transform"
               :data_layer       "hidden"
               ;; exclusive later (not now)
               :owner_email      "bob@org.com"
               :owner_user_id    (mt/user->id :crowberto)})
             (dissoc (mt/user-http-request :crowberto :get 200 (format "table/%d" (u/the-id table)))
                     :updated_at))))))

(deftest ^:parallel update-table-test-2
  (testing "PUT /api/table/:id"
    (testing "Can update description, caveat, points of interest to be empty (#11097)"
      (doseq [property [:caveats :points_of_interest :description]]
        (mt/with-temp [:model/Table table]
          (is (= ""
                 (get (mt/user-http-request :crowberto :put 200 (format "table/%d" (u/the-id table))
                                            {property ""})
                      property))))))))

(deftest ^:parallel update-table-test-3
  (testing "PUT /api/table/:id"
    (testing "Don't change visibility_type when updating properties (#22287)"
      (doseq [property [:caveats :points_of_interest :description :display_name]]
        (mt/with-temp [:model/Table table {:visibility_type "hidden"}]
          (mt/user-http-request :crowberto :put 200 (format "table/%d" (u/the-id table))
                                {property (mt/random-name)})
          (is (= :hidden (t2/select-one-fn :visibility_type :model/Table :id (:id table)))))))))

(deftest ^:parallel update-table-test-4
  (testing "PUT /api/table/:id"
    (testing "A table can only be updated by a superuser"
      (mt/with-temp [:model/Table table]
        (mt/user-http-request :rasta :put 403 (format "table/%d" (u/the-id table)) {:display_name "Userz"})))))

(deftest ^:parallel update-data-authority-test
  (testing "PUT /api/table/:id"
    (testing "data_authority field behavior"
      (mt/with-temp [:model/Table table {}]
        (testing "Initially data_authority should be unconfigured"
          (is (= :unconfigured (t2/select-one-fn :data_authority :model/Table :id (u/the-id table)))))

        (testing "Can save an unrelated change with this field redundantly included"
          (mt/user-http-request :crowberto :put 200 (format "table/%d" (u/the-id table))
                                {:active false, :data_authority "unconfigured"})
          (is (= :unconfigured (t2/select-one-fn :data_authority :model/Table :id (u/the-id table)))))

        (testing "Can set data_authority to authoritative"
          (mt/user-http-request :crowberto :put 200 (format "table/%d" (u/the-id table))
                                {:data_authority "authoritative"})
          (is (= :authoritative (t2/select-one-fn :data_authority :model/Table :id (u/the-id table)))))

        (testing "Can set data_authority between different values"
          (mt/user-http-request :crowberto :put 200 (format "table/%d" (u/the-id table))
                                {:data_authority "computed"})
          (is (= :computed (t2/select-one-fn :data_authority :model/Table :id (u/the-id table)))))

        (testing "Can set data_authority to ingested"
          (mt/user-http-request :crowberto :put 200 (format "table/%d" (u/the-id table))
                                {:data_authority "ingested"})
          (is (= :ingested (t2/select-one-fn :data_authority :model/Table :id (u/the-id table)))))

        (testing "Cannot un-configure again"
          (is (= "Cannot set data_authority back to unconfigured once it has been configured"
                 (mt/user-http-request :crowberto :put 400 (format "table/%d" (u/the-id table))
                                       {:data_authority "unconfigured"}))))

        (testing "Cannot set data_authority to unknown via API"
          (is (= [:data_authority]
                 (keys (:errors (mt/user-http-request :crowberto :put 400 (format "table/%d" (u/the-id table))
                                                      {:data_authority "unknown"}))))))))))

(deftest ^:parallel unknown-data-authority-value-test
  (testing "Tables with unknown data_authority values from database are read as :unknown"
    (mt/with-temp [:model/Table table {}]
      ;; Directly insert an unknown value into the database, bypassing Toucan transforms
      (t2/query-one {:update :metabase_table
                     :set    {:data_authority "federated"}
                     :where  [:= :id (:id table)]})

      (testing "Unexpected values are converted to :unknown"
        (is (= :unknown (t2/select-one-fn :data_authority [:model/Table :data_authority] :id (:id table)))))

      (testing "API GET endpoint returns :unknown for tables with unknown data_authority"
        (let [api-response (mt/user-http-request :crowberto :get 200 (format "table/%d" (:id table)))]
          (is (= "unknown" (:data_authority api-response))))))))

;; see how many times sync-table! gets called when we call the PUT endpoint. It should happen when you switch from
;; hidden -> not hidden at the spots marked below, twice total
(deftest update-table-sync-test
  (testing "PUT /api/table/:id"
    (testing "Table should get synced when it gets unhidden"
      (mt/with-temp [:model/Database db    {:details (:details (mt/db))}
                     :model/Table    table (-> (t2/select-one :model/Table (mt/id :venues))
                                               (dissoc :id :entity_id)
                                               (assoc :db_id (:id db)))]
        (let [called (atom 0)
              ;; original is private so a var will pick up the redef'd. need contents of var before
              original (var-get #'api.table/sync-unhidden-tables)]
          (with-redefs [api.table/sync-unhidden-tables
                        (fn [unhidden]
                          (when (seq unhidden)
                            (is (= (:id table)
                                   (:id (first unhidden)))
                                "Unhidden callback did not get correct tables.")
                            (swap! called inc)
                            (let [fut (original unhidden)]
                              (when (future? fut)
                                (deref fut)))))]
            (letfn [(set-visibility! [state]
                      (testing (format "Set state => %s" (pr-str state))
                        (mt/user-http-request :crowberto :put 200 (format "table/%d" (:id table))
                                              {:display_name    "Userz"
                                               :visibility_type state
                                               :description     "What a nice table!"})))
                    (set-name! []
                      (testing "set display name"
                        (mt/user-http-request :crowberto :put 200 (format "table/%d" (:id table))
                                              {:display_name (mt/random-name)
                                               :description  "What a nice table!"})))]

              (set-visibility! "hidden")
              (set-visibility! nil)     ; <- should get synced
              (is (= 1
                     @called))
              (set-visibility! "hidden")
              (set-visibility! "cruft")
              (set-visibility! "technical")
              (set-visibility! nil)     ; <- should get synced again
              (is (= 2
                     @called))
              (set-visibility! "technical")
              (is (= 2
                     @called))
              (testing "Update table's properties shouldn't trigger sync"
                (set-name!)
                (is (= 2
                       @called)))))))))

  (testing "Bulk updating visibility"
    (let [unhidden-ids (atom #{})]
      (mt/with-temp [:model/Table {id-1 :id} {}
                     :model/Table {id-2 :id} {:visibility_type "hidden"}]
        (with-redefs [api.table/sync-unhidden-tables (fn [unhidden] (reset! unhidden-ids (set (map :id unhidden))))]
          (letfn [(set-many-vis! [ids state]
                    (reset! unhidden-ids #{})
                    (testing (format "Set visibility type => %s" (pr-str state))
                      (mt/user-http-request :crowberto :put 200 "table/"
                                            {:ids ids :visibility_type state})))]
            (set-many-vis! [id-1 id-2] nil) ;; unhides only 2
            (is (= @unhidden-ids #{id-2}))

            (set-many-vis! [id-1 id-2] "hidden")
            (is (= #{}
                   @unhidden-ids)) ;; no syncing when they are hidden

            (set-many-vis! [id-1 id-2] nil) ;; both are made unhidden so both synced
            (is (= @unhidden-ids #{id-1 id-2}))))))))

(deftest ^:parallel get-fks-test
  (testing "GET /api/table/:id/fks"
    (testing "We expect a single FK from CHECKINS.USER_ID -> USERS.ID"
      (let [checkins-user-field (t2/select-one :model/Field :id (mt/id :checkins :user_id))
            users-id-field      (t2/select-one :model/Field :id (mt/id :users :id))]
        (is (= [{:origin_id      (:id checkins-user-field)
                 :destination_id (:id users-id-field)
                 :relationship   "Mt1"
                 :origin         (-> (field-details checkins-user-field)
                                     (dissoc :target :dimensions :values)
                                     (assoc :table_id          (mt/id :checkins)
                                            :name              "USER_ID"
                                            :display_name      "User ID"
                                            :database_type     "INTEGER"
                                            :base_type         "type/Integer"
                                            :effective_type    "type/Integer"
                                            :semantic_type     "type/FK"
                                            :database_position 2
                                            :position          2
                                            ;; Index sync is turned off across the application as it is not used ATM.
                                            #_#_:database_indexed  true
                                            :table         (merge
                                                            (dissoc (table-defaults) :segments :field_values :metrics :measures)
                                                            (t2/select-one [:model/Table
                                                                            :id :created_at :updated_at
                                                                            :initial_sync_status :view_count]
                                                                           :id (mt/id :checkins))
                                                            {:schema       "PUBLIC"
                                                             :name         "CHECKINS"
                                                             :display_name "Checkins"
                                                             :entity_type  "entity/EventTable"})))
                 :destination    (-> (field-details users-id-field)
                                     (dissoc :target :dimensions :values)
                                     (assoc :table_id         (mt/id :users)
                                            :name             "ID"
                                            :display_name     "ID"
                                            :base_type        "type/BigInteger"
                                            :effective_type   "type/BigInteger"
                                            :database_type    "BIGINT"
                                            :semantic_type    "type/PK"
                                            ;; Index sync is turned off across the application as it is not used ATM.
                                            #_#_:database_indexed true
                                            :table            (merge
                                                               (dissoc (table-defaults :h2) :db :segments :field_values :metrics :measures)
                                                               (t2/select-one [:model/Table
                                                                               :id :created_at :updated_at
                                                                               :initial_sync_status :view_count]
                                                                              :id (mt/id :users))
                                                               {:schema       "PUBLIC"
                                                                :name         "USERS"
                                                                :display_name "Users"
                                                                :entity_type  "entity/UserTable"})))}]
               (mt/user-http-request :rasta :get 200 (format "table/%d/fks" (mt/id :users)))))))
    (testing "should just return nothing for 'virtual' tables"
      (is (= []
             (mt/user-http-request :crowberto :get 200 "table/card__1000/fks"))))))

(deftest ^:parallel basic-query-metadata-test
  (mt/with-premium-features #{}
    (testing "GET /api/table/:id/query_metadata"
      (is (= (merge
              (query-metadata-defaults)
              (t2/hydrate (t2/select-one [:model/Table :created_at :updated_at :initial_sync_status] :id (mt/id :categories))
                          :collection)
              {:schema       "PUBLIC"
               :name         "CATEGORIES"
               :display_name "Categories"
               :fields       [(merge
                               (field-details (t2/select-one :model/Field :id (mt/id :categories :id)))
                               {:table_id          (mt/id :categories)
                                :semantic_type     "type/PK"
                                :name              "ID"
                                :display_name      "ID"
                                :database_type     "BIGINT"
                                :base_type         "type/BigInteger"
                                :effective_type    "type/BigInteger"
                                :has_field_values  "none"
                                :database_required false
                              ;; Index sync is turned off across the application as it is not used ATM.
                                #_#_:database_indexed  true
                                :database_is_auto_increment true
                                :name_field        {:base_type "type/Text",
                                                    :display_name "Name",
                                                    :fk_target_field_id nil,
                                                    :has_field_values "list",
                                                    :id (mt/id :categories :name),
                                                    :name "NAME",
                                                    :semantic_type "type/Name",
                                                    :table_id (mt/id :categories)}})
                              (merge
                               (field-details (t2/select-one :model/Field :id (mt/id :categories :name)))
                               {:table_id                   (mt/id :categories)
                                :semantic_type              "type/Name"
                                :name                       "NAME"
                                :display_name               "Name"
                                :database_type              "CHARACTER VARYING"
                                :base_type                  "type/Text"
                                :effective_type             "type/Text"
                                :has_field_values           "list"
                                :database_position          1
                                :position                   1
                                :database_required          true
                                :database_is_auto_increment false
                                :name_field                 nil})]
               :id           (mt/id :categories)})
             (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (mt/id :categories))))))))

(deftest ^:parallel table-metric-query-metadata-test
  (testing "GET /api/table/:id/query_metadata"
    (mt/with-temp [:model/Card metric {:type :metric
                                       :name "Category metric"
                                       :database_id (mt/id)
                                       :table_id (mt/id :categories)}
                   :model/Card _      {:type :metric
                                       :name "Venues metric"
                                       :database_id (mt/id)
                                       :table_id (mt/id :venues)}
                   :model/Card _      {:type :question
                                       :name "Category question"
                                       :database_id (mt/id)
                                       :table_id (mt/id :categories)}
                   :model/Card _      {:type :metric
                                       :name "Archived metric"
                                       :archived true
                                       :database_id (mt/id)
                                       :table_id (mt/id :categories)}]
      (is (=? {:metrics [(assoc metric :type "metric" :display "table")]}
              (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (mt/id :categories))))))))

(deftest ^:parallel table-segment-query-metadata-test
  (testing "GET /api/table/:id/query_metadata"
    (testing "segments include :definition_description"
      (mt/with-temp [:model/Segment _ {:table_id (mt/id :venues)
                                       :definition (:query (mt/mbql-query venues {:filter [:= $price 4]}))}]
        (is (=? {:segments [{:definition_description "Filtered by Price is equal to 4"}]}
                (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (mt/id :venues)))))))))

(defn- with-field-literal-id [{field-name :name, base-type :base_type :as field}]
  (assoc field :id ["field" field-name {:base-type base-type}]))

(defn- default-card-field-for-venues [table-id]
  {:table_id      table-id
   :semantic_type nil})

;; Make sure metadata for 'virtual' tables comes back as expected
(deftest ^:parallel virtual-table-metadata-test
  (testing "GET /api/table/:id/query_metadata"
    (testing "Make sure metadata for 'virtual' tables comes back as expected"
      (mt/with-temp [:model/Card card {:name          "Go Dubs!"
                                       :database_id   (mt/id)
                                       :dataset_query {:database (mt/id)
                                                       :type     :native
                                                       :native   {:query (format "SELECT NAME, ID, PRICE, LATITUDE FROM VENUES")}}}]
        ;; run the Card which will populate its result_metadata column
        (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (u/the-id card)))
        ;; Now fetch the metadata for this "table"
        (is (=? (let [card-virtual-table-id (str "card__" (u/the-id card))]
                  {:display_name      "Go Dubs!"
                   :schema            "Everything else"
                   :db_id             (:database_id card)
                   :db                {:id (:database_id card)}
                   :id                card-virtual-table-id
                   :entity_id         (:entity_id card)
                   :type              "question"
                   :moderated_status  nil
                   :metrics           nil
                   :description       nil
                   :fields            (map (comp #(merge (default-card-field-for-venues card-virtual-table-id) %)
                                                 with-field-literal-id)
                                           (let [id->fingerprint   (t2/select-pk->fn :fingerprint :model/Field :table_id (mt/id :venues))
                                                 name->fingerprint (comp id->fingerprint (partial mt/id :venues))]
                                             [{:name           "NAME"
                                               :display_name   "NAME"
                                               :base_type      "type/Text"
                                               :effective_type "type/Text"
                                               :database_type  "CHARACTER VARYING"
                                               :semantic_type  "type/Name"
                                               :fingerprint    (name->fingerprint :name)
                                               :field_ref      ["field" "NAME" {:base-type "type/Text"}]}
                                              {:name           "ID"
                                               :display_name   "ID"
                                               :base_type      "type/BigInteger"
                                               :effective_type "type/BigInteger"
                                               :database_type  "BIGINT"
                                               :semantic_type  nil
                                               :fingerprint    (name->fingerprint :id)
                                               :field_ref      ["field" "ID" {:base-type "type/BigInteger"}]}
                                              {:name           "PRICE"
                                               :display_name   "PRICE"
                                               :base_type      "type/Integer"
                                               :effective_type "type/Integer"
                                               :database_type  "INTEGER"
                                               :semantic_type  nil
                                               :fingerprint    (name->fingerprint :price)
                                               :field_ref      ["field" "PRICE" {:base-type "type/Integer"}]}
                                              {:name           "LATITUDE"
                                               :display_name   "LATITUDE"
                                               :base_type      "type/Float"
                                               :effective_type "type/Float"
                                               :database_type  "DOUBLE PRECISION"
                                               :semantic_type  "type/Latitude"
                                               :fingerprint    (name->fingerprint :latitude)
                                               :field_ref      ["field" "LATITUDE" {:base-type "type/Float"}]}]))})
                (->> card
                     u/the-id
                     (format "table/card__%d/query_metadata")
                     (mt/user-http-request :crowberto :get 200))))))))

(deftest virtual-table-metadata-permission-test
  (testing "GET /api/table/card__:id/query_metadata"
    (testing "Make sure we do not leak the database info when the user does not have data perms"
      (mt/with-temp [:model/Card card {:database_id   (mt/id)
                                       :dataset_query {:query    {:source-table (mt/id :venues)}
                                                       :type     :query
                                                       :database (mt/id)}}]
        (mt/with-full-data-perms-for-all-users!
          (is (=? {:id     (str "card__" (u/the-id card))
                   :schema "Everything else"
                   :db_id  (:database_id card)
                   :db     {:id (:database_id card)}}
                  (->> card
                       u/the-id
                       (format "table/card__%d/query_metadata")
                       (mt/user-http-request :rasta :get 200)))))
        (mt/with-no-data-perms-for-all-users!
          (is (=? {:id     (str "card__" (u/the-id card))
                   :db_id  (:database_id card)
                   :schema "Everything else"
                   :db     nil}
                  (->> card
                       u/the-id
                       (format "table/card__%d/query_metadata")
                       (mt/user-http-request :rasta :get 200)))))))))

(deftest ^:parallel virtual-table-metadata-deleted-cards-test
  (testing "GET /api/table/card__:id/query_metadata for deleted cards (#48461)"
    (mt/with-temp
      [:model/Card {card-id-1 :id} {:dataset_query (mt/mbql-query products)}
       :model/Card {card-id-2 :id} {:dataset_query {:database (mt/id)
                                                    :type     :query
                                                    :query    {:source-table (str "card__" card-id-1)}}}]
      (letfn [(query-metadata [expected-status card-id]
                (->> (format "table/card__%d/query_metadata" card-id)
                     (mt/user-http-request :crowberto :get expected-status)))]
        (api.test-util/before-and-after-deleted-card
         card-id-1
         #(testing "Before delete"
            (doseq [card-id [card-id-1 card-id-2]]
              (is (=? {:db_id             (mt/id)
                       :id                (str "card__" card-id)
                       :type              "question"}
                      (query-metadata 200 card-id)))))
         #(testing "After delete"
            ;; card-id-1 is deleted, so it returns 204 empty
            (is (empty? (query-metadata 204 card-id-1)))
            ;; card-id-2 still exists, so it returns 200 with metadata
            (is (=? {:db_id (mt/id)
                     :id (str "card__" card-id-2)
                     :type "question"}
                    (query-metadata 200 card-id-2)))))))))

(deftest ^:parallel include-date-dimensions-in-nested-query-test
  (testing "GET /api/table/:id/query_metadata"
    (testing "Test date dimensions being included with a nested query"
      (mt/with-temp [:model/Card card {:name          "Users"
                                       :database_id   (mt/id)
                                       :dataset_query {:database (mt/id)
                                                       :type     :native
                                                       :native   {:query (format "SELECT NAME, LAST_LOGIN FROM USERS")}}}]
        (let [card-virtual-table-id (str "card__" (u/the-id card))]
          ;; run the Card which will populate its result_metadata column
          (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (u/the-id card)))
          ;; Now fetch the metadata for this "table" via the API
          (let [[name-metadata last-login-metadata] (t2/select-one-fn :result_metadata :model/Card :id (u/the-id card))]
            (is (=? {:display_name      "Users"
                     :schema            "Everything else"
                     :db_id             (:database_id card)
                     :id                card-virtual-table-id
                     :entity_id         (:entity_id card)
                     :type              "question"
                     :description       nil
                     :moderated_status  nil
                     :metrics           nil
                     :fields            [{:name                     "NAME"
                                          :display_name             "NAME"
                                          :base_type                "type/Text"
                                          :effective_type           "type/Text"
                                          :database_type            "CHARACTER VARYING"
                                          :table_id                 card-virtual-table-id
                                          :id                       ["field" "NAME" {:base-type "type/Text"}]
                                          :semantic_type            "type/Name"
                                          :fingerprint              (:fingerprint name-metadata)
                                          :field_ref                ["field" "NAME" {:base-type "type/Text"}]}
                                         {:name                     "LAST_LOGIN"
                                          :display_name             "LAST_LOGIN"
                                          :base_type                "type/DateTime"
                                          :effective_type           "type/DateTime"
                                          :database_type            "TIMESTAMP"
                                          :table_id                 card-virtual-table-id
                                          :id                       ["field" "LAST_LOGIN" {:base-type "type/DateTime"}]
                                          :semantic_type            nil
                                          :fingerprint              (:fingerprint last-login-metadata)
                                          :field_ref                ["field" "LAST_LOGIN" {:base-type "type/DateTime"}]}]}
                    (mt/user-http-request :crowberto :get 200
                                          (format "table/card__%d/query_metadata" (u/the-id card)))))))))))

(deftest include-metrics-for-card-test
  (testing "GET /api/table/:id/query_metadata"
    (mt/with-temp [:model/Card model {:name          "Venues model"
                                      :database_id   (mt/id)
                                      :type          :model
                                      :dataset_query (mt/mbql-query venues)}]
      (let [card-virtual-table-id (str "card__" (:id model))
            metric-query          {:database (mt/id)
                                   :type     "query"
                                   :query    {:source-table card-virtual-table-id
                                              :aggregation  [["count"]]}}]
        (mt/with-temp [:model/Collection coll   {:name "My Collection"}
                       :model/Card       metric {:name          "Venues metric"
                                                 :database_id   (mt/id)
                                                 :collection_id (:id coll)
                                                 :type          :metric
                                                 :dataset_query metric-query}]
          (perms/revoke-collection-permissions! (perms-group/all-users) (:id coll))
          (testing "Test metrics being included with cards"
            (is (=? {:display_name "Venues model"
                     :db_id        (mt/id)
                     :id           card-virtual-table-id
                     :type         "model"
                     :metrics      [{:source_card_id (:id model)
                                     :table_id       (:table_id model)
                                     :database_id    (mt/id)
                                     :name           "Venues metric"
                                     :type           "metric"
                                     :dataset_query  {:database (mt/id)
                                                      :lib/type "mbql/query"
                                                      :stages   [{:source-card (:id model)
                                                                  :aggregation [["count" {}]]}]}
                                     :id             (:id metric)}]}
                    (mt/user-http-request :crowberto :get 200
                                          (format "table/card__%d/query_metadata" (u/the-id model))))))
          (testing "Test metrics not being included with cards from inaccessible collections"
            (is (=? {:display_name "Venues model"
                     :db_id        (mt/id)
                     :id           card-virtual-table-id
                     :type         "model"
                     :metrics      nil}
                    (mt/user-http-request :lucky :get 200
                                          (format "table/card__%d/query_metadata" (u/the-id model)))))))))))

(defn- narrow-fields [category-names api-response]
  (for [field (:fields api-response)
        :when (contains? (set category-names) (:name field))]
    (-> field
        (select-keys [:id :table_id :name :values :dimensions])
        (update :dimensions (fn [dimensions]
                              (for [dim dimensions]
                                (dissoc dim :id :entity_id :created_at :updated_at)))))))

(defn- category-id-semantic-type!
  "Field values will only be returned when the field's semantic type is set to type/Category. This function will change
  that for `category_id`, then invoke `f` and roll it back afterwards"
  [semantic-type f]
  (mt/with-temp-vals-in-db :model/Field (mt/id :venues :category_id) {:semantic_type semantic-type}
    (f)))

(deftest query-metadata-remappings-test
  (testing "GET /api/table/:id/query_metadata"
    (mt/with-column-remappings [venues.category_id (values-of categories.name)]
      (testing "Ensure internal remapped dimensions and human_readable_values are returned"
        (is (= [{:table_id   (mt/id :venues)
                 :id         (mt/id :venues :category_id)
                 :name       "CATEGORY_ID"
                 :dimensions [{:name                    "Category ID [internal remap]"
                               :field_id                (mt/id :venues :category_id)
                               :human_readable_field_id nil
                               :type                    "internal"}]}
                {:id         (mt/id :venues :price)
                 :table_id   (mt/id :venues)
                 :name       "PRICE"
                 :dimensions []}]
               (category-id-semantic-type!
                :type/Category
                (fn []
                  (narrow-fields ["PRICE" "CATEGORY_ID"]
                                 (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (mt/id :venues))))))))))))

(deftest query-metadata-remappings-test-2
  (testing "GET /api/table/:id/query_metadata"
    (mt/with-column-remappings [venues.category_id (values-of categories.name)]
      (testing "Ensure internal remapped dimensions and human_readable_values are returned when type is enum"
        (is (= [{:table_id   (mt/id :venues)
                 :id         (mt/id :venues :category_id)
                 :name       "CATEGORY_ID"
                 :dimensions [{:name                    "Category ID [internal remap]"
                               :field_id                (mt/id :venues :category_id)
                               :human_readable_field_id nil
                               :type                    "internal"}]}
                {:id         (mt/id :venues :price)
                 :table_id   (mt/id :venues)
                 :name       "PRICE"
                 :dimensions []}]
               (category-id-semantic-type!
                :type/Enum
                (fn []
                  (narrow-fields ["PRICE" "CATEGORY_ID"]
                                 (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (mt/id :venues))))))))))))

(deftest query-metadata-remappings-test-3
  (testing "GET /api/table/:id/query_metadata"
    (mt/with-column-remappings [venues.category_id categories.name]
      (testing "Ensure FK remappings are returned"
        (is (= [{:table_id   (mt/id :venues)
                 :id         (mt/id :venues :category_id)
                 :name       "CATEGORY_ID"
                 :dimensions [{:name                    "Category ID [external remap]"
                               :field_id                (mt/id :venues :category_id)
                               :human_readable_field_id (mt/id :categories :name)
                               :type                    "external"}]}
                {:id         (mt/id :venues :price)
                 :table_id   (mt/id :venues)
                 :name       "PRICE"
                 :dimensions []}]
               (category-id-semantic-type!
                :type/Category
                (fn []
                  (narrow-fields ["PRICE" "CATEGORY_ID"]
                                 (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (mt/id :venues))))))))))))

(deftest ^:parallel card-type-and-dataset-query-are-returned-with-metadata
  (testing "GET /api/table/card__:id/query_metadata returns card type"
    (let [dataset-query (mt/mbql-query venues
                          {:aggregation  [:sum $price]
                           :filter       [:> $price 1]
                           :source-table $$venues})
          base-card     {:database_id   (mt/id)
                         :dataset_query dataset-query}]
      (mt/with-temp [:model/Card question base-card
                     :model/Card model    (assoc base-card :type :model)
                     :model/Card metric   (assoc base-card :type :metric)]
        (are [card expected-type] (=? expected-type
                                      (->> (format "table/card__%d/query_metadata" (:id card))
                                           (mt/user-http-request :crowberto :get 200)
                                           ((juxt :type :dataset_query))))
          question ["question" nil]
          model    ["model"    nil]
          metric   ["metric"   some?])))))

(deftest ^:parallel related-test
  (testing "GET /api/table/:id/related"
    (testing "related/recommended entities"
      (is (= #{:metrics :segments :linked-from :linking-to :tables}
             (-> (mt/user-http-request :crowberto :get 200 (format "table/%s/related" (mt/id :venues))) keys set))))))

(deftest ^:parallel discard-values-test
  (testing "POST /api/table/:id/discard_values"
    (mt/with-temp [:model/Table       table        {}
                   :model/Field       field        {:table_id (u/the-id table)}
                   :model/FieldValues field-values {:field_id (u/the-id field) :values ["A" "B" "C"]}]
      (let [url (format "table/%d/discard_values" (u/the-id table))]
        (testing "Non-admin toucans should not be allowed to discard values"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 url)))
          (testing "FieldValues should still exist"
            (is (t2/exists? :model/FieldValues :id (u/the-id field-values)))))

        (testing "Admins should be able to successfuly delete them"
          (is (= {:status "success"}
                 (mt/user-http-request :crowberto :post 200 url)))
          (testing "FieldValues should be gone"
            (is (not (t2/exists? :model/FieldValues :id (u/the-id field-values))))))))

    (testing "For tables that don't exist, we should return a 404."
      (is (= "Not found."
             (mt/user-http-request :crowberto :post 404 (format "table/%d/discard_values" Integer/MAX_VALUE)))))))

(deftest field-ordering-test
  (let [original-field-order (t2/select-one-fn :field_order :model/Table :id (mt/id :venues))]
    (try
      (testing "Can we set alphabetical field ordering?"
        (is (= ["CATEGORY_ID" "ID" "LATITUDE" "LONGITUDE" "NAME" "PRICE"]
               (->> (mt/user-http-request :crowberto :put 200 (format "table/%s" (mt/id :venues))
                                          {:field_order :alphabetical})
                    :fields
                    (map :name)))))
      (testing "Can we set smart field ordering?"
        (is (= ["ID" "NAME" "CATEGORY_ID" "LATITUDE" "LONGITUDE" "PRICE"]
               (->> (mt/user-http-request :crowberto :put 200 (format "table/%s" (mt/id :venues))
                                          {:field_order :smart})
                    :fields
                    (map :name)))))
      (testing "Can we set database field ordering?"
        (is (= ["ID" "NAME" "CATEGORY_ID" "LATITUDE" "LONGITUDE" "PRICE"]
               (->> (mt/user-http-request :crowberto :put 200 (format "table/%s" (mt/id :venues))
                                          {:field_order :database})
                    :fields
                    (map :name)))))
      (testing "Can we set custom field ordering?"
        (let [custom-field-order [(mt/id :venues :price) (mt/id :venues :longitude) (mt/id :venues :id)
                                  (mt/id :venues :category_id) (mt/id :venues :name) (mt/id :venues :latitude)]]
          (is (=? {:success true}
                  (mt/user-http-request :crowberto :put 200 (format "table/%s/fields/order" (mt/id :venues)) custom-field-order)))
          (is (= custom-field-order
                 (->> (t2/hydrate (t2/select-one :model/Table :id (mt/id :venues)) :fields)
                      :fields
                      (map u/the-id))))))
      (finally (mt/user-http-request :crowberto :put 200 (format "table/%s" (mt/id :venues))
                                     {:field_order original-field-order})))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          POST /api/table/:id/append-csv                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn create-csv! []
  (mt/with-current-user (mt/user->id :rasta)
    (upload-test/create-upload-table!)))

(defn- update-csv! [options]
  (@#'api.table/update-csv! (merge {:filename "test.csv"} options)))

(defn- update-csv-via-api!
  "Upload a small CSV file to the given collection ID. Default args can be overridden"
  [action]
  (let [table (create-csv!)
        file  (upload-test/csv-file-with ["name" "Luke Skywalker" "Darth Vader"] (mt/random-name))]
    (mt/with-current-user (mt/user->id :crowberto)
      (update-csv! {:action   action
                    :table-id (:id table)
                    :file     file}))))

(deftest append-csv-test
  (mt/test-driver :h2
    (mt/with-empty-db
      (testing "Happy path"
        (upload-test/with-uploads-enabled!
          (is (= {:status 200, :body nil}
                 (update-csv-via-api! :metabase.upload/append)))))
      (testing "Failure paths return an appropriate status code and a message in the body"
        (upload-test/with-uploads-disabled!
          (is (= {:status 422, :body {:message "Uploads are not enabled."}}
                 (update-csv-via-api! :metabase.upload/append))))))))

(deftest append-csv-deletes-file-test
  (testing "File gets deleted after appending"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :rasta)
        (mt/with-empty-db
          (let [filename (mt/random-name)
                file (upload-test/csv-file-with ["name" "Luke Skywalker" "Darth Vader"] filename)
                table (upload-test/create-upload-table!)]
            (is (.exists file) "File should exist before append-csv!")
            (mt/with-current-user (mt/user->id :crowberto)
              (update-csv! {:action :metabase.upload/append
                            :table-id (:id table)
                            :file     file}))
            (is (not (.exists file)) "File should be deleted after append-csv!")))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          POST /api/table/:id/replace-csv                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest replace-csv-test
  (mt/test-driver :h2
    (mt/with-empty-db
      (testing "Happy path"
        (upload-test/with-uploads-enabled!
          (is (= {:status 200, :body nil}
                 (update-csv-via-api! :metabase.upload/replace)))))
      (testing "Failure paths return an appropriate status code and a message in the body"
        (upload-test/with-uploads-disabled!
          (is (= {:status 422, :body {:message "Uploads are not enabled."}}
                 (update-csv-via-api! :metabase.upload/replace))))))))

(deftest replace-csv-deletes-file-test
  (testing "File gets deleted after replacing"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :rasta)
        (mt/with-empty-db
          (let [filename (mt/random-name)
                file     (upload-test/csv-file-with ["name" "Luke Skywalker" "Darth Vader"] filename)
                table    (upload-test/create-upload-table!)]
            (is (.exists file) "File should exist before replace-csv!")
            (mt/with-current-user (mt/user->id :crowberto)
              (update-csv! {:action   :metabase.upload/replace
                            :table-id (:id table)
                            :file     file}))
            (is (not (.exists file)) "File should be deleted after replace-csv!")))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          POST /api/table/:id/sync_schema                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest ^:parallel non-admins-cant-trigger-sync-test
  (testing "Non-admins should not be allowed to trigger sync"
    (mt/with-temp [:model/Table table {}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 (format "table/%d/sync_schema" (u/the-id table))))))))

(defn- deliver-when-tbl [promise-to-deliver expected-tbl]
  (fn [tbl]
    (when (= (u/the-id tbl) (u/the-id expected-tbl))
      (deliver promise-to-deliver true))))

(deftest trigger-metadata-sync-for-table-test
  (testing "Can we trigger a metadata sync for a table?"
    (let [sync-called? (promise)
          timeout (* 10 1000)]
      (mt/with-premium-features #{:audit-app}
        (mt/with-temp [:model/Database {db-id :id} {:engine "h2", :details (:details (mt/db))}
                       :model/Table    table       {:db_id db-id :schema "PUBLIC"}]
          (with-redefs [sync/sync-table! (deliver-when-tbl sync-called? table)]
            (mt/user-http-request :crowberto :post 200 (format "table/%d/sync_schema" (u/the-id table))))))
      (testing "sync called?"
        (is (true?
             (deref sync-called? timeout :sync-never-called)))))))

(deftest sync-schema-with-manage-table-metadata-permission-test
  (testing "POST /api/table/:id/sync_schema"
    (testing "User with manage-table-metadata permission can sync table"
      (let [sync-called? (promise)
            timeout (* 10 1000)]
        (mt/with-premium-features #{:audit-app}
          (mt/with-temp [:model/Database {db-id :id} {:engine "h2", :details (:details (mt/db))}
                         :model/Table    table       {:db_id db-id :schema "PUBLIC"}]
            (mt/with-no-data-perms-for-all-users!
              ;; Grant only manage-table-metadata permission for this table
              (data-perms/set-table-permission! (perms-group/all-users) (:id table) :perms/manage-table-metadata :yes)
              (with-redefs [sync/sync-table! (deliver-when-tbl sync-called? table)]
                (mt/user-http-request :rasta :post 200 (format "table/%d/sync_schema" (u/the-id table)))
                (testing "sync called?"
                  (is (true?
                       (deref sync-called? timeout :sync-never-called))))))))))))

(deftest sync-schema-mirror-database-test
  (testing "POST /api/table/:id/sync_schema"
    (testing "Mirror databases (with router_database_id set) return 404"
      (mt/with-temp [:model/Database {source-db-id :id} {:engine "h2", :details (:details (mt/db))}
                     :model/Database {mirror-db-id :id} {:engine "h2"
                                                         :details (:details (mt/db))
                                                         :router_database_id source-db-id}
                     :model/Table    table              {:db_id mirror-db-id :schema "PUBLIC"}]
        (is (= "Not found."
               (mt/user-http-request :crowberto :post 404 (format "table/%d/sync_schema" (u/the-id table)))))))))

(deftest ^:parallel sync-schema-nonexistent-table-test
  (testing "POST /api/table/:id/sync_schema"
    (testing "Non-existent table returns 404"
      (is (= "Not found."
             (mt/user-http-request :crowberto :post 404 (format "table/%d/sync_schema" Integer/MAX_VALUE)))))))

(deftest ^:parallel list-table-filtering-test
  (let [list-tables (fn [& params]
                      (->> (apply mt/user-http-request :crowberto :get 200 "table" params)
                           (filter #(= (:db_id %) (mt/id))) ; prevent stray tables from affecting unit test results
                           (map #(select-keys % [:display_name]))))]
    (testing "term filtering"
      (is (=? [{:display_name "Users"}] (list-tables :term "Use")))
      (testing "wildcard"
        (is (=? [{:display_name "Users"}] (list-tables :term "*S*rs"))))
      (testing "escaping"
        (mt/with-temp [:model/Table _ {:name         "what-a_cool%table\\name"
                                       :display_name "coolest table ever"
                                       :db_id        (mt/id)
                                       :active       true}
                       :model/Table _ {:name         "what_a_cool_table_name"
                                       :display_name "not a cool table"
                                       :db_id        (mt/id)
                                       :active       true}]
          (let [match [{:display_name "coolest table ever"}]
                q     #(list-tables :term %)]
            (is (= match (q "what-a_cool%table\\name")))
            (is (= [] (q "what%a%cool%table%name"))))))
      (testing "display name"
        (mt/with-temp [:model/Table _ {:name         "order_item_discount"
                                       :display_name "Order Item Discount"
                                       :db_id        (mt/id)
                                       :active       true}]
          (let [match [{:display_name "Order Item Discount"}]
                q     #(list-tables :term %)]
            (is (= match (q "Order Item")))
            (is (= match (q "Ite")))
            (is (= match (q "Item Di")))
            (is (= match (q "Ite* Discount")))
            (is (= []    (q "order_item discount")))
            (is (= []    (q "Discount Item")))))))
    (testing "filter composition"
      (mt/with-temp [:model/Table {products2-id :id} {:name         "PrOdUcTs2"
                                                      :display_name "Products2"
                                                      :db_id        (mt/id)
                                                      :active       true}]
        (is (=? [{:display_name "People"}
                 {:display_name "Products"}
                 {:display_name "Products2"}]
                (list-tables :term "P")))

        (mt/user-http-request :crowberto :put 200 (format "table/%d" products2-id) {:data_layer "published"})

        (is (=? [{:display_name "Products2"}]
                (list-tables :term "P" :data-layer "published")))

        (is (=? [{:display_name "People"}
                 {:display_name "Products"}]
                (list-tables :term "P" :data-layer "internal")))))))

(deftest ^:parallel update-table-visibility-sync-test
  (testing "PUT /api/table/:id visibility field synchronization"
    (mt/with-temp [:model/Table table {}]
      (testing "updating visibility_type syncs to data_layer"
        (mt/user-http-request :crowberto :put 200 (format "table/%d" (u/the-id table))
                              {:visibility_type "hidden"})
        (is (= :hidden (t2/select-one-fn :data_layer :model/Table :id (u/the-id table))))
        (is (= :hidden (t2/select-one-fn :visibility_type :model/Table :id (u/the-id table)))))

      (testing "updating data_layer syncs to visibility_type"
        (mt/user-http-request :crowberto :put 200 (format "table/%d" (u/the-id table))
                              {:data_layer "internal"})
        (is (= :internal (t2/select-one-fn :data_layer :model/Table :id (u/the-id table))))
        (is (= nil (t2/select-one-fn :visibility_type :model/Table :id (u/the-id table)))))

      (testing "cannot update both visibility_type and data_layer at once"
        (is (= "Cannot update both visibility_type and data_layer"
               (mt/user-http-request :crowberto :put 400 (format "table/%d" (u/the-id table))
                                     {:visibility_type  "hidden"
                                      :data_layer "hidden"})))))))

;; NOTE: unused-only-filter-test moved to enterprise/backend/test/metabase_enterprise/dependencies/api_test.clj
;; because it depends on EE event handlers to populate the dependency table

(deftest orphan-only-filter-test
  (testing "GET /api/table?orphan-only=true"
    (testing "filters tables that have no owner"
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/User {user-id :id} {:email "owner@example.com"}
                     :model/Table {table-1-id :id} {:db_id db-id
                                                    :name "table_1"
                                                    :active true
                                                    :owner_user_id user-id
                                                    :owner_email "owner@example.com"}
                     :model/Table {table-2-id :id} {:db_id db-id
                                                    :name "table_2"
                                                    :active true
                                                    :owner_user_id nil
                                                    :owner_email nil}]
        (testing "both tables returned without filter"
          (is (= #{table-1-id table-2-id}
                 (->> (mt/user-http-request :crowberto :get 200 "table")
                      (filter #(= (:db_id %) db-id))
                      (map :id)
                      set))))

        (testing "both tables returned with orphan-only=false"
          (is (= #{table-1-id table-2-id}
                 (->> (mt/user-http-request :crowberto :get 200 "table" :orphan-only false)
                      (filter #(= (:db_id %) db-id))
                      (map :id)
                      set))))

        (testing "only table-2 is returned with orphan-only=true"
          (is (= #{table-2-id}
                 (->> (mt/user-http-request :crowberto :get 200 "table" :orphan-only true)
                      (filter #(= (:db_id %) db-id))
                      (map :id)
                      set))))))))

(deftest no-fks-for-missing-tables-test
  (testing "Check that we don't return foreign keys for missing/inactive tables"
    (mt/with-temp-test-data
      [["continent" []
        []]
       ["country" [{:field-name "continent_id", :base-type :type/Integer}]
        []]]
      (let [db (mt/db)
            db-spec (sql-jdbc.conn/db->pooled-connection-spec db)
            get-fk-target #(t2/select-one-fn :fk_target_field_id :model/Field (mt/id :country :continent_id))]
        ;; 1. add FK relationship in the database targeting continent_1
        (jdbc/execute! db-spec "ALTER TABLE country ADD CONSTRAINT country_continent_id_fkey FOREIGN KEY (continent_id) REFERENCES continent(id);")
        (sync/sync-database! db {:scan :schema})
        (testing "initially country's continent_id is targeting continent_1"
          (is (= (mt/id :continent :id)
                 (get-fk-target))))
        (is (= 1 (count (mt/user-http-request :rasta :get 200 (format "table/%d/fks" (mt/id :continent))))))

        ;; 2. drop the country table
        (jdbc/execute! db-spec "DROP TABLE country;")
        (sync/sync-database! db {:scan :schema})

        (is (= () (mt/user-http-request :rasta :get 200 (format "table/%d/fks" (mt/id :continent)))))))))

;;; ---------------------------------------- can-query and can-write filter tests ----------------------------------------

(deftest list-tables-can-query-filter-returns-only-queryable-tables-test
  (testing "can-query=true filters to only queryable tables"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-1-id :id} {:db_id db-id :name "queryable_table" :active true}
                   :model/Table {table-2-id :id} {:db_id db-id :name "not_queryable_table" :active true}
                   :model/PermissionsGroup {pg-id :id :as pg} {}
                   :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id pg-id}]
      (t2/delete! :model/DataPermissions :db_id db-id)
      ;; Block database-level access
      (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
      ;; Grant both view-data and create-queries to table-1 (queryable)
      (data-perms/set-table-permission! pg table-1-id :perms/view-data :unrestricted)
      (data-perms/set-table-permission! pg table-1-id :perms/create-queries :query-builder)
      ;; Grant only view-data to table-2 (not queryable)
      (data-perms/set-table-permission! pg table-2-id :perms/view-data :unrestricted)

      (let [response (->> (mt/user-http-request :rasta :get 200 "table" :can-query true)
                          (filter #(= (:db_id %) db-id)))]
        (is (= 1 (count response)))
        (is (= "queryable_table" (-> response first :name)))))))

(deftest list-tables-can-write-filter-returns-only-editable-tables-test
  (testing "can-write=true filters to only editable tables"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-1-id :id} {:db_id db-id :name "editable_table" :active true}
                   :model/Table _ {:db_id db-id :name "not_editable_table" :active true}
                   :model/PermissionsGroup {pg-id :id :as pg} {}
                   :model/PermissionsGroupMembership _ {:user_id (mt/user->id :crowberto) :group_id pg-id}]
      (t2/delete! :model/DataPermissions :db_id db-id)
      ;; Block database-level access
      (data-perms/set-database-permission! pg db-id :perms/view-data :unrestricted)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :query-builder)
      ;; Grant manage-table-metadata to table-1 only (editable)
      (data-perms/set-table-permission! pg table-1-id :perms/manage-table-metadata :yes)
      ;; table-2 gets no manage-table-metadata (not editable)

      (let [response (->> (mt/user-http-request :crowberto :get 200 "table" :can-write true)
                          (filter #(= (:db_id %) db-id)))]
        ;; crowberto is an admin, so should see all tables when they have manage-table-metadata
        (is (>= (count response) 1))
        (is (contains? (set (map :name response)) "editable_table"))))))

;;; ---------------------------------------- /data endpoint permission tests ----------------------------------------

(deftest get-table-data-endpoint-denies-when-cannot-query-test
  (testing "GET /api/table/:id/data returns 403 when user cannot query the table"
    (mt/dataset test-data
      (let [table-id (mt/id :orders)]
        (mt/with-no-data-perms-for-all-users!
          ;; Grant view-data but NOT create-queries (so can-query is false)
          (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (format "table/%d/data" table-id)))))))))

(deftest get-table-data-endpoint-allows-when-can-query-test
  (testing "GET /api/table/:id/data returns 202 when user can query the table"
    (mt/dataset test-data
      (let [table-id (mt/id :orders)]
        (mt/with-no-data-perms-for-all-users!
          ;; Grant both view-data and create-queries (so can-query is true)
          (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
          (data-perms/set-table-permission! (perms-group/all-users) table-id :perms/create-queries :query-builder)
          (let [response (mt/user-http-request :rasta :get 202 (format "table/%d/data" table-id))]
            (is (map? response))))))))
