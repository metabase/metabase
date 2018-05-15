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
  (:require [clojure
             [set :as set]
             [string :as str]]
            [clojure.tools.logging :as log]
            [compojure.core :refer [GET]]
            [medley.core :as m]
            [metabase.api
             [common :as api]
             [dataset :as dataset-api]
             [public :as public-api]]
            [metabase.models
             [card :refer [Card]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]]
            [metabase.util :as u]
            [metabase.util
             [embed :as eu]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

;;; ------------------------------------------------- Param Checking -------------------------------------------------

(defn- validate-params-are-allowed
  "Check that the conditions specified by `object-embedding-params` are satisfied."
  [object-embedding-params token-params user-params]
  (let [all-params        (set/union token-params user-params)
        duplicated-params (set/intersection token-params user-params)]
    (doseq [[param status] object-embedding-params]
      (case status
        ;; disabled means a param is not allowed to be specified by either token or user
        "disabled" (api/check (not (contains? all-params param))
                     [400 (format "You're not allowed to specify a value for %s." param)])
        ;; enabled means either JWT *or* user can specify the param, but not both. Param is *not* required
        "enabled"  (api/check (not (contains? duplicated-params param))
                     [400 (format "You can't specify a value for %s if it's already set in the JWT." param)])
        ;; locked means JWT must specify param
        "locked"   (api/check
                       (contains? token-params param)      [400 (format "You must specify a value for %s in the JWT." param)]
                       (not (contains? user-params param)) [400 (format "You can only specify a value for %s in the JWT." param)])))))

(defn- validate-params-exist
  "Make sure all the params specified are specified in `object-embedding-params`."
  [object-embedding-params all-params]
  (let [embedding-params (set (keys object-embedding-params))]
    (doseq [k all-params]
      (api/check (contains? embedding-params k)
        [400 (format "Unknown parameter %s." k)]))))

(defn- validate-param-sets
  "Validate that sets of params passed as part of the JWT token and by the user (as query params, i.e. as part of the
  URL) are valid for the OBJECT-EMBEDDING-PARAMS. TOKEN-PARAMS and USER-PARAMS should be sets of all valid param keys
  specified in the JWT or by the user, respectively."
  [object-embedding-params token-params user-params]
  ;; TODO - maybe make this log/debug once embedding is wrapped up
  (log/debug "Validating params for embedded object:\n"
             "object embedding params:" object-embedding-params
             "token params:"            token-params
             "user params:"             user-params)
  (validate-params-are-allowed object-embedding-params token-params user-params)
  (validate-params-exist object-embedding-params (set/union token-params user-params)))

(defn- valid-param?
  "Is V a valid param value? (Is it non-`nil`, and, if a String, non-blank?)"
  [v]
  (and (some? v)
       (or (not (string? v))
           (not (str/blank? v)))))

(s/defn ^:private validate-and-merge-params :- {s/Keyword s/Any}
  "Validate that the TOKEN-PARAMS passed in the JWT and the USER-PARAMS (passed as part of the URL) are allowed, and
  that ones that are required are specified by checking them against a Card or Dashboard's OBJECT-EMBEDDING-PARAMS
  (the object's value of `:embedding_params`). Throws a 400 if any of the checks fail. If all checks are successful,
  returns a *merged* parameters map."
  [object-embedding-params :- su/EmbeddingParams, token-params :- {s/Keyword s/Any}, user-params :- {s/Keyword s/Any}]
  (validate-param-sets object-embedding-params
                       (set (keys (m/filter-vals valid-param? token-params)))
                       (set (keys (m/filter-vals valid-param? user-params))))
  ;; ok, everything checks out, now return the merged params map
  (merge user-params token-params))


;;; ---------------------------------------------- Other Param Util Fns ----------------------------------------------

(defn- remove-params-in-set
  "Remove any PARAMS from the list whose `:slug` is in the PARAMS-TO-REMOVE set."
  [params params-to-remove]
  (for [param params
        :when (not (contains? params-to-remove (keyword (:slug param))))]
    param))

(s/defn ^:private remove-locked-and-disabled-params
  "Remove the `:parameters` for DASHBOARD-OR-CARD that listed as `disabled` or `locked` in the EMBEDDING-PARAMS
  whitelist, or not present in the whitelist. This is done so the frontend doesn't display widgets for params the user
  can't set."
  [dashboard-or-card, embedding-params :- su/EmbeddingParams]
  (let [params-to-remove (set (concat (for [[param status] embedding-params
                                            :when          (not= status "enabled")]
                                        param)
                                      (for [{slug :slug} (:parameters dashboard-or-card)
                                            :let         [param (keyword slug)]
                                            :when        (not (contains? embedding-params param))]
                                        param)))]
    (update dashboard-or-card :parameters remove-params-in-set params-to-remove)))

(defn- remove-token-parameters
  "Removes any parameters with slugs matching keys provided in TOKEN-PARAMS, as these should not be exposed to the user."
  [dashboard-or-card token-params]
  (update dashboard-or-card :parameters remove-params-in-set (set (keys token-params))))

(defn- template-tag-parameters
  "Transforms native query's `template_tags` into `parameters`."
  [card]
  ;; NOTE: this should mirror `getTemplateTagParameters` in frontend/src/metabase/meta/Parameter.js
  (for [[_ {tag-type :type, widget-type :widget_type, :as tag}] (get-in card [:dataset_query :native :template_tags])
        :when                         (and tag-type
                                           (or widget-type (not= tag-type "dimension")))]
    {:id      (:id tag)
     :type    (or widget-type (if (= tag-type "date") "date/single" "category"))
     :target  (if (= tag-type "dimension")
                ["dimension" ["template-tag" (:name tag)]]
                ["variable" ["template-tag" (:name tag)]])
     :name    (:display_name tag)
     :slug    (:name tag)
     :default (:default tag)}))

(defn- add-implicit-card-parameters
  "Add template tag parameter information to CARD's `:parameters`."
  [card]
  (update card :parameters concat (template-tag-parameters card)))

(s/defn ^:private apply-parameter-values :- (s/maybe [{:slug   su/NonBlankString
                                                       :type   su/NonBlankString
                                                       :target s/Any
                                                       :value  s/Any}])
  "Adds `value` to parameters with `slug` matching a key in `parameter-values` and removes parameters without a
   `value`."
  [parameters parameter-values]
  (when (seq parameters)
    (for [param parameters
          :let  [value (get parameter-values (keyword (:slug param)))]
          :when (some? value)]
      (assoc (select-keys param [:type :target :slug])
        :value value))))

(defn- resolve-card-parameters
  "Returns parameters for a card (HUH?)" ; TODO - better docstring
  [card-or-id]
  (-> (db/select-one [Card :dataset_query], :id (u/get-id card-or-id))
      add-implicit-card-parameters
      :parameters))

(defn- resolve-dashboard-parameters
  "Returns parameters for a card on a dashboard with `:target` resolved via `:parameter_mappings`."
  [dashboard-id dashcard-id card-id]
  (let [param-id->param (u/key-by :id (db/select-one-field :parameters Dashboard :id dashboard-id))]
    ;; throw a 404 if there's no matching DashboardCard so people can't get info about other Cards that aren't in this
    ;; Dashboard we don't need to check that card-id matches the DashboardCard because we might be trying to get param
    ;; info for a series belonging to this dashcard (card-id might be for a series)
    (for [param-mapping (api/check-404 (db/select-one-field :parameter_mappings DashboardCard
                                         :id           dashcard-id
                                         :dashboard_id dashboard-id))
          :when         (= (:card_id param-mapping) card-id)
          :let          [param (get param-id->param (:parameter_id param-mapping))]
          :when         param]
      (assoc param :target (:target param-mapping)))))

(s/defn ^:private normalize-query-params :- {s/Keyword s/Any}
  "Take a map of `query-params` and make sure they're in the right format for the rest of our code. Our
  `wrap-keyword-params` middleware normally converts all query params keys to keywords, but only if they seem like
  ones that make sense as keywords. Some params, such as ones that start with a number, do not pass this test, and are
  not automatically converted. Thus we must do it ourselves here to make sure things are done as we'd expect."
  [query-params]
  (m/map-keys keyword query-params))


;;; ---------------------------- Card Fns used by both /api/embed and /api/preview_embed -----------------------------

(defn card-for-unsigned-token
  "Return the info needed for embedding about Card specified in TOKEN.
   Additional CONSTRAINTS can be passed to the `public-card` function that fetches the Card."
  {:style/indent 1}
  [unsigned-token & {:keys [embedding-params constraints]}]
  (let [card-id        (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :question])
        token-params   (eu/get-in-unsigned-token-or-throw unsigned-token [:params])]
    (-> (apply public-api/public-card :id card-id, constraints)
        add-implicit-card-parameters
        (remove-token-parameters token-params)
        (remove-locked-and-disabled-params (or embedding-params
                                               (db/select-one-field :embedding_params Card :id card-id))))))

(defn run-query-for-card-with-params
  "Run the query associated with Card with CARD-ID using JWT TOKEN-PARAMS, user-supplied URL QUERY-PARAMS,
   an EMBEDDING-PARAMS whitelist, and additional query OPTIONS."
  {:style/indent 0}
  [& {:keys [card-id embedding-params token-params query-params options]}]
  {:pre [(integer? card-id) (u/maybe? map? embedding-params) (map? token-params) (map? query-params)]}
  (let [parameter-values (validate-and-merge-params embedding-params token-params (normalize-query-params query-params))
        parameters       (apply-parameter-values (resolve-card-parameters card-id) parameter-values)]
    (apply public-api/run-query-for-card-with-id card-id parameters, :context :embedded-question, options)))


;;; -------------------------- Dashboard Fns used by both /api/embed and /api/preview_embed --------------------------

(defn dashboard-for-unsigned-token
  "Return the info needed for embedding about Dashboard specified in TOKEN.
   Additional CONSTRAINTS can be passed to the `public-dashboard` function that fetches the Dashboard."
  {:style/indent 1}
  [unsigned-token & {:keys [embedding-params constraints]}]
  (let [dashboard-id (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])
        token-params (eu/get-in-unsigned-token-or-throw unsigned-token [:params])]
    (-> (apply public-api/public-dashboard :id dashboard-id, constraints)
        (remove-token-parameters token-params)
        (remove-locked-and-disabled-params (or embedding-params
                                               (db/select-one-field :embedding_params Dashboard, :id dashboard-id))))))

