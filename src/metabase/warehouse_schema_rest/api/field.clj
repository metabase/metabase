(ns metabase.warehouse-schema-rest.api.field
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.api-scope.data-app :as api-scope]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.visualization :as lib.schema.visualization]
   [metabase.models.interface :as mi]
   [metabase.parameters.field :as parameters.field]
   [metabase.request.core :as request]
   [metabase.sync.core :as sync]
   [metabase.types.core :as types]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.schema :as ms]
   [metabase.util.quick-task :as quick-task]
   [metabase.warehouse-schema-rest.db :as warehouse-schema-rest.db]
   [metabase.warehouse-schema.field :as schema.field]
   [metabase.warehouse-schema.metadata-from-qp :as metadata-from-qp]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.field-user-settings :as schema.field-user-settings]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.table :as schema.table]
   [metabase.xrays.core :as xrays]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(events/derive! :event/field-update :metabase/event)

(comment
  ;; idk why condo complains on this not being used when it is, in a keyword down there
  lib.schema.metadata/used)

;;; --------------------------------------------- Basic CRUD Operations ----------------------------------------------

(def ^:private FieldVisibilityType
  "Schema for a valid `Field` visibility type."
  (into [:enum {:decode/normalize lib.schema.common/normalize-keyword}] field/visibility-types))

(def ^:private FieldDataSensitivity
  "Schema for a valid `Field` data sensitivity classification."
  (into [:enum {:decode/normalize lib.schema.common/normalize-keyword}] field/data-sensitivity-types))

(def ^:private max-field-ids-for-table-id-lookup
  1000)

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Get `Field` with ID."
  {:scope api-scope/data-app}
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   {include-editable-data-model? :include_editable_data_model} :- [:map {:closed true}
                                                                   [:include_editable_data_model {:default false} ms/BooleanValue]]]
  (schema.field/get-field id {:include-editable-data-model? include-editable-data-model?}))

(api.macros/defendpoint :post "/table-ids" :- [:map
                                               [:table_ids [:sequential ms/PositiveInt]]]
  "Get unique Table IDs for a list of Field IDs."
  [_route-params
   _query-params
   {:keys [field_ids]} :- [:map {:closed true}
                           [:field_ids [:sequential ms/PositiveInt]]]]
  (api/check-400 (<= (count field_ids) max-field-ids-for-table-id-lookup)
                 (format "field_ids may contain at most %d IDs." max-field-ids-for-table-id-lookup))
  {:table_ids (schema.field/field-ids->table-ids field_ids)})

(defn- check-can-point-at-field
  "Throws a 403 unless the current user manages the metadata of the Table of the Field with `target-field-id`, a new
  target for a foreign key or a remapping."
  [target-field-id current-target-field-id]
  (when (and target-field-id (not= target-field-id current-target-field-id))
    (some-> (warehouse-schema-rest.db/field target-field-id)
            :table_id
            warehouse-schema-rest.db/table
            schema.table/check-data-model-perms)))

