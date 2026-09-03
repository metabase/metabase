(ns metabase.revisions.api
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.parameters.params :as params]
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [metabase.revisions.db :as revisions.db]
   [metabase.revisions.models.revision :as revision]
   [metabase.util.malli.schema :as ms]
   [metabase.util.regex :as u.regex]
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
    [model (revisions.db/entity model id)]))

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

(defn- dashcard-card-ids
  [dashcard]
  (cons (:card_id dashcard) (:series dashcard)))

(defn- revision-card-references
  [revision]
  (let [{:keys [cards parameters]} (:object revision)]
    (into (set (queries/values-source-card-ids parameters))
          (comp (mapcat dashcard-card-ids) (filter pos-int?))
          cards)))

(defn- stored-card-references
  [model id]
  (let [parameter-cards (set (revisions.db/parameter-card-ids (if (= model :model/Dashboard)
                                                                "dashboard"
                                                                "card")
                                                              id))]
    (if (= model :model/Dashboard)
      (into parameter-cards
            (concat (revisions.db/dashboard-card-ids id)
                    (revisions.db/dashboard-series-card-ids id)))
      parameter-cards)))

(defn- revision-parameter-field-ids
  [model revision]
  (let [{:keys [cards parameters dataset_query]} (:object revision)
        resolve-target (fn [target query]
                         (when target
                           (params/param-target->field-id target {:dataset_query query})))]
    (case model
      :model/Card
      (into [] (keep #(resolve-target (:target %) dataset_query)) parameters)

      :model/Dashboard
      (let [mappings       (for [dashcard cards
                                 mapping  (:parameter_mappings dashcard)]
                             mapping)
            card-ids       (into #{} (keep :card_id) mappings)
            card-id->query (when (seq card-ids)
                             (revisions.db/card-queries card-ids))]
        (into [] (keep (fn [{:keys [target card_id]}]
                         (resolve-target target (card-id->query card_id))))
              mappings))

      nil)))

(defn- check-new-revision-card-references
  [model id revision]
  (doseq [card-id (set/difference (revision-card-references revision)
                                  (stored-card-references model id))]
    (api/read-check :model/Card card-id))
  (query-perms/check-parameter-field-permissions (revision-parameter-field-ids model revision)))

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
        revision         (api/check-404 (revisions.db/revision (name model) id revision-id))]
    ;; if reverting a Card, make sure we have *data* permissions to run the query we're reverting to
    (when (= model :model/Card)
      ;; TODO -- we should be using something like `api/read-check` for this, but unfortunately the impl for Cards
      ;; doesn't actually check important stuff like this.
      (query-perms/check-run-permissions-for-query (dissoc (get-in revision [:object :dataset_query]) :query-permissions/perms)))
    (when (= model :model/Transform)
      (api/check-403 (mi/can-write? (merge instance (:object revision)))))
    ;; for Segments and Measures `table_id` is re-derived from `definition` on update, so when the restored definition
    ;; specifies a source table, check write perms against that table rather than the revision's stored `table_id`
    (when (contains? #{:model/Segment :model/Measure} model)
      (let [table-id (some-> (get-in revision [:object :definition])
                             not-empty
                             lib-be/normalize-query
                             lib/primary-source-table-id)]
        (api/check-403 (mi/can-write? (cond-> (merge instance (:object revision))
                                        table-id (assoc :table_id table-id))))))
    (when (contains? #{:model/Dashboard :model/Card} model)
      (collection/check-allowed-to-change-collection instance (:object revision))
      (when (api/column-will-change? :dashboard_id instance (:object revision))
        (doseq [dashboard-id (keep identity [(:dashboard_id instance)
                                             (:dashboard_id (:object revision))])]
          (api/write-check :model/Dashboard dashboard-id)))
      (check-new-revision-card-references model id revision))
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
