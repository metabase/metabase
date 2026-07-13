(ns metabase.comments.models.comment
  (:require
   [metabase.api.common :as api]
   [metabase.comments.models.comment-reaction :as comment-reaction]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Comment [_model] :comment)

(doto :model/Comment
  (derive :metabase/model)
  (derive :hook/timestamped?))

;; NOTE: the `content_html` column is deprecated and no longer written to.
;; HTML for email notifications is now rendered server-side from the `content` JSON
;; via `metabase.comments.render/content->html`. The column can be dropped in a
;; future migration.

(t2/deftransforms :model/Comment
  {:content mi/transform-json})

(methodical/defmethod t2/batched-hydrate [:model/Comment :creator]
  "Hydrate the creator (user) of a comment based on the creator_id."
  [_model k comments]
  (mi/instances-with-hydrated-data
   comments k
   #(t2/select-pk->fn identity [:model/User :id :email :first_name :last_name]
                      :id (keep :creator_id comments))
   :creator_id
   {:default {}}))

(methodical/defmethod t2/batched-hydrate [:model/Comment :reactions]
  "Hydrate the creator (user) of a comment based on the creator_id."
  [_model k comments]
  (mi/instances-with-hydrated-data
   comments k
   #(->> comments
         (remove :deleted_at)
         (map :id)
         (comment-reaction/reactions-for-comments api/*current-user-id*))
   :id
   {:default {}}))

;;;

(defn url
  "Generate an URL to an entity anchored to a comment"
  [entity comment]
  (case (t2/model entity)
    :model/Document (if (:child_target_id comment)
                      (format "/document/%s/comments/%s#comment-%s"
                              (:id entity)
                              (:child_target_id comment)
                              (:id comment))
                      ;; NOTE: not used at the time of writing the code, but given that child_target_id is optional I
                      ;; feel the need to have this clause
                      (format "/document/%s#comment-%s"
                              (:id entity)
                              (:id comment)))))

(defn threads-anchored-to
  "The comment threads on a document that are anchored to one of `block-ids`.

  A thread anchors to a block through `child_target_id`, which holds the block's `_id` as a plain string —
  there is no FK and nothing cleans it up, so a block that gets re-created takes its threads' anchor with
  it. An edit that touches those blocks orphans these threads."
  [document-id block-ids]
  (when (seq block-ids)
    (t2/select [:model/Comment :id :child_target_id :is_resolved]
               :target_type      "document"
               :target_id        document-id
               :child_target_id  [:in block-ids]
               :parent_comment_id nil
               :deleted_at       nil
               {:order-by [[:id :asc]]})))

(defn mentions
  "Find mentioned users inside of a comment content"
  [content]
  (->> (tree-seq :content :content content)
       (filter #(and (= "smartLink" (-> % :type))
                     (= "user" (-> % :attrs :model))))
       (mapv #(-> % :attrs :entityId))))
