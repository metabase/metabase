(ns metabase-enterprise.oauth-client-management.api
  "`/api/ee/oauth-client-management` endpoints — the admin-facing view of which programs can act as this instance's
  users, and the kill switch for one.

  Only the endpoints are premium. Revocation itself is enforced by the OSS OAuth server module on every instance,
  licensed or not."
  (:require
   [metabase-enterprise.oauth-client-management.db :as ocm.db]
   [metabase-enterprise.oauth-client-management.schema :as ocm.schema]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.events.core :as events]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.request.core :as request]
   [metabase.users.models.user :as user]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private max-ids
  "How many `client_id`s one request may name."
  1000)

(mr/def ::ListParams
  [:map {:closed true}
   [:status {:default :active} ::ocm.schema/client-status]
   ;; a single `?ids=` arrives as a bare string; coerce so one id and many behave the same. `:and` decodes through
   ;; its first child only, so the coercion runs before the length check
   [:ids    {:optional true}   [:and (ms/QueryVectorOf :string) [:vector {:max max-ids} :string]]]])

(mr/def ::RevokeParams
  ;; `ids` is required: an omitted one is a 400, never a sweep of every active client
  [:map {:closed true}
   ;; in a JSON body `ids` arrives as a real array, so it needs none of the single-value coercion a query string does
   [:ids [:sequential {:max max-ids} :string]]])

(mr/def ::Actor
  [:map {:closed true}
   [:id          ms/PositiveInt]
   [:email       :string]
   [:common_name [:maybe :string]]])

(mr/def ::Client
  "One registered client as the admin list shows it. Carries no hash and no secret."
  [:map {:closed true}
   [:client_id         :string]
   [:client_name       [:maybe :string]]
   [:client_uri        [:maybe :string]]
   [:logo_uri          [:maybe :string]]
   [:redirect_uris     [:sequential :string]]
   [:application_type  [:maybe :string]]
   [:registration_type [:enum "dynamic" "static"]]
   [:created_at        ms/TemporalInstant]
   [:status            [:enum "active" "revoked"]]
   ;; both null for an active client, and `revoked_by` null for a revoked one whose admin has since been deleted
   [:revoked_at        [:maybe ms/TemporalInstant]]
   [:revoked_by        [:maybe ::Actor]]
   [:live_tokens       ms/IntGreaterThanOrEqualToZero]
   [:user_count        ms/IntGreaterThanOrEqualToZero]
   [:current           :boolean]])

(mr/def ::ClientsResponse
  [:map {:closed true}
   [:total  ms/IntGreaterThanOrEqualToZero]
   [:limit  [:maybe ms/PositiveInt]]
   [:offset [:maybe ms/IntGreaterThanOrEqualToZero]]
   [:data   [:sequential ::Client]]])

(mr/def ::RevokeResult
  [:map {:closed true}
   [:revoked        ms/IntGreaterThanOrEqualToZero]
   [:tokens_revoked ms/IntGreaterThanOrEqualToZero]
   [:user_ids       [:sequential ms/PositiveInt]]
   [:remaining      ms/IntGreaterThanOrEqualToZero]])

(defn- revoked-by
  "The admin who revoked the client in `row`, or nil for an active client — or a revoked one whose admin has since
  been deleted, which nulls the FK."
  [{:keys [revoked_by_user_id revoked_by_email revoked_by_first_name revoked_by_last_name]}]
  (when revoked_by_user_id
    (-> {:id         revoked_by_user_id
         :email      revoked_by_email
         :first_name revoked_by_first_name
         :last_name  revoked_by_last_name}
        user/add-common-name
        (select-keys [:id :email :common_name]))))

(defn- ->response-item
  "One `::Client` from a [[metabase-enterprise.oauth-client-management.db/clients]] row."
  [{:keys [client_id client_name client_uri logo_uri redirect_uris application_type registration_type created_at
           status revoked_at live_tokens user_count]
    :as   row}]
  {:client_id         client_id
   :client_name       client_name
   :client_uri        client_uri
   :logo_uri          logo_uri
   ;; stored as a JSON array but selected via raw SQL, so the model's JSON transform doesn't apply
   :redirect_uris     (or (some-> redirect_uris json/decode) [])
   :application_type  application_type
   :registration_type registration_type
   :created_at        created_at
   :status            status
   :revoked_at        revoked_at
   :revoked_by        (revoked-by row)
   :live_tokens       (long live_tokens)
   :user_count        (long user_count)
   ;; marking the client that issued the caller's bearer token needs the resolver to put its `client_id` on the
   ;; request, which `exclude-current` brings with it
   :current           false})

