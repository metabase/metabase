(ns metabase.embedding-rest.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.embedding-rest.api.embed]
   [metabase.embedding-rest.api.preview-embed]))

(comment metabase.embedding-rest.api.embed/keep-me
         metabase.embedding-rest.api.preview-embed/keep-me)

(def ^{:arglists '([request respond raise])} embedding-routes
  "`/api/embed` routes"
  (api.macros/ns-handler 'metabase.embedding-rest.api.embed))

(def ^{:arglists '([request respond raise])} preview-embedding-routes
  "`/api/preview_embed` routes"
  (api.macros/ns-handler 'metabase.embedding-rest.api.preview-embed))
