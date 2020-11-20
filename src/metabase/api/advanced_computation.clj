(ns metabase.api.advanced-computation
  "/api/advanced_computation endpoints, like pivot table generation"
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [POST]]
            [metabase.api.common :as api]
            [metabase.models.database :as database :refer [Database]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.pivot :as pivot]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s]))

(api/defendpoint POST "/pivot/dataset"
  "Generate a pivoted dataset for an ad-hoc query"
  [:as {{:keys      [database]
         query-type :type
         :as        query} :body}]
  {database (s/maybe s/Int)}

  (when-not database
    (throw (Exception. (str (tru "`database` is required for all queries.")))))
  (api/read-check Database database)

  ;;TODO: make this use process-query-async, and run all four queries in parallel
  (let [pivot-queries (pivot/generate-queries query)]
    (log/spy :error (map (fn [inner-query]
                           (-> (qp/process-query (log/spy :error (assoc query :query (:query inner-query))))
                               (assoc :breakout (:breakout inner-query)))) pivot-queries))))

(api/define-routes)
