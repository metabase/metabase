(ns metabase.embedding-rest.api.common
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.database-routing.core :as database-routing]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.embedding.jwt :as embed]
   [metabase.embedding.validation :as embedding.validation]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.models.resolution :as models.resolution]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.parameters.dashboard :as parameters.dashboard]
   [metabase.parameters.params :as params]
   [metabase.public-sharing-rest.api :as api.public]
   [metabase.queries.core :as queries]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.parameters.operators :as params.ops]
   [metabase.request.core :as request]
   [metabase.tiles.api :as api.tiles]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def EncodedToken
  "Malli schema for a JWT token"
  [:string {:api/regex #"[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+=]*"}])

(def SearchParams
  "Malli schema for route params of search paths"
  [:map
   [:token EncodedToken]
   [:param-key ms/NonBlankString]
   [:prefix ms/NonBlankString]])

(def QueryParams
  "Malli schema for the raw query-string parameter map of the embed query and param-values endpoints: dashboard/card
  parameter slugs (or parameter IDs, for the param-values endpoints) mapped to values exactly as they come off the
  query string, plus the optional `:parameters` JSON blob (see [[parse-query-params]]). Keys that don't read cleanly
  as keywords (e.g. slugs starting with a digit) arrive as strings (see [[normalize-query-params]])."
  [:map-of [:or :keyword :string] [:maybe [:or :string [:sequential :string]]]])

(def ParsedQueryParams
  "Schema for [[QueryParams]] after the `:parameters` JSON blob has been decoded into real JSON scalars."
  [:map-of [:or :keyword :string] [:maybe [:ref ::lib.schema.parameter/parameter.value]]])

(comment
  ;; load dynamic model resolution code... should already be loaded by [[metabase.core.init]] so this is mostly here for
  ;; the benefit of tests
  models.resolution/keep-me)

(defn- valid-param-value?
  "Is V a valid param value? (If it is a String, is it non-blank?)"
  [v]
  (or (not (string? v))
      (not (str/blank? v))))

(defn- check-params-are-allowed
  "Check that the conditions specified by `object-embedding-params` are satisfied."
  [object-embedding-params token-params user-params]
  (let [all-params        (merge token-params user-params)
        duplicated-params (set/intersection (set (keys token-params)) (set (keys user-params)))]
    (doseq [[param status] object-embedding-params]
      (case status
        ;; disabled means a param is not allowed to be specified by either token or user
        "disabled" (api/check (not (contains? all-params param))
                              [400 (tru "You''re not allowed to specify a value for {0}." param)])
        ;; enabled means either JWT *or* user can specify the param, but not both. Param is *not* required
        "enabled"  (api/check (not (contains? duplicated-params param))
                              [400 (tru "You can''t specify a value for {0} if it''s already set in the JWT." param)])
        ;; locked means JWT must specify param
        "locked"   (api/check
                    (some? (get token-params param))    [400 (tru "You must specify a value for {0} in the JWT." param)]
                    (not (contains? user-params param)) [400 (tru "You can only specify a value for {0} in the JWT." param)])))))

(defn- check-params-exist
  "Make sure all the params specified are specified in `object-embedding-params`."
  [object-embedding-params all-params]
  (let [embedding-params (set (keys object-embedding-params))]
    (doseq [[k _] all-params]
      (api/check (contains? embedding-params k)
                 [400 (format "Unknown parameter %s." k)]))))

(defn- check-param-sets
  "Validate that sets of params passed as part of the JWT token and by the user (as query params, i.e. as part of the
  URL) are valid for the `object-embedding-params`. `token-params` and `user-params` should be sets of all valid param
  keys specified in the JWT or by the user, respectively."
  [object-embedding-params token-params user-params]
  ;; TODO - maybe make this log/debug once embedding is wrapped up
  (log/debug "Validating params for embedded object:\n"
             "object embedding params:" object-embedding-params
             "token params:"            token-params
             "user params:"             user-params)
  (check-params-are-allowed object-embedding-params token-params user-params)
  (check-params-exist object-embedding-params (merge token-params user-params)))

(defn check-embedding-enabled-for-object
  "Check that embedding is enabled, that the pre-loaded `object` exists, and embedding for `object` is enabled. Callers
  are responsible for selecting `object` (with at least `:enable_embedding` and `:archived`) exactly once per request
  and threading it here."
  [object]
  (embedding.validation/check-embedding-enabled)
  (api/check-404 object)
  (api/check-not-archived object)
  (api/check (:enable_embedding object)
             [400 (tru "Embedding is not enabled for this object.")]))

(def ^{:arglists '([card])} check-embedding-enabled-for-card
  "Runs check-embedding-enabled-for-object for a pre-loaded Card entity."
  check-embedding-enabled-for-object)

(def ^{:arglists '([dashboard])} check-embedding-enabled-for-dashboard
  "Runs check-embedding-enabled-for-object for a pre-loaded Dashboard entity."
  check-embedding-enabled-for-object)

(defn- resolve-card-parameters
  "Returns the combined `:parameters` (including template-tag parameters) for a pre-loaded `card` entity."
  [card]
  (-> card
      api.public/combine-parameters-and-template-tags
      :parameters))

(mu/defn- resolve-dashboard-parameters :- [:sequential [:map
                                                        [:id ms/NonBlankString]]]
  "Given a pre-loaded `dashboard` entity and parameters map in the format `slug->value`, return a sequence of
  parameters with `:id`s that can be passed to various functions in the [[metabase.dashboards-rest.api]] namespace such
  as [[metabase.dashboards-rest.api/process-query-for-dashcard]]."
  [dashboard   :- :map
   slug->value :- :map]
  (let [parameters (:parameters dashboard)
        slug->id (into {} (map (juxt :slug :id)) parameters)
        slug->type (into {} (map (juxt :slug :type)) parameters)]
    (vec (for [[slug value] slug->value
               :let [slug (u/qualified-name slug)
                     param-type (get slug->type slug)
                     default-options (params/param-type->default-options param-type)]]
           (cond-> {:slug slug
                    :id    (or (get slug->id slug)
                               (throw (ex-info (tru "No matching parameter with slug {0}. Found: {1}" (pr-str slug) (pr-str (keys slug->id)))
                                               {:status-code          400
                                                :slug                 slug
                                                :dashboard-parameters parameters})))
                    :value value}
             default-options (assoc :options default-options))))))

(mu/defn parse-query-params :- :map
  "Parses parameter values from the query string in a backward compatible way.

  Before (v50 and below) we passed parameter values as separate query string parameters \"?param1=A&param2=B\". The
  problem with this approach is that we cannot reliably distinguish between numbers and numeric strings, as well as
  booleans and boolean strings. To fix this issue we introduced another query string parameter `:parameters` which
  contains serialized JSON with parameter values. If this object cannot be found or parsed, we fallback to plain query
  string parameters."
  [query-params]
  (let [parsed (when-let [parameters (:parameters query-params)]
                 (try
                   (json/decode+kw parameters)
                   (catch Throwable _
                     nil)))]
    (when (and (some? parsed)
               (not (mr/validate ParsedQueryParams parsed)))
      (throw (ex-info (tru "Invalid parameter values") {:status-code 400})))
    (or parsed query-params {})))

(mu/defn normalize-query-params :- [:map-of :keyword :any]
  "Take a map of `query-params` and make sure they're in the right format for the rest of our code. Our
  `wrap-keyword-params` middleware normally converts all query params keys to keywords, but only if they seem like
  ones that make sense as keywords. Some params, such as ones that start with a number, do not pass this test, and are
  not automatically converted. Thus we must do it ourselves here to make sure things are done as we'd expect.
  Also, any param values that are blank strings should be parsed as nil, representing the absence of a value."
  [query-params]
  (-> query-params
      (update-keys keyword)
      (update-vals (fn [v] (if (= v "") nil v)))))

(mu/defn validate-and-merge-params :- [:map-of :keyword :any]
  "Validate that the `token-params` passed in the JWT and the `user-params` (passed as part of the URL) are allowed, and
  that ones that are required are specified by checking them against a Card or Dashboard's `object-embedding-params`
  (the object's value of `:embedding_params`). Throws a 400 if any of the checks fail. If all checks are successful,
  returns a *merged* parameters map."
  [object-embedding-params :- ms/EmbeddingParams
   token-params            :- [:map-of :keyword :any]
   user-params             :- [:map-of :keyword :any]]
  (check-param-sets object-embedding-params
                    (m/filter-vals valid-param-value? token-params)
                    (m/filter-vals valid-param-value? user-params))
  ;; ok, everything checks out, now return the merged params map,
  ;; but first turn empty lists into nil
  (-> (merge user-params token-params)
      (update-vals (fn [v]
                     (if (and (not (string? v)) (seqable? v))
                       (not-empty v)
                       v)))))

(mu/defn- param-values-merged-params :- [:map-of ms/NonBlankString :any]
  [id->slug slug->id embedding-params token-params id-query-params]
  (let [slug-query-params  (into {}
                                 (for [[id v] id-query-params]
                                   [(or (get id->slug (name id))
                                        (throw (ex-info (tru "Invalid query params: could not determine slug for parameter with ID {0}"
                                                             (pr-str id))
                                                        {:id              (name id)
                                                         :id->slug        id->slug
                                                         :id-query-params id-query-params})))
                                    v]))
        slug-query-params  (normalize-query-params slug-query-params)
        merged-slug->value (validate-and-merge-params embedding-params token-params slug-query-params)]
    (into {} (for [[slug value] merged-slug->value
                   :when        value]
               [(or (get slug->id (name slug))
                    (throw (ex-info (tru "The parameter {0} does not exist on this dashboard." (name slug))
                                    {:status-code 400})))
                value]))))

;;; ---------------------------------------------- Other Param Util Fns ----------------------------------------------

(defn- locked-slug->value
  "The `\"locked\"` parameter values carried by the signed JWT. These are supplied by the embedding server rather
  than the client, and are passed to the parameter value lookups as constraints so the values offered for the
  enabled parameters match the rows the locked values select."
  [embedding-params token-params]
  (into {} (filter (fn [[slug _value]] (= (get embedding-params (keyword slug)) "locked"))) token-params))

(defn- enabled-param-slugs
  "The set of param slugs (as keywords) from `dashboard-or-card-params` that may be exposed to embed viewers: only
  those explicitly whitelisted as \"enabled\" in `embedding-params`. Anything else — absent from the whitelist, or
  listed as \"disabled\" or \"locked\" — is not in the set, so it fails closed."
  [dashboard-or-card-params embedding-params]
  (into #{}
        (comp (map (comp keyword :slug))
              (filter #(= (get embedding-params %) "enabled")))
        dashboard-or-card-params))

(mu/defn- enabled-params
  "Keep only the `:parameters` of `dashboard-or-card` whose slug is listed as `enabled` in the `embedding-params`
  whitelist, so the frontend doesn't display widgets for params (`disabled`, `locked`, or unlisted) the user can't
  set."
  [dashboard-or-card embedding-params :- ms/EmbeddingParams]
  (let [param-slugs-to-keep (enabled-param-slugs (:parameters dashboard-or-card) embedding-params)]
    (update dashboard-or-card :parameters (partial filter #(contains? param-slugs-to-keep (keyword (:slug %)))))))

(defn- remove-token-parameters
  "Removes any parameters with slugs matching keys provided in `token-params`, as these should not be exposed to the
  user."
  [dashboard-or-card token-params]
  (let [token-slugs (set (keys token-params))]
    (update dashboard-or-card :parameters (partial remove #(contains? token-slugs (keyword (:slug %)))))))

(defn- substitute-token-parameters-in-text
  "For any dashboard parameters with slugs matching keys provided in `token-params`, substitute their values from the
  token into any Markdown dashboard cards with linked variables. This needs to be done on the backend because we don't
  make these parameters visible at all to the frontend."
  [dashboard token-params]
  (let [params             (:parameters dashboard)
        dashcards          (:dashcards dashboard)
        params-with-values (reduce
                            (fn [acc param]
                              (if-let [value (get token-params (keyword (:slug param)))]
                                (conj acc (assoc param :value value))
                                acc))
                            []
                            params)]
    (assoc dashboard
           :dashcards
           (map
            (fn [card]
              (if (-> card :visualization_settings :virtual_card)
                (notification.payload/process-virtual-dashcard card params-with-values)
                card))
            dashcards))))

(mu/defn- apply-slug->value :- [:maybe [:sequential
                                        [:map
                                         [:slug ms/NonBlankString]
                                         [:type :keyword]
                                         [:target :any]
                                         [:value :any]]]]
  "Adds `value` to parameters with `slug` matching a key in `merged-slug->value` and removes parameters without a
   `value`."
  [parameters slug->value]
  (when (seq parameters)
    (for [param parameters
          :let  [slug  (keyword (:slug param))
                 value (get slug->value slug)
                 ;; operator parameters expect a sequence of values so if we get a lone value (e.g. from a single URL
                 ;; query parameter) wrap it in a sequence
                 value (if (and (some? value)
                                (params.ops/operator? (:type param)))
                         (u/one-or-many value)
                         value)]
          :when (contains? slug->value slug)]
      (assoc (select-keys param [:type :target :slug :id])
             :value value))))

;;; ---------------------------- Card Fns used by both /api/embed and /api/preview_embed -----------------------------

(defn unsigned-token->card-id
  "Get the Card ID from an unsigned token, translating an `entity_id` to a numeric id if necessary."
  [unsigned-token]
  (->> (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :question])
       (eid-translation/->id :model/Card)))

(defn card-for-unsigned-token
  "Return the info needed for embedding about Card specified in `token`. Additional `constraints` can be passed to the
  `public-card` function that fetches the Card."
  [unsigned-token & {:keys [embedding-params constraints]}]
  {:pre [((some-fn empty? sequential?) constraints) (even? (count constraints))]}
  (let [card-id      (unsigned-token->card-id unsigned-token)
        token-params (embed/get-in-unsigned-token-or-throw unsigned-token [:params])
        resolved-embedding-params (or embedding-params
                                      (t2/select-one-fn :embedding_params :model/Card :id card-id))]
    (-> (apply api.public/public-card card-id constraints)
        api.public/combine-parameters-and-template-tags
        (remove-token-parameters token-params)
        (enabled-params resolved-embedding-params)
        api.public/keep-param-fields-for-parameters
        (assoc :embedding_params resolved-embedding-params))))

(defn- get-embed-card-context
  "If a certain export-format is given, return the correct embedded card context."
  [export-format]
  (case (keyword export-format)
    :csv  :embedded-csv-download
    :xlsx :embedded-xlsx-download
    :json :embedded-json-download
    :embedded-question))

;;; Embedded viewers have no Metabase account, so there are no user attributes to route by: embedded query execution
;;; always uses the router (primary) database. The `with-database-routing-off` wraps live here, in the shared
;;; execution helpers that every /api/embed and /api/preview_embed endpoint funnels through, so that individual
;;; endpoints cannot forget them. (For preview_embed this also means the preview shows what the published embed will
;;; show, rather than routing via the previewing admin's own user attribute.)

(defn process-query-for-card-with-params
  "Run the query associated with pre-loaded Card `card` using JWT `token-params`, user-supplied URL `query-params`,
   an `embedding-params` whitelist, and additional query `options`. Callers are responsible for selecting `card`
  exactly once per request and threading it here. Runs with database routing off (see above). Returns
  `StreamingResponse` that should be returned as the API endpoint result."
  [& {:keys [export-format card embedding-params token-params query-params qp constraints options]
      :or   {qp qp.card/process-query-for-card-default-qp}}]
  {:pre [(map? card) (pos-int? (:id card)) (u/maybe? map? embedding-params) (map? token-params) (map? query-params)]}
  (let [merged-slug->value (validate-and-merge-params embedding-params token-params (normalize-query-params query-params))
        parameters         (apply-slug->value (resolve-card-parameters card) merged-slug->value)]
    (database-routing/with-database-routing-off
      (m/mapply api.public/process-query-for-card-with-id
                card export-format parameters
                :context     (get-embed-card-context export-format)
                :constraints constraints
                :qp          qp
                options))))

(defn- tile-slug->value
  [object-parameters parameter-values]
  (let [id->slug (into {} (map (juxt :id :slug)) object-parameters)]
    (into {}
          (map (fn [{:keys [id value]}]
                 [(keyword (or (get id->slug id)
                               (throw (ex-info (tru "Invalid query params: could not determine slug for parameter with ID {0}"
                                                    (pr-str id))
                                               {:status-code 400}))))
                  value]))
          parameter-values)))

(defn tile-parameters-for-card
  "The parameters an embedded Card's map tile should run with."
  [card token-params parameter-values]
  (let [parameters (resolve-card-parameters card)]
    (apply-slug->value parameters
                       (validate-and-merge-params (:embedding_params card)
                                                  token-params
                                                  (tile-slug->value parameters parameter-values)))))

(defn tile-parameters-for-dashboard
  "The parameters an embedded Dashboard's map tile should run with."
  [dashboard token-params parameter-values]
  (resolve-dashboard-parameters dashboard
                                (validate-and-merge-params (:embedding_params dashboard)
                                                           token-params
                                                           (tile-slug->value (:parameters dashboard) parameter-values))))

(defn process-tiles-query-for-card
  "Like [[metabase.tiles.api/process-tiles-query-for-card]], but takes a pre-loaded Card entity and runs with database
  routing off (see above). Used by the embed tiles endpoints. Returns a Ring response."
  [card parameters zoom x y lat-field lon-field]
  (database-routing/with-database-routing-off
    (api.tiles/process-tiles-query-for-card card parameters zoom x y lat-field lon-field)))

;;; -------------------------- Dashboard Fns used by both /api/embed and /api/preview_embed --------------------------

(defn- remove-locked-parameters
  [dashboard embedding-params]
  (let [params                  (:parameters dashboard)
        param-slugs-to-keep    (enabled-param-slugs params embedding-params)
        param-ids-to-keep       (set (keep (fn [{:keys [slug id]}]
                                             (when (contains? param-slugs-to-keep (keyword slug)) id))
                                           params))
        keep-parameter-mappings (fn [dashcard]
                                  (update dashcard :parameter_mappings
                                          (fn [param-mappings]
                                            (filter (fn [{:keys [parameter_id]}]
                                                      (contains? param-ids-to-keep parameter_id)) param-mappings))))
        keep-inline-parameters  (fn [dashcard]
                                  (update dashcard :inline_parameters
                                          (fn [inline-params]
                                            (filter (fn [id] (contains? param-ids-to-keep id)) inline-params))))]
    (-> dashboard
        (update :dashcards #(map keep-parameter-mappings %))
        (update :dashcards #(map keep-inline-parameters %)))))

(defn unsigned-token->dashboard-id
  "Get the Dashboard ID from an unsigned token, translating an `entity_id` to a numeric id if necessary."
  [unsigned-token]
  (->> (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])
       (eid-translation/->id :model/Dashboard)))

(mu/defn dashboard-for-unsigned-token :- ::dashboards.schema/dashboard
  "Return the info needed for embedding about Dashboard specified in `token`. Additional `constraints` can be passed to
  the `public-dashboard` function that fetches the Dashboard."
  [unsigned-token & {:keys [embedding-params constraints]}]
  {:pre [((some-fn empty? sequential?) constraints) (even? (count constraints))]}
  (let [dashboard-id (unsigned-token->dashboard-id unsigned-token)
        embedding-params (or embedding-params
                             (t2/select-one-fn :embedding_params :model/Dashboard, :id dashboard-id))
        token-params (embed/get-in-unsigned-token-or-throw unsigned-token [:params])]
    (-> (apply api.public/public-dashboard dashboard-id constraints)
        (substitute-token-parameters-in-text token-params)
        (remove-locked-parameters embedding-params)
        (remove-token-parameters token-params)
        (enabled-params embedding-params)
        api.public/keep-param-fields-for-parameters)))

(defn- get-embed-dashboard-context
  "If a certain export-format is given, return the correct embedded dashboard context."
  [export-format]
  (case (keyword export-format)
    :csv  :embedded-csv-download
    :xlsx :embedded-xlsx-download
    :json :embedded-json-download
    :embedded-dashboard))

(defn process-query-for-dashcard
  "Return results for running the query belonging to a DashboardCard. Callers are responsible for selecting the
  `dashboard`, `dashcard`, and `card` entities exactly once per request and threading them here. Runs with database
  routing off (see the comment above [[process-query-for-card-with-params]]). Returns a `StreamingResponse`."
  [& {:keys [dashboard dashcard card export-format embedding-params token-params middleware
             query-params constraints qp]
      :or   {constraints (qp.constraints/default-query-constraints)
             qp          qp.card/process-query-for-card-default-qp}}]
  {:pre [(map? dashboard) (map? dashcard) (map? card) (u/maybe? map? embedding-params)
         (map? token-params) (map? query-params)]}
  (let [slug->value (validate-and-merge-params embedding-params token-params (normalize-query-params query-params))
        parameters  (resolve-dashboard-parameters dashboard slug->value)]
    (database-routing/with-database-routing-off
      (api.public/process-query-for-dashcard
       :dashboard     dashboard
       :card          card
       :dashcard      dashcard
       :export-format export-format
       :parameters    parameters
       :qp            qp
       :context       (get-embed-dashboard-context export-format)
       :constraints   constraints
       :middleware    middleware))))

(defn process-tiles-query-for-dashcard
  "Like [[metabase.tiles.api/process-tiles-query-for-dashcard]], but takes pre-loaded Dashboard/DashboardCard/Card
  entities and runs with database routing off (see the comment above [[process-query-for-card-with-params]]). Used by
  the embed tiles endpoints. Callers select each entity exactly once and thread it here. Returns a Ring response."
  [dashboard dashcard card parameters zoom x y lat-field lon-field]
  (database-routing/with-database-routing-off
    (api.public/process-tiles-query-for-dashcard dashboard dashcard card
                                                 parameters zoom x y lat-field lon-field)))

(defn card-param-values
  "Search for card parameter values. Does security checks to ensure the parameter is on the card and then gets param
  values according to [[queries/card-param-values]]."
  [{:keys [unsigned-token card param-key search-prefix]}]
  (let [slug-token-params   (embed/get-in-unsigned-token-or-throw unsigned-token [:params])
        parameters          (or (seq (:parameters card))
                                (queries/card-template-tag-parameters card))
        id->slug            (into {} (map (juxt :id :slug)) parameters)
        slug->id            (set/map-invert id->slug)
        searched-param-slug (get id->slug param-key)
        embedding-params    (:embedding_params card)]
    (try
      (when-not (= (get embedding-params (keyword searched-param-slug)) "enabled")
        (throw (ex-info (tru "Cannot search for values: {0} is not an enabled parameter."
                             (pr-str searched-param-slug))
                        {:status-code 400})))
      (when (get slug-token-params (keyword searched-param-slug))
        (throw (ex-info (tru "You can''t specify a value for {0} if it''s already set in the JWT." (pr-str searched-param-slug))
                        {:status-code 400})))
      (try
        ;; guest embeds always use the router (primary) database, never a routed destination
        (database-routing/with-database-routing-off
          (request/as-admin
            (queries/card-param-values card param-key search-prefix
                                       (queries/card-param-constraints
                                        card
                                        (locked-slug->value embedding-params slug-token-params)))))
        (catch Throwable e
          (throw (ex-info (.getMessage e)
                          {:card-id       (u/the-id card)
                           :param-key     param-key
                           :search-prefix search-prefix}
                          e))))
      (catch Throwable e
        (let [e (ex-info (.getMessage e)
                         {:card-id (u/the-id card)
                          :card-params (:parameters card)
                          :allowed-param-slugs embedding-params
                          :slug->id            slug->id
                          :id->slug            id->slug
                          :param-id            param-key
                          :param-slug          searched-param-slug
                          :token-params        slug-token-params}
                         e)]
          (log/errorf "embedded card-param-values error for Card %s: %s" (u/the-id card) (ex-message e))
          (throw e))))))

(defn card-param-remapped-value
  "Get the remapped value of card parameter value. Does security checks to ensure the parameter is on the card,
  and then gets the remapped parameter value according to [[queries/card-param-remapped-value]]."
  [{:keys [unsigned-token card param-key value]}]
  (let [slug-token-params   (embed/get-in-unsigned-token-or-throw unsigned-token [:params])
        parameters          (or (seq (:parameters card))
                                (queries/card-template-tag-parameters card))
        id->slug            (into {} (map (juxt :id :slug)) parameters)
        slug->id            (set/map-invert id->slug)
        searched-param-slug (get id->slug param-key)
        embedding-params    (:embedding_params card)]
    (try
      (when-not (= (get embedding-params (keyword searched-param-slug)) "enabled")
        (throw (ex-info (tru "Cannot get remapped value for parameter: {0} is not an enabled parameter."
                             (pr-str searched-param-slug))
                        {:status-code 400})))
      (when (get slug-token-params (keyword searched-param-slug))
        (throw (ex-info (tru "You can''t specify a value for {0} if it''s already set in the JWT."
                             (pr-str searched-param-slug))
                        {:status-code 400})))
      (try
        (database-routing/with-database-routing-off
          (request/as-admin
            (queries/card-param-remapped-value card param-key value
                                               (queries/card-param-constraints
                                                card
                                                (locked-slug->value embedding-params slug-token-params)))))
        (catch Throwable e
          (throw (ex-info (.getMessage e)
                          {:card-id   (u/the-id card)
                           :param-key param-key
                           :value     value}
                          e))))
      (catch Throwable e
        (let [e (ex-info (.getMessage e)
                         {:card-id (u/the-id card)
                          :card-params (:parameters card)
                          :allowed-param-slugs embedding-params
                          :slug->id            slug->id
                          :id->slug            id->slug
                          :param-id            param-key
                          :param-slug          searched-param-slug
                          :token-params        slug-token-params}
                         e)]
          (log/errorf "embedded card-param-values error for Card %s: %s" (u/the-id card) (ex-message e))
          (throw e))))))

(defn dashboard-param-values
  "Common implementation for fetching parameter values for embedding and preview-embedding.
  Optionally pass a map with `:preview` containing `true` (or some non-falsy value) to disable checking
  if the dashboard is 'published'. This is intended to power the `preview_embed` api endpoints.
  The `:preview` key will default to `false`."
  [token searched-param-id prefix id-query-params
   & {:keys [preview] :or {preview false}}]
  (let [unsigned-token                                 (embed/unsign token)
        dashboard-id                                   (unsigned-token->dashboard-id unsigned-token)
        dashboard                                      (t2/select-one :model/Dashboard :id dashboard-id)
        _                                              (when-not preview (check-embedding-enabled-for-dashboard dashboard))
        slug-token-params                              (embed/get-in-unsigned-token-or-throw unsigned-token [:params])
        {parameters                 :parameters
         published-embedding-params :embedding_params} dashboard
        ;; when previewing an embed, embedding-params should come from the token,
        ;; since a user may be changing them prior to publishing the Embed, which is what actually persists
        ;; the settings to the Appdb.
        embedding-params                               (if preview
                                                         (merge
                                                          published-embedding-params
                                                          (get unsigned-token :_embedding_params))
                                                         published-embedding-params)
        id->slug                                       (into {} (map (juxt :id :slug)) parameters)
        slug->id                                       (set/map-invert id->slug)
        searched-param-slug                            (get id->slug searched-param-id)]
    (try
      ;; you can only search for values of a parameter if it is ENABLED and NOT PRESENT in the JWT.
      (when-not (= (get embedding-params (keyword searched-param-slug)) "enabled")
        (throw (ex-info (tru "Cannot search for values: {0} is not an enabled parameter." (pr-str searched-param-slug))
                        {:status-code 400})))
      (when (get slug-token-params (keyword searched-param-slug))
        (throw (ex-info (tru "You can''t specify a value for {0} if it''s already set in the JWT." (pr-str searched-param-slug))
                        {:status-code 400})))
      ;; ok, at this point we can run the query
      (let [merged-id-params (param-values-merged-params id->slug slug->id embedding-params slug-token-params id-query-params)]
        (try
          (database-routing/with-database-routing-off
            (request/as-admin
              (parameters.dashboard/param-values dashboard searched-param-id merged-id-params prefix)))
          (catch Throwable e
            (throw (ex-info (.getMessage e)
                            {:merged-id-params merged-id-params}
                            e)))))
      (catch Throwable e
        (let [e (ex-info (.getMessage e)
                         {:dashboard-id        dashboard-id
                          :dashboard-params    parameters
                          :allowed-param-slugs embedding-params
                          :slug->id            slug->id
                          :id->slug            id->slug
                          :param-id            searched-param-id
                          :param-slug          searched-param-slug
                          :token-params        slug-token-params}
                         e)]
          (log/errorf "Chain filter error for Dashboard %s: %s" dashboard-id (ex-message e))
          (throw e))))))

(defn dashboard-param-remapped-value
  "Fetch the remapped value for the given `value` of parameter with ID `:param-key` of `dashboard`."
  ([token param-key value]
   (dashboard-param-remapped-value token param-key value nil))
  ([token param-key value {:keys [preview] :or {preview false}}]
   (let [unsigned-token             (embed/unsign token)
         dashboard-id               (unsigned-token->dashboard-id unsigned-token)
         dashboard                  (t2/select-one :model/Dashboard :id dashboard-id)
         _                          (when-not preview (check-embedding-enabled-for-dashboard dashboard))
         slug-token-params          (embed/get-in-unsigned-token-or-throw unsigned-token [:params])
         parameters                 (:parameters dashboard)
         id->slug                   (into {} (map (juxt :id :slug)) parameters)
         slug->id                   (set/map-invert id->slug)
         published-embedding-params (:embedding_params dashboard)
         ;; when previewing an embed, embedding-params should come from the token,
         ;; since a user may be changing them prior to publishing the Embed, which is what actually persists
         ;; the settings to the Appdb.
         embedding-params           (if preview
                                      (merge published-embedding-params
                                             (get unsigned-token :_embedding_params))
                                      published-embedding-params)
         param-slug                 (get id->slug param-key)
         locked-param-ids           (into #{}
                                          (keep (fn [[param param-type]]
                                                  (when (= param-type "locked")
                                                    (-> param name slug->id))))
                                          embedding-params)]
     ;; you can only search for values of a parameter if it is ENABLED and NOT PRESENT in the JWT.
     (when (not= (get embedding-params (keyword param-slug)) "enabled")
       (throw (ex-info (tru "Cannot get remapped value for parameter: {0} is not an enabled parameter." (pr-str param-slug))
                       {:status-code 400})))
     (when (get slug-token-params (keyword param-slug))
       (throw (ex-info (tru "You can''t specify a value for {0} if it''s already set in the JWT." (pr-str param-slug))
                       {:status-code 400})))
     (let [constraints (-> (param-values-merged-params id->slug slug->id embedding-params slug-token-params {})
                           (select-keys locked-param-ids))]
       (database-routing/with-database-routing-off
         (request/as-admin
           (parameters.dashboard/dashboard-param-remapped-value dashboard param-key value constraints)))))))
