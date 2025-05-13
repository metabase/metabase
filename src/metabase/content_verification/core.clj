(ns metabase.content-verification.core
  (:require
   [metabase.content-verification.impl]
   [metabase.content-verification.models.moderation-review]
   [potemkin :as p]))

(comment metabase.content-verification.impl/keep-me
         metabase.content-verification.models.moderation-review/keep-me)

(p/import-vars
 [metabase.content-verification.impl
  moderated-item-type->model
  moderated-item-types
  moderation-reviews-for-items
  moderation-status
  moderation-user-details]
 [metabase.content-verification.models.moderation-review
  create-review!
  Statuses])
