(ns metabase-enterprise.session-management.api
  "`/api/ee/session-management` endpoints — the admin-facing view of who is currently logged in."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.session-management.db :as sm.db]
   [metabase-enterprise.session-management.schema :as sm.schema]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.events.core :as events]
   [metabase.request.core :as request]
   [metabase.session.core :as session]
   [metabase.users.models.user :as user]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private session-providers
  "The `auth_identity.provider` values a listable session can have, plus the `unknown` bucket for sessions with no
  auth identity row: `core_session` rows predating the v58 `auth_identity_id` column. A password reset creates a
  session attributed to the `password` identity, so `emailed-secret-password-reset` never appears here."
  ["password" "ldap" "google" "slack-connect" "custom-oidc" "jwt" "saml" "support-access-grant" "unknown"])

(mr/def ::FilterParams
  [:map {:closed true}
   [:user-id            {:optional true} ms/PositiveInt]
   ;; a single `?ids=` arrives as a bare string; coerce so one id and many behave the same
   [:ids                {:optional true} (ms/QueryVectorOf :string)]
   [:provider           {:optional true} (into [:enum] session-providers)]
   [:type               {:optional true} [:enum "normal" "full-app-embed"]]
   [:tenancy            {:default :all}  [:enum :all :internal :external]]
   [:created-before     {:optional true} ms/TemporalString]
   [:created-after      {:optional true} ms/TemporalString]
   [:last-active-before {:optional true} ms/TemporalString]
   [:last-active-after  {:optional true} ms/TemporalString]])

(mr/def ::SortParams
  [:map {:closed true}
   [:sort-column    {:default :created_at} ::sm.schema/session-sort-column]
   [:sort-direction {:default :desc}       [:enum :asc :desc]]])

(mr/def ::Session
  [:map {:closed true}
   [:id                 :string]
   [:user               [:map {:closed true}
                         [:id          ms/PositiveInt]
                         [:email       :string]
                         [:common_name [:maybe :string]]]]
   [:type               [:enum "normal" "full-app-embed"]]
   [:provider           :string]
   [:created_at         ms/TemporalInstant]
   [:last_active_at     [:maybe ms/TemporalInstant]]
   [:expires_at         ms/TemporalInstant]
   [:user_agent         [:maybe :string]]
   [:device_description [:maybe :string]]
   [:ip_address         [:maybe :string]]
   [:device_id          [:maybe :string]]
   [:current            :boolean]])

(mr/def ::RevokeByCriteriaParams
  [:merge
   ::FilterParams
   [:map {:closed true}
    ;; in a JSON body `ids` arrives as a real array, so it needs none of the single-value coercion a query string does
    [:ids             {:optional true} [:sequential :string]]
    [:exclude-current {:default true}  :boolean]]])

(mr/def ::RevokeByCriteriaResult
  [:map {:closed true}
   [:revoked   ms/IntGreaterThanOrEqualToZero]
   [:remaining ms/IntGreaterThanOrEqualToZero]
   [:user_ids  [:sequential ms/PositiveInt]]])

(mr/def ::RevokeByCriteriaResponse
  ;; the second alternative is what a caller who revoked their own session gets: the same result inside a Ring
  ;; response that clears their session cookie, exactly as `DELETE /api/session` does on logout. That is a transport
  ;; detail, so `:openapi/response-schema` documents the result alone rather than both alternatives.
  [:or {:openapi/response-schema ::RevokeByCriteriaResult}
   ::RevokeByCriteriaResult
   [:map {:closed true}
    [:status  [:= 200]]
    [:body    ::RevokeByCriteriaResult]
    [:cookies [:map-of :string :map]]]])

(mr/def ::SessionsResponse
  [:map {:closed true}
   [:total  ms/IntGreaterThanOrEqualToZero]
   [:limit  [:maybe ms/PositiveInt]]
   [:offset [:maybe ms/IntGreaterThanOrEqualToZero]]
   [:data   [:sequential ::Session]]])

(defn- params->filters
  "Turn the query params into the filter map `metabase-enterprise.session-management.query/filters->where` takes,
  parsing the date strings into instants."
  [{:keys [user-id ids provider type tenancy
           created-before created-after last-active-before last-active-after]}]
  {:user-id            user-id
   :ids                ids
   :provider           provider
   :type               type
   :tenancy            (or tenancy :all)
   :created-before     (some-> created-before u.date/parse)
   :created-after      (some-> created-after u.date/parse)
   :last-active-before (some-> last-active-before u.date/parse)
   :last-active-after  (some-> last-active-after u.date/parse)})

(defn- effective-expires-at
  "When this session stops working: the earlier of the row's own hard `expires_at` and the `max-session-age` cap
  measured from `created_at`. Nil only if the row has neither.

  Not derived from the idle timeout — that is a sliding window which using the session pushes out, so this value does
  not move when the session is used.

  Computed here rather than as SQL `LEAST(...)` because the cap needs date arithmetic that differs across H2, Postgres
  and MySQL, and nothing sorts on the result."
  [created-at expires-at max-age-minutes]
  (let [cap (when max-age-minutes (u.date/add created-at :minute max-age-minutes))]
    (cond
      (nil? cap)                       expires-at
      (nil? expires-at)                cap
      (t/before? expires-at cap)       expires-at
      :else                            cap)))

