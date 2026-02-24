(ns metabase.tracing.attributes
  "Attribute helpers for OpenTelemetry spans."
  (:require
   [honey.sql :as sql]))

(set! *warn-on-reflection* true)

(defn sanitize-sql
  "Convert a HoneySQL map to a parameterized SQL string for trace attributes.
   Values become ? placeholders — no private data leaks."
  [hsql-map]
  (try
    (first (sql/format hsql-map {:quoted false}))
    (catch Exception _
      (pr-str hsql-map))))
