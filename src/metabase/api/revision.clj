(ns metabase.api.revision
  (:require [compojure.core :refer [GET POST]]
            [schema.core :as s]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            (metabase.models [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [revision :as revision, :refer [Revision]])))

(def ^:private ^:const name->entity
  {"card"      Card
   "dashboard" Dashboard})

(def ^:private Entity
  "Schema for a valid revisionable entity name."
  (apply s/enum (keys name->entity)))

(defendpoint GET "/"
  "Get revisions of an object."
  [entity id]
  {entity Entity, id s/Int}
  (let [entity (name->entity entity)]
    (check-404 (db/exists? entity :id id))
    (revision/revisions+details entity id)))

(defendpoint POST "/revert"
  "Revert an object to a prior revision."
  [:as {{:keys [entity id revision_id]} :body}]
  {entity Entity, id s/Int, revision_id s/Int}
  (let [entity (name->entity entity)]
    (check-404 (db/exists? Revision
                 :model    (:name entity)
                 :model_id id
                 :id       revision_id))
    (revision/revert!
      :entity      entity
      :id          id
      :user-id     *current-user-id*
      :revision-id revision_id)))

(define-routes)
