(ns metabase.measures.api
  "/api/measure endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
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
   [:definition          :map]
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

(defn- normalize-input-definition
  "Normalize measure definition from API input to MBQL5.
  Accepts MBQL4 definitions for Cypress e2e test support:
  - MBQL5 full queries (passed through)
  - MBQL4 full queries (converted to MBQL5)
  - MBQL4 fragments (wrapped in full query, then converted to MBQL5); the fragment must
    include `:source-table` so the table can be derived"
  [definition]
  (if (seq definition)
    (-> (case (lib/normalized-mbql-version definition)
          (:mbql-version/mbql5 :mbql-version/legacy)
          definition
          ;; default: MBQL4 fragment - wrap it in a full query
          (let [table-id    (:source-table definition)
                _           (api/check-400 (pos-int? table-id)
                                           (tru "Measure definition must specify a source table."))
                database-id (t2/select-one-fn :db_id :model/Table :id table-id)]
            {:database database-id
             :type :query
             :query definition}))
        lib-be/normalize-query)
    {}))

(api.macros/defendpoint :post "/" :- ::measure
  "Create a new `Measure`. The Measure's table is derived from its `definition`."
  [_route-params
   _query-params
   {:keys [name description definition], :as body} :- [:map
                                                       [:name        ms/NonBlankString]
                                                       [:definition  ms/Map]
                                                       [:description {:optional true} [:maybe :string]]]]
  (let [normalized-definition (normalize-input-definition definition)]
    (api/create-check :model/Measure (assoc body :definition normalized-definition))
    (let [measure (api/check-500
                   (first (t2/insert-returning-instances! :model/Measure
                                                          :creator_id  api/*current-user-id*
                                                          :name        name
                                                          :description description
                                                          :definition  normalized-definition)))]
      (events/publish-event! :event/measure-create {:object measure :user-id api/*current-user-id*})
      (t2/hydrate measure :creator))))

(mu/defn- hydrated-measure [id :- ms/PositiveInt]
  (api/read-check (t2/select-one :model/Measure :id id))
  (metrics/sync-dimensions! :metadata/measure id)
  (-> (t2/hydrate (t2/select-one :model/Measure :id id) :creator)
      metrics/filter-dimensions-for-user))

(api.macros/defendpoint :get "/:id" :- ::measure
  "Fetch `Measure` with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [measure (hydrated-measure id)]
    (assoc measure :result_column_name (metrics/aggregation-column-name (:database (:definition measure)) (:definition measure)))))

(api.macros/defendpoint :get "/" :- [:sequential ::measure]
  "Fetch *all* `Measures`."
  []
  (as-> (t2/select :model/Measure, :archived false, {:order-by [[:%lower.name :asc]]}) measures
    (filter mi/can-read? measures)
    (t2/hydrate measures :creator :definition_description)))

(defn- write-check-and-update-measure!
  "Check whether current user has write permissions, then update Measure with values in `body`. Publishes appropriate
  event and returns updated/hydrated Measure."
  [id {:keys [revision_message], :as body}]
  (api/write-check :model/Measure id)
  (let [clean-body (u/select-keys-when body
                                       :present #{:description}
                                       :non-nil #{:archived :definition :name})
        new-body   (cond-> (dissoc clean-body :revision_message)
                     (contains? clean-body :definition) (update :definition normalize-input-definition))
        changes    (not-empty new-body)]
    ;; The write-check above covers the existing definition; if the definition is changing, make sure the user could
    ;; also create a Measure with the new one (it might implicitly move the Measure to another table).
    (when-let [definition (:definition new-body)]
      (api/create-check :model/Measure {:definition definition}))
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
  (let [measure (hydrated-measure id)]
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
  (let [measure (hydrated-measure id)]
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
  (let [measure (hydrated-measure id)]
    (metrics/dimension-remapped-value
     (:dimensions measure)
     (:dimension_mappings measure)
     dimension-key
     value)))
