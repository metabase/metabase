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
   [malli.core :as mc]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.embedding-rest.api.common :as api.embed.common]
   [metabase.embedding-rest.db :as embedding-rest.db]
   [metabase.embedding.jwt :as embedding.jwt]
   [metabase.events.core :as events]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.public-sharing-rest.api :as api.public]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.request.core :as request]
   [metabase.tiles.api :as api.tiles]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]))

(set! *warn-on-reflection* true)

(def ^:private ResourceId
  "An id or entity_id identifying a Card or Dashboard in a JWT `:resource`."
  [:or ms/PositiveInt ms/NanoIdString])
(def ^:private Token
  "An embedding JWT payload naming its `:resource` and `:params`, whose other claims (`exp`, `iat`, ...) belong to the embedding application."
  [:map {:closed false, :description "embedding JWT claims"}
   [:resource [:map {:closed true}
               [:question {:optional true} ResourceId]
               [:dashboard {:optional true} ResourceId]]]
   [:params api.embed.common/SlugValueMap]])

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
  [{:keys [token]} :- [:map {:closed true}
                       [:token api.embed.common/EncodedToken]]]
  (let [unsigned (unsign-and-translate-ids token)
        card-id  (api.embed.common/unsigned-token->card-id unsigned)]
    (api.embed.common/check-embedding-enabled-for-card (api/check-404 (embedding-rest.db/card-embedding-flags card-id)))
    (api.embed.common/card-for-unsigned-token unsigned :enable-embedding? true)))

(defn- resolve-card-context
  "Resolve the context shared by the card chart routes and `GET /card/:token/goal-values`: unsign `token`, look up its
  Card, check embedding is enabled for it, and validate the token params and raw `query-params` against its
  `embedding_params`. Throws the same 400/404 for both."
  [token query-params]
  (let [unsigned-token (unsign-and-translate-ids token)
        query-params   (api.embed.common/parse-query-params query-params)
        card-id        (api.embed.common/unsigned-token->card-id unsigned-token)
        card           (api/check-404 (embedding-rest.db/card card-id))]
    (api.embed.common/check-embedding-enabled-for-card card)
    (api.embed.common/card-context card
                                   (:embedding_params card)
                                   (embedding.jwt/get-in-unsigned-token-or-throw unsigned-token [:params])
                                   query-params)))

(defn ^:private run-query-for-card-token-async
  "Run the query belonging to the Card identified by `token`. Returns a `StreamingResponse`."
  [token export-format query-params & {:keys [constraints qp]
                                       :or {constraints (qp.constraints/default-query-constraints)
                                            qp qp.card/process-query-for-card-default-qp}
                                       :as options}]
  (api.embed.common/process-query-for-card-context
   (resolve-card-context token query-params)
   :export-format export-format
   :qp qp
   :constraints constraints
   :options options))

(api.macros/defendpoint :get "/card/:token/query"
  :- ::api.public/query-result-response
  "Fetch the results of running a Card using a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}
      :params   <parameters>}"
  [{:keys [token]} :- [:map {:closed true}
                       [:token api.embed.common/EncodedToken]]
   query-params :- api.embed.common/QueryParams]
  (run-query-for-card-token-async token :api query-params))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/card/:token/query/:export-format"
  :- (qp.streaming/export-response-schema ::api.public/query-result)
  "Like `GET /api/embed/card/query`, but returns the results as a file in the specified format."
  [{:keys [token export-format]} :- [:map {:closed true}
                                     [:token api.embed.common/EncodedToken]
                                     [:export-format ::qp.schema/export-format]]
   {format-rows? :format_rows
    pivot? :pivot_results
    :as query-params} :- [:map
                          [:format_rows {:default false} :boolean]
                          [:pivot_results {:default false} :boolean]
                          [::mc/default api.embed.common/QueryParams]]]
  (run-query-for-card-token-async
   token
   export-format
   (dissoc query-params :format_rows :pivot_results)
   :constraints nil
   :middleware {:process-viz-settings? true
                :js-int-to-string? false
                :format-rows? format-rows?
                :pivot? pivot?}))

(api.macros/defendpoint :get "/card/:token/goal-values"
  :- ::api.public/goal-values-response
  "Fetch the values of the dynamic goals of a Card using a JSON Web Token signed with the `embedding-secret-key`. Same
  checks as `GET /api/embed/card/:token/query`; every goal is withheld when the token signs a parameter value."
  [{:keys [token]} :- [:map {:closed true}
                       [:token api.embed.common/EncodedToken]]]
  (api.embed.common/goal-values-response (resolve-card-context token {})))

