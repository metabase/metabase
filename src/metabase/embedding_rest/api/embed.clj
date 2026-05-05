(ns metabase.embedding-rest.api.embed
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
   [metabase.api.macros :as api.macros]
   [metabase.database-routing.core :as database-routing]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.embedding-rest.api.common :as api.embed.common]
   [metabase.embedding.jwt :as embedding.jwt]
   [metabase.events.core :as events]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.request.core :as request]
   [metabase.tiles.api :as api.tiles]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private ResourceId [:or ms/PositiveInt ms/NanoIdString])
(def ^:private Token [:map
                      [:resource [:map
                                  [:question {:optional true} ResourceId]
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
      (conditional-update-in [:resource :question] #(eid-translation/->id :model/Card %))
      (conditional-update-in [:resource :dashboard] #(eid-translation/->id :model/Dashboard %))))

(defn unsign-and-translate-ids
  "Unsign a JWT and translate `entity_id` keys to `card_id` and `dashboard_id` respectively. If they are already
   sequential ids, they are left as is."
  [message]
  (translate-token-ids (embedding.jwt/unsign message)))

;;; ------------------------------------------- /api/embed/card endpoints --------------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/card/:token"
  "Fetch a Card via a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}}"
  [{:keys [token]} :- [:map
                       [:token api.embed.common/EncodedToken]]]
  (let [unsigned (unsign-and-translate-ids token)]
    (api.embed.common/check-embedding-enabled-for-card (embedding.jwt/get-in-unsigned-token-or-throw unsigned [:resource :question]))
    (api.embed.common/card-for-unsigned-token unsigned, :constraints [:enable_embedding true])))

(defn ^:private run-query-for-unsigned-token-async
  "Run the query belonging to Card identified by `unsigned-token`. Checks that embedding is enabled both globally and
  for this Card. Returns core.async channel to fetch the results."
  [unsigned-token export-format query-params & {:keys [constraints qp]
                                                :or {constraints (qp.constraints/default-query-constraints)
                                                     qp qp.card/process-query-for-card-default-qp}
                                                :as options}]
  (let [card-id (embedding.jwt/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (api.embed.common/check-embedding-enabled-for-card card-id)
    (database-routing/with-database-routing-off
      (api.embed.common/process-query-for-card-with-params
       :export-format export-format
       :card-id card-id
       :token-params (embedding.jwt/get-in-unsigned-token-or-throw unsigned-token [:params])
       :embedding-params (t2/select-one-fn :embedding_params :model/Card :id card-id)
       :query-params (api.embed.common/parse-query-params (dissoc query-params :format_rows :pivot_results))
       :qp qp
       :constraints constraints
       :options options))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/card/:token/query"
  "Fetch the results of running a Card using a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}
      :params   <parameters>}"
  [{:keys [token]} :- [:map
                       [:token api.embed.common/EncodedToken]]
   query-params :- :map]
  (run-query-for-unsigned-token-async (unsign-and-translate-ids token) :api (api.embed.common/parse-query-params query-params)))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/card/:token/query/:export-format"
  "Like `GET /api/embed/card/query`, but returns the results as a file in the specified format."
  [{:keys [token export-format]} :- [:map
                                     [:token api.embed.common/EncodedToken]
                                     [:export-format ::qp.schema/export-format]]
   {format-rows? :format_rows
    pivot? :pivot_results
    :as query-params} :- [:map
                          [:format_rows {:default false} :boolean]
                          [:pivot_results {:default false} :boolean]]]
  (run-query-for-unsigned-token-async
   (unsign-and-translate-ids token)
   export-format
   (api.embed.common/parse-query-params (dissoc query-params :format_rows :pivot_results))
   :constraints nil
   :middleware {:process-viz-settings? true
                :js-int-to-string? false
                :format-rows? format-rows?
                :pivot? pivot?}))

;;; ----------------------------------------- /api/embed/dashboard endpoints -----------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:token"
  "Fetch a Dashboard via a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:dashboard <dashboard-id>}}"
  [{:keys [token]} :- [:map
                       [:token api.embed.common/EncodedToken]]]
  (let [unsigned (unsign-and-translate-ids token)]
    (api.embed.common/check-embedding-enabled-for-dashboard (embedding.jwt/get-in-unsigned-token-or-throw unsigned [:resource :dashboard]))
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
      :or {constraints (qp.constraints/default-query-constraints)
           qp qp.card/process-query-for-card-default-qp}}]
  (let [unsigned-token (unsign-and-translate-ids token)
        dashboard-id (embedding.jwt/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])]
    (api.embed.common/check-embedding-enabled-for-dashboard dashboard-id)
    (database-routing/with-database-routing-off
      (api.embed.common/process-query-for-dashcard
       :export-format export-format
       :dashboard-id dashboard-id
       :dashcard-id dashcard-id
       :card-id card-id
       :embedding-params (t2/select-one-fn :embedding_params :model/Dashboard :id dashboard-id)
       :token-params (embedding.jwt/get-in-unsigned-token-or-throw unsigned-token [:params])
       :query-params (api.embed.common/parse-query-params (dissoc query-params :format_rows :pivot_results))
       :constraints constraints
       :qp qp
       :middleware middleware))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
  `embedding-secret-key`"
  [{:keys [token dashcard-id card-id]} :- [:map
                                           [:token api.embed.common/EncodedToken]
                                           [:dashcard-id ms/PositiveInt]
                                           [:card-id ms/PositiveInt]]
   query-params :- :map]
  (process-query-for-dashcard-with-signed-token token dashcard-id card-id :api
                                                (api.embed.common/parse-query-params query-params)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        FieldValues, Search, Remappings                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; --------------------------------------------------- Remappings ---------------------------------------------------

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:token/dashcard/:dashcard-id/card/:card-id/:export-format"
  "Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
  `embedding-secret-key` return the data in one of the export formats"
  [{:keys [token dashcard-id card-id export-format]} :- [:map
                                                         [:token api.embed.common/EncodedToken]
                                                         [:dashcard-id ms/PositiveInt]
                                                         [:card-id ms/PositiveInt]
                                                         [:export-format ::qp.schema/export-format]]
   {format-rows? :format_rows
    pivot? :pivot_results
    :as query-params} :- [:map
                          [:format_rows {:default false} :boolean]
                          [:pivot_results {:default false} :boolean]]]
  (process-query-for-dashcard-with-signed-token token
                                                dashcard-id
                                                card-id
                                                export-format
                                                (api.embed.common/parse-query-params (dissoc query-params :format_rows :pivot_results))
                                                :constraints nil
                                                :middleware {:process-viz-settings? true
                                                             :js-int-to-string? false
                                                             :format-rows? format-rows?
                                                             :pivot? pivot?}))

;;; ----------------------------------------------- Param values -------------------------------------------------

;; embedding parameters in `:embedding_params` and the JWT are keyed by `:slug`; the chain filter endpoints instead
;; key by `:id`. So we need to do a little conversion back and forth below.
;;
;; variables whose name includes `id-` e.g. `id-query-params` below are ones that are keyed by ID; ones whose name
;; includes `slug-` are keyed by slug.

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:token/params/:param-key/values"
  "Embedded version of chain filter values endpoint."
  [{:keys [token param-key]} :- [:map
                                 [:token api.embed.common/EncodedToken]
                                 [:param-key ms/NonBlankString]]
   query-params]
  (api.embed.common/dashboard-param-values token param-key nil
                                           (api.embed.common/parse-query-params query-params)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:token/params/:param-key/search/:prefix"
  "Embedded version of chain filter search endpoint."
  [{:keys [token param-key prefix]} :- api.embed.common/SearchParams
   query-params]
  (api.embed.common/dashboard-param-values token param-key prefix
                                           (api.embed.common/parse-query-params query-params)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:token/params/:param-key/remapping"
  "Embedded version of the remapped dashboard param value endpoint."
  [{:keys [token param-key]} :- [:map
                                 [:token api.embed.common/EncodedToken]
                                 [:param-key ms/NonBlankString]]
   {:keys [value]}]
  (api.embed.common/dashboard-param-remapped-value token param-key (codec/url-decode value)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/card/:token/params/:param-key/values"
  "Embedded version of api.card filter values endpoint."
  [{:keys [token param-key]} :- [:map
                                 [:token api.embed.common/EncodedToken]
                                 [:param-key ms/NonBlankString]]]
  (let [unsigned (unsign-and-translate-ids token)
        card-id (embedding.jwt/get-in-unsigned-token-or-throw unsigned [:resource :question])
        card (t2/select-one :model/Card :id card-id)]
    (api.embed.common/check-embedding-enabled-for-card card-id)
    (api.embed.common/card-param-values {:unsigned-token unsigned
                                         :card card
                                         :param-key param-key})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/card/:token/params/:param-key/search/:prefix"
  "Embedded version of chain filter search endpoint."
  [{:keys [token param-key prefix]} :- api.embed.common/SearchParams]
  (let [unsigned (unsign-and-translate-ids token)
        card-id (embedding.jwt/get-in-unsigned-token-or-throw unsigned [:resource :question])
        card (t2/select-one :model/Card :id card-id)]
    (api.embed.common/check-embedding-enabled-for-card card-id)
    (api.embed.common/card-param-values {:unsigned-token unsigned
                                         :card card
                                         :param-key param-key
                                         :search-prefix prefix})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/card/:token/params/:param-key/remapping"
  "Embedded version of api.card filter values endpoint."
  [{:keys [token param-key]} :- [:map
                                 [:token api.embed.common/EncodedToken]
                                 [:param-key ms/NonBlankString]]
   {:keys [value]} :- [:map [:value :string]]]
  (let [unsigned (unsign-and-translate-ids token)
        card-id (embedding.jwt/get-in-unsigned-token-or-throw unsigned [:resource :question])
        card (t2/select-one :model/Card :id card-id)]
    (api.embed.common/check-embedding-enabled-for-card card-id)
    (api.embed.common/card-param-remapped-value {:unsigned-token unsigned
                                                 :card card
                                                 :param-key param-key
                                                 :value (codec/url-decode value)})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/pivot/card/:token/query"
  "Fetch the results of running a Card using a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}
      :params   <parameters>}"
  [{:keys [token]} :- [:map
                       [:token api.embed.common/EncodedToken]]
   query-params :- :map]
  (run-query-for-unsigned-token-async (unsign-and-translate-ids token)
                                      :api (api.embed.common/parse-query-params query-params)
                                      :qp qp.pivot/run-pivot-query))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/pivot/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
  `embedding-secret-key`"
  [{:keys [token dashcard-id card-id]} :- [:map
                                           [:token api.embed.common/EncodedToken]
                                           [:dashcard-id ms/PositiveInt]
                                           [:card-id ms/PositiveInt]]
   query-params :- :map]
  (process-query-for-dashcard-with-signed-token token dashcard-id card-id
                                                :api (api.embed.common/parse-query-params query-params)
                                                :qp qp.pivot/run-pivot-query))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/tiles/card/:token/:zoom/:x/:y"
  "Generates a single tile image for an embedded Card using the map visualization."
  [{:keys [token zoom x y]}
   :- [:map
       [:token api.embed.common/EncodedToken]
       [:zoom ms/Int]
       [:x ms/Int]
       [:y ms/Int]]
   {:keys [parameters latField lonField]}
   :- [:map
       [:parameters {:optional true} ms/JSONString]
       [:latField string?]
       [:lonField string?]]]
  (let [unsigned (unsign-and-translate-ids token)
        card-id (api.embed.common/unsigned-token->card-id unsigned)
        parameters (when parameters (json/decode+kw parameters))
        lat-field (json/decode+kw latField)
        lon-field (json/decode+kw lonField)]
    (api.embed.common/check-embedding-enabled-for-card card-id)
    (request/as-admin
      (api.tiles/process-tiles-query-for-card card-id parameters zoom x y lat-field lon-field))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/tiles/dashboard/:token/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y"
  "Generates a single tile image for a Card on an embedded Dashboard using the map visualization."
  [{:keys [token dashcard-id card-id zoom x y]}
   :- [:map
       [:token api.embed.common/EncodedToken]
       [:dashcard-id ms/PositiveInt]
       [:card-id ms/PositiveInt]
       [:zoom ms/Int]
       [:x ms/Int]
       [:y ms/Int]]
   {:keys [parameters latField lonField]}
   :- [:map
       [:parameters {:optional true} ms/JSONString]
       [:latField string?]
       [:lonField string?]]]
  (let [unsigned (unsign-and-translate-ids token)
        dashboard-id (api.embed.common/unsigned-token->dashboard-id unsigned)
        parameters (when parameters (json/decode+kw parameters))
        lat-field (json/decode+kw latField)
        lon-field (json/decode+kw lonField)]
    (api.embed.common/check-embedding-enabled-for-dashboard dashboard-id)
    (request/as-admin
      (api.tiles/process-tiles-query-for-dashcard dashboard-id dashcard-id card-id parameters zoom x y lat-field lon-field))))
