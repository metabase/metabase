(ns metabase.test.driver-test-api.core
  (:require
   [metabase.config :as config]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [potemkin :as p]))

(p/import-vars
 qp/process-query
 sync/sync-database!
 config/is-test?)
