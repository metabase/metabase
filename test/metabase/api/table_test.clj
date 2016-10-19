(ns metabase.api.table-test
  "Tests for /api/table endpoints."
  (:require [expectations :refer :all]
            (metabase [db :as db]
                      [driver :as driver]
                      [http-client :as http]
                      [middleware :as middleware])
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]]
                             [permissions :as perms]
                             [permissions-group :as perms-group])
            [metabase.test.data :refer :all]
            (metabase.test.data [dataset-definitions :as defs]
                                [datasets :as datasets]
                                [users :refer :all])
            [metabase.test.util :refer [match-$ resolve-private-vars], :as tu]
            [metabase.util :as u]))

(resolve-private-vars metabase.models.table pk-field-id)


;; ## /api/org/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get middleware/response-unauthentic :body) (http/client :get 401 "table"))
(expect (get middleware/response-unauthentic :body) (http/client :get 401 (format "table/%d" (id :users))))


;; Helper Fns

(defn- db-details []
  (match-$ (db)
    {:created_at         $
     :engine             "h2"
     :id                 $
     :updated_at         $
     :name               "test-data"
     :is_sample          false
     :is_full_sync       true
     :description        nil
     :caveats            nil
     :points_of_interest nil
     :features           (mapv name (driver/features (driver/engine->driver :h2)))}))

(defn- table-defaults []
  {:description             nil
   :caveats                 nil
   :points_of_interest      nil
   :show_in_getting_started false
   :entity_type             nil
   :visibility_type         nil
   :db                      (db-details)
   :field_values            {}
   :entity_name             nil
   :active                  true
   :db_id                   (id)
   :segments                []
   :metrics                 []})

(def ^:private ^:const field-defaults
  {:description        nil
   :active             true
   :position           0
   :target             nil
   :preview_display    true
   :visibility_type    "normal"
   :caveats            nil
   :points_of_interest nil
   :parent_id          nil})


;; ## GET /api/table
;; These should come back in alphabetical order and include relevant metadata
(expect
  #{{:name         (format-name "categories")
     :display_name "Categories"
     :rows         75
     :id           (id :categories)}
    {:name         (format-name "checkins")
     :display_name "Checkins"
     :rows         1000
     :id           (id :checkins)}
    {:name         (format-name "users")
     :display_name "Users"
     :rows         15
     :id           (id :users)}
    {:name         (format-name "venues")
     :display_name "Venues"
     :rows         100
     :id           (id :venues)}}
  (->> ((user->client :rasta) :get 200 "table")
       (filter #(= (:db_id %) (id))) ; prevent stray tables from affecting unit test results
       (map #(dissoc %
                     :raw_table_id :db :created_at :updated_at :schema :entity_name :description :entity_type :visibility_type
                     :caveats :points_of_interest :show_in_getting_started :db_id :active))
       set))


;; ## GET /api/table/:id
(expect
  (merge (dissoc (table-defaults) :segments :field_values :metrics)
         (match-$ (Table (id :venues))
           {:schema       "PUBLIC"
            :name         "VENUES"
            :display_name "Venues"
            :rows         100
            :updated_at   $
            :pk_field     (pk-field-id $$)
            :id           (id :venues)
            :db_id        (id)
            :raw_table_id $
            :created_at   $}))
  ((user->client :rasta) :get 200 (format "table/%d" (id :venues))))

;; GET /api/table/:id should return a 403 for a user that doesn't have read permissions for the table
(tu/expect-with-temp [Database [{database-id :id}]
                      Table    [{table-id :id}    {:db_id database-id}]]
  "You don't have permissions to do that."
  (do
    (perms/delete-related-permissions! (perms-group/all-users) (perms/object-path database-id))
    ((user->client :rasta) :get 403 (str "table/" table-id))))

