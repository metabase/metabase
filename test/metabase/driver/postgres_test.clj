(ns metabase.driver.postgres-test
  (:require [expectations :refer :all]
            [metabase.driver.generic-sql.interface :as i]
            [metabase.driver.postgres :refer :all]
            [metabase.test.data.interface :refer [def-database-definition]]
            [metabase.test.util.mql :refer [Q]]))

;; # Check that database->connection details still works whether we're dealing with new-style or legacy details
;; ## new-style
(expect {:db   "bird_sightings"
         :ssl  false
         :port 5432
         :host "localhost"
         :user "camsaul"}
  (i/database->connection-details driver {:details {:ssl    false
                                                    :host   "localhost"
                                                    :port   5432
                                                    :dbname "bird_sightings"
                                                    :user   "camsaul"}}))


;; # Check that SSL params get added the connection details in the way we'd like
;; ## no SSL -- this should *not* include the key :ssl (regardless of its value) since that will cause the PG driver to use SSL anyway
(expect
    {:user        "camsaul"
     :classname   "org.postgresql.Driver"
     :subprotocol "postgresql"
     :subname     "//localhost:5432/bird_sightings"
     :make-pool?  true}
  (i/connection-details->connection-spec driver {:ssl    false
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
  (i/connection-details->connection-spec driver {:ssl    true
                                                 :host   "localhost"
                                                 :port   5432
                                                 :dbname "bird_sightings"
                                                 :user   "camsaul"}))
;;; # UUID Support
(def-database-definition ^:private with-uuid
  ["users"
   [{:field-name "user_id", :base-type :UUIDField}]
   [[#uuid "4f01dcfd-13f7-430c-8e6f-e505c0851027"]
    [#uuid "4652b2e7-d940-4d55-a971-7e484566663e"]
    [#uuid "da1d6ecc-e775-4008-b366-c38e7a2e8433"]
    [#uuid "7a5ce4a2-0958-46e7-9685-1a4eaa3bd08a"]
    [#uuid "84ed434e-80b4-41cf-9c88-e334427104ae"]]])

;; Check that we can load a Postgres Database with a :UUIDField
(expect {:cols    [{:description nil, :base_type :IntegerField, :name "id", :display_name "Id", :special_type :id, :target nil, :extra_info {}}
                   {:description nil, :base_type :UUIDField, :name "user_id", :display_name "User Id", :special_type :category, :target nil, :extra_info {}}],
         :columns ["id" "user_id"],
         :rows    [[1 #uuid "4f01dcfd-13f7-430c-8e6f-e505c0851027"]
                   [2 #uuid "4652b2e7-d940-4d55-a971-7e484566663e"]
                   [3 #uuid "da1d6ecc-e775-4008-b366-c38e7a2e8433"]
                   [4 #uuid "7a5ce4a2-0958-46e7-9685-1a4eaa3bd08a"]
                   [5 #uuid "84ed434e-80b4-41cf-9c88-e334427104ae"]]}
  (-> (Q run against metabase.driver.postgres-test/with-uuid using postgres
         return :data
         aggregate rows of users)
      (update :cols (partial mapv #(dissoc % :id :table_id)))))

;; Check that we can filter by a UUID Field
(expect [[2 #uuid "4652b2e7-d940-4d55-a971-7e484566663e"]]
  (Q run against metabase.driver.postgres-test/with-uuid using postgres
     return :data :rows
     aggregate rows of users
     filter = user_id "4652b2e7-d940-4d55-a971-7e484566663e"))
