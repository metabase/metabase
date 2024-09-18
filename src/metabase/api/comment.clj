(ns metabase.api.comment
  "/api/comment endpoints!"
  (:require
   [compojure.core :refer [GET POST PUT]]
   [metabase.api.common :as api]
   [metabase.models.comment :as comment]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private commentable-model-schema "As it says"
  (into [:enum] comment/commentable-models))

(api/defendpoint GET "/"
  "Get juicy things"
  [model model_id]
  {model    [:maybe commentable-model-schema]
   model_id [:maybe ms/PositiveInt]}
  (if model
    (do
      (api/checkp (integer? model_id) "model_id" "model_id is required when specifying a model")
      (comment/for-model model model_id))
    (comment/all)))

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
  [id :as {{:keys [resolved text] :as comment-updates} :body}]
  {id       ms/PositiveInt
   resolved [:maybe :boolean]
   text     [:maybe ms/NonBlankString]}
  (comment/update! id (u/select-non-nil-keys comment-updates [:resolved :text])))

(api/define-routes)
