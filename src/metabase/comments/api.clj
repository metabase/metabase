(ns metabase.comments.api
  "`/api/comment/` routes"
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.channel.render.core :as channel.render]
   [metabase.comments.models.comment :as comment]
   [metabase.comments.models.comment-reaction :as comment-reaction]
   [metabase.events.core :as events]
   [metabase.request.core :as request]
   [metabase.users-rest.api :as api.user]
   [metabase.users.models.user :as user]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; TODO (Cam 10/28/25) -- don't capitalize constants https://guide.clojure.style/#naming-constants
(def ^:private TYPE->MODEL
  {"document" :model/Document})

(defn- entity-archived?
  "Check if the target entity is archived"
  [entity]
  (case (t2/model entity)
    :model/Document (:archived entity)))

(defn- urlpath-for
  "Generate an URL to an entity"
  [entity]
  (case (t2/model entity)
    :model/Document (str "/document/" (:id entity))))

;;; schemas

(def CommentContent
  "Validation for comment content - expects JSON"
  (mu/with-api-error-message
   [:and
    {:error/message "Comment content must be valid JSON"
     :json-schema   {:type "object"}}
    [:map]]
   (deferred-tru "Comment content must be valid JSON.")))

(def CreateComment
  "Schema for creating a new comment"
  [:map
   [:target_type [:enum "document"]]
   [:target_id   ms/PositiveInt]
   [:content     CommentContent]
   [:html        :string]
   [:child_target_id {:optional true} [:maybe :string]]
   [:parent_comment_id {:optional true} [:maybe ms/PositiveInt]]])

(def UpdateComment
  "Schema for updating a comment"
  [:map
   [:content {:optional true} CommentContent]
   [:html    {:optional true} :string]
   [:is_resolved {:optional true} :boolean]])

;;; routes

