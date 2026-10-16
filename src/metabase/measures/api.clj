(ns metabase.measures.api
  "/api/measure endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [metabase.measures.commands :as measures.commands]
   [metabase.measures.db :as measures.db]
   [metabase.measures.schema :as measures.schema]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
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
  "Insert a new Measure whose table is derived from its `definition`; publishes `:event/measure-create` and returns
  the hydrated Measure. The shared domain create path, so every caller goes through the same
  [[metabase.measures.commands/CreateMeasure]] — the permission check, the name rule and the definition rules are
  the command's, not this function's, and a second caller cannot arrive with them half-applied.

  Event publishing stays above the door on purpose: calling [[metabase.measures.commands/mutate!]] directly would
  write the row and silently skip the revision."
  [{:keys [name description definition]}]
  (let [measure (api/check-500
                 (measures.commands/mutate! (measures.commands/request-context ::measures.commands/creating)
                                            (measures.commands/create-measure name description definition)))]
    (events/publish-event! :event/measure-create {:object measure :user-id api/*current-user-id*})
    (t2/hydrate measure :creator)))

(api.macros/defendpoint :post "/" :- ::measure
  "Create a new `Measure`. The Measure's table is derived from its `definition`."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:name        ms/NonBlankString]
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
  (let [measures  (measures.db/unarchived-measures)
        table-ids (into #{} (keep :table_id) measures)]
    (perms/prime-table-perms-cache {:db-ids    (when (seq table-ids)
                                                 (measures.db/table-database-ids table-ids))
                                    :table-ids table-ids})
    (->> (t2/hydrate (filterv mi/can-read? measures) :creator :definition_description)
         (mapv with-api-dimensions))))

(defn write-check-and-update-measure!
  "Update the Measure with `id` from `body`. Publishes `:event/measure-update` and returns the updated, hydrated
  Measure. The shared domain update path, so every caller goes through the same
  [[metabase.measures.commands/UpdateMeasure]] — including the write check, the non-blank revision message, and
  the re-check of a definition that moves the Measure to another table.

  Turning `body` into the command's `:changes` is the only thing left here: which keys of a request body count as a
  change, and that `:description` present-and-nil means clear it while a nil `:name` means leave it alone, are
  facts about the wire shape rather than rules about a Measure.

  Event publishing stays above the door for the reason [[create-measure!]] gives."
  [id {:keys [revision_message], :as body}]
  (let [changes (u/select-keys-when body
                                    :present #{:description}
                                    :non-nil #{:archived :definition :name})]
    (measures.commands/mutate! (measures.commands/request-context ::measures.commands/updating)
                               (measures.commands/update-measure id changes revision_message))
    (u/prog1 (hydrated-measure id false)
      (events/publish-event! :event/measure-update
                             {:object <> :user-id api/*current-user-id* :revision-message revision_message}))))

(api.macros/defendpoint :put "/:id" :- ::measure
  "Update a `Measure` with ID."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   body :- [:map {:closed true}
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
