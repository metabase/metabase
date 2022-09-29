(ns metabase.api.public
  "Metabase API endpoints for viewing publicly-accessible Cards and Dashboards."
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [compojure.core :refer [GET]]
            [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.api.common.validation :as validation]
            [metabase.api.dashboard :as api.dashboard]
            [metabase.api.dataset :as api.dataset]
            [metabase.api.field :as api.field]
            [metabase.async.util :as async.u]
            [metabase.db.util :as mdb.u]
            [metabase.mbql.util :as mbql.u]
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
            [metabase.util :as u]
            [metabase.util.embed :as embed]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

(def ^:private ^:const ^Integer default-embed-max-height 800)
(def ^:private ^:const ^Integer default-embed-max-width 1024)


;;; -------------------------------------------------- Public Cards --------------------------------------------------

(defn- remove-card-non-public-columns
  "Remove everyting from public `card` that shouldn't be visible to the general public."
  [card]
  (mi/instance
   Card
   (u/select-nested-keys card [:id :name :description :display :visualization_settings
                               [:dataset_query :type [:native :template-tags]]])))

(defn public-card
  "Return a public Card matching key-value `conditions`, removing all columns that should not be visible to the general
   public. Throws a 404 if the Card doesn't exist."
  [& conditions]
  (-> (api/check-404 (apply db/select-one [Card :id :dataset_query :description :display :name :visualization_settings]
                            :archived false, conditions))
      remove-card-non-public-columns
      (hydrate :param_fields)))

(defn- card-with-uuid [uuid] (public-card :public_uuid uuid))

(api/defendpoint GET "/card/:uuid"
  "Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled."
  [uuid]
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
    (qp.streaming/streaming-response
        [{:keys [reducedf], :as context} export-format (u/slugify (:card-name info))]
        (let [context  (assoc context :reducedf (public-reducedf reducedf))
              in-chan  (binding [api/*current-user-permissions-set* (atom #{"/"})]
                         (qp-runner query info context))
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
  (binding [api/*current-user-permissions-set* (atom #{"/"})]
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
  (let [card-id (api/check-404 (db/select-one-id Card :public_uuid uuid, :archived false))]
    (apply run-query-for-card-with-id-async card-id export-format parameters options)))

(api/defendpoint ^:streaming GET "/card/:uuid/query"
  "Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled."
  [uuid parameters]
  {parameters (s/maybe su/JSONString)}
  (run-query-for-card-with-public-uuid-async uuid :api (json/parse-string parameters keyword)))

(api/defendpoint ^:streaming GET "/card/:uuid/query/:export-format"
  "Fetch a publicly-accessible Card and return query results in the specified format. Does not require auth
   credentials. Public sharing must be enabled."
  [uuid export-format :as {{:keys [parameters]} :params}]
  {parameters    (s/maybe su/JSONString)
   export-format api.dataset/ExportFormat}
  (run-query-for-card-with-public-uuid-async
   uuid
   export-format
   (json/parse-string parameters keyword)
   :constraints nil
   :middleware {:process-viz-settings? true
                :js-int-to-string?     false
                :format-rows?          false}))


;;; ----------------------------------------------- Public Dashboards ------------------------------------------------

(defn public-dashboard
  "Return a public Dashboard matching key-value `conditions`, removing all columns that should not be visible to the
   general public. Throws a 404 if the Dashboard doesn't exist."
  [& conditions]
  (-> (api/check-404 (apply db/select-one [Dashboard :name :description :id :parameters], :archived false, conditions))
      (hydrate [:ordered_cards :card :series] :param_fields)
      api.dashboard/add-query-average-durations
      (update :ordered_cards (fn [dashcards]
                               (for [dashcard dashcards]
                                 (-> (select-keys dashcard [:id :card :card_id :dashboard_id :series :col :row :size_x
                                                            :size_y :parameter_mappings :visualization_settings])
                                     (update :card remove-card-non-public-columns)
                                     (update :series (fn [series]
                                                       (for [series series]
                                                         (remove-card-non-public-columns series))))))))))

(defn- dashboard-with-uuid [uuid] (public-dashboard :public_uuid uuid))

(api/defendpoint GET "/dashboard/:uuid"
  "Fetch a publicly-accessible Dashboard. Does not require auth credentials. Public sharing must be enabled."
  [uuid]
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

  Throws a 404 immediately if the Card isn't part of the Dashboard. Throws a 405 immediately if the Card has is_write
  set to true, as those are meant to only be executed through the actions api. Returns a `StreamingResponse`."
  {:arglists '([& {:keys [dashboard-id card-id dashcard-id export-format parameters] :as options}])}
  [& {:keys [export-format parameters qp-runner card-id]
      :or   {qp-runner     qp/process-query-and-save-execution!
             export-format :api}
      :as   options}]
  (api/check-is-readonly {:is_write (db/select-one-field :is_write 'Card :id card-id)})
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
    (binding [api/*current-user-permissions-set* (atom #{"/"})]
      (m/mapply qp.dashboard/run-query-for-dashcard-async options))))

(api/defendpoint ^:streaming GET "/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results for a Card in a publicly-accessible Dashboard. Does not require auth credentials. Public
   sharing must be enabled."
  [uuid card-id dashcard-id parameters]
  {parameters (s/maybe su/JSONString)}
  (validation/check-public-sharing-enabled)
  (let [dashboard-id (api/check-404 (db/select-one-id Dashboard :public_uuid uuid, :archived false))]
    (public-dashcard-results-async
     :dashboard-id  dashboard-id
     :card-id       card-id
     :dashcard-id   dashcard-id
     :export-format :api
     :parameters    parameters)))

(api/defendpoint GET "/oembed"
  "oEmbed endpoint used to retreive embed code and metadata for a (public) Metabase URL."
  [url format maxheight maxwidth]
  ;; the format param is not used by the API, but is required as part of the oEmbed spec: http://oembed.com/#section2
  ;; just return an error if `format` is specified and it's anything other than `json`.
  {url       su/NonBlankString
   format    (s/maybe (s/enum "json"))
   maxheight (s/maybe su/IntString)
   maxwidth  (s/maybe su/IntString)}
  (let [height (if maxheight (Integer/parseInt maxheight) default-embed-max-height)
        width  (if maxwidth  (Integer/parseInt maxwidth)  default-embed-max-width)]
    {:version "1.0"
     :type    "rich"
     :width   width
     :height  height
     :html    (embed/iframe url width height)}))


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
  (let [card                 (api/check-404 (db/select-one [Card :dataset_query] :id card-id))
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
       (db/exists? Dimension :field_id field-id, :human_readable_field_id search-field-id)
       ;; just do a couple small queries to figure this out, we could write a fancy query to join Field against itself
       ;; and do this in one but the extra code complexity isn't worth it IMO
       (when-let [table-id (db/select-one-field :table_id Field :id field-id, :semantic_type (mdb.u/isa :type/PK))]
         (db/exists? Field :id search-field-id, :table_id table-id, :semantic_type (mdb.u/isa :type/Name))))))


(defn- check-field-is-referenced-by-dashboard
  "Check that `field-id` belongs to a Field that is used as a parameter in a Dashboard with `dashboard-id`, or throw a
  404 Exception."
  [field-id dashboard-id]
  (let [param-field-ids (params/dashboard->param-field-ids (api/check-404 (db/select-one Dashboard :id dashboard-id)))]
    (api/check-404 (contains? param-field-ids field-id))))

(defn card-and-field-id->values
  "Return the FieldValues for a Field with `field-id` that is referenced by Card with `card-id`."
  [card-id field-id]
  (check-field-is-referenced-by-card field-id card-id)
  (api.field/field->values (db/select-one Field :id field-id)))

(api/defendpoint GET "/card/:uuid/field/:field-id/values"
  "Fetch FieldValues for a Field that is referenced by a public Card."
  [uuid field-id]
  (validation/check-public-sharing-enabled)
  (let [card-id (db/select-one-id Card :public_uuid uuid, :archived false)]
    (card-and-field-id->values card-id field-id)))

(defn dashboard-and-field-id->values
  "Return the FieldValues for a Field with `field-id` that is referenced by Card with `card-id` which itself is present
  in Dashboard with `dashboard-id`."
  [dashboard-id field-id]
  (check-field-is-referenced-by-dashboard field-id dashboard-id)
  (api.field/field->values (db/select-one Field :id field-id)))

(api/defendpoint GET "/dashboard/:uuid/field/:field-id/values"
  "Fetch FieldValues for a Field that is referenced by a Card in a public Dashboard."
  [uuid field-id]
  (validation/check-public-sharing-enabled)
  (let [dashboard-id (api/check-404 (db/select-one-id Dashboard :public_uuid uuid, :archived false))]
    (dashboard-and-field-id->values dashboard-id field-id)))


;;; --------------------------------------------------- Searching ----------------------------------------------------

(defn search-card-fields
  "Wrapper for `metabase.api.field/search-values` for use with public/embedded Cards. See that functions
  documentation for a more detailed explanation of exactly what this does."
  [card-id field-id search-id value limit]
  (check-field-is-referenced-by-card field-id card-id)
  (check-search-field-is-allowed field-id search-id)
  (api.field/search-values (db/select-one Field :id field-id) (db/select-one Field :id search-id) value limit))

(defn search-dashboard-fields
  "Wrapper for `metabase.api.field/search-values` for use with public/embedded Dashboards. See that functions
  documentation for a more detailed explanation of exactly what this does."
  [dashboard-id field-id search-id value limit]
  (check-field-is-referenced-by-dashboard field-id dashboard-id)
  (check-search-field-is-allowed field-id search-id)
  (api.field/search-values (db/select-one Field :id field-id) (db/select-one Field :id search-id) value limit))

(api/defendpoint GET "/card/:uuid/field/:field-id/search/:search-field-id"
  "Search for values of a Field that is referenced by a public Card."
  [uuid field-id search-field-id value limit]
  {value su/NonBlankString
   limit (s/maybe su/IntStringGreaterThanZero)}
  (validation/check-public-sharing-enabled)
  (let [card-id (db/select-one-id Card :public_uuid uuid, :archived false)]
    (search-card-fields card-id field-id search-field-id value (when limit (Integer/parseInt limit)))))

(api/defendpoint GET "/dashboard/:uuid/field/:field-id/search/:search-field-id"
  "Search for values of a Field that is referenced by a Card in a public Dashboard."
  [uuid field-id search-field-id value limit]
  {value su/NonBlankString
   limit (s/maybe su/IntStringGreaterThanZero)}
  (validation/check-public-sharing-enabled)
  (let [dashboard-id (api/check-404 (db/select-one-id Dashboard :public_uuid uuid, :archived false))]
    (search-dashboard-fields dashboard-id field-id search-field-id value (when limit (Integer/parseInt limit)))))


;;; --------------------------------------------------- Remappings ---------------------------------------------------

(defn- field-remapped-values [field-id remapped-field-id, ^String value-str]
  (let [field          (api/check-404 (db/select-one Field :id field-id))
        remapped-field (api/check-404 (db/select-one Field :id remapped-field-id))]
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
  {value su/NonBlankString}
  (validation/check-public-sharing-enabled)
  (let [card-id (api/check-404 (db/select-one-id Card :public_uuid uuid, :archived false))]
    (card-field-remapped-values card-id field-id remapped-id value)))

(api/defendpoint GET "/dashboard/:uuid/field/:field-id/remapping/:remapped-id"
  "Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with public
  Dashboards."
  [uuid field-id remapped-id value]
  {value su/NonBlankString}
  (validation/check-public-sharing-enabled)
  (let [dashboard-id (db/select-one-id Dashboard :public_uuid uuid, :archived false)]
    (dashboard-field-remapped-values dashboard-id field-id remapped-id value)))

;;; ------------------------------------------------ Chain Filtering -------------------------------------------------

(api/defendpoint GET "/dashboard/:uuid/params/:param-key/values"
  "Fetch filter values for dashboard parameter `param-key`."
  [uuid param-key :as {:keys [query-params]}]
  (let [dashboard (dashboard-with-uuid uuid)]
    (binding [api/*current-user-permissions-set* (atom #{"/"})]
      (api.dashboard/chain-filter dashboard param-key query-params))))

(api/defendpoint GET "/dashboard/:uuid/params/:param-key/search/:query"
  "Fetch filter values for dashboard parameter `param-key`, containing specified `query`."
  [uuid param-key query :as {:keys [query-params]}]
  (let [dashboard (dashboard-with-uuid uuid)]
    (binding [api/*current-user-permissions-set* (atom #{"/"})]
      (api.dashboard/chain-filter dashboard param-key query-params query))))

;;; ----------------------------------------------------- Pivot Tables -----------------------------------------------

;; TODO -- why do these endpoints START with `/pivot/` whereas the version in Dash
(api/defendpoint ^:streaming GET "/pivot/card/:uuid/query"
  "Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled."
  [uuid parameters]
  {parameters (s/maybe su/JSONString)}
  (run-query-for-card-with-public-uuid-async uuid :api (json/parse-string parameters keyword) :qp-runner qp.pivot/run-pivot-query))

(api/defendpoint ^:streaming GET "/pivot/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results for a Card in a publicly-accessible Dashboard. Does not require auth credentials. Public
   sharing must be enabled."
  [uuid card-id dashcard-id parameters]
  {parameters (s/maybe su/JSONString)}
  (validation/check-public-sharing-enabled)
  (let [dashboard-id (api/check-404 (db/select-one-id Dashboard :public_uuid uuid, :archived false))]
    (public-dashcard-results-async
     :dashboard-id  dashboard-id
     :card-id       card-id
     :dashcard-id   dashcard-id
     :export-format :api
     :parameters    parameters :qp-runner qp.pivot/run-pivot-query)))

;;; ----------------------------------------- Route Definitions & Complaints -----------------------------------------

;; TODO - why don't we just make these routes have a bit of middleware that includes the
;; `validation/check-public-sharing-enabled` check in each of them? That way we don't need to remember to include the line in
;; every single endpoint definition here? Wouldn't that be 100x better?!
;;
;; TODO - also a smart person would probably just parse the UUIDs automatically in middleware as appropriate for
;;`/dashboard` vs `/card`
(api/define-routes)
