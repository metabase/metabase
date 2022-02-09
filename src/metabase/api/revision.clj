(ns metabase.api.revision
  (:require [compojure.core :refer [GET POST]]
            [metabase.api.card :as card-api]
            [metabase.api.common :as api]
            [metabase.models.card :refer [Card]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.revision :as revision :refer [Revision]]
            [schema.core :as s]))

(def ^:private ^:const valid-entity-names
  #{"card" "dashboard"})

(def ^:private Entity
  "Schema for a valid revisionable entity name."
  (apply s/enum valid-entity-names))

(defn- model-and-instance [entity-name id]
  (case entity-name
    "card"      [Card (Card id)]
    "dashboard" [Dashboard (Dashboard id)]))

(api/defendpoint GET "/"
  "Get revisions of an object."
  [entity id]
  {entity Entity, id s/Int}
  (let [[model instance] (model-and-instance entity id)]
    (when (api/read-check instance)
      (revision/revisions+details model id))))

(api/defendpoint POST "/revert"
  "Revert an object to a prior revision."
  [:as {{:keys [entity id revision_id]} :body}]
  {entity Entity, id s/Int, revision_id s/Int}
  (let [[model instance] (model-and-instance entity id)
        _                (api/write-check instance)
        revision         (api/check-404 (Revision :model (:name model), :model_id id, :id revision_id))]
    ;; if reverting a Card, make sure we have *data* permissions to run the query we're reverting to
    (when (= model Card)
      (card-api/check-data-permissions-for-query (get-in revision [:object :dataset_query])))
    ;; ok, we're g2g
    (revision/revert!
      :entity      model
      :id          id
      :user-id     api/*current-user-id*
      :revision-id revision_id)))

(api/define-routes)
