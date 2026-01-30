(ns metabase.query-processor.middleware.validate-temporal-bucketing
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(mu/defn validate-temporal-bucketing
  "Make sure temporal bucketing of Fields (i.e., `:datetime-field` clauses) in this query is valid given the combination
  of Field base-type and unit. For example, you should not be allowed to bucket a `:type/Date` Field by `:minute`."
  [query :- ::lib.schema/query]
  (u/prog1 query
    (lib.walk/walk-clauses
     query
     (fn [query _path-type path clause]
       (lib.util.match/match-lite clause
         [:field (opts :guard :temporal-unit) _id-or-name]
         (let [temporal-unit  (:temporal-unit opts)
               effective-type (lib.walk/apply-f-for-stage-at-path lib/type-of query path clause)
               valid-units    (lib.temporal-bucket/valid-units-for-type effective-type)]
           (when-not (valid-units temporal-unit)
             (throw (ex-info (tru "Unsupported temporal bucketing: You can''t bucket a {0} Field by {1}."
                                  effective-type temporal-unit)
                             {:type           qp.error-type/invalid-query
                              :field          clause
                              :effective-type effective-type
                              :unit           temporal-unit
                              :valid-units    valid-units}))))

         _ nil)))))