;; ## GET /api/table/:id/fields
(expect
  (let [defaults (-> field-defaults
                     (assoc :table_id (id :categories))
                     (dissoc :target))]
    [(merge defaults (match-$ (Field (id :categories :id))
                       {:special_type       "type/PK"
                        :name               "ID"
                        :display_name       "ID"
                        :updated_at         $
                        :id                 (id :categories :id)
                        :created_at         $
                        :base_type          "type/BigInteger"
                        :fk_target_field_id $
                        :raw_column_id      $
                        :last_analyzed      $}))
     (merge defaults (match-$ (Field (id :categories :name))
                       {:special_type       "type/Name"
                        :name               "NAME"
                        :display_name       "Name"
                        :updated_at         $
                        :id                 (id :categories :name)
                        :created_at         $
                        :base_type          "type/Text"
                        :fk_target_field_id $
                        :raw_column_id      $
                        :last_analyzed      $}))])
  ((user->client :rasta) :get 200 (format "table/%d/fields" (id :categories))))

;; ## GET /api/table/:id/query_metadata
(expect
  (merge (table-defaults)
         (match-$ (Table (id :categories))
           {:schema       "PUBLIC"
            :name         "CATEGORIES"
            :display_name "Categories"
            :fields       (let [defaults (assoc field-defaults :table_id (id :categories))]
                            [(merge defaults (match-$ (Field (id :categories :id))
                                               {:special_type       "type/PK"
                                                :name               "ID"
                                                :display_name       "ID"
                                                :updated_at         $
                                                :id                 $
                                                :position           0
                                                :created_at         $
                                                :base_type          "type/BigInteger"
                                                :fk_target_field_id $
                                                :raw_column_id      $
                                                :last_analyzed      $}))
                             (merge defaults (match-$ (Field (id :categories :name))
                                               {:special_type       "type/Name"
                                                :name               "NAME"
                                                :display_name       "Name"
                                                :updated_at         $
                                                :id                 $
                                                :position           0
                                                :created_at         $
                                                :base_type          "type/Text"
                                                :fk_target_field_id $
                                                :raw_column_id      $
                                                :last_analyzed      $}))])
            :rows         75
            :updated_at   $
            :id           (id :categories)
            :raw_table_id $
            :created_at   $}))
  ((user->client :rasta) :get 200 (format "table/%d/query_metadata" (id :categories))))


(def ^:private user-last-login-date-strs
  "In an effort to be really annoying, the date strings returned by the API are different on Circle than they are locally.
   Generate strings like '2014-01-01' at runtime so we get matching values."
  (let [format-inst (fn [^java.util.Date inst]
                      (format "%d-%02d-%02d"
                              (+ (.getYear inst) 1900)
                              (+ (.getMonth inst) 1)
                              (.getDate inst)))]
    (->> defs/test-data
         :table-definitions
         first
         :rows
         (map second)
         (map format-inst)
         set
         sort
         vec)))

