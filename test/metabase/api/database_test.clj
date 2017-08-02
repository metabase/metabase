(ns metabase.api.database-test
  (:require [expectations :refer :all]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [database :as database :refer [Database]]
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
             [hydrate :as hydrate]]
            [toucan.util.test :as tt]))

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
             :features   (map name (driver/features (driver/engine->driver (:engine db))))}))))


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
;; If you're writing a NEW test that needs this, fix your brain and your test!
;; To reïterate, this is BAD BAD BAD BAD BAD BAD! It will break tests if you use it! Don't use it!
(defn- ^:deprecated delete-randomly-created-databases!
  "Delete all the randomly created Databases we've made so far. Optionally specify one or more IDs to SKIP."
  [& {:keys [skip]}]
  (let [ids-to-skip (into (set skip)
                          (for [engine datasets/all-valid-engines
                                :let   [id (datasets/when-testing-engine engine
                                             (:id (get-or-create-test-data-db! (driver/engine->driver engine))))]
                                :when  id]
                            id))]
    (when-let [dbs (seq (db/select [Database :name :engine :id] :id [:not-in ids-to-skip]))]
      (println (u/format-color 'red (str "\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n"
                                         "WARNING: deleting randomly created databases:\n%s\n"
                                         "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n\n")
                 (u/pprint-to-str dbs))))
    (db/delete! Database :id [:not-in ids-to-skip])))


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

(defn- field-details [field]
  (merge
   default-field-details
   (match-$ (hydrate/hydrate field :values)
     {:updated_at         $
      :id                 $
      :raw_column_id      $
      :created_at         $
      :last_analyzed      $
      :fingerprint        $
      :fk_target_field_id $
      :values             $})))

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
                                   :fields       [(assoc (field-details (Field (id :categories :id)))
                                                    :table_id        (id :categories)
                                                    :special_type    "type/PK"
                                                    :name            "ID"
                                                    :display_name    "ID"
                                                    :base_type       "type/BigInteger"
                                                    :visibility_type "normal")
                                                  (assoc (field-details (Field (id :categories :name)))
                                                    :table_id           (id :categories)
                                                    :special_type       "type/Name"
                                                    :name               "NAME"
                                                    :display_name       "Name"
                                                    :base_type          "type/Text"
                                                    :visibility_type    "normal")]
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


;;; GET /api/database?include_cards=true
;; Check that we get back 'virtual' tables for Saved Questions
(defn- card-with-native-query {:style/indent 1} [card-name & {:as kvs}]
  (merge {:name          card-name
          :database_id   (data/id)
          :dataset_query {:database (data/id)
                          :type     :native
                          :native   {:query (format "SELECT * FROM VENUES")}}}
         kvs))

(defn- card-with-mbql-query {:style/indent 1} [card-name & {:as inner-query-clauses}]
  {:name          card-name
   :database_id   (data/id)
   :dataset_query {:database (data/id)
                   :type     :query
                   :query    inner-query-clauses}})

(defn- saved-questions-virtual-db {:style/indent 0} [& card-tables]
  {:name               "Saved Questions"
   :id                 database/virtual-id
   :features           ["basic-aggregations"]
   :tables             card-tables
   :is_saved_questions true})

(defn- virtual-table-for-card [card & {:as kvs}]
  (merge {:id           (format "card__%d" (u/get-id card))
          :db_id        database/virtual-id
          :display_name (:name card)
          :schema       "Everything else"
          :description  nil}
         kvs))

(tt/expect-with-temp [Card [card (card-with-native-query "Kanye West Quote Views Per Month")]]
  (saved-questions-virtual-db
    (virtual-table-for-card card))
  (do
    ;; run the Card which will populate its result_metadata column
    ((user->client :crowberto) :post 200 (format "card/%d/query" (u/get-id card)))
    ;; Now fetch the database list. The 'Saved Questions' DB should be last on the list
    (last ((user->client :crowberto) :get 200 "database" :include_cards true))))

