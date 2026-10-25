(ns metabase.comments.models.comment
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.channel.urls :as channel.urls]
   [metabase.comments.db :as comments.db]
   [metabase.comments.models.comment-reaction :as comment-reaction]
   [metabase.comments.schema :as comments.schema]
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [tru]]
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
  {:content {:in  (comp mi/json-in comments.schema/normalize-content)
             :out (comp (mi/catch-normalization-exceptions comments.schema/normalize-content)
                        mi/json-out-with-keywordization)}
   :context mi/transform-json})

(methodical/defmethod t2/batched-hydrate [:model/Comment :creator]
  "Hydrate the creator (user) of a comment based on the creator_id."
  [_model k comments]
  (mi/instances-with-hydrated-data
   comments k
   #(when-let [creator-ids (seq (keep :creator_id comments))]
      (comments.db/users-by-id creator-ids))
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

(defn target
  "The Document or Exploration `comment` is on, or nil."
  [{:keys [target_type target_id]}]
  (case target_type
    "document"    (comments.db/document target_id)
    "exploration" (comments.db/exploration target_id)))

(defn- check-target-not-archived
  "Throws a 400 with `message` when the target of `comment` is archived."
  [comment message]
  (when (:archived (target comment))
    (throw (ex-info message {:status-code 400}))))

(defn- same-thread?
  "Whether `reply` and `parent` are on the same target and child target."
  [reply parent]
  (every? #(= (get reply %) (get parent %)) [:target_type :target_id :child_target_id]))

(t2/define-before-insert :model/Comment
  [comment]
  (check-target-not-archived comment (tru "Cannot comment on archived entities"))
  (when-let [parent-id (:parent_comment_id comment)]
    (when-not (some->> (comments.db/comment-by-id parent-id) (same-thread? comment))
      (throw (ex-info (tru "Parent comment doesn''t belong to the same entity") {:status-code 400}))))
  comment)

(t2/define-before-update :model/Comment
  [comment]
  (let [changes (t2/changes comment)]
    (when (:deleted_at (t2/original comment))
      (when (contains? changes :content)
        (throw (ex-info (tru "Cannot edit content of a deleted comment") {:status-code 400})))
      (when (contains? changes :deleted_at)
        (throw (ex-info (tru "Comment is already deleted") {:status-code 400}))))
    (when (seq changes)
      (check-target-not-archived comment (if (contains? changes :deleted_at)
                                           (tru "Cannot delete comments on archived entities")
                                           (tru "Cannot edit comments on archived entities"))))
    comment))

(defn- check-reactable
  "Throws a 400 unless the comment with `comment-id` can take a reaction: it is not deleted, and what it is on is not
  archived."
  [comment-id]
  (let [comment (comments.db/comment-by-id comment-id)]
    (when (:deleted_at comment)
      (throw (ex-info (tru "Cannot react to deleted comments") {:status-code 400})))
    (check-target-not-archived comment (tru "Cannot react to comments on archived entities"))))

(t2/define-before-insert :model/CommentReaction
  [reaction]
  (check-reactable (:comment_id reaction))
  reaction)

(t2/define-before-delete :model/CommentReaction
  [reaction]
  (check-reactable (:comment_id reaction))
  reaction)

(def target-type->model
  "The model of a comment's target, by its `target_type`."
  {"document"    :model/Document
   "exploration" :model/Exploration})

(defn- can-read-target?
  "Whether the current user can read the target of `comment`."
  [{:keys [target_type target_id]}]
  (mi/can-read? (target-type->model target_type) target_id))

(defn- author-or-superuser?
  "Whether the current user wrote `comment` or is a superuser."
  [comment]
  (or (= (:creator_id comment) api/*current-user-id*)
      (boolean api/*is-superuser?*)))

(defmethod mi/can-read? :model/Comment
  ([comment]
   (can-read-target? comment))
  ([_model id]
   (boolean (some-> (comments.db/comment-by-id id) can-read-target?))))

(defmethod mi/can-write? :model/Comment
  ([comment]
   (and (author-or-superuser? comment)
        (can-read-target? comment)))
  ([_model id]
   (boolean (some-> (comments.db/comment-by-id id) mi/can-write?))))

(defmethod mi/can-update? :model/Comment
  [comment changes]
  (and (can-read-target? comment)
       (or (not (contains? changes :content))
           (author-or-superuser? comment))
       (or (not (contains? changes :is_resolved))
           (mi/can-write? (target-type->model (:target_type comment)) (:target_id comment)))))

;;;

(defonce ^{:private true
           :doc "Filter applied to comments' `:context` before they are returned, installed at init.

                 A comment's context describes what was commented on, and for an exploration that
                 includes the identity of a chart data point — values read out of the creator's
                 result set. The target's own read check cannot adjudicate that: an Exploration is
                 read-checked on collection permissions alone, because its data-access gate is
                 applied by its read endpoints rather than by `can-read?`. So the owning module
                 registers the verdict here.

                 `comments` cannot call that module directly — the module graph runs one way — so
                 the consumer registers a callback."}
  context-gate
  (atom (fn [_target-type _target-id comments] comments)))

(defn register-context-gate!
  "Install the comment-context gate. Called once at the consuming module's
  init. `f` takes `[target-type target-id comments]` and returns the comments to serve."
  [f]
  (reset! context-gate f))

(defn apply-context-gate
  "Run the registered gate over `comments` for one target."
  [target-type target-id comments]
  (@context-gate target-type target-id comments))

(defn- page-id-child-target?
  "Whether `child_target_id` identifies an exploration page (decimal integer string) rather than
  a Summary prose-mirror node `_id` (uuid)."
  [child]
  (boolean (and child (re-matches #"\d+" (str child)))))

(defn- exploration-comment-url
  "Build URL for an exploration comment. Integer `child_target_id` values deep-link to the
  page; anything else (Summary block uuids) deep-links to the Summary view."
  [exploration-id comment]
  (let [base    (channel.urls/exploration-path exploration-id)
        child   (:child_target_id comment)
        context (:context comment)]
    (if child
      (let [path      (if (page-id-child-target? child)
                        (str base "/page/" (codec/url-encode (str child)))
                        (str base "/summary"))
            params    (cond-> {:comments (str child)}
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
  (into []
        (comp (filter #(and (= "smartLink" (:type %))
                            (= "user" (get-in % [:attrs "model"]))))
              (keep #(let [entity-id (get-in % [:attrs "entityId"])]
                       (when (pos-int? entity-id)
                         entity-id))))
        (tree-seq :content :content content)))

(defn comments-for-document
  "A document's comments, oldest first, with `:creator` hydrated. Deleted comments are dropped —
  except one that still has replies, which stays with its `:content` scrubbed to `{}` so the
  replies' `:parent_comment_id` keeps something to anchor to, the same deleted-comment rule
  `GET /api/comment` applies. Read access to the document is the caller's job to check first —
  the same check-the-target-once pattern the comments REST endpoint uses.

  Matches the endpoint on that scrub rule only; it is not the endpoint's whole response. Reactions
  are not hydrated (they read `api/*current-user-id*`, which a non-request caller has not bound),
  and the ordering breaks ties on `:id` where the endpoint leaves them undetermined."
  [document-id]
  (let [comments     (comments.db/document-comments document-id)
        has-replies? (into #{} (map :parent_comment_id) comments)]
    (-> (into []
              ;; `content_html` is the deprecated pre-render of `:content`. Nothing clears it on
              ;; delete, so scrubbing `:content` alone would leave a deleted comment's body
              ;; readable in the column beside it, and nothing rewrites it on edit, so even a live
              ;; comment's copy can contradict `:content`. The endpoint drops it from every comment
              ;; (`render-comments`); so do we.
              (comp (keep (fn [comment]
                            (cond
                              (not (:deleted_at comment))  comment
                              (has-replies? (:id comment)) (assoc comment :content {})
                              :else                        nil)))
                    (map #(dissoc % :content_html)))
              comments)
        (t2/hydrate :creator))))

(defn child-target-ids-for-document
  "Distinct non-nil `child_target_id` values (with a live comment count each) for a document's
  comment threads. Read access to the document is the caller's job to check first — the same
  check-the-target-once pattern the comments REST endpoint uses."
  [document-id]
  (->> (comments.db/document-child-target-counts document-id)
       (mapv #(select-keys % [:child_target_id :comment_count]))))
