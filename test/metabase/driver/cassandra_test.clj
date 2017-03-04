(ns metabase.driver.cassandra-test
  "Tests for Cassandra driver."
  (:require [clojure.walk :as walk]
            [expectations :refer :all]
            [toucan.db :as db]
            [metabase.driver :as driver]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [field-values :refer [FieldValues]]
                             [table :refer [Table] :as table])
            [metabase.query-processor :as qp]
            [metabase.query-processor.expand :as ql]
            [metabase.query-processor-test :refer [rows]]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [metabase.test.data.interface :as i]
            [metabase.test.util :as tu])
  (:import org.joda.time.DateTime
           metabase.driver.cassandra.CassandraDriver))

(datasets/expect-with-engine :cassandra
  false
  (driver/can-connect-with-details? :cassandra {:host   "localhost"
                                                :port   3000
                                                ; :dbname "bad-db-name"
                                                }))

(datasets/expect-with-engine :cassandra
  false
  (driver/can-connect-with-details? :cassandra {}))

(datasets/expect-with-engine :cassandra
  true
  (driver/can-connect-with-details? :cassandra {:host "localhost"
                                                :port 9042
                                                ; :dbname "metabase-test"
                                                }))

; 1
; com.datastax.driver.core.exceptions.SyntaxError: line 1:12 
; missing EOF at '-' (USE metabase[-]test)

; 2
; ERROR metabase.driver :: Failed to connect to database: 
; com.datastax.driver.core.exceptions.InvalidQueryException: Keyspace 'metabase_test' does not exist

;; should use default port 9042 if not specified
(datasets/expect-with-engine :cassandra
  true
  (driver/can-connect-with-details? :cassandra {:host "localhost"
                                                :dbname "metabase_test"}))

; uknown IP
(datasets/expect-with-engine :cassandra
  false
  (driver/can-connect-with-details? :cassandra {:host "123.4.5.6"
                                                :dbname "bad_db_name"}))

; wrong port
(datasets/expect-with-engine :cassandra
  false
  (driver/can-connect-with-details? :cassandra {:host "localhost"
                                                :port 3000
                                                :dbname "bad_db_name"}))


(datasets/expect-with-engine :cassandra
  {}
  (driver/describe-database (CassandraDriver.) (data/db)))



