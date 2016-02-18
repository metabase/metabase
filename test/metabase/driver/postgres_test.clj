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
   :make-pool?  true
   :sslmode     "disable"}
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
   [{:field-name "user_id", :base-type :type/text.uuid}]
   [[#uuid "4f01dcfd-13f7-430c-8e6f-e505c0851027"]
    [#uuid "4652b2e7-d940-4d55-a971-7e484566663e"]
    [#uuid "da1d6ecc-e775-4008-b366-c38e7a2e8433"]
    [#uuid "7a5ce4a2-0958-46e7-9685-1a4eaa3bd08a"]
    [#uuid "84ed434e-80b4-41cf-9c88-e334427104ae"]]])


;; Check that we can load a Postgres Database with a :type/text.uuid
(expect-with-engine :postgres
  [{:name "id",      :base_type :type/number.integer}
   {:name "user_id", :base_type :type/text.uuid}]
  (->> (data/dataset metabase.driver.postgres-test/with-uuid
         (data/run-query users))
       :data
       :cols
       (mapv (u/rpartial select-keys [:name :base_type]))))


;; Check that we can filter by a UUID Field
(expect-with-engine :postgres
  [[2 #uuid "4652b2e7-d940-4d55-a971-7e484566663e"]]
  (-> (data/dataset metabase.driver.postgres-test/with-uuid
        (data/run-query users
          (ql/filter (ql/= $user_id "4652b2e7-d940-4d55-a971-7e484566663e"))))
      :data :rows))


;;; # Make sure that Tables / Fields with dots in their names get escaped properly
(def-database-definition ^:const ^:private dots-in-names
  ["objects.stuff"
   [{:field-name "dotted.name", :base-type :type/text}]
   [["toucan_cage"]
    ["four_loko"]
    ["ouija_board"]]])

(expect-with-engine :postgres
  {:columns ["id" "dotted.name"]
   :rows    [[1 "toucan_cage"]
             [2 "four_loko"]
             [3 "ouija_board"]]}
  (-> (data/dataset metabase.driver.postgres-test/dots-in-names
        (data/run-query objects.stuff))
      :data (dissoc :cols)))


;;; # Make sure that duplicate column names (e.g. caused by using a FK) still return both columns
(def-database-definition duplicate-names
  ["birds"
   [{:field-name "name", :base-type :type/text}]
   [["Rasta"]
    ["Lucky"]]]
  ["people"
   [{:field-name "name", :base-type :type/text}
    {:field-name "bird_id", :base-type :type/number.integer, :fk :birds}]
   [["Cam" 1]]])

(expect-with-engine :postgres
  {:columns ["name" "name_2"]
   :rows    [["Cam" "Rasta"]]}
  (-> (data/dataset metabase.driver.postgres-test/duplicate-names
        (data/run-query people
          (ql/fields $name $bird_id->birds.name)))
      :data (dissoc :cols)))
