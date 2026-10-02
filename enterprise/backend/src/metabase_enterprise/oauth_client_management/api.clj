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
   [metabase.util.date-2 :as u.date]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private max-ids
  "How many `client_id`s one request may name."
  1000)

(mr/def ::FilterParams
  "The criteria the list and the revoke share: every one of them can match an active client."
  [:map {:closed true}
   ;; a single `?ids=` arrives as a bare string; coerce so one id and many behave the same. `:and` decodes through
   ;; its first child only, so the coercion runs before the length check
   [:ids               {:optional true} [:and (ms/QueryVectorOf :string) [:vector {:max max-ids} :string]]]
   [:user-id           {:optional true} ms/PositiveInt]
   [:registered-before {:optional true} ms/TemporalString]
   [:registered-after  {:optional true} ms/TemporalString]
   ;; the revoke takes these two as well: sweeping the clients nothing has used since a date is a thing an admin
   ;; wants, and since a never-used client matches neither bound the pair can only ever narrow
   [:last-used-before  {:optional true} ms/TemporalString]
   [:last-used-after   {:optional true} ms/TemporalString]])

(mr/def ::SortParams
  [:map {:closed true}
   [:sort-column    {:default :created_at} ::ocm.schema/client-sort-column]
   [:sort-direction {:default :desc}       [:enum :asc :desc]]])

(mr/def ::ListParams
  "The list's criteria: [[::FilterParams]], the sort, `query`, and `status` with the filters that only match revoked
  clients."
  ;; `query` lives here rather than in ::FilterParams because the revoke endpoint merges those filters, and revoking
  ;; every client whose name happens to match a substring is far easier to get wrong than revoking by explicit criteria.
  [:merge
   ::FilterParams
   ::SortParams
   [:map {:closed true}
    [:status         {:default :active} ::ocm.schema/client-status]
    [:query          {:optional true}   ms/NonBlankString]
    [:revoked-before {:optional true}   ms/TemporalString]
    [:revoked-after  {:optional true}   ms/TemporalString]]])

(defn- refused-key
  "A schema for a request key that is declared only so it can be rejected, answering `message`.

  Declared rather than left out, because [[metabase.api.macros]]'s `strip-extra-keys-transformer` strips an
  undeclared key of a closed map instead of refusing it — so a caller who meant to narrow a revoke would have the
  narrowing dropped and sweep every active client. Every value is refused, `null` included, for the same reason: a
  null bound is not a narrower revoke."
  [message]
  [:fn {:error/message message} (constantly false)])

(def ^:private revoked-only-criterion
  "The refusal `revoked-before` and `revoked-after` share: both can only ever match a client that is already revoked,
  which is not a client a revoke can act on."
  (refused-key "only active clients can be revoked, so a filter that only matches revoked ones is not allowed"))

(mr/def ::RevokeByCriteriaParams
  ;; [[::FilterParams]] rather than [[::ListParams]]: a revoked client has nothing left to revoke, so a `status` other
  ;; than `active` — or `revoked-before`/`revoked-after`, which only match revoked clients — is a 400 rather than
  ;; something silently narrowed away
  [:merge
   ::FilterParams
   [:map {:closed true}
    [:status          {:optional true} [:enum {:error/message "only active clients can be revoked"} :active]]
    [:revoked-before  {:optional true} revoked-only-criterion]
    [:revoked-after   {:optional true} revoked-only-criterion]
    ;; in a JSON body `ids` arrives as a real array, so it needs none of the single-value coercion a query string does
    [:ids             {:optional true} [:sequential {:max max-ids} :string]]
    [:exclude-current {:default true}  :boolean]
    [:query           {:optional true}
     (refused-key "not supported when revoking; list the clients first, then revoke them by `ids`")]]])

(mr/def ::Actor
  [:map {:closed true}
   [:id          ms/PositiveInt]
   [:email       :string]
   [:common_name [:maybe :string]]])

(def ^:private client-entries
  "The entries of one registered client as the admin list shows it. Carries no hash and no secret."
  [[:client_id         :string]
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
   ;; null until the client first presents a bearer token; registering is not using
   [:last_used_at      [:maybe ms/TemporalInstant]]
   [:live_tokens       ms/IntGreaterThanOrEqualToZero]
   [:user_count        ms/IntGreaterThanOrEqualToZero]
   [:current           :boolean]])

(mr/def ::Client
  "One registered client as the admin list shows it."
  (into [:map {:closed true}] client-entries))

(mr/def ::ClientUser
  "One user a client holds a live token for. `last_approved_at` is null when the client holds a token of theirs with
  no approval on record."
  [:map {:closed true}
   [:id               ms/PositiveInt]
   [:email            :string]
   [:common_name      [:maybe :string]]
   [:live_tokens      ms/IntGreaterThanOrEqualToZero]
   [:last_approved_at [:maybe ms/TemporalInstant]]])

