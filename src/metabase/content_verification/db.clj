(ns metabase.content-verification.db
  "Application database queries for the content verification module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`).

  The queries below follow [[::opts]]; queries that do not fit it live in the content-verification-only section at
  the bottom of this namespace."
  (:require
   [metabase.content-verification.schema :as content-verification.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which ModerationReviews a query applies to. Keys mirror the columns of `moderation_review`: a scalar matches that
  value and a set matches any of its values."
  [:map {:closed true}
   [:id                  {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:moderated_item_id   {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:moderated_item_type {:optional true} [:or :keyword :string [:set [:or :keyword :string]]]]
   [:most_recent         {:optional true} :boolean]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::content-verification.schema/moderation-review.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::content-verification.schema/moderation-review.column
                                              [:tuple ::content-verification.schema/moderation-review.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/ModerationReview columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-moderation-reviews :- [:sequential ::content-verification.schema/moderation-review.partial]
  "The ModerationReviews matching `opts`."
  ([]
   (select-moderation-reviews nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select (->model columns) (->args opts))))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-moderation-review! :- ::content-verification.schema/moderation-review
  "Insert the ModerationReview `row` and return the inserted instance."
  [row :- ::content-verification.schema/moderation-review.create]
  (t2/insert-returning-instance! :model/ModerationReview row))

(mu/defn update-moderation-reviews! :- :int
  "Apply `changes` to every ModerationReview matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::content-verification.schema/moderation-review.update]
  (apply t2/update! :model/ModerationReview (conj (->kv-args opts) changes)))

(mu/defn delete-moderation-reviews! :- :int
  "Delete every ModerationReview matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (apply t2/delete! :model/ModerationReview (->args opts)))

;;; ------------------------- Queries used only by the content-verification module -------------------------

(mu/defn select-users :- [:sequential :map]
  "The Users with `user-ids`."
  [user-ids :- [:maybe [:sequential [:maybe ::lib.schema.id/user]]]]
  (t2/select :model/User :id [:in user-ids]))
