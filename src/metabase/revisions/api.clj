(ns metabase.revisions.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.revisions.models.revision :as revision]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private Entity
  "Schema for a valid revisionable entity name."
  [:enum "card" "dashboard"])

(defn- model-and-instance [entity-name id]
  (case entity-name
    "card"      [:model/Card (t2/select-one :model/Card :id id)]
    "dashboard" [:model/Dashboard (t2/select-one :model/Dashboard :id id)]))

(api.macros/defendpoint :get "/"
  "Get revisions of an object."
  [_route-params
   {:keys [entity id]} :- [:map
                           [:id     ms/PositiveInt]
                           [:entity Entity]]]
  (let [[model instance] (model-and-instance entity id)]
    (when (api/read-check instance)
      (revision/revisions+details model id))))

(api.macros/defendpoint :post "/revert"
  "Revert an object to a prior revision."
  [_route-params
   _query-params
   {:keys [entity id], revision-id :revision_id} :- [:map
                                                     [:id          ms/PositiveInt]
                                                     [:entity      Entity]
                                                     [:revision_id ms/PositiveInt]]]
  (let [[model instance] (model-and-instance entity id)
        _                (api/write-check instance)
        revision         (api/check-404 (t2/select-one :model/Revision :model (name model), :model_id id, :id revision-id))]
    ;; if reverting a Card, make sure we have *data* permissions to run the query we're reverting to
    (api/write-check model (:object revision))
    ;; ok, we're g2g
    (revision/revert!
     {:entity      model
      :id          id
      :user-id     api/*current-user-id*
      :revision-id revision-id})))

(api.macros/defendpoint :get "/dashboard/:id"
  "Fetch `Revisions` for Dashboard with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/read-check :model/Dashboard id)
  (revision/revisions+details :model/Dashboard id))

(api.macros/defendpoint :get "/segment/:id"
  "Fetch `Revisions` for `Segment` with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/read-check :model/Segment id)
  (revision/revisions+details :model/Segment id))
