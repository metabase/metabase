(ns metabase.api.auth
  (:require [metabase.models.setting :as setting :refer [defsetting]]))

(defsetting api-key
  "When set, this API key is required for all API requests."
  :encryption :when-encryption-key-set
  :visibility :internal
  :doc "Middleware that enforces validation of the client via the request header X-Metabase-Apikey.
        If the header is available, then it’s validated against MB_API_KEY.
        When it matches, the request continues; otherwise it’s blocked with a 403 Forbidden response.")

(defsetting show-google-sheets-integration
  "Whether or not to show the user a button that sets up Google Sheets integration."
  :visibility :public
  :type :boolean
  :export? false
  :doc "When enabled, we show users a button to authenticate with Google to import data from Google Sheets."
  :setter :none
  :getter (fn []
            (and
             ;; TEMP (gsheets): check these features when we are ready
             ;; (premium-features/is-hosted?)
             ;; (premium-features/has-feature? :attached-dwh)
             ;; (premium-features/has-feature? :etl-connections)

             ;; Need to know the store-api-url to make requests
             (some? (setting/get-value-of-type :string :store-api-url))
             ;; Need API key for Harbormaster Auth
             (some? (api-key)))))
