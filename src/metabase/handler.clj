(ns metabase.handler
  "Top-level Metabase Ring handler."
  (:require [metabase
             [config :as config]
             [routes :as routes]]
            [metabase.middleware
             [auth :as mw.auth]
             [exceptions :as mw.exceptions]
             [json :as mw.json]
             [log :as mw.log]
             [misc :as mw.misc]
             [security :as mw.security]
             [session :as mw.session]]
            [ring.middleware
             [cookies :refer [wrap-cookies]]
             [keyword-params :refer [wrap-keyword-params]]
             [params :refer [wrap-params]]]))

;; required here because this namespace is not actually used anywhere but we need it to be loaded because it adds
;; impls for handling `core.async` channels as web server responses
(require 'metabase.async.api-response)

(def app
  "The primary entry point to the Ring HTTP server."
  ;; ▼▼▼ POST-PROCESSING ▼▼▼ happens from TOP-TO-BOTTOM
  (->
   ;; when running TESTS use the var so we can redefine routes as needed. No need to waste time with repetitive var
   ;; lookups when running normally
   (if config/is-test?
     #'routes/routes
     routes/routes)
   mw.exceptions/catch-uncaught-exceptions ; catch any Exceptions that weren't passed to `raise`
   mw.exceptions/catch-api-exceptions      ; catch exceptions and return them in our expected format
   mw.log/log-api-call
   mw.security/add-security-headers        ; Add HTTP headers to API responses to prevent them from being cached
   mw.json/wrap-json-body                  ; extracts json POST body and makes it avaliable on request
   mw.json/wrap-streamed-json-response     ; middleware to automatically serialize suitable objects as JSON in responses
   wrap-keyword-params                     ; converts string keys in :params to keyword keys
   wrap-params                             ; parses GET and POST params as :query-params/:form-params and both as :params
   mw.session/bind-current-user            ; Binds *current-user* and *current-user-id* if :metabase-user-id is non-nil
   mw.session/wrap-current-user-id         ; looks for :metabase-session-id and sets :metabase-user-id if Session ID is valid
   mw.session/wrap-session-id              ; looks for a Metabase Session ID and assoc as :metabase-session-id
   mw.auth/wrap-api-key                    ; looks for a Metabase API Key on the request and assocs as :metabase-api-key
   mw.misc/maybe-set-site-url              ; set the value of `site-url` if it hasn't been set yet
   ;; Disabled for now because some things like CSV download buttons don't work with this on.
   mw.misc/bind-user-locale                ; Binds *locale* for i18n
   wrap-cookies                            ; Parses cookies in the request map and assocs as :cookies
   mw.misc/add-content-type                ; Adds a Content-Type header for any response that doesn't already have one
   mw.misc/disable-streaming-buffering     ; Add header to streaming (async) responses so ngnix doesn't buffer keepalive bytes
   mw.misc/wrap-gzip))                     ; GZIP response if client can handle it
;; ▲▲▲ PRE-PROCESSING ▲▲▲ happens from BOTTOM-TO-TOP
