(ns metabase.permissions-rest.api.permission-graph
  "Convert the permission graph's naive json conversion into the correct types.

  The strategy here is to use s/conform to tag every value that needs to be converted with the conversion strategy,
  then postwalk to actually perform the conversion."
  (:require
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defmulti ^:private convert
  "convert values from the naively converted json to what we REALLY WANT"
  {:arglists '([spec-conformed])}
  first)

(defmethod convert :kw->int [[_ k]] (Integer/parseInt (name k)))
(defmethod convert :str->kw [[_ s]] (keyword s))

;; Convert a keyword to string without excluding the namespace.
;; e.g: :schema/name => "schema/name".
;; Primarily used for schema-name since schema are allowed to have "/"
;; and calling (name s) returning a substring after "/".
(defmethod convert :kw->str [[_ s]] (u/qualified-name s))
(defmethod convert :nil->none [[_ _]] :none)
(defmethod convert :identity [[_ x]] x)
(defmethod convert :global-execute [[_ x]] x)
(defmethod convert :db-exeute [[_ x]] x)
