(ns metabase.comments.write
  "The write functions of Comments, through which every writer creates, updates and deletes them."
  (:require
   [metabase.comments.db :as comments.db]
   [metabase.comments.schema :as comments.schema]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- changed
  "The columns of `changes` whose values differ from those of `comment`."
  [comment changes]
  (into {} (remove (fn [[k v]] (= v (get comment k)))) changes))

(mu/defn create-comment!
  "Insert `comment`, whose after-insert hook publishes its create event, returning the inserted Comment; for the REST
  API."
  [comment :- ::comments.schema/comment.create]
  (events/with-batched-events
    (comments.db/insert-comment! comment)))

(mu/defn update-comment! :- :int
  "Apply `changes` to `comment-or-id`, a Comment the caller already loaded or the id of one, and publish its update
  event, returning the number of Comments updated; for the REST API."
  [comment-or-id :- [:or ms/PositiveInt :map]
   changes       :- ::comments.schema/comment.changes
   _opts         :- ::comments.schema/write-opts]
  (let [comment (if (map? comment-or-id) comment-or-id (comments.db/comment-by-id comment-or-id))
        changes (when comment (changed comment changes))]
    (if (empty? changes)
      0
      (let [changes (cond-> changes
                      (not (contains? changes :updated_at)) (assoc :updated_at (mi/now)))]
        (events/with-batched-events
          (u/prog1 (comments.db/update-comment! (:id comment) changes)
            (events/updated! :model/Comment (merge comment changes) comment)))))))

(mu/defn soft-delete-comment! :- :int
  "Mark `comment-or-id`, a Comment the caller already loaded or the id of one, deleted now, returning the number of
  Comments updated; for the REST API."
  [comment-or-id :- [:or ms/PositiveInt :map]
   opts          :- ::comments.schema/write-opts]
  (update-comment! comment-or-id {:deleted_at [:now]} opts))

(mu/defn delete-comments! :- :int
  "Delete the Comments with `ids` and publish their delete events, returning the number deleted."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::comments.schema/write-opts]
  (let [comments (when (seq ids) (comments.db/comments ids))]
    (if (empty? comments)
      0
      (events/with-batched-events
        (events/deleting! :model/Comment comments
                          #(comments.db/delete-comments! (mapv :id comments)))))))

(defmethod mi/write-fns :model/Comment
  [_model]
  {:update! update-comment!
   :delete! delete-comments!})
