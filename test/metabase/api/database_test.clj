(ns metabase.api.database-test
  (:require [expectations :refer :all]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.test
             [data :as data :refer :all]
             [util :as tu :refer [match-$]]]
            [metabase.test.data
             [datasets :as datasets]
             [users :refer :all]]
            [toucan
             [db :as db]
             [hydrate :as hydrate]]))

;; HELPER FNS

(defn- create-db-via-api! [options]
  ((user->client :crowberto) :post 200 "database" (merge {:engine       :postgres
                                                          :name         (tu/random-name)
                                                          :details      {:host   "localhost"
                                                                         :port   5432
                                                                         :dbname "fakedb"
                                                                         :user   "cam"
                                                                         :ssl    false}
                                                          :is_full_sync true}
                                                         options)))

(defn- do-with-temp-db-created-via-api {:style/indent 1} [db-options f]
  (let [db (create-db-via-api! db-options)]
    (assert (integer? (:id db)))
    (try
      (f db)
      (finally
        (db/delete! Database :id (:id db))))))

(defmacro ^:private expect-with-temp-db-created-via-api {:style/indent 1} [[binding & [options]] expected actual]
  ;; use `gensym` instead of auto gensym here so we can be sure it's a unique symbol every time. Otherwise since expectations hashes its body
  ;; to generate function names it will treat every usage this as the same test and only a single one will end up being ran
  (let [result (gensym "result-")]
    `(let [~result (delay (do-with-temp-db-created-via-api ~options (fn [~binding]
                                                                      [~expected
                                                                       ~actual])))]
       (expect
         (u/ignore-exceptions (first @~result)) ; in case @result# barfs we don't want the test to succeed (Exception == Exception for expectations)
         (second @~result)))))

(def ^:private default-db-details
  {:engine             "h2"
   :name               "test-data"
   :is_sample          false
   :is_full_sync       true
   :description        nil
   :caveats            nil
   :points_of_interest nil})


(defn- db-details
  "Return default column values for a database (either the test database, via `(db)`, or optionally passed in)."
  ([]
   (db-details (db)))
  ([db]
   (merge default-db-details
          (match-$ db
            {:created_at $
             :id         $
             :details    $
             :updated_at $
             :features   (mapv name (driver/features (driver/engine->driver (:engine db))))}))))


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
(expect-with-temp-db-created-via-api [db {:is_full_sync false}]
  (merge default-db-details
         (match-$ db
           {:created_at         $
            :engine             :postgres
            :is_full_sync       false
            :id                 $
            :details            {:host "localhost", :port 5432, :dbname "fakedb", :user "cam", :ssl true}
            :updated_at         $
            :name               $
            :features           (driver/features (driver/engine->driver :postgres))}))
  (Database (:id db)))


;; ## DELETE /api/database/:id
;; Check that we can delete a Database
(expect-with-temp-db-created-via-api [db]
  false
  (do ((user->client :crowberto) :delete 204 (format "database/%d" (:id db)))
      (db/exists? 'Database :id (:id db))))

;; ## PUT /api/database/:id
;; Check that we can update fields in a Database
(expect-with-temp-db-created-via-api [{db-id :id}]
  {:details      {:host "localhost", :port 5432, :dbname "fakedb", :user "rastacan"}
   :engine       :h2
   :name         "Cam's Awesome Toucan Database"
   :is_full_sync false}
  (do ((user->client :crowberto) :put 200 (format "database/%d" db-id) {:name         "Cam's Awesome Toucan Database"
                                                                        :engine       "h2"
                                                                        :is_full_sync false
                                                                        :details      {:host "localhost", :port 5432, :dbname "fakedb", :user "rastacan"}})
      (dissoc (into {} (db/select-one [Database :name :engine :details :is_full_sync], :id db-id))
              :features)))

:description             nil
                               :entity_type             nil
                               :caveats                 nil
                               :points_of_interest      nil
                               :visibility_type         nil
(def ^:private default-table-details
  {:description             nil
   :entity_name             nil
   :entity_type             nil
   :caveats                 nil
   :points_of_interest      nil
   :visibility_type         nil
   :active                  true
   :show_in_getting_started false})

(defn- table-details [table]
  (merge default-table-details
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
            :created_at      $})))


;; TODO - this is a test code smell, each test should clean up after itself and this step shouldn't be neccessary. One day we should be able to remove this!
;; If you're writing a test that needs this, fix your brain and your test
(defn- ^:deprecated delete-randomly-created-databases!
  "Delete all the randomly created Databases we've made so far. Optionally specify one or more IDs to SKIP."
  [& {:keys [skip]}]
  (db/delete! Database :id [:not-in (into (set skip)
                                          (for [engine datasets/all-valid-engines
                                                :let   [id (datasets/when-testing-engine engine
                                                             (:id (get-or-create-test-data-db! (driver/engine->driver engine))))]
                                                :when  id]
                                            id))]))


;; ## GET /api/database
;; Test that we can get all the DBs (ordered by name)
;; Database details *should not* come back for Rasta since she's not a superuser
(expect-with-temp-db-created-via-api [{db-id :id}]
  (set (filter identity (conj (for [engine datasets/all-valid-engines]
                                (datasets/when-testing-engine engine
                                  (merge default-db-details
                                         (match-$ (get-or-create-test-data-db! (driver/engine->driver engine))
                                           {:created_at         $
                                            :engine             (name $engine)
                                            :id                 $
                                            :updated_at         $
                                            :name               "test-data"
                                            :native_permissions "write"
                                            :features           (map name (driver/features (driver/engine->driver engine)))}))))
                              (merge default-db-details
                                     (match-$ (Database db-id)
                                       {:created_at         $
                                        :engine             "postgres"
                                        :id                 $
                                        :updated_at         $
                                        :name               $
                                        :native_permissions "write"
                                        :features           (map name (driver/features (driver/engine->driver :postgres)))})))))
  (do
    (delete-randomly-created-databases! :skip [db-id])
    (set ((user->client :rasta) :get 200 "database"))))



;; GET /api/databases (include tables)
(expect-with-temp-db-created-via-api [{db-id :id}]
  (set (cons (merge default-db-details
                    (match-$ (Database db-id)
                      {:created_at         $
                       :engine             "postgres"
                       :id                 $
                       :updated_at         $
                       :name               $
                       :native_permissions "write"
                       :tables             []
                       :features           (map name (driver/features (driver/engine->driver :postgres)))}))
             (filter identity (for [engine datasets/all-valid-engines]
                                (datasets/when-testing-engine engine
                                  (let [database (get-or-create-test-data-db! (driver/engine->driver engine))]
                                    (merge default-db-details
                                           (match-$ database
                                             {:created_at         $
                                              :engine             (name $engine)
                                              :id                 $
                                              :updated_at         $
                                              :name               "test-data"
                                              :native_permissions "write"
                                              :tables             (sort-by :name (for [table (db/select Table, :db_id (:id database))]
                                                                                   (table-details table)))
                                              :features           (map name (driver/features (driver/engine->driver engine)))}))))))))
  (do
    (delete-randomly-created-databases! :skip [db-id])
    (set ((user->client :rasta) :get 200 "database" :include_tables true))))

(def ^:private default-field-details
  {:description        nil
   :caveats            nil
   :points_of_interest nil
   :active             true
   :position           0
   :target             nil
   :preview_display    true
   :parent_id          nil})

;; ## GET /api/meta/table/:id/query_metadata
;; TODO - add in example with Field :values
(expect
  (merge default-db-details
         (match-$ (db)
           {:created_at $
            :engine     "h2"
            :id         $
            :updated_at $
            :name       "test-data"
            :features   (mapv name (driver/features (driver/engine->driver :h2)))
            :tables     [(merge default-table-details
                                (match-$ (Table (id :categories))
                                  {:schema       "PUBLIC"
                                   :name         "CATEGORIES"
                                   :display_name "Categories"
                                   :fields       [(merge default-field-details
                                                         (match-$ (hydrate/hydrate (Field (id :categories :id)) :values)
                                                           {:table_id           (id :categories)
                                                            :special_type       "type/PK"
                                                            :name               "ID"
                                                            :display_name       "ID"
                                                            :updated_at         $
                                                            :id                 $
                                                            :raw_column_id      $
                                                            :created_at         $
                                                            :last_analyzed      $
                                                            :base_type          "type/BigInteger"
                                                            :visibility_type    "normal"
                                                            :fk_target_field_id $
                                                            :values             $}))
                                                  (merge default-field-details
                                                         (match-$ (hydrate/hydrate (Field (id :categories :name)) :values)
                                                           {:table_id           (id :categories)
                                                            :special_type       "type/Name"
                                                            :name               "NAME"
                                                            :display_name       "Name"
                                                            :updated_at         $
                                                            :id                 $
                                                            :raw_column_id      $
                                                            :created_at         $
                                                            :last_analyzed      $
                                                            :base_type          "type/Text"
                                                            :visibility_type    "normal"
                                                            :fk_target_field_id $
                                                            :values             $}))]
                                   :segments     []
                                   :metrics      []
                                   :rows         75
                                   :updated_at   $
                                   :id           (id :categories)
                                   :raw_table_id $
                                   :db_id        (id)
                                   :created_at   $}))]}))
  (let [resp ((user->client :rasta) :get 200 (format "database/%d/metadata" (id)))]
    (assoc resp :tables (filter #(= "CATEGORIES" (:name %)) (:tables resp)))))


;;; GET /api/database/:id/autocomplete_suggestions

(expect
  [["USERS" "Table"]
   ["USER_ID" "CHECKINS :type/Integer :type/FK"]]
  ((user->client :rasta) :get 200 (format "database/%d/autocomplete_suggestions" (id)) :prefix "u"))

(expect
  [["CATEGORIES" "Table"]
   ["CHECKINS" "Table"]
   ["CATEGORY_ID" "VENUES :type/Integer :type/FK"]]
  ((user->client :rasta) :get 200 (format "database/%d/autocomplete_suggestions" (id)) :prefix "c"))

(expect
  [["CATEGORIES" "Table"]
   ["CATEGORY_ID" "VENUES :type/Integer :type/FK"]]
  ((user->client :rasta) :get 200 (format "database/%d/autocomplete_suggestions" (id)) :prefix "cat"))
