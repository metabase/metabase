(ns metabase.api.embed
  "Various endpoints that use [JSON web tokens](https://jwt.io/introduction/) to fetch Cards and Dashboards.
   The endpoints are the same as the ones in `api/public/`, and differ only in the way they are authorized.

   To use these endpoints:

    1.  Set the `embedding-secret-key` Setting to a hexadecimal-encoded 32-byte sequence (i.e., a 64-character string).
        You can use `/api/util/random_token` to get a cryptographically-secure value for this.
    2.  Sign/base-64 encode a JSON Web Token using the secret key and pass it as the relevant part of the URL path
        to the various endpoints here.

   Tokens can have the following fields:

      {:resource {:question  <card-id>
                  :dashboard <dashboard-id>}
       :params   <params>}"
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [compojure.core :refer [GET]]
   [medley.core :as m]
   [metabase.api.card :as api.card]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.api.dashboard :as api.dashboard]
   [metabase.api.dataset :as api.dataset]
   [metabase.api.public :as api.public]
   [metabase.driver.common.parameters.operators :as params.ops]
   [metabase.models.card :as card :refer [Card]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.params :as params]
   [metabase.pulse.parameters :as pulse-params]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.util :as u]
   [metabase.util.embed :as embed]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Param Checking -------------------------------------------------

(defn- check-params-are-allowed
  "Check that the conditions specified by `object-embedding-params` are satisfied."
  [object-embedding-params token-params user-params]
  (let [all-params        (set/union token-params user-params)
        duplicated-params (set/intersection token-params user-params)]
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
                    (contains? token-params param)      [400 (tru "You must specify a value for {0} in the JWT." param)]
                    (not (contains? user-params param)) [400 (tru "You can only specify a value for {0} in the JWT." param)])))))

