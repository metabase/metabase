(ns metabase.db.spec-test
  (:require [expectations :refer :all]
            [metabase.db.spec :refer :all]))

(defn- default-pg-spec [db]
  {:classname "org.postgresql.Driver", :subprotocol "postgresql",
   :subname (format "//localhost:5432/%s?OpenSourceSubProtocolOverride=true" db)})

;; Basic minimal config
(expect
  (default-pg-spec "metabase")
  (postgres {:host "localhost"
             :port 5432
             :db   "metabase"}))

;; Users that don't specify a `:dbname` (and thus no `:db`) will use the user's default, we should allow that
(expect
  (assoc (default-pg-spec "") :dbname nil)
  (postgres {:host   "localhost"
             :port   5432
             :dbname nil
             :db     nil}))

;; We should be tolerant of other random nil values sneaking through
(expect
  (assoc (default-pg-spec "") :dbname nil, :somethingrandom nil)
  (postgres {:host            "localhost"
             :port            5432
             :dbname          nil
             :db              nil
             :somethingrandom nil}))

;; Not specifying any of the values results in defaults
(expect
  (default-pg-spec "")
  (postgres {}))
