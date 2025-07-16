(ns metabase.content-verification.core
  (:require
   [metabase.content-verification.impl]
   [metabase.content-verification.models.moderation-review :as moderation-review]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p]))

(comment metabase.content-verification.impl/keep-me
         metabase.content-verification.models.moderation-review/keep-me)

(p/import-vars
 [metabase.content-verification.impl
  moderated-item-type->model
  moderation-reviews-for-items
  moderation-status
  moderation-user-details]
 [metabase.content-verification.models.moderation-review
  create-review!])

(mr/def ::Statuses [:ref ::moderation-review/Statuses])
(mr/def ::ModeratedItemTypes [:ref :metabase.content-verification.impl/ModeratedItemTypes])
