(ns metabase.moderation
  (:require [clojure.string :as str]
            [medley.core :as m]
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

(defn- moderation-selection-args
  [moderated-item]
  {:moderated_item_type (object->type moderated-item)
   :moderated_item_id   (u/the-id moderated-item)})

(defn moderation-requests-for-item
  "ModerationRequests for the `moderated-item` (either a Card or a Dashboard)."
  {:hydrate :moderation_requests}
  [moderated-item]
  (m/mapply db/select 'ModerationRequest (moderation-selection-args moderated-item)))

(defn moderation-reviews-for-item
  "ModerationReviews for the `moderated-item` (either a Card or a Dashboard)."
  {:hydrate :moderation_reviews}
  [moderated-item]
  (m/mapply db/select 'ModerationReview (moderation-selection-args moderated-item)))

(defn- in-clause
  [ids]
  (if ids
    [:in :commented_item_id ids]
    [:= 0 1]))

(defn comments-for-item
  "Comments for the `moderated-item` (either a Card or a Dashboard)."
  {:hydrate :comments}
  [moderated-item]
  (let [args (moderation-selection-args moderated-item)]
    (db/select 'Comment {:where [:or
                                 [:and
                                  (in-clause (m/mapply db/select-ids 'ModerationRequest args))
                                  [:= :commented_item_type "moderation_request"]]
                                 [:and
                                  (in-clause (m/mapply db/select-ids 'ModerationReview args))
                                  [:= :commented_item_type "moderation_review"]]]})))
