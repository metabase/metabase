(ns metabase.api.table-test
  "Tests for /api/table endpoints."
  (:require [clojure.walk :as walk]
            [expectations :refer :all]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [http-client :as http]
             [middleware :as middleware]
             [query-processor-test :as qpt]
             [sync :as sync]
             [util :as u]]
            [metabase.api.table :as table-api]
            [metabase.models
             [card :refer [Card]]
             [database :as database :refer [Database]]
             [field :refer [Field]]
             [permissions :as perms]
             [permissions-group :as perms-group]
             [table :as table :refer [Table]]]
            [metabase.test
             [data :as data]
             [util :as tu :refer [match-$]]]
            [metabase.test.data
             [dataset-definitions :as defs]
             [datasets :as datasets]
             [users :refer [user->client]]]
            [metabase.timeseries-query-processor-test.util :as tqpt]
            [toucan
             [db :as db]
             [hydrate :as hydrate]]
            [toucan.util.test :as tt]))

;; ## /api/org/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get middleware/response-unauthentic :body) (http/client :get 401 "table"))
(expect (get middleware/response-unauthentic :body) (http/client :get 401 (format "table/%d" (data/id :users))))


;; Helper Fns

(defn- db-details []
  (match-$ (data/db)
    {:created_at                  $
     :engine                      "h2"
     :id                          $
     :updated_at                  $
     :name                        "test-data"
     :is_sample                   false
     :is_full_sync                true
     :is_on_demand                false
     :description                 nil
     :caveats                     nil
     :points_of_interest          nil
     :features                    (mapv name (driver/features (driver/engine->driver :h2)))
     :cache_field_values_schedule "0 50 0 * * ? *"
     :metadata_sync_schedule      "0 50 * * * ? *"
     :options                     nil
     :timezone                    $}))

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
   :db_id                   (data/id)
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
   :default_dimension_option nil})

(defn- field-details [field]
  (merge
   field-defaults
   (match-$ field
     {:updated_at          $
      :id                  $
      :created_at          $
      :fk_target_field_id  $
      :raw_column_id       $
      :last_analyzed       $
      :fingerprint         $
      :fingerprint_version $})))

(defn- fk-field-details [field]
  (-> (field-details field)
      (dissoc :dimension_options :default_dimension_option)))


;; ## GET /api/table
;; These should come back in alphabetical order and include relevant metadata
(expect
  #{{:name         (data/format-name "categories")
     :display_name "Categories"
     :rows         0
     :id           (data/id :categories)
     :entity_type  "entity/GenericTable"}
    {:name         (data/format-name "checkins")
     :display_name "Checkins"
     :rows         0
     :id           (data/id :checkins)
     :entity_type  "entity/EventTable"}
    {:name         (data/format-name "users")
     :display_name "Users"
     :rows         0
     :id           (data/id :users)
     :entity_type  "entity/UserTable"}
    {:name         (data/format-name "venues")
     :display_name "Venues"
     :rows         0
     :id           (data/id :venues)
     :entity_type  "entity/GenericTable"}}
  (->> ((user->client :rasta) :get 200 "table")
       (filter #(= (:db_id %) (data/id))) ; prevent stray tables from affecting unit test results
       (map #(dissoc %
                     :raw_table_id :db :created_at :updated_at :schema :entity_name :description :visibility_type
                     :caveats :points_of_interest :show_in_getting_started :db_id :active))
       set))


