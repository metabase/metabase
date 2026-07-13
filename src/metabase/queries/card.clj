(ns metabase.queries.card
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.parameters.chain-filter :as chain-filter]
   [metabase.parameters.custom-values :as custom-values]
   [metabase.parameters.field :as parameters.field]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.permissions.core :as perms]
   [metabase.queries.models.card :as card]
   [metabase.queries.schema :as queries.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(mu/defn- get-param-or-throw :- ::parameters.schema/parameter
  [card      :- ::queries.schema/card
   param-key :- ::lib.schema.parameter/id]
  (u/prog1 (m/find-first #(= (:id %) param-key)
                         (or (seq (:parameters card))
                             ;; some older cards or cards in e2e just use the template tags on native queries
                             (card/template-tag-parameters card)))
    (when-not <>
      (throw (ex-info (tru "Card does not have a parameter with the ID {0}" (pr-str param-key))
                      {:status-code 400})))))

(mu/defn- param->field-id :- [:maybe ::lib.schema.id/field]
  [card  :- ::queries.schema/card
   param :- ::parameters.schema/parameter]
  (params/param-target->field-id (:target param) card))

(mu/defn- mapping->field-values :- ms/FieldValuesResult
  "Get param values for the \"old style\" parameters. This mimic's the api/dashboard version except we don't have
  chain-filter issues or dashcards to worry about."
  [card         :- ::queries.schema/card
   param        :- ::parameters.schema/parameter
   query-string :- [:maybe :string]]
  (when-let [field-id (param->field-id card param)]
    (parameters.field/search-values-from-field-id field-id query-string)))

(mu/defn card-param-values
  "Fetch values for a parameter that contain `query`. If `query` is nil or not provided, return all values.

  The source of values could be:
  - static-list: user defined values list
  - card: values is result of running a card"
  ([card param-key]
   (card-param-values card param-key nil))

  ([card         :- ms/Map
    param-key    :- ::lib.schema.parameter/id
    query-string :- [:maybe ms/NonBlankString]]
   (let [param (get-param-or-throw card param-key)]
     (custom-values/parameter->values param query-string (mu/fn :- ms/FieldValuesResult []
                                                           (mapping->field-values card param query-string))))))

(mu/defn card-param-remapped-value
  "Fetch the remapped value for the given `value` of parameter with ID `:param-key` of `card`."
  [card      :- ::queries.schema/card
   param-key :- ::lib.schema.parameter/id
   value]
  (or (let [param (get-param-or-throw card param-key)]
        (custom-values/parameter-remapped-value
         param
         value
         #(when-let [field-id (param->field-id card param)]
            (-> (chain-filter/chain-filter field-id [{:field-id field-id, :op :=, :value value}] :limit 1)
                :values
                first))))
      [value]))

(defn hydrate-card-details
  "Add the extra details to `card` that the frontend needs whenever a Card is returned from the API -- from GET, PUT,
  or POST endpoints alike, since the frontend replaces whatever Card it currently has with the one it's given. See
  #4283."
  [{card-id :id :as card}]
  (span/with-span!
    {:name       "hydrate-card-details"
     :attributes {:queries/id card-id}}
    (-> card
        (t2/hydrate :based_on_upload
                    :creator
                    :can_write
                    :can_run_adhoc_query
                    :dashboard_count
                    [:dashboard :moderation_status]
                    :average_query_time
                    :last_query_start
                    :parameter_usage_count
                    :can_restore
                    :can_delete
                    :can_manage_db
                    [:collection :is_personal]
                    [:moderation_reviews :moderator_details]
                    :param_fields
                    :is_remote_synced)
        (update :param_fields (fn [param-fields]
                                (let [viewable? (memoize (fn [table-id]
                                                           (perms/user-has-permission-for-table?
                                                            api/*current-user-id*
                                                            :perms/view-data :unrestricted
                                                            (:database_id card) table-id)))]
                                  (update-vals param-fields
                                               (fn [fields]
                                                 (filterv #(viewable? (:table_id %)) fields))))))
        (update :dashboard #(some-> % (select-keys [:name :id :moderation_status])))
        (cond->
         (card/model? card) (t2/hydrate :persisted
                                        ;; can_manage_db determines whether we should enable model persistence settings
                                        :can_manage_db)))))

(defn get-card
  "Get `Card` with ID, applying the standard read-check and read-time hydration used everywhere a Card is returned
  to the frontend.

  This does not annotate the card with `:last-edit-info`; callers that need it (like the REST API) apply
  `metabase.revisions.core/with-last-edit-info` themselves, since the revisions system depends on this module and
  applying it here would create a circular dependency."
  [id]
  (-> (t2/select-one :model/Card :id id)
      api/read-check
      hydrate-card-details
      collection.root/hydrate-root-collection
      (api/present-in-trash-if-archived-directly (collection/trash-collection-id))))