(defn dashcard-results
  "Return results for running the query belonging to a DashboardCard."
  {:style/indent 0}
  [& {:keys [dashboard-id dashcard-id card-id embedding-params token-params query-params]}]
  {:pre [(integer? dashboard-id) (integer? dashcard-id) (integer? card-id) (u/maybe? map? embedding-params)
         (map? token-params) (map? query-params)]}
  (let [parameter-values (validate-and-merge-params embedding-params token-params (normalize-query-params query-params))
        parameters       (apply-parameter-values (resolve-dashboard-parameters dashboard-id dashcard-id card-id)
                                                 parameter-values)]
    (public-api/public-dashcard-results dashboard-id card-id parameters, :context :embedded-dashboard)))


;;; ------------------------------------- Other /api/embed-specific utility fns --------------------------------------

(defn- check-embedding-enabled-for-object
  "Check that embedding is enabled, that OBJECT exists, and embedding for OBJECT is enabled."
  ([entity id]
   (check-embedding-enabled-for-object (db/select-one [entity :enable_embedding] :id id)))
  ([object]
   (api/check-embedding-enabled)
   (api/check-404 object)
   (api/check-not-archived object)
   (api/check (:enable_embedding object)
     [400 "Embedding is not enabled for this object."])))

(def ^:private ^{:arglists '([dashboard-id])} check-embedding-enabled-for-dashboard
  (partial check-embedding-enabled-for-object Dashboard))

(def ^:private ^{:arglists '([card-id])} check-embedding-enabled-for-card
  (partial check-embedding-enabled-for-object Card))


;;; ------------------------------------------- /api/embed/card endpoints --------------------------------------------

(api/defendpoint GET "/card/:token"
  "Fetch a Card via a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}}"
  [token]
  (let [unsigned (eu/unsign token)]
    (check-embedding-enabled-for-card (eu/get-in-unsigned-token-or-throw unsigned [:resource :question]))
    (card-for-unsigned-token unsigned, :constraints {:enable_embedding true})))


(defn- run-query-for-unsigned-token
  "Run the query belonging to Card identified by UNSIGNED-TOKEN. Checks that embedding is enabled both globally and
  for this Card."
  [unsigned-token query-params & options]
  (let [card-id (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (check-embedding-enabled-for-card card-id)
    (run-query-for-card-with-params
      :card-id          card-id
      :token-params     (eu/get-in-unsigned-token-or-throw unsigned-token [:params])
      :embedding-params (db/select-one-field :embedding_params Card :id card-id)
      :query-params     query-params
      :options          options)))


(api/defendpoint GET "/card/:token/query"
  "Fetch the results of running a Card using a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}
      :params   <parameters>}"
  [token & query-params]
  (run-query-for-unsigned-token (eu/unsign token) query-params))


(api/defendpoint GET ["/card/:token/query/:export-format", :export-format dataset-api/export-format-regex]
  "Like `GET /api/embed/card/query`, but returns the results as a file in the specified format."
  [token export-format & query-params]
  {export-format dataset-api/ExportFormat}
  (dataset-api/as-format export-format
    (run-query-for-unsigned-token (eu/unsign token) query-params, :constraints nil)))


;;; ----------------------------------------- /api/embed/dashboard endpoints -----------------------------------------


(api/defendpoint GET "/dashboard/:token"
  "Fetch a Dashboard via a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:dashboard <dashboard-id>}}"
  [token]
  (let [unsigned (eu/unsign token)]
    (check-embedding-enabled-for-dashboard (eu/get-in-unsigned-token-or-throw unsigned [:resource :dashboard]))
    (dashboard-for-unsigned-token unsigned, :constraints {:enable_embedding true})))



(defn- card-for-signed-token
  "Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
   `embedding-secret-key`.

   Token should have the following format:

     {:resource {:dashboard <dashboard-id>}
      :params   <parameters>}

   Additional dashboard parameters can be provided in the query string, but params in the JWT token take precedence."
  {:style/indent 1}
  [token dashcard-id card-id query-params]
  (let [unsigned-token (eu/unsign token)
        dashboard-id   (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])]
    (check-embedding-enabled-for-dashboard dashboard-id)
    (dashcard-results
      :dashboard-id     dashboard-id
      :dashcard-id      dashcard-id
      :card-id          card-id
      :embedding-params (db/select-one-field :embedding_params Dashboard :id dashboard-id)
      :token-params     (eu/get-in-unsigned-token-or-throw unsigned-token [:params])
      :query-params     query-params)))

(api/defendpoint GET "/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the `embedding-secret-key`"
  [token dashcard-id card-id & query-params]
  (card-for-signed-token token dashcard-id card-id query-params ))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        FieldValues, Search, Remappings                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; -------------------------------------------------- Field Values --------------------------------------------------

(api/defendpoint GET "/card/:token/field/:field-id/values"
  "Fetch FieldValues for a Field that is referenced by an embedded Card."
  [token field-id]
  (let [unsigned-token (eu/unsign token)
        card-id        (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (check-embedding-enabled-for-card card-id)
    (public-api/card-and-field-id->values card-id field-id)))

(api/defendpoint GET "/dashboard/:token/field/:field-id/values"
  "Fetch FieldValues for a Field that is used as a param in an embedded Dashboard."
  [token field-id]
  (let [unsigned-token (eu/unsign token)
        dashboard-id   (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])]
    (check-embedding-enabled-for-dashboard dashboard-id)
    (public-api/dashboard-and-field-id->values dashboard-id field-id)))


;;; --------------------------------------------------- Searching ----------------------------------------------------

(api/defendpoint GET "/card/:token/field/:field-id/search/:search-field-id"
  "Search for values of a Field that is referenced by an embedded Card."
  [token field-id search-field-id value limit]
  {value su/NonBlankString
   limit (s/maybe su/IntStringGreaterThanZero)}
  (let [unsigned-token (eu/unsign token)
        card-id        (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (check-embedding-enabled-for-card card-id)
    (public-api/search-card-fields card-id field-id search-field-id value (when limit (Integer/parseInt limit)))))

(api/defendpoint GET "/dashboard/:token/field/:field-id/search/:search-field-id"
  "Search for values of a Field that is referenced by a Card in an embedded Dashboard."
  [token field-id search-field-id value limit]
  {value su/NonBlankString
   limit (s/maybe su/IntStringGreaterThanZero)}
  (let [unsigned-token (eu/unsign token)
        dashboard-id   (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])]
    (check-embedding-enabled-for-dashboard dashboard-id)
    (public-api/search-dashboard-fields dashboard-id field-id search-field-id value (when limit
                                                                                      (Integer/parseInt limit)))))


;;; --------------------------------------------------- Remappings ---------------------------------------------------

(api/defendpoint GET "/card/:token/field/:field-id/remapping/:remapped-id"
  "Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with
  embedded Cards."
  [token field-id remapped-id value]
  {value su/NonBlankString}
  (let [unsigned-token (eu/unsign token)
        card-id        (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (check-embedding-enabled-for-card card-id)
    (public-api/card-field-remapped-values card-id field-id remapped-id value)))

(api/defendpoint GET "/dashboard/:token/field/:field-id/remapping/:remapped-id"
  "Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with
  embedded Dashboards."
  [token field-id remapped-id value]
  {value su/NonBlankString}
  (let [unsigned-token (eu/unsign token)
        dashboard-id   (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])]
    (check-embedding-enabled-for-dashboard dashboard-id)
    (public-api/dashboard-field-remapped-values dashboard-id field-id remapped-id value)))


(api/defendpoint GET ["/dashboard/:token/dashcard/:dashcard-id/card/:card-id/:export-format",
                      :export-format dataset-api/export-format-regex]
  "Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the `embedding-secret-key`
   return the data in one of the export formats"
  [token export-format dashcard-id card-id & query-params]
  {export-format dataset-api/ExportFormat}
  (dataset-api/as-format export-format (card-for-signed-token token dashcard-id card-id query-params )))

(api/define-routes)
