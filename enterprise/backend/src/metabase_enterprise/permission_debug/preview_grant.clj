(ns metabase-enterprise.permission-debug.preview-grant
  "Preview grants: a short-lived signed claim that admin A may preview the app as user X from the browser session it
  was issued to. The host page holds it and its broker stamps it on each request it makes for the preview frame as
  `X-Metabase-Preview-Grant`; the frame itself never sees it.

  A grant is an HS256 JSON Web Token with the claims `aid` (the admin), `uid` (the previewed user: a real user, or the
  hidden preview user of a group or tenant), `skb` (a keyed hash of the admin's session-key hash, so the grant works
  only on the session it was issued to, without revealing that hash) and `exp`."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.mac :as mac]
   [buddy.core.nonce :as nonce]
   [buddy.sign.jwt :as jwt]
   [metabase-enterprise.permission-debug.db :as permission-debug.db]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.session.core :as session]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.security MessageDigest)
   (java.time Instant)))

(set! *warn-on-reflection* true)

(def grant-header
  "The request header the host broker stamps a preview grant on."
  "x-metabase-preview-grant")

(def lifetime-seconds
  "How long a grant stays valid. The host page fetches a new one when a request answers `preview-grant-expired`."
  (* 30 60))

;; TODO (proof of concept): the key lives in this JVM only, so grants don't survive a restart and don't work across
;; instances. Assumes a single instance; a real build would derive it from an instance secret.
(defonce ^:private signing-key (nonce/random-bytes 32))

(defn- session-binding
  [session-key-hash]
  (codecs/bytes->b64-str (mac/hash (str "permission-preview-session." session-key-hash)
                                   {:key signing-key :alg :hmac+sha256})
                         true))

(defn issue
  "A grant for `admin-id` to preview as `user-id` from the session whose `key_hashed` is `session-key-hash`, with its
  expiry in epoch seconds."
  [admin-id user-id session-key-hash]
  (let [expires-at (+ (.getEpochSecond (Instant/now)) lifetime-seconds)]
    {:grant      (jwt/sign {:aid admin-id
                            :uid user-id
                            :skb (session-binding session-key-hash)
                            :exp expires-at}
                           signing-key
                           {:alg :hs256})
     :expires-at expires-at}))

(defn verify
  "`{:admin-id :user-id}` from `grant` when it is signed here, unexpired, and bound to `session-key-hash`; otherwise
  `{:error <code>}`, one of `preview-grant-invalid`, `preview-grant-expired` or `preview-grant-session-mismatch`."
  [grant session-key-hash]
  (try
    (let [{:keys [aid uid skb]} (jwt/unsign grant signing-key {:alg :hs256})]
      (cond
        (not (and (pos-int? aid) (pos-int? uid) (string? skb)))
        {:error "preview-grant-invalid"}

        (not (and session-key-hash
                  (MessageDigest/isEqual (codecs/str->bytes skb)
                                         (codecs/str->bytes (session-binding session-key-hash)))))
        {:error "preview-grant-session-mismatch"}

        :else
        {:admin-id aid :user-id uid}))
    (catch Exception e
      (if (= :exp (:cause (ex-data e)))
        {:error "preview-grant-expired"}
        (do (log/debug e "Refused a preview grant")
            {:error "preview-grant-invalid"})))))

;;; ------------------------------------------------ The preview scope ------------------------------------------------

