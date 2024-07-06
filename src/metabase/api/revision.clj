(ns metabase.api.revision
  (:require
   [compojure.core :refer [GET POST]]
   [metabase.api.card :as api.card]
   [metabase.api.common :as api]
   [metabase.models.revision :as revision :refer [Revision]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private Entity
  "Schema for a valid revisionable entity name."
  [:enum "card" "dashboard"])

(defn- model-and-instance [entity-name id]
  (case entity-name
    "card"      [:model/Card (t2/select-one :model/Card :id id)]
    "dashboard" [:model/Dashboard (t2/select-one :model/Dashboard :id id)]))

(api/defendpoint GET "/"
  "Get revisions of an object."
  [entity id]
  {id     ms/PositiveInt
   entity Entity}
  (let [[model instance] (model-and-instance entity id)]
   (when (api/read-check instance)
     (revision/revisions+details model id))))

(api/defendpoint POST "/revert"
  "Revert an object to a prior revision."
  [:as {{:keys [entity id revision_id]} :body}]
  {id          ms/PositiveInt
   entity      Entity
   revision_id ms/PositiveInt}
  (let [[model instance] (model-and-instance entity id)
        _                (api/write-check instance)
        revision         (api/check-404 (t2/select-one Revision :model (name model), :model_id id, :id revision_id))]
    ;; if reverting a Card, make sure we have *data* permissions to run the query we're reverting to
    (when (= model :model/Card)
      (api.card/check-data-permissions-for-query (get-in revision [:object :dataset_query])))
    ;; ok, we're g2g
    (revision/revert!
     {:entity      model
      :id          id
      :user-id     api/*current-user-id*
      :revision-id revision_id})))

(api/define-routes)
