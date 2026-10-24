(ns metabase.data-apps.guards.search
  "The data-app guard of the `/api/search` mount of [[metabase.search.api]]."
  (:require
   [metabase.data-apps.guards :as guards]
   [metabase.data-apps.guards.util :as guards.util]))

(set! *warn-on-reflection* true)

(defn- filter-search
  "Returns the filter of the results a `request` searches for."
  [request _route-params]
  (guards/search-filter request))

(def checks
  "The checks of a data-app request to each endpoint of [[metabase.search.api]]."
  {[:get "/"] filter-search})

(def search-guard
  "Ring middleware guarding the data-app requests to the `/api/search` mount."
  (guards.util/route-guard 'metabase.search.api checks))
