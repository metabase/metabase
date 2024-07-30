(ns metabase.api.embed.common
  (:require
   [cheshire.core :as json]
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.card :as api.card]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.api.dashboard :as api.dashboard]
   [metabase.api.public :as api.public]
   [metabase.driver.common.parameters.operators :as params.ops]
   [metabase.models.card :as card]
   [metabase.models.params :as params]
   [metabase.pulse.parameters :as pulse-params]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.util :as u]
   [metabase.util.embed :as embed]
   [metabase.util.i18n
    :as i18n
    :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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

(defn- check-embedding-enabled-for-object
  "Check that embedding is enabled, that `object` exists, and embedding for `object` is enabled."
  ([entity id]
   (api/check (pos-int? id)
              [400 (tru "{0} id should be a positive integer." (name entity))])
   (check-embedding-enabled-for-object (t2/select-one [entity :enable_embedding] :id id)))

  ([object]
   (validation/check-embedding-enabled)
   (api/check-404 object)
   (api/check-not-archived object)
   (api/check (:enable_embedding object)
              [400 (tru "Embedding is not enabled for this object.")])))

(def ^{:arglists '([card-id])} check-embedding-enabled-for-card
  "Runs check-embedding-enabled-for-object for a given Card id"
  (partial check-embedding-enabled-for-object :model/Card))

(def ^{:arglists '([dashboard-id])} check-embedding-enabled-for-dashboard
  "Runs check-embedding-enabled-for-object for a given Dashboard id"
  (partial check-embedding-enabled-for-object :model/Dashboard))

(defn- resolve-card-parameters
  "Returns parameters for a card (HUH?)" ; TODO - better docstring
  [card-or-id]
  (-> (t2/select-one [:model/Card :dataset_query :parameters], :id (u/the-id card-or-id))
      api.public/combine-parameters-and-template-tags
      :parameters))

(mu/defn ^:private resolve-dashboard-parameters :- [:sequential api.dashboard/ParameterWithID]
  "Given a `dashboard-id` and parameters map in the format `slug->value`, return a sequence of parameters with `:id`s
  that can be passed to various functions in the `metabase.api.dashboard` namespace such as
  [[metabase.api.dashboard/process-query-for-dashcard]]."
  [dashboard-id :- ms/PositiveInt
   slug->value  :- :map]
  (let [parameters (t2/select-one-fn :parameters :model/Dashboard :id dashboard-id)
        slug->id   (into {} (map (juxt :slug :id)) parameters)]
    (vec (for [[slug value] slug->value
               :let         [slug (u/qualified-name slug)]]
           {:slug  slug
            :id    (or (get slug->id slug)
                       (throw (ex-info (tru "No matching parameter with slug {0}. Found: {1}" (pr-str slug) (pr-str (keys slug->id)))
                                       {:status-code          400
                                        :slug                 slug
                                        :dashboard-parameters parameters})))
            :value value}))))

(defn parse-query-params
  "Parses parameter values from the query string in a backward compatible way.

  Before (v50 and below) we passed parameter values as separate query string parameters \"?param1=A&param2=B\". The
  problem with this approach is that we cannot reliably distinguish between numbers and numeric strings, as well as
  booleans and boolean strings. To fix this issue we introduced another query string parameter `:parameters` which
  contains serialized JSON with parameter values. If this object cannot be found or parsed, we fallback to plain query
  string parameters."
  [query-params]
  (or (try
        (when-let [parameters (:parameters query-params)]
          (json/parse-string parameters keyword))
        (catch Throwable _
          nil))
      query-params))

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
                       (seq v)
                       v)))))

(mu/defn ^:private param-values-merged-params :- [:map-of ms/NonBlankString :any]
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
                [(get slug->id (name slug)) value]))))



;;; ---------------------------------------------- Other Param Util Fns ----------------------------------------------

(defn- remove-params-in-set
  "Remove any `params` from the list whose `:slug` is in the `params-to-remove` set."
  [params params-to-remove]
  (for [param params
        :when (not (contains? params-to-remove (keyword (:slug param))))]
    param))

