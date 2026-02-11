(ns metabase.revisions.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.query-permissions.core :as query-perms]
   [metabase.revisions.models.revision :as revision]
   [metabase.util.malli.schema :as ms]
   [metabase.util.regex :as u.regex]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]))

(def ^:private entity->model
  {"card"      :model/Card
   "dashboard" :model/Dashboard
   "document"  :model/Document
   "measure"   :model/Measure
   "segment"   :model/Segment
   "transform" :model/Transform})

(def ^:private Entity
  "Schema for a valid revisionable entity name."
  (into
   [:enum {:api/regex (u.regex/re-or (keys entity->model))}]
   (keys entity->model)))

(defn- model-and-instance [entity-name id]
  (let [model (entity->model entity-name)]
    (assert (keyword? model))
    ;; Ensure the model namespace is loaded before using it
    (t2.model/resolve-model model)
    [model (t2/select-one model :id id)]))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Get revisions of an object."
  [_route-params
   {:keys [entity id]} :- [:map
                           [:id     ms/PositiveInt]
                           [:entity Entity]]]
  (let [[model instance] (model-and-instance entity id)]
    (when (api/read-check instance)
      (revision/revisions+details model id))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
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
    (when (= model :model/Card)
      ;; TODO -- we should be using something like `api/read-check` for this, but unfortunately the impl for Cards
      ;; doesn't actually check important stuff like this.
      (query-perms/check-run-permissions-for-query (get-in revision [:object :dataset_query])))
    ;; ok, we're g2g
    (revision/revert!
     {:entity      model
      :id          id
      :user-id     api/*current-user-id*
      :revision-id revision-id})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:entity/:id"
  "Fetch `Revisions` for an object with ID."
  [{:keys [id entity]} :- [:map
                           [:entity Entity]
                           [:id     ms/PositiveInt]]]
  (let [model (entity->model entity)]
    (assert (keyword? model))
    ;; Ensure the model namespace is loaded before using it
    (t2.model/resolve-model model)
    (api/read-check model id)
    (revision/revisions+details model id)))
