(ns metabase.api.database-test
  (:require [expectations :refer :all]
            (metabase [db :as db]
                      [driver :as driver])
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.test.data :refer :all]
            (metabase.test.data [datasets :as datasets]
                                [users :refer :all])
            [metabase.test.util :refer [match-$ random-name expect-eval-actual-first]]
            [metabase.util :as u]))

;; HELPER FNS

(defn create-db
  ([db-name]
    (create-db db-name true))
  ([db-name full-sync?]
   ((user->client :crowberto) :post 200 "database" {:engine       :postgres
                                                    :name         db-name
                                                    :details      {:host   "localhost"
                                                                   :port   5432
                                                                   :dbname "fakedb"
                                                                   :user   "cam"
                                                                   :ssl    false}
                                                    :is_full_sync full-sync?})))

(defn- db-details
  ([]
    (db-details (db)))
  ([db]
   (match-$ db
     {:created_at      $
      :engine          "h2"
      :id              $
      :details         $
      :updated_at      $
      :name            "test-data"
      :is_sample       false
      :is_full_sync    true
      :organization_id nil
      :description     nil
      :features        (mapv name (driver/features (driver/engine->driver (:engine db))))})))

(defn- table-details [table]
  (match-$ table
    {:description     $
     :entity_type     $
     :visibility_type $
     :schema          $
     :name            $
     :display_name    $
     :rows            $
     :updated_at      $
     :entity_name     $
     :active          $
     :id              $
     :db_id           $
     :raw_table_id    $
     :created_at      $}))


;; # DB LIFECYCLE ENDPOINTS

;; ## GET /api/database/:id
;; regular users *should not* see DB details
(expect
  (dissoc (db-details) :details)
  ((user->client :rasta) :get 200 (format "database/%d" (id))))

;; superusers *should* see DB details
(expect
  (db-details)
  ((user->client :crowberto) :get 200 (format "database/%d" (id))))

;; ## POST /api/database
;; Check that we can create a Database
(let [db-name (random-name)]
  (expect-eval-actual-first
      (match-$ (Database :name db-name)
        {:created_at      $
         :engine          "postgres" ; string because it's coming back from API instead of DB
         :id              $
         :details         {:host "localhost", :port 5432, :dbname "fakedb", :user "cam", :ssl true}
         :updated_at      $
         :name            db-name
         :is_sample       false
         :is_full_sync    false
         :organization_id nil
         :description     nil
         :features        (mapv name (driver/features (driver/engine->driver :postgres)))})
    (create-db db-name false)))

;; ## DELETE /api/database/:id
;; Check that we can delete a Database
(expect-let [db-name (random-name)
             {db-id :id} (create-db db-name)
             sel-db-name (fn [] (db/select-one-field :name Database, :id db-id))]
  [db-name
   nil]
  [(sel-db-name)
   (do ((user->client :crowberto) :delete 204 (format "database/%d" db-id))
       (sel-db-name))])

;; ## PUT /api/database/:id
;; Check that we can update fields in a Database
(expect-let [[old-name new-name] (repeatedly 2 random-name)
             {db-id :id}         (create-db old-name)
             sel-db              (fn [] (dissoc (into {} (db/select-one [Database :name :engine :details :is_full_sync], :id db-id))
                                                :features))]
  [{:details      {:host "localhost", :port 5432, :dbname "fakedb", :user "cam", :ssl true}
    :engine       :postgres
    :name         old-name
    :is_full_sync true}
   {:details      {:host "localhost", :port 5432, :dbname "fakedb", :user "rastacan"}
    :engine       :h2
    :name         new-name
    :is_full_sync false}]
  [(sel-db)
   ;; Check that we can update all the fields
   (do ((user->client :crowberto) :put 200 (format "database/%d" db-id) {:name         new-name
                                                                         :engine       "h2"
                                                                         :is_full_sync false
                                                                         :details      {:host "localhost", :port 5432, :dbname "fakedb", :user "rastacan"}})
       (sel-db))])

