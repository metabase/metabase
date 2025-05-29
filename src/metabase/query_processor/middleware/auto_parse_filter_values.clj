(ns metabase.query-processor.middleware.auto-parse-filter-values
  "Middleware that parses filter clause values that come in as strings (e.g. from the API) to the appropriate type. E.g.
  a String value in a filter clause against a `:type/Integer` Field should get parsed into an integer.

  Note that logic for automatically parsing temporal values lives in the `wrap-values-literals` middleware for
  historic reasons. When time permits it should be moved into this middleware since it's really a separate
  transformation from wrapping the value literals themselves."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
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

(mu/defn- auto-parse-values-in-filter-clause :- ::lib.schema.expression/boolean
  [filter-clause :- ::lib.schema.expression/boolean]
  (lib.util.match/replace filter-clause
    [:value
     (info :guard (fn [{:keys [effective-type], :as _value-options}]
                    (and effective-type
                         (not (isa? effective-type :type/Text)))))
     (v :guard string?)]
    [:value info (parse-value-for-base-type v (:effective-type info))]))

(mu/defn- auto-parse-filter-values-this-stage :- ::lib.schema/stage
  [query      :- ::lib.schema/query
   stage-path :- ::lib.walk/stage-path
   stage      :- ::lib.schema/stage]
  (reduce
   (fn [stage filter-clause]
     (let [filter-clause' (auto-parse-values-in-filter-clause filter-clause)]
       (if (= filter-clause filter-clause')
         stage
         (-> (lib.walk/apply-f-for-stage-at-path lib/replace-clause query stage-path filter-clause filter-clause')
             (get-in stage-path)))))
   stage
   (lib.walk/apply-f-for-stage-at-path lib/filters query stage-path)))

(mu/defn auto-parse-filter-values :- ::lib.schema/query
  "Automatically parse String filter clause values to the appropriate type."
  [query :- ::lib.schema/query]
  (lib.walk/walk-stages query auto-parse-filter-values-this-stage))
