(ns metabase.server.core
  "API namespace for the Metabase web server (Ring+Compojure) and middleware. There is some overlap with the
  `metabase.api` module -- some middleware binds stuff like the current user or
  limit/offset (see [[metabase.request.current]]) that is then consumed by the `metabase.api` module."
  (:require
   [metabase.server.instance]
   [metabase.server.middleware.auth]
   [metabase.server.middleware.exceptions]
   [metabase.server.protocols]
   [potemkin :as p]))

(comment
  metabase.server.instance/keep-me
  metabase.server.middleware.auth/keep-me
  metabase.server.middleware.exceptions/keep-me
  metabase.server.protocols/keep-me)

(p/import-vars
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
  Respond])

(defn handler
  "Get the top-level Ring handler."
  []
  ;; dynamically resolved for now because [[metabase.server.handler]] depends on [[metabase.server.routes]] which
  ;; depends on [[metabase.api.routes]] and thus would make a big old circular deps MESS...
  ;;
  ;; TODO -- we should clean this up somehow. Need to think about how. This is only used in one
  ;; place, [[metabase.core/start-normally]].
  (requiring-resolve 'metabase.server.handler/app))
