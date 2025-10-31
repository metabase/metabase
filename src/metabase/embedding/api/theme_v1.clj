(ns metabase.embedding.api.theme-v1
  "/api/theme/v1 endpoints for public access to embedding themes (no auth required)."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;;; schemas

(mr/def ::Theme
  [:map
   [:id         ms/PositiveInt]
   [:name       ms/NonBlankString]
   [:settings   [:map-of :keyword :any]]
   [:created_at ms/TemporalString]
   [:updated_at ms/TemporalString]])

;;;; endpoints

;; (api.macros/defendpoint :get "/:id-or-name" :- ::Theme
;;   "Fetch an `EmbeddingTheme` by ID or name. This endpoint is public and does not require authentication.

;;   - If `id-or-name` is numeric, it queries by ID
;;   - Otherwise, it queries by name (case-insensitive, URL-decoded)"
;;   [id-or-name :- ms/NonBlankString]
;;   (let [decoded-value (codec/url-decode id-or-name)]
;;     (if-let [id (when (re-matches #"\d+" decoded-value)
;;                   (parse-long decoded-value))]
;;       (api/check-404 (t2/select-one :model/EmbeddingTheme :id id))
;;       (api/check-404 (t2/select-one :model/EmbeddingTheme
;;                                      {:where [:= :%lower.name (u/lower-case-en decoded-value)]})))))
