(ns metabase.request.core
  "API namespace for stuff related to Ring (HTTP) requests, such as info associated with the current request."
  (:require
   [metabase.request.current]
   [metabase.request.session]
   [metabase.request.util]
   [potemkin :as p]))

(comment
  metabase.request.current/keep-me
  metabase.request.session/keep-me
  metabase.request.util/keep-me)

;; TODO -- move stuff in [[metabase.server.middleware.session]]

;; TODO -- move stuff in [[metabase.api.common]]

(p/import-vars
  [metabase.request.current
   current-request
   do-with-current-request
   do-with-limit-and-offset
   limit
   offset
   paged?]
  [metabase.request.session
   as-admin
   clear-session-cookie
   metabase-session-cookie
   with-current-user
   set-session-cookies]
  [metabase.request.util
   DeviceInfo
   api-call?
   cacheable?
   describe-user-agent
   device-info
   embed?
   embedded?
   geocode-ip-addresses
   https?
   ip-address
   public?
   response-forbidden
   response-unauthentic])