;;; GET api/table/:id/query_metadata?include_sensitive_fields
;;; Make sure that getting the User table *does* include info about the password field, but not actual values themselves
(expect
  (merge (table-defaults)
         (match-$ (Table (id :users))
           {:schema       "PUBLIC"
            :name         "USERS"
            :display_name "Users"
            :fields       (let [defaults (assoc field-defaults :table_id (id :users))]
                            [(merge defaults (match-$ (Field (id :users :id))
                                               {:special_type       "type/PK"
                                                :name               "ID"
                                                :display_name       "ID"
                                                :updated_at         $
                                                :id                 $
                                                :created_at         $
                                                :base_type          "type/BigInteger"
                                                :visibility_type    "normal"
                                                :fk_target_field_id $
                                                :raw_column_id      $
                                                :last_analyzed      $}))
                             (merge defaults (match-$ (Field (id :users :last_login))
                                               {:special_type       nil
                                                :name               "LAST_LOGIN"
                                                :display_name       "Last Login"
                                                :updated_at         $
                                                :id                 $
                                                :created_at         $
                                                :base_type          "type/DateTime"
                                                :visibility_type    "normal"
                                                :fk_target_field_id $
                                                :raw_column_id      $
                                                :last_analyzed      $}))
                             (merge defaults (match-$ (Field (id :users :name))
                                               {:special_type       "type/Name"
                                                :name               "NAME"
                                                :display_name       "Name"
                                                :updated_at         $
                                                :id                 $
                                                :created_at         $
                                                :base_type          "type/Text"
                                                :visibility_type    "normal"
                                                :fk_target_field_id $
                                                :raw_column_id      $
                                                :last_analyzed      $}))
                             (merge defaults (match-$ (Field :table_id (id :users), :name "PASSWORD")
                                               {:special_type       "type/Category"
                                                :name               "PASSWORD"
                                                :display_name       "Password"
                                                :updated_at         $
                                                :id                 $
                                                :created_at         $
                                                :base_type          "type/Text"
                                                :visibility_type    "sensitive"
                                                :fk_target_field_id $
                                                :raw_column_id      $
                                                :last_analyzed      $}))])
            :rows         15
            :updated_at   $
            :id           (id :users)
            :raw_table_id $
            :field_values {(keyword (str (id :users :name)))
                           ["Broen Olujimi"
                            "Conchúr Tihomir"
                            "Dwight Gresham"
                            "Felipinho Asklepios"
                            "Frans Hevel"
                            "Kaneonuskatew Eiran"
                            "Kfir Caj"
                            "Nils Gotam"
                            "Plato Yeshua"
                            "Quentin Sören"
                            "Rüstem Hebel"
                            "Shad Ferdynand"
                            "Simcha Yan"
                            "Spiros Teofil"
                            "Szymon Theutrich"]}
            :created_at   $}))
  ((user->client :rasta) :get 200 (format "table/%d/query_metadata?include_sensitive_fields=true" (id :users))))

;;; GET api/table/:id/query_metadata
;;; Make sure that getting the User table does *not* include password info
(expect
  (merge (table-defaults)
         (match-$ (Table (id :users))
           {:schema       "PUBLIC"
            :name         "USERS"
            :display_name "Users"
            :fields       (let [defaults (assoc field-defaults :table_id (id :users))]
                            [(merge defaults (match-$ (Field (id :users :id))
                                               {:special_type       "type/PK"
                                                :name               "ID"
                                                :display_name       "ID"
                                                :updated_at         $
                                                :id                 $
                                                :created_at         $
                                                :base_type          "type/BigInteger"
                                                :fk_target_field_id $
                                                :raw_column_id      $
                                                :last_analyzed      $}))
                             (merge defaults (match-$ (Field (id :users :last_login))
                                               {:special_type       nil
                                                :name               "LAST_LOGIN"
                                                :display_name       "Last Login"
                                                :updated_at         $
                                                :id                 $
                                                :created_at         $
                                                :base_type          "type/DateTime"
                                                :fk_target_field_id $
                                                :raw_column_id      $
                                                :last_analyzed      $}))
                             (merge defaults (match-$ (Field (id :users :name))
                                               {:special_type       "type/Name"
                                                :name               "NAME"
                                                :display_name       "Name"
                                                :updated_at         $
                                                :id                 $
                                                :created_at         $
                                                :base_type          "type/Text"
                                                :fk_target_field_id $
                                                :raw_column_id      $
                                                :last_analyzed      $}))])
            :rows         15
            :updated_at   $
            :id           (id :users)
            :raw_table_id $
            :field_values {(keyword (str (id :users :name)))
                           ["Broen Olujimi"
                            "Conchúr Tihomir"
                            "Dwight Gresham"
                            "Felipinho Asklepios"
                            "Frans Hevel"
                            "Kaneonuskatew Eiran"
                            "Kfir Caj"
                            "Nils Gotam"
                            "Plato Yeshua"
                            "Quentin Sören"
                            "Rüstem Hebel"
                            "Shad Ferdynand"
                            "Simcha Yan"
                            "Spiros Teofil"
                            "Szymon Theutrich"]}
            :created_at   $}))
  ((user->client :rasta) :get 200 (format "table/%d/query_metadata" (id :users))))


