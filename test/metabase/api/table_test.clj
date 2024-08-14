(ns metabase.api.table-test
  "Tests for /api/table endpoints."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.api.table :as api.table]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.http-client :as client]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models :refer [Card Database Field FieldValues Table]]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.server.request.util :as req.util]
   [metabase.test :as mt]
   [metabase.timeseries-query-processor-test.util :as tqpt]
   [metabase.upload-test :as upload-test]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

;; ## /api/org/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(deftest ^:parallel unauthenticated-test
  (is (= (get req.util/response-unauthentic :body)
         (client/client :get 401 "table")))
  (is (= (get req.util/response-unauthentic :body)
         (client/client :get 401 (format "table/%d" (mt/id :users))))))

(defn- db-details []
  (merge
   (select-keys (mt/db) [:id :created_at :updated_at :timezone :creator_id :initial_sync_status :dbms_version
                         :cache_field_values_schedule :metadata_sync_schedule :uploads_enabled :uploads_schema_name
                         :uploads_table_prefix])
   {:engine                      "h2"
    :name                        "test-data (h2)"
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
    :is_audit                    false}))

(defn- table-defaults []
  (merge
   (mt/object-defaults Table)
   {:db          (db-details)
    :db_id       (mt/id)
    :entity_type "entity/GenericTable"
    :field_order "database"
    :view_count  0
    :metrics     []
    :segments    []}))

(defn- field-defaults []
  (merge
   (mt/object-defaults Field)
   {:default_dimension_option nil
    :database_indexed         false
    :dimension_options        []
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
     :database_required :database_is_auto_increment])))

(defn- fk-field-details [field]
  (-> (field-details field)
      (dissoc :dimension_options :default_dimension_option)))

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

(deftest ^:parallel list-table-test-2
  (testing "GET /api/table"
    (testing "Schema is \"\" rather than nil, if not set"
      (mt/with-temp [Database {database-id :id} {}
                     Table    {}                {:db_id        database-id
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
            (dissoc (table-defaults) :segments :field_values :metrics)
            (t2/hydrate (t2/select-one [Table :id :created_at :updated_at :initial_sync_status :view_count]
                                       :id (mt/id :venues))
                        :pk_field)
            {:schema       "PUBLIC"
             :name         "VENUES"
             :display_name "Venues"
             :db_id        (mt/id)})
           (mt/user-http-request :rasta :get 200 (format "table/%d" (mt/id :venues)))))))

(deftest ^:parallel get-table-test-2
  (testing "GET /api/table/:id"
    (testing " returns schema as \"\" not nil"
      (mt/with-temp [Database {database-id :id} {}
                     Table    {table-id :id}    {:db_id        database-id
                                                 :name         "schemaless_table"
                                                 :display_name "Schemaless"
                                                 :entity_type  "entity/GenericTable"
                                                 :schema       nil}]
        (is (= (merge
                 (dissoc (table-defaults) :segments :field_values :metrics :db)
                 (t2/hydrate (t2/select-one [Table :id :created_at :updated_at :initial_sync_status :view_count]
                                            :id table-id)
                             :pk_field)
                 {:schema       ""
                  :name         "schemaless_table"
                  :display_name "Schemaless"
                  :db_id        database-id})
               (dissoc (mt/user-http-request :rasta :get 200 (str "table/" table-id))
                       :db)))))))

(deftest get-table-test-3
  (testing "GET /api/table/:id"
    (testing " should return a 403 for a user that doesn't have read permissions for the table"
      (mt/with-temp [Database {database-id :id} {}
                     Table    {table-id :id}    {:db_id database-id}]
        (mt/with-no-data-perms-for-all-users!
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (str "table/" table-id)))))))))

(defn- default-dimension-options []
  (as-> @#'api.table/dimension-options-for-response options
    (m/map-vals #(-> %
                     (update :name str)
                     (update :type
                             (fn [t]
                               (apply str
                                      ((juxt namespace (constantly "/") name) t)))))
                options)
    (m/map-keys #(Long/parseLong %) options)
    ;; since we're comparing API responses, need to de-keywordize the `:field` clauses
    (lib.util.match/replace options :field (mt/obj->json->obj &match))))

(defn- query-metadata-defaults []
  (-> (table-defaults)
      (assoc :dimension_options (default-dimension-options))))

