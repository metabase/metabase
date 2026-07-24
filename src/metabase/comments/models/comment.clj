(ns metabase.comments.models.comment
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.channel.urls :as channel.urls]
   [metabase.comments.models.comment-reaction :as comment-reaction]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [ring.util.codec :as codec]
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
  "Build URL for an exploration comment using child_target_id (page ID) and context (JSON map with timeline etc.)."
  [exploration-id comment]
  (let [base    (channel.urls/exploration-path exploration-id)
        child   (:child_target_id comment)
        context (:context comment)]
    (if child
      (let [path      (str base "/page/" (codec/url-encode (str child)))
            params    (cond-> {:comments "true"}
                        (:timeline_id context) (assoc :timeline (:timeline_id context)))
            query-str (->> params
                           (map (fn [[k v]] (str (codec/url-encode (name k))
                                                 "="
                                                 (codec/url-encode (str v)))))
                           (str/join "&"))]
        (str path "?" query-str "#comment-" (:id comment)))
      base)))

(defn url
  "Generate a URL to an entity anchored to a comment."
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
                              (:id comment)))

    :model/Exploration (exploration-comment-url (:id entity) comment)))

(defn mentions
  "Find mentioned users inside of a comment content"
  [content]
  (->> (tree-seq :content :content content)
       (filter #(and (= "smartLink" (-> % :type))
                     (= "user" (-> % :attrs :model))))
       (mapv #(-> % :attrs :entityId))))
