(ns metabase.store-api.api
  "Public, unauthenticated API endpoints for fetching various information from the Metabase Store API."
  (:require
   [clj-http.client :as http]
   [metabase.api.macros :as api.macros]
   [metabase.store-api.core :as store-api]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- make-store-request
  "Make a GET request to the Metabase Store API endpoint."
  [endpoint]
  (try
    (let [url (str (store-api/store-api-url) "/api/v2" endpoint)
          response (http/get url {:as :json
                                  :throw-exceptions false
                                  :timeout 30000})]
      (if (= 200 (:status response))
        (:body response)
        (do
          (log/warn "Store API request failed" {:endpoint endpoint
                                                :status (:status response)
                                                :url url})
          {:error "Store API request failed"
           :status (:status response)})))
    (catch Exception e
      (log/error e "Error making Store API request" {:endpoint endpoint})
      {:error "Store API request failed"
       :message (.getMessage e)})))

(api.macros/defendpoint :get "/plan"
  "Fetch information about available plans from the Metabase Store API."
  []
  (make-store-request "/plan"))

(api.macros/defendpoint :get "/addons"
  "Fetch add-on information from the Metabase Store API."
  []
  (make-store-request "/addons"))