;;; ----------------------------------------- /api/embed/dashboard endpoints -----------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:token"
  "Fetch a Dashboard via a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:dashboard <dashboard-id>}}"
  [{:keys [token]} :- [:map {:closed true}
                       [:token api.embed.common/EncodedToken]]]
  (let [unsigned     (unsign-and-translate-ids token)
        dashboard-id (api.embed.common/unsigned-token->dashboard-id unsigned)]
    (api.embed.common/check-embedding-enabled-for-dashboard (api/check-404 (embedding-rest.db/dashboard-embedding-flags dashboard-id)))
    (u/prog1 (api.embed.common/dashboard-for-unsigned-token unsigned :enable-embedding? true)
      (events/publish-event! :event/dashboard-read {:object-id (:id <>), :user-id api/*current-user-id*}))))

(defn- resolve-dashcard-context
  "Resolve the context shared by the dashcard chart routes and their `/goal-values` route: unsign `token`, look up its
  Dashboard, `dashcard-id` and `card-id`, check embedding is enabled for the Dashboard, validate the token params and
  raw `query-params` against its `embedding_params`, and check the card is on the dashcard on the Dashboard. Throws the
  same 400/404 for both."
  [token dashcard-id card-id query-params]
  (let [query-params   (api.embed.common/parse-query-params query-params)
        unsigned-token (unsign-and-translate-ids token)
        dashboard-id   (api.embed.common/unsigned-token->dashboard-id unsigned-token)
        dashboard      (api/check-404 (embedding-rest.db/dashboard dashboard-id))
        dashcard       (api/check-404 (embedding-rest.db/dashcard dashcard-id))
        card           (api/check-404 (embedding-rest.db/active-card card-id))]
    (api.embed.common/check-embedding-enabled-for-dashboard dashboard)
    (api.embed.common/dashcard-context dashboard dashcard card
                                       (:embedding_params dashboard)
                                       (embedding.jwt/get-in-unsigned-token-or-throw unsigned-token [:params])
                                       query-params)))

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
  (api.embed.common/process-query-for-dashcard-context
   (resolve-dashcard-context token dashcard-id card-id query-params)
   :export-format export-format
   :constraints constraints
   :qp qp
   :middleware middleware))

(api.macros/defendpoint :get "/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
  :- ::api.public/query-result-response
  "Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
  `embedding-secret-key`"
  [{:keys [token dashcard-id card-id]} :- [:map {:closed true}
                                           [:token api.embed.common/EncodedToken]
                                           [:dashcard-id ms/PositiveInt]
                                           [:card-id ms/PositiveInt]]
   query-params :- api.embed.common/QueryParams]
  (process-query-for-dashcard-with-signed-token token dashcard-id card-id :api query-params))

(api.macros/defendpoint :get "/dashboard/:token/dashcard/:dashcard-id/card/:card-id/goal-values"
  :- ::api.public/goal-values-response
  "Fetch the values of the dynamic goals of a Card on a Dashboard using a JSON Web Token signed with the
  `embedding-secret-key`. Same checks as the dashcard query route; every goal is withheld when the token signs a
  parameter value. Defined before the `/:export-format` route, which would otherwise match it."
  [{:keys [token dashcard-id card-id]} :- [:map {:closed true}
                                           [:token api.embed.common/EncodedToken]
                                           [:dashcard-id ms/PositiveInt]
                                           [:card-id ms/PositiveInt]]]
  (api.embed.common/goal-values-response (resolve-dashcard-context token dashcard-id card-id {})))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        FieldValues, Search, Remappings                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; --------------------------------------------------- Remappings ---------------------------------------------------

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/dashboard/:token/dashcard/:dashcard-id/card/:card-id/:export-format"
  :- (qp.streaming/export-response-schema ::api.public/query-result)
  "Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
  `embedding-secret-key` return the data in one of the export formats"
  [{:keys [token dashcard-id card-id export-format]} :- [:map {:closed true}
                                                         [:token api.embed.common/EncodedToken]
                                                         [:dashcard-id ms/PositiveInt]
                                                         [:card-id ms/PositiveInt]
                                                         [:export-format ::qp.schema/export-format]]
   {format-rows? :format_rows
    pivot? :pivot_results
    :as query-params} :- [:map
                          [:format_rows {:default false} :boolean]
                          [:pivot_results {:default false} :boolean]
                          [::mc/default api.embed.common/QueryParams]]]
  (process-query-for-dashcard-with-signed-token token
                                                dashcard-id
                                                card-id
                                                export-format
                                                (dissoc query-params :format_rows :pivot_results)
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
  [{:keys [token param-key]} :- [:map {:closed true}
                                 [:token api.embed.common/EncodedToken]
                                 [:param-key ms/NonBlankString]]
   query-params :- api.embed.common/QueryParams]
  (api.embed.common/dashboard-param-values token param-key nil
                                           (api.embed.common/parse-query-params query-params)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:token/params/:param-key/search/:prefix"
  "Embedded version of chain filter search endpoint."
  [{:keys [token param-key prefix]} :- api.embed.common/SearchParams
   query-params :- api.embed.common/QueryParams]
  (api.embed.common/dashboard-param-values token param-key prefix
                                           (api.embed.common/parse-query-params query-params)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:token/params/:param-key/remapping"
  "Embedded version of the remapped dashboard param value endpoint."
  [{:keys [token param-key]} :- [:map {:closed true}
                                 [:token api.embed.common/EncodedToken]
                                 [:param-key ms/NonBlankString]]
   {:keys [value]} :- [:map {:closed true}
                       [:value :string]]]
  (api.embed.common/dashboard-param-remapped-value token param-key (codec/url-decode value)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/card/:token/params/:param-key/values"
  "Embedded version of api.card filter values endpoint."
  [{:keys [token param-key]} :- [:map {:closed true}
                                 [:token api.embed.common/EncodedToken]
                                 [:param-key ms/NonBlankString]]]
  (let [unsigned (unsign-and-translate-ids token)
        card-id (api.embed.common/unsigned-token->card-id unsigned)
        card (api/check-404 (embedding-rest.db/card card-id))]
    (api.embed.common/check-embedding-enabled-for-card card)
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
        card-id (api.embed.common/unsigned-token->card-id unsigned)
        card (api/check-404 (embedding-rest.db/card card-id))]
    (api.embed.common/check-embedding-enabled-for-card card)
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
  [{:keys [token param-key]} :- [:map {:closed true}
                                 [:token api.embed.common/EncodedToken]
                                 [:param-key ms/NonBlankString]]
   {:keys [value]} :- [:map {:closed true}
                       [:value :string]]]
  (let [unsigned (unsign-and-translate-ids token)
        card-id (api.embed.common/unsigned-token->card-id unsigned)
        card (api/check-404 (embedding-rest.db/card card-id))]
    (api.embed.common/check-embedding-enabled-for-card card)
    (api.embed.common/card-param-remapped-value {:unsigned-token unsigned
                                                 :card card
                                                 :param-key param-key
                                                 :value (codec/url-decode value)})))

(api.macros/defendpoint :get "/pivot/card/:token/query"
  :- ::api.public/query-result-response
  "Fetch the results of running a Card using a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}
      :params   <parameters>}"
  [{:keys [token]} :- [:map {:closed true}
                       [:token api.embed.common/EncodedToken]]
   query-params :- api.embed.common/QueryParams]
  (run-query-for-card-token-async token :api query-params :qp qp.pivot/run-pivot-query))

(api.macros/defendpoint :get "/pivot/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
  :- ::api.public/query-result-response
  "Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
  `embedding-secret-key`"
  [{:keys [token dashcard-id card-id]} :- [:map {:closed true}
                                           [:token api.embed.common/EncodedToken]
                                           [:dashcard-id ms/PositiveInt]
                                           [:card-id ms/PositiveInt]]
   query-params :- api.embed.common/QueryParams]
  (process-query-for-dashcard-with-signed-token token dashcard-id card-id
                                                :api query-params
                                                :qp qp.pivot/run-pivot-query))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/tiles/card/:token/:zoom/:x/:y"
  "Generates a single tile image for an embedded Card using the map visualization."
  [{:keys [token zoom x y]}
   :- [:map {:closed true}
       [:token api.embed.common/EncodedToken]
       [:zoom ms/Int]
       [:x ms/Int]
       [:y ms/Int]]
   {:keys [parameters latField lonField]}
   :- [:map {:closed true}
       [:parameters {:optional true} ::parameters.schema/api.parameter-values]
       [:latField ::api.tiles/legacy-ref]
       [:lonField ::api.tiles/legacy-ref]]]
  (let [unsigned (unsign-and-translate-ids token)
        card-id (api.embed.common/unsigned-token->card-id unsigned)
        card (api/check-404 (embedding-rest.db/card card-id))]
    (api.embed.common/check-embedding-enabled-for-card card)
    (request/as-admin
      (api.embed.common/process-tiles-query-for-card
       card
       (api.embed.common/tile-parameters-for-card
        card (embedding.jwt/get-in-unsigned-token-or-throw unsigned [:params]) parameters)
       zoom x y latField lonField))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/tiles/dashboard/:token/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y"
  "Generates a single tile image for a Card on an embedded Dashboard using the map visualization."
  [{:keys [token dashcard-id card-id zoom x y]}
   :- [:map {:closed true}
       [:token api.embed.common/EncodedToken]
       [:dashcard-id ms/PositiveInt]
       [:card-id ms/PositiveInt]
       [:zoom ms/Int]
       [:x ms/Int]
       [:y ms/Int]]
   {:keys [parameters latField lonField]}
   :- [:map {:closed true}
       [:parameters {:optional true} ::parameters.schema/api.parameter-values]
       [:latField ::api.tiles/legacy-ref]
       [:lonField ::api.tiles/legacy-ref]]]
  (let [unsigned (unsign-and-translate-ids token)
        dashboard-id (api.embed.common/unsigned-token->dashboard-id unsigned)
        dashboard (api/check-404 (embedding-rest.db/dashboard dashboard-id))
        dashcard (api/check-404 (embedding-rest.db/dashcard dashcard-id))
        card (api/check-404 (embedding-rest.db/active-card card-id))]
    (api.embed.common/check-embedding-enabled-for-dashboard dashboard)
    (api.embed.common/process-tiles-query-for-dashcard
     dashboard dashcard card
     (api.embed.common/tile-parameters-for-dashboard
      dashboard (embedding.jwt/get-in-unsigned-token-or-throw unsigned [:params]) parameters)
     zoom x y latField lonField)))
