(ns metabase.api.database-test
  "Tests for /api/database endpoints."
  (:require [clojure.test :refer :all]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [models :refer [Card Collection Database Field FieldValues Table]]
             [test :as mt]
             [util :as u]]
            [metabase.api
             [database :as database-api]
             [table :as table-api]]
            [metabase.driver.util :as driver.u]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models
             [permissions :as perms]
             [permissions-group :as perms-group]]
            [metabase.sync
             [analyze :as analyze]
             [field-values :as field-values]
             [sync-metadata :as sync-metadata]]
            [metabase.test
             [fixtures :as fixtures]
             [util :as tu]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :as hydrate]]))

(use-fixtures :once (fixtures/initialize :db :plugins))

;; HELPER FNS

(driver/register! ::test-driver
  :parent :sql-jdbc
  :abstract? true)

(defmethod driver/connection-properties ::test-driver
  [_]
  nil)

(defmethod driver/can-connect? ::test-driver
  [_ _]
  true)

(defn- db-details
  "Return default column values for a database (either the test database, via `(mt/db)`, or optionally passed in)."
  ([]
   (db-details (mt/db)))

  ([{driver :engine, :as db}]
   (merge
    (mt/object-defaults Database)
    (select-keys db [:created_at :id :details :updated_at :timezone :name])
    {:engine   (u/qualified-name (:engine db))
     :features (map u/qualified-name (driver.u/features driver))})))