(defn- sync-table-when-unfolding-finds-no-fields!
  "Syncs the Table of `field`, whose JSON unfolding was just enabled, when it has no nested Fields yet: it was never
  synced with unfolding on."
  [field]
  (when-not (warehouse-schema-rest.db/nested-fields-exist? (:table_id field) (field/nested-fields-pattern (:name field)))
    (let [table (field/table field)]
      (quick-task/submit-task! (fn [] (sync/sync-table! table))))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update `Field` with ID."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   {coercion-strategy :coercion_strategy
    json-unfolding    :json_unfolding
    :as body} :- [:map {:closed true}
                  [:caveats            {:optional true} [:maybe ms/NonBlankString]]
                  [:description        {:optional true} [:maybe ms/NonBlankString]]
                  [:display_name       {:optional true} ms/NonBlankString]
                  [:fk_target_field_id {:optional true} [:maybe ms/PositiveInt]]
                  [:points_of_interest {:optional true} [:maybe ms/NonBlankString]]
                  [:semantic_type      {:optional true} [:maybe ::lib.schema.common/semantic-or-relation-type]]
                  [:coercion_strategy  {:optional true} [:maybe ::lib.schema.common/coercion-strategy]]
                  [:visibility_type    {:optional true} FieldVisibilityType]
                  [:data_sensitivity   {:optional true} [:maybe FieldDataSensitivity]]
                  [:has_field_values   {:optional true} ::lib.schema.metadata/column.has-field-values]
                  [:settings           {:optional true} [:maybe ::lib.schema.visualization/visualization-settings]]
                  [:json_unfolding     {:optional true} :boolean]]]
  (let [field          (api/write-check (warehouse-schema-rest.db/field id))
        effective-type (cond
                         (not (contains? body :coercion_strategy)) ((some-fn :effective_type :base_type) field)
                         (nil? coercion-strategy)                  (:base_type field)
                         :else                                     (types/effective-type-for-coercion
                                                                    (keyword coercion-strategy)))
        removed-fk?    (and (contains? body :semantic_type)
                            (isa? (:semantic_type field) :type/FK)
                            (not (isa? (some-> (:semantic_type body) keyword) :type/FK)))]
    (when (and (contains? body :coercion_strategy)
               coercion-strategy
               (not (types/is-coercible? (keyword coercion-strategy) (:base_type field) effective-type)))
      (throw (ex-info (i18n/tru "Incompatible coercion strategy.")
                      {:status-code       400
                       :base-type         (:base_type field)
                       :coercion-strategy (keyword coercion-strategy)
                       :effective-type    effective-type
                       :response/keys     #{:base-type :coercion-strategy :effective-type}})))
    (check-can-point-at-field (:fk_target_field_id body) (:fk_target_field_id field))
    (schema.field-user-settings/upsert-field-user-settings!
     field
     (cond-> body
       removed-fk?
       (assoc :fk_target_field_id nil)

       (contains? body :coercion_strategy)
       (assoc :effective_type effective-type :coercion_strategy (some-> coercion-strategy keyword))))
    (when (and json-unfolding (not (:json_unfolding field)))
      (sync-table-when-unfolding-finds-no-fields! field))
    ;; return updated field. note the fingerprint on this might be out of date if the task below would replace them
    ;; but that shouldn't matter for the datamodel page
    (let [updated (warehouse-schema-rest.db/field id)]
      (u/prog1 (-> updated
                   (t2/hydrate :dimensions :has_field_values)
                   (schema.field/hydrate-target-with-data-model-perms))
        (when (not= effective-type (:effective_type field))
          (analytics/track-event! :snowplow/simple_event {:event "field_effective_type_change" :target_id id})
          ;; Run with admin perms to match behavior during normal sync.
          (quick-task/submit-task! (fn [] (request/as-admin (sync/refingerprint-field! updated)))))))))

;;; ------------------------------------------------- Field Metadata -------------------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/summary"
  "Get the count and distinct count of `Field` with ID."
  {:scope api-scope/data-app}
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (let [field (api/read-check :model/Field id)]
    [[:count     (metadata-from-qp/field-count field)]
     [:distincts (metadata-from-qp/field-distinct-count field)]]))

;;; --------------------------------------------------- Dimensions ---------------------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/dimension"
  "Sets the dimension for the given field at ID"
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   {dimension-type :type, dimension-name :name, human-readable-field-id :human_readable_field_id}
   :- [:merge
       [:select-keys ::warehouse-schema.schema/dimension.update [:human_readable_field_id]]
       [:map {:closed true}
        [:type ::warehouse-schema.schema/dimension.type]
        [:name ms/NonBlankString]]]]
  (api/write-check :model/Field id)
  (let [existing-dimension (warehouse-schema-rest.db/dimension-for-field id)]
    (check-can-point-at-field human-readable-field-id (:human_readable_field_id existing-dimension))
    (if-let [dimension existing-dimension]
      (warehouse-schema-rest.db/update-dimension! (u/the-id dimension)
                                                  {:type                    dimension-type
                                                   :name                    dimension-name
                                                   :human_readable_field_id human-readable-field-id})
      (warehouse-schema-rest.db/insert-dimension!
       {:field_id                id
        :type                    dimension-type
        :name                    dimension-name
        :human_readable_field_id human-readable-field-id})))
  (warehouse-schema-rest.db/dimension-for-field id))

(api.macros/defendpoint :delete "/:id/dimension" :- ::api/generic-204-no-content
  "Remove the dimension associated to field at ID"
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/write-check :model/Field id)
  (warehouse-schema-rest.db/delete-dimensions-for-field! id)
  api/generic-204-no-content)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/values"
  "If a Field's value of `has_field_values` is `:list`, return a list of all the distinct values of the Field (or
  remapped Field), and (if defined by a User) a map of human-readable remapped values. If `has_field_values` is not
  `:list`, checks whether we should create FieldValues for this Field; if so, creates and returns them."
  {:scope api-scope/data-app}
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (let [field (api/query-check (warehouse-schema-rest.db/field id))]
    (parameters.field/field->values field)))