(defn- classify-params-as-keep-or-remove
  "Classifies the params in the `dashboard-or-card-params` seq and the param slugs in `embedding-params` map according to:
  Parameters in `dashboard-or-card-params` whose slugs are NOT in the `embedding-params` map must be removed.
  Parameter slugs in `embedding-params` with the value 'enabled' are kept, 'disabled' or 'locked' are not kept.

  The resulting classification is returned as a map with keys :keep and :remove whose values are sets of parameter slugs."
  [dashboard-or-card-params embedding-params]
  (let [param-slugs                   (map #(keyword (:slug %)) dashboard-or-card-params)
        grouped-param-slugs           {:remove (remove (fn [k] (contains? embedding-params k)) param-slugs)}
        grouped-embedding-param-slugs (-> (group-by #(= (second %) "enabled") embedding-params)
                                          (update-keys {true :keep false :remove})
                                          (update-vals #(into #{} (map first) %)))]
    (merge-with (comp set concat)
                {:keep #{} :remove #{}}
                grouped-param-slugs
                grouped-embedding-param-slugs)))

(defn- get-params-to-remove
  [dashboard-or-card-params embedding-params]
  (:remove (classify-params-as-keep-or-remove dashboard-or-card-params embedding-params)))

(mu/defn ^:private remove-locked-and-disabled-params
  "Remove the `:parameters` for `dashboard-or-card` that listed as `disabled` or `locked` in the `embedding-params`
  whitelist, or not present in the whitelist. This is done so the frontend doesn't display widgets for params the user
  can't set."
  [dashboard-or-card embedding-params :- ms/EmbeddingParams]
  (let [params-to-remove (get-params-to-remove (:parameters dashboard-or-card) embedding-params)]
    (update dashboard-or-card :parameters remove-params-in-set params-to-remove)))

(defn- remove-token-parameters
  "Removes any parameters with slugs matching keys provided in `token-params`, as these should not be exposed to the
  user."
  [dashboard-or-card token-params]
  (update dashboard-or-card :parameters remove-params-in-set (set (keys token-params))))

(defn- substitute-token-parameters-in-text
  "For any dashboard parameters with slugs matching keys provided in `token-params`, substitute their values from the
  token into any Markdown dashboard cards with linked variables. This needs to be done on the backend because we don't
  make these parameters visible at all to the frontend."
  [dashboard token-params]
  (let [params             (:parameters dashboard)
        dashcards      (:dashcards dashboard)
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
                (pulse-params/process-virtual-dashcard card params-with-values)
                card))
            dashcards))))

(mu/defn ^:private apply-slug->value :- [:maybe [:sequential
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
      (assoc (select-keys param [:type :target :slug])
             :value value))))

;;; ---------------------------- Card Fns used by both /api/embed and /api/preview_embed -----------------------------

(defn card-for-unsigned-token
  "Return the info needed for embedding about Card specified in `token`. Additional `constraints` can be passed to the
  `public-card` function that fetches the Card."
  [unsigned-token & {:keys [embedding-params constraints]}]
  {:pre [((some-fn empty? sequential?) constraints) (even? (count constraints))]}
  (let [card-id      (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :question])
        token-params (embed/get-in-unsigned-token-or-throw unsigned-token [:params])]
    (-> (apply api.public/public-card :id card-id, constraints)
        api.public/combine-parameters-and-template-tags
        (remove-token-parameters token-params)
        (remove-locked-and-disabled-params (or embedding-params
                                               (t2/select-one-fn :embedding_params :model/Card :id card-id))))))

(defn process-query-for-card-with-params
  "Run the query associated with Card with `card-id` using JWT `token-params`, user-supplied URL `query-params`,
   an `embedding-params` whitelist, and additional query `options`. Returns `StreamingResponse` that should be
  returned as the API endpoint result."
  [& {:keys [export-format card-id embedding-params token-params query-params qp constraints options]
      :or   {qp qp.card/process-query-for-card-default-qp}}]
  {:pre [(integer? card-id) (u/maybe? map? embedding-params) (map? token-params) (map? query-params)]}
  (let [merged-slug->value (validate-and-merge-params embedding-params token-params (normalize-query-params query-params))
        parameters         (apply-slug->value (resolve-card-parameters card-id) merged-slug->value)]
    (m/mapply api.public/process-query-for-card-with-id
              card-id export-format parameters
              :context     :embedded-question
              :constraints constraints
              :qp          qp
              options)))

;;; -------------------------- Dashboard Fns used by both /api/embed and /api/preview_embed --------------------------

(defn- remove-linked-filters-param-values [dashboard]
  (let [param-ids (set (map :id (:parameters dashboard)))
        param-ids-to-remove (set (for [{param-id :id
                                        filtering-parameters :filteringParameters} (:parameters dashboard)
                                       filtering-parameter-id filtering-parameters
                                       :when (not (contains? param-ids filtering-parameter-id))]
                                   param-id))
        linked-field-ids (set (mapcat (params/get-linked-field-ids (:dashcards dashboard)) param-ids-to-remove))]
    (update dashboard :param_values #(->> %
                                          (map (fn [[param-id param]]
                                                 {param-id (cond-> param
                                                             (contains? linked-field-ids param-id) ;; is param linked?
                                                             (assoc :values []))}))
                                          (into {})))))

(defn- remove-locked-parameters [dashboard embedding-params]
  (let [params                    (:parameters dashboard)
        {params-to-remove :remove
         params-to-keep   :keep}  (classify-params-as-keep-or-remove params embedding-params)
        param-ids-to-remove       (set (keep (fn [{:keys [slug id]}]
                                               (when (contains? params-to-remove (keyword slug)) id))
                                             params))
        param-ids-to-keep         (set (keep (fn [{:keys [slug id]}]
                                               (when (contains? params-to-keep (keyword slug)) id))
                                             params))
        field-ids-to-maybe-remove (set (mapcat (params/get-linked-field-ids (:dashcards dashboard)) param-ids-to-remove))
        field-ids-to-keep         (set (mapcat (params/get-linked-field-ids (:dashcards dashboard)) param-ids-to-keep))
        field-ids-to-remove       (set/difference field-ids-to-maybe-remove field-ids-to-keep)
        remove-parameters         (fn [dashcard]
                                    (update dashcard :parameter_mappings
                                            (fn [param-mappings]
                                              (remove (fn [{:keys [parameter_id]}]
                                                        (contains? param-ids-to-remove parameter_id)) param-mappings))))]
    (-> dashboard
        (update :dashcards #(map remove-parameters %))
        (update :param_fields #(apply dissoc % field-ids-to-remove))
        (update :param_values #(apply dissoc % field-ids-to-remove)))))

(defn dashboard-for-unsigned-token
  "Return the info needed for embedding about Dashboard specified in `token`. Additional `constraints` can be passed to
  the `public-dashboard` function that fetches the Dashboard."
  [unsigned-token & {:keys [embedding-params constraints]}]
  {:pre [((some-fn empty? sequential?) constraints) (even? (count constraints))]}
  (let [dashboard-id (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])
        embedding-params (or embedding-params
                             (t2/select-one-fn :embedding_params :model/Dashboard, :id dashboard-id))
        token-params (embed/get-in-unsigned-token-or-throw unsigned-token [:params])]
    (-> (apply api.public/public-dashboard :id dashboard-id, constraints)
        (substitute-token-parameters-in-text token-params)
        (remove-locked-parameters embedding-params)
        (remove-token-parameters token-params)
        (remove-locked-and-disabled-params embedding-params)
        (remove-linked-filters-param-values))))

(defn- get-embed-dashboard-context
  "If a certain export-format is given, return the correct embedded dashboard context."
  [export-format]
  (case export-format
    "csv"  :embedded-csv-download
    "xlsx" :embedded-xlsx-download
    "json" :embedded-json-download
    :embedded-dashboard))

(defn process-query-for-dashcard
  "Return results for running the query belonging to a DashboardCard. Returns a `StreamingResponse`."
  [& {:keys [dashboard-id dashcard-id card-id export-format embedding-params token-params middleware
             query-params constraints qp]
      :or   {constraints (qp.constraints/default-query-constraints)
             qp          qp.card/process-query-for-card-default-qp}}]
  {:pre [(integer? dashboard-id) (integer? dashcard-id) (integer? card-id) (u/maybe? map? embedding-params)
         (map? token-params) (map? query-params)]}
  (let [slug->value (validate-and-merge-params embedding-params token-params (normalize-query-params query-params))
        parameters  (resolve-dashboard-parameters dashboard-id slug->value)]
    (api.public/process-query-for-dashcard
     :dashboard-id  dashboard-id
     :card-id       card-id
     :dashcard-id   dashcard-id
     :export-format export-format
     :parameters    parameters
     :qp            qp
     :context       (get-embed-dashboard-context export-format)
     :constraints   constraints
     :middleware    middleware)))

(defn card-param-values
  "Search for card parameter values. Does security checks to ensure the parameter is on the card and then gets param
  values according to [[api.card/param-values]]."
  [{:keys [unsigned-token card param-key search-prefix]}]
  (let [slug-token-params   (embed/get-in-unsigned-token-or-throw unsigned-token [:params])
        parameters          (or (seq (:parameters card))
                                (card/template-tag-parameters card))
        id->slug            (into {} (map (juxt :id :slug) parameters))
        slug->id            (into {} (map (juxt :slug :id) parameters))
        searched-param-slug (get id->slug param-key)
        embedding-params    (:embedding_params card)]
    (try
      (when-not (= (get embedding-params (keyword searched-param-slug)) "enabled")
        (throw (ex-info (tru "Cannot search for values: {0} is not an enabled parameter."
                             (pr-str searched-param-slug))
                        {:status-code 400})))
      (when (get slug-token-params (keyword searched-param-slug))
        (throw (ex-info (tru "You can''t specify a value for {0} if it's already set in the JWT." (pr-str searched-param-slug))
                        {:status-code 400})))
      (try
        (binding [api/*current-user-permissions-set* (atom #{"/"})
                  api/*is-superuser?* true]
          (api.card/param-values card param-key search-prefix))
        (catch Throwable e
          (throw (ex-info (.getMessage e)
                          {:card-id       (u/the-id card)
                           :param-key     param-key
                           :search-prefix search-prefix}
                          e))))
      (catch Throwable e
        (let [e (ex-info (.getMessage e)
                         {:card-id (u/the-id card)
                          :card-params (:parametres card)
                          :allowed-param-slugs embedding-params
                          :slug->id            slug->id
                          :id->slug            id->slug
                          :param-id            param-key
                          :param-slug          searched-param-slug
                          :token-params        slug-token-params}
                         e)]
          (log/errorf e "embedded card-param-values error\n%s"
                      (u/pprint-to-str (u/all-ex-data e)))
          (throw e))))))

(defn dashboard-param-values
  "Common implementation for fetching parameter values for embedding and preview-embedding.
  Optionally pass a map with `:preview` containing `true` (or some non-falsy value) to disable checking
  if the dashboard is 'published'. This is intended to power the `preview_embed` api endpoints.
  The `:preview` key will default to `false`."
  [token searched-param-id prefix id-query-params
   & {:keys [preview] :or {preview false}}]
  (let [unsigned-token                                 (embed/unsign token)
        dashboard-id                                   (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])
        _                                              (when-not preview (check-embedding-enabled-for-dashboard dashboard-id))
        slug-token-params                              (embed/get-in-unsigned-token-or-throw unsigned-token [:params])
        {parameters                 :parameters
         published-embedding-params :embedding_params} (t2/select-one :model/Dashboard :id dashboard-id)
        ;; when previewing an embed, embedding-params should come from the token,
        ;; since a user may be changing them prior to publishing the Embed, which is what actually persists
        ;; the settings to the Appdb.
        embedding-params                               (if preview
                                                         (merge
                                                          published-embedding-params
                                                          (get unsigned-token :_embedding_params))
                                                         published-embedding-params)
        id->slug                                       (into {} (map (juxt :id :slug) parameters))
        slug->id                                       (into {} (map (juxt :slug :id) parameters))
        searched-param-slug                            (get id->slug searched-param-id)]
    (try
      ;; you can only search for values of a parameter if it is ENABLED and NOT PRESENT in the JWT.
      (when-not (= (get embedding-params (keyword searched-param-slug)) "enabled")
        (throw (ex-info (tru "Cannot search for values: {0} is not an enabled parameter." (pr-str searched-param-slug))
                        {:status-code 400})))
      (when (get slug-token-params (keyword searched-param-slug))
        (throw (ex-info (tru "You can''t specify a value for {0} if it's already set in the JWT." (pr-str searched-param-slug))
                        {:status-code 400})))
      ;; ok, at this point we can run the query
      (let [merged-id-params (param-values-merged-params id->slug slug->id embedding-params slug-token-params id-query-params)]
        (try
          (binding [api/*current-user-permissions-set* (atom #{"/"})
                    api/*is-superuser?*                true]
            (api.dashboard/param-values (t2/select-one :model/Dashboard :id dashboard-id) searched-param-id merged-id-params prefix))
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
          (log/errorf e "Chain filter error\n%s" (u/pprint-to-str (u/all-ex-data e)))
          (throw e))))))
