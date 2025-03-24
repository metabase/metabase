(ns metabase.internal-stats
  (:require
   [metabase.internal-stats.query-executions :as query-execution-stats]
   [metabase.internal-stats.questions :as question-stats]
   [metabase.internal-stats.users :as user-stats]
   [potemkin :as p]))

(p/import-vars
 [user-stats
  email-domain-count
  external-users-count])

(p/import-vars
 [query-execution-stats
  query-executions-all-time-and-last-24h
  query-execution-last-utc-day])

(p/import-vars
 [question-stats
  question-statistics-all-time])
