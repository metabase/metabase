(ns metabase.api.meta.db-test
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.mongo.test-data :as mongo-test-data]
            (metabase.models [database :refer [Database]]
                             [table :refer [Table]])
            [metabase.test.data :refer :all]
            (metabase.test.data [datasets :as datasets]
                                [users :refer :all])
            [metabase.test.util :refer [match-$ random-name expect-eval-actual-first]]))

;; HELPER FNS

(defn create-db [db-name]
  ((user->client :crowberto) :post 200 "meta/db" {:engine :postgres
                                                  :name db-name
                                                  :details {:conn_str "host=localhost port=5432 dbname=fakedb user=cam"}}))

;; # FORM INPUT

;; ## GET /api/meta/db/form_input
(expect
    {:engines driver/available-drivers
     :timezones ["GMT"
                 "UTC"
                 "US/Alaska"
                 "US/Arizona"
                 "US/Central"
                 "US/Eastern"
                 "US/Hawaii"
                 "US/Mountain"
                 "US/Pacific"
                 "America/Costa_Rica"]}
  ((user->client :crowberto) :get 200 "meta/db/form_input"))

;; # DB LIFECYCLE ENDPOINTS

;; ## GET /api/meta/db/:id
(expect
    (match-$ (db)
      {:created_at $
       :engine "h2"
       :id $
       :details $
       :updated_at $
       :name "Test Database"
       :organization_id nil
       :description nil})
  ((user->client :rasta) :get 200 (format "meta/db/%d" (db-id))))

;; ## POST /api/meta/db
;; Check that we can create a Database
(let [db-name (random-name)]
  (expect-eval-actual-first
      (match-$ (sel :one Database :name db-name)
        {:created_at $
         :engine "postgres" ; string because it's coming back from API instead of DB
         :id $
         :details {:conn_str "host=localhost port=5432 dbname=fakedb user=cam"}
         :updated_at $
         :name db-name
         :organization_id nil
         :description nil})
    (create-db db-name)))

;; ## DELETE /api/meta/db/:id
;; Check that we can delete a Database
(expect-let [db-name (random-name)
             {db-id :id} (create-db db-name)
             sel-db-name (fn [] (sel :one :field [Database :name] :id db-id))]
  [db-name
   nil]
  [(sel-db-name)
   (do ((user->client :crowberto) :delete 204 (format "meta/db/%d" db-id))
       (sel-db-name))])

;; ## PUT /api/meta/db/:id
;; Check that we can update fields in a Database
(expect-let [[old-name new-name] (repeatedly 2 random-name)
             {db-id :id} (create-db old-name)
             sel-db (fn [] (sel :one :fields [Database :name :engine :details] :id db-id))]
  [{:details {:conn_str "host=localhost port=5432 dbname=fakedb user=cam"}
    :engine :postgres
    :name old-name}
   {:details {:conn_str "host=localhost port=5432 dbname=fakedb user=rastacan"}
    :engine :h2
    :name new-name}
   {:details {:conn_str "host=localhost port=5432 dbname=fakedb user=rastacan"}
    :engine :h2
    :name old-name}]
  [(sel-db)
   ;; Check that we can update all the fields
   (do ((user->client :crowberto) :put 200 (format "meta/db/%d" db-id) {:name new-name
                                                                        :engine "h2"
                                                                        :details {:conn_str "host=localhost port=5432 dbname=fakedb user=rastacan"}})
       (sel-db))
   ;; Check that we can update just a single field
   (do ((user->client :crowberto) :put 200 (format "meta/db/%d" db-id) {:name old-name})
       (sel-db))])

;; # DATABASES FOR ORG

;; ## GET /api/meta/db
;; Test that we can get all the DBs for an Org, ordered by name
(let [db-name (str "A" (random-name))] ; make sure this name comes before "Test Database"
  (expect-eval-actual-first
    (filter identity
            [(datasets/when-testing-dataset :generic-sql
               (match-$ (sel :one Database :name db-name)
                 {:created_at $
                  :engine "postgres"
                  :id $
                  :details {:conn_str "host=localhost port=5432 dbname=fakedb user=cam"}
                  :updated_at $
                  :name $
                  :organization_id nil
                  :description nil}))
             (datasets/when-testing-dataset :mongo
               (match-$ @mongo-test-data/mongo-test-db
                 {:created_at $
                  :engine "mongo"
                  :id $
                  :details $
                  :updated_at $
                  :name "Test Database"
                  :organization_id nil
                  :description nil}))
             (match-$ (db)
               {:created_at $
                :engine "h2"
                :id $
                :details $
                :updated_at $
                :name "Test Database"
                :organization_id nil
                :description nil})])
    (do
      ;; Delete all the randomly created Databases we've made so far
      (cascade-delete Database :id [not-in (set (filter identity
                                                        [(datasets/when-testing-dataset :generic-sql
                                                           (db-id))
                                                         (datasets/when-testing-dataset :mongo
                                                           @mongo-test-data/mongo-test-db-id)]))])
      ;; Add an extra DB so we have something to fetch besides the Test DB
      (create-db db-name)
      ;; Now hit the endpoint
      ((user->client :rasta) :get 200 "meta/db"))))


;; # DB TABLES ENDPOINTS

;; ## GET /api/meta/db/:id/tables
;; These should come back in alphabetical order
(expect
    (let [db-id (db-id)]
      [(match-$ (sel :one Table :id (id :categories))
         {:description nil, :entity_type nil, :name "CATEGORIES", :rows 75, :updated_at $, :entity_name nil, :active true, :id $, :db_id db-id, :created_at $})
       (match-$ (sel :one Table :id (id :checkins))
         {:description nil, :entity_type nil, :name "CHECKINS", :rows 1000, :updated_at $, :entity_name nil, :active true, :id $, :db_id db-id, :created_at $})
       (match-$ (sel :one Table :id (id :users))
         {:description nil, :entity_type nil, :name "USERS", :rows 15, :updated_at $, :entity_name nil, :active true, :id $, :db_id db-id, :created_at $})
       (match-$ (sel :one Table :id (id :venues))
         {:description nil, :entity_type nil, :name "VENUES", :rows 100, :updated_at $, :entity_name nil, :active true, :id $, :db_id db-id, :created_at $})])
  ((user->client :rasta) :get 200 (format "meta/db/%d/tables" (db-id))))
