(ns metabase.api.public
  "Metabase API endpoints for viewing publically-accessible Cards and Dashboards."
  (:require [cheshire.core :as json]
            [compojure.core :refer [GET]]
            [schema.core :as s]
            (toucan [db :as db]
                    [hydrate :refer [hydrate]])
            (metabase.api [card :as card-api]
                          [common :as api]
                          [dataset :as dataset-api])
            (metabase.models [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard]]
                             [dashboard-card-series :refer [DashboardCardSeries]]
                             [field-values :refer [FieldValues]])
            [metabase.public-settings :as public-settings]
            [metabase.query-processor :as qp]
            (metabase.query-processor [expand :as ql]
                                      interface)
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [metabase.util.embed :as embed])
  (:import metabase.query_processor.interface.FieldPlaceholder))

(def ^:private ^:const ^Integer default-embed-max-height 800)
(def ^:private ^:const ^Integer default-embed-max-width 1024)


;;; ------------------------------------------------------------ Public Cards ------------------------------------------------------------

(defn- remove-card-non-public-fields
  "Remove everyting from public CARD that shouldn't be visible to the general public."
  [card]
  (u/select-nested-keys card [:id :name :description :display :visualization_settings [:dataset_query :type [:native :template_tags]]]))

(defn public-card
  "Return a public Card matching key-value CONDITIONS, removing all fields that should not be visible to the general public.
   Throws a 404 if the Card doesn't exist."
  [& conditions]
  (-> (api/check-404 (apply db/select-one [Card :id :dataset_query :description :display :name :visualization_settings], :archived false, conditions))
      remove-card-non-public-fields))

(defn- card-with-uuid [uuid] (public-card :public_uuid uuid))

(api/defendpoint GET "/card/:uuid"
  "Fetch a publically-accessible Card an return query results as well as `:card` information. Does not require auth credentials. Public sharing must be enabled."
  [uuid]
  (api/check-public-sharing-enabled)
  (card-with-uuid uuid))



