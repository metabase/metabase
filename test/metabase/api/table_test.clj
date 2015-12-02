(ns metabase.api.table-test
  "Tests for /api/table endpoints."
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            (metabase [http-client :as http]
                      [middleware :as middleware])
            (metabase.models [field :refer [Field]]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]])
            [metabase.test.data :refer :all]
            (metabase.test.data [dataset-definitions :as defs]
                                [datasets :as datasets]
                                [users :refer :all])
            [metabase.test.util :refer [match-$ expect-eval-actual-first]]))


;; ## /api/org/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get middleware/response-unauthentic :body) (http/client :get 401 "table"))
(expect (get middleware/response-unauthentic :body) (http/client :get 401 (format "table/%d" (id :users))))


;; ## GET /api/table?org
;; These should come back in alphabetical order and include relevant metadata
(expect
  (do (destroy-loaded-temp-dbs!)
      (set (reduce concat (for [engine datasets/test-engines]
                            (datasets/with-engine-when-testing engine
                              [{:name                (format-name "categories")
                                :display_name        "Categories"
                                :db_id               (id)
                                :active              true
                                :rows                75
                                :id                  (id :categories)}
                               {:name                (format-name "checkins")
                                :display_name        "Checkins"
                                :db_id               (id)
                                :active              true
                                :rows                1000
                                :id                  (id :checkins)}
                               {:name                (format-name "users")
                                :display_name        "Users"
                                :db_id               (id)
                                :active              true
                                :rows                15
                                :id                  (id :users)}
                               {:name                (format-name "venues")
                                :display_name        "Venues"
                                :db_id               (id)
                                :active              true
                                :rows                100
                                :id                  (id :venues)}])))))
  (->> ((user->client :rasta) :get 200 "table")
       (map #(dissoc % :db :created_at :updated_at :schema :entity_name :description :entity_type :visibility_type))
       set))

;; ## GET /api/table/:id
(expect
    (match-$ (Table (id :venues))
      {:description     nil
       :entity_type     nil
       :visibility_type nil
       :db              (match-$ (db)
                          {:created_at      $
                           :engine          "h2"
                           :id              $
                           :updated_at      $
                           :name            "test-data"
                           :is_sample       false
                           :organization_id nil
                           :description     nil})
       :schema          "PUBLIC"
       :name            "VENUES"
       :display_name    "Venues"
       :rows            100
       :updated_at      $
       :entity_name     nil
       :active          true
       :pk_field        (deref $pk_field)
       :id              (id :venues)
       :db_id           (id)
       :created_at      $})
    ((user->client :rasta) :get 200 (format "table/%d" (id :venues))))

;; ## GET /api/table/:id/fields
(expect [(match-$ (Field (id :categories :id))
           {:description         nil
            :table_id            (id :categories)
            :special_type        "id"
            :name                "ID"
            :display_name        "Id"
            :updated_at          $
            :active              true
            :id                  (id :categories :id)
            :field_type          "info"
            :position            0
            :preview_display     true
            :created_at          $
            :base_type           "BigIntegerField"
            :parent_id           nil
            :parent              nil})
         (match-$ (Field (id :categories :name))
           {:description         nil
            :table_id            (id :categories)
            :special_type        "name"
            :name                "NAME"
            :display_name        "Name"
            :updated_at          $
            :active              true
            :id                  (id :categories :name)
            :field_type          "info"
            :position            0
            :preview_display     true
            :created_at          $
            :base_type           "TextField"
            :parent_id           nil
            :parent              nil})]
  ((user->client :rasta) :get 200 (format "table/%d/fields" (id :categories))))

;; ## GET /api/table/:id/query_metadata
(expect
    (match-$ (Table (id :categories))
      {:description     nil
       :entity_type     nil
       :visibility_type nil
       :db              (match-$ (db)
                          {:created_at      $
                           :engine          "h2"
                           :id              $
                           :updated_at      $
                           :name            "test-data"
                           :is_sample       false
                           :organization_id nil
                           :description     nil})
       :schema          "PUBLIC"
       :name            "CATEGORIES"
       :display_name    "Categories"
       :fields          [(match-$ (Field (id :categories :id))
                           {:description     nil
                            :table_id        (id :categories)
                            :special_type    "id"
                            :name            "ID"
                            :display_name    "Id"
                            :updated_at      $
                            :active          true
                            :id              $
                            :field_type      "info"
                            :position        0
                            :target          nil
                            :preview_display true
                            :created_at      $
                            :base_type       "BigIntegerField"
                            :parent_id       nil
                            :parent          nil})
                         (match-$ (Field (id :categories :name))
                           {:description     nil
                            :table_id        (id :categories)
                            :special_type    "name"
                            :name            "NAME"
                            :display_name    "Name"
                            :updated_at      $
                            :active          true
                            :id              $
                            :field_type      "info"
                            :position        0
                            :target          nil
                            :preview_display true
                            :created_at      $
                            :base_type       "TextField"
                            :parent_id       nil
                            :parent          nil})]
       :field_values    {}
       :rows            75
       :updated_at      $
       :entity_name     nil
       :active          true
       :id              (id :categories)
       :db_id           (id)
       :created_at      $})
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
    (match-$ (sel :one Table :id (id :users))
      {:description     nil
       :entity_type     nil
       :visibility_type nil
       :db              (match-$ (db)
                          {:created_at      $
                           :engine          "h2"
                           :id              $
                           :updated_at      $
                           :name            "test-data"
                           :is_sample       false
                           :organization_id nil
                           :description     nil})
       :schema          "PUBLIC"
       :name            "USERS"
       :display_name    "Users"
       :fields          [(match-$ (sel :one Field :id (id :users :id))
                           {:description     nil
                            :table_id        (id :users)
                            :special_type    "id"
                            :name            "ID"
                            :display_name    "Id"
                            :updated_at      $
                            :active          true
                            :id              $
                            :field_type      "info"
                            :position        0
                            :target          nil
                            :preview_display true
                            :created_at      $
                            :base_type       "BigIntegerField"
                            :parent_id       nil
                            :parent          nil})
                         (match-$ (sel :one Field :id (id :users :last_login))
                           {:description     nil
                            :table_id        (id :users)
                            :special_type    "category"
                            :name            "LAST_LOGIN"
                            :display_name    "Last Login"
                            :updated_at      $
                            :active          true
                            :id              $
                            :field_type      "info"
                            :position        0
                            :target          nil
                            :preview_display true
                            :created_at      $
                            :base_type       "DateTimeField"
                            :parent_id       nil
                            :parent          nil})
                         (match-$ (sel :one Field :id (id :users :name))
                           {:description     nil
                            :table_id        (id :users)
                            :special_type    "category"
                            :name            "NAME"
                            :display_name    "Name"
                            :updated_at      $
                            :active          true
                            :id              $
                            :field_type      "info"
                            :position        0
                            :target          nil
                            :preview_display true
                            :created_at      $
                            :base_type       "TextField"
                            :parent_id       nil
                            :parent          nil})
                         (match-$ (sel :one Field :table_id (id :users) :name "PASSWORD")
                           {:description     nil
                            :table_id        (id :users)
                            :special_type    "category"
                            :name            "PASSWORD"
                            :display_name    "Password"
                            :updated_at      $
                            :active          true
                            :id              $
                            :field_type      "sensitive"
                            :position        0
                            :target          nil
                            :preview_display true
                            :created_at      $
                            :base_type       "TextField"
                            :parent_id       nil
                            :parent          nil})]
       :rows            15
       :updated_at      $
       :entity_name     nil
       :active          true
       :id              (id :users)
       :db_id           (id)
       :field_values    {(keyword (str (id :users :name)))
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
       :created_at      $})
    ((user->client :rasta) :get 200 (format "table/%d/query_metadata?include_sensitive_fields=true" (id :users))))

;;; GET api/table/:id/query_metadata
;;; Make sure that getting the User table does *not* include password info
(expect
    (match-$ (Table (id :users))
      {:description     nil
       :entity_type     nil
       :visibility_type nil
       :db              (match-$ (db)
                          {:created_at      $
                           :engine          "h2"
                           :id              $
                           :updated_at      $
                           :name            "test-data"
                           :is_sample       false
                           :organization_id nil
                           :description     nil})
       :schema          "PUBLIC"
       :name            "USERS"
       :display_name    "Users"
       :fields          [(match-$ (Field (id :users :id))
                           {:description     nil
                            :table_id        (id :users)
                            :special_type    "id"
                            :name            "ID"
                            :display_name    "Id"
                            :updated_at      $
                            :active          true
                            :id              $
                            :field_type      "info"
                            :position        0
                            :target          nil
                            :preview_display true
                            :created_at      $
                            :base_type       "BigIntegerField"
                            :parent_id       nil
                            :parent          nil})
                         (match-$ (Field (id :users :last_login))
                           {:description     nil
                            :table_id        (id :users)
                            :special_type    "category"
                            :name            "LAST_LOGIN"
                            :display_name    "Last Login"
                            :updated_at      $
                            :active          true
                            :id              $
                            :field_type      "info"
                            :position        0
                            :target          nil
                            :preview_display true
                            :created_at      $
                            :base_type       "DateTimeField"
                            :parent_id       nil
                            :parent          nil})
                         (match-$ (Field (id :users :name))
                           {:description     nil
                            :table_id        (id :users)
                            :special_type    "category"
                            :name            "NAME"
                            :display_name    "Name"
                            :updated_at      $
                            :active          true
                            :id              $
                            :field_type      "info"
                            :position        0
                            :target          nil
                            :preview_display true
                            :created_at      $
                            :base_type       "TextField"
                            :parent_id       nil
                            :parent          nil})]
       :rows            15
       :updated_at      $
       :entity_name     nil
       :active          true
       :id              (id :users)
       :db_id           (id)
       :field_values    {(keyword (str (id :users :name)))
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
       :created_at      $})
    ((user->client :rasta) :get 200 (format "table/%d/query_metadata" (id :users))))


;; ## PUT /api/table/:id
(expect-eval-actual-first
    (match-$ (let [table (Table (id :users))]
               ;; reset Table back to its original state
               (upd Table (id :users) :display_name "Users" :entity_type nil :visibility_type nil :description nil)
               table)
      {:description     "What a nice table!"
       :entity_type     "person"
       :visibility_type "hidden"
       :db              (match-$ (db)
                          {:description     nil
                           :organization_id $
                           :name            "test-data"
                           :is_sample       false
                           :updated_at      $
                           :details         $
                           :id              $
                           :engine          "h2"
                           :created_at      $})
       :schema          "PUBLIC"
       :name            "USERS"
       :rows            15
       :updated_at      $
       :entity_name     nil
       :display_name    "Userz"
       :active          true
       :pk_field        (deref $pk_field)
       :id              $
       :db_id           (id)
       :created_at      $})
    (do ((user->client :crowberto) :put 200 (format "table/%d" (id :users)) {:display_name "Userz"
                                                                             :entity_type "person"
                                                                             :visibility_type "hidden"
                                                                             :description "What a nice table!"})
        ((user->client :crowberto) :get 200 (format "table/%d" (id :users)))))


;; ## GET /api/table/:id/fks
;; We expect a single FK from CHECKINS.USER_ID -> USERS.ID
(expect-let [checkins-user-field (sel :one Field :table_id (id :checkins) :name "USER_ID")
             users-id-field (sel :one Field :table_id (id :users) :name "ID")]
  [(match-$ (sel :one ForeignKey :destination_id (:id users-id-field))
     {:id             $
      :origin_id      (:id checkins-user-field)
      :destination_id (:id users-id-field)
      :relationship   "Mt1"
      :created_at     $
      :updated_at     $
      :origin         (match-$ checkins-user-field
                        {:id              $
                         :table_id        $
                         :parent_id       nil
                         :parent          nil
                         :name            "USER_ID"
                         :display_name    "User Id"
                         :description     nil
                         :base_type       "IntegerField"
                         :preview_display $
                         :position        $
                         :field_type      "info"
                         :active          true
                         :special_type    "fk"
                         :created_at      $
                         :updated_at      $
                         :table           (match-$ (Table (id :checkins))
                                            {:description     nil
                                             :entity_type     nil
                                             :visibility_type nil
                                             :schema          "PUBLIC"
                                             :name            "CHECKINS"
                                             :display_name    "Checkins"
                                             :rows            1000
                                             :updated_at      $
                                             :entity_name     nil
                                             :active          true
                                             :id              $
                                             :db_id           $
                                             :created_at      $
                                             :db              (match-$ (db)
                                                                {:description     nil,
                                                                 :organization_id nil,
                                                                 :name            "test-data",
                                                                 :is_sample       false,
                                                                 :updated_at      $,
                                                                 :id              $,
                                                                 :engine          "h2",
                                                                 :created_at      $})})})
      :destination    (match-$ users-id-field
                        {:id              $
                         :table_id        $
                         :parent_id       nil
                         :parent          nil
                         :name            "ID"
                         :display_name    "Id"
                         :description     nil
                         :base_type       "BigIntegerField"
                         :preview_display $
                         :position        $
                         :field_type      "info"
                         :active          true
                         :special_type    "id"
                         :created_at      $
                         :updated_at      $
                         :table           (match-$ (Table (id :users))
                                            {:description     nil
                                             :entity_type     nil
                                             :visibility_type nil
                                             :schema          "PUBLIC"
                                             :name            "USERS"
                                             :display_name    "Users"
                                             :rows            15
                                             :updated_at      $
                                             :entity_name     nil
                                             :active          true
                                             :id              $
                                             :db_id           $
                                             :created_at      $})})})]
  ((user->client :rasta) :get 200 (format "table/%d/fks" (id :users))))


;; ## POST /api/table/:id/reorder
(expect-eval-actual-first
    {:result "success"}
  (let [categories-id-field   (sel :one Field :table_id (id :categories) :name "ID")
        categories-name-field (sel :one Field :table_id (id :categories) :name "NAME")
        api-response          ((user->client :crowberto) :post 200 (format "table/%d/reorder" (id :categories))
                               {:new_order [(:id categories-name-field) (:id categories-id-field)]})]
    ;; check the modified values (have to do it here because the api response tells us nothing)
    (assert (= 0 (:position (sel :one :fields [Field :position] :id (:id categories-name-field)))))
    (assert (= 1 (:position (sel :one :fields [Field :position] :id (:id categories-id-field)))))
    ;; put the values back to their previous state
    (upd Field (:id categories-name-field) :position 0)
    (upd Field (:id categories-id-field) :position 0)
    ;; return our origin api response for validation
    api-response))
