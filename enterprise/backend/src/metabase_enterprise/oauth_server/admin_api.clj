(ns metabase-enterprise.oauth-server.admin-api
  "Admin-only CRUD endpoints for managing OAuth clients."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]
   [oidc-provider.util :as oidc-util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private OAuthClientResponse
  "Malli schema for an OAuth client in API responses (no secrets)."
  [:map
   [:id              ms/PositiveInt]
   [:client_id       ms/NonBlankString]
   [:redirect_uris   [:sequential ms/NonBlankString]]
   [:grant_types     [:sequential ms/NonBlankString]]
   [:response_types  [:sequential ms/NonBlankString]]
   [:scopes          [:sequential :string]]
   [:client_name     {:optional true} [:maybe :string]]
   [:registration_type ms/NonBlankString]
   [:created_at      {:optional true} :any]
   [:updated_at      {:optional true} :any]])

(def ^:private OAuthClientCreateResponse
  "Malli schema for the POST response — includes the plaintext secret (shown once)."
  [:merge
   OAuthClientResponse
   [:map
    [:client_secret ms/NonBlankString]]])

(def ^:private client-public-keys
  "Keys safe to return in API responses (no secret hashes)."
  [:id :client_id :redirect_uris :grant_types :response_types :scopes
   :client_name :registration_type :created_at :updated_at])

(defn- sanitize-client
  "Remove secret-related fields from a client row for API responses."
  [client]
  (select-keys client client-public-keys))

(api.macros/defendpoint :post "/clients" :- OAuthClientCreateResponse
  "Register a new static OAuth client. Returns the client with the plaintext secret (shown only once)."
  [_route-params
   _query-params
   {:keys [redirect_uris client_name grant_types response_types scopes]}
   :- [:map
       [:redirect_uris [:sequential ms/NonBlankString]]
       [:client_name {:optional true} [:maybe ms/NonBlankString]]
       [:grant_types {:optional true} [:maybe [:sequential ms/NonBlankString]]]
       [:response_types {:optional true} [:maybe [:sequential ms/NonBlankString]]]
       [:scopes {:optional true} [:maybe [:sequential ms/NonBlankString]]]]]
  (let [client-id     (str (java.util.UUID/randomUUID))
        client-secret (oidc-util/generate-client-secret)
        secret-hash   (oidc-util/hash-client-secret client-secret)
        grant-types   (or (not-empty grant_types) ["authorization_code"])
        response-types (or (not-empty response_types) ["code"])
        scopes         (or (not-empty scopes) ["openid" "profile"])
        row           {:client_id          client-id
                       :client_secret_hash secret-hash
                       :redirect_uris      redirect_uris
                       :grant_types        grant-types
                       :response_types     response-types
                       :scopes             scopes
                       :client_name        client_name
                       :registration_type  "static"}
        [inserted]    (t2/insert-returning-instances! :model/OAuthClient row)]
    (-> (sanitize-client inserted)
        (assoc :client_secret client-secret))))

(api.macros/defendpoint :get "/clients" :- [:sequential OAuthClientResponse]
  "List all OAuth clients. Supports optional `?registration_type=static|dynamic` filter."
  [_route-params
   {:keys [registration_type]} :- [:map
                                   [:registration_type {:optional true} [:maybe ms/NonBlankString]]]]
  (let [clients (if registration_type
                  (t2/select :model/OAuthClient :registration_type registration_type)
                  (t2/select :model/OAuthClient))]
    (mapv sanitize-client clients)))

(api.macros/defendpoint :get "/clients/:id" :- OAuthClientResponse
  "Get a single OAuth client by its database ID."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (-> (t2/select-one :model/OAuthClient :id id)
      api/check-404
      sanitize-client))

(api.macros/defendpoint :put "/clients/:id" :- OAuthClientResponse
  "Update an OAuth client. Cannot change client_id or client_secret."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:client_name {:optional true} [:maybe ms/NonBlankString]]
            [:redirect_uris {:optional true} [:maybe [:sequential ms/NonBlankString]]]
            [:grant_types {:optional true} [:maybe [:sequential ms/NonBlankString]]]
            [:response_types {:optional true} [:maybe [:sequential ms/NonBlankString]]]
            [:scopes {:optional true} [:maybe [:sequential ms/NonBlankString]]]]]
  (api/check-404 (t2/select-one :model/OAuthClient :id id))
  (let [updates (into {} (filter (comp some? val)) (select-keys body [:client_name :redirect_uris :grant_types :response_types :scopes]))]
    (when (seq updates)
      (t2/update! :model/OAuthClient id updates))
    (-> (t2/select-one :model/OAuthClient :id id)
        sanitize-client)))

(api.macros/defendpoint :delete "/clients/:id" :- :nil
  "Delete an OAuth client."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-404 (t2/select-one :model/OAuthClient :id id))
  (t2/delete! :model/OAuthClient :id id)
  nil)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/oauth-server` admin routes."
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
