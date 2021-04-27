(ns metabase.moderation
  (:require [metabase.models :refer [Card Dashboard ModerationRequest ModerationReview]]
            [toucan.db :as db]))

(def ^:const moderated-item-name->class
  "Map used to relate the type stored in the DB to the actual class of the moderated item (currently questions and
  dashboards)"
  {:card      Card
   :dashboard Dashboard})

(defn moderation-requests-for-item
  "ModerationRequests for the `moderated-item` whose ID is provided. `item-type` should be a keyword (`:card` or `:dashboard`)"
  [item-type moderated-item-id]
  (db/select ModerationRequest :moderated_item_type (name item-type) :moderated_item_id moderated-item-id))

(defn moderation-reviews-for-item
  "ModerationReviews for the `moderated-item` whose ID is provided. `item-type` should be a keyword (`:card` or `:dashboard`)"
  [item-type moderated-item-id]
  (db/select ModerationReview  :moderated_item_type (name item-type) :moderated_item_id moderated-item-id))
