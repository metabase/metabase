(ns metabase.data-apps.guards.card
  "The data-app guard of the `/api/card` mount of [[metabase.queries-rest.api.card]]."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.data-apps.guard :as guard]
   [metabase.data-apps.rules :as rules]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn check-card!
  "Checks the card whose ID or entity ID is the `:id` or `:card-id` route param."
  [_request {:keys [id card-id]}]
  (rules/check-card! (or id card-id)))

(defn- check-card-run!
  "Checks the card a `request` runs, refusing a run that sends parameters, names a dashboard, previews the card in a
  collection or serves a stored result."
  [request route-params]
  (check-card! request route-params)
  (let [{:keys [parameters dashboard_id collection_preview stored_result_id sort]} (api.macros/request-body request)]
    (when (or (seq (cond-> parameters (string? parameters) json/decode))
              (some? dashboard_id)
              (contains? #{true "true"} collection_preview)
              (some? stored_result_id)
              (some? sort))
      (throw (ex-info (tru "A data app can run a card only as it is saved, without parameters, a dashboard, a collection preview or a stored result.")
                      {:status-code 403})))))

(def checks
  "The checks of a data-app request to each endpoint of [[metabase.queries-rest.api.card]]."
  {[:get "/:id"]                                      check-card!
   [:get "/:id/query_metadata"]                       check-card!
   [:post "/:card-id/query"]                          check-card-run!
   [:post "/:card-id/query/:export-format"]           check-card-run!
   [:post "/pivot/:card-id/query"]                    check-card-run!
   [:get "/:card-id/params/:param-key/values"]        guard/refuse
   [:get "/:card-id/params/:param-key/search/:query"] guard/refuse
   [:get "/:id/params/:param-key/remapping"]          guard/refuse})

(def card-guard
  "Ring middleware guarding the data-app requests to the `/api/card` mount."
  (guard/route-guard 'metabase.queries-rest.api.card checks))
