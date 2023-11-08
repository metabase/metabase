(ns metabase-enterprise.audit-app.interface
  (:require [metabase.plugins.classloader :as classloader]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(def ResultsMetadata
  "Schema for the expected format for `:metadata` returned by an internal query function."
  (su/non-empty
   [[(s/one su/KeywordOrString "field name")
     (s/one {:base_type su/FieldType, :display_name su/NonBlankString, s/Keyword s/Any}
            "field metadata")]]))

(defmulti internal-query
  "Define a new internal query type. Conventionally `query-type` should be a namespaced keyword with the namespace in
  which the method is defined. See docstring
  for [[metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries]] for a description of what this
  method should return."
  {:arglists '([query-type & args])}
  (fn [query-type & _]
    (keyword query-type)))

(defmethod internal-query :default
  [query-type & _]
  (throw (ex-info (str (tru "Unable to run internal query function: cannot resolve {0}" query-type))
                  {:status-code 400})))

(defn resolve-internal-query
  "Invoke the internal query with `query-type` (invokes the corresponding implementation of [[internal-query]])."
  [query-type & args]
  (let [query-type (keyword query-type)
        ns-str     (namespace query-type)]
    (when ns-str
      (classloader/require (symbol ns-str)))
    (apply internal-query query-type args)))