(def ^:private readable-paths
  "`GET` endpoints the SDK's `CollectionBrowser`, `InteractiveDashboard` and `InteractiveQuestion` read, by prefix: the
  previewed user's own reads, so their permissions decide what comes back."
  #"^/api/(user/current|session/properties|collection|dashboard|card|dataset|table|field|database|search|segment|measure|timeline|native-query-snippet|bookmark|activity/recents|tiles|geojson|user-key-value|model-index|action|pulse/form_input|ee/content-translation|ee/library|ee/custom-viz-plugin)(/.*)?$")

(def ^:private query-posts
  "`POST` endpoints that only read: running a query, a saved question or a dashboard card, loading parameter values, or
  translating entity IDs. Downloads aren't here: a preview shows the rows, it doesn't export them."
  [#"^/api/dataset$"
   #"^/api/dataset/pivot$"
   #"^/api/dataset/native$"
   #"^/api/dataset/query_metadata$"
   #"^/api/dataset/parameter/values$"
   #"^/api/dataset/parameter/search/[^/]+$"
   #"^/api/card/\d+/query$"
   #"^/api/card/pivot/\d+/query$"
   #"^/api/dashboard/\d+/dashcard/\d+/card/\d+/query$"
   #"^/api/dashboard/pivot/\d+/dashcard/\d+/card/\d+/query$"
   #"^/api/eid-translation/translate$"])

(defn- in-preview-scope?
  "Whether a preview may reach `request`'s endpoint. The preview scope is this allowlist rather than an endpoint
  `:scope` tag; the data-app query checks don't apply, since preview requests aren't data-app scoped."
  [{:keys [request-method uri]}]
  (case request-method
    (:get :head :options) (boolean (re-matches readable-paths uri))
    :post                 (boolean (some #(re-matches % uri) query-posts))
    false))

;;; ------------------------------------------------ The swap ------------------------------------------------

(defn- refusal
  [error-code message]
  {:response {:status  403
              :headers {"Content-Type" "application/json; charset=utf-8"}
              :body    (json/encode {:error_code error-code :message message})}})

(defn- admin-browser-session?
  "Whether `request` was authenticated by a superuser's own `metabase.SESSION` cookie, the only credential a grant is
  accepted on. A data-app-scoped request is refused too: preview requests must not carry `X-Metabase-Client:
  data-app`, whose per-app checks would confine them to one app."
  [{:keys [is-superuser? metabase-session-type token-scopes] :as request}]
  (and is-superuser?
       (some? (:metabase/authed-session-key-hash request))
       (= :normal metabase-session-type)
       (nil? token-scopes)
       (nil? (:mcp-ui-credential request))
       (not= "jwt" (:embedding/auth-method request))))

(defn target-refusal
  "Why the preview can't run as `target` today, as a refusal, or nil. Checks what a live session of theirs would need,
  since there is no session of theirs to check: active (a hidden preview user never is, and is let through), their
  tenant active, and tenants on if they belong to one."
  [{:keys [is_superuser is_active type tenant_id tenant_active] :as target}]
  (cond
    (nil? target)
    (refusal "preview-target-not-found" "The previewed user doesn't exist.")

    is_superuser
    (refusal "preview-target-not-previewable" "Admins can't be previewed: they see everything.")

    (not (or is_active (= "permission-preview" (some-> type name))))
    (refusal "preview-target-inactive" "The previewed user is deactivated, so they can't sign in.")

    (and tenant_id (not (:enable-tenants? (session/liveness-params))))
    (refusal "preview-target-tenants-off" "The previewed user belongs to a tenant, and tenants are turned off.")

    (and tenant_id (not tenant_active))
    (refusal "preview-target-tenant-inactive" "The previewed user's tenant is deactivated.")))

(def ^:private user-info-keys
  "The keys of a request's current-user info. `:permissions-set` and `:settings` are dropped rather than replaced, so
  they are loaded for the previewed user."
  [:metabase-user-id :is-superuser? :is-data-analyst? :is-group-manager? :permissions-set :user-locale :settings])

(defn as-target
  "`request` rebound to `target` (from `permission-debug.db/preview-target`)."
  [request {:keys [id is_data_analyst locale group_manager]}]
  (merge (apply dissoc request user-info-keys)
         {:metabase-user-id  id
          :is-superuser?     false
          :is-data-analyst?  (boolean is_data_analyst)
          ;; as the session lookup computes it: only with advanced permissions
          :is-group-manager? (boolean (and (premium-features/enable-advanced-permissions?) group_manager))
          :user-locale       locale}))

(defn record-query!
  "Record a query that `admin-id` ran while previewing `user-id` in the audit log."
  [admin-id user-id {:keys [uri]}]
  (try
    (events/publish-event! :event/permissions-preview
                           {:user-id  admin-id
                            :model    :model/User
                            :model-id user-id
                            :details  {:action "query" :uri uri}})
    (catch Exception e
      (log/warn e "Error recording a permissions preview in the audit log"))))

(defenterprise preview-grant-request
  "EE implementation: check the request's preview grant against the admin's session and the previewed user, and
  rebind the request to that user, read-only. Refuses (403, with an `error_code`) rather than ignoring a grant that
  doesn't hold, so the admin never sees their own view in the preview frame."
  :feature :advanced-permissions
  [request]
  (if-not (admin-browser-session? request)
    (refusal "preview-session-required" "A preview grant is accepted only on an admin's browser session.")
    (let [{:keys [error admin-id user-id]} (verify (get-in request [:headers grant-header])
                                                   (:metabase/authed-session-key-hash request))]
      (cond
        error
        (refusal error "This preview grant isn't valid for this session.")

        (not= admin-id (:metabase-user-id request))
        (refusal "preview-grant-session-mismatch" "This preview grant isn't valid for this session.")

        :else
        (let [target (permission-debug.db/preview-target user-id)]
          (cond
            (target-refusal target)
            (target-refusal target)

            (not (in-preview-scope? request))
            (let [endpoint (str (u/upper-case-en (name (:request-method request))) " " (:uri request))]
              (log/infof "Refused %s while admin %d previews user %d: outside the preview scope" endpoint admin-id user-id)
              (refusal "preview-endpoint-not-allowed"
                       (str "Previews are read-only and reach only some endpoints, and not " endpoint ".")))

            :else
            (do
              (when (= :post (:request-method request))
                (record-query! admin-id user-id request))
              {:request  (as-target request target)
               :admin-id admin-id})))))))
