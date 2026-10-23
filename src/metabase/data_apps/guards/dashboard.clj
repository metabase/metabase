(ns metabase.data-apps.guards.dashboard
  "The data-app guard of the `/api/dashboard` mount of [[metabase.dashboards-rest.api]], which lets a data app use a
  dashboard in the Library as a whole, with everything on it."
  (:require
   [metabase.data-apps.guard :as guard]
   [metabase.data-apps.rules :as rules]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- check-dashboard!
  "Checks the dashboard whose ID or entity ID is the `:id` or `:dashboard-id` route param."
  [_request {:keys [id dashboard-id]}]
  (rules/check-dashboard! (or id dashboard-id)))

(defn- refuse!
  "Refuses a data app's request to a dashboard endpoint that names no dashboard."
  [_request _route-params]
  (throw (ex-info (tru "A data app can use only the dashboards in the Library.") {:status-code 403})))

(def checks
  "The checks of a data-app request to each endpoint of [[metabase.dashboards-rest.api]]."
  {[:get "/:id"]                                                                     check-dashboard!
   [:get "/:id/query_metadata"]                                                      check-dashboard!
   [:get "/:id/params/:param-key/values"]                                            check-dashboard!
   [:get "/:id/params/:param-key/search/:query"]                                     check-dashboard!
   [:get "/:id/params/:param-key/remapping"]                                         check-dashboard!
   [:get "/params/valid-filter-fields"]                                              refuse!
   [:post "/:dashboard-id/dashcard/:dashcard-id/execute"]                            check-dashboard!
   [:post "/:dashboard-id/dashcard/:dashcard-id/execute/values"]                     check-dashboard!
   [:post "/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query"]                check-dashboard!
   [:post "/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query/:export-format"] check-dashboard!
   [:post "/pivot/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query"]          check-dashboard!})

(def dashboard-guard
  "Ring middleware guarding the data-app requests to the `/api/dashboard` mount."
  (guard/route-guard 'metabase.dashboards-rest.api checks))
