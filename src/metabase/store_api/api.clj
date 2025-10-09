(ns metabase.store-api.api
  "Public, unauthenticated API endpoints for fetching various information from the Metabase Store API."
  (:require
   [clj-http.client :as http]
   [metabase.api.macros :as api.macros]
   [metabase.store-api.core :as store-api]
   [metabase.store-api.schema :as store-api.schema]))

(set! *warn-on-reflection* true)

(defn- make-store-request
  "Make a GET request to fetch infrom from public Metabase Store API endpoints."
  [endpoint]
  (let [url (str (store-api/store-api-url) "/api/v2" endpoint)]
    (:body (http/get url {:as :json}))))

(api.macros/defendpoint :get "/plans" :- [:sequential ::store-api.schema/Plan]
  "Fetch information about currently supported Metabase plans from the Metabase Store API."
  []
  (make-store-request "/plan"))

(api.macros/defendpoint :get "/addons" :- [:sequential ::store-api.schema/Addon]
  "Fetch the add-on information from the Metabase Store API."
  []
  (make-store-request "/addons"))
