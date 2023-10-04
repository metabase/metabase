(ns metabase-enterprise.audit-app.interface
  (:require
   [metabase.plugins.classloader :as classloader]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]))

(def ResultsMetadata
  "Schema for the expected format for `:metadata` returned by an internal query function."
  [:sequential
   {:min 1}
   [:tuple
    ms/KeywordOrString
    [:map
     [:base_type    ms/FieldType]
     [:display_name ms/NonBlankString]]]])

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
