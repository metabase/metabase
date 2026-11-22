(ns metabase.measures.api
  "/api/measure endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.measures.db :as measures.db]
   [metabase.measures.schema :as measures.schema]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::measure
  "Schema for a Measure entity as returned from the API."
  [:map
   [:id                  ms/PositiveInt]
   [:name                ms/NonBlankString]
   [:table_id            ms/PositiveInt]
   [:definition          ::measures.schema/definition]
   [:description         {:optional true} [:maybe :string]]
   [:archived            :boolean]
   [:creator_id          ms/PositiveInt]
   [:created_at          :any]
   [:updated_at          :any]
   [:entity_id           {:optional true} [:maybe :string]]
   [:creator             {:optional true} [:maybe :map]]
   [:dimensions          {:optional true} [:maybe [:sequential :map]]]
   [:dimension_mappings  {:optional true} [:maybe [:sequential :map]]]
   [:result_column_name  {:optional true} [:maybe :string]]])

(defn create-measure!
  "Create-check and insert a new Measure and return the hydrated Measure."
  [{:keys [name description definition], :as body}]
  (let [definition (lib-be/normalize-query definition)]
    (api/create-check :model/Measure (assoc body :definition definition))
    (let [measure (api/check-500
                   (measures.db/insert-measure! api/*current-user-id* name description definition))]
      (t2/hydrate measure :creator))))

(api.macros/defendpoint :post "/" :- ::measure
  "Create a new `Measure`. The Measure's table is derived from its `definition`."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:name        ::measures.schema/measure.name]
            [:definition  ::measures.schema/definition]
            [:description {:optional true} [:maybe :string]]]]
  (create-measure! body))

(mu/defn- hydrated-measure [id :- ms/PositiveInt
                            include-orphaned? :- :boolean]
  (api/read-check (measures.db/measure id))
  (metrics/sync-dimensions! :metadata/measure id)
  (cond-> (-> (t2/hydrate (measures.db/measure id) :creator)
              metrics/filter-dimensions-for-user)
    (not include-orphaned?) metrics/without-orphaned-dimensions))

(defn- with-api-dimensions
  "Convert a measure's dimensions/mappings from the internal kebab-case shape to the
   snake_case API shape (see [[metabase.metrics.dimension/->api-dimension]]). Applied at the
   response edge only, so event payloads keep the internal shape."
  [measure]
  (cond-> measure
    (:dimensions measure)         (update :dimensions metrics/->api-dimensions)
    (:dimension_mappings measure) (update :dimension_mappings metrics/->api-dimension-mappings)))

(api.macros/defendpoint :get "/:id" :- ::measure
  "Fetch `Measure` with ID."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   {:keys [include-orphaned]} :- [:map {:closed true}
                                  [:include-orphaned {:optional true} [:maybe ms/BooleanValue]]]]
  (let [measure (hydrated-measure id (boolean include-orphaned))]
    (-> measure
        (assoc :result_column_name (metrics/aggregation-column-name (:database (:definition measure)) (:definition measure)))
        with-api-dimensions)))

(api.macros/defendpoint :get "/" :- [:sequential ::measure]
  "Fetch *all* `Measures`."
  []
  (->> (t2/hydrate (mi/readable (measures.db/unarchived-measures)) :creator :definition_description)
       (mapv with-api-dimensions)))

(defn write-check-and-update-measure!
  "Applies `body` to the Measure with `id` after its update check, with `revision_message` as the message of the
  revision, and returns the hydrated Measure."
  [id {:keys [revision_message], :as body}]
  (let [existing   (api/write-check :model/Measure id)
        clean-body (cond-> (u/select-keys-when body
                                               :present #{:description}
                                               :non-nil #{:archived :definition :name})
                     (some? (:definition body)) (update :definition lib-be/normalize-query))
        new-body   (dissoc clean-body :revision_message)
        changes    (when-not (= new-body existing)
                     new-body)]
    (api/update-check existing new-body)
    (when changes
      (events/with-event-context {:revision-message revision_message}
        (measures.db/update-measure! id changes)))
    (hydrated-measure id false)))

(api.macros/defendpoint :put "/:id" :- ::measure
  "Update a `Measure` with ID."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   body :- [:map {:closed true}
            [:name                    {:optional true} [:maybe ::measures.schema/measure.name]]
            [:definition              {:optional true} [:maybe ::measures.schema/definition]]
            [:revision_message        ms/NonBlankString]
            [:archived                {:optional true} [:maybe :boolean]]
            [:description             {:optional true} [:maybe :string]]]]
  (with-api-dimensions (write-check-and-update-measure! id body)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Dimension Value Endpoints                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(mr/def ::RemappedValueResponse
  "Response schema for dimension remapping endpoint.
   Returns [value] if no remapping, or [value, display-name] if remapped."
  [:or
   [:tuple :any]
   [:tuple :any :string]])

(api.macros/defendpoint :get "/:id/dimension/:dimension-key/values"
  :- ms/FieldValuesResult
  "Fetch values for a dimension of a measure.

   Returns field values in the same format as the field values API:
   - values: list of [value] or [value, display-name] tuples
   - field_id: the underlying field ID
   - has_more_values: boolean indicating if there are more values"
  [{:keys [id dimension-key]} :- [:map {:closed true}
                                  [:id            ms/PositiveInt]
                                  [:dimension-key ms/UUIDString]]]
  (let [measure (hydrated-measure id false)]
    (metrics/dimension-values
     (:dimensions measure)
     (:dimension_mappings measure)
     dimension-key)))

(api.macros/defendpoint :get "/:id/dimension/:dimension-key/search"
  :- [:sequential [:vector :string]]
  "Search for values of a dimension that contain the query string.

   Returns field values matching the search query in the same format as the field values API."
  [{:keys [id dimension-key]} :- [:map {:closed true}
                                  [:id            ms/PositiveInt]
                                  [:dimension-key ms/UUIDString]]
   {:keys [query]}            :- [:map {:closed true} [:query ms/NonBlankString]]]
  (let [measure (hydrated-measure id false)]
    (metrics/dimension-search-values
     (:dimensions measure)
     (:dimension_mappings measure)
     dimension-key
     query)))

(api.macros/defendpoint :get "/:id/dimension/:dimension-key/remapping"
  :- ::RemappedValueResponse
  "Fetch remapped value for a specific dimension value.

   Returns a pair [value, display-name] if remapping exists, or [value] otherwise."
  [{:keys [id dimension-key]} :- [:map {:closed true}
                                  [:id            ms/PositiveInt]
                                  [:dimension-key ms/UUIDString]]
   {:keys [value]}             :- [:map {:closed true} [:value :string]]]
  (let [measure (hydrated-measure id false)]
    (metrics/dimension-remapped-value
     (:dimensions measure)
     (:dimension_mappings measure)
     dimension-key
     value)))