(api.macros/defendpoint :post "/:id/values" :- [:map {:closed true} [:status [:= :success]]]
  "Update the fields values and human-readable values for a `Field` whose semantic type is
  `category`/`city`/`state`/`country` or whose base type is `type/Boolean`. The human-readable values are optional."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   {value-pairs :values} :- [:map {:closed true}
                             [:values ::warehouse-schema.schema/field-values.value-pairs]]]
  (let [field (api/write-check (warehouse-schema-rest.db/field id))]
    (api/check (field-values/field-should-have-field-values? field)
               [400 (str "You can only update the human readable values of a mapped values of a Field whose value of "
                         "`has_field_values` is `list` or whose 'base_type' is 'type/Boolean'.")])
    (let [values                (map first value-pairs)
          human-readable-values (not-empty (into [] (comp (filter #(= 2 (count %))) (map second)) value-pairs))
          updated-pk            (warehouse-schema-rest.db/update-or-insert-full-field-values!
                                 (u/the-id field) values human-readable-values)]
      (api/check-500 (pos? updated-pk))))
  {:status :success})

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case]}
(api.macros/defendpoint :post "/:id/rescan_values" :- [:map {:closed true} [:status [:= :success]]]
  "Manually trigger an update for the FieldValues for this Field. Only applies to Fields that are eligible for
   FieldValues."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (analytics/track-event! :snowplow/simple_event {:event "field_manual_scan" :target_id id})
  (let [field  (api/write-check (warehouse-schema-rest.db/field id))
        ;; Grant full permissions so that permission checks pass during sync. If a user has DB detail perms
        ;; but no data perms, they should stll be able to trigger a sync of field values. This is fine because we don't
        ;; return any actual field values from this API. (#21764)
        result (request/as-admin
                 (field-values/create-or-update-full-field-values! field))]
    ;; a scan that fails leaves the existing FieldValues untouched, so reporting success would give the
    ;; caller no way at all to tell it happened. The underlying error is already in the server logs.
    (api/check (not= ::field-values/fv-fetch-failed result)
               [500 (i18n/tru "Failed to scan field values. Check the server logs for the underlying error.")]))
  {:status :success})

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case]}
(api.macros/defendpoint :post "/:id/discard_values" :- [:map {:closed true} [:status [:= :success]]]
  "Discard the FieldValues belonging to this Field. Only applies to fields that have FieldValues. If this Field's
   Database is set up to automatically sync FieldValues, they will be recreated during the next cycle."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (field-values/clear-field-values-for-field! (api/write-check (warehouse-schema-rest.db/field id)))
  {:status :success})

;;; --------------------------------------------------- Searching ----------------------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/search/:search-id"
  "Search for values of a Field with `search-id` that start with `value`. See docstring for
  [[metabase.parameters.field/search-values]] for a more detailed explanation."
  {:scope api-scope/data-app}
  [{:keys [id search-id]} :- [:map {:closed true}
                              [:id        ms/PositiveInt]
                              [:search-id ms/PositiveInt]]
   {:keys [value]} :- [:map {:closed true}
                       [:value {:optional true} ms/NonBlankString]]]
  (when-not value
    (api/check-400 (request/limit) "Limit required if value is omitted"))
  (let [field        (api/check-404 (warehouse-schema-rest.db/field id))
        search-field (api/check-404 (warehouse-schema-rest.db/field search-id))]
    (api/check-403 (mi/can-read? (t2/hydrate field :can_read)))
    (api/check-403 (mi/can-read? (t2/hydrate search-field :can_read)))
    (parameters.field/search-values field search-field value (request/limit))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/remapping/:remapped-id"
  "Fetch remapped Field values."
  {:scope api-scope/data-app}
  [{:keys [id remapped-id]} :- [:map {:closed true}
                                [:id          ms/PositiveInt]
                                [:remapped-id ms/PositiveInt]]
   {:keys [value]} :- [:map {:closed true}
                       [:value ms/NonBlankString]]]
  (let [field          (-> (warehouse-schema-rest.db/field id) api/check-404 api/read-check)
        remapped-field (-> (warehouse-schema-rest.db/field remapped-id) api/check-404 api/read-check)
        value          (parameters.field/parse-query-param-value-for-field field value)]
    (parameters.field/remapped-value field remapped-field value)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/related"
  "Return related entities."
  {:scope api-scope/data-app}
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (-> (warehouse-schema-rest.db/field id) api/read-check xrays/related))
