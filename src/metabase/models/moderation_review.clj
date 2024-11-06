(ns metabase.models.moderation-review
  "TODO -- this should be moved to `metabase-enterprise.content-verification.models.moderation-review` since it's a
  premium-only model."
  (:require
   [malli.experimental.time]
   [metabase.db.query :as mdb.query]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.moderation :as moderation]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def statuses
  "Schema enum of the acceptable values for the `status` column"
  #{"verified" "neutral" "expired" "flagged" nil})

(def Statuses
  "Schema of valid statuses"
  [:maybe (into [:enum] statuses)])

(def ^:private reasons
  {:no-updates        (tru "This won't be updated")
   :temp-maintenance  (tru "In temporary maintenance")
   :data-problem      (tru "Problems with the data")
   :needs-replacement (tru "Model needs replacing")
   :other             (tru "Other")})

(def Reasons
  "Reasons that a verifiable entity would be flagged"
  [:maybe (into [:enum nil] (keys reasons))])

;;; currently unused, but I'm leaving this in commented out because it serves as documentation
(comment
  (def ReviewChanges
    "Schema for a ModerationReview that's being updated (so most keys are optional)"
    [:map
     [:id                  {:optional true} mu/IntGreaterThanZero]
     [:moderated_item_id   {:optional true} mu/IntGreaterThanZero]
     [:moderated_item_type {:optional true} moderation/moderated-item-types]
     [:status              {:optional true} Statuses]
     [:text                {:optional true} [:maybe :string]]
     [:reason              {:optional true} Reasons]]))

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
  {:moderated_item_type mi/transform-keyword
   :reason mi/transform-keyword})

(def max-moderation-reviews
  "The amount of moderation reviews we will keep on hand."
  10)

(mu/defn delete-extra-reviews!
  "Delete extra reviews to maintain an invariant of only `max-moderation-reviews`. Called before inserting so actually
  ensures there are one fewer than that so you can add one afterwards."
  [item-id   :- :int
   item-type :- :string]
  (let [ids (into #{} (comp (map :id)
                            (drop (dec max-moderation-reviews)))
                  (mdb.query/query {:select   [:id]
                                    :from     [:moderation_review]
                                    :where    [:and
                                               [:= :moderated_item_id item-id]
                                               [:= :moderated_item_type item-type]]
                                    ;; cannot put the offset in this query as mysql doesnt play nice. It requires a
                                    ;; limit as well which we do not want to give. The offset is only 10 though so its
                                    ;; not a huge savings and we run this on every entry so the max number is 10,
                                    ;; delete the extra, and insert a new one to arrive at 10 again, our invariant.
                                    :order-by [[:id :desc]]}))]
    (when (seq ids)
      (t2/delete! ModerationReview :id [:in ids]))))

(mu/defn create-review!
  "Create a new ModerationReview"
  ;; TODO: once we add "flagged" status, check that reason is only allowed for those.
  [review :- [:map
              [:moderated_item_id   ms/PositiveInt]
              [:moderated_item_type moderation/moderated-item-types]
              [:moderator_id        ms/PositiveInt]
              [:status              {:optional true} Statuses]
              [:reason              {:optional true} Reasons]
              [:text                {:optional true} [:maybe :string]]
              [:expiration-date     :time/local-date]]]
  (t2/with-transaction [_conn]
    (delete-extra-reviews! (:moderated_item_id review) (:moderated_item_type review))
    (t2/update! ModerationReview {:moderated_item_id   (:moderated_item_id review)
                                  :moderated_item_type (:moderated_item_type review)}
                {:most_recent false})
    (first (t2/insert-returning-instances! ModerationReview (assoc review :most_recent true)))))
