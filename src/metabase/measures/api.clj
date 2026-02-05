(ns metabase.measures.api
  "/api/measure endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::measure
  "Schema for a Measure entity as returned from the API."
  [:map
   [:id          ms/PositiveInt]
   [:name        ms/NonBlankString]
   [:table_id    ms/PositiveInt]
   [:definition  :map]
   [:description {:optional true} [:maybe :string]]
   [:archived    :boolean]
   [:creator_id  ms/PositiveInt]
   [:created_at  :any]
   [:updated_at  :any]
   [:entity_id   {:optional true} [:maybe :string]]
   [:creator     {:optional true} [:maybe :map]]
   [:dimensions  {:optional true} [:maybe [:sequential :map]]]
   [:dimension_mappings {:optional true} [:maybe [:sequential :map]]]])

(defn- normalize-input-definition
  "Normalize measure definition from API input to MBQL5.
  Accepts MBQL4 definitions for Cypress e2e test support:
  - MBQL5 full queries (passed through)
  - MBQL4 full queries (converted to MBQL5)
  - MBQL4 fragments (wrapped in full query, then converted to MBQL5)"
  [definition table-id database-id]
  (if (seq definition)
    (-> (case (lib/normalized-mbql-version definition)
          (:mbql-version/mbql5 :mbql-version/legacy)
          definition
          ;; default: MBQL4 fragment - wrap it in a full query
          {:database database-id
           :type :query
           :query (merge {:source-table table-id} definition)})
        lib-be/normalize-query)
    {}))

(api.macros/defendpoint :post "/" :- ::measure
  "Create a new `Measure`."
  [_route-params
   _query-params
   {:keys [name description table_id definition], :as body} :- [:map
                                                                [:name        ms/NonBlankString]
                                                                [:table_id    ms/PositiveInt]
                                                                [:definition  ms/Map]
                                                                [:description {:optional true} [:maybe :string]]]]
  (api/create-check :model/Measure body)
  (let [database-id (t2/select-one-fn :db_id :model/Table :id table_id)
        normalized-definition (normalize-input-definition definition table_id database-id)
        measure (api/check-500
                 (first (t2/insert-returning-instances! :model/Measure
                                                        :table_id    table_id
                                                        :creator_id  api/*current-user-id*
                                                        :name        name
                                                        :description description
                                                        :definition  normalized-definition)))]
    (events/publish-event! :event/measure-create {:object measure :user-id api/*current-user-id*})
    (t2/hydrate measure :creator)))

(defn- hydrate-dimensions
  "Hydrate dimensions onto a measure by computing from visible-columns and reconciling with persisted."
  [measure]
  (let [mp                (lib-metric/metadata-provider)
        measure-with-type (assoc measure :lib/type :metadata/measure)]
    (lib-metric/hydrate-dimensions mp measure-with-type)))

(mu/defn- hydrated-measure [id :- ms/PositiveInt]
  (-> (api/read-check (t2/select-one :model/Measure :id id))
      (t2/hydrate :creator)
      hydrate-dimensions))

(api.macros/defendpoint :get "/:id" :- ::measure
  "Fetch `Measure` with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (hydrated-measure id))

(api.macros/defendpoint :get "/" :- [:sequential ::measure]
  "Fetch *all* `Measures`."
  []
  (as-> (t2/select :model/Measure, :archived false, {:order-by [[:%lower.name :asc]]}) measures
    (filter mi/can-read? measures)
    (t2/hydrate measures :creator :definition_description)
    (mapv hydrate-dimensions measures)))

(defn- write-check-and-update-measure!
  "Check whether current user has write permissions, then update Measure with values in `body`. Publishes appropriate
  event and returns updated/hydrated Measure."
  [id {:keys [revision_message], :as body}]
  (let [existing   (api/write-check :model/Measure id)
        clean-body (u/select-keys-when body
                                       :present #{:description}
                                       :non-nil #{:archived :definition :name})
        new-def    (when-let [def (:definition clean-body)]
                     (let [table-id (:table_id existing)
                           database-id (t2/select-one-fn :db_id :model/Table :id table-id)]
                       (normalize-input-definition def table-id database-id)))
        new-body   (merge
                    (dissoc clean-body :revision_message)
                    (when new-def {:definition new-def}))
        changes    (when-not (= new-body existing)
                     new-body)]
    (when changes
      (t2/update! :model/Measure id changes))
    (u/prog1 (hydrated-measure id)
      (events/publish-event! :event/measure-update
                             {:object <> :user-id api/*current-user-id* :revision-message revision_message}))))

(api.macros/defendpoint :put "/:id" :- ::measure
  "Update a `Measure` with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:name                    {:optional true} [:maybe ms/NonBlankString]]
            [:definition              {:optional true} [:maybe :map]]
            [:revision_message        ms/NonBlankString]
            [:archived                {:optional true} [:maybe :boolean]]
            [:description             {:optional true} [:maybe :string]]]]
  (write-check-and-update-measure! id body))
