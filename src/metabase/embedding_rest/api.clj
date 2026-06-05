(ns metabase.embedding-rest.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.embedding-rest.api.embed]
   [metabase.embedding-rest.api.preview-embed]
   [metabase.embedding-rest.api.theme]))

(comment metabase.embedding-rest.api.embed/keep-me
         metabase.embedding-rest.api.preview-embed/keep-me
         metabase.embedding-rest.api.theme/keep-me)

(def ^{:arglists '([request respond raise])} embedding-routes
  "`/api/embed` routes"
  (api.macros/ns-handler 'metabase.embedding-rest.api.embed))

(def ^{:arglists '([request respond raise])} preview-embedding-routes
  "`/api/preview_embed` routes"
  (api.macros/ns-handler 'metabase.embedding-rest.api.preview-embed))

(def ^{:arglists '([request respond raise])} theme-routes
  "`/api/embed-theme` routes"
  (api.macros/ns-handler 'metabase.embedding-rest.api.theme api/+check-superuser))