;; ## GET /api/table/:id
(expect
  (merge (dissoc (table-defaults) :segments :field_values :metrics)
         (match-$ (Table (data/id :venues))
           {:schema       "PUBLIC"
            :name         "VENUES"
            :display_name "Venues"
            :rows         nil
            :updated_at   $
            :pk_field     (#'table/pk-field-id $$)
            :id           (data/id :venues)
            :db_id        (data/id)
            :raw_table_id $
            :created_at   $}))
  ((user->client :rasta) :get 200 (format "table/%d" (data/id :venues))))

;; GET /api/table/:id should return a 403 for a user that doesn't have read permissions for the table
(tt/expect-with-temp [Database [{database-id :id}]
                      Table    [{table-id :id}    {:db_id database-id}]]
  "You don't have permissions to do that."
  (do
    (perms/delete-related-permissions! (perms-group/all-users) (perms/object-path database-id))
    ((user->client :rasta) :get 403 (str "table/" table-id))))

(defn- default-dimension-options []
  (->> #'table-api/dimension-options-for-response
       var-get
       walk/keywordize-keys))

(defn- query-metadata-defaults []
  (-> (table-defaults)
      (assoc :dimension_options (default-dimension-options))))

;; ## GET /api/table/:id/query_metadata
(expect
  (merge (query-metadata-defaults)
         (match-$ (hydrate/hydrate (Table (data/id :categories)) :field_values)
           {:schema       "PUBLIC"
            :name         "CATEGORIES"
            :display_name "Categories"
            :fields       [(assoc (field-details (Field (data/id :categories :id)))
                             :table_id         (data/id :categories)
                             :special_type     "type/PK"
                             :name             "ID"
                             :display_name     "ID"
                             :database_type    "BIGINT"
                             :base_type        "type/BigInteger"
                             :has_field_values "none")
                           (assoc (field-details (Field (data/id :categories :name)))
                             :table_id                 (data/id :categories)
                             :special_type             "type/Name"
                             :name                     "NAME"
                             :display_name             "Name"
                             :database_type            "VARCHAR"
                             :base_type                "type/Text"
                             :dimension_options        []
                             :default_dimension_option nil
                             :has_field_values         "list")]
            :rows         nil
            :updated_at   $
            :id           (data/id :categories)
            :raw_table_id $
            :created_at   $}))
  ((user->client :rasta) :get 200 (format "table/%d/query_metadata" (data/id :categories))))


(def ^:private user-last-login-date-strs
  "In an effort to be really annoying, the date strings returned by the API are different on Circle than they are
   locally. Generate strings like '2014-01-01' at runtime so we get matching values."
  (let [format-inst (fn [^java.util.Date inst]
                      (format "%d-%02d-%02d"
                              (+ (.getYear inst) 1900)
                              (+ (.getMonth inst) 1)
                              (.getDate inst)))]
    (->> (defs/field-values defs/test-data-map "users" "last_login")
         (map format-inst)
         set
         sort
         vec)))

(def ^:private user-full-names
  (defs/field-values defs/test-data-map "users" "name"))

;;; GET api/table/:id/query_metadata?include_sensitive_fields
;; Make sure that getting the User table *does* include info about the password field, but not actual values
;; themselves
(expect
  (merge (query-metadata-defaults)
         (match-$ (Table (data/id :users))
           {:schema       "PUBLIC"
            :name         "USERS"
            :display_name "Users"
            :entity_type  "entity/UserTable"
            :fields       [(assoc (field-details (Field (data/id :users :id)))
                             :special_type     "type/PK"
                             :table_id         (data/id :users)
                             :name             "ID"
                             :display_name     "ID"
                             :database_type    "BIGINT"
                             :base_type        "type/BigInteger"
                             :visibility_type  "normal"
                             :has_field_values "none")
                           (assoc (field-details (Field (data/id :users :last_login)))
                             :table_id                 (data/id :users)
                             :name                     "LAST_LOGIN"
                             :display_name             "Last Login"
                             :database_type            "TIMESTAMP"
                             :base_type                "type/DateTime"
                             :visibility_type          "normal"
                             :dimension_options        (var-get #'table-api/datetime-dimension-indexes)
                             :default_dimension_option (var-get #'table-api/date-default-index)
                             :has_field_values         "none")
                           (assoc (field-details (Field (data/id :users :name)))
                             :special_type             "type/Name"
                             :table_id                 (data/id :users)
                             :name                     "NAME"
                             :display_name             "Name"
                             :database_type            "VARCHAR"
                             :base_type                "type/Text"
                             :visibility_type          "normal"
                             :dimension_options        []
                             :default_dimension_option nil
                             :has_field_values         "list")
                           (assoc (field-details (Field :table_id (data/id :users), :name "PASSWORD"))
                             :special_type     "type/Category"
                             :table_id         (data/id :users)
                             :name             "PASSWORD"
                             :display_name     "Password"
                             :database_type    "VARCHAR"
                             :base_type        "type/Text"
                             :visibility_type  "sensitive"
                             :has_field_values "list")]
            :rows         nil
            :updated_at   $
            :id           (data/id :users)
            :raw_table_id $
            :created_at   $}))
  ((user->client :rasta) :get 200 (format "table/%d/query_metadata?include_sensitive_fields=true" (data/id :users))))

;;; GET api/table/:id/query_metadata
;;; Make sure that getting the User table does *not* include password info
(expect
  (merge (query-metadata-defaults)
         (match-$ (Table (data/id :users))
           {:schema       "PUBLIC"
            :name         "USERS"
            :display_name "Users"
            :entity_type  "entity/UserTable"
            :fields       [(assoc (field-details (Field (data/id :users :id)))
                             :table_id         (data/id :users)
                             :special_type     "type/PK"
                             :name             "ID"
                             :display_name     "ID"
                             :database_type    "BIGINT"
                             :base_type        "type/BigInteger"
                             :has_field_values "none")
                           (assoc (field-details (Field (data/id :users :last_login)))
                             :table_id                 (data/id :users)
                             :name                     "LAST_LOGIN"
                             :display_name             "Last Login"
                             :database_type            "TIMESTAMP"
                             :base_type                "type/DateTime"
                             :dimension_options        (var-get #'table-api/datetime-dimension-indexes)
                             :default_dimension_option (var-get #'table-api/date-default-index)
                             :has_field_values         "none")
                           (assoc (field-details (Field (data/id :users :name)))
                             :table_id         (data/id :users)
                             :special_type     "type/Name"
                             :name             "NAME"
                             :display_name     "Name"
                             :database_type    "VARCHAR"
                             :base_type        "type/Text"
                             :has_field_values "list")]
            :rows         nil
            :updated_at   $
            :id           (data/id :users)
            :raw_table_id $
            :created_at   $}))
  ((user->client :rasta) :get 200 (format "table/%d/query_metadata" (data/id :users))))

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
    (set (for [field (:fields ((user->client :rasta) :get 200 (format "table/%d/query_metadata" (u/get-id table-2))))]
           (-> (select-keys field [:name :target])
               (update :target boolean))))))


;; ## PUT /api/table/:id
(tt/expect-with-temp [Table [table]]
  (merge (-> (table-defaults)
             (dissoc :segments :field_values :metrics)
             (assoc-in [:db :details] {:db "mem:test-data;USER=GUEST;PASSWORD=guest"}))
         (match-$ table
           {:description     "What a nice table!"
            :entity_type     nil
            :visibility_type "hidden"
            :schema          $
            :name            $
            :rows            nil
            :display_name    "Userz"
            :pk_field        (#'table/pk-field-id $$)
            :id              $
            :raw_table_id    $
            :created_at      $}))
  (do ((user->client :crowberto) :put 200 (format "table/%d" (:id table)) {:display_name    "Userz"
                                                                           :visibility_type "hidden"
                                                                           :description     "What a nice table!"})
      (dissoc ((user->client :crowberto) :get 200 (format "table/%d" (:id table)))
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
                     ((user->client :crowberto) :put 200 (format "table/%d" (:id table)) {:display_name    "Userz"
                                                                                          :visibility_type state
                                                                                          :description     "What a nice table!"})))]
    (do (test-fun "hidden")
        (test-fun nil)         ; <- should get synced
        (test-fun "hidden")
        (test-fun "cruft")
        (test-fun "technical")
        (test-fun nil)         ; <- should get synced again
        (test-fun "technical")
        @called)))

;; ## GET /api/table/:id/fks
;; We expect a single FK from CHECKINS.USER_ID -> USERS.ID
(expect
  (let [checkins-user-field (Field (data/id :checkins :user_id))
        users-id-field      (Field (data/id :users :id))
        fk-field-defaults   (dissoc field-defaults :target :dimension_options :default_dimension_option)]
    [{:origin_id      (:id checkins-user-field)
      :destination_id (:id users-id-field)
      :relationship   "Mt1"
      :origin         (-> (fk-field-details checkins-user-field)
                          (dissoc :target :dimensions :values)
                          (assoc :table_id      (data/id :checkins)
                                 :name          "USER_ID"
                                 :display_name  "User ID"
                                 :database_type "INTEGER"
                                 :base_type     "type/Integer"
                                 :special_type  "type/FK"
                                 :table         (merge (dissoc (table-defaults) :segments :field_values :metrics)
                                                       (match-$ (Table (data/id :checkins))
                                                         {:schema       "PUBLIC"
                                                          :name         "CHECKINS"
                                                          :display_name "Checkins"
                                                          :entity_type  "entity/EventTable"
                                                          :rows         nil
                                                          :updated_at   $
                                                          :id           $
                                                          :raw_table_id $
                                                          :created_at   $}))))
      :destination    (-> (fk-field-details users-id-field)
                          (dissoc :target :dimensions :values)
                          (assoc :table_id      (data/id :users)
                                 :name          "ID"
                                 :display_name  "ID"
                                 :base_type     "type/BigInteger"
                                 :database_type "BIGINT"
                                 :special_type  "type/PK"
                                 :table         (merge (dissoc (table-defaults) :db :segments :field_values :metrics)
                                                       (match-$ (Table (data/id :users))
                                                         {:schema       "PUBLIC"
                                                          :name         "USERS"
                                                          :display_name "Users"
                                                          :entity_type  "entity/UserTable"
                                                          :rows         nil
                                                          :updated_at   $
                                                          :id           $
                                                          :raw_table_id $
                                                          :created_at   $}))))}])
  ((user->client :rasta) :get 200 (format "table/%d/fks" (data/id :users))))

;; Make sure metadata for 'virtual' tables comes back as expected from GET /api/table/:id/query_metadata
(tt/expect-with-temp [Card [card {:name          "Go Dubs!"
                                  :database_id   (data/id)
                                  :dataset_query {:database (data/id)
                                                  :type     :native
                                                  :native   {:query (format "SELECT NAME, ID, PRICE, LATITUDE FROM VENUES")}}}]]
  (let [card-virtual-table-id (str "card__" (u/get-id card))]
    {:display_name      "Go Dubs!"
     :schema            "Everything else"
     :db_id             database/virtual-id
     :id                card-virtual-table-id
     :description       nil
     :dimension_options (default-dimension-options)
     :fields            (for [[field-name display-name base-type] [["NAME"     "Name"     "type/Text"]
                                                                   ["ID"       "ID"       "type/Integer"]
                                                                   ["PRICE"    "Price"    "type/Integer"]
                                                                   ["LATITUDE" "Latitude" "type/Float"]]]
                          {:name                     field-name
                           :display_name             display-name
                           :base_type                base-type
                           :table_id                 card-virtual-table-id
                           :id                       ["field-literal" field-name base-type]
                           :special_type             nil
                           :default_dimension_option nil
                           :dimension_options        []})})
  (do
    ;; run the Card which will populate its result_metadata column
    ((user->client :crowberto) :post 200 (format "card/%d/query" (u/get-id card)))
    ;; Now fetch the metadata for this "table"
    ((user->client :crowberto) :get 200 (format "table/card__%d/query_metadata" (u/get-id card)))))

;; Test date dimensions being included with a nested query
(tt/expect-with-temp [Card [card {:name          "Users"
                                  :database_id   (data/id)
                                  :dataset_query {:database (data/id)
                                                  :type     :native
                                                  :native   {:query (format "SELECT NAME, LAST_LOGIN FROM USERS")}}}]]
  (let [card-virtual-table-id (str "card__" (u/get-id card))]
    {:display_name      "Users"
     :schema            "Everything else"
     :db_id             database/virtual-id
     :id                card-virtual-table-id
     :description       nil
     :dimension_options (default-dimension-options)
     :fields            [{:name                     "NAME"
                          :display_name             "Name"
                          :base_type                "type/Text"
                          :table_id                 card-virtual-table-id
                          :id                       ["field-literal" "NAME" "type/Text"]
                          :special_type             nil
                          :default_dimension_option nil
                          :dimension_options        []}
                         {:name                     "LAST_LOGIN"
                          :display_name             "Last Login"
                          :base_type                "type/DateTime"
                          :table_id                 card-virtual-table-id
                          :id                       ["field-literal" "LAST_LOGIN" "type/DateTime"]
                          :special_type             nil
                          :default_dimension_option (var-get #'table-api/date-default-index)
                          :dimension_options        (var-get #'table-api/datetime-dimension-indexes)}]})
  (do
    ;; run the Card which will populate its result_metadata column
    ((user->client :crowberto) :post 200 (format "card/%d/query" (u/get-id card)))
    ;; Now fetch the metadata for this "table"
    ((user->client :crowberto) :get 200 (format "table/card__%d/query_metadata" (u/get-id card)))))


;; make sure GET /api/table/:id/fks just returns nothing for 'virtual' tables
(expect
  []
  ((user->client :crowberto) :get 200 "table/card__1000/fks"))

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
  (tu/with-temp-vals-in-db Field (data/id :venues :category_id) {:special_type special-type}
    (f)))

;; ## GET /api/table/:id/query_metadata
;; Ensure internal remapped dimensions and human_readable_values are returned
(expect
  [{:table_id   (data/id :venues)
    :id         (data/id :venues :category_id)
    :name       "CATEGORY_ID"
    :dimensions {:name "Foo", :field_id (data/id :venues :category_id), :human_readable_field_id nil, :type "internal"}}
   {:id         (data/id :venues :price)
    :table_id   (data/id :venues)
    :name       "PRICE"
    :dimensions []}]
  (data/with-data
    (data/create-venue-category-remapping "Foo")
    (category-id-special-type
     :type/Category
     (fn []
       (narrow-fields ["PRICE" "CATEGORY_ID"]
                      ((user->client :rasta) :get 200 (format "table/%d/query_metadata" (data/id :venues))))))))

;; ## GET /api/table/:id/query_metadata
;; Ensure internal remapped dimensions and human_readable_values are returned when type is enum
(expect
  [{:table_id   (data/id :venues)
    :id         (data/id :venues :category_id)
    :name       "CATEGORY_ID"
    :dimensions {:name "Foo", :field_id (data/id :venues :category_id), :human_readable_field_id nil, :type "internal"}}
   {:id         (data/id :venues :price)
    :table_id   (data/id :venues)
    :name       "PRICE"
    :dimensions []}]
  (data/with-data
    (data/create-venue-category-remapping "Foo")
    (category-id-special-type
     :type/Enum
     (fn []
       (narrow-fields ["PRICE" "CATEGORY_ID"]
                      ((user->client :rasta) :get 200 (format "table/%d/query_metadata" (data/id :venues))))))))

;; ## GET /api/table/:id/query_metadata
;; Ensure FK remappings are returned
(expect
  [{:table_id   (data/id :venues)
    :id         (data/id :venues :category_id)
    :name       "CATEGORY_ID"
    :dimensions {:name "Foo", :field_id (data/id :venues :category_id), :human_readable_field_id (data/id :categories :name), :type "external"}}
   {:id         (data/id :venues :price)
    :table_id   (data/id :venues)
    :name       "PRICE"
    :dimensions []}]
  (data/with-data
    (data/create-venue-category-fk-remapping "Foo")
    (category-id-special-type
     :type/Category
     (fn []
       (narrow-fields ["PRICE" "CATEGORY_ID"]
                      ((user->client :rasta) :get 200 (format "table/%d/query_metadata" (data/id :venues))))))))

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
  (let [fingerprint      (db/select-one-field :fingerprint Field {:id (data/id :venues :latitude)})
        temp-fingerprint (-> fingerprint
                             (assoc-in [:type :type/Number :max] nil)
                             (assoc-in [:type :type/Number :min] nil))]
    (tu/with-temp-vals-in-db Field (data/id :venues :latitude) {:fingerprint temp-fingerprint}
      (-> ((user->client :rasta) :get 200 (format "table/%d/query_metadata" (data/id :categories)))
          (get-in [:fields])
          first
          :dimension_options))))

(defn- dimension-options-for-field [response field-name]
  (let [formatted-field-name (data/format-name field-name)]
    (->> response
         :fields
         (m/find-first #(= formatted-field-name (:name %)))
         :dimension_options)))

(defn- extract-dimension-options
  "For the given `FIELD-NAME` find it's dimension_options following
  the indexes given in the field"
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
  (let [response ((user->client :rasta) :get 200 (format "table/%d/query_metadata" (data/id :venues)))]
    (extract-dimension-options response "latitude")))

;; Number columns without a special type should use "num-bins"
(expect
  (if (data/binning-supported?)
    #{nil "num-bins" "default"}
    #{})
  (tu/with-temp-vals-in-db Field (data/id :venues :price) {:special_type nil}
    (let [response ((user->client :rasta) :get 200 (format "table/%d/query_metadata" (data/id :venues)))]
      (extract-dimension-options response "price"))))

;; Ensure unix timestamps show date binning options, not numeric binning options
(expect
  (var-get #'table-api/datetime-dimension-indexes)
  (data/dataset sad-toucan-incidents
    (let [response ((user->client :rasta) :get 200 (format "table/%d/query_metadata" (data/id :incidents)))]
      (dimension-options-for-field response "timestamp"))))

;; Datetime binning options should showup whether the backend supports binning of numeric values or not
(datasets/expect-with-engines #{:druid}
  (var-get #'table-api/datetime-dimension-indexes)
  (tqpt/with-flattened-dbdef
    (let [response ((user->client :rasta) :get 200 (format "table/%d/query_metadata" (data/id :checkins)))]
      (dimension-options-for-field response "timestamp"))))

(qpt/expect-with-non-timeseries-dbs
 (var-get #'table-api/datetime-dimension-indexes)
 (let [response ((user->client :rasta) :get 200 (format "table/%d/query_metadata" (data/id :checkins)))]
   (dimension-options-for-field response "date")))

(qpt/expect-with-non-timeseries-dbs-except #{:oracle :mongo :redshift :sparksql}
  []
  (data/with-db (data/get-or-create-database! defs/test-data-with-time)
    (let [response ((user->client :rasta) :get 200 (format "table/%d/query_metadata" (data/id :users)))]
      (dimension-options-for-field response "last_login_time"))))

;; Test related/recommended entities
(expect
  #{:metrics :segments :linked-from :linking-to :tables}
  (-> ((user->client :crowberto) :get 200 (format "table/%s/related" (data/id :venues))) keys set))