;; # DATABASES FOR ORG

;; ## GET /api/database
;; Test that we can get all the DBs for an Org, ordered by name
;; Database details *should not* come back for Rasta since she's not a superuser
(let [db-name (str "A" (random-name))] ; make sure this name comes before "test-data"
  (expect-eval-actual-first
      (set (filter identity (conj (for [engine datasets/all-valid-engines]
                                    (datasets/when-testing-engine engine
                                      (match-$ (get-or-create-test-data-db! (driver/engine->driver engine))
                                        {:created_at      $
                                         :engine          (name $engine)
                                         :id              $
                                         :updated_at      $
                                         :name            "test-data"
                                         :is_sample       false
                                         :is_full_sync    true
                                         :organization_id nil
                                         :description     nil
                                         :features        (mapv name (driver/features (driver/engine->driver engine)))})))
                                  ;; (?) I don't remember why we have to do this for postgres but not any other of the bonus drivers
                                  (match-$ (Database :name db-name)
                                    {:created_at      $
                                     :engine          "postgres"
                                     :id              $
                                     :updated_at      $
                                     :name            $
                                     :is_sample       false
                                     :is_full_sync    true
                                     :organization_id nil
                                     :description     nil
                                     :features        (mapv name (driver/features (driver/engine->driver :postgres)))}))))
      (do
        ;; Delete all the randomly created Databases we've made so far
        (db/cascade-delete! Database :id [:not-in (filter identity
                                                          (for [engine datasets/all-valid-engines]
                                                            (datasets/when-testing-engine engine
                                                              (:id (get-or-create-test-data-db! (driver/engine->driver engine))))))])
        ;; Add an extra DB so we have something to fetch besides the Test DB
        (create-db db-name)
        ;; Now hit the endpoint
        (set ((user->client :rasta) :get 200 "database")))))

;; GET /api/databases (include tables)
(let [db-name (str "A" (random-name))] ; make sure this name comes before "test-data"
  (expect-eval-actual-first
    (set (concat [(match-$ (Database :name db-name)
                    {:created_at      $
                     :engine          "postgres"
                     :id              $
                     :updated_at      $
                     :name            $
                     :is_sample       false
                     :is_full_sync    true
                     :organization_id nil
                     :description     nil
                     :tables          []
                     :features        (mapv name (driver/features (driver/engine->driver :postgres)))})]
                 (filter identity (for [engine datasets/all-valid-engines]
                                    (datasets/when-testing-engine engine
                                      (let [database (get-or-create-test-data-db! (driver/engine->driver engine))]
                                        (match-$ database
                                          {:created_at      $
                                           :engine          (name $engine)
                                           :id              $
                                           :updated_at      $
                                           :name            "test-data"
                                           :is_sample       false
                                           :is_full_sync    true
                                           :organization_id nil
                                           :description     nil
                                           :tables          (->> (db/select Table, :db_id (:id database))
                                                                 (mapv table-details)
                                                                 (sort-by :name))
                                           :features        (mapv name (driver/features (driver/engine->driver engine)))})))))))
    (do
      ;; Delete all the randomly created Databases we've made so far
      (db/cascade-delete! Database :id [:not-in (set (filter identity
                                                             (for [engine datasets/all-valid-engines]
                                                               (datasets/when-testing-engine engine
                                                                 (:id (get-or-create-test-data-db! (driver/engine->driver engine)))))))])
      ;; Add an extra DB so we have something to fetch besides the Test DB
      (create-db db-name)
      ;; Now hit the endpoint
      (set ((user->client :rasta) :get 200 "database" :include_tables true)))))

