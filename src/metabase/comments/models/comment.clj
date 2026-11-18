(ns metabase.comments.models.comment
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.channel.urls :as channel.urls]
   [metabase.comments.audit :as comments.audit]
   [metabase.comments.db :as comments.db]
   [metabase.comments.models.comment-reaction :as comment-reaction]
   [metabase.comments.schema :as comments.schema]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Comment [_model] :comment)

(doto :model/Comment
  (derive :metabase/model)
  (derive :hook/events)
  (derive :hook/timestamped?))

(defmethod events/spec :model/Comment
  [_model]
  {:create :event/comment-create
   :update :event/comment-update
   :delete :event/comment-delete})

(defmethod audit/spec :model/Comment [_model]
  {:track          [:target_type :target_id :child_target_id :parent_comment_id]
   :track-redacted [:content :content_html :context :creator_id :deleted_at :is_resolved]
   :skip           []
   :changes?       false
   :topics         {:create :comment-create
                    :update comments.audit/update-topic
                    :delete :comment-delete}})

(defmethod app-db-copy/spec :model/Comment [_model]
  {:skip? false})

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

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(def target-type->model
  "The model of each `target_type` a Comment can have."
  {"document"    :model/Document
   "exploration" :model/Exploration})

(defn target
  "The entity `comment` is on, or nil when it does not exist."
  [{:keys [target_type target_id]}]
  (when-let [model (target-type->model target_type)]
    (comments.db/target model target_id)))

(defn- targets-by-key
  "The entities `comments` are on, by `[target_type target_id]`, with `:can_read` hydrated, loaded together per type."
  [comments]
  (into {}
        (for [[target-type rows] (group-by :target_type comments)
              :let  [model (target-type->model target-type)]
              :when model
              entity (t2/hydrate (comments.db/targets model (into #{} (map :target_id) rows)) :can_read)]
          [[target-type (:id entity)] entity])))

(methodical/defmethod t2/batched-hydrate [:model/Comment :can_read]
  "Whether the current user can read each of `comments`, which they can when they read the entity it is on, the
  entities answered together."
  [_model k comments]
  (let [entities (targets-by-key (remove nil? comments))]
    (for [comment comments]
      (when comment
        (vary-meta comment assoc k (boolean (some-> (get entities [(:target_type comment) (:target_id comment)])
                                                    mi/can-read?)))))))

(defn- own-or-superuser?
  "Whether the current user created `comment` or is a superuser."
  [comment]
  (boolean (or (= (:creator_id comment) api/*current-user-id*)
               (mi/superuser?))))

(methodical/defmethod t2/batched-hydrate [:model/Comment :can_write]
  "Whether the current user can edit the content of, or delete, each of `comments`: they read the entity it is on, and
  they created it or are a superuser."
  [_model k comments]
  (for [comment (t2/hydrate comments :can_read)]
    (when comment
      (assoc comment k (and (mi/can-read? comment) (own-or-superuser? comment))))))

(defmethod mi/can-create? :model/Comment
  [_model comment]
  (boolean (some-> (target comment) (t2/hydrate :can_read) mi/can-read?)))

(defmethod mi/can-update? :model/Comment
  [comment changes]
  (boolean (and (mi/can-read? comment)
                (or (not (contains? changes :content))
                    (mi/can-write? comment))
                (or (not (contains? changes :is_resolved))
                    (some-> (target comment) (t2/hydrate :can_write) mi/can-write?)))))

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
                            (= "user" (get-in % [:attrs :model]))))
              (keep #(let [entity-id (get-in % [:attrs :entityId])]
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
