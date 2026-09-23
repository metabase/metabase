(ns metabase.api.util
  "Random utility endpoints for things that don't belong anywhere else in particular, e.g. endpoints for certain admin
  page tasks."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.server.lib.etag-cache :as lib.etag-cache]
   [metabase.system.core :as system]
   [metabase.util.random :as u.random]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/random_token"
  "Return a cryptographically secure random 32-byte token, encoded as a hexadecimal string.
   Intended for use when creating a value for `embedding-secret-key`."
  []
  {:token (u.random/secure-hex 32)})

(api.macros/defendpoint :get "/timezones" :- :any
  "Return the timezones this instance can offer as a report timezone.

  Returns a Ring response rather than the list alone so that it can carry an ETag: the list is large, it is
  needed by one admin page, and it changes only when the instance is upgraded, so a client that already
  holds it is answered with a 304."
  [_route-params _query-params _body request]
  (let [timezones (system/available-timezones)]
    (-> (response/response timezones)
        (lib.etag-cache/with-etag request {:tag (lib.etag-cache/content-tag timezones)}))))
