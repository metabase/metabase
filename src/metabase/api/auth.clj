(ns metabase.api.auth
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting api-key
  "When set, this key is required for calls to /notify/ endpoints."
  :encryption :when-encryption-key-set
  :visibility :internal
  :doc "Middleware that enforces validation of the client via the request header X-Metabase-Apikey for /notify endpoints.
        If the header is available, then it's validated against MB_API_KEY.
        When it matches, the request continues; otherwise it's blocked with a 403 Forbidden response.
        MB_API_KEY is used only for /notify endpoints and isn't the same as Metabase API keys
        used for authenticating other API requests. MP_API_KEY can be an arbitrary string.")