(defn- check-params-exist
  "Make sure all the params specified are specified in `object-embedding-params`."
  [object-embedding-params all-params]
  (let [embedding-params (set (keys object-embedding-params))]
    (doseq [k all-params]
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
  (check-params-exist object-embedding-params (set/union token-params user-params)))

(defn- valid-param?
  "Is V a valid param value? (If it is a String, is it non-blank?)"
  [v]
  (or (not (string? v))
      (not (str/blank? v))))

(mu/defn ^:private validate-and-merge-params :- [:map-of :keyword :any]
  "Validate that the `token-params` passed in the JWT and the `user-params` (passed as part of the URL) are allowed, and
  that ones that are required are specified by checking them against a Card or Dashboard's `object-embedding-params`
  (the object's value of `:embedding_params`). Throws a 400 if any of the checks fail. If all checks are successful,
  returns a *merged* parameters map."
  [object-embedding-params :- ms/EmbeddingParams
   token-params            :- [:map-of :keyword :any]
   user-params             :- [:map-of :keyword :any]]
  (check-param-sets object-embedding-params
                    (set (keys (m/filter-vals valid-param? token-params)))
                    (set (keys (m/filter-vals valid-param? user-params))))
  ;; ok, everything checks out, now return the merged params map
  (merge user-params token-params))


;;; ---------------------------------------------- Other Param Util Fns ----------------------------------------------

(defn- remove-params-in-set
  "Remove any `params` from the list whose `:slug` is in the `params-to-remove` set."
  [params params-to-remove]
  (for [param params
        :when (not (contains? params-to-remove (keyword (:slug param))))]
    param))

(defn- get-params-to-remove
  "Gets the params in both the provided embedding-params and dashboard-or-card object that we should remove."
  [dashboard-or-card embedding-params]
  (set (concat (for [[param status] embedding-params
                     :when          (not= status "enabled")]
                 param)
               (for [{slug :slug} (:parameters dashboard-or-card)
                     :let         [param (keyword slug)]
                     :when        (not (contains? embedding-params param))]
                 param))))

(mu/defn ^:private remove-locked-and-disabled-params
  "Remove the `:parameters` for `dashboard-or-card` that listed as `disabled` or `locked` in the `embedding-params`
  whitelist, or not present in the whitelist. This is done so the frontend doesn't display widgets for params the user
  can't set."
  [dashboard-or-card embedding-params :- ms/EmbeddingParams]
  (let [params-to-remove (get-params-to-remove dashboard-or-card embedding-params)]
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

(defn- resolve-card-parameters
  "Returns parameters for a card (HUH?)" ; TODO - better docstring
  [card-or-id]
  (-> (t2/select-one [Card :dataset_query :parameters], :id (u/the-id card-or-id))
      api.public/combine-parameters-and-template-tags
      :parameters))

(mu/defn ^:private resolve-dashboard-parameters :- [:sequential api.dashboard/ParameterWithID]
  "Given a `dashboard-id` and parameters map in the format `slug->value`, return a sequence of parameters with `:id`s
  that can be passed to various functions in the `metabase.api.dashboard` namespace such as
  [[metabase.api.dashboard/run-query-for-dashcard-async]]."
  [dashboard-id :- ms/PositiveInt
   slug->value  :- :map]
  (let [parameters (t2/select-one-fn :parameters Dashboard :id dashboard-id)
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

(mu/defn ^:private normalize-query-params :- [:map-of :keyword :any]
  "Take a map of `query-params` and make sure they're in the right format for the rest of our code. Our
  `wrap-keyword-params` middleware normally converts all query params keys to keywords, but only if they seem like
  ones that make sense as keywords. Some params, such as ones that start with a number, do not pass this test, and are
  not automatically converted. Thus we must do it ourselves here to make sure things are done as we'd expect.
  Also, any param values that are blank strings should be parsed as nil, representing the absence of a value."
  [query-params]
  (-> query-params
      (update-keys keyword)
      (update-vals (fn [v] (if (= v "") nil v)))))


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
                                               (t2/select-one-fn :embedding_params Card :id card-id))))))

(defn run-query-for-card-with-params-async
  "Run the query associated with Card with `card-id` using JWT `token-params`, user-supplied URL `query-params`,
   an `embedding-params` whitelist, and additional query `options`. Returns `StreamingResponse` that should be
  returned as the API endpoint result."
  {:style/indent 0}
  [& {:keys [export-format card-id embedding-params token-params query-params qp-runner constraints options]
      :or   {qp-runner qp/process-query-and-save-execution!}}]
  {:pre [(integer? card-id) (u/maybe? map? embedding-params) (map? token-params) (map? query-params)]}
  (let [merged-slug->value (validate-and-merge-params embedding-params token-params (normalize-query-params query-params))
        parameters         (apply-slug->value (resolve-card-parameters card-id) merged-slug->value)]
    (m/mapply api.public/run-query-for-card-with-id-async
              card-id export-format parameters
              :context :embedded-question,
              :constraints constraints,
              :qp-runner qp-runner,
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
  (let [params-to-remove (get-params-to-remove dashboard embedding-params)
        param-ids-to-remove (set (for [parameter (:parameters dashboard)
                                       :when     (contains? params-to-remove (keyword (:slug parameter)))]
                                   (:id parameter)))
        linked-field-ids (set (mapcat (params/get-linked-field-ids (:dashcards dashboard)) param-ids-to-remove))
        remove-parameters (fn [dashcard]
                            (update dashcard :parameter_mappings
                                    (fn [param-mappings]
                                      (remove (fn [{:keys [parameter_id]}]
                                                (contains? param-ids-to-remove parameter_id)) param-mappings))))]
    (-> dashboard
        (update :dashcards #(map remove-parameters %))
        (update :param_fields #(apply dissoc % linked-field-ids))
        (update :param_values #(apply dissoc % linked-field-ids)))))

(defn dashboard-for-unsigned-token
  "Return the info needed for embedding about Dashboard specified in `token`. Additional `constraints` can be passed to
  the `public-dashboard` function that fetches the Dashboard."
  [unsigned-token & {:keys [embedding-params constraints]}]
  {:pre [((some-fn empty? sequential?) constraints) (even? (count constraints))]}
  (let [dashboard-id (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])
        embedding-params (or embedding-params
                             (t2/select-one-fn :embedding_params Dashboard, :id dashboard-id))
        token-params (embed/get-in-unsigned-token-or-throw unsigned-token [:params])]
    (-> (apply api.public/public-dashboard :id dashboard-id, constraints)
        (substitute-token-parameters-in-text token-params)
        (remove-locked-parameters embedding-params)
        (remove-token-parameters token-params)
        (remove-locked-and-disabled-params embedding-params)
        (remove-linked-filters-param-values))))

(defn dashcard-results-async
  "Return results for running the query belonging to a DashboardCard. Returns a `StreamingResponse`."
  {:style/indent 0}
  [& {:keys [dashboard-id dashcard-id card-id export-format embedding-params token-params middleware
             query-params constraints qp-runner]
      :or   {constraints (qp.constraints/default-query-constraints)
             qp-runner   qp/process-query-and-save-execution!}}]
  {:pre [(integer? dashboard-id) (integer? dashcard-id) (integer? card-id) (u/maybe? map? embedding-params)
         (map? token-params) (map? query-params)]}
  (let [slug->value (validate-and-merge-params embedding-params token-params (normalize-query-params query-params))
        parameters  (resolve-dashboard-parameters dashboard-id slug->value)]
    (api.public/public-dashcard-results-async
     :dashboard-id  dashboard-id
     :card-id       card-id
     :dashcard-id   dashcard-id
     :export-format export-format
     :parameters    parameters
     :qp-runner     qp-runner
     :context       :embedded-dashboard
     :constraints   constraints
     :middleware    middleware)))


;;; ------------------------------------- Other /api/embed-specific utility fns --------------------------------------

(defn- check-embedding-enabled-for-object
  "Check that embedding is enabled, that `object` exists, and embedding for `object` is enabled."
  ([entity id]
   (api/check (pos-int? id)
              [400 (tru "Dashboard id should be a positive integer.")])
   (check-embedding-enabled-for-object (t2/select-one [entity :enable_embedding] :id id)))

  ([object]
   (validation/check-embedding-enabled)
   (api/check-404 object)
   (api/check-not-archived object)
   (api/check (:enable_embedding object)
     [400 (tru "Embedding is not enabled for this object.")])))

(def ^:private ^{:arglists '([dashboard-id])} check-embedding-enabled-for-dashboard
  "Runs check-embedding-enabled-for-object for a given Dashboard id"
  (partial check-embedding-enabled-for-object Dashboard))

(def ^:private ^{:arglists '([card-id])} check-embedding-enabled-for-card
  "Runs check-embedding-enabled-for-object for a given Card id"
  (partial check-embedding-enabled-for-object Card))


;;; ------------------------------------------- /api/embed/card endpoints --------------------------------------------

(api/defendpoint GET "/card/:token"
  "Fetch a Card via a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}}"
  [token]
  (let [unsigned (embed/unsign token)]
    (check-embedding-enabled-for-card (embed/get-in-unsigned-token-or-throw unsigned [:resource :question]))
    (card-for-unsigned-token unsigned, :constraints [:enable_embedding true])))

(defn ^:private run-query-for-unsigned-token-async
  "Run the query belonging to Card identified by `unsigned-token`. Checks that embedding is enabled both globally and
  for this Card. Returns core.async channel to fetch the results."
  [unsigned-token export-format query-params & {:keys [constraints qp-runner]
                                                :or   {constraints (qp.constraints/default-query-constraints)
                                                       qp-runner   qp/process-query-and-save-execution!}
                                                :as   options}]
  (let [card-id (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (check-embedding-enabled-for-card card-id)
    (run-query-for-card-with-params-async
      :export-format     export-format
      :card-id           card-id
      :token-params      (embed/get-in-unsigned-token-or-throw unsigned-token [:params])
      :embedding-params  (t2/select-one-fn :embedding_params Card :id card-id)
      :query-params      query-params
      :qp-runner         qp-runner
      :constraints       constraints
      :options           options)))

(api/defendpoint GET "/card/:token/query"
  "Fetch the results of running a Card using a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}
      :params   <parameters>}"
  [token & query-params]
  (run-query-for-unsigned-token-async (embed/unsign token) :api query-params))

(api/defendpoint GET ["/card/:token/query/:export-format", :export-format api.dataset/export-format-regex]
  "Like `GET /api/embed/card/query`, but returns the results as a file in the specified format."
  [token export-format :as {:keys [query-params]}]
  {export-format (into [:enum] api.dataset/export-formats)}
  (run-query-for-unsigned-token-async
   (embed/unsign token)
   export-format
   (m/map-keys keyword query-params)
   :constraints nil
   :middleware {:process-viz-settings? true
                :js-int-to-string?     false
                :format-rows?          false}))


;;; ----------------------------------------- /api/embed/dashboard endpoints -----------------------------------------

(api/defendpoint GET "/dashboard/:token"
  "Fetch a Dashboard via a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:dashboard <dashboard-id>}}"
  [token]
  (let [unsigned (embed/unsign token)]
    (check-embedding-enabled-for-dashboard (embed/get-in-unsigned-token-or-throw unsigned [:resource :dashboard]))
    (dashboard-for-unsigned-token unsigned, :constraints [:enable_embedding true])))

(defn- dashcard-results-for-signed-token-async
  "Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
   `embedding-secret-key`.

   Token should have the following format:

     {:resource {:dashboard <dashboard-id>}
      :params   <parameters>}

  Additional dashboard parameters can be provided in the query string, but params in the JWT token take precedence.

  Returns a `StreamingResponse`."
  {:style/indent 1}
  [token dashcard-id card-id export-format query-params
   & {:keys [constraints qp-runner middleware]
      :or   {constraints (qp.constraints/default-query-constraints)
             qp-runner   qp/process-query-and-save-execution!}}]
  (let [unsigned-token (embed/unsign token)
        dashboard-id   (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])]
    (check-embedding-enabled-for-dashboard dashboard-id)
    (dashcard-results-async
      :export-format    export-format
      :dashboard-id     dashboard-id
      :dashcard-id      dashcard-id
      :card-id          card-id
      :embedding-params (t2/select-one-fn :embedding_params Dashboard :id dashboard-id)
      :token-params     (embed/get-in-unsigned-token-or-throw unsigned-token [:params])
      :query-params     query-params
      :constraints      constraints
      :qp-runner        qp-runner
      :middleware       middleware)))

(api/defendpoint GET "/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
  `embedding-secret-key`"
  [token dashcard-id card-id & query-params]
  {dashcard-id ms/PositiveInt
   card-id     ms/PositiveInt}
  (dashcard-results-for-signed-token-async token dashcard-id card-id :api query-params))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        FieldValues, Search, Remappings                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; -------------------------------------------------- Field Values --------------------------------------------------

(api/defendpoint GET "/card/:token/field/:field-id/values"
  "Fetch FieldValues for a Field that is referenced by an embedded Card."
  [token field-id]
  {field-id ms/PositiveInt}
  (let [unsigned-token (embed/unsign token)
        card-id        (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (check-embedding-enabled-for-card card-id)
    (api.public/card-and-field-id->values card-id field-id)))

(api/defendpoint GET "/dashboard/:token/field/:field-id/values"
  "Fetch FieldValues for a Field that is used as a param in an embedded Dashboard."
  [token field-id]
  {field-id ms/PositiveInt}
  (let [unsigned-token (embed/unsign token)
        dashboard-id   (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])]
    (check-embedding-enabled-for-dashboard dashboard-id)
    (api.public/dashboard-and-field-id->values dashboard-id field-id)))


;;; --------------------------------------------------- Searching ----------------------------------------------------

(api/defendpoint GET "/card/:token/field/:field-id/search/:search-field-id"
  "Search for values of a Field that is referenced by an embedded Card."
  [token field-id search-field-id value limit]
  {field-id        ms/PositiveInt
   search-field-id ms/PositiveInt
   value           ms/NonBlankString
   limit           [:maybe ms/PositiveInt]}
  (let [unsigned-token (embed/unsign token)
        card-id        (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (check-embedding-enabled-for-card card-id)
    (api.public/search-card-fields card-id field-id search-field-id value (when limit (Integer/parseInt limit)))))

(api/defendpoint GET "/dashboard/:token/field/:field-id/search/:search-field-id"
  "Search for values of a Field that is referenced by a Card in an embedded Dashboard."
  [token field-id search-field-id value limit]
  {field-id        ms/PositiveInt
   search-field-id ms/PositiveInt
   value           ms/NonBlankString
   limit           [:maybe ms/PositiveInt]}
  (let [unsigned-token (embed/unsign token)
        dashboard-id   (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])]
    (check-embedding-enabled-for-dashboard dashboard-id)
    (api.public/search-dashboard-fields dashboard-id field-id search-field-id value (when limit
                                                                                      (Integer/parseInt limit)))))


;;; --------------------------------------------------- Remappings ---------------------------------------------------

(api/defendpoint GET "/card/:token/field/:field-id/remapping/:remapped-id"
  "Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with
  embedded Cards."
  [token field-id remapped-id value]
  {field-id    ms/PositiveInt
   remapped-id ms/PositiveInt
   value       ms/NonBlankString}
  (let [unsigned-token (embed/unsign token)
        card-id        (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (check-embedding-enabled-for-card card-id)
    (api.public/card-field-remapped-values card-id field-id remapped-id value)))

(api/defendpoint GET "/dashboard/:token/field/:field-id/remapping/:remapped-id"
  "Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with
  embedded Dashboards."
  [token field-id remapped-id value]
  {field-id    ms/PositiveInt
   remapped-id ms/PositiveInt
   value       ms/NonBlankString}
  (let [unsigned-token (embed/unsign token)
        dashboard-id   (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])]
    (check-embedding-enabled-for-dashboard dashboard-id)
    (api.public/dashboard-field-remapped-values dashboard-id field-id remapped-id value)))

(api/defendpoint GET ["/dashboard/:token/dashcard/:dashcard-id/card/:card-id/:export-format"
                                         :export-format api.dataset/export-format-regex]
  "Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
  `embedding-secret-key` return the data in one of the export formats"
  [token export-format dashcard-id card-id, :as {:keys [query-params]}]
  {dashcard-id   ms/PositiveInt
   card-id       ms/PositiveInt
   export-format (into [:enum] api.dataset/export-formats)}
  (dashcard-results-for-signed-token-async token
    dashcard-id
    card-id
    export-format
    (m/map-keys keyword query-params)
    :constraints nil
    :middleware {:process-viz-settings? true
                 :js-int-to-string?     false
                 :format-rows?          false}))


;;; ----------------------------------------------- Param values -------------------------------------------------

;; embedding parameters in `:embedding_params` and the JWT are keyed by `:slug`; the chain filter endpoints instead
;; key by `:id`. So we need to do a little conversion back and forth below.
;;
;; variables whose name includes `id-` e.g. `id-query-params` below are ones that are keyed by ID; ones whose name
;; includes `slug-` are keyed by slug.

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
    (into {} (for [[slug value] merged-slug->value]
               [(get slug->id (name slug)) value]))))

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
        (binding [api/*current-user-permissions-set* (atom #{"/"})]
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

(defn- dashboard-param-values [token searched-param-id prefix id-query-params]
  (let [unsigned-token                       (embed/unsign token)
        dashboard-id                         (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])
        _                                    (check-embedding-enabled-for-dashboard dashboard-id)
        slug-token-params                    (embed/get-in-unsigned-token-or-throw unsigned-token [:params])
        {parameters       :parameters
         embedding-params :embedding_params} (t2/select-one Dashboard :id dashboard-id)
        id->slug                             (into {} (map (juxt :id :slug) parameters))
        slug->id                             (into {} (map (juxt :slug :id) parameters))
        searched-param-slug                  (get id->slug searched-param-id)]
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
          (binding [api/*current-user-permissions-set* (atom #{"/"})]
            (api.dashboard/param-values (t2/select-one Dashboard :id dashboard-id) searched-param-id merged-id-params prefix))
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

(api/defendpoint GET "/dashboard/:token/params/:param-key/values"
  "Embedded version of chain filter values endpoint."
  [token param-key :as {:keys [query-params]}]
  (dashboard-param-values token param-key nil query-params))

(api/defendpoint GET "/dashboard/:token/params/:param-key/search/:prefix"
  "Embedded version of chain filter search endpoint."
  [token param-key prefix :as {:keys [query-params]}]
  (dashboard-param-values token param-key prefix query-params))

(api/defendpoint GET "/card/:token/params/:param-key/values"
  "Embedded version of api.card filter values endpoint."
  [token param-key]
  (let [unsigned (embed/unsign token)
        card-id  (embed/get-in-unsigned-token-or-throw unsigned [:resource :question])
        card     (t2/select-one Card :id card-id)]
    (check-embedding-enabled-for-card card-id)
    (card-param-values {:unsigned-token unsigned
                        :card           card
                        :param-key      param-key})))

(api/defendpoint GET "/card/:token/params/:param-key/search/:prefix"
  "Embedded version of chain filter search endpoint."
  [token param-key prefix]
  (let [unsigned (embed/unsign token)
        card-id  (embed/get-in-unsigned-token-or-throw unsigned [:resource :question])
        card     (t2/select-one Card :id card-id)]
    (check-embedding-enabled-for-card card-id)
    (card-param-values {:unsigned-token unsigned
                        :card           card
                        :param-key      param-key
                        :search-prefix  prefix})))

(api/defendpoint GET "/pivot/card/:token/query"
  "Fetch the results of running a Card using a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}
      :params   <parameters>}"
  [token & query-params]
  (run-query-for-unsigned-token-async (embed/unsign token) :api query-params :qp-runner qp.pivot/run-pivot-query))

(api/defendpoint GET "/pivot/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
  `embedding-secret-key`"
  [token dashcard-id card-id & query-params]
  {dashcard-id ms/PositiveInt
   card-id ms/PositiveInt}
  (dashcard-results-for-signed-token-async token dashcard-id card-id :api query-params :qp-runner qp.pivot/run-pivot-query))

(api/define-routes)
