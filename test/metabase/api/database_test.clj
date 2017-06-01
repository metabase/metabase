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
             [data :refer :all]
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


(defn- db-details
  ([]
   (db-details (db)))
  ([db]
   (match-$ db
     {:created_at         $
      :engine             "h2"
      :id                 $
      :details            $
      :updated_at         $
      :name               "test-data"
      :is_sample          false
      :is_full_sync       true
      :description        nil
      :caveats            nil
      :points_of_interest nil
      :features           (mapv name (driver/features (driver/engine->driver (:engine db))))})))


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
  (match-$ db
    {:created_at         $
     :engine             :postgres
     :id                 $
     :details            {:host "localhost", :port 5432, :dbname "fakedb", :user "cam", :ssl true}
     :updated_at         $
     :name               $
     :is_sample          false
     :is_full_sync       false
     :description        nil
     :caveats            nil
     :points_of_interest nil
     :features           (driver/features (driver/engine->driver :postgres))})
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


(defn- table-details [table]
  (match-$ table
    {:description             $
     :entity_type             $
     :caveats                 nil
     :points_of_interest      nil
     :visibility_type         $
     :schema                  $
     :name                    $
     :display_name            $
     :rows                    $
     :updated_at              $
     :entity_name             $
     :active                  $
     :id                      $
     :db_id                   $
     :show_in_getting_started false
     :raw_table_id            $
     :created_at              $}))


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
                                  (match-$ (get-or-create-test-data-db! (driver/engine->driver engine))
                                    {:created_at         $
                                     :engine             (name $engine)
                                     :id                 $
                                     :updated_at         $
                                     :name               "test-data"
                                     :native_permissions "write"
                                     :is_sample          false
                                     :is_full_sync       true
                                     :description        nil
                                     :caveats            nil
                                     :points_of_interest nil
                                     :features           (map name (driver/features (driver/engine->driver engine)))})))
                              (match-$ (Database db-id)
                                {:created_at         $
                                 :engine             "postgres"
                                 :id                 $
                                 :updated_at         $
                                 :name               $
                                 :native_permissions "write"
                                 :is_sample          false
                                 :is_full_sync       true
                                 :description        nil
                                 :caveats            nil
                                 :points_of_interest nil
                                 :features           (map name (driver/features (driver/engine->driver :postgres)))}))))
  (do
    (delete-randomly-created-databases! :skip [db-id])
    (set ((user->client :rasta) :get 200 "database"))))



;; GET /api/databases (include tables)
(expect-with-temp-db-created-via-api [{db-id :id}]
  (set (cons (match-$ (Database db-id)
               {:created_at         $
                :engine             "postgres"
                :id                 $
                :updated_at         $
                :name               $
                :native_permissions "write"
                :is_sample          false
                :is_full_sync       true
                :description        nil
                :caveats            nil
                :points_of_interest nil
                :tables             []
                :features           (map name (driver/features (driver/engine->driver :postgres)))})
             (filter identity (for [engine datasets/all-valid-engines]
                                (datasets/when-testing-engine engine
                                  (let [database (get-or-create-test-data-db! (driver/engine->driver engine))]
                                    (match-$ database
                                      {:created_at         $
                                       :engine             (name $engine)
                                       :id                 $
                                       :updated_at         $
                                       :name               "test-data"
                                       :native_permissions "write"
                                       :is_sample          false
                                       :is_full_sync       true
                                       :description        nil
                                       :caveats            nil
                                       :points_of_interest nil
                                       :tables             (sort-by :name (for [table (db/select Table, :db_id (:id database))]
                                                                            (table-details table)))
                                       :features           (map name (driver/features (driver/engine->driver engine)))})))))))
  (do
    (delete-randomly-created-databases! :skip [db-id])
    (set ((user->client :rasta) :get 200 "database" :include_tables true))))

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
     :description     nil
     :caveats         nil
     :points_of_interest nil
     :features        (mapv name (driver/features (driver/engine->driver :h2)))
     :tables          [(match-$ (Table (id :categories))
                         {:description             nil
                          :entity_type             nil
                          :caveats                 nil
                          :points_of_interest      nil
                          :visibility_type         nil
                          :schema                  "PUBLIC"
                          :name                    "CATEGORIES"
                          :display_name            "Categories"
                          :fields                  [(match-$ (hydrate/hydrate (Field (id :categories :id)) :values)
                                                      {:description        nil
                                                       :table_id           (id :categories)
                                                       :caveats            nil
                                                       :points_of_interest nil
                                                       :special_type       "type/PK"
                                                       :name               "ID"
                                                       :display_name       "ID"
                                                       :updated_at         $
                                                       :active             true
                                                       :id                 $
                                                       :raw_column_id      $
                                                       :position           0
                                                       :target             nil
                                                       :preview_display    true
                                                       :created_at         $
                                                       :last_analyzed      $
                                                       :base_type          "type/BigInteger"
                                                       :visibility_type    "normal"
                                                       :fk_target_field_id $
                                                       :parent_id          nil
                                                       :values             $})
                                                    (match-$ (hydrate/hydrate (Field (id :categories :name)) :values)
                                                      {:description        nil
                                                       :table_id           (id :categories)
                                                       :caveats            nil
                                                       :points_of_interest nil
                                                       :special_type       "type/Name"
                                                       :name               "NAME"
                                                       :display_name       "Name"
                                                       :updated_at         $
                                                       :active             true
                                                       :id                 $
                                                       :raw_column_id      $
                                                       :position           0
                                                       :target             nil
                                                       :preview_display    true
                                                       :created_at         $
                                                       :last_analyzed      $
                                                       :base_type          "type/Text"
                                                       :visibility_type    "normal"
                                                       :fk_target_field_id $
                                                       :parent_id          nil
                                                       :values             $})]
                          :segments                []
                          :metrics                 []
                          :rows                    75
                          :updated_at              $
                          :entity_name             nil
                          :active                  true
                          :id                      (id :categories)
                          :raw_table_id            $
                          :db_id                   (id)
                          :show_in_getting_started false
                          :created_at              $})]})
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
