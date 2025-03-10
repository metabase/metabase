(ns metabase.public-sharing.api
  "Metabase API endpoints for viewing publicly-accessible Cards and Dashboards."
  (:require
   [medley.core :as m]
   [metabase.actions.core :as actions]
   [metabase.analytics.core :as analytics]
   [metabase.api.card :as api.card]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.api.dashboard :as api.dashboard]
   [metabase.api.dataset :as api.dataset]
   [metabase.api.field :as api.field]
   [metabase.api.macros :as api.macros]
   [metabase.db.query :as mdb.query]
   [metabase.events :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.info :as lib.schema.info]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.card :as card]
   [metabase.models.interface :as mi]
   [metabase.models.params :as params]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.request.core :as request]
   [metabase.tiles.api :as api.tiles]
   [metabase.util :as u]
   [metabase.util.embed :as embed]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [throttle.core :as throttle]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(def ^:private ^:const ^Integer default-embed-max-height 800)
(def ^:private ^:const ^Integer default-embed-max-width 1024)

;;; -------------------------------------------------- Public Cards --------------------------------------------------

(defn combine-parameters-and-template-tags
  "Update `card.parameters` to include parameters from template-tags.

  On native queries parameters exists in 2 forms:
  - parameters
  - dataset_query.native.template-tags

  In most cases, these 2 are sync, meaning, if you have a template-tag, there will be a parameter.
  However, since card.parameters is a recently added feature, there may be instances where a template-tag
  is not present in the parameters.
  This function ensures that all template-tags are converted to parameters and added to card.parameters."
  [{:keys [parameters] :as card}]
  (let [template-tag-parameters     (card/template-tag-parameters card)
        id->template-tags-parameter (m/index-by :id template-tag-parameters)
        id->parameter               (m/index-by :id parameters)]
    (assoc card :parameters (vals (reduce-kv (fn [acc id parameter]
                                               ;; order importance: we want the info from `template-tag` to be merged last
                                               (update acc id #(merge % parameter)))
                                             id->parameter
                                             id->template-tags-parameter)))))

(defn- remove-card-non-public-columns
  "Remove everyting from public `card` that shouldn't be visible to the general public."
  [card]
  ;; We need to check this to resolve params - we set `request/as-admin` there
  (if qp.perms/*param-values-query*
    card
    (mi/instance
     :model/Card
     (u/select-nested-keys card [:id :name :description :display :visualization_settings :parameters
                                 [:dataset_query :type [:native :template-tags]]]))))

(defn public-card
  "Return a public Card matching key-value `conditions`, removing all columns that should not be visible to the general
  public. Throws a 404 if the Card doesn't exist."
  [& conditions]
  (binding [params/*ignore-current-user-perms-and-return-all-field-values* true]
    (-> (api/check-404 (apply t2/select-one [:model/Card :id :dataset_query :description :display :name :parameters :visualization_settings]
                              :archived false, conditions))
        remove-card-non-public-columns
        combine-parameters-and-template-tags
        (t2/hydrate :param_values :param_fields))))

(defn- card-with-uuid [uuid] (public-card :public_uuid uuid))

(api.macros/defendpoint :get "/card/:uuid"
  "Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled."
  [{:keys [uuid]} :- [:map
                      [:uuid ms/UUIDString]]]
  (validation/check-public-sharing-enabled)
  (u/prog1 (card-with-uuid uuid)
    (events/publish-event! :event/card-read {:object-id (:id <>), :user-id api/*current-user-id*, :context :question})))

(defmulti ^:private transform-qp-result
  "Transform results to be suitable for a public endpoint"
  {:arglists '([results])}
  :status)

(defmethod transform-qp-result :default
  [x]
  x)

(defmethod transform-qp-result :completed
  [results]
  (u/select-nested-keys
   results
   [[:data :cols :rows :rows_truncated :insights :requested_timezone :results_timezone]
    [:json_query :parameters]
    :status]))

(defmethod transform-qp-result :failed
  [{error-type :error_type, :as results}]
  ;; if the query failed instead, unless the error type is specified and is EXPLICITLY allowed to be shown for embeds,
  ;; instead of returning anything about the query just return a generic error message
  (merge
   (select-keys results [:status :error :error_type])
   (when-not (qp.error-type/show-in-embeds? error-type)
     {:error (tru "An error occurred while running the query.")})))

(defn- process-query-for-card-with-id-run-fn
  "Create the `:make-run` function used for [[process-query-for-card-with-id]] and [[process-query-for-dashcard]]."
  [qp export-format]
  (fn run [query info]
    (qp.streaming/streaming-response [rff export-format (u/slugify (:card-name info))]
      (binding [qp.pipeline/*result* (comp qp.pipeline/*result* transform-qp-result)]
        (request/as-admin
          (qp (update query :info merge info) rff))))))

(mu/defn- export-format->context :- ::lib.schema.info/context
  [export-format]
  (case export-format
    "csv"  :public-csv-download
    "xlsx" :public-xlsx-download
    "json" :public-json-download
    :public-question))

(mu/defn process-query-for-card-with-id
  "Run the query belonging to Card with `card-id` with `parameters` and other query options (e.g. `:constraints`).
  Returns a `StreamingResponse` object that should be returned as the result of an API endpoint."
  [card-id :- ::lib.schema.id/card
   export-format
   parameters
   & {:keys [qp]
      :or   {qp qp.card/process-query-for-card-default-qp}
      :as   options}]
  ;; run this query with full superuser perms
  ;;
  ;; we actually need to bind the current user perms here twice, once so `card-api` will have the full perms when it
  ;; tries to do the `read-check`, and a second time for when the query is ran (async) so the QP middleware will have
  ;; the correct perms
  (request/as-admin
    (m/mapply qp.card/process-query-for-card card-id export-format
              :parameters parameters
              :context    (export-format->context export-format)
              :qp         qp
              :make-run   process-query-for-card-with-id-run-fn
              options)))

(defn ^:private process-query-for-card-with-public-uuid
  "Run query for a *public* Card with UUID. If public sharing is not enabled, this throws an exception. Returns a
  `StreamingResponse` object that should be returned as the result of an API endpoint."
  [uuid export-format parameters & options]
  (validation/check-public-sharing-enabled)
  (let [card-id (api/check-404 (t2/select-one-pk :model/Card :public_uuid uuid, :archived false))]
    (apply process-query-for-card-with-id card-id export-format parameters options)))

(api.macros/defendpoint :get "/card/:uuid/query"
  "Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled."
  [{:keys [uuid]} :- [:map
                      [:uuid ms/UUIDString]]
   {:keys [parameters]} :- [:map
                            [:parameters {:optional true} [:maybe ms/JSONString]]]]
  (process-query-for-card-with-public-uuid uuid :api (json/decode+kw parameters)))

(api.macros/defendpoint :get "/card/:uuid/query/:export-format"
  "Fetch a publicly-accessible Card and return query results in the specified format. Does not require auth
  credentials. Public sharing must be enabled."
  [{:keys [uuid export-format]} :- [:map
                                    [:uuid          ms/UUIDString]
                                    [:export-format api.dataset/ExportFormat]]
   {:keys [parameters format_rows pivot_results]} :- [:map
                                                      [:format_rows   {:default false} :boolean]
                                                      [:pivot_results {:default false} :boolean]
                                                      [:parameters    {:optional true} [:maybe ms/JSONString]]]]
  (process-query-for-card-with-public-uuid
   uuid
   export-format
   (json/decode+kw parameters)
   :constraints nil
   :middleware {:process-viz-settings? true
                :js-int-to-string?     false
                :format-rows?          format_rows
                :pivot?                pivot_results}))

;;; ----------------------------------------------- Public Dashboards ------------------------------------------------

(def ^:private action-public-keys
  "The only keys for an action that should be visible to the general public."
  #{:name
    :id
    :database_id ;; needed to check if the database has actions enabled on the frontend
    :visualization_settings
    :parameters})

(defn- public-action
  "Returns a public version of `action`, removing all data that should not be visible to the general public."
  [action]
  (let [hidden-parameter-ids (->> (get-in action [:visualization_settings :fields])
                                  vals
                                  (keep (fn [x]
                                          (when (true? (:hidden x))
                                            (:id x))))
                                  set)]
    (-> action
        (update :parameters (fn [parameters]
                              (remove #(contains? hidden-parameter-ids (:id %)) parameters)))
        (update-in [:visualization_settings :fields] (fn [fields]
                                                       (m/remove-keys hidden-parameter-ids fields)))
        (select-keys action-public-keys))))

(defn public-dashboard
  "Return a public Dashboard matching key-value `conditions`, removing all columns that should not be visible to the
  general public. Throws a 404 if the Dashboard doesn't exist."
  [& conditions]
  {:pre [(even? (count conditions))]}
  (binding [params/*ignore-current-user-perms-and-return-all-field-values* true
            params/*field-id-context* (atom params/empty-field-id-context)]
    (-> (api/check-404 (apply t2/select-one [:model/Dashboard :name :description :id :parameters :auto_apply_filters :width], :archived false, conditions))
        (t2/hydrate [:dashcards :card :series :dashcard/action] :tabs :param_values :param_fields)
        api.dashboard/add-query-average-durations
        (update :dashcards (fn [dashcards]
                             (for [dashcard dashcards]
                               (-> (select-keys dashcard [:id :card :card_id :dashboard_id :series :col :row :size_x :dashboard_tab_id
                                                          :size_y :parameter_mappings :visualization_settings :action])
                                   (update :card remove-card-non-public-columns)
                                   (update :series (fn [series]
                                                     (for [series series]
                                                       (remove-card-non-public-columns series))))
                                   (m/update-existing :action public-action))))))))

(defn- dashboard-with-uuid [uuid] (public-dashboard :public_uuid uuid))

(api.macros/defendpoint :get "/dashboard/:uuid"
  "Fetch a publicly-accessible Dashboard. Does not require auth credentials. Public sharing must be enabled."
  [{:keys [uuid]} :- [:map
                      [:uuid ms/UUIDString]]]
  (validation/check-public-sharing-enabled)
  (u/prog1 (dashboard-with-uuid uuid)
    (events/publish-event! :event/dashboard-read {:object-id (:id <>), :user-id api/*current-user-id*})))

(defn process-query-for-dashcard
  "Return the results of running a query for Card with `card-id` belonging to Dashboard with `dashboard-id` via
  `dashcard-id`. `card-id`, `dashboard-id`, and `dashcard-id` are all required; other parameters are optional:

  * `parameters`    - MBQL query parameters, either already parsed or as a serialized JSON string
  * `export-format` - `:api` (default format with metadata), `:json` (results only), `:csv`, or `:xslx`. Default: `:api`
  * `qp`            - QP function to run the query with. Default [[qp/process-query]] + [[qp/userland-context]]

  Throws a 404 immediately if the Card isn't part of the Dashboard. Returns a `StreamingResponse`."
  {:arglists '([& {:keys [dashboard-id card-id dashcard-id export-format parameters] :as options}])}
  [& {:keys [export-format parameters qp]
      :or   {qp            qp.card/process-query-for-card-default-qp
             export-format :api}
      :as   options}]
  (let [options (merge
                 {:context     :public-dashboard
                  :constraints (qp.constraints/default-query-constraints)}
                 options
                 {:parameters    (cond-> parameters
                                   (string? parameters) json/decode+kw)
                  :export-format export-format
                  :qp            qp
                  :make-run      process-query-for-card-with-id-run-fn})]
    ;; Run this query with full superuser perms. We don't want the various perms checks failing because there are no
    ;; current user perms; if this Dashcard is public you're by definition allowed to run it without a perms check
    ;; anyway
    (request/as-admin
      (m/mapply qp.dashboard/process-query-for-dashcard options))))

(api.macros/defendpoint :get "/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results for a Card in a publicly-accessible Dashboard. Does not require auth credentials. Public
   sharing must be enabled."
  [{:keys [uuid dashcard-id card-id]} :- [:map
                                          [:uuid        ms/UUIDString]
                                          [:dashcard-id ms/PositiveInt]
                                          [:card-id     ms/PositiveInt]]
   {:keys [parameters]} :- [:map
                            [:parameters {:optional true} [:maybe ms/JSONString]]]]
  (validation/check-public-sharing-enabled)
  (api/check-404 (t2/select-one-pk :model/Card :id card-id :archived false))
  (let [dashboard-id (api/check-404 (t2/select-one-pk :model/Dashboard :public_uuid uuid, :archived false))]
    (u/prog1 (process-query-for-dashcard
              :dashboard-id  dashboard-id
              :card-id       card-id
              :dashcard-id   dashcard-id
              :export-format :api
              :parameters    parameters)
      (events/publish-event! :event/card-read {:object-id card-id, :user-id api/*current-user-id*, :context :dashboard}))))

(api.macros/defendpoint :post ["/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id/:export-format"
                               :export-format api.dataset/export-format-regex]
  "Fetch the results of running a publicly-accessible Card belonging to a Dashboard and return the data in one of the
  export formats. Does not require auth credentials. Public sharing must be enabled."
  [{:keys [uuid dashcard-id card-id export-format]} :- [:map
                                                        [:uuid          ms/UUIDString]
                                                        [:dashcard-id   ms/PositiveInt]
                                                        [:card-id       ms/PositiveInt]
                                                        [:export-format (into [:enum] api.dataset/export-formats)]]
   _query-parameters
   {:keys [format_rows pivot_results parameters]} :- [:map
                                                      [:parameters    {:optional true} [:maybe
                                                                                        {:decode/api
                                                                                         (fn [x]
                                                                                           (cond-> x
                                                                                             (string? x) json/decode+kw))}
                                                                                        [:sequential :map]]]
                                                      [:format_rows   {:default false} ms/BooleanValue]
                                                      [:pivot_results {:default false} ms/BooleanValue]]]
  (validation/check-public-sharing-enabled)
  (api/check-404 (t2/select-one-pk :model/Card :id card-id :archived false))
  (let [dashboard-id (api/check-404 (t2/select-one-pk :model/Dashboard :public_uuid uuid, :archived false))]
    (u/prog1 (process-query-for-dashcard
              :dashboard-id  dashboard-id
              :card-id       card-id
              :dashcard-id   dashcard-id
              :export-format export-format
              :parameters    parameters
              :constraints   nil
              :middleware    {:process-viz-settings? true
                              :format-rows?          format_rows
                              :pivot?                pivot_results}))))

(api.macros/defendpoint :get "/dashboard/:uuid/dashcard/:dashcard-id/execute"
  "Fetches the values for filling in execution parameters. Pass PK parameters and values to select."
  [{:keys [uuid dashcard-id]} :- [:map
                                  [:uuid        ms/UUIDString]
                                  [:dashcard-id ms/PositiveInt]]
   {:keys [parameters]} :- [:map
                            [:parameters ms/JSONString]]]
  (validation/check-public-sharing-enabled)
  (api/check-404 (t2/select-one-pk :model/Dashboard :public_uuid uuid :archived false))
  (actions/fetch-values
   (api/check-404 (actions/dashcard->action dashcard-id))
   (json/decode parameters)))

(def ^:private dashcard-execution-throttle (throttle/make-throttler :dashcard-id :attempts-threshold 5000))

(api.macros/defendpoint :post "/dashboard/:uuid/dashcard/:dashcard-id/execute"
  "Execute the associated Action in the context of a `Dashboard` and `DashboardCard` that includes it.

   `parameters` should be the mapped dashboard parameters with values."
  [{:keys [uuid dashcard-id]} :- [:map
                                  [:uuid        ms/UUIDString]
                                  [:dashcard-id ms/PositiveInt]]
   _query-params
   {:keys [parameters], :as _body} :- [:map
                                       [:parameters {:optional true} [:maybe [:map-of :keyword :any]]]]]
  (let [throttle-message (try
                           (throttle/check dashcard-execution-throttle dashcard-id)
                           nil
                           (catch ExceptionInfo e
                             (get-in (ex-data e) [:errors :dashcard-id])))
        throttle-time (when throttle-message
                        (second (re-find #"You must wait ([0-9]+) seconds" throttle-message)))]
    (if throttle-message
      (cond-> {:status 429
               :body throttle-message}
        throttle-time (assoc :headers {"Retry-After" throttle-time}))
      (do
        (validation/check-public-sharing-enabled)
        (let [dashboard-id (api/check-404 (t2/select-one-pk :model/Dashboard :public_uuid uuid, :archived false))]
          ;; Run this query with full superuser perms. We don't want the various perms checks
          ;; failing because there are no current user perms; if this Dashcard is public
          ;; you're by definition allowed to run it without a perms check anyway
          (request/as-admin
            ;; Undo middleware string->keyword coercion
            (actions/execute-dashcard! dashboard-id dashcard-id (update-keys parameters name))))))))

(api.macros/defendpoint :get "/oembed"
  "oEmbed endpoint used to retrieve embed code and metadata for a (public) Metabase URL."
  [_route-params
   {:keys [url maxheight maxwidth]}
   :- [:map
       [:url       ms/NonBlankString]
       [:format    {:optional true} [:maybe
                                     {:description (str "The format param is not used by the API, but is required as"
                                                        " part of the oEmbed spec: http://oembed.com/#section2 just"
                                                        " return an error if `format` is specified and it's anything"
                                                        " other than `json`.")}
                                     [:enum "json"]]]
       [:maxheight {:default default-embed-max-height} pos-int?]
       [:maxwidth  {:default default-embed-max-width}  pos-int?]]]
  {:version "1.0"
   :type    "rich"
   :width   maxwidth
   :height  maxheight
   :html    (embed/iframe url maxwidth maxheight)})

;;; ----------------------------------------------- Public Action ------------------------------------------------

(api.macros/defendpoint :get "/action/:uuid"
  "Fetch a publicly-accessible Action. Does not require auth credentials. Public sharing must be enabled."
  [{:keys [uuid]} :- [:map
                      [:uuid ms/UUIDString]]]
  (validation/check-public-sharing-enabled)
  (let [action (api/check-404 (actions/select-action :public_uuid uuid :archived false))]
    (actions/check-actions-enabled! action)
    (public-action action)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        FieldValues, Search, Remappings                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; -------------------------------------------------- Field Values --------------------------------------------------

(defn- query->referenced-field-ids
  "Get the IDs of all Fields referenced by an MBQL `query` (not including any parameters)."
  [query]
  (lib.util.match/match (:query query) [:field id _] id))

(defn- card->referenced-field-ids
  "Return a set of all Field IDs referenced by `card`, in both the MBQL query itself and in its parameters ('template
  tags')."
  [card]
  (set (concat (query->referenced-field-ids (:dataset_query card))
               (params/card->template-tag-field-ids card))))

(defn- check-field-is-referenced-by-card
  "Check to make sure the query for Card with `card-id` references Field with `field-id`. Otherwise, or if the Card
  cannot be found, throw an Exception."
  [field-id card-id]
  (let [card                 (api/check-404 (t2/select-one [:model/Card :dataset_query] :id card-id))
        referenced-field-ids (card->referenced-field-ids card)]
    (api/check-404 (contains? referenced-field-ids field-id))))

(defn- check-search-field-is-allowed
  "Check whether a search Field is allowed to be used in conjunction with another Field. A search Field is allowed if
  *any* of the following conditions is true:

  *  `search-field-id` and `field-id` are both the same Field
  *  `search-field-id` is equal to the other Field's Dimension's `human-readable-field-id`
  *  field is a `:type/PK` Field and search field is a `:type/Name` Field belonging to the same Table.

  If none of these conditions are met, you are not allowed to use the search field in combination with the other
  field, and an 400 exception will be thrown."
  [field-id search-field-id]
  {:pre [(integer? field-id) (integer? search-field-id)]}
  (api/check-400
   (or (= field-id search-field-id)
       (t2/exists? :model/Dimension :field_id field-id, :human_readable_field_id search-field-id)
       ;; just do a couple small queries to figure this out, we could write a fancy query to join Field against itself
       ;; and do this in one but the extra code complexity isn't worth it IMO
       (when-let [table-id (t2/select-one-fn :table_id :model/Field :id field-id, :semantic_type (mdb.query/isa :type/PK))]
         (t2/exists? :model/Field :id search-field-id, :table_id table-id, :semantic_type (mdb.query/isa :type/Name))))))

(defn- check-field-is-referenced-by-dashboard
  "Check that `field-id` belongs to a Field that is used as a parameter in a Dashboard with `dashboard-id`, or throw a
  404 Exception."
  [field-id dashboard-id]
  (let [dashboard       (-> (t2/select-one :model/Dashboard :id dashboard-id)
                            api/check-404
                            (t2/hydrate [:dashcards :card]))
        param-field-ids (params/dashcards->param-field-ids (:dashcards dashboard))]
    (api/check-404 (contains? param-field-ids field-id))))

(defn card-and-field-id->values
  "Return the FieldValues for a Field with `field-id` that is referenced by Card with `card-id`."
  [card-id field-id]
  (check-field-is-referenced-by-card field-id card-id)
  (api.field/field->values (t2/select-one :model/Field :id field-id)))

(api.macros/defendpoint :get "/card/:uuid/field/:field-id/values"
  "Fetch FieldValues for a Field that is referenced by a public Card."
  [{:keys [uuid field-id]} :- [:map
                               [:uuid     ms/UUIDString]
                               [:field-id ms/PositiveInt]]]
  (validation/check-public-sharing-enabled)
  (let [card-id (t2/select-one-pk :model/Card :public_uuid uuid, :archived false)]
    (card-and-field-id->values card-id field-id)))

(defn dashboard-and-field-id->values
  "Return the FieldValues for a Field with `field-id` that is referenced by Card with `card-id` which itself is present
  in Dashboard with `dashboard-id`."
  [dashboard-id field-id]
  (check-field-is-referenced-by-dashboard field-id dashboard-id)
  (api.field/field->values (t2/select-one :model/Field :id field-id)))

(api.macros/defendpoint :get "/dashboard/:uuid/field/:field-id/values"
  "Fetch FieldValues for a Field that is referenced by a Card in a public Dashboard."
  [{:keys [uuid field-id]} :- [:map
                               [:uuid     ms/UUIDString]
                               [:field-id ms/PositiveInt]]]
  (validation/check-public-sharing-enabled)
  (let [dashboard-id (api/check-404 (t2/select-one-pk :model/Dashboard :public_uuid uuid, :archived false))]
    (dashboard-and-field-id->values dashboard-id field-id)))

;;; --------------------------------------------------- Searching ----------------------------------------------------

(defn search-card-fields
  "Wrapper for `metabase.api.field/search-values` for use with public/embedded Cards. See that functions
  documentation for a more detailed explanation of exactly what this does."
  [card-id field-id search-id value limit]
  (check-field-is-referenced-by-card field-id card-id)
  (check-search-field-is-allowed field-id search-id)
  (api.field/search-values (t2/select-one :model/Field :id field-id) (t2/select-one :model/Field :id search-id) value limit))

(defn search-dashboard-fields
  "Wrapper for `metabase.api.field/search-values` for use with public/embedded Dashboards. See that functions
  documentation for a more detailed explanation of exactly what this does."
  [dashboard-id field-id search-id value limit]
  (check-field-is-referenced-by-dashboard field-id dashboard-id)
  (check-search-field-is-allowed field-id search-id)
  (api.field/search-values (t2/select-one :model/Field :id field-id) (t2/select-one :model/Field :id search-id) value limit))

(api.macros/defendpoint :get "/card/:uuid/field/:field-id/search/:search-field-id"
  "Search for values of a Field that is referenced by a public Card."
  [{:keys [uuid field-id search-field-id]} :- [:map
                                               [:uuid            ms/UUIDString]
                                               [:field-id        ms/PositiveInt]
                                               [:search-field-id ms/PositiveInt]]
   {:keys [value limit]} :- [:map
                             [:value ms/NonBlankString]
                             [:limit {:optional true} [:maybe ms/PositiveInt]]]]
  (validation/check-public-sharing-enabled)
  (let [card-id (t2/select-one-pk :model/Card :public_uuid uuid, :archived false)]
    (search-card-fields card-id field-id search-field-id value limit)))

(api.macros/defendpoint :get "/dashboard/:uuid/field/:field-id/search/:search-field-id"
  "Search for values of a Field that is referenced by a Card in a public Dashboard."
  [{:keys [uuid field-id search-field-id]} :- [:map
                                               [:uuid            ms/UUIDString]
                                               [:field-id        ms/PositiveInt]
                                               [:search-field-id ms/PositiveInt]]
   {:keys [value limit]} :- [:map
                             [:value ms/NonBlankString]
                             [:limit {:optional true} [:maybe ms/PositiveInt]]]]
  (validation/check-public-sharing-enabled)
  (let [dashboard-id (api/check-404 (t2/select-one-pk :model/Dashboard :public_uuid uuid, :archived false))]
    (search-dashboard-fields dashboard-id field-id search-field-id value limit)))

;;; --------------------------------------------------- Remappings ---------------------------------------------------

(defn- field-remapped-values [field-id remapped-field-id, ^String value-str]
  (let [field          (api/check-404 (t2/select-one :model/Field :id field-id))
        remapped-field (api/check-404 (t2/select-one :model/Field :id remapped-field-id))]
    (check-search-field-is-allowed field-id remapped-field-id)
    (api.field/remapped-value field remapped-field (api.field/parse-query-param-value-for-field field value-str))))

(defn card-field-remapped-values
  "Return the reampped Field values for a Field referenced by a *Card*. This explanation is almost useless, so see the
  one in `metabase.api.field/remapped-value` if you would actually like to understand what is going on here."
  [card-id field-id remapped-field-id, ^String value-str]
  (check-field-is-referenced-by-card field-id card-id)
  (field-remapped-values field-id remapped-field-id value-str))

(defn dashboard-field-remapped-values
  "Return the reampped Field values for a Field referenced by a *Dashboard*. This explanation is almost useless, so see
  the one in `metabase.api.field/remapped-value` if you would actually like to understand what is going on here."
  [dashboard-id field-id remapped-field-id, ^String value-str]
  (check-field-is-referenced-by-dashboard field-id dashboard-id)
  (field-remapped-values field-id remapped-field-id value-str))

(api.macros/defendpoint :get "/card/:uuid/field/:field-id/remapping/:remapped-id"
  "Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with public
  Cards."
  [{:keys [uuid field-id remapped-id]} :- [:map
                                           [:uuid        ms/UUIDString]
                                           [:field-id    ms/PositiveInt]
                                           [:remapped-id ms/PositiveInt]]
   {:keys [value]} :- [:map
                       [:value ms/NonBlankString]]]
  (validation/check-public-sharing-enabled)
  (let [card-id (api/check-404 (t2/select-one-pk :model/Card :public_uuid uuid, :archived false))]
    (card-field-remapped-values card-id field-id remapped-id value)))

(api.macros/defendpoint :get "/dashboard/:uuid/field/:field-id/remapping/:remapped-id"
  "Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with public
  Dashboards."
  [{:keys [uuid field-id remapped-id]} :- [:map
                                           [:uuid        ms/UUIDString]
                                           [:field-id    ms/PositiveInt]
                                           [:remapped-id ms/PositiveInt]]
   {:keys [value]} :- [:map
                       [:value ms/NonBlankString]]]
  (validation/check-public-sharing-enabled)
  (let [dashboard-id (t2/select-one-pk :model/Dashboard :public_uuid uuid, :archived false)]
    (dashboard-field-remapped-values dashboard-id field-id remapped-id value)))

;;; ------------------------------------------------ Param Values -------------------------------------------------

(api.macros/defendpoint :get "/card/:uuid/params/:param-key/values"
  "Fetch values for a parameter on a public card."
  [{:keys [uuid param-key]} :- [:map
                                [:uuid      ms/UUIDString]
                                [:param-key ms/NonBlankString]]]
  (validation/check-public-sharing-enabled)
  (let [card (t2/select-one :model/Card :public_uuid uuid, :archived false)]
    (request/as-admin
      (api.card/param-values card param-key))))

(api.macros/defendpoint :get "/card/:uuid/params/:param-key/search/:query"
  "Fetch values for a parameter on a public card containing `query`."
  [{:keys [uuid param-key query]} :- [:map
                                      [:uuid      ms/UUIDString]
                                      [:param-key ms/NonBlankString]
                                      [:query     ms/NonBlankString]]]
  (validation/check-public-sharing-enabled)
  (let [card (t2/select-one :model/Card :public_uuid uuid, :archived false)]
    (request/as-admin
      (api.card/param-values card param-key query))))

(api.macros/defendpoint :get "/dashboard/:uuid/params/:param-key/values"
  "Fetch filter values for dashboard parameter `param-key`."
  [{:keys [uuid param-key]} :- [:map
                                [:uuid      ms/UUIDString]
                                [:param-key ms/NonBlankString]]
   constraint-param-key->value]
  (let [dashboard (dashboard-with-uuid uuid)]
    (request/as-admin
      (binding [qp.perms/*param-values-query* true]
        (api.dashboard/param-values dashboard param-key constraint-param-key->value)))))

(api.macros/defendpoint :get "/dashboard/:uuid/params/:param-key/search/:query"
  "Fetch filter values for dashboard parameter `param-key`, containing specified `query`."
  [{:keys [uuid param-key query]} :- [:map
                                      [:uuid      ms/UUIDString]
                                      [:param-key ms/NonBlankString]
                                      [:query     ms/NonBlankString]]
   constraint-param-key->value]
  (let [dashboard (dashboard-with-uuid uuid)]
    (request/as-admin
      (binding [qp.perms/*param-values-query* true]
        (api.dashboard/param-values dashboard param-key constraint-param-key->value query)))))

;;; ----------------------------------------------------- Pivot Tables -----------------------------------------------

;; TODO -- why do these endpoints START with `/pivot/` whereas the version in Dash
(api.macros/defendpoint :get "/pivot/card/:uuid/query"
  "Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled."
  [{:keys [uuid]} :- [:map
                      [:uuid ms/UUIDString]]
   {:keys [parameters]} :- [:map
                            [:parameters {:optional true} [:maybe ms/JSONString]]]]
  (process-query-for-card-with-public-uuid uuid :api (json/decode+kw parameters)
                                           :qp qp.pivot/run-pivot-query))

(api.macros/defendpoint :get "/pivot/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results for a Card in a publicly-accessible Dashboard. Does not require auth credentials. Public
  sharing must be enabled."
  [{:keys [uuid dashcard-id card-id]} :- [:map
                                          [:uuid        ms/UUIDString]
                                          [:card-id     ms/PositiveInt]
                                          [:dashcard-id ms/PositiveInt]]
   {:keys [parameters]} :- [:map
                            [:parameters {:optional true} [:maybe ms/JSONString]]]]
  (validation/check-public-sharing-enabled)
  (api/check-404 (t2/select-one-pk :model/Card :id card-id :archived false))
  (let [dashboard-id (api/check-404 (t2/select-one-pk :model/Dashboard :public_uuid uuid, :archived false))]
    (u/prog1 (process-query-for-dashcard
              :dashboard-id  dashboard-id
              :card-id       card-id
              :dashcard-id   dashcard-id
              :export-format :api
              :parameters    parameters
              :qp            qp.pivot/run-pivot-query)
      (events/publish-event! :event/card-read {:object-id card-id, :user-id api/*current-user-id*, :context :dashboard}))))

(def ^:private action-execution-throttle
  "Rate limit at 10 actions per 1000 ms on a per action basis.
   The goal of rate limiting should be to prevent very obvious abuse, but it should
   be relatively lax so we don't annoy legitimate users."
  (throttle/make-throttler :action-uuid
                           :attempts-threshold 10
                           :initial-delay-ms 1000
                           :attempt-ttl-ms 1000
                           :delay-exponent 1))

(api.macros/defendpoint :post "/action/:uuid/execute"
  "Execute the Action.

   `parameters` should be the mapped dashboard parameters with values."
  [{:keys [uuid]} :- [:map
                      [:uuid ms/UUIDString]]
   _query-params
   {:keys [parameters], :as _body} :- [:map
                                       [:parameters {:optional true} [:maybe [:map-of :keyword any?]]]]]
  (let [throttle-message (try
                           (throttle/check action-execution-throttle uuid)
                           nil
                           (catch ExceptionInfo e
                             (get-in (ex-data e) [:errors :action-uuid])))
        throttle-time (when throttle-message
                        (second (re-find #"You must wait ([0-9]+) seconds" throttle-message)))]
    (if throttle-message
      (cond-> {:status 429
               :body   throttle-message}
        throttle-time (assoc :headers {"Retry-After" throttle-time}))
      (do
        (validation/check-public-sharing-enabled)
        ;; Run this query with full superuser perms. We don't want the various perms checks
        ;; failing because there are no current user perms; if this Dashcard is public
        ;; you're by definition allowed to run it without a perms check anyway
        (request/as-admin
          (let [action (api/check-404 (actions/select-action :public_uuid uuid :archived false))]
            (analytics/track-event! :snowplow/action
                                    {:event     :action-executed
                                     :source    :public_form
                                     :type      (:type action)
                                     :action_id (:id action)})
            ;; Undo middleware string->keyword coercion
            (actions/execute-action! action (update-keys parameters name))))))))

;;; ----------------------------------------------------- Map Tiles --------------------------------------------------

(api.macros/defendpoint :get "/tiles/card/:uuid/:zoom/:x/:y/:lat-field/:lon-field"
  "Generates a single tile image for a publicly-accessible Card using the map visualization. Does not require auth
  credentials. Public sharing must be enabled."
  [{:keys [uuid zoom x y lat-field lon-field]}
   :- [:merge
       :api.tiles/route-params
       [:map
        [:uuid ms/UUIDString]]]
   {:keys [parameters]}
   :- [:map
       [:parameters {:optional true} ms/JSONString]]]
  (validation/check-public-sharing-enabled)
  (let [card-id    (api/check-404 (t2/select-one-pk :model/Card :public_uuid uuid, :archived false))
        parameters (json/decode+kw parameters)]
    (request/as-admin
      (api.tiles/process-tiles-query-for-card card-id parameters zoom x y lat-field lon-field))))

(api.macros/defendpoint :get "/tiles/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y/:lat-field/:lon-field"
  "Generates a single tile image for a Card using the map visualization in a publicly-accessible Dashboard. Does not
  require auth credentials. Public sharing must be enabled."
  [{:keys [uuid dashcard-id card-id zoom x y lat-field lon-field]}
   :- [:merge
       :api.tiles/route-params
       [:map
        [:uuid        ms/UUIDString]
        [:dashcard-id ms/PositiveInt]
        [:card-id     ms/PositiveInt]]]
   {:keys [parameters]}
   :- [:map
       [:parameters {:optional true} ms/JSONString]]]
  (validation/check-public-sharing-enabled)
  (let [dashboard-id (api/check-404 (t2/select-one-pk :model/Dashboard :public_uuid uuid, :archived false))
        parameters   (json/decode+kw parameters)]
    (request/as-admin
      (api.tiles/process-tiles-query-for-dashcard dashboard-id dashcard-id card-id parameters zoom x y lat-field lon-field))))

;;; ----------------------------------------- Route Definitions & Complaints -----------------------------------------

;; TODO - why don't we just make these routes have a bit of middleware that includes the
;; `validation/check-public-sharing-enabled` check in each of them? That way we don't need to remember to include the line in
;; every single endpoint definition here? Wouldn't that be 100x better?!
;;
;; TODO - also a smart person would probably just parse the UUIDs automatically in middleware as appropriate for
;;`/dashboard` vs `/card`
