(ns metabase.internal-stats.core
  (:require
   [metabase.internal-stats.embedding :as embedding-stats]
   [metabase.internal-stats.query-executions :as query-execution-stats]
   [metabase.internal-stats.questions :as question-stats]
   [metabase.internal-stats.users :as user-stats]
   [potemkin :as p]))

(p/import-vars
 [embedding-stats
  embedding-dashboard-count
  embedding-question-count])

(p/import-vars
 [user-stats
  email-domain-count
  external-users-count
  tenant-users-count
  tenants-with-active-users-count])

(p/import-vars
 [query-execution-stats
  query-executions-all-time-and-last-24h
  query-execution-last-utc-day])

(p/import-vars
 [question-stats
  question-statistics-all-time])
