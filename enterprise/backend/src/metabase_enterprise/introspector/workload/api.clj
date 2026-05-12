(ns metabase-enterprise.introspector.workload.api
  (:require
   [clojure.string :as str]
   [metabase-enterprise.introspector.workload.quartz :as quartz]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.malli.schema :as ms])
  (:import (java.time Instant)))

(set! *warn-on-reflection* true)

(defn- parse-instant [s]
  (try (Instant/parse s)
       (catch Throwable _
         (throw (ex-info (str "invalid timestamp: " s) {:status-code 400})))))

(defn- parse-types [types]
  (when types
    (->> (str/split types #",") (remove str/blank?) (map keyword) set)))

(api.macros/defendpoint :get "/grid"
  "Hour-bucket grid for the workload heatmap.
   Required: from, to (ISO-8601 UTC).
   Optional: types (comma-separated job types)."
  [_route-params
   {:keys [from to types]} :- [:map
                               [:from ms/NonBlankString]
                               [:to   ms/NonBlankString]
                               [:types {:optional true} [:maybe :string]]]]
  (quartz/grid (parse-instant from) (parse-instant to)
               {:types (parse-types types)}))

(api.macros/defendpoint :get "/slot"
  "Jobs scheduled in [from, to). Used for the click-to-expand drill-down.
   Required: from, to. Optional: types."
  [_route-params
   {:keys [from to types]} :- [:map
                               [:from ms/NonBlankString]
                               [:to   ms/NonBlankString]
                               [:types {:optional true} [:maybe :string]]]]
  (quartz/slot (parse-instant from) (parse-instant to)
               {:types (parse-types types)}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/introspector/workload` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
