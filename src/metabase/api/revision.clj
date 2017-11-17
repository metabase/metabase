(ns metabase.api.revision
  (:require [compojure.core :refer [GET POST]]
            [metabase.api
             [card :as card-api]
             [common :as api]]
            [metabase.models
             [card :refer [Card]]
             [dashboard :refer [Dashboard]]
             [revision :as revision :refer [Revision]]]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private ^:const name->entity
  {"card"      Card
   "dashboard" Dashboard})

(def ^:private Entity
  "Schema for a valid revisionable entity name."
  (apply s/enum (keys name->entity)))

(api/defendpoint GET "/"
  "Get revisions of an object."
  [entity id]
  {entity Entity, id s/Int}
  (let [entity (name->entity entity)]
    (api/check-404 (db/exists? entity :id id))
    (revision/revisions+details entity id)))

(api/defendpoint POST "/revert"
  "Revert an object to a prior revision."
  [:as {{:keys [entity id revision_id]} :body}]
  {entity Entity, id s/Int, revision_id s/Int}
  (let [entity   (name->entity entity)
        revision (api/check-404 (Revision :model (:name entity), :model_id id, :id revision_id))]
    ;; if reverting a Card, make sure we have *data* permissions to run the query we're reverting to
    (when (= entity Card)
      (card-api/check-data-permissions-for-query (get-in revision [:object :dataset_query])))
    ;; ok, we're g2g
    (revision/revert!
      :entity      entity
      :id          id
      :user-id     api/*current-user-id*
      :revision-id revision_id)))

(api/define-routes)
