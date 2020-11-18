(ns metabase.api.advanced-computation
  "/api/advanced_computation endpoints, like pivot table generation"
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [POST]]
            [metabase.api.common :as api]
            [schema.core :as s]))

(api/defendpoint ^:streaming POST "/pivot/dataset"
  "Generate a pivoted dataset for an ad-hoc query"
  [:as {{:keys [database], query-type :type, parameters :parameters, :as query} :body}]
  {database (s/maybe s/Int)}
  {})

(api/define-routes)
