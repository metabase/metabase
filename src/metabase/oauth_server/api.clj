(ns metabase.oauth-server.api
  "Top-level route handlers for the embedded OAuth/OIDC provider.
   Assembles handlers from [[metabase.oauth-server.api.oauth]] and [[metabase.oauth-server.api.metadata]]."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.oauth-server.api.metadata]
   [metabase.oauth-server.api.oauth]))

(comment metabase.oauth-server.api.metadata/keep-me
         metabase.oauth-server.api.oauth/keep-me)

(def ^{:arglists '([request respond raise])} well-known-routes
  "Handler for `/.well-known/` routes (top-level, per RFC 8414 and RFC 9728)."
  (api.macros/ns-handler 'metabase.oauth-server.api.metadata))

(def ^{:arglists '([request respond raise])} oauth-routes
  "Handler for `/oauth/` routes."
  (api.macros/ns-handler 'metabase.oauth-server.api.oauth))
