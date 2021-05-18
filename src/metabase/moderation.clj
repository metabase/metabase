(ns metabase.moderation
  (:require [clojure.string :as str]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

(def moderated-item-types
  "Schema enum of the acceptable values for the `moderated_item_type` column"
  (s/enum "card" "dashboard"))

(defn- object->type
  "Convert a moderated item instance to the keyword stored in the database"
  [moderated-item]
  (str/lower-case (name moderated-item)))

(defn moderation-requests-for-item
  "ModerationRequests for the `moderated-item` (either a Card or a Dashboard)."
  {:hydrate :moderation_requests}
  [moderated-item]
  (db/select 'ModerationRequest
    :moderated_item_type (object->type moderated-item)
    :moderated_item_id (u/the-id moderated-item)))

(defn moderation-reviews-for-item
  "ModerationReviews for the `moderated-item` (either a Card or a Dashboard)."
  {:hydrate :moderation_reviews}
  [moderated-item]
  (db/select 'ModerationReview
    :moderated_item_type (object->type moderated-item)
    :moderated_item_id (u/the-id moderated-item)))

(defn comments-for-item
  "Comments for the `moderated-item` (either a Card or a Dashboard)."
  {:hydrate :comments}
  [moderated-item]
  (db/select 'Comment
    :commented_item_type (object->type moderated-item)
    :commented_item_id (u/the-id moderated-item)
    {:order-by [:created_at]}))
