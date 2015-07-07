(ns metabase.api.meta.table-test
  "Tests for /api/meta/table endpoints."
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.driver.mongo.test-data :as mongo-data :refer [mongo-test-db-id]]
            [metabase.http-client :as http]
            [metabase.middleware.auth :as auth]
            (metabase.models [field :refer [Field]]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]])
            [metabase.test.data :refer :all]
            (metabase.test.data [data :as data]
                                [datasets :as datasets]
                                [users :refer :all])
            [metabase.test.util :refer [match-$ expect-eval-actual-first]]))


;; ## /api/org/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get auth/response-unauthentic :body) (http/client :get 401 "meta/table"))
(expect (get auth/response-unauthentic :body) (http/client :get 401 (format "meta/table/%d" (id :users))))


;; ## GET /api/meta/table?org
;; These should come back in alphabetical order and include relevant metadata
(expect (set (reduce concat (for [dataset-name @datasets/test-dataset-names]
                              (datasets/with-dataset-when-testing dataset-name
                                [{:name                (format-name "categories")
                                  :human_readable_name "Categories"
                                  :db_id               (db-id)
                                  :active              true
                                  :rows                75
                                  :id                  (id :categories)}
                                 {:name                (format-name "checkins")
                                  :human_readable_name "Checkins"
                                  :db_id               (db-id)
                                  :active              true
                                  :rows                1000
                                  :id                  (id :checkins)}
                                 {:name                (format-name "users")
                                  :human_readable_name "Users"
                                  :db_id               (db-id)
                                  :active              true
                                  :rows                15
                                  :id                  (id :users)}
                                 {:name                (format-name "venues")
                                  :human_readable_name "Venues"
                                  :db_id               (db-id)
                                  :active              true
                                  :rows                100
                                  :id                  (id :venues)}]))))
  (->> ((user->client :rasta) :get 200 "meta/table")
       (map #(dissoc % :db :created_at :updated_at :entity_name :description :entity_type))
       set))

;; ## GET /api/meta/table/:id
(expect
    (match-$ (sel :one Table :id (id :venues))
      {:description nil
       :entity_type nil
       :db (match-$ (db)
             {:created_at $
              :engine "h2"
              :id $
              :updated_at $
              :name "Test Database"
              :organization_id nil
              :description nil})
       :name "VENUES"
       :rows 100
       :updated_at $
       :entity_name nil
       :active true
       :pk_field (deref $pk_field)
       :id (id :venues)
       :db_id (db-id)
       :created_at $})
  ((user->client :rasta) :get 200 (format "meta/table/%d" (id :venues))))

;; ## GET /api/meta/table/:id/fields
(expect [(match-$ (sel :one Field :id (id :categories :id))
           {:description         nil
            :table_id            (id :categories)
            :special_type        "id"
            :name                "ID"
            :human_readable_name "Id"
            :updated_at          $
            :active              true
            :id                  (id :categories :id)
            :field_type          "info"
            :position            0
            :preview_display     true
            :created_at          $
            :base_type           "BigIntegerField"})
         (match-$ (sel :one Field :id (id :categories :name))
           {:description         nil
            :table_id            (id :categories)
            :special_type        "name"
            :name                "NAME"
            :human_readable_name "Name"
            :updated_at          $
            :active              true
            :id                  (id :categories :name)
            :field_type          "info"
            :position            0
            :preview_display     true
            :created_at          $
            :base_type           "TextField"})]
  ((user->client :rasta) :get 200 (format "meta/table/%d/fields" (id :categories))))

;; ## GET /api/meta/table/:id/query_metadata
(expect
    (match-$ (sel :one Table :id (id :categories))
      {:description nil
       :entity_type nil
       :db (match-$ (db)
             {:created_at $
              :engine "h2"
              :id $
              :updated_at $
              :name "Test Database"
              :organization_id nil
              :description nil})
       :name "CATEGORIES"
       :fields [(match-$ (sel :one Field :id (id :categories :id))
                  {:description nil
                   :table_id (id :categories)
                   :special_type "id"
                   :name "ID"
                   :updated_at $
                   :active true
                   :id $
                   :field_type "info"
                   :position 0
                   :target nil
                   :preview_display true
                   :created_at $
                   :base_type "BigIntegerField"})
                (match-$ (sel :one Field :id (id :categories :name))
                  {:description nil
                   :table_id (id :categories)
                   :special_type "name"
                   :name "NAME"
                   :updated_at $
                   :active true
                   :id $
                   :field_type "info"
                   :position 0
                   :target nil
                   :preview_display true
                   :created_at $
                   :base_type "TextField"})]
       :field_values {}
       :rows 75
       :updated_at $
       :entity_name nil
       :active true
       :id (id :categories)
       :db_id (db-id)
       :created_at $})
  ((user->client :rasta) :get 200 (format "meta/table/%d/query_metadata" (id :categories))))


(def ^:private user-last-login-date-strs
  "In an effort to be really annoying, the date strings returned by the API are different on Circle than they are locally.
   Generate strings like '2014-01-01' at runtime so we get matching values."
  (let [format-inst (fn [^java.util.Date inst]
                      (format "%d-%02d-%02d"
                              (+ (.getYear inst) 1900)
                              (+ (.getMonth inst) 1)
                              (.getDate inst)))]
    (->> data/test-data
         :table-definitions
         first
         :rows
         (map second)
         (map format-inst)
         set
         sort
         vec)))

;;; GET api/meta/table/:id/query_metadata?include_sensitive_fields
;;; Make sure that getting the User table *does* include info about the password field, but not actual values themselves
(expect
    (match-$ (sel :one Table :id (id :users))
      {:description nil
       :entity_type nil
       :db (match-$ (db)
             {:created_at $
              :engine "h2"
              :id $
              :updated_at $
              :name "Test Database"
              :organization_id nil
              :description nil})
       :name "USERS"
       :fields [(match-$ (sel :one Field :id (id :users :id))
                  {:description nil
                   :table_id (id :users)
                   :special_type "id"
                   :name "ID"
                   :updated_at $
                   :active true
                   :id $
                   :field_type "info"
                   :position 0
                   :target nil
                   :preview_display true
                   :created_at $
                   :base_type "BigIntegerField"})
                (match-$ (sel :one Field :id (id :users :last_login))
                  {:description nil
                   :table_id (id :users)
                   :special_type "category"
                   :name "LAST_LOGIN"
                   :updated_at $
                   :active true
                   :id $
                   :field_type "info"
                   :position 0
                   :target nil
                   :preview_display true
                   :created_at $
                   :base_type "DateTimeField"})
                (match-$ (sel :one Field :id (id :users :name))
                  {:description nil
                   :table_id (id :users)
                   :special_type "category"
                   :name "NAME"
                   :updated_at $
                   :active true
                   :id $
                   :field_type "info"
                   :position 0
                   :target nil
                   :preview_display true
                   :created_at $
                   :base_type "TextField"})
                (match-$ (sel :one Field :table_id (id :users) :name "PASSWORD")
                  {:description nil
                   :table_id (id :users)
                   :special_type "category"
                   :name "PASSWORD"
                   :updated_at $
                   :active true
                   :id $
                   :field_type "sensitive"
                   :position 0
                   :target nil
                   :preview_display true
                   :created_at $
                   :base_type "TextField"})]
       :rows 15
       :updated_at $
       :entity_name nil
       :active true
       :id (id :users)
       :db_id (db-id)
       :field_values {(keyword (str (id :users :last_login)))
                      user-last-login-date-strs

                      (keyword (str (id :users :name)))
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
       :created_at $})
  ((user->client :rasta) :get 200 (format "meta/table/%d/query_metadata?include_sensitive_fields=true" (id :users))))

;;; GET api/meta/table/:id/query_metadata
;;; Make sure that getting the User table does *not* include password info
(expect
    (match-$ (sel :one Table :id (id :users))
      {:description nil
       :entity_type nil
       :db (match-$ (db)
             {:created_at $
              :engine "h2"
              :id $
              :updated_at $
              :name "Test Database"
              :organization_id nil
              :description nil})
       :name "USERS"
       :fields [(match-$ (sel :one Field :id (id :users :id))
                  {:description nil
                   :table_id (id :users)
                   :special_type "id"
                   :name "ID"
                   :updated_at $
                   :active true
                   :id $
                   :field_type "info"
                   :position 0
                   :target nil
                   :preview_display true
                   :created_at $
                   :base_type "BigIntegerField"})
                (match-$ (sel :one Field :id (id :users :last_login))
                  {:description nil
                   :table_id (id :users)
                   :special_type "category"
                   :name "LAST_LOGIN"
                   :updated_at $
                   :active true
                   :id $
                   :field_type "info"
                   :position 0
                   :target nil
                   :preview_display true
                   :created_at $
                   :base_type "DateTimeField"})
                (match-$ (sel :one Field :id (id :users :name))
                  {:description nil
                   :table_id (id :users)
                   :special_type "category"
                   :name "NAME"
                   :updated_at $
                   :active true
                   :id $
                   :field_type "info"
                   :position 0
                   :target nil
                   :preview_display true
                   :created_at $
                   :base_type "TextField"})]
       :rows 15
       :updated_at $
       :entity_name nil
       :active true
       :id (id :users)
       :db_id (db-id)
       :field_values {(keyword (str (id :users :last_login)))
                      user-last-login-date-strs

                      (keyword (str (id :users :name)))
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
       :created_at $})
  ((user->client :rasta) :get 200 (format "meta/table/%d/query_metadata" (id :users))))


;; ## PUT /api/meta/table/:id
(expect-eval-actual-first
    (match-$ (let [table (sel :one Table :id (id :users))]
               ;; reset Table back to its original state
               (upd Table (id :users) :entity_name nil :entity_type nil :description nil)
               table)
      {:description "What a nice table!"
       :entity_type "person"
       :db (match-$ (db)
             {:description nil
              :organization_id $
              :name "Test Database"
              :updated_at $
              :details $
              :id $
              :engine "h2"
              :created_at $})
       :name "USERS"
       :rows 15
       :updated_at $
       :entity_name "Userz"
       :active true
       :pk_field (deref $pk_field)
       :id $
       :db_id (db-id)
       :created_at $})
  (do ((user->client :crowberto) :put 200 (format "meta/table/%d" (id :users)) {:entity_name "Userz"
                                                                                       :entity_type "person"
                                                                                       :description "What a nice table!"})
      ((user->client :crowberto) :get 200 (format "meta/table/%d" (id :users)))))


;; ## GET /api/meta/table/:id/fks
;; We expect a single FK from CHECKINS.USER_ID -> USERS.ID
(expect-let [checkins-user-field (sel :one Field :table_id (id :checkins) :name "USER_ID")
             users-id-field (sel :one Field :table_id (id :users) :name "ID")]
  [(match-$ (sel :one ForeignKey :destination_id (:id users-id-field))
     {:id $
      :origin_id (:id checkins-user-field)
      :destination_id (:id users-id-field)
      :relationship "Mt1"
      :created_at $
      :updated_at $
      :origin (match-$ checkins-user-field
                {:id $
                 :table_id $
                 :name "USER_ID"
                 :description nil
                 :base_type "IntegerField"
                 :preview_display $
                 :position $
                 :field_type "info"
                 :active true
                 :special_type "fk"
                 :created_at $
                 :updated_at $
                 :table (match-$ (sel :one Table :id (id :checkins))
                          {:description nil
                           :entity_type nil
                           :name "CHECKINS"
                           :rows 1000
                           :updated_at $
                           :entity_name nil
                           :active true
                           :id $
                           :db_id $
                           :created_at $
                           :db (match-$ (db)
                                 {:description nil,
                                  :organization_id nil,
                                  :name "Test Database",
                                  :updated_at $,
                                  :id $,
                                  :engine "h2",
                                  :created_at $})})})
      :destination (match-$ users-id-field
                     {:id $
                      :table_id $
                      :name "ID"
                      :description nil
                      :base_type "BigIntegerField"
                      :preview_display $
                      :position $
                      :field_type "info"
                      :active true
                      :special_type "id"
                      :created_at $
                      :updated_at $
                      :table (match-$ (sel :one Table :id (id :users))
                               {:description nil
                                :entity_type nil
                                :name "USERS"
                                :rows 15
                                :updated_at $
                                :entity_name nil
                                :active true
                                :id $
                                :db_id $
                                :created_at $})})})]
  ((user->client :rasta) :get 200 (format "meta/table/%d/fks" (id :users))))


;; ## POST /api/meta/table/:id/reorder
(expect-eval-actual-first
  {:result "success"}
  (let [categories-id-field (sel :one Field :table_id (id :categories) :name "ID")
        categories-name-field (sel :one Field :table_id (id :categories) :name "NAME")
        api-response ((user->client :crowberto) :post 200 (format "meta/table/%d/reorder" (id :categories))
                       {:new_order [(:id categories-name-field) (:id categories-id-field)]})]
    ;; check the modified values (have to do it here because the api response tells us nothing)
    (assert (= 0 (:position (sel :one :fields [Field :position] :id (:id categories-name-field)))))
    (assert (= 1 (:position (sel :one :fields [Field :position] :id (:id categories-id-field)))))
    ;; put the values back to their previous state
    (upd Field (:id categories-name-field) :position 0)
    (upd Field (:id categories-id-field) :position 0)
    ;; return our origin api response for validation
    api-response))
