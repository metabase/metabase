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
  (for [pivot-query (pivot/generate-queries query)]
    (-> (qp/process-query (log/spy :error (assoc query :query (:query pivot-query))))
        (assoc :breakout (:breakout pivot-query)))))

(api/define-routes)
