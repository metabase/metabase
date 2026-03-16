(ns metabase.tracing.attributes
  "Attribute helpers for OpenTelemetry spans."
  (:require
   [honey.sql :as sql]))

(set! *warn-on-reflection* true)

(defn best-effort-sanitize-sql
  "Convert a HoneySQL map to a parameterized SQL string for trace attributes.
   Values become ? placeholders. That is a best-effort sanitizing solution."
  [hsql-map]
  (try
    (first (sql/format hsql-map {:quoted false}))
    (catch Exception _
      (pr-str hsql-map))))
