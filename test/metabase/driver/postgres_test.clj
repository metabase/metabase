(ns metabase.driver.postgres-test
  (:require [expectations :refer :all]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.query-processor.expand :as ql]
            [metabase.test.data :as data]
            (metabase.test.data [datasets :refer [expect-with-engine]]
                                [interface :refer [def-database-definition]])
            [metabase.util :as u])
  (:import metabase.driver.postgres.PostgresDriver))

;; # Check that SSL params get added the connection details in the way we'd like
;; ## no SSL -- this should *not* include the key :ssl (regardless of its value) since that will cause the PG driver to use SSL anyway
(expect
  {:user        "camsaul"
   :classname   "org.postgresql.Driver"
   :subprotocol "postgresql"
   :subname     "//localhost:5432/bird_sightings"
   :make-pool?  true}
  (sql/connection-details->spec (PostgresDriver.) {:ssl    false
                                                   :host   "localhost"
                                                   :port   5432
                                                   :dbname "bird_sightings"
                                                   :user   "camsaul"}))

;; ## ssl - check that expected params get added
(expect
  {:ssl         true
   :make-pool?  true
   :sslmode     "require"
   :classname   "org.postgresql.Driver"
   :subprotocol "postgresql"
   :user        "camsaul"
   :sslfactory  "org.postgresql.ssl.NonValidatingFactory"
   :subname     "//localhost:5432/bird_sightings"}
  (sql/connection-details->spec (PostgresDriver.) {:ssl    true
                                                   :host   "localhost"
                                                   :port   5432
                                                   :dbname "bird_sightings"
                                                   :user   "camsaul"}))
;;; # UUID Support
(def-database-definition ^:const ^:private with-uuid
  ["users"
   [{:field-name "user_id", :base-type :UUIDField}]
   [[#uuid "4f01dcfd-13f7-430c-8e6f-e505c0851027"]
    [#uuid "4652b2e7-d940-4d55-a971-7e484566663e"]
    [#uuid "da1d6ecc-e775-4008-b366-c38e7a2e8433"]
    [#uuid "7a5ce4a2-0958-46e7-9685-1a4eaa3bd08a"]
    [#uuid "84ed434e-80b4-41cf-9c88-e334427104ae"]]])


;; Check that we can load a Postgres Database with a :UUIDField
(expect-with-engine :postgres
  [{:name "id",      :base_type :IntegerField}
   {:name "user_id", :base_type :UUIDField}]
  (->> (data/dataset with-uuid
         (ql/run-query
           (ql/source-table (data/id :users))))
       :data
       :cols
       (mapv (u/rpartial select-keys [:name :base_type]))))


;; Check that we can filter by a UUID Field
(expect-with-engine :postgres
  [[2 #uuid "4652b2e7-d940-4d55-a971-7e484566663e"]]
  (-> (data/dataset with-uuid
        (ql/run-query
          (ql/source-table (data/id :users))
          (ql/filter (ql/= (data/id :users :user_id) "4652b2e7-d940-4d55-a971-7e484566663e"))))
      :data :rows))
