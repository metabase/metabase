(ns metabase.embedding-rest.api.preview-embed
  "Endpoints for previewing how Cards and Dashboards will look when embedding them.
   These endpoints are basically identical in functionality to the ones in `/api/embed`, but:

   1.  Require admin access
   2.  Ignore the values of `:enabled_embedding` for Cards/Dashboards
   3.  Ignore the `:embed_params` whitelist for Card/Dashboards, instead using a field called `:_embedding_params` in
       the JWT token itself.

   Refer to the documentation for those endpoints for further details."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.embedding-rest.api.common :as api.embed.common]
   [metabase.embedding-rest.db :as embedding-rest.db]
   [metabase.embedding.jwt :as embed]
   [metabase.embedding.validation :as embedding.validation]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.public-sharing-rest.api :as api.public]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.request.core :as request]
   [metabase.tiles.api :as api.tiles]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]))

(defn- token-embedding-params
  "The `:_embedding_params` a preview token carries, string-keyed like a stored `embedding_params`."
  [unsigned-token]
  (update-keys (embed/get-in-unsigned-token-or-throw unsigned-token [:_embedding_params]) name))

(defn- check-and-unsign [token]
  (api/check-superuser)
  (embedding.validation/check-embedding-enabled)
  (embed/unsign token))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/card/:token"
  "Fetch a Card you're considering embedding by passing a JWT `token`."
  [{:keys [token]} :- [:map {:closed true}
                       [:token api.embed.common/EncodedToken]]]
  (let [unsigned-token (check-and-unsign token)]
    (api.embed.common/card-for-unsigned-token unsigned-token
                                              :embedding-params (token-embedding-params unsigned-token))))

(def ^:private max-results
  "Embedding previews need to be limited in size to avoid performance issues (#20938)."
  2000)

(defn- resolve-card-context
  "Resolve the context shared by the preview card chart routes and `GET /card/:token/goal-values`: superuser and
  embedding-enabled checks, unsign `token`, look up its Card, and validate the token params and raw `query-params`
  against the token's `_embedding_params`. Throws the same 400/403/404 for both."
  [token query-params]
  (let [unsigned-token   (check-and-unsign token)
        card-id          (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :question])
        card             (api/check-404 (embedding-rest.db/card card-id))
        token-params     (api.embed.common/unsigned-token->token-params unsigned-token)
        embedding-params (token-embedding-params unsigned-token)]
    (api.embed.common/card-context card embedding-params token-params
                                   (api.embed.common/parse-query-params query-params))))

(api.macros/defendpoint :get "/card/:token/query"
  :- ::api.public/query-result-response
  "Fetch the query results for a Card you're considering embedding by passing a JWT `token`."
  [{:keys [token]} :- [:map {:closed true}
                       [:token api.embed.common/EncodedToken]]
   query-params :- api.embed.common/QueryParams]
  (api.embed.common/process-query-for-card-context
   (resolve-card-context token query-params)
   :export-format :api
   :constraints   {:max-results max-results}))

(api.macros/defendpoint :get "/card/:token/goal-values"
  :- ::api.public/goal-values-response
  "Fetch the values of the dynamic goals of a Card you're considering embedding by passing a JWT `token`. Same checks as
  `GET /api/preview_embed/card/:token/query`; every goal is withheld when the token signs a parameter value."
  [{:keys [token]} :- [:map {:closed true}
                       [:token api.embed.common/EncodedToken]]]
  (api.embed.common/goal-values-response (resolve-card-context token {})))

(defn- preview-card-for-param-values
  "The Card the parameter value lookups run against. Unlike the metadata endpoints this is the stored Card rather than
  the sanitized copy: the lookups need its real query and its full `:parameters`, since the locked parameters the
  preview must apply as constraints are exactly the ones the sanitized copy drops. Only `:embedding_params` comes
  from the token, so a preview reflects the settings being edited rather than the published ones."
  [unsigned-token]
  (let [card-id (api.embed.common/unsigned-token->card-id unsigned-token)]
    (-> (api/check-404 (embedding-rest.db/card card-id))
        (assoc :embedding_params (token-embedding-params unsigned-token)))))

