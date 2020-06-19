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
             [session :as mw.session]
             [ssl :as mw.ssl]]
            [metabase.plugins.classloader :as classloader]
            [ring.middleware
             [cookies :refer [wrap-cookies]]
             [gzip :refer [wrap-gzip]]
             [keyword-params :refer [wrap-keyword-params]]
             [params :refer [wrap-params]]]))

;; required here because this namespace is not actually used anywhere but we need it to be loaded because it adds
;; impls for handling `core.async` channels as web server responses
(classloader/require 'metabase.async.api-response)


(def app
  "The primary entry point to the Ring HTTP server."
  (->
   ;; in production, dereference routes now because they will not change at runtime, so we don't need to waste time
   ;; dereferencing the var on every request. For dev & test, use the var instead so it can be tweaked without having
   ;; to restart the web server
   (if config/is-prod?
     routes/routes
     #'routes/routes)
   ;; ▼▼▼ POST-PROCESSING ▼▼▼ happens from TOP-TO-BOTTOM
   mw.exceptions/catch-uncaught-exceptions ; catch any Exceptions that weren't passed to `raise`
   mw.exceptions/catch-api-exceptions      ; catch exceptions and return them in our expected format
   mw.log/log-api-call
   mw.security/add-security-headers        ; Add HTTP headers to API responses to prevent them from being cached
   mw.json/wrap-json-body                  ; extracts json POST body and makes it avaliable on request
   mw.json/wrap-streamed-json-response     ; middleware to automatically serialize suitable objects as JSON in responses
   wrap-keyword-params                     ; converts string keys in :params to keyword keys
   wrap-params                             ; parses GET and POST params as :query-params/:form-params and both as :params
   mw.misc/maybe-set-site-url              ; set the value of `site-url` if it hasn't been set yet
   mw.session/bind-current-user            ; Binds *current-user* and *current-user-id* if :metabase-user-id is non-nil
   mw.session/wrap-current-user-info       ; looks for :metabase-session-id and sets :metabase-user-id and other info if Session ID is valid
   mw.session/wrap-session-id              ; looks for a Metabase Session ID and assoc as :metabase-session-id
   mw.auth/wrap-api-key                    ; looks for a Metabase API Key on the request and assocs as :metabase-api-key
   wrap-cookies                            ; Parses cookies in the request map and assocs as :cookies
   mw.misc/add-content-type                ; Adds a Content-Type header for any response that doesn't already have one
   mw.misc/disable-streaming-buffering     ; Add header to streaming (async) responses so ngnix doesn't buffer keepalive bytes
   wrap-gzip                               ; GZIP response if client can handle it
   mw.ssl/redirect-to-https-middleware))   ; Redirect to HTTPS if configured to do so
;; ▲▲▲ PRE-PROCESSING ▲▲▲ happens from BOTTOM-TO-TOP
