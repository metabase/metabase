(ns metabase.api.revision
  (:require [compojure.core :refer [GET POST]]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            (metabase.models [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [revision :as revision])))

(def ^:private ^:const entity-kw->entity
  {:card      Card
   :dashboard Dashboard})

(defannotation Entity
  "Option must be a valid revisionable entity name. Returns corresponding entity."
  [symb value]
  (let [entity (entity-kw->entity (keyword value))]
    (checkp entity symb (format "Invalid entity: %s" value))
    entity))

(defendpoint GET "/"
  "Get revisions of an object."
  [entity id]
  {entity Entity, id Integer}
  (check-404 (db/exists? entity :id id))
  (revision/revisions+details entity id))

(defendpoint POST "/revert"
  "Revert an object to a prior revision."
  [:as {{:keys [entity id revision_id]} :body}]
  {entity Entity, id Integer, revision_id Integer}
  (check-404 (db/exists? revision/Revision :model (:name entity) :model_id id :id revision_id))
  (revision/revert!
    :entity      entity
    :id          id
    :user-id     *current-user-id*
    :revision-id revision_id))

(define-routes)