(api.macros/defendpoint :get "/" :- ::ClientsResponse
  "List the OAuth clients registered against this instance, newest registration first. By default the active ones —
  the ones that can still act as a user. `status=revoked` lists instead the clients an admin has revoked, which stay
  on record for good with when they were revoked and by whom; `status=all` lists both. `ids` narrows to an explicit
  set of `client_id`s. `total` counts whatever the filters match.

  `live_tokens` is how many unrevoked, unexpired access tokens the client holds right now, and `user_count` how many
  distinct users those belong to — between them, who a revoke would cut off. No client secret or token hash is ever
  returned.

  Superuser only."
  [_route-params
   params :- [:maybe ::ListParams]
   _body
   _request]
  (api/check-superuser)
  (let [filters (select-keys params [:status :ids])
        limit   (request/limit)
        offset  (request/offset)]
    {:total  (ocm.db/client-count filters)
     :limit  limit
     :offset offset
     :data   (mapv ->response-item
                   (ocm.db/clients filters (System/currentTimeMillis) limit offset))}))

(defn- record-revocation!
  "Write the audit trail for the `revocation` that `criteria` produced: one `:event/oauth-clients-revoked` summary row
  for the whole call, plus one `:event/oauth-client-revoked` row per client revoked. Never throws."
  [criteria {:keys [revoked tokens-revoked clients]} remaining]
  (try
    (events/publish-event! :event/oauth-clients-revoked
                           {:user-id api/*current-user-id*
                            :details {:criteria       criteria
                                      :count          revoked
                                      :tokens_revoked tokens-revoked
                                      :remaining      remaining}})
    (doseq [client clients]
      (events/publish-event! :event/oauth-client-revoked
                             {:user-id  api/*current-user-id*
                              :model    :model/OAuthClient
                              :model-id (:id client)
                              :details  {:client_id      (:client-id client)
                                         :client_name    (:client-name client)
                                         :tokens_revoked (:tokens-revoked client)
                                         :user_ids       (:user-ids client)}}))
    (catch Throwable e
      (log/warn e "Error recording an OAuth client revocation in the audit log"))))

(api.macros/defendpoint :post "/revoke" :- ::RevokeResult
  "Revoke the registered OAuth clients named by `ids`. Each one loses its current grants at once: its live access and
  refresh tokens stop authenticating, its pending authorization codes are deleted, and it can no longer obtain
  consent, exchange or refresh a token, or read its own registration. The rows stay on record as revoked, with who
  revoked them and when.

  This cannot be undone. Ids that are unknown or already revoked are simply not matched, so repeating a revoke is a
  harmless no-op.

  Returns how many clients were `revoked`, how many access and refresh tokens that stamped (`tokens_revoked`), the
  `user_ids` who held one of them, and how many active clients still match the ids afterwards (`remaining`).

  `tokens_revoked` and `user_ids` cover every token that was not already revoked, expired ones included, so they can
  be non-zero for a client the list shows with `live_tokens 0`: the list counts what still works, the revoke reports
  what it stamped. Superuser only."
  [_route-params
   _query-params
   {:keys [ids]} :- ::RevokeParams
   _request]
  (api/check-superuser)
  (let [criteria   {:ids ids}
        ;; the ids *are* the criteria here, so they go straight to the primitive, which matches only the active ones
        revocation (oauth-server/revoke-clients! ids api/*current-user-id*)
        ;; always 0 while the criteria are ids: a `client_id` is a UUID, so nothing can register into the set that
        ;; was just revoked. It is reported anyway because revoking by criteria can race a registration.
        remaining  (ocm.db/active-client-count criteria)]
    (log/infof "User %s revoked %d OAuth client(s) and %d token(s) matching %s"
               api/*current-user-id* (:revoked revocation) (:tokens-revoked revocation) (pr-str criteria))
    (record-revocation! criteria revocation remaining)
    {:revoked        (:revoked revocation)
     :tokens_revoked (:tokens-revoked revocation)
     :user_ids       (vec (distinct (:user-ids revocation)))
     :remaining      remaining}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/oauth-client-management` routes."
  (api.macros/ns-handler *ns* +auth))
