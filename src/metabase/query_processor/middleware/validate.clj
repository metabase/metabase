(ns metabase.query-processor.middleware.validate
  "Middleware for checking that a normalized query is valid."
  (:require
   [malli.error :as me]
   [metabase.lib.schema :as lib.schema]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.registry :as mr]))

(defn validate-query
  "Middleware that validates a query immediately after normalization."
  [query]
  (let [explainer (mr/explainer ::lib.schema/query)]
    (when-let [error (explainer query)]
      (let [humanized (me/humanize error)]
        (throw (ex-info (i18n/tru "Invalid query: {0}" (pr-str humanized))
                        {:type     qp.error-type/invalid-query
                         :error    humanized
                         :original error})))))
  query)
