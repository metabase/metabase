(ns metabase.models.moderation-review
  "TODO -- this should be moved to `metabase-enterprise.content-verification.models.moderation-review` since it's a
  premium-only model."
  (:require
   [medley.core :as m]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def statuses
  "Schema enum of the acceptable values for the `status` column"
  #{"verified" nil})

(def Statuses
  "Schema of valid statuses"
  [:maybe (into [:enum] statuses)])

(def moderated-item-types
  "Schema enum of the acceptable values for the `moderated_item_type` column"
  [:enum "card" :card])

(def moderated-item-type->model
  "Maps DB name of the moderated item type to the model symbol (used for t2/select and such)"
  {"card" :model/Card
   :card  :model/Card})

(defn- object->type
  "Convert a moderated item instance to the keyword stored in the database"
  [instance]
  (u/lower-case-en (name (t2/model instance))))

;;; currently unused, but I'm leaving this in commented out because it serves as documentation
(comment
  (def ReviewChanges
    "Schema for a ModerationReview that's being updated (so most keys are optional)"
    [:map
     [:id                  {:optional true} mu/IntGreaterThanZero]
     [:moderated_item_id   {:optional true} mu/IntGreaterThanZero]
     [:moderated_item_type {:optional true} moderated-item-types]
     [:status              {:optional true} Statuses]
     [:text                {:optional true} [:maybe :string]]]))

(def ModerationReview
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
  We'll keep this till we replace all the symbols in our codebase."
  :model/ModerationReview)

(methodical/defmethod t2/table-name :model/ModerationReview [_model] :moderation_review)

(doto :model/ModerationReview
  (derive :metabase/model)
  ;;; TODO: this is wrong, but what should it be?
  (derive ::perms/use-parent-collection-perms)
  (derive :hook/timestamped?))

(t2/deftransforms :model/ModerationReview
  {:moderated_item_type mi/transform-keyword})

(mi/define-batched-hydration-method moderation-reviews-for-items
  :moderation_reviews
  "Hydrate moderation reviews onto a seq of items. All are cards or the nils that end up here on text dashboard
  cards. In the future could have dashboards here as well."
  [items]
  ;; no need to do work on empty items. Also, can have nil here due to text cards. I think this is a bug in toucan. To
  ;; get here we are `(t2/hydrate dashboard [:dashcards [:card :moderation_reviews] :series] ...)` But dashcards
  ;; dont have to have cards. but the hydration will pass the nil card id into here.  NOTE: it is important that each
  ;; item that comes into this comes out. The nested hydration is positional, not by an id so everything that comes in
  ;; must go out in the same order
  (when (seq items)
    (let [item-ids    (not-empty (keep :id items))
          all-reviews (when item-ids
                        (group-by (juxt :moderated_item_type :moderated_item_id)
                                  (t2/select 'ModerationReview
                                             :moderated_item_type "card"
                                             :moderated_item_id [:in item-ids]
                                             {:order-by [[:id :desc]]})))]
      (for [item items]
        (if (nil? item)
          nil
          (let [k ((juxt (comp keyword object->type) u/the-id) item)]
            (assoc item :moderation_reviews (get all-reviews k ()))))))))

(mi/define-batched-hydration-method moderation-user-details
  :moderator_details
  "User details on moderation reviews"
  [moderation-reviews]
  (when (seq moderation-reviews)
    (let [id->user (m/index-by :id
                               (t2/select 'User :id [:in (map :moderator_id moderation-reviews)]))]
      (for [mr moderation-reviews]
        (assoc mr :user (get id->user (:moderator_id mr)))))))

(def max-moderation-reviews
  "The amount of moderation reviews we will keep on hand."
  10)

(mu/defn delete-extra-reviews!
  "Delete extra reviews to maintain an invariant of only `max-moderation-reviews`. Called before inserting so actuall
  insures there are one fewer than that so you can add afterwards."
  [item-id   :- :int
   item-type :- :string]
  (let [ids (into #{} (comp (map :id)
                            (drop (dec max-moderation-reviews)))
                  (t2/query {:select   [:id]
                             :from     [:moderation_review]
                             :where    [:and
                                        [:= :moderated_item_id item-id]
                                        [:= :moderated_item_type item-type]]
                             ;; cannot put the offset in this query as mysql doesnt place nice. It requires a limit
                             ;; as well which we do not want to give. The offset is only 10 though so its not a huge
                             ;; savings and we run this on every entry so the max number is 10, delete the extra,
                             ;; and insert a new one to arrive at 10 again, our invariant.
                             :order-by [[:id :desc]]}))]
    (when (seq ids)
      (t2/delete! ModerationReview :id [:in ids]))))

(mu/defn create-review!
  "Create a new ModerationReview"
  [params :-
   [:map
    [:moderated_item_id                    ms/PositiveInt]
    [:moderated_item_type                  moderated-item-types]
    [:moderator_id                         ms/PositiveInt]
    [:status              {:optional true} Statuses]
    [:text                {:optional true} [:maybe :string]]]]
  (t2/with-transaction [_conn]
   (delete-extra-reviews! (:moderated_item_id params) (:moderated_item_type params))
   (t2/update! ModerationReview {:moderated_item_id   (:moderated_item_id params)
                                 :moderated_item_type (:moderated_item_type params)}
               {:most_recent false})
   (t2/insert-returning-instance! ModerationReview (assoc params :most_recent true))))
