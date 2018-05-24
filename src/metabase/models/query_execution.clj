(ns metabase.models.query-execution
  (:require [metabase.util :as u]
            [puppetlabs.i18n.core :refer [tru]]
            [schema.core :as s]
            [toucan.models :as models]))

(models/defmodel QueryExecution :query_execution)

(def ^:dynamic ^Boolean *validate-context*
  "Whether we should validate the values of `context` for QueryExecutions when INSERTing them.
   (In normal usage, this should always be `true`, but this switch is provided so we can migrating
   legacy QueryExecution entries, which have no `context` information)."
  true)

(def Context
  "Schema for valid values of QueryExecution `:context`."
  (s/enum :ad-hoc
          :csv-download
          :dashboard
          :embedded-dashboard
          :embedded-question
          :json-download
          :map-tiles
          :metabot
          :public-dashboard
          :public-question
          :pulse
          :question
          :xlsx-download))

(defn- pre-insert [{context :context, :as query-execution}]
  (u/prog1 query-execution
    (when *validate-context*
      (s/validate Context context))))

(defn- post-select [{:keys [result_rows] :as query-execution}]
  ;; sadly we have 2 ways to reference the row count :(
  (assoc query-execution :row_count (or result_rows 0)))

(u/strict-extend (class QueryExecution)
  models/IModel
  (merge models/IModelDefaults
         {:types       (constantly {:json_query :json, :status :keyword, :context :keyword, :error :clob})
          :pre-insert  pre-insert
          :pre-update  (fn [& _] (throw (Exception. (str (tru "You cannot update a QueryExecution!")))))
          :post-select post-select}))
