(ns metabase.comments.models.comment
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.channel.urls :as channel.urls]
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
  {:content mi/transform-json
   :context mi/transform-json})

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

(defn- exploration-comment-url
  "Build URL for an exploration comment using child_target_id (group ID) and context (JSON map with timeline etc.)."
  [base comment]
  (let [child   (:child_target_id comment)
        context (:context comment)]
    (if child
      (let [path        (format "%s/group/%s" base child)
            ;; Build query params from context map plus comments=true
            params      (cond-> (if (map? context) context {})
                          true (assoc :comments "true"))
            query-str   (->> params
                             (map (fn [[k v]] (format "%s=%s" (name k) v)))
                             (str/join "&"))]
        (format "%s?%s#comment-%s" path query-str (:id comment)))
      base)))

(defn url
  "Generate a URL to an entity anchored to a comment."
  [entity comment]
  (let [base (case (t2/model entity)
               :model/Document    (channel.urls/document-path (:id entity))
               :model/Exploration (channel.urls/exploration-path (:id entity)))]
    (case (t2/model entity)
      :model/Document    (if-let [child (:child_target_id comment)]
                           (format "%s/comments/%s#comment-%s" base child (:id comment))
                           (format "%s#comment-%s" base (:id comment)))
      :model/Exploration (exploration-comment-url base comment))))

(defn mentions
  "Find mentioned users inside of a comment content"
  [content]
  (->> (tree-seq :content :content content)
       (filter #(and (= "smartLink" (-> % :type))
                     (= "user" (-> % :attrs :model))))
       (mapv #(-> % :attrs :entityId))))
