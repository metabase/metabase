(ns metabase.driver.postgres-test
  (:require [expectations :refer :all]
            [metabase.driver.postgres :refer :all]
            [metabase.test.util :refer [resolve-private-fns]]))

(resolve-private-fns metabase.driver.postgres
  connection-details->connection-spec
  database->connection-details)

;; # Check that database->connection details still works whether we're dealing with new-style or legacy details
;; ## new-style
(expect {:db "bird_sightings"
         :db-type :postgres
         :make-pool? false
         :ssl false
         :port 5432
         :host "localhost"
         :user "camsaul"}
  (database->connection-details {:details {:ssl    false
                                           :host   "localhost"
                                           :port   5432
                                           :dbname "bird_sightings"
                                           :user   "camsaul"}}))


;; # Check that SSL params get added the connection details in the way we'd like
;; ## no SSL -- this should *not* include the key :ssl (regardless of its value) since that will cause the PG driver to use SSL anyway
(expect
    {:user "camsaul"
     :classname "org.postgresql.Driver"
     :subprotocol "postgresql"
     :subname "//localhost:5432/bird_sightings"
     :make-pool? true}
  (connection-details->connection-spec {:ssl    false
                                        :host   "localhost"
                                        :port   5432
                                        :dbname "bird_sightings"
                                        :user   "camsaul"}))

;; ## ssl - check that expected params get added
(expect
    {:ssl true
     :make-pool? true
     :sslmode "require"
     :classname "org.postgresql.Driver"
     :subprotocol "postgresql"
     :user "camsaul"
     :sslfactory "org.postgresql.ssl.NonValidatingFactory"
     :subname "//localhost:5432/bird_sightings"}
  (connection-details->connection-spec {:ssl    true
                                        :host   "localhost"
                                        :port   5432
                                        :dbname "bird_sightings"
                                        :user   "camsaul"}))