(api.macros/defendpoint :get "/card/:token/params/:param-key/values" :- ms/FieldValuesResult
  "Embedded version of api.card filter values endpoint."
  [{:keys [token param-key]} :- [:map {:closed true}
                                 [:token     string?]
                                 [:param-key string?]]]
  (let [unsigned-token (check-and-unsign token)
        card           (preview-card-for-param-values unsigned-token)]
    (api.embed.common/card-param-values {:unsigned-token unsigned-token
                                         :card           card
                                         :param-key      param-key})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/card/:token/params/:param-key/remapping"
  "Embedded version of api.card filter values endpoint."
  [{:keys [token param-key]} :- [:map {:closed true}
                                 [:token api.embed.common/EncodedToken]
                                 [:param-key ms/NonBlankString]]
   {:keys [value]}           :- [:map {:closed true} [:value :string]]]
  (let [unsigned-token (check-and-unsign token)
        card           (preview-card-for-param-values unsigned-token)]
    (api.embed.common/card-param-remapped-value {:unsigned-token unsigned-token
                                                 :card           card
                                                 :param-key      param-key
                                                 :value          (codec/url-decode value)})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:token"
  "Fetch a Dashboard you're considering embedding by passing a JWT `token`. "
  [{:keys [token]} :- [:map {:closed true}
                       [:token api.embed.common/EncodedToken]]]
  (let [unsigned-token (check-and-unsign token)]
    (api.embed.common/dashboard-for-unsigned-token unsigned-token
                                                   :embedding-params (token-embedding-params unsigned-token))))

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
  (check-and-unsign token)
  (api.embed.common/dashboard-param-values token
                                           param-key
                                           nil
                                           (api.embed.common/parse-query-params query-params)
                                           {:preview true}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:token/params/:param-key/search/:prefix"
  "Embedded version of chain filter search endpoint."
  [{:keys [token param-key prefix]} :- api.embed.common/SearchParams
   query-params :- api.embed.common/QueryParams]
  (check-and-unsign token)
  (api.embed.common/dashboard-param-values token
                                           param-key
                                           prefix
                                           (api.embed.common/parse-query-params query-params)
                                           {:preview true}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:token/params/:param-key/remapping"
  "Embedded version of the remapped dashboard param value endpoint."
  [{:keys [token param-key]} :- [:map {:closed true}
                                 [:token api.embed.common/EncodedToken]
                                 [:param-key ms/NonBlankString]]
   {:keys [value]} :- [:map {:closed true} [:value :string]]]
  (check-and-unsign token)
  (api.embed.common/dashboard-param-remapped-value token param-key (codec/url-decode value) {:preview true}))

(defn- resolve-dashcard-context
  "Resolve the context shared by the preview dashcard chart routes and their `/goal-values` route: superuser and
  embedding-enabled checks, unsign `token`, look up its Dashboard, `dashcard-id` and `card-id`, validate the token
  params and raw `query-params` against the token's `_embedding_params`, and check the card is on the dashcard on the
  Dashboard. Throws the same 400/403/404 for both."
  [token dashcard-id card-id query-params]
  (let [unsigned-token   (check-and-unsign token)
        dashboard-id     (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])
        dashboard        (api/check-404 (embedding-rest.db/dashboard dashboard-id))
        dashcard         (api/check-404 (embedding-rest.db/dashcard dashcard-id))
        card             (api/check-404 (embedding-rest.db/active-card card-id))
        embedding-params (token-embedding-params unsigned-token)
        token-params     (api.embed.common/unsigned-token->token-params unsigned-token)]
    (api.embed.common/dashcard-context dashboard dashcard card embedding-params token-params
                                       (api.embed.common/parse-query-params query-params))))

(api.macros/defendpoint :get "/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
  :- ::api.public/query-result-response
  "Fetch the results of running a Card belonging to a Dashboard you're considering embedding with JWT `token`."
  [{:keys [token dashcard-id card-id]} :- [:map {:closed true}
                                           [:token api.embed.common/EncodedToken]
                                           [:dashcard-id ms/PositiveInt]
                                           [:card-id     ms/PositiveInt]]
   query-params :- api.embed.common/QueryParams]
  (api.embed.common/process-query-for-dashcard-context
   (resolve-dashcard-context token dashcard-id card-id query-params)
   :export-format :api))

(api.macros/defendpoint :get "/dashboard/:token/dashcard/:dashcard-id/card/:card-id/goal-values"
  :- ::api.public/goal-values-response
  "Fetch the values of the dynamic goals of a Card on a Dashboard you're considering embedding with JWT `token`. Same
  checks as the preview dashcard query route; every goal is withheld when the token signs a parameter value."
  [{:keys [token dashcard-id card-id]} :- [:map {:closed true}
                                           [:token api.embed.common/EncodedToken]
                                           [:dashcard-id ms/PositiveInt]
                                           [:card-id     ms/PositiveInt]]]
  (api.embed.common/goal-values-response (resolve-dashcard-context token dashcard-id card-id {})))

(api.macros/defendpoint :get "/pivot/card/:token/query"
  :- ::api.public/query-result-response
  "Fetch the query results for a Card you're considering embedding by passing a JWT `token`."
  [{:keys [token]} :- [:map {:closed true}
                       [:token api.embed.common/EncodedToken]]
   query-params :- api.embed.common/QueryParams]
  (api.embed.common/process-query-for-card-context
   (resolve-card-context token query-params)
   :export-format :api
   :qp            qp.pivot/run-pivot-query))

(api.macros/defendpoint :get "/pivot/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
  :- ::api.public/query-result-response
  "Fetch the results of running a Card belonging to a Dashboard you're considering embedding with JWT `token`."
  [{:keys [token dashcard-id card-id]} :- [:map {:closed true}
                                           [:token api.embed.common/EncodedToken]
                                           [:dashcard-id ms/PositiveInt]
                                           [:card-id     ms/PositiveInt]]
   query-params :- api.embed.common/QueryParams]
  (api.embed.common/process-query-for-dashcard-context
   (resolve-dashcard-context token dashcard-id card-id query-params)
   :export-format :api
   :qp            qp.pivot/run-pivot-query))

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
  (let [unsigned-token   (check-and-unsign token)
        card-id    (api.embed.common/unsigned-token->card-id unsigned-token)
        card       (api/check-404 (embedding-rest.db/card card-id))]
    (request/as-admin
      (api.embed.common/process-tiles-query-for-card
       card
       (api.embed.common/tile-parameters-for-card
        card (embed/get-in-unsigned-token-or-throw unsigned-token [:params]) parameters)
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
       [:card-id     ms/PositiveInt]
       [:zoom        ms/Int]
       [:x           ms/Int]
       [:y           ms/Int]]
   {:keys [parameters latField lonField]}
   :- [:map {:closed true}
       [:parameters {:optional true} ::parameters.schema/api.parameter-values]
       [:latField ::api.tiles/legacy-ref]
       [:lonField ::api.tiles/legacy-ref]]]
  (let [unsigned-token   (check-and-unsign token)
        dashboard-id     (embed/get-in-unsigned-token-or-throw unsigned-token [:resource :dashboard])
        dashboard        (api/check-404 (embedding-rest.db/dashboard dashboard-id))
        dashcard         (api/check-404 (embedding-rest.db/dashcard dashcard-id))
        card             (api/check-404 (embedding-rest.db/active-card card-id))]
    (api.embed.common/process-tiles-query-for-dashcard
     dashboard dashcard card
     (api.embed.common/tile-parameters-for-dashboard
      dashboard (embed/get-in-unsigned-token-or-throw unsigned-token [:params]) parameters)
     zoom x y latField lonField)))
