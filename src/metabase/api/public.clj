(ns metabase.api.public
  "Metabase API endpoints for viewing publicly-accessible Cards and Dashboards."
  (:require
   [cheshire.core :as json]
   [clojure.core.async :as a]
   [compojure.core :refer [GET]]
   [medley.core :as m]
   [metabase.actions :as actions]
   [metabase.actions.execution :as actions.execution]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.card :as api.card]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.api.dashboard :as api.dashboard]
   [metabase.api.dataset :as api.dataset]
   [metabase.api.field :as api.field]
   [metabase.async.util :as async.u]
   [metabase.db.util :as mdb.u]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.action :as action]
   [metabase.models.card :as card :refer [Card]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.dimension :refer [Dimension]]
   [metabase.models.field :refer [Field]]
   [metabase.models.interface :as mi]
   [metabase.models.params :as params]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.server.middleware.session :as mw.session]
   [metabase.util :as u]
   [metabase.util.embed :as embed]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [schema.core :as s]
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
  (mi/instance
   Card
   (u/select-nested-keys card [:id :name :description :display :visualization_settings :parameters
                               [:dataset_query :type [:native :template-tags]]])))

(defn public-card
  "Return a public Card matching key-value `conditions`, removing all columns that should not be visible to the general
  public. Throws a 404 if the Card doesn't exist."
  [& conditions]
  (binding [params/*ignore-current-user-perms-and-return-all-field-values* true]
    (-> (api/check-404 (apply t2/select-one [Card :id :dataset_query :description :display :name :parameters :visualization_settings]
                              :archived false, conditions))
        remove-card-non-public-columns
        combine-parameters-and-template-tags
        (t2/hydrate :param_values :param_fields))))

(defn- card-with-uuid [uuid] (public-card :public_uuid uuid))

(api/defendpoint GET "/card/:uuid"
  "Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled."
  [uuid]
  {uuid ms/UUIDString}
  (validation/check-public-sharing-enabled)
  (card-with-uuid uuid))

(defmulti ^:private transform-results
  "Transform results to be suitable for a public endpoint"
  {:arglists '([results])}
  :status)

(defmethod transform-results :default
  [x]
  x)

(defmethod transform-results :completed
  [results]
  (u/select-nested-keys
   results
   [[:data :cols :rows :rows_truncated :insights :requested_timezone :results_timezone]
    [:json_query :parameters]
    :status]))

(defmethod transform-results :failed
  [{error-type :error_type, :as results}]
  ;; if the query failed instead, unless the error type is specified and is EXPLICITLY allowed to be shown for embeds,
  ;; instead of returning anything about the query just return a generic error message
  (merge
   (select-keys results [:status :error :error_type])
   (when-not (qp.error-type/show-in-embeds? error-type)
     {:error (tru "An error occurred while running the query.")})))

(defn public-reducedf
  "Reducer function for public data"
  [orig-reducedf]
  (fn [final-metadata context]
    (orig-reducedf (transform-results final-metadata) context)))

(defn- run-query-for-card-with-id-async-run-fn
  "Create the `:run` function used for [[run-query-for-card-with-id-async]] and [[public-dashcard-results-async]]."
  [qp-runner export-format]
  (fn [query info]
    (qp.streaming/streaming-response [{:keys [rff], {:keys [reducedf], :as context} :context}
                                      export-format
                                      (u/slugify (:card-name info))]
      (let [context  (assoc context :reducedf (public-reducedf reducedf))
            in-chan  (mw.session/as-admin
                       (qp-runner query info rff context))
            out-chan (a/promise-chan (map transform-results))]
        (async.u/promise-pipe in-chan out-chan)
        out-chan))))

(defn run-query-for-card-with-id-async
  "Run the query belonging to Card with `card-id` with `parameters` and other query options (e.g. `:constraints`).
  Returns a `StreamingResponse` object that should be returned as the result of an API endpoint."
  [card-id export-format parameters & {:keys [qp-runner]
                                       :or   {qp-runner qp/process-query-and-save-execution!}
                                       :as   options}]
  {:pre [(integer? card-id)]}
  ;; run this query with full superuser perms
  ;;
  ;; we actually need to bind the current user perms here twice, once so `card-api` will have the full perms when it
  ;; tries to do the `read-check`, and a second time for when the query is ran (async) so the QP middleware will have
  ;; the correct perms
  (mw.session/as-admin
   (m/mapply qp.card/run-query-for-card-async card-id export-format
             :parameters parameters
             :context    :public-question
             :run        (run-query-for-card-with-id-async-run-fn qp-runner export-format)
             options)))

(s/defn ^:private run-query-for-card-with-public-uuid-async
  "Run query for a *public* Card with UUID. If public sharing is not enabled, this throws an exception. Returns a
  `StreamingResponse` object that should be returned as the result of an API endpoint."
  [uuid export-format parameters & options]
  (validation/check-public-sharing-enabled)
  (let [card-id (api/check-404 (t2/select-one-pk Card :public_uuid uuid, :archived false))]
    (apply run-query-for-card-with-id-async card-id export-format parameters options)))

(api/defendpoint GET "/card/:uuid/query"
  "Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled."
  [uuid parameters]
  {uuid       ms/UUIDString
   parameters [:maybe ms/JSONString]}
  (run-query-for-card-with-public-uuid-async uuid :api (json/parse-string parameters keyword)))

(api/defendpoint GET "/card/:uuid/query/:export-format"
  "Fetch a publicly-accessible Card and return query results in the specified format. Does not require auth
  credentials. Public sharing must be enabled."
  [uuid export-format :as {{:keys [parameters]} :params}]
  {uuid          ms/UUIDString
   export-format api.dataset/ExportFormat
   parameters    [:maybe ms/JSONString]}
  (run-query-for-card-with-public-uuid-async
   uuid
   export-format
   (json/parse-string parameters keyword)
   :constraints nil
   :middleware {:process-viz-settings? true
                :js-int-to-string?     false
                :format-rows?          false}))


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
  (binding [params/*ignore-current-user-perms-and-return-all-field-values* true]
    (-> (api/check-404 (apply t2/select-one [Dashboard :name :description :id :parameters :auto_apply_filters], :archived false, conditions))
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

(api/defendpoint GET "/dashboard/:uuid"
  "Fetch a publicly-accessible Dashboard. Does not require auth credentials. Public sharing must be enabled."
  [uuid]
  {uuid ms/UUIDString}
  (validation/check-public-sharing-enabled)
  (dashboard-with-uuid uuid))

;; TODO -- this should probably have a name like `run-query-for-dashcard...` so it matches up with
;; [[run-query-for-card-with-id-async]]
(defn public-dashcard-results-async
  "Return the results of running a query for Card with `card-id` belonging to Dashboard with `dashboard-id` via
  `dashcard-id`. `card-id`, `dashboard-id`, and `dashcard-id` are all required; other parameters are optional:

  * `parameters`    - MBQL query parameters, either already parsed or as a serialized JSON string
  * `export-format` - `:api` (default format with metadata), `:json` (results only), `:csv`, or `:xslx`. Default: `:api`
  * `qp-runner`     - QP function to run the query with. Default [[qp/process-query-and-save-execution!]]

  Throws a 404 immediately if the Card isn't part of the Dashboard. Returns a `StreamingResponse`."
  {:arglists '([& {:keys [dashboard-id card-id dashcard-id export-format parameters] :as options}])}
  [& {:keys [export-format parameters qp-runner]
      :or   {qp-runner     qp/process-query-and-save-execution!
             export-format :api}
      :as   options}]
  (let [options (merge
                 {:context     :public-dashboard
                  :constraints (qp.constraints/default-query-constraints)}
                 options
                 {:parameters    (cond-> parameters
                                   (string? parameters) (json/parse-string keyword))
                  :export-format export-format
                  :qp-runner     qp-runner
                  :run           (run-query-for-card-with-id-async-run-fn qp-runner export-format)})]
    ;; Run this query with full superuser perms. We don't want the various perms checks failing because there are no
    ;; current user perms; if this Dashcard is public you're by definition allowed to run it without a perms check
    ;; anyway
    (mw.session/as-admin
     (m/mapply qp.dashboard/run-query-for-dashcard-async options))))

(api/defendpoint GET "/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results for a Card in a publicly-accessible Dashboard. Does not require auth credentials. Public
   sharing must be enabled."
  [uuid card-id dashcard-id parameters]
  {uuid        ms/UUIDString
   dashcard-id ms/PositiveInt
   card-id     ms/PositiveInt
   parameters  [:maybe ms/JSONString]}
  (validation/check-public-sharing-enabled)
  (let [dashboard-id (api/check-404 (t2/select-one-pk Dashboard :public_uuid uuid, :archived false))]
    (public-dashcard-results-async
     :dashboard-id  dashboard-id
     :card-id       card-id
     :dashcard-id   dashcard-id
     :export-format :api
     :parameters    parameters)))

(api/defendpoint GET "/dashboard/:uuid/dashcard/:dashcard-id/execute"
  "Fetches the values for filling in execution parameters. Pass PK parameters and values to select."
  [uuid dashcard-id parameters]
  {uuid        ms/UUIDString
   dashcard-id ms/PositiveInt
   parameters  ms/JSONString}
  (validation/check-public-sharing-enabled)
  (api/check-404 (t2/select-one-pk Dashboard :public_uuid uuid :archived false))
  (actions.execution/fetch-values
   (api/check-404 (action/dashcard->action dashcard-id))
   (json/parse-string parameters)))

(def ^:private dashcard-execution-throttle (throttle/make-throttler :dashcard-id :attempts-threshold 5000))

(api/defendpoint POST "/dashboard/:uuid/dashcard/:dashcard-id/execute"
  "Execute the associated Action in the context of a `Dashboard` and `DashboardCard` that includes it.

   `parameters` should be the mapped dashboard parameters with values."
  [uuid dashcard-id :as {{:keys [parameters], :as _body} :body}]
  {uuid        ms/UUIDString
   dashcard-id ms/PositiveInt
   parameters  [:maybe [:map-of :keyword :any]]}
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
        (let [dashboard-id (api/check-404 (t2/select-one-pk Dashboard :public_uuid uuid, :archived false))]
          ;; Run this query with full superuser perms. We don't want the various perms checks
          ;; failing because there are no current user perms; if this Dashcard is public
          ;; you're by definition allowed to run it without a perms check anyway
          (binding [api/*current-user-permissions-set* (delay #{"/"})]
            ;; Undo middleware string->keyword coercion
            (actions.execution/execute-dashcard! dashboard-id dashcard-id (update-keys parameters name))))))))

(api/defendpoint GET "/oembed"
  "oEmbed endpoint used to retreive embed code and metadata for a (public) Metabase URL."
  [url format maxheight maxwidth]
  ;; the format param is not used by the API, but is required as part of the oEmbed spec: http://oembed.com/#section2
  ;; just return an error if `format` is specified and it's anything other than `json`.
  {url       ms/NonBlankString
   format    [:maybe [:enum "json"]]
   maxheight [:maybe ms/IntString]
   maxwidth  [:maybe ms/IntString]}
  (let [height (if maxheight (Integer/parseInt maxheight) default-embed-max-height)
        width  (if maxwidth  (Integer/parseInt maxwidth)  default-embed-max-width)]
    {:version "1.0"
     :type    "rich"
     :width   width
     :height  height
     :html    (embed/iframe url width height)}))


;;; ----------------------------------------------- Public Action ------------------------------------------------

(api/defendpoint GET "/action/:uuid"
  "Fetch a publicly-accessible Action. Does not require auth credentials. Public sharing must be enabled."
  [uuid]
  {uuid ms/UUIDString}
  (validation/check-public-sharing-enabled)
  (let [action (api/check-404 (action/select-action :public_uuid uuid :archived false))]
    (actions/check-actions-enabled! action)
    (public-action action)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        FieldValues, Search, Remappings                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; -------------------------------------------------- Field Values --------------------------------------------------

(defn- query->referenced-field-ids
  "Get the IDs of all Fields referenced by an MBQL `query` (not including any parameters)."
  [query]
  (mbql.u/match (:query query) [:field id _] id))

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
  (let [card                 (api/check-404 (t2/select-one [Card :dataset_query] :id card-id))
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
       (t2/exists? Dimension :field_id field-id, :human_readable_field_id search-field-id)
       ;; just do a couple small queries to figure this out, we could write a fancy query to join Field against itself
       ;; and do this in one but the extra code complexity isn't worth it IMO
       (when-let [table-id (t2/select-one-fn :table_id Field :id field-id, :semantic_type (mdb.u/isa :type/PK))]
         (t2/exists? Field :id search-field-id, :table_id table-id, :semantic_type (mdb.u/isa :type/Name))))))

(defn- check-field-is-referenced-by-dashboard
  "Check that `field-id` belongs to a Field that is used as a parameter in a Dashboard with `dashboard-id`, or throw a
  404 Exception."
  [field-id dashboard-id]
  (let [dashboard       (-> (t2/select-one Dashboard :id dashboard-id)
                            api/check-404
                            (t2/hydrate [:dashcards :card]))
        param-field-ids (params/dashcards->param-field-ids (:dashcards dashboard))]
    (api/check-404 (contains? param-field-ids field-id))))

(defn card-and-field-id->values
  "Return the FieldValues for a Field with `field-id` that is referenced by Card with `card-id`."
  [card-id field-id]
  (check-field-is-referenced-by-card field-id card-id)
  (api.field/field->values (t2/select-one Field :id field-id)))

(api/defendpoint GET "/card/:uuid/field/:field-id/values"
  "Fetch FieldValues for a Field that is referenced by a public Card."
  [uuid field-id]
  {uuid     ms/UUIDString
   field-id ms/PositiveInt}
  (validation/check-public-sharing-enabled)
  (let [card-id (t2/select-one-pk Card :public_uuid uuid, :archived false)]
    (card-and-field-id->values card-id field-id)))

(defn dashboard-and-field-id->values
  "Return the FieldValues for a Field with `field-id` that is referenced by Card with `card-id` which itself is present
  in Dashboard with `dashboard-id`."
  [dashboard-id field-id]
  (check-field-is-referenced-by-dashboard field-id dashboard-id)
  (api.field/field->values (t2/select-one Field :id field-id)))

(api/defendpoint GET "/dashboard/:uuid/field/:field-id/values"
  "Fetch FieldValues for a Field that is referenced by a Card in a public Dashboard."
  [uuid field-id]
  {uuid     ms/UUIDString
   field-id ms/PositiveInt}
  (validation/check-public-sharing-enabled)
  (let [dashboard-id (api/check-404 (t2/select-one-pk Dashboard :public_uuid uuid, :archived false))]
    (dashboard-and-field-id->values dashboard-id field-id)))


;;; --------------------------------------------------- Searching ----------------------------------------------------

(defn search-card-fields
  "Wrapper for `metabase.api.field/search-values` for use with public/embedded Cards. See that functions
  documentation for a more detailed explanation of exactly what this does."
  [card-id field-id search-id value limit]
  (check-field-is-referenced-by-card field-id card-id)
  (check-search-field-is-allowed field-id search-id)
  (api.field/search-values (t2/select-one Field :id field-id) (t2/select-one Field :id search-id) value limit))

(defn search-dashboard-fields
  "Wrapper for `metabase.api.field/search-values` for use with public/embedded Dashboards. See that functions
  documentation for a more detailed explanation of exactly what this does."
  [dashboard-id field-id search-id value limit]
  (check-field-is-referenced-by-dashboard field-id dashboard-id)
  (check-search-field-is-allowed field-id search-id)
  (api.field/search-values (t2/select-one Field :id field-id) (t2/select-one Field :id search-id) value limit))

(api/defendpoint GET "/card/:uuid/field/:field-id/search/:search-field-id"
  "Search for values of a Field that is referenced by a public Card."
  [uuid field-id search-field-id value limit]
  {uuid            ms/UUIDString
   field-id        ms/PositiveInt
   search-field-id ms/PositiveInt
   value           ms/NonBlankString
   limit           [:maybe ms/PositiveInt]}
  (validation/check-public-sharing-enabled)
  (let [card-id (t2/select-one-pk Card :public_uuid uuid, :archived false)]
    (search-card-fields card-id field-id search-field-id value limit)))

(api/defendpoint GET "/dashboard/:uuid/field/:field-id/search/:search-field-id"
  "Search for values of a Field that is referenced by a Card in a public Dashboard."
  [uuid field-id search-field-id value limit]
  {uuid            ms/UUIDString
   field-id        ms/PositiveInt
   search-field-id ms/PositiveInt
   value           ms/NonBlankString
   limit           [:maybe ms/PositiveInt]}
  (validation/check-public-sharing-enabled)
  (let [dashboard-id (api/check-404 (t2/select-one-pk Dashboard :public_uuid uuid, :archived false))]
    (search-dashboard-fields dashboard-id field-id search-field-id value limit)))


;;; --------------------------------------------------- Remappings ---------------------------------------------------

(defn- field-remapped-values [field-id remapped-field-id, ^String value-str]
  (let [field          (api/check-404 (t2/select-one Field :id field-id))
        remapped-field (api/check-404 (t2/select-one Field :id remapped-field-id))]
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

(api/defendpoint GET "/card/:uuid/field/:field-id/remapping/:remapped-id"
  "Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with public
  Cards."
  [uuid field-id remapped-id value]
  {uuid        ms/UUIDString
   field-id    ms/PositiveInt
   remapped-id ms/PositiveInt
   value       ms/NonBlankString}
  (validation/check-public-sharing-enabled)
  (let [card-id (api/check-404 (t2/select-one-pk Card :public_uuid uuid, :archived false))]
    (card-field-remapped-values card-id field-id remapped-id value)))

(api/defendpoint GET "/dashboard/:uuid/field/:field-id/remapping/:remapped-id"
  "Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with public
  Dashboards."
  [uuid field-id remapped-id value]
  {uuid        ms/UUIDString
   field-id    ms/PositiveInt
   remapped-id ms/PositiveInt
   value       ms/NonBlankString}
  (validation/check-public-sharing-enabled)
  (let [dashboard-id (t2/select-one-pk Dashboard :public_uuid uuid, :archived false)]
    (dashboard-field-remapped-values dashboard-id field-id remapped-id value)))

;;; ------------------------------------------------ Param Values -------------------------------------------------

(api/defendpoint GET "/card/:uuid/params/:param-key/values"
  "Fetch values for a parameter on a public card."
  [uuid param-key]
  {uuid      ms/UUIDString
   param-key ms/NonBlankString}
  (validation/check-public-sharing-enabled)
  (let [card (t2/select-one Card :public_uuid uuid, :archived false)]
    (mw.session/as-admin
     (api.card/param-values card param-key))))

(api/defendpoint GET "/card/:uuid/params/:param-key/search/:query"
  "Fetch values for a parameter on a public card containing `query`."
  [uuid param-key query]
  {uuid      ms/UUIDString
   param-key ms/NonBlankString
   query     ms/NonBlankString}
  (validation/check-public-sharing-enabled)
  (let [card (t2/select-one Card :public_uuid uuid, :archived false)]
    (mw.session/as-admin
     (api.card/param-values card param-key query))))

(api/defendpoint GET "/dashboard/:uuid/params/:param-key/values"
  "Fetch filter values for dashboard parameter `param-key`."
  [uuid param-key :as {constraint-param-key->value :query-params}]
  {uuid      ms/UUIDString
   param-key ms/NonBlankString}
  (let [dashboard (dashboard-with-uuid uuid)]
    (mw.session/as-admin
     (api.dashboard/param-values dashboard param-key constraint-param-key->value))))

(api/defendpoint GET "/dashboard/:uuid/params/:param-key/search/:query"
  "Fetch filter values for dashboard parameter `param-key`, containing specified `query`."
  [uuid param-key query :as {constraint-param-key->value :query-params}]
  {uuid      ms/UUIDString
   param-key ms/NonBlankString
   query     ms/NonBlankString}
  (let [dashboard (dashboard-with-uuid uuid)]
    (mw.session/as-admin
     (api.dashboard/param-values dashboard param-key constraint-param-key->value query))))

;;; ----------------------------------------------------- Pivot Tables -----------------------------------------------

;; TODO -- why do these endpoints START with `/pivot/` whereas the version in Dash
(api/defendpoint GET "/pivot/card/:uuid/query"
  "Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled."
  [uuid parameters]
  {uuid       ms/UUIDString
   parameters [:maybe ms/JSONString]}
  (run-query-for-card-with-public-uuid-async uuid :api (json/parse-string parameters keyword) :qp-runner qp.pivot/run-pivot-query))

(api/defendpoint GET "/pivot/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results for a Card in a publicly-accessible Dashboard. Does not require auth credentials. Public
  sharing must be enabled."
  [uuid card-id dashcard-id parameters]
  {uuid        ms/UUIDString
   card-id     ms/PositiveInt
   dashcard-id ms/PositiveInt
   parameters  [:maybe ms/JSONString]}
  (validation/check-public-sharing-enabled)
  (let [dashboard-id (api/check-404 (t2/select-one-pk Dashboard :public_uuid uuid, :archived false))]
    (public-dashcard-results-async
     :dashboard-id  dashboard-id
     :card-id       card-id
     :dashcard-id   dashcard-id
     :export-format :api
     :parameters    parameters :qp-runner qp.pivot/run-pivot-query)))

(def ^:private action-execution-throttle
  "Rate limit at 1 action per second on a per action basis.
   The goal of rate limiting should be to prevent very obvious abuse, but it should
   be relatively lax so we don't annoy legitimate users."
  (throttle/make-throttler :action-uuid :attempts-threshold 1 :initial-delay-ms 1000 :delay-exponent 1))

(api/defendpoint POST "/action/:uuid/execute"
  "Execute the Action.

   `parameters` should be the mapped dashboard parameters with values."
  [uuid :as {{:keys [parameters], :as _body} :body}]
  {uuid       ms/UUIDString
   parameters [:maybe [:map-of :keyword any?]]}
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
        (binding [api/*current-user-permissions-set* (delay #{"/"})]
          (let [action (api/check-404 (action/select-action :public_uuid uuid :archived false))]
            (snowplow/track-event! ::snowplow/action-executed api/*current-user-id* {:source    :public_form
                                                                                     :type      (:type action)
                                                                                     :action_id (:id action)})
            ;; Undo middleware string->keyword coercion
            (actions.execution/execute-action! action (update-keys parameters name))))))))


;;; ----------------------------------------- Route Definitions & Complaints -----------------------------------------

;; TODO - why don't we just make these routes have a bit of middleware that includes the
;; `validation/check-public-sharing-enabled` check in each of them? That way we don't need to remember to include the line in
;; every single endpoint definition here? Wouldn't that be 100x better?!
;;
;; TODO - also a smart person would probably just parse the UUIDs automatically in middleware as appropriate for
;;`/dashboard` vs `/card`
(api/define-routes)
