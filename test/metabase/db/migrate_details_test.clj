(ns metabase.db.migrate-details-test
  (:require [expectations :refer :all]
            [metabase.db.migrate-details :refer :all]))

;; # tests for convert-details-when-legacy

;; ## legacy postgres
(expect {:user "cam"
         :dbname "fakedb"
         :port 5432
         :host "localhost"
         :timezone "US/Pacific"
         :conn_str "host=localhost port=5432 dbname=fakedb user=cam"}
  (convert-details-when-legacy
   :postgres
   {:conn_str "host=localhost port=5432 dbname=fakedb user=cam"
    :timezone "US/Pacific"}))

;; ## new-style postgres
(expect nil
  (convert-details-when-legacy
   :postgres
   {:ssl false
    :host "localhost"
    :port 5432
    :dbname "ryde"
    :user "cam"
    :conn_str "host=localhost port=5432 dbname=ryde user=cam"}))

;; ## legacy h2
(expect {:timezone "US/Pacific",
         :db "host=localhost port=5432 dbname=fakedb user=rastacan"
         :conn_str "host=localhost port=5432 dbname=fakedb user=rastacan"}
  (convert-details-when-legacy
   :h2
   {:timezone "US/Pacific"
    :conn_str "host=localhost port=5432 dbname=fakedb user=rastacan"}))

;; ## new-style h2
(expect nil
  (convert-details-when-legacy
   :h2
   {:timezone "US/Pacific"
    :db "host=localhost port=5432 dbname=fakedb user=rastacan"
    :conn_str "host=localhost port=5432 dbname=fakedb user=rastacan"}))

;; ## legacy mongo
(expect {:timezone "US/Pacific"
         :conn_str "mongodb://localhost:27017/test"
         :port 27017
         :dbname "test"
         :host "localhost"}
  (convert-details-when-legacy
   :mongo
   {:timezone "US/Pacific", :conn_str "mongodb://localhost:27017/test"}))

(expect {:timezone "US/Pacific"
         :conn_str "mongodb://cam:password@localhost:27017/test"
         :port 27017
         :dbname "test"
         :host "localhost"
         :pass "password"
         :user "cam"}
  (convert-details-when-legacy
   :mongo
   {:timezone "US/Pacific",
    :conn_str "mongodb://cam:password@localhost:27017/test"}))

(expect nil
  (convert-details-when-legacy
   :mongo
   {:timezone "US/Pacific"
    :conn_str "mongodb://localhost:27017/test"
    :port 27017
    :dbname "test"
    :host "localhost"}))
