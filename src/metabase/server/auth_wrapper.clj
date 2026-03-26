(ns metabase.server.auth-wrapper
  (:require
   [metabase.api.util.handlers :as handlers]
   [metabase.config.core :as config]
   [metabase.sso.api.slack-connect :as slack-connect.api]))

;; This needs to be injected into [[metabase.server.routes/routes]] -- not [[metabase.api-routes.core/routes]] !!!
(def routes
  "Ring routes for auth API endpoints.
   Slack Connect (OSS) is always available. Other SSO routes (SAML, JWT, OIDC) require EE."
  (handlers/routes
   (handlers/route-map-handler {"/auth" {"/sso" {"/slack-connect" slack-connect.api/routes}}})
   (when (and config/ee-available? (not *compile-files*))
     (requiring-resolve 'metabase-enterprise.sso.api.routes/routes))))
