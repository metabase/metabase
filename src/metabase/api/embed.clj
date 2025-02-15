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
   [metabase.api.common :as api]
   [metabase.api.dataset :as api.dataset]
   [metabase.api.embed.common :as api.embed.common]
   [metabase.api.macros :as api.macros]
   [metabase.events :as events]
   [metabase.public-sharing.api :as api.public]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.tiles.api :as api.tiles]
   [metabase.util :as u]
   [metabase.util.embed :as embed]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private ResourceId [:or ms/PositiveInt ms/NanoIdString])
(def ^:private Token [:map
                      [:resource [:map
                                  [:question  {:optional true} ResourceId]
                                  [:dashboard {:optional true} ResourceId]]]
                      [:params :any]])

(defn- conditional-update-in
  "If there's a value at `path`, apply `f`, otherwise return `m`."
  [m path f]
  (if-let [value (get-in m path)]
    (assoc-in m path (f value))
    m))

(mu/defn translate-token-ids :- Token
  "Translate `entity_id` keys to `card_id` and `dashboard_id` respectively."
  [unsigned :- Token]
  (-> unsigned
      (conditional-update-in [:resource :question]  #(api.embed.common/->id :model/Card %))
      (conditional-update-in [:resource :dashboard] #(api.embed.common/->id :model/Dashboard %))))

(defn unsign-and-translate-ids
  "Unsign a JWT and translate `entity_id` keys to `card_id` and `dashboard_id` respectively. If they are already
   sequential ids, they are left as is."
  [message]
  (translate-token-ids (embed/unsign message)))

;;; ------------------------------------------- /api/embed/card endpoints --------------------------------------------

(api.macros/defendpoint :get "/card/:token"
  "Fetch a Card via a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}}"
  [{:keys [token]} :- [:map
                       [:token string?]]]
  (let [unsigned (unsign-and-translate-ids token)]
    (api.embed.common/check-embedding-enabled-for-card (embed/get-in-unsigned-token-or-throw unsigned [:resource :question]))
    (u/prog1 (api.embed.common/card-for-unsigned-token unsigned, :constraints [:enable_embedding true])
      (events/publish-event! :event/card-read {:object-id (:id <>), :user-id api/*current-user-id*, :context :question}))))

(defn ^:private run-query-for-unsigned-token-async
  "Run the query belonging to Card identified by `unsigned-token`. Checks that embedding is enabled both globally and
  for this Card. Returns core.async channel to fetch the results."
  [unsigned-token export-format query-params & {:keys [constraints qp]
                                                :or   {constraints (qp.constraints/default-query-constraints)
                                                       qp          qp.card/process-query-for-card-default-qp}
                                                :as   options}]
  (let [card-id (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (api.embed.common/check-embedding-enabled-for-card card-id)
    (api.embed.common/process-query-for-card-with-params
     :export-format     export-format
     :card-id           card-id
     :token-params      (embed/get-in-unsigned-token-or-throw unsigned-token [:params])
     :embedding-params  (t2/select-one-fn :embedding_params :model/Card :id card-id)
     :query-params      (api.embed.common/parse-query-params (dissoc query-params :format_rows :pivot_results))
     :qp                qp
     :constraints       constraints
     :options           options)))

(api.macros/defendpoint :get "/card/:token/query"
  "Fetch the results of running a Card using a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}
      :params   <parameters>}"
  [{:keys [token]} :- [:map
                       [:token string?]]
   query-params :- :map]
  (run-query-for-unsigned-token-async (unsign-and-translate-ids token) :api (api.embed.common/parse-query-params query-params)))

(api.macros/defendpoint :get ["/card/:token/query/:export-format", :export-format api.dataset/export-format-regex]
  "Like `GET /api/embed/card/query`, but returns the results as a file in the specified format."
  [{:keys [token export-format]} :- [:map
                                     [:token         string?]
                                     [:export-format (into [:enum] api.dataset/export-formats)]]
   {format-rows? :format_rows
    pivot?       :pivot_results
    :as          query-params} :- [:map
                                   [:format_rows   {:default false} :boolean]
                                   [:pivot_results {:default false} :boolean]]]
  (run-query-for-unsigned-token-async
   (unsign-and-translate-ids token)
   export-format
   (api.embed.common/parse-query-params (dissoc query-params :format_rows :pivot_results))
   :constraints nil
   :middleware {:process-viz-settings? true
                :js-int-to-string?     false
                :format-rows?          format-rows?
                :pivot?                pivot?}))

;;; ----------------------------------------- /api/embed/dashboard endpoints -----------------------------------------

(api.macros/defendpoint :get "/dashboard/:token"
  "Fetch a Dashboard via a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:dashboard <dashboard-id>}}"
  [{:keys [token]} :- [:map
                       [:token string?]]]
  (let [unsigned (unsign-and-translate-ids token)]
    (api.embed.common/check-embedding-enabled-for-dashboard (embed/get-in-unsigned-token-or-throw unsigned [:resource :dashboard]))
    (u/prog1 (api.embed.common/dashboard-for-unsigned-token unsigned, :constraints [:enable_embedding true])
      (events/publish-event! :event/dashboard-read {:object-id (:id <>), :user-id api/*current-user-id*}))))

(defn- process-query-for-dashcard-with-signed-token
  "Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
   `embedding-secret-key`.

   [[Token]] should have the following format:

     {:resource {:dashboard <dashboard-id>}
      :params   <parameters>}

  Additional dashboard parameters can be provided in the query string, but params in the JWT token take precedence.

  Returns a `StreamingResponse`."
  [token dashcard-id card-id export-format query-params
   & {:keys [constraints qp middleware]
      :or   {constraints (qp.constraints/default-query-constraints)
             qp          qp.card/process-query-for-card-default-qp}}]
  (let [unsigned-token (unsign-and-translate-ids token)
        dashboard-id   (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])]
    (api.embed.common/check-embedding-enabled-for-dashboard dashboard-id)
    (api.embed.common/process-query-for-dashcard
     :export-format    export-format
     :dashboard-id     dashboard-id
     :dashcard-id      dashcard-id
     :card-id          card-id
     :embedding-params (t2/select-one-fn :embedding_params :model/Dashboard :id dashboard-id)
     :token-params     (embed/get-in-unsigned-token-or-throw unsigned-token [:params])
     :query-params     (api.embed.common/parse-query-params (dissoc query-params :format_rows :pivot_results))
     :constraints      constraints
     :qp               qp
     :middleware       middleware)))

(api.macros/defendpoint :get "/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
  `embedding-secret-key`"
  [{:keys [token dashcard-id card-id]} :- [:map
                                           [:token       string?]
                                           [:dashcard-id ms/PositiveInt]
                                           [:card-id     ms/PositiveInt]]
   query-params :- :map]
  (u/prog1 (process-query-for-dashcard-with-signed-token token dashcard-id card-id :api
                                                         (api.embed.common/parse-query-params query-params))
    (events/publish-event! :event/card-read {:object-id card-id, :user-id api/*current-user-id*, :context :dashboard})))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        FieldValues, Search, Remappings                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; -------------------------------------------------- Field Values --------------------------------------------------

(api.macros/defendpoint :get "/card/:token/field/:field-id/values"
  "Fetch FieldValues for a Field that is referenced by an embedded Card."
  [{:keys [token field-id]} :- [:map
                                [:token    string?]
                                [:field-id ms/PositiveInt]]]
  (let [unsigned-token (unsign-and-translate-ids token)
        card-id        (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (api.embed.common/check-embedding-enabled-for-card card-id)
    (api.public/card-and-field-id->values card-id field-id)))

(api.macros/defendpoint :get "/dashboard/:token/field/:field-id/values"
  "Fetch FieldValues for a Field that is used as a param in an embedded Dashboard."
  [{:keys [token field-id]} :- [:map
                                [:token    string?]
                                [:field-id ms/PositiveInt]]]
  (let [unsigned-token (unsign-and-translate-ids token)
        dashboard-id   (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])]
    (api.embed.common/check-embedding-enabled-for-dashboard dashboard-id)
    (api.public/dashboard-and-field-id->values dashboard-id field-id)))

;;; --------------------------------------------------- Searching ----------------------------------------------------

(api.macros/defendpoint :get "/card/:token/field/:field-id/search/:search-field-id"
  "Search for values of a Field that is referenced by an embedded Card."
  [{:keys [token field-id search-field-id]} :- [:map
                                                [:token           string?]
                                                [:field-id        ms/PositiveInt]
                                                [:search-field-id ms/PositiveInt]]
   {:keys [value limit]} :- [:map
                             [:value ms/NonBlankString]
                             [:limit {:optional true} [:maybe ms/PositiveInt]]]]
  (let [unsigned-token (unsign-and-translate-ids token)
        card-id        (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (api.embed.common/check-embedding-enabled-for-card card-id)
    (api.public/search-card-fields card-id field-id search-field-id value (when limit (Integer/parseInt limit)))))

(api.macros/defendpoint :get "/dashboard/:token/field/:field-id/search/:search-field-id"
  "Search for values of a Field that is referenced by a Card in an embedded Dashboard."
  [{:keys [token field-id search-field-id]} :- [:map
                                                [:token           string?]
                                                [:field-id        ms/PositiveInt]
                                                [:search-field-id ms/PositiveInt]]
   {:keys [value limit]} :- [:map
                             [:value ms/NonBlankString]
                             [:limit {:optional true} [:maybe ms/PositiveInt]]]]
  (let [unsigned-token (unsign-and-translate-ids token)
        dashboard-id   (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])]
    (api.embed.common/check-embedding-enabled-for-dashboard dashboard-id)
    (api.public/search-dashboard-fields dashboard-id field-id search-field-id value (when limit
                                                                                      (Integer/parseInt limit)))))

;;; --------------------------------------------------- Remappings ---------------------------------------------------

(api.macros/defendpoint :get "/card/:token/field/:field-id/remapping/:remapped-id"
  "Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with
  embedded Cards."
  [{:keys [token field-id remapped-id]} :- [:map
                                            [:token       string?]
                                            [:field-id    ms/PositiveInt]
                                            [:remapped-id ms/PositiveInt]]
   {:keys [value]} :- [:map
                       [:value ms/NonBlankString]]]
  (let [unsigned-token (unsign-and-translate-ids token)
        card-id        (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (api.embed.common/check-embedding-enabled-for-card card-id)
    (api.public/card-field-remapped-values card-id field-id remapped-id value)))

(api.macros/defendpoint :get "/dashboard/:token/field/:field-id/remapping/:remapped-id"
  "Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with
  embedded Dashboards."
  [{:keys [token field-id remapped-id]} :- [:map
                                            [:token       string?]
                                            [:field-id    ms/PositiveInt]
                                            [:remapped-id ms/PositiveInt]]
   {:keys [value]} :- [:map
                       [:value ms/NonBlankString]]]
  (let [unsigned-token (unsign-and-translate-ids token)
        dashboard-id   (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])]
    (api.embed.common/check-embedding-enabled-for-dashboard dashboard-id)
    (api.public/dashboard-field-remapped-values dashboard-id field-id remapped-id value)))

(api.macros/defendpoint :get ["/dashboard/:token/dashcard/:dashcard-id/card/:card-id/:export-format"
                              :export-format api.dataset/export-format-regex]
  "Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
  `embedding-secret-key` return the data in one of the export formats"
  [{:keys [token dashcard-id card-id export-format]} :- [:map
                                                         [:dashcard-id   ms/PositiveInt]
                                                         [:card-id       ms/PositiveInt]
                                                         [:export-format (into [:enum] api.dataset/export-formats)]]
   {format-rows? :format_rows
    pivot?       :pivot_results
    :as          query-params} :- [:map
                                   [:format_rows   {:default false} :boolean]
                                   [:pivot_results {:default false} :boolean]]]
  (process-query-for-dashcard-with-signed-token token
                                                dashcard-id
                                                card-id
                                                export-format
                                                (api.embed.common/parse-query-params (dissoc query-params :format_rows :pivot_results))
                                                :constraints nil
                                                :middleware {:process-viz-settings? true
                                                             :js-int-to-string?     false
                                                             :format-rows?          format-rows?
                                                             :pivot?                pivot?}))

;;; ----------------------------------------------- Param values -------------------------------------------------

;; embedding parameters in `:embedding_params` and the JWT are keyed by `:slug`; the chain filter endpoints instead
;; key by `:id`. So we need to do a little conversion back and forth below.
;;
;; variables whose name includes `id-` e.g. `id-query-params` below are ones that are keyed by ID; ones whose name
;; includes `slug-` are keyed by slug.

(api.macros/defendpoint :get "/dashboard/:token/params/:param-key/values"
  "Embedded version of chain filter values endpoint."
  [{:keys [token param-key]} :- [:map
                                 [:token     string?]
                                 [:param-key string?]]
   query-params]
  (api.embed.common/dashboard-param-values token param-key nil
                                           (api.embed.common/parse-query-params query-params)))

(api.macros/defendpoint :get "/dashboard/:token/params/:param-key/search/:prefix"
  "Embedded version of chain filter search endpoint."
  [{:keys [token param-key prefix]}
   query-params]
  (api.embed.common/dashboard-param-values token param-key prefix
                                           (api.embed.common/parse-query-params query-params)))

(api.macros/defendpoint :get "/card/:token/params/:param-key/values"
  "Embedded version of api.card filter values endpoint."
  [{:keys [token param-key]} :- [:map
                                 [:token     string?]
                                 [:param-key string?]]]
  (let [unsigned (unsign-and-translate-ids token)
        card-id  (embed/get-in-unsigned-token-or-throw unsigned [:resource :question])
        card     (t2/select-one :model/Card :id card-id)]
    (api.embed.common/check-embedding-enabled-for-card card-id)
    (api.embed.common/card-param-values {:unsigned-token unsigned
                                         :card           card
                                         :param-key      param-key})))

(api.macros/defendpoint :get "/card/:token/params/:param-key/search/:prefix"
  "Embedded version of chain filter search endpoint."
  [{:keys [token param-key prefix]}] :- [:map
                                         [:token     string?]
                                         [:param-key string?]
                                         [:prefix    string?]]
  (let [unsigned (unsign-and-translate-ids token)
        card-id  (embed/get-in-unsigned-token-or-throw unsigned [:resource :question])
        card     (t2/select-one :model/Card :id card-id)]
    (api.embed.common/check-embedding-enabled-for-card card-id)
    (api.embed.common/card-param-values {:unsigned-token unsigned
                                         :card           card
                                         :param-key      param-key
                                         :search-prefix  prefix})))

(api.macros/defendpoint :get "/pivot/card/:token/query"
  "Fetch the results of running a Card using a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}
      :params   <parameters>}"
  [{:keys [token]} :- [:map
                       [:token string?]]
   query-params    :- :map]
  (run-query-for-unsigned-token-async (unsign-and-translate-ids token)
                                      :api (api.embed.common/parse-query-params query-params)
                                      :qp qp.pivot/run-pivot-query))

(api.macros/defendpoint :get "/pivot/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
  `embedding-secret-key`"
  [{:keys [token dashcard-id card-id]} :- [:map
                                           [:token       string?]
                                           [:dashcard-id ms/PositiveInt]
                                           [:card-id     ms/PositiveInt]]
   query-params :- :map]
  (u/prog1 (process-query-for-dashcard-with-signed-token token dashcard-id card-id
                                                         :api (api.embed.common/parse-query-params query-params)
                                                         :qp qp.pivot/run-pivot-query)
    (events/publish-event! :event/card-read {:object-id card-id, :user-id api/*current-user-id*, :context :dashboard})))

(api.macros/defendpoint :get "/tiles/card/:token/:zoom/:x/:y/:lat-field/:lon-field"
  "Generates a single tile image for an embedded Card using the map visualization."
  [{:keys [token zoom x y lat-field lon-field]}
   :- [:merge
       :api.tiles/route-params
       [:map
        [:token string?]]]
   {:keys [parameters]}
   :- [:map
       [:parameters {:optional true} ms/JSONString]]]
  (let [unsigned   (unsign-and-translate-ids token)
        card-id    (embed/get-in-unsigned-token-or-throw unsigned [:resource :question])
        parameters (json/decode+kw parameters)]
    (api.embed.common/check-embedding-enabled-for-card card-id)
    (api.tiles/process-tiles-query-for-card card-id parameters zoom x y lat-field lon-field)))

(api.macros/defendpoint :get "/tiles/dashboard/:token/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y/:lat-field/:lon-field"
  "Generates a single tile image for a Card on an embedded Dashboard using the map visualization."
  [{:keys [token dashcard-id card-id zoom x y lat-field lon-field]}
   :- [:merge
       :api.tiles/route-params
       [:map
        [:token       string?]
        [:dashcard-id ms/PositiveInt]
        [:card-id     ms/PositiveInt]]]
   {:keys [parameters]}
   :- [:map
       [:parameters {:optional true} ms/JSONString]]]
  (let [unsigned     (unsign-and-translate-ids token)
        dashboard-id (embed/get-in-unsigned-token-or-throw unsigned [:resource :dashboard])
        parameters   (json/decode+kw parameters)]
    (api.tiles/process-tiles-query-for-dashcard dashboard-id dashcard-id card-id parameters zoom x y lat-field lon-field)))
