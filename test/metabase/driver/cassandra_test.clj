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