(defn run-query-for-card-with-id
  "Run the query belonging to Card with CARD-ID with PARAMETERS and other query options (e.g. `:constraints`)."
  [card-id parameters & options]
  (u/prog1 (-> (let [parameters (if (string? parameters) (json/parse-string parameters keyword) parameters)]
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
  "Fetch a publically-accessible Card an return query results as well as `:card` information. Does not require auth credentials. Public sharing must be enabled."
  [uuid parameters]
  {parameters (s/maybe su/JSONString)}
  (run-query-for-card-with-public-uuid uuid parameters))

(api/defendpoint GET "/card/:uuid/query/json"
  "Fetch a publically-accessible Card and return query results as JSON. Does not require auth credentials. Public sharing must be enabled."
  [uuid parameters]
  {parameters (s/maybe su/JSONString)}
  (dataset-api/as-json (run-query-for-card-with-public-uuid uuid parameters, :constraints nil)))

(api/defendpoint GET "/card/:uuid/query/csv"
  "Fetch a publically-accessible Card and return query results as CSV. Does not require auth credentials. Public sharing must be enabled."
  [uuid parameters]
  {parameters (s/maybe su/JSONString)}
  (dataset-api/as-csv (run-query-for-card-with-public-uuid uuid parameters, :constraints nil)))


;;; ------------------------------------------------------------ Public Dashboards ------------------------------------------------------------

;; TODO - This logic seems too complicated for a one-off custom response format. Simplification would be nice, as would potentially
;;        moving some of this logic into a shared module

(defn- field-form->id
  "Expand a `field-id` or `fk->` FORM and return the ID of the Field it references.

     (field-form->id [:field-id 100])  ; -> 100"
  [field-form]
  (when-let [field-placeholder (u/ignore-exceptions (ql/expand-ql-sexpr field-form))]
    (when (instance? FieldPlaceholder field-placeholder)
      (:field-id field-placeholder))))

(defn- template-tag->field-form
  "Fetch the `field-id` or `fk->` form from DASHCARD referenced by TEMPLATE-TAG.

     (template-tag->field-form [:template-tag :company] some-dashcard) ; -> [:field-id 100]"
  [[_ tag] dashcard]
  (get-in dashcard [:card :dataset_query :native :template_tags (keyword tag) :dimension]))

(defn- param-target->field-id
  "Parse a Card parameter TARGET form, which looks something like `[:dimension [:field-id 100]]`, and return the Field ID
   it references (if any)."
  [target dashcard]
  (when (ql/is-clause? :dimension target)
    (let [[_ dimension] target]
      (field-form->id (if (ql/is-clause? :template-tag dimension)
                        (template-tag->field-form dimension dashcard)
                        dimension)))))

(defn- dashboard->param-field-ids
  "Return a set of Field IDs referenced by parameters in Cards in this DASHBOARD, or `nil` if none are referenced."
  [dashboard]
  (when-let [ids (seq (for [dashcard (:ordered_cards dashboard)
                            param    (:parameter_mappings dashcard)
                            :let     [field-id (param-target->field-id (:target param) dashcard)]
                            :when    field-id]
                        field-id))]
    (set ids)))

(defn- dashboard->param-field-values
  "Return a map of Field ID to FieldValues (if any) for any Fields referenced by Cards in DASHBOARD,
   or `nil` if none are referenced or none of them have FieldValues."
  [dashboard]
  (when-let [param-field-ids (dashboard->param-field-ids dashboard)]
    (u/key-by :field_id (db/select [FieldValues :values :human_readable_values :field_id]
                          :field_id [:in param-field-ids]))))

(defn- add-field-values-for-parameters
  "Add a `:param_values` map containing FieldValues for the parameter Fields in the DASHBOARD."
  [dashboard]
  (assoc dashboard :param_values (dashboard->param-field-values dashboard)))

(defn public-dashboard
  "Return a public Dashboard matching key-value CONDITIONS, removing all fields that should not be visible to the general public.
   Throws a 404 if the Dashboard doesn't exist."
  [& conditions]
  (-> (api/check-404 (apply db/select-one [Dashboard :name :description :id :parameters] conditions))
      (hydrate [:ordered_cards :card :series])
      add-field-values-for-parameters
      (update :ordered_cards (fn [dashcards]
                               (for [dashcard dashcards]
                                 (-> (select-keys dashcard [:id :card :card_id :dashboard_id :series :col :row :sizeX :sizeY :parameter_mappings :visualization_settings])
                                     (update :card remove-card-non-public-fields)
                                     (update :series (fn [series]
                                                       (for [series series]
                                                         (remove-card-non-public-fields series))))))))))

(defn- dashboard-with-uuid [uuid] (public-dashboard :public_uuid uuid))

(api/defendpoint GET "/dashboard/:uuid"
  "Fetch a publically-accessible Dashboard. Does not require auth credentials. Public sharing must be enabled."
  [uuid]
  (api/check-public-sharing-enabled)
  (dashboard-with-uuid uuid))


(defn public-dashcard-results
  "Return the results of running a query with PARAMETERS for Card with CARD-ID belonging to Dashboard with DASHBOARD-ID.
   Throws a 404 if the Card isn't part of the Dashboard."
  [dashboard-id card-id parameters & {:keys [context]
                                      :or   {context :public-dashboard}}]
  (api/check-404 (or (db/exists? DashboardCard
                       :dashboard_id dashboard-id
                       :card_id      card-id)
                     (when-let [dashcard-ids (db/select-ids DashboardCard :dashboard_id dashboard-id)]
                       (db/exists? DashboardCardSeries
                         :card_id          card-id
                         :dashboardcard_id [:in dashcard-ids]))))
  (run-query-for-card-with-id card-id parameters, :context context, :dashboard-id dashboard-id))

(api/defendpoint GET "/dashboard/:uuid/card/:card-id"
  "Fetch the results for a Card in a publically-accessible Dashboard. Does not require auth credentials. Public sharing must be enabled."
  [uuid card-id parameters]
  {parameters (s/maybe su/JSONString)}
  (api/check-public-sharing-enabled)
  (public-dashcard-results (api/check-404 (db/select-one-id Dashboard :public_uuid uuid)) card-id parameters))


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


(api/define-routes)