(mr/def ::ClientDetail
  "One registered client as the detail view shows it: the list item plus what it registered — its scopes and
  contacts — and who is holding its live tokens."
  (into [:map {:closed true}]
        (concat client-entries
                [[:scopes   [:sequential :string]]
                 [:contacts [:sequential :string]]
                 [:users    [:sequential ::ClientUser]]])))

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

(defn- params->filters
  "Turn the request params into the filter map [[metabase-enterprise.oauth-client-management.query/client-where]]
  takes, parsing the date strings into instants."
  [{:keys [status ids user-id query registered-before registered-after revoked-before revoked-after
           last-used-before last-used-after]}]
  {:status            status
   :ids               ids
   :user-id           user-id
   ;; only the list endpoint can send these five; the revoke endpoint's schema rejects them, so they arrive nil there
   :query             query
   :revoked-before    (some-> revoked-before u.date/parse)
   :revoked-after     (some-> revoked-after u.date/parse)
   :last-used-before  (some-> last-used-before u.date/parse)
   :last-used-after   (some-> last-used-after u.date/parse)
   :registered-before (some-> registered-before u.date/parse)
   :registered-after  (some-> registered-after u.date/parse)})

(defn- json-array
  "The vector in `encoded`, a JSON array column, or `[]` for a null one."
  ;; these columns are selected via raw SQL rather than through the model, so its JSON transforms don't apply
  [encoded]
  (or (some-> encoded json/decode) []))

(defn- ->actor
  "How this API names a person: `id`, `email` and the common name derived from `first-name`/`last-name`. Nil for a
  nil `id`, which is how a left-joined row says it has nobody to name."
  [id email first-name last-name]
  (when id
    (-> {:id id, :email email, :first_name first-name, :last_name last-name}
        user/add-common-name
        (select-keys [:id :email :common_name]))))

(defn- revoked-by
  "The admin who revoked the client in `row`, or nil for an active client — or a revoked one whose admin has since
  been deleted, which nulls the FK."
  [{:keys [revoked_by_user_id revoked_by_email revoked_by_first_name revoked_by_last_name]}]
  (->actor revoked_by_user_id revoked_by_email revoked_by_first_name revoked_by_last_name))

(defn- ->response-item
  "One `::Client` from a [[metabase-enterprise.oauth-client-management.db/clients]] row, marked `current` when it is
  `current-client-id` — the client that issued the bearer this request authenticated with."
  [current-client-id
   {:keys [client_id client_name client_uri logo_uri redirect_uris application_type registration_type created_at
           status revoked_at last_used_at live_tokens user_count]
    :as   row}]
  {:client_id         client_id
   :client_name       client_name
   :client_uri        client_uri
   :logo_uri          logo_uri
   :redirect_uris     (json-array redirect_uris)
   :application_type  application_type
   :registration_type registration_type
   :created_at        created_at
   :status            status
   :revoked_at        revoked_at
   :revoked_by        (revoked-by row)
   :last_used_at      last_used_at
   ;; `long` because a count comes back as whatever the driver's integer type is, and the response schema asks for
   ;; a Clojure integer
   :live_tokens       (long live_tokens)
   :user_count        (long user_count)
   ;; compared in Clojure rather than as a SQL `CASE`, unlike the sessions list's `current`: that one compares a
   ;; hashed session key, which must never leave the database, while a `client_id` is already in every row
   :current           (= client_id current-client-id)})

(defn- ->response-user
  "One `::ClientUser` from a [[metabase-enterprise.oauth-client-management.db/client-token-holders]] row."
  [{:keys [id email first_name last_name live_tokens last_approved_at]}]
  (assoc (->actor id email first_name last_name)
         :live_tokens      (long live_tokens)
         :last_approved_at last_approved_at))