(defn- table-details [table]
  (-> (merge (mt/obj->json->obj (mt/object-defaults Table))
             (select-keys table [:active :created_at :db_id :description :display_name :entity_name :entity_type
                                 :id :name :rows :schema :updated_at :visibility_type]))
      (update :entity_type #(when % (str "entity/" (name %))))
      (update :visibility_type #(when % (name %)))))

(defn- expected-tables [db-or-id]
  (map table-details (db/select Table
                       :db_id (u/get-id db-or-id), :active true
                       {:order-by [[:%lower.schema :asc] [:%lower.display_name :asc]]})))

(defn- field-details [field]
  (mt/derecordize
   (merge
    (mt/object-defaults Field)
    {:target nil}
    (select-keys
     field
     [:updated_at :id :created_at :last_analyzed :fingerprint :fingerprint_version :fk_target_field_id :position]))))

(defn- add-schedules [db]
  (assoc db :schedules {:cache_field_values {:schedule_day   nil
                                             :schedule_frame nil
                                             :schedule_hour  0
                                             :schedule_type  "daily"}
                        :metadata_sync      {:schedule_day   nil
                                             :schedule_frame nil
                                             :schedule_hour  nil
                                             :schedule_type  "hourly"}}))

(deftest get-database-test
  (testing "GET /api/database/:id"
    (testing "DB details visibility"
      (testing "Regular users should not see DB details"
        (is (= (add-schedules (dissoc (db-details) :details))
               ((mt/user->client :rasta) :get 200 (format "database/%d" (mt/id))))))

      (testing "Superusers should see DB details"
        (is (= (add-schedules (db-details))
               ((mt/user->client :crowberto) :get 200 (format "database/%d" (mt/id)))))))

    (mt/with-temp* [Database [db {:name "My DB", :engine ::test-driver}]
                    Table    [t1 {:name "Table 1", :db_id (:id db)}]
                    Table    [t2 {:name "Table 2", :db_id (:id db)}]
                    Table    [t3 {:name "Table 3", :db_id (:id db), :visibility_type "hidden"}]
                    Field    [f1 {:name "Field 1.1", :table_id (:id t1)}]
                    Field    [f2 {:name "Field 2.1", :table_id (:id t2)}]
                    Field    [f3 {:name "Field 2.2", :table_id (:id t2)}]]
      (testing "`?include=tables` -- should be able to include Tables"
        (is (= {:tables [(table-details t1)
                         (table-details t2)]}
               (select-keys ((mt/user->client :lucky) :get 200 (format "database/%d?include=tables" (:id db)))
                            [:tables]))))

      (testing "`?include=tables.fields` -- should be able to include Tables and Fields"
        (letfn [(field-details* [field]
                  (assoc (into {} (hydrate/hydrate field [:target :has_field_values] :has_field_values))
                         :base_type        "type/Text"
                         :visibility_type  "normal"
                         :has_field_values "search"))]
          (is (= {:tables [(assoc (table-details t1) :fields [(field-details* f1)])
                           (assoc (table-details t2) :fields [(field-details* f2)
                                                              (field-details* f3)])]}
                 (select-keys ((mt/user->client :lucky) :get 200 (format "database/%d?include=tables.fields" (:id db)))
                              [:tables]))))))

    (testing "Invalid `?include` should return an error"
      (is (= {:errors {:include "value may be nil, or if non-nil, value must be one of: `tables`, `tables.fields`."}}
             ((mt/user->client :lucky) :get 400 (format "database/%d?include=schemas" (mt/id))))))))

(defn- create-db-via-api! [& [m]]
  (let [db-name (mt/random-name)]
    (try
      (let [{db-id :id, :as response} (with-redefs [driver/available?   (constantly true)
                                                    driver/can-connect? (constantly true)]
                                        ((mt/user->client :crowberto) :post 200 "database"
                                         (merge
                                          {:name    db-name
                                           :engine  (u/qualified-name ::test-driver)
                                           :details {:db "my_db"}}
                                          m)))]
        (is (schema= {:id       s/Int
                      s/Keyword s/Any}
                     response))
        (when (integer? db-id)
          (Database db-id)))
      (finally (db/delete! Database :name db-name)))))

(deftest create-db-test
  (testing "POST /api/database"
    (testing "Check that we can create a Database"
      (is (schema= (merge
                    (m/map-vals s/eq (mt/object-defaults Database))
                    {:created_at java.time.temporal.Temporal
                     :engine     (s/eq ::test-driver)
                     :id         su/IntGreaterThanZero
                     :details    (s/eq {:db "my_db"})
                     :updated_at java.time.temporal.Temporal
                     :name       su/NonBlankString
                     :features   (s/eq (driver.u/features ::test-driver))})
                   (create-db-via-api!))))

    (testing "can we set `is_full_sync` to `false` when we create the Database?"
      (is (= {:is_full_sync false}
             (select-keys (create-db-via-api! {:is_full_sync false}) [:is_full_sync]))))))

(deftest delete-database-test
  (testing "DELETE /api/database/:id"
    (testing "Check that we can delete a Database"
      (mt/with-temp Database [db]
        ((mt/user->client :crowberto) :delete 204 (format "database/%d" (:id db)))
        (is (false? (db/exists? Database :id (u/get-id db))))))))

(deftest update-database-test
  (testing "PUT /api/database/:id"
    (testing "Check that we can update fields in a Database"
      (mt/with-temp Database [{db-id :id}]
        (let [updates {:name         "Cam's Awesome Toucan Database"
                       :engine       "h2"
                       :is_full_sync false
                       :details      {:host "localhost", :port 5432, :dbname "fakedb", :user "rastacan"}}
              update! (fn [expected-status-code]
                        ((mt/user->client :crowberto) :put expected-status-code (format "database/%d" db-id) updates))]
          (testing "Should check that connection details are valid on save"
            (mt/suppress-output
              (is (= false
                     (:valid (update! 400))))))
          (testing "If connection details are valid, we should be able to update the Database"
            (with-redefs [driver/can-connect? (constantly true)]
              (is (= nil
                     (:valid (update! 200))))
              (is (= {:details      {:host "localhost", :port 5432, :dbname "fakedb", :user "rastacan"}
                      :engine       :h2
                      :name         "Cam's Awesome Toucan Database"
                      :is_full_sync false
                      :features     (driver.u/features :h2)}
                     (into {} (db/select-one [Database :name :engine :details :is_full_sync], :id db-id)))))))))

    (testing "should be able to set `auto_run_queries`"
      (testing "when creating a Database"
        (is (= {:auto_run_queries false}
               (select-keys (create-db-via-api! {:auto_run_queries false}) [:auto_run_queries]))))
      (testing "when updating a Database"
        (mt/with-temp Database [{db-id :id} {:engine ::test-driver}]
          (let [updates {:auto_run_queries false}]
            ((mt/user->client :crowberto) :put 200 (format "database/%d" db-id) updates))
          (is (= false
                 (db/select-one-field :auto_run_queries Database, :id db-id))))))))

(deftest fetch-database-metadata-test
  (testing "GET /api/database/:id/metadata"
    (is (= (merge (dissoc (mt/object-defaults Database) :details)
                  (select-keys (mt/db) [:created_at :id :updated_at :timezone])
                  {:engine   "h2"
                   :name     "test-data"
                   :features (map u/qualified-name (driver.u/features :h2))
                   :tables   [(merge
                               (mt/obj->json->obj (mt/object-defaults Table))
                               (db/select-one [Table :created_at :updated_at] :id (mt/id :categories))
                               {:schema       "PUBLIC"
                                :name         "CATEGORIES"
                                :display_name "Categories"
                                :entity_type  "entity/GenericTable"
                                :fields       [(merge
                                                (field-details (Field (mt/id :categories :id)))
                                                {:table_id          (mt/id :categories)
                                                 :special_type      "type/PK"
                                                 :name              "ID"
                                                 :display_name      "ID"
                                                 :database_type     "BIGINT"
                                                 :base_type         "type/BigInteger"
                                                 :visibility_type   "normal"
                                                 :has_field_values  "none"
                                                 :database_position 0})
                                               (merge
                                                (field-details (Field (mt/id :categories :name)))
                                                {:table_id          (mt/id :categories)
                                                 :special_type      "type/Name"
                                                 :name              "NAME"
                                                 :display_name      "Name"
                                                 :database_type     "VARCHAR"
                                                 :base_type         "type/Text"
                                                 :visibility_type   "normal"
                                                 :has_field_values  "list"
                                                 :database_position 1})]
                                :segments     []
                                :metrics      []
                                :id           (mt/id :categories)
                                :db_id        (mt/id)})]})
           (let [resp (mt/derecordize ((mt/user->client :rasta) :get 200 (format "database/%d/metadata" (mt/id))))]
             (assoc resp :tables (filter #(= "CATEGORIES" (:name %)) (:tables resp))))))))

(deftest fetch-database-metadata-include-hidden-test
  (mt/with-temp-vals-in-db Table (mt/id :categories) {:visibility_type "hidden"}
    (mt/with-temp-vals-in-db Field (mt/id :venues :price) {:visibility_type "sensitive"}
      (testing "GET /api/database/:id/metadata?include_hidden=true"
        (let [tables (->> ((mt/user->client :rasta) :get 200 (format "database/%d/metadata?include_hidden=true" (mt/id)))
                          :tables)]
          (is (some (partial = "CATEGORIES") (map :name tables)))
          (is (->> tables
                  (filter #(= "VENUES" (:name %)))
                  first
                  :fields
                  (map :name)
                  (some (partial = "PRICE"))))))
      (testing "GET /api/database/:id/metadata"
        (let [tables (->> ((mt/user->client :rasta) :get 200 (format "database/%d/metadata" (mt/id)))
                          :tables)]
          (is (not (some (partial = "CATEGORIES") (map :name tables))))
          (is (not (->> tables
                        (filter #(= "VENUES" (:name %)))
                        first
                        :fields
                        (map :name)
                        (some (partial = "PRICE"))))))))))

(deftest autocomplete-suggestions-test
  (testing "GET /api/database/:id/autocomplete_suggestions"
    (doseq [[prefix expected] {"u"   [["USERS" "Table"]
                                      ["USER_ID" "CHECKINS :type/Integer :type/FK"]]
                               "c"   [["CATEGORIES" "Table"]
                                      ["CHECKINS" "Table"]
                                      ["CATEGORY_ID" "VENUES :type/Integer :type/FK"]]
                               "cat" [["CATEGORIES" "Table"]
                                      ["CATEGORY_ID" "VENUES :type/Integer :type/FK"]]}]
      (is (= expected
             ((mt/user->client :rasta) :get 200 (format "database/%d/autocomplete_suggestions" (mt/id)) :prefix prefix))))))

(defn- card-with-native-query {:style/indent 1} [card-name & {:as kvs}]
  (merge
   {:name          card-name
    :database_id   (mt/id)
    :dataset_query {:database (mt/id)
                    :type     :native
                    :native   {:query (format "SELECT * FROM VENUES")}}}
   kvs))

(defn- card-with-mbql-query {:style/indent 1} [card-name & {:as inner-query-clauses}]
  {:name          card-name
   :database_id   (mt/id)
   :dataset_query {:database (mt/id)
                   :type     :query
                   :query    inner-query-clauses}})

(defn- saved-questions-virtual-db {:style/indent 0} [& card-tables]
  {:name               "Saved Questions"
   :id                 mbql.s/saved-questions-virtual-database-id
   :features           ["basic-aggregations"]
   :tables             card-tables
   :is_saved_questions true})

(defn- virtual-table-for-card [card & {:as kvs}]
  (merge
   {:id           (format "card__%d" (u/get-id card))
    :db_id        (:database_id card)
    :display_name (:name card)
    :schema       "Everything else"
    :description  nil}
   kvs))

(driver/register! ::no-nested-query-support
                  :parent :sql-jdbc
                  :abstract? true)

(defmethod driver/supports? [::no-nested-query-support :nested-queries] [_ _] false)

(defn- ok-mbql-card []
  (assoc (card-with-mbql-query "OK Card"
                               :source-table (mt/id :checkins))
         :result_metadata [{:name "num_toucans"}]))

(deftest databases-list-test
  (testing "GET /api/database"
    (testing "Test that we can get all the DBs (ordered by name, then driver)"
      (testing "Database details *should not* come back for Rasta since she's not a superuser"
        (let [expected-keys (-> (into #{:features :native_permissions} (keys (Database (mt/id))))
                                (disj :details))]
          (doseq [db ((mt/user->client :rasta) :get 200 "database")]
            (testing (format "Database %s %d %s" (:engine db) (u/get-id db) (pr-str (:name db)))
              (is (= expected-keys
                     (set (keys db)))))))))

    ;; ?include=tables and ?include_tables=true mean the same thing so test them both the same way
    (doseq [query-param ["?include_tables=true"
                         "?include=tables"]]
      (testing query-param
        (mt/with-temp Database [{db-id :id, db-name :name} {:engine (u/qualified-name ::test-driver)}]
          (doseq [db ((mt/user->client :rasta) :get 200 (str "database" query-param))]
            (testing (format "Database %s %d %s" (:engine db) (u/get-id db) (pr-str (:name db)))
              (is (= (expected-tables db)
                     (:tables db))))))))))

(deftest databases-list-include-saved-questions-test
  (testing "GET /api/database?saved=true"
    (mt/with-temp Card [card (assoc (card-with-native-query "Some Card")
                                    :result_metadata [{:name "col_name"}])]
      (testing "We should be able to include the saved questions virtual DB (without Tables) with the param ?saved=true"
        (is (= {:name               "Saved Questions"
                :id                 mbql.s/saved-questions-virtual-database-id
                :features           ["basic-aggregations"]
                :is_saved_questions true}
               (last ((mt/user->client :lucky) :get 200 "database?saved=true"))))))

    (testing "We should not include the saved questions virtual DB if there aren't any cards"
      (not-any?
       :is_saved_questions
       ((mt/user->client :lucky) :get 200 "database?saved=true")))
    (testing "Ommit virtual DB if nested queries are disabled"
      (tu/with-temporary-setting-values [enable-nested-queries false]
        (every? some? ((mt/user->client :lucky) :get 200 "database?saved=true"))))))

(def ^:private SavedQuestionsDB
  "Schema for the expected shape of info about the 'saved questions' virtual DB from API responses."
  {:name               (s/eq "Saved Questions")
   :id                 (s/eq -1337)
   :features           (s/eq ["basic-aggregations"])
   :is_saved_questions (s/eq true)
   :tables             [{:id           #"^card__\d+$"
                         :db_id        s/Int
                         :display_name s/Str
                         :schema       s/Str ; collection name
                         :description  (s/maybe s/Str)}]})

(defn- check-tables-included [response & tables]
  (let [response-tables (set (:tables response))]
    (doseq [table tables]
      (testing (format "Should include Table %s" (pr-str table))
        (is (contains? response-tables table))))))

(defn- check-tables-not-included [response & tables]
  (let [response-tables (set (:tables response))]
    (doseq [table tables]
      (testing (format "Should *not* include Table %s" (pr-str table))
        (is (not (contains? response-tables table)))))))

(deftest databases-list-include-saved-questions-tables-test
  ;; `?saved=true&include=tables` and `?include_cards=true` mean the same thing, so test them both
  (doseq [params ["?saved=true&include=tables"
                  "?include_cards=true"]]
    (testing (str "GET /api/database" params)
      (letfn [(fetch-virtual-database []
                (some #(when (= (:name %) "Saved Questions")
                         %)
                      ((mt/user->client :crowberto) :get 200 (str "database" params))))]
        (testing "Check that we get back 'virtual' tables for Saved Questions"
          (testing "The saved questions virtual DB should be the last DB in the list"
            (mt/with-temp Card [card (card-with-native-query "Kanye West Quote Views Per Month")]
              ;; run the Card which will populate its result_metadata column
              ((mt/user->client :crowberto) :post 202 (format "card/%d/query" (u/get-id card)))
              ;; Now fetch the database list. The 'Saved Questions' DB should be last on the list
              (let [response (last ((mt/user->client :crowberto) :get 200 (str "database" params)))]
                (is (schema= SavedQuestionsDB
                             response))
                (check-tables-included response (virtual-table-for-card card)))))

          (testing "Make sure saved questions are NOT included if the setting is disabled"
            (mt/with-temp Card [card (card-with-native-query "Kanye West Quote Views Per Month")]
              (mt/with-temporary-setting-values [enable-nested-queries false]
                ;; run the Card which will populate its result_metadata column
                ((mt/user->client :crowberto) :post 202 (format "card/%d/query" (u/get-id card)))
                ;; Now fetch the database list. The 'Saved Questions' DB should NOT be in the list
                (is (= nil
                       (fetch-virtual-database)))))))

        (testing "should pretend Collections are schemas"
          (mt/with-temp* [Collection [stamp-collection {:name "Stamps"}]
                          Collection [coin-collection  {:name "Coins"}]
                          Card       [stamp-card (card-with-native-query "Total Stamp Count", :collection_id (u/get-id stamp-collection))]
                          Card       [coin-card  (card-with-native-query "Total Coin Count",  :collection_id (u/get-id coin-collection))]]
            ;; run the Cards which will populate their result_metadata columns
            (doseq [card [stamp-card coin-card]]
              ((mt/user->client :crowberto) :post 202 (format "card/%d/query" (u/get-id card))))
            ;; Now fetch the database list. The 'Saved Questions' DB should be last on the list. Cards should have their
            ;; Collection name as their Schema
            (let [response (last ((mt/user->client :crowberto) :get 200 (str "database" params)))]
              (is (schema= SavedQuestionsDB
                           response))
              (check-tables-included
               response
               (virtual-table-for-card coin-card :schema "Coins")
               (virtual-table-for-card stamp-card :schema "Stamps")))))

        (testing "should remove Cards that have ambiguous columns"
          (mt/with-temp* [Card [ok-card         (assoc (card-with-native-query "OK Card")         :result_metadata [{:name "cam"}])]
                          Card [cambiguous-card (assoc (card-with-native-query "Cambiguous Card") :result_metadata [{:name "cam"} {:name "cam_2"}])]]
            (let [response (fetch-virtual-database)]
              (is (schema= SavedQuestionsDB
                           response))
              (check-tables-included response (virtual-table-for-card ok-card))
              (check-tables-not-included response (virtual-table-for-card cambiguous-card)))))

        (testing "should remove Cards that belong to a driver that doesn't support nested queries"
          (mt/with-temp* [Database [bad-db   {:engine ::no-nested-query-support, :details {}}]
                          Card     [bad-card {:name            "Bad Card"
                                              :dataset_query   {:database (u/get-id bad-db)
                                                                :type     :native
                                                                :native   {:query "[QUERY GOES HERE]"}}
                                              :result_metadata [{:name "sparrows"}]
                                              :database_id     (u/get-id bad-db)}]
                          Card     [ok-card  (assoc (card-with-native-query "OK Card")
                                                    :result_metadata [{:name "finches"}])]]
            (let [response (fetch-virtual-database)]
              (is (schema= SavedQuestionsDB
                           response))
              (check-tables-included response (virtual-table-for-card ok-card))
              (check-tables-not-included response (virtual-table-for-card bad-card)))))

        (testing "should work when there are no DBs that support nested queries"
          (with-redefs [metabase.driver/supports? (constantly false)]
            (is (nil? (fetch-virtual-database)))))

        (testing "should work when there are no DBs that support nested queries"
          (with-redefs [metabase.driver/supports? (constantly false)]
            (is (nil? (fetch-virtual-database)))))

        (testing "should remove Cards that use cumulative-sum and cumulative-count aggregations"
          (mt/with-temp* [Card [ok-card  (ok-mbql-card)]
                          Card [bad-card (merge
                                          (mt/$ids checkins
                                            (card-with-mbql-query "Cum Count Card"
                                              :source-table $$checkins
                                              :aggregation  [[:cum-count]]
                                              :breakout     [!month.date]))
                                          {:result_metadata [{:name "num_toucans"}]})]]
            (let [response (fetch-virtual-database)]
              (is (schema= SavedQuestionsDB
                           response))
              (check-tables-included response (virtual-table-for-card ok-card))
              (check-tables-not-included response (virtual-table-for-card bad-card)))))))))

(deftest db-metadata-saved-questions-db-test
  (testing "GET /api/database/:id/metadata works for the Saved Questions 'virtual' database"
    (mt/with-temp Card [card (assoc (card-with-native-query "Birthday Card")
                                    :result_metadata [{:name "age_in_bird_years"}])]
      (let [response ((mt/user->client :crowberto) :get 200
                      (format "database/%d/metadata" mbql.s/saved-questions-virtual-database-id))]
        (is (schema= {:name               (s/eq "Saved Questions")
                      :id                 (s/eq -1337)
                      :is_saved_questions (s/eq true)
                      :features           (s/eq ["basic-aggregations"])
                      :tables             [{:id           #"^card__\d+$"
                                            :db_id        s/Int
                                            :display_name s/Str
                                            :schema       s/Str ; collection name
                                            :description  (s/maybe s/Str)
                                            :fields       [su/Map]}]}
                     response))
        (check-tables-included
         response
         (assoc (virtual-table-for-card card)
                :fields [{:name                     "age_in_bird_years"
                          :table_id                 (str "card__" (u/get-id card))
                          :id                       ["field-literal" "age_in_bird_years" "type/*"]
                          :special_type             nil
                          :base_type                nil
                          :default_dimension_option nil
                          :dimension_options        []}]))))

    (testing "\nif no eligible Saved Questions exist the endpoint should return empty tables"
      (with-redefs [database-api/cards-virtual-tables (constantly [])]
        (is (= {:name               "Saved Questions"
                :id                 mbql.s/saved-questions-virtual-database-id
                :features           ["basic-aggregations"]
                :is_saved_questions true
                :tables             []}
               ((mt/user->client :crowberto) :get 200
                (format "database/%d/metadata" mbql.s/saved-questions-virtual-database-id))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                CRON SCHEDULES!                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private schedule-map-for-last-friday-at-11pm
  {:schedule_day   "fri"
   :schedule_frame "last"
   :schedule_hour  23
   :schedule_type  "monthly"})

(def ^:private schedule-map-for-hourly
  {:schedule_day   nil
   :schedule_frame nil
   :schedule_hour  nil
   :schedule_type  "hourly"})

(deftest create-new-db-with-custom-schedules-test
  (testing "Can we create a NEW database and give it custom schedules?"
    (let [db-name (mt/random-name)]
      (try (let [db (with-redefs [driver/available? (constantly true)]
                      ((mt/user->client :crowberto) :post 200 "database"
                       {:name      db-name
                        :engine    (u/qualified-name ::test-driver)
                        :details   {:db "my_db"}
                        :schedules {:cache_field_values schedule-map-for-last-friday-at-11pm
                                    :metadata_sync      schedule-map-for-hourly}}))]
             (is (= {:cache_field_values_schedule "0 0 23 ? * 6L *"
                     :metadata_sync_schedule      "0 0 * * * ? *"}
                    (into {} (db/select-one [Database :cache_field_values_schedule :metadata_sync_schedule] :id (u/get-id db))))))
           (finally (db/delete! Database :name db-name))))))

(deftest update-schedules-for-existing-db
  (testing "Can we UPDATE the schedules for an existing database?"
    (mt/with-temp Database [db {:engine "h2", :details (:details (mt/db))}]
      ((mt/user->client :crowberto) :put 200 (format "database/%d" (u/get-id db))
       (assoc db
              :schedules {:cache_field_values schedule-map-for-last-friday-at-11pm
                          :metadata_sync      schedule-map-for-hourly}))
      (is (= {:cache_field_values_schedule "0 0 23 ? * 6L *"
              :metadata_sync_schedule      "0 0 * * * ? *"}
             (into {} (db/select-one [Database :cache_field_values_schedule :metadata_sync_schedule] :id (u/get-id db))))))))

(deftest fetch-db-with-expanded-schedules
  (testing "If we FETCH a database will it have the correct 'expanded' schedules?"
    (mt/with-temp Database [db {:metadata_sync_schedule      "0 0 * * * ? *"
                                :cache_field_values_schedule "0 0 23 ? * 6L *"}]
      (is (= {:cache_field_values_schedule "0 0 23 ? * 6L *"
              :metadata_sync_schedule      "0 0 * * * ? *"
              :schedules                   {:cache_field_values schedule-map-for-last-friday-at-11pm
                                            :metadata_sync      schedule-map-for-hourly}}
             (-> ((mt/user->client :crowberto) :get 200 (format "database/%d" (u/get-id db)))
                 (select-keys [:cache_field_values_schedule :metadata_sync_schedule :schedules])))))))

;; Five minutes
(def ^:private long-timeout (* 5 60 1000))

(defn- deliver-when-db [promise-to-deliver expected-db]
  (fn [db]
    (when (= (u/get-id db) (u/get-id expected-db))
      (deliver promise-to-deliver true))))

(deftest trigger-metadata-sync-for-db-test
  (testing "Can we trigger a metadata sync for a DB?"
    (let [sync-called?    (promise)
          analyze-called? (promise)]
      (mt/with-temp Database [db {:engine "h2", :details (:details (mt/db))}]
        (with-redefs [sync-metadata/sync-db-metadata! (deliver-when-db sync-called? db)
                      analyze/analyze-db!             (deliver-when-db analyze-called? db)]
          ((mt/user->client :crowberto) :post 200 (format "database/%d/sync_schema" (u/get-id db)))
          ;; Block waiting for the promises from sync and analyze to be delivered. Should be delivered instantly,
          ;; however if something went wrong, don't hang forever, eventually timeout and fail
          (testing "sync called?"
            (is (= true
                   (deref sync-called? long-timeout :sync-never-called))))
          (testing "analyze called?"
            (is (= true
                   (deref analyze-called? long-timeout :analyze-never-called)))))))))

(deftest non-admins-cant-trigger-sync
  (testing "Non-admins should not be allowed to trigger sync"
    (is (= "You don't have permissions to do that."
           ((mt/user->client :rasta) :post 403 (format "database/%d/sync_schema" (mt/id)))))))

(deftest can-rescan-fieldvalues-for-a-db
  (testing "Can we RESCAN all the FieldValues for a DB?"
    (let [update-field-values-called? (promise)]
      (mt/with-temp Database [db {:engine "h2", :details (:details (mt/db))}]
        (with-redefs [field-values/update-field-values! (fn [synced-db]
                                                          (when (= (u/get-id synced-db) (u/get-id db))
                                                            (deliver update-field-values-called? :sync-called)))]
          ((mt/user->client :crowberto) :post 200 (format "database/%d/rescan_values" (u/get-id db)))
          (is (= :sync-called
                 (deref update-field-values-called? long-timeout :sync-never-called))))))))

(deftest nonadmins-cant-trigger-rescan
  (testing "Non-admins should not be allowed to trigger re-scan"
    (is (= "You don't have permissions to do that."
           ((mt/user->client :rasta) :post 403 (format "database/%d/rescan_values" (mt/id)))))))

(deftest discard-db-fieldvalues
  (testing "Can we DISCARD all the FieldValues for a DB?"
    (mt/with-temp* [Database    [db       {:engine "h2", :details (:details (mt/db))}]
                    Table       [table-1  {:db_id (u/get-id db)}]
                    Table       [table-2  {:db_id (u/get-id db)}]
                    Field       [field-1  {:table_id (u/get-id table-1)}]
                    Field       [field-2  {:table_id (u/get-id table-2)}]
                    FieldValues [values-1 {:field_id (u/get-id field-1), :values [1 2 3 4]}]
                    FieldValues [values-2 {:field_id (u/get-id field-2), :values [1 2 3 4]}]]
      ((mt/user->client :crowberto) :post 200 (format "database/%d/discard_values" (u/get-id db)))
      (testing "values-1 still exists?"
        (is (= false
               (db/exists? FieldValues :id (u/get-id values-1)))))
      (testing "values-2 still exists?"
        (is (= false
               (db/exists? FieldValues :id (u/get-id values-2))))))))

(deftest nonadmins-cant-discard-all-fieldvalues
  (testing "Non-admins should not be allowed to discard all FieldValues"
    (is (= "You don't have permissions to do that."
           ((mt/user->client :rasta) :post 403 (format "database/%d/discard_values" (mt/id)))))))


;; For some stupid reason the *real* version of `test-database-connection` is set up to do nothing for tests. I'm
;; guessing it's done that way so we can save invalid DBs for some silly tests. Instead of doing it the right way
;; and using `with-redefs` to disable it in the few tests where it makes sense, we actually have to use `with-redefs`
;; here to simulate its *normal* behavior. :unamused:
(defn- test-database-connection [engine details]
  (if (driver.u/can-connect-with-details? (keyword engine) details)
    nil
    {:valid false, :message "Error!"}))

(deftest validate-database-test
  (testing "POST /api/database/validate"
    (with-redefs [database-api/test-database-connection test-database-connection]
      (testing "Should require superuser permissions"
        (is (= "You don't have permissions to do that."
               ((mt/user->client :rasta) :post 403 "database/validate"
                {:details {:engine :h2, :details (:details (mt/db))}}))))

      (testing "Underlying `test-connection-details` function should work"
        (is (= (:details (mt/db))
               (#'database-api/test-connection-details "h2" (:details (mt/db))))))

      (testing "Valid database connection details"
        (is (= {:valid true}
               ((mt/user->client :crowberto) :post 200 "database/validate"
                {:details {:engine :h2, :details (:details (mt/db))}}))))

      (testing "invalid database connection details"
        (mt/suppress-output
          (testing "calling test-connection-details directly"
            (is (= {:valid false, :message "Error!"}
                   (#'database-api/test-connection-details "h2" {:db "ABC"}))))

          (testing "via the API endpoint"
            (is (= {:valid false}
                   ((mt/user->client :crowberto) :post 200 "database/validate"
                    {:details {:engine :h2, :details {:db "ABC"}}})))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                      GET /api/database/:id/schemas & GET /api/database/:id/schema/:schema                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest get-schemas-test
  (testing "GET /api/database/:id/schemas"
    (testing "permissions"
      (mt/with-temp* [Database [{db-id :id}]
                      Table    [t1 {:db_id db-id, :schema "schema1"}]
                      Table    [t2 {:db_id db-id, :schema "schema1"}]]
        (testing "should work if user has full DB perms..."
          (is (= ["schema1"]
                 ((mt/user->client :rasta) :get 200 (format "database/%d/schemas" db-id)))))

        (testing "...or full schema perms..."
          (perms/revoke-permissions! (perms-group/all-users) db-id)
          (perms/grant-permissions!  (perms-group/all-users) db-id "schema1")
          (is (= ["schema1"]
                 ((mt/user->client :rasta) :get 200 (format "database/%d/schemas" db-id)))))

        (testing "...or just table read perms..."
          (perms/revoke-permissions! (perms-group/all-users) db-id)
          (perms/revoke-permissions! (perms-group/all-users) db-id "schema1")
          (perms/grant-permissions!  (perms-group/all-users) db-id "schema1" t1)
          (perms/grant-permissions!  (perms-group/all-users) db-id "schema1" t2)
          (is (= ["schema1"]
                 ((mt/user->client :rasta) :get 200 (format "database/%d/schemas" db-id)))))))

    (testing "Multiple schemas are ordered by name"
      (mt/with-temp* [Database [{db-id :id}]
                      Table    [_ {:db_id db-id, :schema "schema3"}]
                      Table    [_ {:db_id db-id, :schema "schema2"}]
                      Table    [_ {:db_id db-id, :schema "schema1"}]]
        (is (= ["schema1" "schema2" "schema3"]
               ((mt/user->client :rasta) :get 200 (format "database/%d/schemas" db-id))))))

    (testing "Looking for a database that doesn't exist should return a 404"
      (is (= "Not found."
             ((mt/user->client :crowberto) :get 404 (format "database/%s/schemas" Integer/MAX_VALUE)))))

    (testing "should work for the saved questions 'virtual' database"
      (mt/with-temp* [Collection [coll   {:name "My Collection"}]
                      Card       [card-1 (assoc (card-with-native-query "Card 1") :collection_id (:id coll))]
                      Card       [card-2 (card-with-native-query "Card 2")]]
        ;; run the cards to populate their result_metadata columns
        (doseq [card [card-1 card-2]]
          ((mt/user->client :crowberto) :post 202 (format "card/%d/query" (u/get-id card))))
        (is (= ["Everything else"
                "My Collection"]
               ((mt/user->client :lucky) :get 200 (format "database/%d/schemas" mbql.s/saved-questions-virtual-database-id))))))

    (testing "null and empty schemas should both come back as blank strings"
      (mt/with-temp* [Database [{db-id :id}]
                      Table    [_ {:db_id db-id, :schema ""}]
                      Table    [_ {:db_id db-id, :schema nil}]
                      Table    [_ {:db_id db-id, :schema " "}]]
        (is (= ["" " "]
               ((mt/user->client :lucky) :get 200 (format "database/%d/schemas" db-id))))))))

(deftest get-schema-tables-test
  (testing "GET /api/database/:id/schema/:schema\n"
    (testing "Permissions: Can we fetch the Tables in a schema?"
      (mt/with-temp* [Database [{db-id :id}]
                      Table    [t1 {:db_id db-id, :schema "schema1", :name "t1"}]
                      Table    [t2 {:db_id db-id, :schema "schema2"}]
                      Table    [t3 {:db_id db-id, :schema "schema1", :name "t3"}]]
        (testing "if we have full DB perms"
          (is (= ["t1" "t3"]
                 (map :name ((mt/user->client :rasta) :get 200 (format "database/%d/schema/%s" db-id "schema1"))))))

        (testing "if we have full schema perms"
          (perms/revoke-permissions! (perms-group/all-users) db-id)
          (perms/grant-permissions!  (perms-group/all-users) db-id "schema1")
          (is (= ["t1" "t3"]
                 (map :name ((mt/user->client :rasta) :get 200 (format "database/%d/schema/%s" db-id "schema1"))))))

        (testing "if we have full Table perms"
          (perms/revoke-permissions! (perms-group/all-users) db-id)
          (perms/revoke-permissions! (perms-group/all-users) db-id "schema1")
          (perms/grant-permissions!  (perms-group/all-users) db-id "schema1" t1)
          (perms/grant-permissions!  (perms-group/all-users) db-id "schema1" t3)
          (is (= ["t1" "t3"]
                 (map :name ((mt/user->client :rasta) :get 200 (format "database/%d/schema/%s" db-id "schema1"))))))))

    (testing "should return a 403 for a user that doesn't have read permissions"
      (mt/with-temp* [Database [{database-id :id}]
                      Table    [_ {:db_id database-id, :schema "test"}]]
        (perms/revoke-permissions! (perms-group/all-users) database-id)
        (is (= "You don't have permissions to do that."
               ((mt/user->client :rasta) :get 403 (format "database/%s/schemas" database-id))))))

    (testing "should exclude schemas for which the user has no perms"
      (mt/with-temp* [Database [{database-id :id}]
                      Table    [_ {:db_id database-id, :schema "schema-with-perms"}]
                      Table    [_ {:db_id database-id, :schema "schema-without-perms"}]]
        (perms/revoke-permissions! (perms-group/all-users) database-id)
        (perms/grant-permissions!  (perms-group/all-users) database-id "schema-with-perms")
        (is (= ["schema-with-perms"]
               ((mt/user->client :rasta) :get 200 (format "database/%s/schemas" database-id))))))

    (testing "should return a 403 for a user that doesn't have read permissions"
      (testing "for the DB"
        (mt/with-temp* [Database [{database-id :id}]
                        Table    [{table-id :id} {:db_id database-id, :schema "test"}]]
          (perms/revoke-permissions! (perms-group/all-users) database-id)
          (is (= "You don't have permissions to do that."
                 ((mt/user->client :rasta) :get 403 (format "database/%s/schema/%s" database-id "test"))))))

      (testing "for the schema"
        (mt/with-temp* [Database [{database-id :id}]
                        Table    [_ {:db_id database-id, :schema "schema-with-perms"}]
                        Table    [_ {:db_id database-id, :schema "schema-without-perms"}]]
          (perms/revoke-permissions! (perms-group/all-users) database-id)
          (perms/grant-permissions!  (perms-group/all-users) database-id "schema-with-perms")
          (is (= "You don't have permissions to do that."
                 ((mt/user->client :rasta) :get 403 (format "database/%s/schema/%s" database-id "schema-without-perms")))))))

    (testing "Should return a 404 if the schema isn't found"
      (mt/with-temp* [Database [{db-id :id}]
                      Table    [{t1-id :id} {:db_id db-id, :schema "schema1"}]]
        (is (= "Not found."
               ((mt/user->client :crowberto) :get 404 (format "database/%d/schema/%s" db-id "not schema1"))))))

    (testing "should exclude Tables for which the user has no perms"
      (mt/with-temp* [Database [{database-id :id}]
                      Table    [table-with-perms {:db_id database-id, :schema "public", :name "table-with-perms"}]
                      Table    [_                {:db_id database-id, :schema "public", :name "table-without-perms"}]]
        (perms/revoke-permissions! (perms-group/all-users) database-id)
        (perms/grant-permissions!  (perms-group/all-users) database-id "public" table-with-perms)
        (is (= ["table-with-perms"]
               (map :name ((mt/user->client :rasta) :get 200 (format "database/%s/schema/%s" database-id "public")))))))

    (testing "should exclude inactive Tables"
      (mt/with-temp* [Database [{database-id :id}]
                      Table    [_ {:db_id database-id, :schema "public", :name "table"}]
                      Table    [_ {:db_id database-id, :schema "public", :name "inactive-table", :active false}]]
        (is (= ["table"]
               (map :name ((mt/user->client :rasta) :get 200 (format "database/%s/schema/%s" database-id "public")))))))

    (testing "should exclude hidden Tables"
      (mt/with-temp* [Database [{database-id :id}]
                      Table    [_ {:db_id database-id, :schema "public", :name "table"}]
                      Table    [_ {:db_id database-id, :schema "public", :name "hidden-table", :visibility_type "hidden"}]]
        (is (= ["table"]
               (map :name ((mt/user->client :rasta) :get 200 (format "database/%s/schema/%s" database-id "public")))))))

    (testing "should work for the saved questions 'virtual' database"
      (mt/with-temp* [Collection [coll   {:name "My Collection"}]
                      Card       [card-1 (assoc (card-with-native-query "Card 1") :collection_id (:id coll))]
                      Card       [card-2 (card-with-native-query "Card 2")]]
        ;; run the cards to populate their result_metadata columns
        (doseq [card [card-1 card-2]]
          ((mt/user->client :crowberto) :post 202 (format "card/%d/query" (u/get-id card))))
        (testing "Should be able to get saved questions in a specific collection"
          (is (= [{:id           (format "card__%d" (:id card-1))
                   :db_id        (mt/id)
                   :display_name "Card 1"
                   :schema       "My Collection"
                   :description  nil}]
                 ((mt/user->client :lucky) :get 200
                  (format "database/%d/schema/My Collection" mbql.s/saved-questions-virtual-database-id)))))

        (testing "Should be able to get saved questions in the root collection"
          (let [response ((mt/user->client :lucky) :get 200
                          (format "database/%d/schema/%s" mbql.s/saved-questions-virtual-database-id (table-api/root-collection-schema-name)))]
            (is (schema= [{:id           #"^card__\d+$"
                           :db_id        s/Int
                           :display_name s/Str
                           :schema       (s/eq (table-api/root-collection-schema-name))
                           :description  (s/maybe s/Str)}]
                         response))
            (is (contains? (set response)
                           {:id           (format "card__%d" (:id card-2))
                            :db_id        (mt/id)
                            :display_name "Card 2"
                            :schema       (table-api/root-collection-schema-name)
                            :description  nil}))))

        (testing "Should throw 404 if the schema/Collection doesn't exist"
          (is (= "Not found."
                 ((mt/user->client :lucky) :get 404
                  (format "database/%d/schema/Coin Collection" mbql.s/saved-questions-virtual-database-id)))))))

    (mt/with-temp* [Database [{db-id :id}]
                    Table    [_ {:db_id db-id, :schema nil, :name "t1"}]
                    Table    [_ {:db_id db-id, :schema "", :name "t2"}]]
      (testing "to fetch Tables with `nil` or empty schemas, use the blank string"
        (is (= ["t1" "t2"]
               (map :name ((mt/user->client :lucky) :get 200 (format "database/%d/schema/" db-id)))))))))
