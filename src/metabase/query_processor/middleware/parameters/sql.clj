(ns ^:deprecated metabase.query-processor.middleware.parameters.sql
  "Legacy SQL parameter expansion namespace. Use `metabase.query-processor.middleware.parameters.native` instead."
  (:require [metabase.query-processor.middleware.parameters.native :as native]))

(defn ^:deprecated expand
  "Expand parameters inside a *SQL* `query`. DEPRECATED - use `metabase.query-processor.middleware.parameters.native/expand` instead."
  [query]
  (native/expand query))