(api.macros/defendpoint :get "/" :- ::ClientsResponse
  "List the OAuth clients registered against this instance, newest registration first. By default the active ones —
  the ones that can still act as a user. `status=revoked` lists instead the clients an admin has revoked, which stay
  on record for good with when they were revoked and by whom; `status=all` lists both. `total` counts whatever the
  filters match.

  Every filter is optional and they are ANDed, so the list narrows the way an admin reads an incident report:
  `ids` to an explicit set of `client_id`s, `user-id` to the clients one person still holds a token on,
  `registered-before`/`registered-after` and `revoked-before`/`revoked-after` to half-open time ranges, and `query`
  to a free-text search over the name, the `client_id` and the redirect URIs, where every whitespace-separated term
  has to match one of the three. `sort-column` and `sort-direction` order the result.

  `live_tokens` is how many unrevoked, unexpired access tokens the client holds right now, and `user_count` how many
  distinct users those belong to — between them, who a revoke would cut off. `current` marks the client that issued
  the bearer token this request authenticated with, and is false throughout for a request that came with a session
  cookie or an API key. No client secret or token hash is ever returned.

  Superuser only."
  [_route-params
   {:keys [sort-column sort-direction] :as params} :- [:maybe ::ListParams]
   _body
   {current-client-id :metabase/authed-oauth-client-id, :as _request}]
  (api/check-superuser)
  (let [filters (params->filters params)
        limit   (request/limit)
        offset  (request/offset)]
    {:total  (ocm.db/client-count filters)
     :limit  limit
     :offset offset
     :data   (mapv (partial ->response-item current-client-id)
                   (ocm.db/clients filters
                                   (or sort-column :created_at)
                                   (or sort-direction :desc)
                                   (System/currentTimeMillis)
                                   limit offset))}))

(api.macros/defendpoint :get "/:client-id" :- ::ClientDetail
  "One registered client: everything the list shows plus the `scopes` and `contacts` it registered with, and the
  `users` it holds a live token for — each with how many they hold and when they last consented.

  `scopes` is what the client registered, not what the OAuth endpoints will let it request. A revoked client is
  returned, carrying when it was revoked and by whom. `current` marks it the same way the list does. Unknown is a
  404. Superuser only."
  [{:keys [client-id]} :- [:map {:closed true}
                           [:client-id :string]]
   _query-params
   _body
   {current-client-id :metabase/authed-oauth-client-id, :as _request}]
  (api/check-superuser)
  (let [now-ms (System/currentTimeMillis)
        client (api/check-404 (ocm.db/client client-id now-ms))]
    (assoc (->response-item current-client-id client)
           :scopes   (json-array (:scopes client))
           :contacts (json-array (:contacts client))
           :users    (mapv ->response-user (ocm.db/client-token-holders client-id now-ms)))))

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
  "Revoke every active registered OAuth client matching the given criteria, which are the filters the list endpoint
  takes. All of them have to hold, so a revoke ends exactly the clients the same filters would have listed. An empty
  body matches every active client: that is how an admin cuts off everything at once.

  Each revoked client loses its current grants immediately: its live access and refresh tokens stop authenticating,
  its pending authorization codes are deleted, and it can no longer obtain consent, exchange or refresh a token, or
  read its own registration. The rows stay on record as revoked, with who revoked them and when.

  Only active clients can be revoked, so `status` may only be `active` (or absent), and `revoked-before` and
  `revoked-after` — which only match revoked clients — are rejected with a 400. So is `query`: revoking every client
  whose name happens to contain a substring is far easier to get wrong than revoking by an explicit criterion, so an
  admin lists by `query` first and then revokes the ids.

  `last-used-before` and `last-used-after` are accepted, so revoking every client that nothing has used since a
  given date is one call. A client that has never been used matches neither bound, as it does not for the list.

  `exclude-current` (default true) holds back the client that issued the caller's own bearer token, so a sweep run
  through the CLI does not cut the CLI off mid-command. Pass false to revoke it too. A request authenticated with a
  session cookie or an API key has no current client, and the flag has nothing to do.

  This cannot be undone. Clients that are unknown or already revoked are simply not matched, so repeating a revoke is
  a harmless no-op.

  Returns how many clients were `revoked`, how many access and refresh tokens that stamped (`tokens_revoked`), the
  `user_ids` who held one of them, and how many active clients still match the criteria afterwards (`remaining`,
  non-zero only when a registration raced the revoke).

  `tokens_revoked` and `user_ids` cover every token that was not already revoked, expired ones included, so they can
  be non-zero for a client the list shows with `live_tokens 0`: the list counts what still works, the revoke reports
  what it stamped. Superuser only."
  [_route-params
   _query-params
   body :- [:maybe ::RevokeByCriteriaParams]
   {current-client-id :metabase/authed-oauth-client-id, :as _request}]
  (api/check-superuser)
  (let [exclude-current? (get body :exclude-current true)
        ;; part of the criteria rather than dropped from them: `remaining` is counted with it, so an audit row
        ;; without it cannot say whether the current client was spared
        criteria         (assoc body :exclude-current exclude-current?)
        filters          (params->filters criteria)
        ;; the ids are resolved here rather than in the primitive: the EE module owns the criteria, the OSS module
        ;; owns the revocation, and what passes between them is a plain list of client ids
        ids              (ocm.db/revocable-client-ids filters current-client-id exclude-current?)
        revocation       (oauth-server/revoke-clients! ids api/*current-user-id*)
        remaining        (ocm.db/revocable-client-count filters current-client-id exclude-current?)]
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
