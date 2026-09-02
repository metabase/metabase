(ns metabase.measures.api
  "/api/measure endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.measures.queries :as measures.queries]
   [metabase.measures.schema :as measures.schema]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::measure
  "Schema for a Measure entity as returned from the API."
  [:map
   [:id                  ms/PositiveInt]
   [:name                ms/NonBlankString]
   [:table_id            ms/PositiveInt]
   [:definition          ms/Map]
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

(defn- definition-table-id
  "Derive the source table ID from a normalized measure definition, or throw a 400 if it has none."
  [normalized-definition]
  (api/check-400 (when (seq normalized-definition)
                   (lib/primary-source-table-id normalized-definition))
                 (tru "Measure definition must specify a source table.")))

(api.macros/defendpoint :post "/" :- ::measure
  "Create a new `Measure`. The Measure's table is derived from its `definition`."
  [_route-params
   _query-params
   {:keys [name description definition], :as body} :- [:map
                                                       [:name        ms/NonBlankString]
                                                       [:definition  ::measures.schema/definition]
                                                       [:description {:optional true} [:maybe :string]]]]
  (let [table-id (definition-table-id definition)]
    (api/create-check :model/Measure (assoc body :table_id table-id))
    (let [measure (api/check-500
                   (measures.queries/insert-measure! api/*current-user-id* name description definition))]
      (events/publish-event! :event/measure-create {:object measure :user-id api/*current-user-id*})
      (measures.queries/hydrate-creator measure))))

(mu/defn- hydrated-measure [id :- ms/PositiveInt
                            include-orphaned? :- :boolean]
  (api/read-check (measures.queries/measure id))
  (metrics/sync-dimensions! :metadata/measure id)
  (cond-> (-> (measures.queries/hydrate-creator (measures.queries/measure id))
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
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [include-orphaned]} :- [:map
                                  [:include-orphaned {:optional true} [:maybe ms/BooleanValue]]]]
  (let [measure (hydrated-measure id (boolean include-orphaned))]
    (-> measure
        (assoc :result_column_name (metrics/aggregation-column-name (:database (:definition measure)) (:definition measure)))
        with-api-dimensions)))

(api.macros/defendpoint :get "/" :- [:sequential ::measure]
  "Fetch *all* `Measures`."
  []
  (let [measures  (measures.queries/unarchived-measures)
        table-ids (into #{} (keep :table_id) measures)]
    (perms/prime-table-perms-cache {:db-ids    (when (seq table-ids)
                                                 (measures.queries/table-database-ids table-ids))
                                    :table-ids table-ids})
    (->> (measures.queries/hydrate-creator-and-definition-description (filterv mi/can-read? measures))
         (mapv with-api-dimensions))))

(defn- write-check-and-update-measure!
  "Check whether current user has write permissions, then update Measure with values in `body`. Publishes appropriate
  event and returns updated/hydrated Measure."
  [id {:keys [revision_message], :as body}]
  (let [existing   (api/write-check :model/Measure id)
        clean-body (u/select-keys-when body
                                       :present #{:description}
                                       :non-nil #{:archived :definition :name})
        new-body   (dissoc clean-body :revision_message)
        changes    (when-not (= new-body existing)
                     new-body)]
    ;; An updated definition must still specify a source table; if it implicitly moves the Measure to a different
    ;; table, the write-check above checked the old table, so also make sure the user could create a Measure on the
    ;; new one.
    (when-let [new-def (:definition clean-body)]
      (let [new-table-id (definition-table-id new-def)]
        (when (not= new-table-id (:table_id existing))
          (api/create-check :model/Measure {:table_id new-table-id}))))
    (when changes
      (measures.queries/update-measure! id changes))
    (u/prog1 (hydrated-measure id false)
      (events/publish-event! :event/measure-update
                             {:object <> :user-id api/*current-user-id* :revision-message revision_message}))))

(api.macros/defendpoint :put "/:id" :- ::measure
  "Update a `Measure` with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:name                    {:optional true} [:maybe ms/NonBlankString]]
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
  [{:keys [id dimension-key]} :- [:map
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
  [{:keys [id dimension-key]} :- [:map
                                  [:id            ms/PositiveInt]
                                  [:dimension-key ms/UUIDString]]
   {:keys [query]}            :- [:map [:query ms/NonBlankString]]]
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
  [{:keys [id dimension-key]} :- [:map
                                  [:id            ms/PositiveInt]
                                  [:dimension-key ms/UUIDString]]
   {:keys [value]}             :- [:map [:value :string]]]
  (let [measure (hydrated-measure id false)]
    (metrics/dimension-remapped-value
     (:dimensions measure)
     (:dimension_mappings measure)
     dimension-key
     value)))
