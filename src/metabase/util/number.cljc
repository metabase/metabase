(ns metabase.util.number
  "Number parsing helper functions.
  Most of the implementations are in the split CLJ/CLJS files [[metabase.util.number.impl]]."
  (:refer-clojure :exclude [bigint])
  (:require
   [metabase.util.namespaces :as shared.ns]
   [metabase.util.number.impl :as internal]))

(shared.ns/import-fns
 [internal
  bigint
  bigint?])

(defn parse-bigint
  "Parses a string as a BigInt. If the string cannot be parsed, returns `nil`."
  [s]
  (when (re-matches #"[+-]?\d+" s)
    (internal/bigint s)))
