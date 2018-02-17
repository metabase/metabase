(ns metabase.api.public
  "Metabase API endpoints for viewing publicly-accessible Cards and Dashboards."
  (:require [cheshire.core :as json]
            [clojure.walk :as walk]
            [compojure.core :refer [GET]]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.api
             [card :as card-api]
             [common :as api]
             [dataset :as dataset-api]
             [dashboard :as dashboard-api]
             [field :as field-api]]
            [metabase.models
             [card :refer [Card]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [dashboard-card-series :refer [DashboardCardSeries]]
             [field :refer [Field]]
             [field-values :refer [FieldValues]]
             [params :as params]]
            [metabase.query-processor :as qp]
            metabase.query-processor.interface ; because we refer to Field
            [metabase.util
             [embed :as embed]
             [schema :as su]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(def ^:private ^:const ^Integer default-embed-max-height 800)
(def ^:private ^:const ^Integer default-embed-max-width 1024)


;;; -------------------------------------------------- Public Cards --------------------------------------------------

(defn- remove-card-non-public-columns
  "Remove everyting from public CARD that shouldn't be visible to the general public."
  [card]
  (u/select-nested-keys card [:id :name :description :display :visualization_settings [:dataset_query :type [:native :template_tags]]]))

(defn public-card
  "Return a public Card matching key-value CONDITIONS, removing all columns that should not be visible to the general
   public. Throws a 404 if the Card doesn't exist."
  [& conditions]
  (-> (api/check-404 (apply db/select-one [Card :id :dataset_query :description :display :name :visualization_settings]
                            :archived false, conditions))
      remove-card-non-public-columns
      params/add-card-param-values))

(defn- card-with-uuid [uuid] (public-card :public_uuid uuid))

(api/defendpoint GET "/card/:uuid"
  "Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled."
  [uuid]
  (api/check-public-sharing-enabled)
  (card-with-uuid uuid))


(defn run-query-for-card-with-id
  "Run the query belonging to Card with CARD-ID with PARAMETERS and other query options (e.g. `:constraints`)."
  [card-id parameters & options]
  (u/prog1 (-> (let [parameters (if (string? parameters) (json/parse-string parameters keyword) parameters)]
                 ;; run this query with full superuser perms
                 (binding [api/*current-user-permissions-set*     (atom #{"/"})
                           qp/*allow-queries-with-no-executor-id* true]
                   (apply card-api/run-query-for-card card-id, :parameters parameters, :context :public-question, options)))
               (u/select-nested-keys [[:data :columns :cols :rows :rows_truncated] [:json_query :parameters] :error :status]))
    ;; if the query failed instead of returning anything about the query just return a generic error message
    (when (= (:status <>) :failed)
      (throw (ex-info "An error occurred while running the query." {:status-code 400})))))

(defn- run-query-for-card-with-public-uuid
  "Run query for a *public* Card with UUID. If public sharing is not enabled, this throws an exception."
  [uuid parameters & options]
  (api/check-public-sharing-enabled)
  (apply run-query-for-card-with-id (api/check-404 (db/select-one-id Card :public_uuid uuid, :archived false)) parameters options))


(api/defendpoint GET "/card/:uuid/query"
  "Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled."
  [uuid parameters]
  {parameters (s/maybe su/JSONString)}
  (run-query-for-card-with-public-uuid uuid parameters))

(api/defendpoint GET "/card/:uuid/query/:export-format"
  "Fetch a publicly-accessible Card and return query results in the specified format. Does not require auth
   credentials. Public sharing must be enabled."
  [uuid export-format parameters]
  {parameters    (s/maybe su/JSONString)
   export-format dataset-api/ExportFormat}
  (dataset-api/as-format export-format
    (run-query-for-card-with-public-uuid uuid parameters, :constraints nil)))

;;; ----------------------------------------------- Public Dashboards ------------------------------------------------

(defn public-dashboard
  "Return a public Dashboard matching key-value CONDITIONS, removing all columns that should not be visible to the
   general public. Throws a 404 if the Dashboard doesn't exist."
  [& conditions]
  (-> (api/check-404 (apply db/select-one [Dashboard :name :description :id :parameters], :archived false, conditions))
      (hydrate [:ordered_cards :card :series])
      params/add-field-values-for-parameters
      dashboard-api/add-query-average-durations
      (update :ordered_cards (fn [dashcards]
                               (for [dashcard dashcards]
                                 (-> (select-keys dashcard [:id :card :card_id :dashboard_id :series :col :row :sizeX
                                                            :sizeY :parameter_mappings :visualization_settings])
                                     (update :card remove-card-non-public-columns)
                                     (update :series (fn [series]
                                                       (for [series series]
                                                         (remove-card-non-public-columns series))))))))))

(defn- dashboard-with-uuid [uuid] (public-dashboard :public_uuid uuid))

(api/defendpoint GET "/dashboard/:uuid"
  "Fetch a publicly-accessible Dashboard. Does not require auth credentials. Public sharing must be enabled."
  [uuid]
  (api/check-public-sharing-enabled)
  (dashboard-with-uuid uuid))

(defn- check-card-is-in-dashboard
  "Check that the Card with `card-id` is in Dashboard with `dashboard-id`, either in a DashboardCard at the top level or
  as a series, or throw an Exception. If not such relationship exists this will throw a 404 Exception."
  [card-id dashboard-id]
  (api/check-404
   (or (db/exists? DashboardCard
         :dashboard_id dashboard-id
         :card_id      card-id)
       (when-let [dashcard-ids (db/select-ids DashboardCard :dashboard_id dashboard-id)]
         (db/exists? DashboardCardSeries
           :card_id          card-id
           :dashboardcard_id [:in dashcard-ids])))))

(defn public-dashcard-results
  "Return the results of running a query with PARAMETERS for Card with CARD-ID belonging to Dashboard with
   DASHBOARD-ID. Throws a 404 if the Card isn't part of the Dashboard."
  [dashboard-id card-id parameters & {:keys [context]
                                      :or   {context :public-dashboard}}]
  (check-card-is-in-dashboard card-id dashboard-id)
  (run-query-for-card-with-id card-id parameters, :context context, :dashboard-id dashboard-id))

(api/defendpoint GET "/dashboard/:uuid/card/:card-id"
  "Fetch the results for a Card in a publicly-accessible Dashboard. Does not require auth credentials. Public
   sharing must be enabled."
  [uuid card-id parameters]
  {parameters (s/maybe su/JSONString)}
  (api/check-public-sharing-enabled)
  (public-dashcard-results
   (api/check-404 (db/select-one-id Dashboard :public_uuid uuid, :archived false)) card-id parameters))


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


;;; -------------------------------------------- Field Values & Searching --------------------------------------------

;; TODO - this is a stupid, inefficient way of doing things. Figure out a better way to do it. :(
(defn- query->referenced-field-ids
  "Get the IDs of all Fields referenced by `query`."
  [query]
  (let [field-ids (atom #{})]
    (walk/postwalk
     (fn [x]
       (if (instance? metabase.query_processor.interface.Field x)
         (swap! field-ids conj (:field-id x))
         x))
     (qp/expand query))
    @field-ids))

(defn- check-field-is-referenced-by-card
  "Check to make sure the query for Card with `card-id` references Field with `field-id`. Otherwise, or if the Card
  cannot be found, throw an Exception."
  [field-id card-id]
  (let [query                 (api/check-404 (db/select-one-field :dataset_query Card :id card-id))
        referenced-fields-ids (query->referenced-field-ids query)]
    (api/check-404 (contains? referenced-fields-ids field-id))))

(defn card-and-field-id->values
  "Return the FieldValues for a Field with `field-id` that is referenced by Card with `card-id`."
  [card-id field-id]
  (check-field-is-referenced-by-card field-id card-id)
  (field-api/field->values (Field field-id)))

(api/defendpoint GET "/card/:card-uuid/field/:field-id/values"
  "Fetch FieldValues for a Field that is referenced by a public Card."
  [card-uuid field-id]
  (api/check-public-sharing-enabled)
  (let [card-id (db/select-one-id Card :public_uuid card-uuid, :archived false)]
    (card-and-field-id->values card-id field-id)))

(defn dashboard-card-and-field-id->values
  "Return the FieldValues for a Field with `field-id` that is referenced by Card with `card-id` which itself is present
  in Dashboard with `dashboard-id`."
  [dashboard-id card-id field-id]
  (check-card-is-in-dashboard card-id dashboard-id)
  ;; TODO - actually I think only Fields in the filter clause should be elligible, right?
  (check-field-is-referenced-by-card field-id card-id)
  ;; TODO - do we need to check that the Field is marked `:list` as well, or will that not matter?
  (field-api/field->values (Field field-id)))

(api/defendpoint GET "/dashboard/:dashboard-uuid/card/:card-id/field/:field-id/values"
  "Fetch FieldValues for a Field that is referenced by a Card in a public Dashboard."
  [dashboard-uuid card-id field-id]
  (api/check-public-sharing-enabled)
  (let [dashboard-id (api/check-404 (db/select-one-id Dashboard :public_uuid dashboard-uuid, :archived false))]
    (dashboard-card-and-field-id->values dashboard-id card-id field-id)))


(defn search-card-fields
  "Wrapper for `metabase.api.field/search-values` for use with public/embedded Cards. See that functions
  documentation for a more detailed explanation of exactly what this does."
  [card-id field-id search-id value limit]
  (check-field-is-referenced-by-card field-id card-id)
  ;; TODO - is this check needed?
  (check-field-is-referenced-by-card search-id card-id)
  (field-api/search-values (Field field-id) (Field search-id) value limit))

(defn search-dashboard-card-fields
  "Wrapper for `metabase.api.field/search-values` for use with public/embedded Dashboards. See that functions
  documentation for a more detailed explanation of exactly what this does."
  [dashboard-id card-id field-id search-id value limit]
  (check-card-is-in-dashboard card-id dashboard-id)
  (search-card-fields card-id field-id search-id value limit))

(api/defendpoint GET "/card/:card-uuid/field/:field-id/search/:search-field-id"
  "Search for values of a Field that is referenced by a public Card."
  [card-uuid field-id search-field-id value limit]
  {value su/NonBlankString
   limit (s/maybe su/IntStringGreaterThanZero)}
  (api/check-public-sharing-enabled)
  (let [card-id (db/select-one-id Card :public_uuid card-uuid, :archived false)]
    (search-card-fields card-id field-id search-field-id value limit)))

(api/defendpoint GET "/dashboard/:dashboard-uuid/card/:card-id/field/:field-id/search/:search-field-id"
  "Search for values of a Field that is referenced by a Card in a public Dashboard."
  [dashboard-uuid card-id field-id search-field-id value limit]
  {value su/NonBlankString
   limit (s/maybe su/IntStringGreaterThanZero)}
  (api/check-public-sharing-enabled)
  (let [dashboard-id (api/check-404 (db/select-one-id Dashboard :public_uuid dashboard-uuid, :archived false))]
    (search-dashboard-card-fields dashboard-id card-id field-id search-field-id value limit)))


(api/define-routes)