;; make sure that GET /api/database?include_cards=true groups pretends COLLECTIONS are SCHEMAS
(tt/expect-with-temp [Collection [stamp-collection {:name "Stamps"}]
                      Collection [coin-collection  {:name "Coins"}]
                      Card       [stamp-card (card-with-native-query "Total Stamp Count", :collection_id (u/get-id stamp-collection))]
                      Card       [coin-card  (card-with-native-query "Total Coin Count",  :collection_id (u/get-id coin-collection))]]
  (saved-questions-virtual-db
    (virtual-table-for-card coin-card  :schema "Coins")
    (virtual-table-for-card stamp-card :schema "Stamps"))
  (do
    ;; run the Cards which will populate their result_metadata columns
    (doseq [card [stamp-card coin-card]]
      ((user->client :crowberto) :post 200 (format "card/%d/query" (u/get-id card))))
    ;; Now fetch the database list. The 'Saved Questions' DB should be last on the list. Cards should have their Collection name as their Schema
    (last ((user->client :crowberto) :get 200 "database" :include_cards true))))

(defn- fetch-virtual-database []
  (some #(when (= (:name %) "Saved Questions")
           %)
        ((user->client :crowberto) :get 200 "database" :include_cards true)))

;; make sure that GET /api/database?include_cards=true removes Cards that have ambiguous columns
(tt/expect-with-temp [Card [ok-card         (assoc (card-with-native-query "OK Card")         :result_metadata [{:name "cam"}])]
                      Card [cambiguous-card (assoc (card-with-native-query "Cambiguous Card") :result_metadata [{:name "cam"} {:name "cam_2"}])]]
  (saved-questions-virtual-db
    (virtual-table-for-card ok-card))
  (fetch-virtual-database))


;; make sure that GET /api/database?include_cards=true removes Cards that use cumulative-sum and cumulative-count aggregations
(defn- ok-mbql-card []
  (assoc (card-with-mbql-query "OK Card"
           :source-table (data/id :checkins))
    :result_metadata [{:name "num_toucans"}]))

;; cum count using the new-style multiple aggregation syntax
(tt/expect-with-temp [Card [ok-card (ok-mbql-card)]
                      Card [_ (assoc (card-with-mbql-query "Cum Count Card"
                                       :source-table (data/id :checkins)
                                       :aggregation  [[:cum-count]]
                                       :breakout     [[:datetime-field [:field-id (data/id :checkins :date) :month]]])
                                :result_metadata [{:name "num_toucans"}])]]
  (saved-questions-virtual-db
    (virtual-table-for-card ok-card))
  (fetch-virtual-database))

;; cum sum using old-style single aggregation syntax
(tt/expect-with-temp [Card [ok-card (ok-mbql-card)]
                      Card [_ (assoc (card-with-mbql-query "Cum Sum Card"
                                       :source-table (data/id :checkins)
                                       :aggregation  [:cum-sum]
                                       :breakout     [[:datetime-field [:field-id (data/id :checkins :date) :month]]])
                                :result_metadata [{:name "num_toucans"}])]]
  (saved-questions-virtual-db
    (virtual-table-for-card ok-card))
  (fetch-virtual-database))


;; make sure that GET /api/database/:id/metadata works for the Saved Questions 'virtual' database
(tt/expect-with-temp [Card [card (assoc (card-with-native-query "Birthday Card") :result_metadata [{:name "age_in_bird_years"}])]]
  (saved-questions-virtual-db
    (assoc (virtual-table-for-card card)
      :fields [{:name         "age_in_bird_years"
                :table_id     (str "card__" (u/get-id card))
                :id           ["field-literal" "age_in_bird_years" "type/*"]
                :special_type nil}]))
  ((user->client :crowberto) :get 200 (format "database/%d/metadata" database/virtual-id)))

;; if no eligible Saved Questions exist the virtual DB metadata endpoint should just return `nil`
(expect
  nil
  ((user->client :crowberto) :get 200 (format "database/%d/metadata" database/virtual-id)))
