(ns metabase.embedding.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.embedding.api.embed]
   [metabase.embedding.api.preview-embed]
   [metabase.embedding.api.theme]
   [metabase.embedding.api.theme-v1]))

(comment metabase.embedding.api.embed/keep-me
         metabase.embedding.api.preview-embed/keep-me
         metabase.embedding.api.theme/keep-me
         metabase.embedding.api.theme-v1/keep-me)

(def ^{:arglists '([request respond raise])} embedding-routes
  "`/api/embed` routes"
  (api.macros/ns-handler 'metabase.embedding.api.embed))

(def ^{:arglists '([request respond raise])} preview-embedding-routes
  "`/api/preview_embed` routes"
  (api.macros/ns-handler 'metabase.embedding.api.preview-embed))

(def ^{:arglists '([request respond raise])} theme-routes
  "`/api/theme` routes"
  (api.macros/ns-handler 'metabase.embedding.api.theme))

;; (def ^{:arglists '([request respond raise])} theme-v1-routes
;;   "`/api/theme/v1` routes"
;;   (api.macros/ns-handler 'metabase.embedding.api.theme-v1))
