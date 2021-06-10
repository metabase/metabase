(ns metabase.models.notification
  (:require [metabase.models.permissions :as perms]
            [metabase.moderation :as moderation]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.models :as models]))

(def notifier-types
  "Schema enum of the acceptable values for the `notifier_type` column"
  (s/enum "comment" "moderation_review"))

(def notifier->model
  "Maps DB name of notifier to the model symbol (used for db/select and such)"
  {"comment"           'Comment
   "moderation_review" 'ModerationReview})

(models/defmodel Notification :notification)
(u/strict-extend (class Notification)
  models/IModel
  (merge models/IModelDefaults
         {:properties (constantly {:timestamped? true})}))

(defn- in-clause
  [ids]
  (if ids
    [:in :id (distinct ids)]
    [:= 0 1]))

(defn hydrate-notifiers
  {:batched-hydrate :notifier}
  [notifications]
  (when (seq notifications)
    (let [notifiers (->> notifications
                         (group-by :notifier_type)
                         (mapcat (fn [[type notifications]]
                                   (map #(assoc % :type type)
                                        (db/select (notifier->model type)
                                          {:where
                                           (in-clause (map :notifier_id notifications))}))))
                         (group-by (juxt :id :type)))]
      (for [{:keys [notifier_id notifier_type] :as notification} notifications]
        (assoc notification :notifier (first (get notifiers [notifier_id notifier_type])))))))

(defn for-user
  [user-id]
  (db/select Notification :user_id user-id, :read false,
             {:order-by [[:created_at :desc]]}))

(s/defn create-notifications!
  [row-maps :-
   [{:notifier_id   su/IntGreaterThanZero
     :notifier_type notifier-types
     :user_id       su/IntGreaterThanZero}]]
  (db/insert-many! Notification row-maps))
