(ns metabase.api.public
  "Metabase API endpoints for viewing publicly-accessible Cards and Dashboards."
  (:require [cheshire.core :as json]
            [clojure.walk :as walk]
            [compojure.core :refer [GET]]
            [medley.core :as m]
            [metabase
             [db :as mdb]
             [query-processor :as qp]
             [util :as u]]
            [metabase.api
             [card :as card-api]
             [common :as api]
             [dashboard :as dashboard-api]
             [dataset :as dataset-api]
             [field :as field-api]]
            [metabase.models
             [card :as card :refer [Card]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [dashboard-card-series :refer [DashboardCardSeries]]
             [dimension :refer [Dimension]]
             [field :refer [Field]]
             [params :as params]]
            [metabase.util
             [embed :as embed]
             [schema :as su]]
            [puppetlabs.i18n.core :refer [tru]]
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
  (card/map->CardInstance
   (u/select-nested-keys card [:id :name :description :display :visualization_settings
                               [:dataset_query :type [:native :template_tags]]])))

(defn public-card
  "Return a public Card matching key-value CONDITIONS, removing all columns that should not be visible to the general
   public. Throws a 404 if the Card doesn't exist."
  [& conditions]
  (-> (api/check-404 (apply db/select-one [Card :id :dataset_query :description :display :name :visualization_settings]
                            :archived false, conditions))
      remove-card-non-public-columns
      (hydrate :param_values :param_fields)))

(defn- card-with-uuid [uuid] (public-card :public_uuid uuid))

(api/defendpoint GET "/card/:uuid"
  "Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled."
  [uuid]
  (api/check-public-sharing-enabled)
  (card-with-uuid uuid))

(defn run-query-for-card-with-id
  "Run the query belonging to Card with CARD-ID with PARAMETERS and other query options (e.g. `:constraints`)."
  {:style/indent 2}
  [card-id parameters & options]
  (u/prog1 (-> ;; run this query with full superuser perms
            (binding [api/*current-user-permissions-set*     (atom #{"/"})
                      qp/*allow-queries-with-no-executor-id* true]
              (apply card-api/run-query-for-card card-id, :parameters parameters, :context :public-question, options))
            (u/select-nested-keys [[:data :columns :cols :rows :rows_truncated] [:json_query :parameters] :error :status]))
    ;; if the query failed instead of returning anything about the query just return a generic error message
    (when (= (:status <>) :failed)
      (throw (ex-info "An error occurred while running the query." {:status-code 400})))))

(defn- run-query-for-card-with-public-uuid
  "Run query for a *public* Card with UUID. If public sharing is not enabled, this throws an exception."
  [uuid parameters & options]
  (api/check-public-sharing-enabled)
  (apply run-query-for-card-with-id
         (api/check-404 (db/select-one-id Card :public_uuid uuid, :archived false))
         parameters
         options))


(api/defendpoint GET "/card/:uuid/query"
  "Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled."
  [uuid parameters]
  {parameters (s/maybe su/JSONString)}
  (run-query-for-card-with-public-uuid uuid (json/parse-string parameters keyword)))

(api/defendpoint GET "/card/:uuid/query/:export-format"
  "Fetch a publicly-accessible Card and return query results in the specified format. Does not require auth
   credentials. Public sharing must be enabled."
  [uuid export-format parameters]
  {parameters    (s/maybe su/JSONString)
   export-format dataset-api/ExportFormat}
  (dataset-api/as-format export-format
    (run-query-for-card-with-public-uuid uuid (json/parse-string parameters keyword), :constraints nil)))



;;; ----------------------------------------------- Public Dashboards ------------------------------------------------

(defn public-dashboard
  "Return a public Dashboard matching key-value CONDITIONS, removing all columns that should not be visible to the
   general public. Throws a 404 if the Dashboard doesn't exist."
  [& conditions]
  (-> (api/check-404 (apply db/select-one [Dashboard :name :description :id :parameters], :archived false, conditions))
      (hydrate [:ordered_cards :card :series] :param_values :param_fields)
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

(defn- dashboard->dashcard-param-mappings
  "Get a sequence of all the `:parameter_mappings` for all the DashCards in this `dashboard-or-id`."
  [dashboard-or-id]
  (for [params (db/select-field :parameter_mappings DashboardCard
                 :dashboard_id (u/get-id dashboard-or-id))
        param  params
        :when  (:parameter_id param)]
    param))

(defn- matching-dashboard-param-with-target
  "Find an entry in `dashboard-params` that matches `target`, if one exists. Since `dashboard-params` do not themselves
  have targets they are matched via the `dashcard-param-mappings` for the Dashboard. See `resolve-params` below for
  more details."
  [dashboard-params dashcard-param-mappings target]
  (some (fn [{id :parameter_id, :as param-mapping}]
          (when (= target (:target param-mapping))
            ;; ...and once we find that, try to find a Dashboard `:parameters`
            ;; entry with the same ID...
            (m/find-first #(= (:id %) id)
                          dashboard-params)))
        dashcard-param-mappings))

(s/defn ^:private resolve-params :- (s/maybe [{s/Keyword s/Any}])
  "Resolve the parmeters passed in to the API (`query-params`) and make sure they're actual valid parameters the
  Dashboard with `dashboard-id`. This is done to prevent people from adding in parameters that aren't actually present
  on the Dashboard. When successful, this will return a merged sequence based on the original `dashboard-params`, but
  including the `:value` from the appropriate query-param.

  The way we pass in parameters is complicated and silly: for public Dashboards, they're passed in as JSON-encoded
  parameters that look something like (when decoded):

      [{:type :category, :target [:variable [:template-tag :num]], :value \"50\"}]

  For embedded Dashboards they're simply passed in as query parameters, e.g.

      [{:num 50}]

  Thus resolving the params has to take either format into account. To further complicate matters, a Dashboard's
  `:parameters` column contains values that look something like:

       [{:name \"Num\", :slug \"num\", :id \"537e37b4\", :type \"category\"}

  This is sufficient to resolve slug-style params passed in to embedded Dashboards, but URL-encoded params for public
  Dashboards do not have anything that can directly match them to a Dashboard `:parameters` entry. However, they
  already have enough information for the query processor to handle resolving them itself; thus we simply need to make
  sure these params are actually allowed to be used on the Dashboard. To do this, we can match them against the
  `:parameter_mappings` for the Dashboard's DashboardCards, which look like:

      [{:card_id 1, :target [:variable [:template-tag :num]], :parameter_id \"537e37b4\"}]

  Thus for public Dashboards JSON-encoded style we can look for a matching Dashcard parameter mapping, based on
  `:target`, and then find the matching Dashboard parameter, based on `:id`.

  *Cries*

  TODO -- Tom has mentioned this, and he is very correct -- our lives would be much easier if we just used slug-style
  for everything, rather than the weird JSON-encoded format we use for public Dashboards. We should fix this!"
  [dashboard-id :- su/IntGreaterThanZero, query-params :- (s/maybe [{s/Keyword s/Any}])]
  (when (seq query-params)
    (let [dashboard-params        (db/select-one-field :parameters Dashboard, :id dashboard-id)
          slug->dashboard-param   (u/key-by :slug dashboard-params)
          dashcard-param-mappings (dashboard->dashcard-param-mappings dashboard-id)]
      (for [{slug :slug, target :target, :as query-param} query-params
            :let [dashboard-param
                  (or
                   ;; try to match by slug...
                   (slug->dashboard-param slug)
                   ;; ...if that fails, try to find a DashboardCard param mapping with the same target...
                   (matching-dashboard-param-with-target dashboard-params dashcard-param-mappings target)
                   ;; ...but if we *still* couldn't find a match, throw an Exception, because we don't want people
                   ;; trying to inject new params
                   (throw (Exception. (str (tru "Invalid param: {0}" slug)))))]]
        (merge query-param dashboard-param)))))

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
  (run-query-for-card-with-id card-id (resolve-params dashboard-id (if (string? parameters)
                                                                     (json/parse-string parameters keyword)
                                                                     parameters))
    :context context, :dashboard-id dashboard-id))

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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        FieldValues, Search, Remappings                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; -------------------------------------------------- Field Values --------------------------------------------------

;; TODO - this is a stupid, inefficient way of doing things. Figure out a better way to do it. :(
(defn- query->referenced-field-ids
  "Get the IDs of all Fields referenced by an MBQL `query` (not including any parameters)."
  [query]
  (let [field-ids (atom [])]
    (walk/postwalk
     (fn [x]
       (if (instance? metabase.query_processor.interface.Field x)
         (swap! field-ids conj (:field-id x))
         x))
     (qp/expand query))
    @field-ids))

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
       (when-let [table-id (db/select-one-field :table_id Field :id field-id, :special_type (mdb/isa :type/PK))]
         (db/exists? Field :id search-field-id, :table_id table-id, :special_type (mdb/isa :type/Name))))))


(defn- check-field-is-referenced-by-dashboard
  "Check that `field-id` belongs to a Field that is used as a parameter in a Dashboard with `dashboard-id`, or throw a
  404 Exception."
  [field-id dashboard-id]
  (let [param-field-ids (params/dashboard->param-field-ids (api/check-404 (Dashboard dashboard-id)))]
    (api/check-404 (contains? param-field-ids field-id))))

(defn card-and-field-id->values
  "Return the FieldValues for a Field with `field-id` that is referenced by Card with `card-id`."
  [card-id field-id]
  (check-field-is-referenced-by-card field-id card-id)
  (field-api/field->values (Field field-id)))

(api/defendpoint GET "/card/:uuid/field/:field-id/values"
  "Fetch FieldValues for a Field that is referenced by a public Card."
  [uuid field-id]
  (api/check-public-sharing-enabled)
  (let [card-id (db/select-one-id Card :public_uuid uuid, :archived false)]
    (card-and-field-id->values card-id field-id)))

(defn dashboard-and-field-id->values
  "Return the FieldValues for a Field with `field-id` that is referenced by Card with `card-id` which itself is present
  in Dashboard with `dashboard-id`."
  [dashboard-id field-id]
  (check-field-is-referenced-by-dashboard field-id dashboard-id)
  (field-api/field->values (Field field-id)))

(api/defendpoint GET "/dashboard/:uuid/field/:field-id/values"
  "Fetch FieldValues for a Field that is referenced by a Card in a public Dashboard."
  [uuid field-id]
  (api/check-public-sharing-enabled)
  (let [dashboard-id (api/check-404 (db/select-one-id Dashboard :public_uuid uuid, :archived false))]
    (dashboard-and-field-id->values dashboard-id field-id)))


;;; --------------------------------------------------- Searching ----------------------------------------------------

(defn search-card-fields
  "Wrapper for `metabase.api.field/search-values` for use with public/embedded Cards. See that functions
  documentation for a more detailed explanation of exactly what this does."
  [card-id field-id search-id value limit]
  (check-field-is-referenced-by-card field-id card-id)
  (check-search-field-is-allowed field-id search-id)
  (field-api/search-values (Field field-id) (Field search-id) value limit))

(defn search-dashboard-fields
  "Wrapper for `metabase.api.field/search-values` for use with public/embedded Dashboards. See that functions
  documentation for a more detailed explanation of exactly what this does."
  [dashboard-id field-id search-id value limit]
  (check-field-is-referenced-by-dashboard field-id dashboard-id)
  (check-search-field-is-allowed field-id search-id)
  (field-api/search-values (Field field-id) (Field search-id) value limit))

(api/defendpoint GET "/card/:uuid/field/:field-id/search/:search-field-id"
  "Search for values of a Field that is referenced by a public Card."
  [uuid field-id search-field-id value limit]
  {value su/NonBlankString
   limit (s/maybe su/IntStringGreaterThanZero)}
  (api/check-public-sharing-enabled)
  (let [card-id (db/select-one-id Card :public_uuid uuid, :archived false)]
    (search-card-fields card-id field-id search-field-id value (when limit (Integer/parseInt limit)))))

(api/defendpoint GET "/dashboard/:uuid/field/:field-id/search/:search-field-id"
  "Search for values of a Field that is referenced by a Card in a public Dashboard."
  [uuid field-id search-field-id value limit]
  {value su/NonBlankString
   limit (s/maybe su/IntStringGreaterThanZero)}
  (api/check-public-sharing-enabled)
  (let [dashboard-id (api/check-404 (db/select-one-id Dashboard :public_uuid uuid, :archived false))]
    (search-dashboard-fields dashboard-id field-id search-field-id value (when limit (Integer/parseInt limit)))))


;;; --------------------------------------------------- Remappings ---------------------------------------------------

(defn- field-remapped-values [field-id remapped-field-id, ^String value-str]
  (let [field          (api/check-404 (Field field-id))
        remapped-field (api/check-404 (Field remapped-field-id))]
    (check-search-field-is-allowed field-id remapped-field-id)
    (field-api/remapped-value field remapped-field (field-api/parse-query-param-value-for-field field value-str))))

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
  (api/check-public-sharing-enabled)
  (let [card-id (api/check-404 (db/select-one-id Card :public_uuid uuid, :archived false))]
    (card-field-remapped-values card-id field-id remapped-id value)))

(api/defendpoint GET "/dashboard/:uuid/field/:field-id/remapping/:remapped-id"
  "Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with public
  Dashboards."
  [uuid field-id remapped-id value]
  {value su/NonBlankString}
  (api/check-public-sharing-enabled)
  (let [dashboard-id (db/select-one-id Dashboard :public_uuid uuid, :archived false)]
    (dashboard-field-remapped-values dashboard-id field-id remapped-id value)))


;;; ----------------------------------------- Route Definitions & Complaints -----------------------------------------

;; TODO - why don't we just make these routes have a bit of middleware that includes the
;; `api/check-public-sharing-enabled` check in each of them? That way we don't need to remember to include the line in
;; every single endpoint definition here? Wouldn't that be 100x better?!
;;
;; TODO - also a smart person would probably just parse the UUIDs automatically in middleware as appropriate for
;;`/dashboard` vs `/card`
(api/define-routes)