;; ## GET /api/meta/table/:id/query_metadata
;; TODO - add in example with Field :values
(expect
    (match-$ (db)
      {:created_at      $
       :engine          "h2"
       :id              $
       :updated_at      $
       :name            "test-data"
       :is_sample       false
       :is_full_sync    true
       :organization_id nil
       :description     nil
       :features        (mapv name (driver/features (driver/engine->driver :h2)))
       :tables          [(match-$ (Table (id :categories))
                           {:description     nil
                            :entity_type     nil
                            :visibility_type nil
                            :schema          "PUBLIC"
                            :name            "CATEGORIES"
                            :display_name    "Categories"
                            :fields          [(match-$ (Field (id :categories :id))
                                                {:description        nil
                                                 :table_id           (id :categories)
                                                 :special_type       "id"
                                                 :name               "ID"
                                                 :display_name       "ID"
                                                 :updated_at         $
                                                 :active             true
                                                 :id                 $
                                                 :raw_column_id      $
                                                 :field_type         "info"
                                                 :position           0
                                                 :target             nil
                                                 :preview_display    true
                                                 :created_at         $
                                                 :last_analyzed      $
                                                 :base_type          "BigIntegerField"
                                                 :visibility_type    "normal"
                                                 :fk_target_field_id $
                                                 :parent_id          nil
                                                 :values             []})
                                              (match-$ (Field (id :categories :name))
                                                {:description        nil
                                                 :table_id           (id :categories)
                                                 :special_type       "name"
                                                 :name               "NAME"
                                                 :display_name       "Name"
                                                 :updated_at         $
                                                 :active             true
                                                 :id                 $
                                                 :raw_column_id      $
                                                 :field_type         "info"
                                                 :position           0
                                                 :target             nil
                                                 :preview_display    true
                                                 :created_at         $
                                                 :last_analyzed      $
                                                 :base_type          "TextField"
                                                 :visibility_type    "normal"
                                                 :fk_target_field_id $
                                                 :parent_id          nil
                                                 :values             []})]
                            :segments        []
                            :metrics         []
                            :rows            75
                            :updated_at      $
                            :entity_name     nil
                            :active          true
                            :id              (id :categories)
                            :raw_table_id    $
                            :db_id           (id)
                            :created_at      $})]})
    (let [resp ((user->client :rasta) :get 200 (format "database/%d/metadata" (id)))]
      (assoc resp :tables (filter #(= "CATEGORIES" (:name %)) (:tables resp)))))


;; # DB TABLES ENDPOINTS

;; ## GET /api/database/:id/tables
;; These should come back in alphabetical order
(expect
    (let [db-id (id)]
      [(match-$ (Table (id :categories))
         {:description nil
          :entity_type nil
          :visibility_type nil
          :schema "PUBLIC"
          :name "CATEGORIES"
          :rows 75
          :updated_at $
          :entity_name nil
          :active true
          :id $
          :db_id db-id
          :created_at $
          :display_name "Categories"
          :raw_table_id $})
       (match-$ (Table (id :checkins))
         {:description nil
          :entity_type nil
          :visibility_type nil
          :schema "PUBLIC"
          :name "CHECKINS"
          :rows 1000
          :updated_at $
          :entity_name nil
          :active true
          :id $
          :db_id db-id
          :created_at $
          :display_name "Checkins"
          :raw_table_id $})
       (match-$ (Table (id :users))
         {:description nil
          :entity_type nil
          :visibility_type nil
          :schema "PUBLIC"
          :name "USERS"
          :rows 15
          :updated_at $
          :entity_name nil
          :active true
          :id $
          :db_id db-id
          :created_at $
          :display_name "Users"
          :raw_table_id $})
       (match-$ (Table (id :venues))
         {:description nil
          :entity_type nil
          :visibility_type nil
          :schema "PUBLIC"
          :name "VENUES"
          :rows 100
          :updated_at $
          :entity_name nil
          :active true
          :id $
          :db_id db-id
          :created_at $
          :display_name "Venues"
          :raw_table_id $})])
  ((user->client :rasta) :get 200 (format "database/%d/tables" (id))))
