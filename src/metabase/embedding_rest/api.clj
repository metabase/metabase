(ns metabase.embedding-rest.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as routes.common]
   [metabase.database-routing.core :as database-routing]
   [metabase.embedding-rest.api.embed]
   [metabase.embedding-rest.api.preview-embed]
   [metabase.embedding-rest.api.sdk]
   [metabase.embedding-rest.api.theme]))

(comment metabase.embedding-rest.api.embed/keep-me
         metabase.embedding-rest.api.preview-embed/keep-me
         metabase.embedding-rest.api.sdk/keep-me
         metabase.embedding-rest.api.theme/keep-me)

(defn- enforce-anonymous-database-routing
  "An embed has no user attributes to route by, so it queries the router database where anonymous access is granted."
  [handler]
  (fn [request respond raise]
    (database-routing/with-database-routing-off-if-granted
      (handler request respond raise))))

(def ^:private ^{:arglists '([handler])} +anonymous-database-routing
  (routes.common/wrap-middleware-for-open-api-spec-generation enforce-anonymous-database-routing))

(def ^{:arglists '([request respond raise])} embedding-routes
  "`/api/embed` routes"
  (api.macros/ns-handler 'metabase.embedding-rest.api.embed +anonymous-database-routing))

(def ^{:arglists '([request respond raise])} preview-embedding-routes
  "`/api/preview_embed` routes"
  (api.macros/ns-handler 'metabase.embedding-rest.api.preview-embed +anonymous-database-routing))

(def ^{:arglists '([request respond raise])} theme-routes
  "`/api/embed-theme` routes"
  (api.macros/ns-handler 'metabase.embedding-rest.api.theme api/+check-superuser))

(def ^{:arglists '([request respond raise])} sdk-routes
  "`/api/embedding-sdk` routes"
  (api.macros/ns-handler 'metabase.embedding-rest.api.sdk api/+check-superuser))
