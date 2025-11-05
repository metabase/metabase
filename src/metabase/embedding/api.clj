(ns metabase.embedding.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.embedding.api.embed]
   [metabase.embedding.api.preview-embed]))

(comment metabase.embedding.api.embed/keep-me
         metabase.embedding.api.preview-embed/keep-me)

(def ^{:arglists '([request respond raise])} embedding-routes
  "`/api/embed` routes"
  (api.macros/ns-handler 'metabase.embedding.api.embed))

(def ^{:arglists '([request respond raise])} preview-embedding-routes
  "`/api/preview_embed` routes"
  (api.macros/ns-handler 'metabase.embedding.api.preview-embed))