(defn- render-comments
  "Process comments to prepare them for the world:
  - remove/scrub deleted comments
  - render reactions with limited amount of users"
  [comments]
  (let [has-replies?     (into #{} (map :parent_comment_id comments))
        delete-comment   (fn [c]
                           (cond
                             (not (:deleted_at c))        c
                             (not (has-replies? (:id c))) nil
                             ;; if comment has replies, we scrub it
                             :else                        (assoc c :content {})))
        render-reactions (fn [c]
                           (update c :reactions (fn [emoji-map]
                                                  (vec (for [[emoji users] emoji-map]
                                                         {:emoji emoji
                                                          :count (count users)
                                                          :users (take 10 users)})))))]
    (into [] (comp (map #(dissoc % :content_html))
                   (map render-reactions)
                   (keep delete-comment))
          comments)))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Get comments for an entity"
  [_route-params
   {:keys [target_type target_id]} :- [:map
                                       [:target_type [:enum "document"]]
                                       [:target_id ms/PositiveInt]]
   _body
   req]
  (if (analytics/embedding-context? (get-in req [:headers "x-metabase-client"]))
    {:disabled true
     :comments []}
    (let [_entity  (api/read-check (TYPE->MODEL target_type) target_id)
          comments (-> (t2/select :model/Comment
                                  {:where    [:and
                                              [:= :target_type target_type]
                                              [:= :target_id target_id]]
                                   :order-by [[:created_at :asc]]})
                       (t2/hydrate :creator :reactions))]
      {:comments (render-comments comments)})))

(defn notify-comment!
  "Send a notification about comment"
  [{:keys [target_type target_id parent_comment_id] :as comment}
   & [{:keys [entity parent]
       ;; if you don't pass them we'll try to fetch them
       :or   {entity (t2/select-one (TYPE->MODEL target_type) :id target_id)
              parent (when parent_comment_id
                       (t2/select-one :model/Comment :id parent_comment_id))}}]]
  (let [clause     (if parent_comment_id
                     {:where [:in :id {:from   [:comment]
                                       :select [:creator_id]
                                       :where  [:or
                                                [:= :id parent_comment_id]
                                                [:= :parent_comment_id parent_comment_id]]}]}
                     ;; TODO: when we expand to more entity types, add dispatch here if not everyone has `creator_id`
                     {:where [:= :id (:creator_id entity)]})
        mentions   (comment/mentions (:content comment))
        recipients (-> (t2/select-fn-set :email [:model/User :email]
                                         (cond-> clause
                                           (seq mentions) (sql.helpers/where :or [:in :id mentions])))
                       (disj (:email @api/*current-user*)))
        payload    {:entity_type    (:target_type comment)
                    :entity_title   (:name entity)
                    :comment_href   (comment/url entity comment)
                    :document_href  (urlpath-for entity)
                    :created_at     (:created_at comment)
                    :author         (:common_name (:creator comment))
                    :comment        (:content_html comment)
                    :parent_author  (:common_name (:creator parent))
                    :parent_comment (:content_html parent)
                    :style            {:color_text_dark   channel.render/color-text-dark
                                       :color_text_light  channel.render/color-text-light
                                       :color_text_medium channel.render/color-text-medium}}]
    (doseq [email recipients]
      (events/publish-event! :event/comment-created (assoc payload :email email)))))

(defn notify-comment-id!
  "Send a notification using only comment id"
  [comment-id]
  (notify-comment! (-> (t2/select-one :model/Comment :id comment-id)
                       (t2/hydrate :creator :reactions))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new comment"
  [_route-params
   _query-params
   {:keys [target_type target_id child_target_id parent_comment_id content html]} :- CreateComment]
  (let [entity     (-> (api/read-check (TYPE->MODEL target_type) target_id)
                       (u/prog1 (api/check-400 (not (entity-archived? <>))
                                               "Cannot comment on archived entities")))
        ;; If this is a reply, validate the parent comment exists and belongs to same entity
        parent     (when parent_comment_id
                     (-> (api/check-404 (t2/select-one :model/Comment :id parent_comment_id))
                         (u/prog1 (api/check-400 (and (= (:target_type <>) target_type)
                                                      (= (:target_id <>) target_id)
                                                      (= (:child_target_id <>) child_target_id))
                                                 "Parent comment doesn't belong to the same entity"))
                         (t2/hydrate :creator)))
        comment    (-> (t2/insert-returning-instance! :model/Comment
                                                      {:target_type       target_type
                                                       :target_id         target_id
                                                       :child_target_id   child_target_id
                                                       :parent_comment_id parent_comment_id
                                                       :content           content
                                                       :content_html      html
                                                       :creator_id        api/*current-user-id*})
                       (t2/hydrate :creator)
                       ;; New comments always have empty reactions map
                       (assoc :reactions []))]
    (notify-comment! comment {:entity entity :parent parent})
    (events/publish-event! :event/comment-create
                           {:object comment
                            :user-id api/*current-user-id*})
    comment))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:comment-id"
  "Update a comment"
  [{:keys [comment-id]} :- [:map [:comment-id ms/PositiveInt]]
   _query-params
   {:keys [content html is_resolved]} :- UpdateComment]
  (let [comment (api/check-404 (t2/select-one :model/Comment :id comment-id))
        entity  (-> (api/read-check (TYPE->MODEL (:target_type comment)) (:target_id comment))
                    (u/prog1 (api/check-400 (not (entity-archived? <>))
                                            "Cannot edit comments on archived entities")))]

    (when content
      ;; Cannot edit content of deleted comments
      (api/check-400 (not (:deleted_at comment))
                     "Cannot edit content of a deleted comment")
      ;; Only creator or admin can edit comment content
      (api/check-403 (or (= (:creator_id comment) api/*current-user-id*)
                         (:is_superuser @api/*current-user*))))

    (when (some? is_resolved)
      ;; Anyone with write permission to target entity can resolve/unresolve
      (api/write-check entity))

    (when-let [updates (-> {:content content :html html :is_resolved is_resolved}
                           u/remove-nils
                           not-empty)]
      (t2/update! :model/Comment comment-id updates))

    (let [updated-comment (-> (t2/select-one :model/Comment :id comment-id)
                              (t2/hydrate :creator :reactions))]
      (events/publish-event! :event/comment-update
                             {:object updated-comment
                              :user-id api/*current-user-id*})
      updated-comment)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:comment-id"
  "Soft delete a comment"
  [{:keys [comment-id]} :- [:map [:comment-id ms/PositiveInt]]
   _query-params]
  (let [comment (api/check-404 (t2/select-one :model/Comment :id comment-id))]

    (-> (api/read-check (TYPE->MODEL (:target_type comment)) (:target_id comment))
        (u/prog1 (api/check-400 (not (entity-archived? <>))
                                "Cannot delete comments on archived entities")))

    ;; Only creator or admin can delete comments
    (api/check-403 (or (= (:creator_id comment) api/*current-user-id*)
                       (:is_superuser @api/*current-user*)))
    (api/check-400 (not (:deleted_at comment)) "Comment is already deleted")

    ;; Soft delete the comment
    (t2/update! :model/Comment comment-id {:deleted_at [:now]})

    (events/publish-event! :event/comment-delete
                           {:object comment
                            :user-id api/*current-user-id*})

    ;; Return 204 No Content
    api/generic-204-no-content))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:comment-id/reaction"
  "Toggle a reaction on a comment"
  [{:keys [comment-id]} :- [:map [:comment-id ms/PositiveInt]]
   _query-params
   {:keys [emoji]} :- [:map [:emoji [:string {:min 1 :max 10}]]]]
  (let [comment (api/check-404 (t2/select-one :model/Comment :id comment-id))]
    (api/check-400 (not (:deleted_at comment))
                   "Cannot react to deleted comments")

    (-> (api/read-check (TYPE->MODEL (:target_type comment)) (:target_id comment))
        (u/prog1 (api/check-400 (not (entity-archived? <>))
                                "Cannot react to comments on archived entities")))

    (comment-reaction/toggle-reaction comment-id api/*current-user-id* emoji)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/mentions"
  "Get a list of entities suitable for mentions. NOTE: only users for now."
  [_route _query _body req]
  ;; no access in embedding context
  (api/check-404 (not (analytics/embedding-context? (get-in req [:headers "x-metabase-client"]))))

  (let [clauses (user/filter-clauses {:limit  (request/limit)
                                      :offset (request/offset)})]
    ;; returns nothing while we're trying to figure out how do we deal with sandboxes and tenants etc
    ;; do not forget to uncomment tests (both api and e2e)
    {:data   (->> (t2/select [:model/User :id :first_name :last_name :email]
                             (-> clauses
                                 (sql.helpers/order-by [:%lower.first_name :asc]
                                                       [:%lower.last_name :asc]
                                                       [:id :asc])))
                  (mapv #(assoc % :model "user")))
     :total  (:count (t2/query-one
                      (merge {:select [[[:count [:distinct :core_user.id]] :count]]
                              :from   :core_user}
                             (api.user/filter-clauses-without-paging clauses))))
     :limit  (request/limit)
     :offset (request/offset)}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/comment/` routes."
  (api.macros/ns-handler *ns* +auth))
