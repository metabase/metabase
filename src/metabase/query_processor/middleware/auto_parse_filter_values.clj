(ns metabase.query-processor.middleware.auto-parse-filter-values
  "Middleware that parses filter clause values that come in as strings (e.g. from the API) to the appropriate type. E.g.
  a String value in a filter clause against a `:type/Integer` Field should get parsed into an integer.

  Note that logic for automatically parsing temporal values lives in
  the [[metabase.query-processor.middleware.wrap-value-literals]] middleware for historic reasons. When time permits
  it should be moved into this middleware since it's really a separate transformation from wrapping the value literals
  themselves."
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn- parse-value-for-base-type
  [v              :- :string
   effective-type :- ::lib.schema.common/base-type]
  {:pre [(string? v)]}
  (try
    (condp #(isa? %2 %1) effective-type
      :type/BigInteger (bigint v)
      :type/Integer    (Long/parseLong v)
      :type/Decimal    (bigdec v)
      :type/Float      (Double/parseDouble v)
      :type/Boolean    (Boolean/parseBoolean v)
      v)
    (catch Throwable e
      (throw (ex-info (tru "Error filtering against {0} Field: unable to parse String {1} to a {2}"
                           effective-type
                           (pr-str v)
                           effective-type)
                      {:type qp.error-type/invalid-query}
                      e)))))

;;; I guess we probably want this to work on join conditions as well as normal stage filters.
(defn- auto-parse-filter-values-in-clause
  [_query _path-type _path clause]
  (lib.util.match/match-lite clause
    [:value
     (opts :guard (let [{:keys [effective-type]} opts]
                    (and effective-type
                         (not (isa? effective-type :type/Text)))))
     (v :guard string?)]
    [:value opts (parse-value-for-base-type v (:effective-type opts))]

    _ nil))

(mu/defn auto-parse-filter-values :- ::lib.schema/query
  "Automatically parse String filter clause values to the appropriate type."
  [query :- ::lib.schema/query]
  (lib.walk/walk-clauses query auto-parse-filter-values-in-clause))
