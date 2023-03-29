(ns metabase.query-processor.middleware.validate
  "Middleware for checking that a normalized query is valid."
  (:require
   [malli.core :as mc]
   [metabase.lib.schema :as lib.schema]))

(defn validate-query
  "Middleware that validates a query immediately after normalization."
  [query]
  (mc/coerce ::lib.schema/query query))
