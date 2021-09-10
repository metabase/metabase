(ns metabase.models.moderation-review
  (:require [metabase.models.interface :as i]
            [metabase.models.permissions :as perms]
            [metabase.moderation :as moderation]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.models :as models]))

(def statuses
  "Schema enum of the acceptable values for the `status` column"
  #{"verified" nil})

(def Statuses
  "Schema of valid statuses"
  (apply s/enum statuses))

(def ReviewChanges
  "Schema for a ModerationReview that's being updated (so most keys are optional)"
  {(s/optional-key :id)                  su/IntGreaterThanZero
   (s/optional-key :moderated_item_id)   su/IntGreaterThanZero
   (s/optional-key :moderated_item_type) moderation/moderated-item-types
   (s/optional-key :status)              Statuses
   (s/optional-key :text)                (s/maybe s/Str)
   s/Any                                 s/Any})

(models/defmodel ModerationReview :moderation_review)

(u/strict-extend (class ModerationReview)
  models/IModel
  (merge models/IModelDefaults
         {:properties (constantly {:timestamped? true})
          :types      (constantly {:moderated_item_type :keyword})})

  ;; Todo: this is wrong, but what should it be?
  i/IObjectPermissions
  perms/IObjectPermissionsForParentCollection)

(def max-moderation-reviews
  "The amount of moderation reviews we will keep on hand."
  10)

(s/defn delete-extra-reviews!
  "Delete extra reviews to maintain an invariant of only `max-moderation-reviews`. Called before inserting so actuall
  insures there are one fewer than that so you can add afterwards."
  [item-id :- s/Int item-type :- s/Str]
  (let [ids (into #{} (comp (map :id)
                            (drop (dec max-moderation-reviews)))
                  (db/query {:select [:id]
                             :from [:moderation_review]
                             :where [:and
                                     [:= :moderated_item_id item-id]
                                     [:= :moderated_item_type item-type]]
                             ;; cannot put the offset in this query as mysql doesnt place nice. It requires a limit
                             ;; as well which we do not want to give. The offset is only 10 though so its not a huge
                             ;; savings and we run this on every entry so the max number is 10, delete the extra,
                             ;; and insert a new one to arrive at 10 again, our invariant.
                             :order-by [[:id :desc]]}))]
    (when (seq ids)
      (db/delete! ModerationReview :id [:in ids]))))

(s/defn create-review!
  "Create a new ModerationReview"
  [params :-
   {:moderated_item_id       su/IntGreaterThanZero
    :moderated_item_type     moderation/moderated-item-types
    :moderator_id            su/IntGreaterThanZero
    (s/optional-key :status) Statuses
    (s/optional-key :text)   (s/maybe s/Str)}]
  (db/transaction
   (delete-extra-reviews! (:moderated_item_id params) (:moderated_item_type params))
   (db/update-where! ModerationReview {:moderated_item_id (:moderated_item_id params)
                                       :moderated_item_type (:moderated_item_type params)}
                     :most_recent false)
   (db/insert! ModerationReview (assoc params :most_recent true))))
