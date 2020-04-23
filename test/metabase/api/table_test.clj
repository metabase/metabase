(ns metabase.api.table-test
  "Tests for /api/table endpoints."
  (:require [clojure
             [test :refer :all]
             [walk :as walk]]
            [expectations :refer [expect]]
            [medley.core :as m]
            [metabase
             [http-client :as http]
             [query-processor-test :as qpt]
             [sync :as sync]
             [test :as mt]
             [util :as u]]
            [metabase.api.table :as table-api]
            [metabase.driver.util :as driver.u]
            [metabase.middleware.util :as middleware.u]
            [metabase.models
             [card :refer [Card]]
             [database :as database :refer [Database]]
             [field :refer [Field]]
             [field-values :refer [FieldValues]]
             [permissions :as perms]
             [permissions-group :as perms-group]
             [table :as table :refer [Table]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [datasets :as datasets]
             [users :as test-users]]
            [metabase.test.mock.util :as mutil]
            [metabase.timeseries-query-processor-test.util :as tqpt]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; ## /api/org/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(deftest unauthenticated-test
  (is (= (get middleware.u/response-unauthentic :body)
         (http/client :get 401 "table")))
  (is (= (get middleware.u/response-unauthentic :body)
         (http/client :get 401 (format "table/%d" (mt/id :users))))))

(defn- db-details []
  (merge
   (select-keys (mt/db) [:id :created_at :updated_at :timezone])
   {:engine                      "h2"
    :name                        "test-data"
    :is_sample                   false
    :is_full_sync                true
    :is_on_demand                false
    :description                 nil
    :caveats                     nil
    :points_of_interest          nil
    :features                    (mapv u/qualified-name (driver.u/features :h2))
    :cache_field_values_schedule "0 50 0 * * ? *"
    :metadata_sync_schedule      "0 50 * * * ? *"
    :options                     nil
    :auto_run_queries            true}))

(defn- table-defaults []
  {:description             nil
   :caveats                 nil
   :points_of_interest      nil
   :show_in_getting_started false
   :entity_type             "entity/GenericTable"
   :visibility_type         nil
   :db                      (db-details)
   :entity_name             nil
   :active                  true
   :db_id                   (mt/id)
   :segments                []
   :metrics                 []})

(def ^:private field-defaults
  {:description              nil
   :active                   true
   :position                 0
   :target                   nil
   :preview_display          true
   :visibility_type          "normal"
   :caveats                  nil
   :points_of_interest       nil
   :special_type             nil
   :parent_id                nil
   :dimensions               []
   :dimension_options        []
   :has_field_values         nil
   :default_dimension_option nil
   :settings                 nil})

(defn- field-details [field]
  (merge
   field-defaults
   (select-keys
    field
    [:created_at :fingerprint :fingerprint_version :fk_target_field_id :id :last_analyzed :updated_at])))

(defn- fk-field-details [field]
  (-> (field-details field)
      (dissoc :dimension_options :default_dimension_option)))


;; ## GET /api/table
;; These should come back in alphabetical order and include relevant metadata
(expect
  #{{:name         (mt/format-name "categories")
     :display_name "Categories"
     :rows         0
     :id           (mt/id :categories)
     :entity_type  "entity/GenericTable"}
    {:name         (mt/format-name "checkins")
     :display_name "Checkins"
     :rows         0
     :id           (mt/id :checkins)
     :entity_type  "entity/EventTable"}
    {:name         (mt/format-name "users")
     :display_name "Users"
     :rows         0
     :id           (mt/id :users)
     :entity_type  "entity/UserTable"}
    {:name         (mt/format-name "venues")
     :display_name "Venues"
     :rows         0
     :id           (mt/id :venues)
     :entity_type  "entity/GenericTable"}}
  (->> ((test-users/user->client :rasta) :get 200 "table")
       (filter #(= (:db_id %) (mt/id))) ; prevent stray tables from affecting unit test results
       (map #(select-keys % [:name :display_name :rows :id :entity_type]))
       set))


;; ## GET /api/table/:id
(expect
  (merge
   (dissoc (table-defaults) :segments :field_values :metrics)
   (db/select-one [Table :created_at :updated_at :fields_hash] :id (mt/id :venues))
   {:schema       "PUBLIC"
    :name         "VENUES"
    :display_name "Venues"
    :rows         nil
    :pk_field     (table/pk-field-id (Table (mt/id :venues)))
    :id           (mt/id :venues)
    :db_id        (mt/id)})
  ((test-users/user->client :rasta) :get 200 (format "table/%d" (mt/id :venues))))

;; GET /api/table/:id should return a 403 for a user that doesn't have read permissions for the table
(tt/expect-with-temp [Database [{database-id :id}]
                      Table    [{table-id :id}    {:db_id database-id}]]
  "You don't have permissions to do that."
  (do
    (perms/revoke-permissions! (perms-group/all-users) database-id)
    ((test-users/user->client :rasta) :get 403 (str "table/" table-id))))

(defn- default-dimension-options []
  (->> #'table-api/dimension-options-for-response
       var-get
       (m/map-vals #(update % :name str))
       walk/keywordize-keys))

(defn- query-metadata-defaults []
  (-> (table-defaults)
      (assoc :dimension_options (default-dimension-options))))

;; ## GET /api/table/:id/query_metadata
(expect
  (merge
   (query-metadata-defaults)
   (db/select-one [Table :created_at :updated_at :fields_hash] :id (mt/id :categories))
   {:schema       "PUBLIC"
    :name         "CATEGORIES"
    :display_name "Categories"
    :fields       [(merge
                    (field-details (Field (mt/id :categories :id)))
                    {:table_id         (mt/id :categories)
                     :special_type     "type/PK"
                     :name             "ID"
                     :display_name     "ID"
                     :database_type    "BIGINT"
                     :base_type        "type/BigInteger"
                     :has_field_values "none"})
                   (merge
                    (field-details (Field (mt/id :categories :name)))
                    {:table_id                 (mt/id :categories)
                     :special_type             "type/Name"
                     :name                     "NAME"
                     :display_name             "Name"
                     :database_type            "VARCHAR"
                     :base_type                "type/Text"
                     :dimension_options        []
                     :default_dimension_option nil
                     :has_field_values         "list"})]
    :rows         nil
    :id           (mt/id :categories)})
  ((test-users/user->client :rasta) :get 200 (format "table/%d/query_metadata" (mt/id :categories))))

;;; GET api/table/:id/query_metadata?include_sensitive_fields
;; Make sure that getting the User table *does* include info about the password field, but not actual values
;; themselves
(expect
  (merge
   (query-metadata-defaults)
   (db/select-one [Table :created_at :updated_at :fields_hash] :id (mt/id :users))
   {:schema       "PUBLIC"
    :name         "USERS"
    :display_name "Users"
    :entity_type  "entity/UserTable"
    :fields       [(assoc (field-details (Field (mt/id :users :id)))
                     :special_type     "type/PK"
                     :table_id         (mt/id :users)
                     :name             "ID"
                     :display_name     "ID"
                     :database_type    "BIGINT"
                     :base_type        "type/BigInteger"
                     :visibility_type  "normal"
                     :has_field_values "none")
                   (assoc (field-details (Field (mt/id :users :last_login)))
                     :table_id                 (mt/id :users)
                     :name                     "LAST_LOGIN"
                     :display_name             "Last Login"
                     :database_type            "TIMESTAMP"
                     :base_type                "type/DateTime"
                     :visibility_type          "normal"
                     :dimension_options        (var-get #'table-api/datetime-dimension-indexes)
                     :default_dimension_option (var-get #'table-api/date-default-index)
                     :has_field_values         "none")
                   (assoc (field-details (Field (mt/id :users :name)))
                     :special_type             "type/Name"
                     :table_id                 (mt/id :users)
                     :name                     "NAME"
                     :display_name             "Name"
                     :database_type            "VARCHAR"
                     :base_type                "type/Text"
                     :visibility_type          "normal"
                     :dimension_options        []
                     :default_dimension_option nil
                     :has_field_values         "list")
                   (assoc (field-details (Field :table_id (mt/id :users), :name "PASSWORD"))
                     :special_type     "type/Category"
                     :table_id         (mt/id :users)
                     :name             "PASSWORD"
                     :display_name     "Password"
                     :database_type    "VARCHAR"
                     :base_type        "type/Text"
                     :visibility_type  "sensitive"
                     :has_field_values "list")]
    :rows         nil
    :id           (mt/id :users)})
  ((test-users/user->client :rasta) :get 200 (format "table/%d/query_metadata?include_sensitive_fields=true" (mt/id :users))))

;;; GET api/table/:id/query_metadata
;;; Make sure that getting the User table does *not* include password info
(expect
  (merge
   (query-metadata-defaults)
   (db/select-one [Table :created_at :updated_at :fields_hash] :id (mt/id :users))
   {:schema       "PUBLIC"
    :name         "USERS"
    :display_name "Users"
    :entity_type  "entity/UserTable"
    :fields       [(assoc (field-details (Field (mt/id :users :id)))
                     :table_id         (mt/id :users)
                     :special_type     "type/PK"
                     :name             "ID"
                     :display_name     "ID"
                     :database_type    "BIGINT"
                     :base_type        "type/BigInteger"
                     :has_field_values "none")
                   (assoc (field-details (Field (mt/id :users :last_login)))
                     :table_id                 (mt/id :users)
                     :name                     "LAST_LOGIN"
                     :display_name             "Last Login"
                     :database_type            "TIMESTAMP"
                     :base_type                "type/DateTime"
                     :dimension_options        (var-get #'table-api/datetime-dimension-indexes)
                     :default_dimension_option (var-get #'table-api/date-default-index)
                     :has_field_values         "none")
                   (assoc (field-details (Field (mt/id :users :name)))
                     :table_id         (mt/id :users)
                     :special_type     "type/Name"
                     :name             "NAME"
                     :display_name     "Name"
                     :database_type    "VARCHAR"
                     :base_type        "type/Text"
                     :has_field_values "list")]
    :rows         nil
    :id           (mt/id :users)})
  ((test-users/user->client :rasta) :get 200 (format "table/%d/query_metadata" (mt/id :users))))

;; Check that FK fields belonging to Tables we don't have permissions for don't come back as hydrated `:target`(#3867)
(expect
  #{{:name "id", :target false}
    {:name "fk", :target false}}
  ;; create a temp DB with two tables; table-2 has an FK to table-1
  (tt/with-temp* [Database [db]
                  Table    [table-1    {:db_id (u/get-id db)}]
                  Table    [table-2    {:db_id (u/get-id db)}]
                  Field    [table-1-id {:table_id (u/get-id table-1), :name "id", :base_type :type/Integer, :special_type :type/PK}]
                  Field    [table-2-id {:table_id (u/get-id table-2), :name "id", :base_type :type/Integer, :special_type :type/PK}]
                  Field    [table-2-fk {:table_id (u/get-id table-2), :name "fk", :base_type :type/Integer, :special_type :type/FK, :fk_target_field_id (u/get-id table-1-id)}]]
    ;; grant permissions only to table-2
    (perms/revoke-permissions! (perms-group/all-users) (u/get-id db))
    (perms/grant-permissions! (perms-group/all-users) (u/get-id db) (:schema table-2) (u/get-id table-2))
    ;; metadata for table-2 should show all fields for table-2, but the FK target info shouldn't be hydrated
    (set (for [field (:fields ((test-users/user->client :rasta) :get 200 (format "table/%d/query_metadata" (u/get-id table-2))))]
           (-> (select-keys field [:name :target])
               (update :target boolean))))))


;; ## PUT /api/table/:id
(tt/expect-with-temp [Table [table]]
  (merge
   (-> (table-defaults)
       (dissoc :segments :field_values :metrics)
       (assoc-in [:db :details] (:details (mt/db))))
   (db/select-one [Table :id :schema :name :created_at :fields_hash] :id (u/get-id table))
   {:description     "What a nice table!"
    :entity_type     nil
    :visibility_type "hidden"
    :rows            nil
    :display_name    "Userz"
    :pk_field        (table/pk-field-id table)})
  (do
    ((test-users/user->client :crowberto) :put 200 (format "table/%d" (u/get-id table))
     {:display_name    "Userz"
      :visibility_type "hidden"
      :description     "What a nice table!"})
    (dissoc ((test-users/user->client :crowberto) :get 200 (format "table/%d" (u/get-id table)))
            :updated_at)))

;; see how many times sync-table! gets called when we call the PUT endpoint. It should happen when you switch from
;; hidden -> not hidden at the spots marked below, twice total
(tt/expect-with-temp [Table [table]]
  2
  (let [original-sync-table! sync/sync-table!
        called (atom 0)
        test-fun (fn [state]
                   (with-redefs [sync/sync-table! (fn [& args] (swap! called inc)
                                                    (apply original-sync-table! args))]
                     ((test-users/user->client :crowberto) :put 200 (format "table/%d" (:id table)) {:display_name    "Userz"
                                                                                                     :visibility_type state
                                                                                                     :description     "What a nice table!"})))]
    (do (test-fun "hidden")
        (test-fun nil)                  ; <- should get synced
        (test-fun "hidden")
        (test-fun "cruft")
        (test-fun "technical")
        (test-fun nil)                  ; <- should get synced again
        (test-fun "technical")
        @called)))

;; ## GET /api/table/:id/fks
;; We expect a single FK from CHECKINS.USER_ID -> USERS.ID
(expect
  (let [checkins-user-field (Field (mt/id :checkins :user_id))
        users-id-field      (Field (mt/id :users :id))
        fk-field-defaults   (dissoc field-defaults :target :dimension_options :default_dimension_option)]
    [{:origin_id      (:id checkins-user-field)
      :destination_id (:id users-id-field)
      :relationship   "Mt1"
      :origin         (-> (fk-field-details checkins-user-field)
                          (dissoc :target :dimensions :values)
                          (assoc :table_id      (mt/id :checkins)
                                 :name          "USER_ID"
                                 :display_name  "User ID"
                                 :database_type "INTEGER"
                                 :base_type     "type/Integer"
                                 :special_type  "type/FK"
                                 :table         (merge
                                                 (dissoc (table-defaults) :segments :field_values :metrics)
                                                 (db/select-one [Table :id :created_at :updated_at :fields_hash]
                                                   :id (mt/id :checkins))
                                                 {:schema       "PUBLIC"
                                                  :name         "CHECKINS"
                                                  :display_name "Checkins"
                                                  :entity_type  "entity/EventTable"
                                                  :rows         nil})))
      :destination    (-> (fk-field-details users-id-field)
                          (dissoc :target :dimensions :values)
                          (assoc :table_id      (mt/id :users)
                                 :name          "ID"
                                 :display_name  "ID"
                                 :base_type     "type/BigInteger"
                                 :database_type "BIGINT"
                                 :special_type  "type/PK"
                                 :table         (merge
                                                 (dissoc (table-defaults) :db :segments :field_values :metrics)
                                                 (db/select-one [Table :id :created_at :updated_at :fields_hash]
                                                   :id (mt/id :users))
                                                 {:schema       "PUBLIC"
                                                  :name         "USERS"
                                                  :display_name "Users"
                                                  :entity_type  "entity/UserTable"
                                                  :rows         nil})))}])
  ((test-users/user->client :rasta) :get 200 (format "table/%d/fks" (mt/id :users))))

(defn- with-field-literal-id [{field-name :name, base-type :base_type :as field}]
  (assoc field :id ["field-literal" field-name base-type]))

(defn- default-card-field-for-venues [table-id]
  {:table_id                 table-id
   :special_type             nil
   :default_dimension_option nil
   :dimension_options        []})

(defn- with-numeric-dimension-options [field]
  (assoc field
    :default_dimension_option (var-get #'table-api/numeric-default-index)
    :dimension_options (var-get #'table-api/numeric-dimension-indexes)))

(defn- with-coordinate-dimension-options [field]
  (assoc field
    :default_dimension_option (var-get #'table-api/coordinate-default-index)
    :dimension_options (var-get #'table-api/coordinate-dimension-indexes)))

;; Make sure metadata for 'virtual' tables comes back as expected from GET /api/table/:id/query_metadata
(tt/expect-with-temp [Card [card {:name          "Go Dubs!"
                                  :database_id   (mt/id)
                                  :dataset_query {:database (mt/id)
                                                  :type     :native
                                                  :native   {:query (format "SELECT NAME, ID, PRICE, LATITUDE FROM VENUES")}}}]]
  (let [card-virtual-table-id (str "card__" (u/get-id card))]
    {:display_name      "Go Dubs!"
     :schema            "Everything else"
     :db_id             (:database_id card)
     :id                card-virtual-table-id
     :description       nil
     :dimension_options (default-dimension-options)
     :fields            (map (comp #(merge (default-card-field-for-venues card-virtual-table-id) %)
                                   with-field-literal-id)
                             [{:name         "NAME"
                               :display_name "NAME"
                               :base_type    "type/Text"
                               :special_type "type/Name"
                               :fingerprint  (:name mutil/venue-fingerprints)}
                              {:name         "ID"
                               :display_name "ID"
                               :base_type    "type/BigInteger"
                               :special_type nil
                               :fingerprint  (:id mutil/venue-fingerprints)}
                              (with-numeric-dimension-options
                                {:name         "PRICE"
                                 :display_name "PRICE"
                                 :base_type    "type/Integer"
                                 :special_type nil
                                 :fingerprint  (:price mutil/venue-fingerprints)})
                              (with-coordinate-dimension-options
                                {:name         "LATITUDE"
                                 :display_name "LATITUDE"
                                 :base_type    "type/Float"
                                 :special_type "type/Latitude"
                                 :fingerprint  (:latitude mutil/venue-fingerprints)})])})
  (do
    ;; run the Card which will populate its result_metadata column
    ((test-users/user->client :crowberto) :post 202 (format "card/%d/query" (u/get-id card)))
    ;; Now fetch the metadata for this "table"
    (->> card
         u/get-id
         (format "table/card__%d/query_metadata")
         ((test-users/user->client :crowberto) :get 200)
         (tu/round-fingerprint-cols [:fields])
         (tu/round-all-decimals 2))))

(deftest include-date-dimensions-in-nested-query-test
  (testing "Test date dimensions being included with a nested query"
    (mt/with-temp Card [card {:name          "Users"
                              :database_id   (mt/id)
                              :dataset_query {:database (mt/id)
                                              :type     :native
                                              :native   {:query (format "SELECT NAME, LAST_LOGIN FROM USERS")}}}]
      (let [card-virtual-table-id (str "card__" (u/get-id card))]
        ;; run the Card which will populate its result_metadata column
        ((test-users/user->client :crowberto) :post 202 (format "card/%d/query" (u/get-id card)))
        ;; Now fetch the metadata for this "table" via the API
        (let [[name-metadata last-login-metadata] (db/select-one-field :result_metadata Card :id (u/get-id card))]
          (is (= {:display_name      "Users"
                  :schema            "Everything else"
                  :db_id             (:database_id card)
                  :id                card-virtual-table-id
                  :description       nil
                  :dimension_options (default-dimension-options)
                  :fields            [{:name                     "NAME"
                                       :display_name             "NAME"
                                       :base_type                "type/Text"
                                       :table_id                 card-virtual-table-id
                                       :id                       ["field-literal" "NAME" "type/Text"]
                                       :special_type             "type/Name"
                                       :default_dimension_option nil
                                       :dimension_options        []
                                       :fingerprint              (:fingerprint name-metadata)}
                                      {:name                     "LAST_LOGIN"
                                       :display_name             "LAST_LOGIN"
                                       :base_type                "type/DateTime"
                                       :table_id                 card-virtual-table-id
                                       :id                       ["field-literal" "LAST_LOGIN" "type/DateTime"]
                                       :special_type             nil
                                       :default_dimension_option (var-get #'table-api/date-default-index)
                                       :dimension_options        (var-get #'table-api/datetime-dimension-indexes)
                                       :fingerprint              (:fingerprint last-login-metadata)}]}
                 ((test-users/user->client :crowberto) :get 200
                  (format "table/card__%d/query_metadata" (u/get-id card))))))))))


;; make sure GET /api/table/:id/fks just returns nothing for 'virtual' tables
(expect
  []
  ((test-users/user->client :crowberto) :get 200 "table/card__1000/fks"))

(defn- narrow-fields [category-names api-response]
  (for [field (:fields api-response)
        :when (contains? (set category-names) (:name field))]
    (-> field
        (select-keys [:id :table_id :name :values :dimensions])
        (update :dimensions (fn [dim]
                              (if (map? dim)
                                (dissoc dim :id :created_at :updated_at)
                                dim))))))

(defn- category-id-special-type
  "Field values will only be returned when the field's special type is set to type/Category. This function will change
  that for `category_id`, then invoke `f` and roll it back afterwards"
  [special-type f]
  (tu/with-temp-vals-in-db Field (mt/id :venues :category_id) {:special_type special-type}
    (f)))

;; ## GET /api/table/:id/query_metadata
;; Ensure internal remapped dimensions and human_readable_values are returned
(expect
  [{:table_id   (mt/id :venues)
    :id         (mt/id :venues :category_id)
    :name       "CATEGORY_ID"
    :dimensions {:name "Foo", :field_id (mt/id :venues :category_id), :human_readable_field_id nil, :type "internal"}}
   {:id         (mt/id :venues :price)
    :table_id   (mt/id :venues)
    :name       "PRICE"
    :dimensions []}]
  (mt/with-temp-objects
    (data/create-venue-category-remapping "Foo")
    (category-id-special-type
     :type/Category
     (fn []
       (narrow-fields ["PRICE" "CATEGORY_ID"]
                      ((test-users/user->client :rasta) :get 200 (format "table/%d/query_metadata" (mt/id :venues))))))))

;; ## GET /api/table/:id/query_metadata
;; Ensure internal remapped dimensions and human_readable_values are returned when type is enum
(expect
  [{:table_id   (mt/id :venues)
    :id         (mt/id :venues :category_id)
    :name       "CATEGORY_ID"
    :dimensions {:name "Foo", :field_id (mt/id :venues :category_id), :human_readable_field_id nil, :type "internal"}}
   {:id         (mt/id :venues :price)
    :table_id   (mt/id :venues)
    :name       "PRICE"
    :dimensions []}]
  (mt/with-temp-objects
    (data/create-venue-category-remapping "Foo")
    (category-id-special-type
     :type/Enum
     (fn []
       (narrow-fields ["PRICE" "CATEGORY_ID"]
                      ((test-users/user->client :rasta) :get 200 (format "table/%d/query_metadata" (mt/id :venues))))))))

;; ## GET /api/table/:id/query_metadata
;; Ensure FK remappings are returned
(expect
  [{:table_id   (mt/id :venues)
    :id         (mt/id :venues :category_id)
    :name       "CATEGORY_ID"
    :dimensions {:name "Foo", :field_id (mt/id :venues :category_id), :human_readable_field_id (mt/id :categories :name), :type "external"}}
   {:id         (mt/id :venues :price)
    :table_id   (mt/id :venues)
    :name       "PRICE"
    :dimensions []}]
  (mt/with-temp-objects
    (data/create-venue-category-fk-remapping "Foo")
    (category-id-special-type
     :type/Category
     (fn []
       (narrow-fields ["PRICE" "CATEGORY_ID"]
                      ((test-users/user->client :rasta) :get 200 (format "table/%d/query_metadata" (mt/id :venues))))))))

;; Ensure dimensions options are sorted numerically, but returned as strings
(expect
  (map str (sort (map #(Long/parseLong %) (var-get #'table-api/datetime-dimension-indexes))))
  (var-get #'table-api/datetime-dimension-indexes))

(expect
  (map str (sort (map #(Long/parseLong %) (var-get #'table-api/numeric-dimension-indexes))))
  (var-get #'table-api/numeric-dimension-indexes))

;; Numeric fields without min/max values should not have binning strategies
(expect
  []
  (let [fingerprint      (db/select-one-field :fingerprint Field {:id (mt/id :venues :latitude)})
        temp-fingerprint (-> fingerprint
                             (assoc-in [:type :type/Number :max] nil)
                             (assoc-in [:type :type/Number :min] nil))]
    (tu/with-temp-vals-in-db Field (mt/id :venues :latitude) {:fingerprint temp-fingerprint}
      (-> ((test-users/user->client :rasta) :get 200 (format "table/%d/query_metadata" (mt/id :categories)))
          (get-in [:fields])
          first
          :dimension_options))))

(defn- dimension-options-for-field [response, ^String field-name]
  (->> response
       :fields
       (m/find-first #(.equalsIgnoreCase field-name, ^String (:name %)))
       :dimension_options))

(defn- extract-dimension-options
  "For the given `field-name` find it's dimension_options following the indexes given in the field"
  [response field-name]
  (set
   (for [dim-index (dimension-options-for-field response field-name)
         :let [{[_ _ strategy _] :mbql} (get-in response [:dimension_options (keyword dim-index)])]]
     strategy)))

;; Lat/Long fields should use bin-width rather than num-bins
(expect
  (if (data/binning-supported?)
    #{nil "bin-width" "default"}
    #{})
  (let [response ((test-users/user->client :rasta) :get 200 (format "table/%d/query_metadata" (mt/id :venues)))]
    (extract-dimension-options response "latitude")))

;; Number columns without a special type should use "num-bins"
(expect
  (if (data/binning-supported?)
    #{nil "num-bins" "default"}
    #{})
  (tu/with-temp-vals-in-db Field (mt/id :venues :price) {:special_type nil}
    (let [response ((test-users/user->client :rasta) :get 200 (format "table/%d/query_metadata" (mt/id :venues)))]
      (extract-dimension-options response "price"))))

;; Ensure unix timestamps show date binning options, not numeric binning options
(expect
  (var-get #'table-api/datetime-dimension-indexes)
  (mt/dataset sad-toucan-incidents
    (let [response ((test-users/user->client :rasta) :get 200 (format "table/%d/query_metadata" (mt/id :incidents)))]
      (dimension-options-for-field response "timestamp"))))

;; Datetime binning options should showup whether the backend supports binning of numeric values or not
(datasets/expect-with-drivers #{:druid}
  (var-get #'table-api/datetime-dimension-indexes)
  (tqpt/with-flattened-dbdef
    (let [response ((test-users/user->client :rasta) :get 200 (format "table/%d/query_metadata" (mt/id :checkins)))]
      (dimension-options-for-field response "timestamp"))))

(qpt/expect-with-non-timeseries-dbs
  (var-get #'table-api/datetime-dimension-indexes)
  (let [response ((test-users/user->client :rasta) :get 200 (format "table/%d/query_metadata" (mt/id :checkins)))]
    (dimension-options-for-field response "date")))

(datasets/expect-with-drivers (qpt/normal-drivers-except #{:sparksql :mongo :oracle :redshift})
  []
  (mt/dataset test-data-with-time
    (let [response ((test-users/user->client :rasta) :get 200 (format "table/%d/query_metadata" (mt/id :users)))] (dimension-options-for-field response "last_login_time"))))

;; Test related/recommended entities
(expect
  #{:metrics :segments :linked-from :linking-to :tables}
  (-> ((test-users/user->client :crowberto) :get 200 (format "table/%s/related" (mt/id :venues))) keys set))

;; Nested queries with a fingerprint should have dimension options for binning
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :binning :nested-queries)
  (repeat 2 (var-get #'table-api/coordinate-dimension-indexes))
  (tt/with-temp Card [card {:database_id   (mt/id)
                            :dataset_query {:database (mt/id)
                                            :type    :query
                                            :query    {:source-query {:source-table (mt/id :venues)}}}}]
    ;; run the Card which will populate its result_metadata column
    ((test-users/user->client :crowberto) :post 202 (format "card/%d/query" (u/get-id card)))
    (let [response ((test-users/user->client :crowberto) :get 200 (format "table/card__%d/query_metadata" (u/get-id card)))]
      (map #(dimension-options-for-field response %)
           ["latitude" "longitude"]))))

;; Nested queries missing a fingerprint should not show binning-options
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :binning :nested-queries)
  [nil nil]
  (tt/with-temp Card [card {:database_id   (mt/id)
                            :dataset_query {:database (mt/id)
                                            :type    :query
                                            :query    {:source-query {:source-table (mt/id :venues)}}}}]
    ;; By default result_metadata will be nil (and no fingerprint). Just asking for query_metadata after the card was
    ;; created but before it was ran should not allow binning
    (let [response ((test-users/user->client :crowberto) :get 200 (format "table/card__%d/query_metadata" (u/get-id card)))]
      (map #(dimension-options-for-field response %)
           ["latitude" "longitude"]))))

;; test POST /api/table/:id/discard_values
(defn- discard-values [user expected-status-code]
  (tt/with-temp* [Table       [table        {}]
                  Field       [field        {:table_id (u/get-id table)}]
                  FieldValues [field-values {:field_id (u/get-id field), :values ["A" "B" "C"]}]]
    {:response ((test-users/user->client user) :post expected-status-code (format "table/%d/discard_values" (u/get-id table)))
     :deleted? (not (db/exists? FieldValues :id (u/get-id field-values)))}))

;; Non-admin toucans should not be allowed to discard values
(expect
  {:response "You don't have permissions to do that."
   :deleted? false}
  (discard-values :rasta 403))

;; Admins should be able to successfuly delete them
(expect
  {:response {:status "success"}
   :deleted? true}
  (discard-values :crowberto 200))

;; For tables that don't exist, we should return a 404
(expect
  "Not found."
  ((test-users/user->client :crowberto) :post 404 (format "table/%d/discard_values" Integer/MAX_VALUE)))
