(ns metabase.query-processor.middleware.auto-parse-filter-values
  "Middleware that parses filter clause values that come in as strings (e.g. from the API) to the appropriate type. E.g.
  a String value in a filter clause against a `:type/Integer` Field should get parsed into an integer.

  Note that logic for automatically parsing temporal values lives in the `wrap-values-literals` middleware for
  historic reasons. When time permits it should be moved into this middleware since it's really a separate
  transformation from wrapping the value literals themselves."
  (:require [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.error-type :as error-type]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(s/defn ^:private parse-value-for-base-type [v :- s/Str, base-type :- su/FieldType]
  {:pre [(string? v)]}
  (try
    (condp #(isa? %2 %1) base-type
      :type/BigInteger (bigint v)
      :type/Integer    (Long/parseLong v)
      :type/Decimal    (bigdec v)
      :type/Float      (Double/parseDouble v)
      :type/Boolean    (Boolean/parseBoolean v)
      v)
    (catch Throwable e
      (throw (ex-info (tru "Error filtering against {0} Field: unable to parse String {1} to a {2}"
                           base-type
                           (pr-str v)
                           base-type)
                      {:type error-type/invalid-query}
                      e)))))

(defn- auto-parse-filter-values* [query]
  (mbql.u/replace-in query [:query]
    [:value (v :guard string?) (info :guard (fn [{base-type :base_type}]
                                              (and base-type
                                                   (not (isa? base-type :type/Text)))))]
    [:value (parse-value-for-base-type v (:base_type info)) info]))

(defn auto-parse-filter-values
  "Automatically parse String filter clause values to the appropriate type."
  [qp]
  (fn [query rff context]
    (qp (auto-parse-filter-values* query) rff context)))