(defn- ->response-item
  [max-age-minutes
   {:keys [id user_id user_email user_first_name user_last_name created_at last_active_at expires_at
           provider type current device_id ip_address user_agent]}]
  {:id                 id
   :user               (-> {:id         user_id
                            :email      user_email
                            :first_name user_first_name
                            :last_name  user_last_name}
                           user/add-common-name
                           (select-keys [:id :email :common_name]))
   :type               type
   ;; already coalesced to "unknown" in SQL, so what is sorted on is exactly what is shown
   :provider           provider
   :created_at         created_at
   :last_active_at     last_active_at
   :expires_at         (effective-expires-at created_at expires_at max-age-minutes)
   :user_agent         user_agent
   :device_description (some-> user_agent request/describe-user-agent)
   :ip_address         ip_address
   :device_id          device_id
   ;; the SQL returns 1/0 so that MySQL, which has no boolean type, can't hand back something else
   :current            (= 1 (long current))})

(api.macros/defendpoint :get "/" :- ::SessionsResponse
  "List the sessions that are currently live — the ones that would still authenticate a request. Sessions that have
  hit `max-session-age`, passed their own `expires_at`, gone idle past the session timeout, or belong to a
  deactivated user or an inactive tenant are excluded from both `data` and `total`.

  Superuser only."
  [_route-params
   {:keys [sort-column sort-direction] :as params} :- [:maybe [:merge ::FilterParams ::SortParams]]
   _body
   {authed-session-key-hash :metabase/authed-session-key-hash, :as _request}]
  (api/check-superuser)
  (let [liveness (session/liveness-params)
        filters  (params->filters params)
        limit    (request/limit)
        offset   (request/offset)]
    {:total  (sm.db/live-session-count liveness filters)
     :limit  limit
     :offset offset
     :data   (mapv (partial ->response-item (:max-age-minutes liveness))
                   (sm.db/live-sessions liveness filters
                                        (or sort-column :created_at)
                                        (or sort-direction :desc)
                                        limit offset
                                        authed-session-key-hash))}))

(defn- record-revocation!
  "Write the audit trail for a revoke by criteria: one `:event/sessions-revoked` summary row for the whole call, plus
  one `:event/session-revoked` row per affected user, tied back to the summary by the criteria they share. Never
  throws."
  [criteria revoked remaining user-ids]
  ;; published outside any transaction, and failures are swallowed after logging: the sessions are already gone by
  ;; the time this runs, and an audit problem must not report otherwise to the caller
  (try
    (events/publish-event! :event/sessions-revoked
                           {:user-id api/*current-user-id*
                            :details {:criteria criteria, :count revoked, :remaining remaining}})
    (doseq [[user-id revoked-for-user] (frequencies user-ids)]
      (events/publish-event! :event/session-revoked
                             ;; `:model`/`:model-id` explicitly, and as the keyword, for the same reason as in the
                             ;; by-id endpoint above
                             {:user-id  api/*current-user-id*
                              :model    :model/User
                              :model-id user-id
                              :details  {:criteria criteria, :count revoked-for-user}}))
    (catch Throwable e
      (log/warn e "Error recording a session revocation in the audit log"))))

(api.macros/defendpoint :post "/revoke" :- ::RevokeByCriteriaResponse
  "Revoke — delete — every live session matching the given criteria, which are the filters the list endpoint takes.
  All of them have to hold, so a revoke removes exactly the sessions the same filters would have listed. An empty
  body matches every live session: that is how an admin logs everybody out.

  `exclude-current` (default true) holds back the session this request was made with. Pass false to log the caller
  out too, in which case the response also clears their session cookie.

  Sessions that are no longer live are left for the nightly cleanup task rather than revoked, and sessions belonging
  to MCP clients are never matched. Affected users are not notified.

  Returns how many sessions were `revoked`, how many live sessions still match the criteria afterwards (`remaining`,
  non-zero only when a login raced the revoke), and the `user_ids` whose sessions were revoked. Superuser only."
  [_route-params
   _query-params
   body :- [:maybe ::RevokeByCriteriaParams]
   {current-hash :metabase/authed-session-key-hash, :as _request}]
  (api/check-superuser)
  (let [criteria         (dissoc (or body {}) :exclude-current)
        exclude-current? (get body :exclude-current true)
        liveness         (session/liveness-params)
        filters          (params->filters criteria)
        {:keys [revoked user-ids current-revoked?]}
        (sm.db/revoke-live-sessions! liveness filters current-hash exclude-current?)]
    (log/infof "User %s revoked %d session(s) matching %s" api/*current-user-id* revoked (pr-str criteria))
    (let [remaining (sm.db/revocable-session-count liveness filters current-hash exclude-current?)
          response  {:revoked revoked, :remaining remaining, :user_ids (vec (distinct user-ids))}]
      (record-revocation! criteria revoked remaining user-ids)
      (if current-revoked?
        (request/clear-session-cookie response)
        response))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/session-management` routes."
  (api.macros/ns-handler *ns* +auth))