;; ## PUT /api/table/:id
(tu/expect-with-temp [Table [table {:rows 15}]]
  (merge (-> (table-defaults)
             (dissoc :segments :field_values :metrics)
             (assoc-in [:db :details] {:short-lived? nil, :db "mem:test-data;USER=GUEST;PASSWORD=guest"}))
         (match-$ table
           {:description     "What a nice table!"
            :entity_type     "person"
            :visibility_type "hidden"
            :schema          $
            :name            $
            :rows            15
            :display_name    "Userz"
            :pk_field        (pk-field-id $$)
            :id              $
            :raw_table_id    $
            :created_at      $}))
  (do ((user->client :crowberto) :put 200 (format "table/%d" (:id table)) {:display_name    "Userz"
                                                                           :entity_type     "person"
                                                                           :visibility_type "hidden"
                                                                           :description     "What a nice table!"})
      (dissoc ((user->client :crowberto) :get 200 (format "table/%d" (:id table)))
              :updated_at)))


;; ## GET /api/table/:id/fks
;; We expect a single FK from CHECKINS.USER_ID -> USERS.ID
(expect
  (let [checkins-user-field (Field (id :checkins :user_id))
        users-id-field      (Field (id :users :id))]
    [{:origin_id      (:id checkins-user-field)
      :destination_id (:id users-id-field)
      :relationship   "Mt1"
      :origin         (merge (dissoc field-defaults :target)
                             (match-$ checkins-user-field
                               {:id                 $
                                :table_id           $
                                :raw_column_id      $
                                :name               "USER_ID"
                                :display_name       "User ID"
                                :base_type          "type/Integer"
                                :preview_display    $
                                :position           $
                                :special_type       "type/FK"
                                :fk_target_field_id $
                                :created_at         $
                                :updated_at         $
                                :last_analyzed      $
                                :table              (merge (dissoc (table-defaults) :segments :field_values :metrics)
                                                           (match-$ (Table (id :checkins))
                                                             {:schema       "PUBLIC"
                                                              :name         "CHECKINS"
                                                              :display_name "Checkins"
                                                              :rows         1000
                                                              :updated_at   $
                                                              :id           $
                                                              :raw_table_id $
                                                              :created_at   $}))}))
      :destination    (merge (dissoc field-defaults :target)
                             (match-$ users-id-field
                               {:id                 $
                                :table_id           $
                                :raw_column_id      $
                                :name               "ID"
                                :display_name       "ID"
                                :base_type          "type/BigInteger"
                                :preview_display    $
                                :position           $
                                :special_type       "type/PK"
                                :fk_target_field_id $
                                :created_at         $
                                :updated_at         $
                                :last_analyzed      $
                                :table              (merge (dissoc (table-defaults) :db :segments :field_values :metrics)
                                                           (match-$ (Table (id :users))
                                                             {:schema       "PUBLIC"
                                                              :name         "USERS"
                                                              :display_name "Users"
                                                              :rows         15
                                                              :updated_at   $
                                                              :id           $
                                                              :raw_table_id $
                                                              :created_at   $}))}))}])
  ((user->client :rasta) :get 200 (format "table/%d/fks" (id :users))))


;; ## POST /api/table/:id/reorder
(expect
  {:result "success"}
  (let [categories-id-field   (Field :table_id (id :categories), :name "ID")
        categories-name-field (Field :table_id (id :categories), :name "NAME")
        api-response          ((user->client :crowberto) :post 200 (format "table/%d/reorder" (id :categories))
                               {:new_order [(:id categories-name-field) (:id categories-id-field)]})]
    ;; check the modified values (have to do it here because the api response tells us nothing)
    (assert (= 0 (db/select-one-field :position Field, :id (:id categories-name-field))))
    (assert (= 1 (db/select-one-field :position Field, :id (:id categories-id-field))))
    ;; put the values back to their previous state
    (db/update! Field (:id categories-name-field), :position 0)
    (db/update! Field (:id categories-id-field),   :position 0)
    ;; return our origin api response for validation
    api-response))
