(ns metabase.db.spec-test
  (:require [expectations :refer :all]
            [metabase.db.spec :as db.spec]))

(defn- default-pg-spec [db]
  {:classname                     "org.postgresql.Driver"
   :subprotocol                   "postgresql"
   :subname                       (format "//localhost:5432/%s" db)
   :OpenSourceSubProtocolOverride true})

;; Basic minimal config
(expect
  (default-pg-spec "metabase")
  (db.spec/postgres
   {:host "localhost"
    :port 5432
    :db   "metabase"}))

;; Users that don't specify a `:dbname` (and thus no `:db`) will use the user's default, we should allow that
(expect
  (assoc (default-pg-spec "") :dbname nil)
  (db.spec/postgres
   {:host   "localhost"
    :port   5432
    :dbname nil
    :db     nil}))

;; We should be tolerant of other random nil values sneaking through
(expect
  (assoc (default-pg-spec "") :dbname nil, :somethingrandom nil)
  (db.spec/postgres
   {:host    "localhost"
    :port            5432
    :dbname          nil
    :db              nil
    :somethingrandom nil}))

;; Not specifying any of the values results in defaults
(expect
  (default-pg-spec "")
  (db.spec/postgres {}))
