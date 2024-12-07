(ns metabase.request.core
  "API namespace for stuff related to Ring (HTTP) requests, such as info associated with the current request."
  (:require
   [metabase.request.cookies]
   [metabase.request.current]
   [metabase.request.session]
   [metabase.request.util]
   [potemkin :as p]))

(comment
  metabase.request.cookies/keep-me
  metabase.request.current/keep-me
  metabase.request.session/keep-me
  metabase.request.util/keep-me)

;; TODO -- move stuff in [[metabase.server.middleware.session]]

;; TODO -- move stuff in [[metabase.api.common]]

(p/import-vars
 [metabase.request.cookies
  anti-csrf-token-header
  clear-session-cookie
  metabase-embedded-session-cookie
  metabase-session-cookie
  metabase-session-timeout-cookie
  session-timeout
  session-timeout!
  set-session-cookies
  set-session-timeout-cookie]
 [metabase.request.current
  current-request
  limit
  offset
  paged?
  with-current-request
  with-limit-and-offset]
 [metabase.request.session
  as-admin
  do-with-current-user
  with-current-user]
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
