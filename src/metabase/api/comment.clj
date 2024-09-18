(ns metabase.api.comment
  "/api/comment endpoints!"
  (:require
   [compojure.core :refer [GET POST PUT]]
   [metabase.api.common :as api]
   [metabase.models.comment :as comment]
   [metabase.models.reaction :as reaction]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private commentable-model-schema "As it says"
  (into [:enum] comment/commentable-models))

(api/defendpoint GET "/"
  "Get juicy things"
  [model model_id user_id]
  {model    [:maybe commentable-model-schema]
   model_id [:maybe ms/PositiveInt]
   user_id  [:maybe ms/PositiveInt]}
  (cond
    model (do
            (api/checkp (integer? model_id) "model_id" "model_id is required when specifying a model")
            (api/checkp (nil? user_id) "user_id" "When specifying a model, do not provide user_id")
            (comment/for-model model model_id))
    user_id (comment/user-notifications api/*current-user-id*)
    :else (comment/all)))

(api/defendpoint POST "/"
  "Create a comment"
  [:as {{:keys [model model_id text]} :body}]
  {model    commentable-model-schema
   model_id ms/PositiveInt
   text     ms/NonBlankString}
  (comment/create! {:model     model
                    :model_id  model_id
                    :text      text
                    :author_id api/*current-user-id*}))

(api/defendpoint PUT "/:id"
  "Update a comment (resolve; edit)"
  [id :as {{:keys [resolved text]} :body}]
  {id       ms/PositiveInt
   resolved [:maybe :boolean]
   text     [:maybe ms/NonBlankString]}
  (let [comment-updates {:resolved       resolved
                         :text           text
                         :resolved_by_id (when resolved api/*current-user-id*)}]
    (comment/update! id (u/select-non-nil-keys comment-updates [:resolved :text :resolved_by_id]))))

(api/defendpoint POST "/:comment-id/react"
  "Create a comment"
  [comment-id :as {{:keys [emoji]} :body}]
  {comment-id ms/PositiveInt
   emoji      ms/NonBlankString}
  (reaction/create! {:comment_id comment-id
                     :emoji      emoji
                     :author_id  api/*current-user-id*}))

(api/defendpoint GET "/my-name-is-bruno-and-i-am-drunk-with-power"
  "Deletes all comments"
  []
  {}
  (t2/delete! :model/Comment)
  {:status "I am become death, destroyer of worlds"})

(api/define-routes)
