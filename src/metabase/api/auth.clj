(ns metabase.api.auth
  (:require
   [metabase.models.setting :refer [defsetting]]))

(defsetting api-key
  "When set, this API key is required for all API requests."
  :encryption :when-encryption-key-set
  :visibility :internal
  :doc "Middleware that enforces validation of the client via the request header X-Metabase-Apikey.
        If the header is available, then it’s validated against MB_API_KEY.
        When it matches, the request continues; otherwise it’s blocked with a 403 Forbidden response.")