(deftest ^:parallel sensitive-fields-included-test
  (testing "GET api/table/:id/query_metadata?include_sensitive_fields"
    (testing "Sensitive fields are included"
      (is (= (merge
              (query-metadata-defaults)
              (t2/select-one [Table :created_at :updated_at :initial_sync_status :view_count] :id (mt/id :users))
              {:schema       "PUBLIC"
               :name         "USERS"
               :display_name "Users"
               :entity_type  "entity/UserTable"
               :fields       [(assoc (field-details (t2/select-one Field :id (mt/id :users :id)))
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
                                     :database_indexed           true
                                     :database_is_auto_increment true
                                     :name_field                 {:base_type "type/Text",
                                                                  :display_name "Name",
                                                                  :fk_target_field_id nil,
                                                                  :has_field_values "list",
                                                                  :id (mt/id :users :name),
                                                                  :name "NAME",
                                                                  :semantic_type "type/Name",
                                                                  :table_id (mt/id :users)})
                              (assoc (field-details (t2/select-one Field :id (mt/id :users :name)))
                                     :semantic_type              "type/Name"
                                     :table_id                   (mt/id :users)
                                     :name                       "NAME"
                                     :display_name               "Name"
                                     :database_type              "CHARACTER VARYING"
                                     :base_type                  "type/Text"
                                     :effective_type             "type/Text"
                                     :visibility_type            "normal"
                                     :dimension_options          []
                                     :default_dimension_option   nil
                                     :has_field_values           "list"
                                     :position                   1
                                     :database_position          1
                                     :database_required          false
                                     :database_is_auto_increment false
                                     :name_field                 nil)
                              (assoc (field-details (t2/select-one Field :id (mt/id :users :last_login)))
                                     :table_id                   (mt/id :users)
                                     :name                       "LAST_LOGIN"
                                     :display_name               "Last Login"
                                     :database_type              "TIMESTAMP"
                                     :base_type                  "type/DateTime"
                                     :effective_type             "type/DateTime"
                                     :visibility_type            "normal"
                                     :dimension_options          (var-get #'api.table/datetime-dimension-indexes)
                                     :default_dimension_option   (var-get #'api.table/datetime-default-index)
                                     :has_field_values           "none"
                                     :position                   2
                                     :database_position          2
                                     :database_required          false
                                     :database_is_auto_increment false
                                     :name_field                 nil)
                              (assoc (field-details (t2/select-one Field :table_id (mt/id :users), :name "PASSWORD"))
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
          "Make sure that getting the User table *does* include info about the password field, but not actual values themselves"))))

(deftest ^:parallel sensitive-fields-not-included-test
  (testing "GET api/table/:id/query_metadata"
    (testing "Sensitive fields should not be included"
      (is (= (merge
              (query-metadata-defaults)
              (t2/select-one [Table :created_at :updated_at :initial_sync_status :view_count] :id (mt/id :users))
              {:schema       "PUBLIC"
               :name         "USERS"
               :display_name "Users"
               :entity_type  "entity/UserTable"
               :fields       [(assoc (field-details (t2/select-one Field :id (mt/id :users :id)))
                                     :table_id         (mt/id :users)
                                     :semantic_type    "type/PK"
                                     :name             "ID"
                                     :display_name     "ID"
                                     :database_type    "BIGINT"
                                     :base_type        "type/BigInteger"
                                     :effective_type   "type/BigInteger"
                                     :has_field_values "none"
                                     :database_indexed  true
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
                              (assoc (field-details (t2/select-one Field :id (mt/id :users :name)))
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
                              (assoc (field-details (t2/select-one Field :id (mt/id :users :last_login)))
                                     :table_id                 (mt/id :users)
                                     :name                     "LAST_LOGIN"
                                     :display_name             "Last Login"
                                     :database_type            "TIMESTAMP"
                                     :base_type                "type/DateTime"
                                     :effective_type           "type/DateTime"
                                     :dimension_options        (var-get #'api.table/datetime-dimension-indexes)
                                     :default_dimension_option (var-get #'api.table/datetime-default-index)
                                     :has_field_values         "none"
                                     :position                 2
                                     :database_position        2
                                     :database_required        false
                                     :database_is_auto_increment false
                                     :name_field               nil)]
               :id           (mt/id :users)})
             (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (mt/id :users))))
          "Make sure that getting the User table does *not* include password info"))))

(deftest fk-target-permissions-test
  (testing "GET /api/table/:id/query_metadata"
    (testing (str "Check that FK fields belonging to Tables we don't have permissions for don't come back as hydrated "
                  "`:target`(#3867)")
      ;; create a temp DB with two tables; table-2 has an FK to table-1
      (mt/with-temp [Database db          {}
                     Table    table-1     {:db_id (u/the-id db)}
                     Table    table-2     {:db_id (u/the-id db)}
                     Field    table-1-id  {:table_id (u/the-id table-1), :name "id", :base_type :type/Integer, :semantic_type :type/PK}
                     Field    _table-2-id {:table_id (u/the-id table-2), :name "id", :base_type :type/Integer, :semantic_type :type/PK}
                     Field    _table-2-fk {:table_id (u/the-id table-2), :name "fk", :base_type :type/Integer, :semantic_type :type/FK, :fk_target_field_id (u/the-id table-1-id)}]
        (mt/with-no-data-perms-for-all-users!
          ;; grant permissions only to table-2
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
    (t2.with-temp/with-temp [Table table]
      (mt/user-http-request :crowberto :put 200 (format "table/%d" (u/the-id table))
                            {:display_name    "Userz"
                             :visibility_type "hidden"
                             :description     "What a nice table!"})
      (is (= (merge
              (-> (table-defaults)
                  (dissoc :segments :field_values :metrics :updated_at)
                  (update :db merge (select-keys (mt/db) [:details])))
              (t2/hydrate (t2/select-one [Table :id :schema :name :created_at :initial_sync_status] :id (u/the-id table)) :pk_field)
              {:description     "What a nice table!"
               :entity_type     nil
               :schema          ""
               :visibility_type "hidden"
               :display_name    "Userz"})
             (dissoc (mt/user-http-request :crowberto :get 200 (format "table/%d" (u/the-id table)))
                     :updated_at))))))

(deftest ^:parallel update-table-test-2
  (testing "PUT /api/table/:id"
    (testing "Can update description, caveat, points of interest to be empty (#11097)"
      (doseq [property [:caveats :points_of_interest :description]]
        (t2.with-temp/with-temp [Table table]
          (is (= ""
                 (get (mt/user-http-request :crowberto :put 200 (format "table/%d" (u/the-id table))
                                            {property ""})
                      property))))))))

(deftest ^:parallel update-table-test-3
  (testing "PUT /api/table/:id"
    (testing "Don't change visibility_type when updating properties (#22287)"
      (doseq [property [:caveats :points_of_interest :description :display_name]]
        (t2.with-temp/with-temp [Table table {:visibility_type "hidden"}]
          (mt/user-http-request :crowberto :put 200 (format "table/%d" (u/the-id table))
                                {property (mt/random-name)})
          (is (= :hidden (t2/select-one-fn :visibility_type Table :id (:id table)))))))))

(deftest ^:parallel update-table-test-4
  (testing "PUT /api/table/:id"
    (testing "A table can only be updated by a superuser"
      (t2.with-temp/with-temp [Table table]
        (mt/user-http-request :rasta :put 403 (format "table/%d" (u/the-id table)) {:display_name "Userz"})))))

;; see how many times sync-table! gets called when we call the PUT endpoint. It should happen when you switch from
;; hidden -> not hidden at the spots marked below, twice total
(deftest update-table-sync-test
  (testing "PUT /api/table/:id"
    (testing "Table should get synced when it gets unhidden"
      (t2.with-temp/with-temp [Database db    {:details (:details (mt/db))}
                               Table    table (-> (t2/select-one :model/Table (mt/id :venues))
                                                  (dissoc :id)
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
      (mt/with-temp [Table {id-1 :id} {}
                     Table {id-2 :id} {:visibility_type "hidden"}]
        (with-redefs [api.table/sync-unhidden-tables (fn [unhidden] (reset! unhidden-ids (set (map :id unhidden))))]
          (letfn [(set-many-vis! [ids state]
                    (reset! unhidden-ids #{})
                    (testing (format "Set visibility type => %s" (pr-str state))
                      (mt/user-http-request :crowberto :put 200 "table/"
                                            {:ids ids :visibility_type state})))]
            (set-many-vis! [id-1 id-2] nil) ;; unhides only 2
            (is (= @unhidden-ids #{id-2}))

            (set-many-vis! [id-1 id-2] "hidden")
            (is (= @unhidden-ids #{})) ;; no syncing when they are hidden

            (set-many-vis! [id-1 id-2] nil) ;; both are made unhidden so both synced
            (is (= @unhidden-ids #{id-1 id-2}))))))))

(deftest ^:parallel get-fks-test
  (testing "GET /api/table/:id/fks"
    (testing "We expect a single FK from CHECKINS.USER_ID -> USERS.ID"
      (let [checkins-user-field (t2/select-one Field :id (mt/id :checkins :user_id))
            users-id-field      (t2/select-one Field :id (mt/id :users :id))]
        (is (= [{:origin_id      (:id checkins-user-field)
                 :destination_id (:id users-id-field)
                 :relationship   "Mt1"
                 :origin         (-> (fk-field-details checkins-user-field)
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
                                            :database_indexed  true
                                            :table         (merge
                                                            (dissoc (table-defaults) :segments :field_values :metrics)
                                                            (t2/select-one [Table
                                                                            :id :created_at :updated_at
                                                                            :initial_sync_status :view_count]
                                                              :id (mt/id :checkins))
                                                            {:schema       "PUBLIC"
                                                             :name         "CHECKINS"
                                                             :display_name "Checkins"
                                                             :entity_type  "entity/EventTable"})))
                 :destination    (-> (fk-field-details users-id-field)
                                     (dissoc :target :dimensions :values)
                                     (assoc :table_id         (mt/id :users)
                                            :name             "ID"
                                            :display_name     "ID"
                                            :base_type        "type/BigInteger"
                                            :effective_type   "type/BigInteger"
                                            :database_type    "BIGINT"
                                            :semantic_type    "type/PK"
                                            :database_indexed true
                                            :table            (merge
                                                               (dissoc (table-defaults) :db :segments :field_values :metrics)
                                                               (t2/select-one [Table
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
  (testing "GET /api/table/:id/query_metadata"
    (is (= (merge
            (query-metadata-defaults)
            (t2/select-one [Table :created_at :updated_at :initial_sync_status] :id (mt/id :categories))
            {:schema       "PUBLIC"
             :name         "CATEGORIES"
             :display_name "Categories"
             :fields       [(merge
                             (field-details (t2/select-one Field :id (mt/id :categories :id)))
                             {:table_id          (mt/id :categories)
                              :semantic_type     "type/PK"
                              :name              "ID"
                              :display_name      "ID"
                              :database_type     "BIGINT"
                              :base_type         "type/BigInteger"
                              :effective_type    "type/BigInteger"
                              :has_field_values  "none"
                              :database_required false
                              :database_indexed  true
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
                             (field-details (t2/select-one Field :id (mt/id :categories :name)))
                             {:table_id                   (mt/id :categories)
                              :semantic_type              "type/Name"
                              :name                       "NAME"
                              :display_name               "Name"
                              :database_type              "CHARACTER VARYING"
                              :base_type                  "type/Text"
                              :effective_type             "type/Text"
                              :dimension_options          []
                              :default_dimension_option   nil
                              :has_field_values           "list"
                              :database_position          1
                              :position                   1
                              :database_required          true
                              :database_is_auto_increment false
                              :name_field                 nil})]
             :id           (mt/id :categories)})
           (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (mt/id :categories)))))))

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

(defn- with-field-literal-id [{field-name :name, base-type :base_type :as field}]
  (assoc field :id ["field" field-name {:base-type base-type}]))

(defn- default-card-field-for-venues [table-id]
  {:table_id                 table-id
   :semantic_type            nil
   :default_dimension_option nil
   :dimension_options        []})

(defn- with-numeric-dimension-options [field]
  (assoc field
    :default_dimension_option (var-get #'api.table/numeric-default-index)
    :dimension_options (var-get #'api.table/numeric-dimension-indexes)))

(defn- with-coordinate-dimension-options [field]
  (assoc field
    :default_dimension_option (var-get #'api.table/coordinate-default-index)
    :dimension_options (var-get #'api.table/coordinate-dimension-indexes)))

;; Make sure metadata for 'virtual' tables comes back as expected
(deftest ^:parallel virtual-table-metadata-test
  (testing "GET /api/table/:id/query_metadata"
    (testing "Make sure metadata for 'virtual' tables comes back as expected"
      (t2.with-temp/with-temp [Card card {:name          "Go Dubs!"
                                          :database_id   (mt/id)
                                          :dataset_query {:database (mt/id)
                                                          :type     :native
                                                          :native   {:query (format "SELECT NAME, ID, PRICE, LATITUDE FROM VENUES")}}}]
        ;; run the Card which will populate its result_metadata column
        (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (u/the-id card)))
        ;; Now fetch the metadata for this "table"
        (is (= (let [card-virtual-table-id (str "card__" (u/the-id card))]
                 {:display_name      "Go Dubs!"
                  :schema            "Everything else"
                  :db_id             (:database_id card)
                  :id                card-virtual-table-id
                  :type              "question"
                  :moderated_status  nil
                  :metrics           nil
                  :description       nil
                  :dimension_options (default-dimension-options)
                  :fields            (map (comp #(merge (default-card-field-for-venues card-virtual-table-id) %)
                                                with-field-literal-id)
                                          (let [id->fingerprint   (t2/select-pk->fn :fingerprint Field :table_id (mt/id :venues))
                                                name->fingerprint (comp id->fingerprint (partial mt/id :venues))]
                                            [{:name           "NAME"
                                              :display_name   "NAME"
                                              :base_type      "type/Text"
                                              :effective_type "type/Text"
                                              :semantic_type  "type/Name"
                                              :fingerprint    (name->fingerprint :name)
                                              :field_ref      ["field" "NAME" {:base-type "type/Text"}]}
                                             {:name           "ID"
                                              :display_name   "ID"
                                              :base_type      "type/BigInteger"
                                              :effective_type "type/BigInteger"
                                              :semantic_type  nil
                                              :fingerprint    (name->fingerprint :id)
                                              :field_ref      ["field" "ID" {:base-type "type/BigInteger"}]}
                                             (with-numeric-dimension-options
                                               {:name           "PRICE"
                                                :display_name   "PRICE"
                                                :base_type      "type/Integer"
                                                :effective_type "type/Integer"
                                                :semantic_type  nil
                                                :fingerprint    (name->fingerprint :price)
                                                :field_ref      ["field" "PRICE" {:base-type "type/Integer"}]})
                                             (with-coordinate-dimension-options
                                               {:name           "LATITUDE"
                                                :display_name   "LATITUDE"
                                                :base_type      "type/Float"
                                                :effective_type "type/Float"
                                                :semantic_type  "type/Latitude"
                                                :fingerprint    (name->fingerprint :latitude)
                                                :field_ref      ["field" "LATITUDE" {:base-type "type/Float"}]})]))})
               (->> card
                    u/the-id
                    (format "table/card__%d/query_metadata")
                    (mt/user-http-request :crowberto :get 200))))))))

(deftest ^:parallel include-date-dimensions-in-nested-query-test
  (testing "GET /api/table/:id/query_metadata"
    (testing "Test date dimensions being included with a nested query"
      (t2.with-temp/with-temp [Card card {:name          "Users"
                                          :database_id   (mt/id)
                                          :dataset_query {:database (mt/id)
                                                          :type     :native
                                                          :native   {:query (format "SELECT NAME, LAST_LOGIN FROM USERS")}}}]
        (let [card-virtual-table-id (str "card__" (u/the-id card))]
          ;; run the Card which will populate its result_metadata column
          (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (u/the-id card)))
          ;; Now fetch the metadata for this "table" via the API
          (let [[name-metadata last-login-metadata] (t2/select-one-fn :result_metadata Card :id (u/the-id card))]
            (is (= {:display_name      "Users"
                    :schema            "Everything else"
                    :db_id             (:database_id card)
                    :id                card-virtual-table-id
                    :type              "question"
                    :description       nil
                    :moderated_status  nil
                    :metrics           nil
                    :dimension_options (default-dimension-options)
                    :fields            [{:name                     "NAME"
                                         :display_name             "NAME"
                                         :base_type                "type/Text"
                                         :effective_type           "type/Text"
                                         :table_id                 card-virtual-table-id
                                         :id                       ["field" "NAME" {:base-type "type/Text"}]
                                         :semantic_type            "type/Name"
                                         :default_dimension_option nil
                                         :dimension_options        []
                                         :fingerprint              (:fingerprint name-metadata)
                                         :field_ref                ["field" "NAME" {:base-type "type/Text"}]}
                                        {:name                     "LAST_LOGIN"
                                         :display_name             "LAST_LOGIN"
                                         :base_type                "type/DateTime"
                                         :effective_type           "type/DateTime"
                                         :table_id                 card-virtual-table-id
                                         :id                       ["field" "LAST_LOGIN" {:base-type "type/DateTime"}]
                                         :semantic_type            nil
                                         :default_dimension_option (var-get #'api.table/datetime-default-index)
                                         :dimension_options        (var-get #'api.table/datetime-dimension-indexes)
                                         :fingerprint              (:fingerprint last-login-metadata)
                                         :field_ref                ["field" "LAST_LOGIN" {:base-type "type/DateTime"}]}]}
                   (mt/user-http-request :crowberto :get 200
                                         (format "table/card__%d/query_metadata" (u/the-id card)))))))))))

(deftest ^:parallel include-metrics-for-card-test
  (testing "GET /api/table/:id/query_metadata"
    (testing "Test metrics being included with cards"
      (t2.with-temp/with-temp [Card model {:name          "Venues model"
                                           :database_id   (mt/id)
                                           :type          :model
                                           :dataset_query (mt/mbql-query venues)}]
        (let [card-virtual-table-id (str "card__" (:id model))
              metric-query {:database 2
                            :type "query"
                            :query {:source-table card-virtual-table-id
                                    :aggregation [["count"]]}}]
          (t2.with-temp/with-temp [Card metric {:name          "Venues metric"
                                                :database_id   (mt/id)
                                                :type          :metric
                                                :dataset_query metric-query}]
            (is (=? {:display_name      "Venues model"
                     :db_id             (mt/id)
                     :id                card-virtual-table-id
                     :type              "model"
                     :metrics [{:source_card_id (:id model)
                                :table_id (:table_id model)
                                :database_id (mt/id)
                                :name "Venues metric"
                                :type "metric"
                                :dataset_query metric-query
                                :id (:id metric)}]}
                    (mt/user-http-request :crowberto :get 200
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
  (mt/with-temp-vals-in-db Field (mt/id :venues :category_id) {:semantic_type semantic-type}
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

(deftest ^:parallel dimension-options-sort-test
  (testing "Ensure dimensions options are sorted numerically, but returned as strings"
    (testing "datetime indexes"
      (is (= (map str (sort (map #(Long/parseLong %) (var-get #'api.table/datetime-dimension-indexes))))
             (var-get #'api.table/datetime-dimension-indexes))))
    (testing "numeric indexes"
      (is (= (map str (sort (map #(Long/parseLong %) (var-get #'api.table/numeric-dimension-indexes))))
             (var-get #'api.table/numeric-dimension-indexes))))))

(defn field-from-response [response, ^String field-name]
  (->> response
       :fields
       (m/find-first #(.equalsIgnoreCase field-name, ^String (:name %)))))

(defn- dimension-options-for-field [response, ^String field-name]
  (:dimension_options (field-from-response response field-name)))

(defn- extract-dimension-options
  "For the given `field-name` find it's dimension_options following the indexes given in the field"
  [response field-name]
  (set
   (for [dim-index (dimension-options-for-field response field-name)
         :let [{clause :mbql} (get-in response [:dimension_options (Long/parseLong dim-index)])]]
     clause)))

(deftest ^:parallel numeric-binning-options-test
  (testing "GET /api/table/:id/query_metadata"
    (testing "binning options for numeric fields"
      (testing "Lat/Long fields should use bin-width rather than num-bins"
        (let [response (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (mt/id :venues)))]
          (is (= #{nil
                   ["field" nil {:binning {:strategy "bin-width", :bin-width 10.0}}]
                   ["field" nil {:binning {:strategy "bin-width", :bin-width 0.1}}]
                   ["field" nil {:binning {:strategy "bin-width", :bin-width 1.0}}]
                   ["field" nil {:binning {:strategy "bin-width", :bin-width 20.0}}]
                   ["field" nil {:binning {:strategy "default"}}]}
                 (extract-dimension-options response "latitude"))))))))

(deftest numeric-binning-options-test-2
  (testing "GET /api/table/:id/query_metadata"
    (testing "binning options for numeric fields"
      (testing "Number columns without a semantic type should use \"num-bins\""
        (mt/with-temp-vals-in-db Field (mt/id :venues :price) {:semantic_type nil}
          (let [response (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (mt/id :venues)))]
            (is (= #{nil
                     ["field" nil {:binning {:strategy "num-bins", :num-bins 50}}]
                     ["field" nil {:binning {:strategy "default"}}]
                     ["field" nil {:binning {:strategy "num-bins", :num-bins 100}}]
                     ["field" nil {:binning {:strategy "num-bins", :num-bins 10}}]}
                   (extract-dimension-options response "price")))))))))

(deftest numeric-binning-options-test-3
  (testing "GET /api/table/:id/query_metadata"
    (testing "binning options for numeric fields"
      (testing "Number columns with a relationship semantic type should not have binning options"
        (mt/with-temp-vals-in-db Field (mt/id :venues :price) {:semantic_type "type/PK"}
          (let [response (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (mt/id :venues)))]
            (is (= #{}
                   (extract-dimension-options response "price")))))))))

(deftest numeric-binning-options-test-4
  (testing "GET /api/table/:id/query_metadata"
    (testing "binning options for numeric fields"
      (testing "Numeric fields without min/max values should not have binning options"
        (let [fingerprint      (t2/select-one-fn :fingerprint Field :id (mt/id :venues :latitude))
              temp-fingerprint (-> fingerprint
                                   (assoc-in [:type :type/Number :max] nil)
                                   (assoc-in [:type :type/Number :min] nil))]
          (mt/with-temp-vals-in-db Field (mt/id :venues :latitude) {:fingerprint temp-fingerprint}
            (is (= []
                   (-> (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (mt/id :categories)))
                       (get :fields)
                       first
                       :dimension_options)))))))))

(deftest ^:parallel datetime-binning-options-test
  (testing "GET /api/table/:id/query_metadata"
    (testing "binning options for datetime fields"
      (testing "should show up whether the backend supports binning of numeric values or not"
        (mt/test-drivers #{:druid}
          (tqpt/with-flattened-dbdef
            (let [response (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (mt/id :checkins)))]
              (is (= @#'api.table/datetime-dimension-indexes
                     (dimension-options-for-field response "timestamp"))))))))))

(deftest ^:parallel datetime-binning-options-test-2
  (testing "GET /api/table/:id/query_metadata"
    (testing "binning options for datetime fields"
      (testing "dates"
        (mt/test-drivers (mt/normal-drivers)
          (let [response (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (mt/id :checkins)))
                field    (field-from-response response "date")]
            ;; some dbs don't have a date type and return a datetime
            (is (= (case (:effective_type field)
                     ("type/DateTime" "type/Instant") @#'api.table/datetime-dimension-indexes
                     "type/Date"                      @#'api.table/date-dimension-indexes
                     (throw (ex-info "Invalid type for date field or field not found"
                                     {:expected-types #{"type/DateTime" "type/Date"}
                                      :found          (:effective_type field)
                                      :field          field
                                      :driver         driver/*driver*})))
                   (:dimension_options field)))))))))

(deftest ^:parallel datetime-binning-options-test-3
  (testing "GET /api/table/:id/query_metadata"
    (testing "binning options for datetime fields"
      (testing "unix timestamps"
        (mt/dataset sad-toucan-incidents
          (let [response (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (mt/id :incidents)))]
            (is (= @#'api.table/datetime-dimension-indexes
                   (dimension-options-for-field response "timestamp")))))))))

(deftest ^:parallel datetime-binning-options-test-4
  (testing "GET /api/table/:id/query_metadata"
    (testing "binning options for datetime fields"
      (testing "time columns"
        (mt/test-drivers (filter mt/supports-time-type? (mt/normal-drivers))
          (mt/dataset time-test-data
            (let [response (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (mt/id :users)))]
              (is (= @#'api.table/time-dimension-indexes
                     (dimension-options-for-field response "last_login_time"))))))))))

(deftest nested-queries-binning-options-test
  (testing "GET /api/table/:id/query_metadata"
    (testing "binning options for nested queries"
      (mt/test-drivers (mt/normal-drivers-with-feature :binning :nested-queries)
        (t2.with-temp/with-temp [Card card {:database_id   (mt/id)
                                            :dataset_query {:database (mt/id)
                                                            :type    :query
                                                            :query    {:source-query {:source-table (mt/id :venues)}}}}]
          (letfn [(dimension-options []
                    (let [response (mt/user-http-request :crowberto :get 200 (format "table/card__%d/query_metadata" (u/the-id card)))]
                      (map #(dimension-options-for-field response %) ["latitude" "longitude"])))]
            (testing "Nested queries missing a fingerprint/results metadata should not show binning-options"
              (mt/with-temp-vals-in-db Card (:id card) {:result_metadata nil}
                ;; By default result_metadata will be nil (and no fingerprint). Just asking for query_metadata after the
                ;; card was created but before it was ran should not allow binning
                (is (= [nil nil]
                       (dimension-options)))))
            (testing "Nested queries with a fingerprint should have dimension options for binning"
              ;; run the Card which will populate its result_metadata column
              (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (u/the-id card)))
              (mt/user-http-request :crowberto :get 200 (format "table/card__%d/query_metadata" (u/the-id card)))
              (is (= (repeat 2 (var-get #'api.table/coordinate-dimension-indexes))
                     (dimension-options))))))))))

(deftest ^:parallel card-type-and-dataset-query-are-returned-with-metadata
  (testing "GET /api/table/card__:id/query_metadata returns card type"
    (let [dataset-query (mt/mbql-query venues
                          {:aggregation  [:sum $price]
                           :filter       [:> $price 1]
                           :source-table $$venues})
          base-card     {:database_id   (mt/id)
                         :dataset_query dataset-query}]
      (t2.with-temp/with-temp [Card question base-card
                               Card model    (assoc base-card :type :model)
                               Card metric   (assoc base-card :type :metric)]
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
    (mt/with-temp [Table       table        {}
                   Field       field        {:table_id (u/the-id table)}
                   FieldValues field-values {:field_id (u/the-id field) :values ["A" "B" "C"]}]
      (let [url (format "table/%d/discard_values" (u/the-id table))]
        (testing "Non-admin toucans should not be allowed to discard values"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 url)))
          (testing "FieldValues should still exist"
            (is (t2/exists? FieldValues :id (u/the-id field-values)))))

        (testing "Admins should be able to successfuly delete them"
          (is (= {:status "success"}
                 (mt/user-http-request :crowberto :post 200 url)))
          (testing "FieldValues should be gone"
            (is (not (t2/exists? FieldValues :id (u/the-id field-values))))))))

    (testing "For tables that don't exist, we should return a 404."
      (is (= "Not found."
             (mt/user-http-request :crowberto :post 404 (format "table/%d/discard_values" Integer/MAX_VALUE)))))))

(deftest field-ordering-test
  (let [original-field-order (t2/select-one-fn :field_order Table :id (mt/id :venues))]
    (try
      (testing "Cane we set alphabetical field ordering?"
        (is (= ["CATEGORY_ID" "ID" "LATITUDE" "LONGITUDE" "NAME" "PRICE"]
               (->> (mt/user-http-request :crowberto :put 200 (format "table/%s" (mt/id :venues))
                                          {:field_order :alphabetical})
                    :fields
                    (map :name)))))
      (testing "Cane we set smart field ordering?"
        (is (= ["ID" "NAME" "CATEGORY_ID" "LATITUDE" "LONGITUDE" "PRICE"]
               (->> (mt/user-http-request :crowberto :put 200 (format "table/%s" (mt/id :venues))
                                          {:field_order :smart})
                    :fields
                    (map :name)))))
      (testing "Cane we set database field ordering?"
        (is (= ["ID" "NAME" "CATEGORY_ID" "LATITUDE" "LONGITUDE" "PRICE"]
               (->> (mt/user-http-request :crowberto :put 200 (format "table/%s" (mt/id :venues))
                                          {:field_order :database})
                    :fields
                    (map :name)))))
      (testing "Can we set custom field ordering?"
        (let [custom-field-order [(mt/id :venues :price) (mt/id :venues :longitude) (mt/id :venues :id)
                                  (mt/id :venues :category_id) (mt/id :venues :name) (mt/id :venues :latitude)]]
          (mt/user-http-request :crowberto :put 200 (format "table/%s/fields/order" (mt/id :venues)) custom-field-order)
          (is (= custom-field-order
                 (->> (t2/hydrate (t2/select-one Table :id (mt/id :venues)) :fields)
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
