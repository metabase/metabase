(ns metabase.server.core
  "API namespace for the Metabase web server (Ring+Compojure) and middleware. There is some overlap with the
  `metabase.api` module -- some middleware binds stuff like the current user or
  limit/offset (see [[metabase.request.current]]) that is then consumed by the `metabase.api` module."
  (:require
   [metabase.server.handler]
   [metabase.server.instance]
   [metabase.server.middleware.auth]
   [metabase.server.middleware.exceptions]
   [metabase.server.protocols]
   [metabase.server.routes]
   [potemkin :as p]))

(comment
  metabase.server.handler/keep-me
  metabase.server.instance/keep-me
  metabase.server.middleware.auth/keep-me
  metabase.server.middleware.exceptions/keep-me
  metabase.server.protocols/keep-me
  metabase.server.routes/keep-me)

(p/import-vars
 [metabase.server.handler
  make-handler]
 [metabase.server.instance
  instance
  start-web-server!
  stop-web-server!]
 [metabase.server.middleware.auth
  enforce-authentication
  enforce-static-api-key]
 [metabase.server.middleware.exceptions
  message-only-exceptions
  public-exceptions]
  ;; TODO -- I think all of this stuff probably belongs in [[metabase.request.*]]
 [metabase.server.protocols
  Respond]
 [metabase.server.routes
  make-routes])
