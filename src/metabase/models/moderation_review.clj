(ns metabase.models.moderation-review
  "TODO -- this should be moved to `metabase-enterprise.content-verification.models.moderation-review` since it's a
  premium-only model."
  (:require
   [metabase.db.query :as mdb.query]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.moderation :as moderation]
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

;;; currently unused, but I'm leaving this in commented out because it serves as documentation
(comment
  (def ReviewChanges
    "Schema for a ModerationReview that's being updated (so most keys are optional)"
    [:map
     [:id                  {:optional true} mu/IntGreaterThanZero]
     [:moderated_item_id   {:optional true} mu/IntGreaterThanZero]
     [:moderated_item_type {:optional true} moderation/moderated-item-types]
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
                  (mdb.query/query {:select   [:id]
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
    [:moderated_item_id       ms/PositiveInt]
    [:moderated_item_type     moderation/moderated-item-types]
    [:moderator_id            ms/PositiveInt]
    [:status              {:optional true} Statuses]
    [:text                {:optional true} [:maybe :string]]]]
  (t2/with-transaction [_conn]
   (delete-extra-reviews! (:moderated_item_id params) (:moderated_item_type params))
   (t2/update! ModerationReview {:moderated_item_id   (:moderated_item_id params)
                                 :moderated_item_type (:moderated_item_type params)}
               {:most_recent false})
   (first (t2/insert-returning-instances! ModerationReview (assoc params :most_recent true)))))
