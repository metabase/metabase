(ns metabase.things.settings
  "Security-lint test example: settings, logging and credentials -- rules that do not depend on taint."
  (:require
   [clj-http.client :as http]
   [clojure.tools.logging :as log]
   [metabase.settings.core :refer [defsetting]]))

(defsetting vendor-api-key "A credential stored in plaintext." :encryption :no)
(defsetting page-size "Not a credential." :encryption :no)
(defsetting llm-max-tokens "A count, not a credential." :encryption :no)

;; a URL the server connects to, writable through the API, with nothing checking the host
(defsetting things-service-url "Where the things live." :visibility :admin)
(defsetting things-logo-url "Fetched by the browser, not the server." :visibility :admin)

(defn login! [user password]
  (log/info "logging in" user "with" password))

;; a setting's value is a row in the application database, written by a settings manager
(defn fetch-things [] (http/get (things-service-url)))
