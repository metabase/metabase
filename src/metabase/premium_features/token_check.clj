(ns metabase.premium-features.token-check
  "Code relating to the premium features token check, and related logic.

  WARNING: Token check data, particularly the user count, is used for billing, so errors here have the potential to be
  high consequence. Be extra careful when editing this code!

  TODO -- We should move the settings in this namespace into [[metabase.premium-features.settings]]."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clj-http.client :as http]
   [clojure.string :as str]
   [diehard.circuit-breaker :as dh.cb]
   [diehard.core :as dh]
   [environ.core :refer [env]]
   [java-time.api :as t]
   [metabase.analytics-interface.core :as analytics]
   [metabase.app-db.core :as app-db]
   [metabase.config.core :as config]
   [metabase.internal-stats.core :as internal-stats]
   [metabase.premium-features.db :as premium-features.db]
   [metabase.premium-features.defenterprise :refer [defenterprise]]
   [metabase.premium-features.settings :as premium-features.settings]
   [metabase.settings.core :as setting]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.retry :as retry]
   [metabase.util.string :as u.str]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2])
  (:import
   (dev.failsafe CircuitBreakerOpenException)))

(set! *warn-on-reflection* true)

(def RemoteCheckedToken
  "Schema for a valid premium token. Must be 64 lower-case hex characters."
  #"^(mb_dev_[0-9a-f]{57}|[0-9a-f]{64})$")

(def ^:private AirgapToken
  "Similar to RemoteCheckedToken, but starts with 'airgap_'."
  #"airgap_.+")

(def ^String token-check-url
  "Base URL to use for token checks. Hardcoded by default but for development purposes you can use a local server.
  Specify the env var `METASTORE_DEV_SERVER_URL`. If no server is defined, it uses the staging token check url."
  (let [dev-server-url          (some-> (env :metastore-dev-server-url) (str/replace #"/$" ""))
        prod-token-check-url    "https://token-check.metabase.com"
        staging-token-check-url "https://token-check.staging.metabase.com"]
    ;; only enable changing the token check url during dev because we don't want people switching it out in production!
    ;; additionally, we want to be able to run e2e tests against a staging server.
    (if config/is-prod?
      prod-token-check-url
      (or dev-server-url staging-token-check-url))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                TOKEN VALIDATION                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

;; let's prevent the DB from getting slammed with calls to get the active user count, we only really need one in flight
;; at a time.
(let [f    (fn []
             {:post [(integer? %)]}
             (log/debug (u/colorize :yellow "GETTING ACTIVE USER COUNT!"))
             (assert (app-db/db-is-set-up?) "Metabase DB is not yet set up")
             ;; force this to use a new Connection, it seems to be getting called in situations where the Connection
             ;; is from a different thread and is invalid by the time we get to use it
             (let [result (binding [t2.conn/*current-connectable* nil]
                            (premium-features.db/active-personal-user-count))]
               (log/debug (u/colorize :green "=>") result)
               result))
      lock (Object.)]
  (defn- locking-active-user-count
    "Returns a count of users on the system"
    []
    (locking lock
      (f))))

(defn -active-users-count
  "Getter for the [[metabase.premium-features.settings/active-users-count]] Setting."
  []
  (if-not (app-db/db-is-set-up?)
    0
    (locking-active-user-count)))

(defenterprise embedding-settings
  "Boolean values that report on the state of different embedding configurations."
  metabase-enterprise.internal-stats.core
  [_embedded-dashboard-count _embedded-question-count]
  {:enabled-embedding-static      false
   :enabled-embedding-interactive false
   :enabled-embedding-sdk         false
   :enabled-embedding-simple      false
   :enabled-embedding-sidecar     false
   :use-tenants                   false})

(defn- yesterday []
  (-> (t/offset-date-time (t/zone-offset "+00"))
      (t/minus (t/days 1))
      t/local-date
      str))

(defn- today []
  (-> (t/offset-date-time (t/zone-offset "+00"))
      t/local-date
      str))

(defenterprise transform-stats
  "Stats for Transforms"
  metabase-enterprise.transforms.core
  []
  {:transform-basic-runs                   0
   :transform-advanced-runs                0
   :transform-usage-date         (yesterday)
   :transform-rolling-basic-runs           0
   :transform-rolling-advanced-runs        0
   :transform-rolling-usage-date (today)})

(defenterprise transform-metered-as
  "Return the meter bucket a new transform run of the given source-type counts toward,
   based on the instance's current premium features. Returns nil when the run is not metered
   (including all OSS runs, since premium features are never present there)."
  metabase-enterprise.transforms.core
  [_source-type]
  nil)

(defn metering-stats
  "Collect metering statistics for billing purposes. Used by both token check and metering task. "
  []
  ;; NOTE: beware, if you use `defenterprise` here which uses any other `:feature` other than `:none`, it will
  ;; recursively trigger token check and will die
  (let [users                     (premium-features.settings/active-users-count)
        ext-users                 (internal-stats/external-users-count)
        embedding-dashboard-count (internal-stats/embedding-dashboard-count)
        embedding-question-count  (internal-stats/embedding-question-count)
        stats                     (merge (internal-stats/query-execution-last-utc-day)
                                         (embedding-settings embedding-dashboard-count embedding-question-count)
                                         (internal-stats/metabot-stats)
                                         (internal-stats/data-app-stats)
                                         (transform-stats)
                                         {:users                     users
                                          :embedding-dashboard-count embedding-dashboard-count
                                          :embedding-question-count  embedding-question-count
                                          :external-users            ext-users
                                          :internal-users            (- users ext-users)
                                          :domains                   (internal-stats/email-domain-count)
                                          :tenant-users              (internal-stats/tenant-users-count)
                                          :tenants                   (internal-stats/tenants-with-active-users-count)})]
    (log/info "Reporting Metabase stats:" stats)
    stats))

(defn- token-status-url [token base-url]
  (when (seq token)
    (format "%s/api/%s/v2/status" base-url token)))

(def ^:private Meters
  "The `:meters` of a token status response, keyed by the meter names the license server defines, each meter's fields
  also being the license server's."
  [:map {:closed false, ::mr/deliberately-open true, :description "license-server meters"}])

(def ^:private StoreUser
  "A store user of a token status response, whose keys are the license server's."
  [:map {:closed false, ::mr/deliberately-open true, :description "license-server store user"}
   [:email :string]])

(def ^:private Quota
  "A quota of a token status response, whose keys are the license server's."
  [:map {:closed false, ::mr/deliberately-open true, :description "license-server quota"}
   [:hosting-feature {:optional true} :string]
   [:soft-limit      {:optional true} number?]
   [:usage           {:optional true} number?]])

(def TokenStatus
  "Schema for a response from the token status API, whose keys are the license server's."
  [:map {:closed false, ::mr/deliberately-open true, :description "license-server token status"}
   [:valid                          :boolean]
   [:status                         [:string {:min 1}]]
   [:error-details {:optional true} [:maybe [:string {:min 1}]]]
   [:canonical?    {:optional true} [:maybe :boolean]]
   [:features      {:optional true} [:sequential [:string {:min 1}]]]
   [:plan-alias    {:optional true} :string]
   [:trial         {:optional true} :boolean]
   [:valid-thru    {:optional true} [:string {:min 1}]]
   [:max-users     {:optional true} pos-int?]
   [:company       {:optional true} [:string {:min 1}]]
   [:store-users   {:optional true} [:maybe [:sequential StoreUser]]]
   [:meters        {:optional true} Meters]
   [:quotas        {:optional true} [:sequential Quota]]])

(def ^:private MinimalTokenStatus
  "The least a decoded token-status body must carry before we treat it as the store's answer and cache it.

  This is deliberately not [[TokenStatus]]: we want to be relatively loose with this schema so that we don't
  risk marking responses as invalid even if they're usable."
  [:map {:closed false}
   [:valid                     :boolean]
   [:status                    [:string {:min 1}]]
   [:features {:optional true} [:maybe [:sequential :string]]]])

(defn- http-fetch
  [base-url token site-uuid]
  (some-> (token-status-url token base-url)
          (http/get {:query-params {:site-uuid site-uuid
                                    :mb-version (:tag config/mb-version-info)}
                     :throw-exceptions false
                     ;; socket is data transfer, connection is handshake and create connection timeout
                     :socket-timeout     5000     ;; in milliseconds
                     :connection-timeout 2000})))     ;; in milliseconds

(defn- canonical
  "Mark a decoded token status as canonical: an authoritative answer from the store, one we may cache and hold
  on to, including a 4xx that definitively rejects the token (expired, does not exist). Anything transient
  (network error, 5xx, missing or unparseable body) must throw instead so cached state is left alone."
  [decoded]
  (assoc decoded :canonical? true))

(defn- parse-status-body
  "Decode a token-status response body, returning the status map, or nil when the body is missing,
  unparseable (e.g. a proxy's HTML error page), or does not satisfy [[MinimalTokenStatus]]."
  [body]
  (let [decoded (try
                  (some-> body json/decode+kw)
                  (catch Exception _e nil))]
    (when (mr/validate MinimalTokenStatus decoded)
      decoded)))

(defn- fetch-token-and-parse-body
  [token base-url site-uuid]
  (log/infof "Checking with the MetaStore to see whether token '%s' is valid..." (u.str/mask token))
  (let [{:keys [body status] :as resp} (http-fetch base-url token site-uuid)]
    (if (or (http/success? resp) (<= 400 status 499))
      (let [decoded (or (some-> (parse-status-body body) canonical)
                        ;; a 2xx/4xx whose body is missing or undecodable (a proxy's or WAF's error page, a stripped
                        ;; body) carries no verdict from the store, so it is transient like a network error: never
                        ;; held, retried, and the previous status stands meanwhile
                        (throw (ex-info "Token validation provided no response." {:status status})))]
        (when (http/success? resp)
          (analytics/inc! :metabase-token-check/attempt {:status :success}))
        decoded)
      (throw (ex-info "An unknown error occurred when validating token." {:status status
                                                                          :body   body})))))

(defn- metering-url
  [token base-url]
  (format "%s/api/%s/v2/metering" base-url token))

(defn send-metering-events!
  "Send metering events for billing purposes"
  []
  (when-let [token (premium-features.settings/premium-embedding-token)]
    (when (mr/validate [:re RemoteCheckedToken] token)
      (tracing/with-span :tasks "metering.send-events" {}
        (let [site-uuid (premium-features.settings/site-uuid-for-premium-features-token-checks)]
          (try
            (http/post (metering-url token token-check-url)
                       {:body (json/encode (merge (metering-stats)
                                                  {:site-uuid site-uuid
                                                   :mb-version (:tag config/mb-version-info)}))
                        :content-type :json
                        :throw-exceptions false})
            (catch Throwable e
              (log/errorf "Error sending metering events: %s" (ex-message e)))))))))

;;;;;;;;;;;;;;;;;;;; Airgap Tokens ;;;;;;;;;;;;;;;;;;;;

(declare decode-airgap-token)

(mu/defn max-users-allowed :- [:maybe pos-int?]
  "Returns the max users value from an airgapped key, or nil indicating there is no limit."
  []
  (when-let [token (premium-features.settings/premium-embedding-token)]
    (when (str/starts-with? token "airgap_")
      (let [max-users (:max-users (decode-airgap-token token))]
        (when (pos? max-users) max-users)))))

(defn- active-user-count []
  (premium-features.db/active-personal-user-count))

(defn assert-valid-airgap-user-count!
  "Asserts that, in an airgap context, the current user count does not exceed the allowed maximum.
   Throws if the limit is exceeded. Called when setting the token."
  []
  (when-let [max-users (max-users-allowed)]
    (let [current-users (active-user-count)]
      (when (> current-users max-users)
        (throw (Exception.
                (trs "You have reached the maximum number of users ({0}) for your plan. Please upgrade to add more users."
                     max-users)))))))

(defn assert-airgap-allows-user-creation!
  "Asserts that creating a new personal user would not exceed the airgap user limit.
   Throws if adding another user would overflow the limit. Called in user pre-insert."
  []
  (when-let [max-users (max-users-allowed)]
    (when (>= (active-user-count) max-users)
      (throw (Exception.
              (trs "Adding another user would exceed the maximum number of users ({0}) for your plan. Please upgrade to add more users."
                   max-users))))))

(mu/defn- decode-token* :- TokenStatus
  "Decode a token. If you get a positive response about the token, even if it is not valid, return that. Errors will
  be caught further up with appropriate fall backs, retry strategies, and grace periods for features."
  [token :- :string]
  ;; NB that we fetch any settings from this thread, not inside on of the futures in the inner fetch calls.  We
  ;; will have taken a lock to call through to here, and could create a deadlock with the future's thread.  See
  ;; https://github.com/metabase/metabase/pull/38029/
  (cond (mr/validate [:re RemoteCheckedToken] token)
        (let [site-uuid (premium-features.settings/site-uuid-for-premium-features-token-checks)]
          (fetch-token-and-parse-body token token-check-url site-uuid))

        (mr/validate [:re AirgapToken] token)
        (do
          (log/infof "Checking airgapped token '%s'..." (u.str/mask token))
          (canonical (decode-airgap-token token)))

        :else
        (do
          (log/error (u/format-color 'red "Invalid token format!"))
          (canonical
           {:valid         false
            :status        "invalid"
            :error-details (trs "Token should be a valid 64 hexadecimal character token or an airgap token.")}))))

(defn- hash-token
  "SHA-256 hex hash of a token string. Used as cache table key so the raw token never appears in plaintext."
  ^String [^String token]
  (codecs/bytes->hex (buddy-hash/sha256 (.getBytes token "UTF-8"))))

(defn- canonicalize-for-hash
  "Prepare a token status map for deterministic hashing. Sorts map keys (via sorted-map)
   and sorts sequential values that may arrive in arbitrary order from the MetaStore."
  [m]
  (cond
    (map? m)        (into (sorted-map) (update-vals m canonicalize-for-hash))
    (sequential? m) (->> (map canonicalize-for-hash m)
                         (sort-by json/encode))
    :else           m))

(defn- hash-token-status
  "SHA-256 hex hash of a canonicalized, JSON-encoded token status map."
  ^String [result]
  (-> result canonicalize-for-hash json/encode (.getBytes "UTF-8") buddy-hash/sha256 codecs/bytes->hex))

(defn- write-cache-to-db!
  "Upsert a token status hash into the premium_features_token_cache table.
   Uses update-first to avoid poisoning PostgreSQL transactions on duplicate key.
   Catches constraint violations from concurrent inserters and retries with an update."
  [token-hash result-hash]
  (t2/with-connection [_conn (app-db/app-db)]
    (let [now     (t/offset-date-time)
          updated (premium-features.db/update-token-status-cache! token-hash result-hash now)]
      (when (zero? updated) ;; even though toucan2 returns 0 if we match a row but don't update it
        ;; we should always be updating this row with the timestamp if it's there.
        (try
          (premium-features.db/insert-token-status-cache! token-hash result-hash now)
          (catch Exception _e
            ;; Another instance inserted first — update instead.
            (premium-features.db/update-token-status-cache! token-hash result-hash now)))))))

(defn- extract-locks
  "Project a `:meters` map to `{meter-keyword -> boolean}` of `:is-locked` values.
   Meters without an `:is-locked` field are dropped."
  [meters]
  (into {} (keep (fn [[k v]] (when-some [locked (:is-locked v)] [k locked]))) meters))

(defn- update-locked-meters!
  "Mirror the `:is-locked` flag for each meter in `result` to the local `:locked-meters`
   setting, when `:meters` is present in a successful token-check response. Best-effort:
   failures are logged but never propagated to the refresh path."
  [result]
  (when (contains? result :meters)
    (try
      (premium-features.settings/locked-meters! (extract-locks (:meters result)))
      (catch Throwable t
        (log/warnf "Failed to mirror :locked-meters from token-check response: %s" (ex-message t))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   REFRESHER                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private grace-period
  "How long a status is honored after it was fetched. Past this, with no successful refresh since, the instance has no
  features."
  (t/hours 36))

(defonce ^:private ^{:doc "The status this instance holds: `{:token-hash, :status, :status-hash, :fetched-at}`, or nil.
  Only a successful refresh replaces it, and only with an authoritative status."}
  entry
  (atom nil))

(defonce ^:private ^{:doc "Refreshes in progress, as token hash -> promise of `{:status ...}` or `{:error ...}`, so
  concurrent callers for the same token share one fetch."}
  in-flight
  (atom {}))

(def ^:private retry-policy
  "Retries within one refresh. Refreshes run in the background or on an explicit request, so a few seconds of backoff
  is fine."
  {:max-retries             2
   :initial-interval-millis 1000
   :multiplier              2.0
   :jitter-factor           0.1
   :max-interval-millis     10000})

(defonce ^:private breaker
  (dh.cb/circuit-breaker {:failure-threshold 3
                          :delay-ms          (u/minutes->ms 1)
                          :on-open           (fn [_] (log/info "Engaging circuit breaker in token check"))
                          :on-close          (fn [_] (log/info "Token Check restored"))}))

(defn- fetch-status
  "Fetch the authoritative status of `token` from the store, or decode it locally for an airgap token. Returns a status
  marked `:canonical?`, or throws."
  [token]
  (try
    (dh/with-circuit-breaker breaker
      (retry/with-retry (assoc retry-policy
                               :on-retry (fn [_ e] (log/infof "Retrying token check after: %s" (ex-message e))))
        (decode-token* token)))
    (catch CircuitBreakerOpenException _e
      (throw (ex-info (tru "Token validation is currently unavailable.") {})))))

(defn- install!
  "Hold `status` as the status of `token`, then record its hash for other instances and mirror its locked meters."
  [token status]
  (let [token-hash  (hash-token token)
        status-hash (hash-token-status status)]
    (reset! entry {:token-hash  token-hash
                   :status      status
                   :status-hash status-hash
                   :fetched-at  (t/instant)})
    (try
      (write-cache-to-db! token-hash status-hash)
      (catch Throwable e
        (log/warnf "Failed to record the token status hash: %s" (ex-message e))))
    (update-locked-meters! status)
    status))

(defn refresh-now!
  "Fetch the status of the configured token on this thread and hold it. Concurrent callers share one fetch. Returns the
  fresh status, nil when no token is configured, or throws when the fetch fails, in which case the held status is left
  as it was."
  []
  (when-let [token (premium-features.settings/premium-embedding-token)]
    (let [token-hash (hash-token token)
          mine       (promise)
          [before]   (swap-vals! in-flight (fn [m] (cond-> m (not (contains? m token-hash)) (assoc token-hash mine))))
          shared     (get before token-hash)]
      (when-not shared
        (try
          (deliver mine {:status (install! token (fetch-status token))})
          (log/info "Refreshed the premium features token status.")
          (catch Throwable e
            (log/errorf "Error refreshing the premium features token status: %s" (ex-message e))
            (analytics/inc! :metabase-token-check/attempt {:status :failure})
            (deliver mine {:error e}))
          (finally
            (swap! in-flight dissoc token-hash))))
      (let [{:keys [status error]} @(or shared mine)]
        (if error
          (throw error)
          status)))))

(defn clear-cache!
  "Refresh the token status now; see [[refresh-now!]]. A failure is logged, not thrown, and the held status stands."
  []
  (try
    (refresh-now!)
    nil
    (catch Throwable _e
      nil)))

(def ^:private local-refresh-floor
  "A cross-instance hint never refreshes a status younger than this, so a stream of forged hints cannot turn each
  request into a store call."
  (t/seconds 30))

(defn clear-local-cache!
  "Refresh the token status because another instance says it refreshed. The hint arrives from untrusted requests, so it
  is ignored while the held status is younger than [[local-refresh-floor]]. Never throws."
  []
  (let [{:keys [fetched-at]} @entry]
    (when (or (nil? fetched-at)
              (t/before? (t/plus fetched-at local-refresh-floor) (t/instant)))
      (clear-cache!))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     READER                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- current-status
  "The status held for the configured token, if it was fetched within the [[grace-period]]; otherwise nil. A plain
  memory read: no app DB, no network, no lock."
  []
  (when-let [token (premium-features.settings/premium-embedding-token)]
    (let [{:keys [token-hash status fetched-at]} @entry]
      (when (and status
                 (= token-hash (hash-token token))
                 (t/before? (t/instant) (t/plus fetched-at grace-period)))
        status))))

(defn- unvalidated-status
  "What the token status reads as when no current status is held."
  []
  {:valid         false
   :canonical?    false
   :status        (tru "Unable to validate token")
   :error-details (tru "No current token status is held. A refresh may be in progress or failing.")})

(defn -set-premium-embedding-token!
  "Setter for the [[metabase.premium-features.settings/token-status]] setting."
  [new-value]
  ;; validate the new value if we're not unsetting it
  (try
    (let [status (when (seq new-value)
                   (when (mr/validate [:re AirgapToken] new-value)
                     (assert-valid-airgap-user-count!))
                   (when-not (or (mr/validate [:re RemoteCheckedToken] new-value)
                                 (mr/validate [:re AirgapToken] new-value))
                     (throw (ex-info (tru "Token format is invalid.")
                                     {:status-code   400
                                      :error-details "Token should be 64 hexadecimal characters."
                                      :response/keys #{:error-details}})))
                   ;; validate against the store, not a held verdict — the token may be the same string with a
                   ;; renewed subscription behind it
                   (let [decoded (try
                                   (fetch-status new-value)
                                   (catch Throwable e
                                     (throw (ex-info (tru "Unable to validate token")
                                                     {:error-details (ex-message e)
                                                      :status-code   503
                                                      :response/keys #{:error-details}}
                                                     e))))]
                     (when-not (:valid decoded)
                       (throw (ex-info (:status decoded)
                                       {:error-details (:error-details decoded)
                                        :status-code   400
                                        :response/keys #{:error-details}})))
                     (log/info "Token is valid.")
                     decoded))]
      (setting/set-value-of-type! :string :premium-embedding-token new-value)
      (when status
        (install! new-value status)))
    ((requiring-resolve 'metabase.dependencies.hooks/after-premium-token-update))
    (catch Throwable e
      (log/errorf "Error setting premium features token: %s" (ex-message e))
      ;; merge in error-details if present
      (throw (ex-info (.getMessage e) (merge
                                       {:message (.getMessage e), :status-code 400}
                                       (ex-data e)))))))

(defn -airgap-enabled
  "Getter for [[metabase.premium-features.settings/airgap-enabled]]"
  []
  (mr/validate AirgapToken (premium-features.settings/premium-embedding-token)))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(mu/defn ^:dynamic *token-features* :- [:set ms/NonBlankString]
  "Get the features associated with the system's premium features token."
  []
  (try
    ;; an invalid token (e.g. expired) confers no features, even if the token-status response still
    ;; lists them (EMB-2341)
    (let [{:keys [valid features]} (current-status)]
      (if valid
        (set features)
        #{}))
    (catch Throwable e
      (log/errorf "Error reading premium features: %s" (ex-message e))
      #{})))

(defn -token-status
  "Getter for the [[metabase.premium-features.settings/token-status]] setting."
  []
  (when (premium-features.settings/premium-embedding-token)
    (or (current-status)
        (unvalidated-status))))

(mu/defn plan-alias :- [:maybe :string]
  "Returns a string representing the instance's current plan, if included in the last token status request."
  []
  (:plan-alias (current-status)))

(mu/defn quotas :- [:maybe [:sequential [:map]]]
  "Returns a vector of maps for each quota of the subscription."
  []
  (clear-cache!)
  (:quotas (current-status)))

(mu/defn meters :- [:maybe :map]
  "Returns a map of current metered usage for the subscription."
  []
  (clear-cache!)
  (:meters (current-status)))

(defn has-any-features?
  "True if we have a valid premium features token with ANY features."
  []
  (boolean (seq (*token-features*))))

(defn has-feature?
  "Does this instance's premium token have `feature`?

    (has-feature? :sandboxes)          ; -> true
    (has-feature? :toucan-management)  ; -> false"
  [feature]
  (contains? (*token-features*) (name feature)))

(defn canonically-has-feature?
  "Returns `true` if the token definitively has `feature`, `false` if it definitively does not, or `nil` if the token
  status is indeterminate (e.g., network failure, timeout). Returns `false` (not `nil`) when no token is configured."
  [feature]
  (if (premium-features.settings/premium-embedding-token)
    (when-let [{:keys [valid features]} (current-status)]
      (boolean (and valid (contains? (set features) (name feature)))))
    false))

(defn ee-feature-error
  "Returns an error that can be used to throw when an enterprise feature check fails."
  [feature-name]
  (ex-info (tru "{0} is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                feature-name)
           {:status-code 402 :status "error-premium-feature-not-available" :response/keys #{:status}}))

(mu/defn assert-has-feature
  "Check if an token with `feature` is present. If not, throw an error with a message using `feature-name`.
  `feature-name` should be a localized string unless used in a CLI context.
  (assert-has-feature :sandboxes (tru \"Sandboxing\"))
  => throws an error with a message using \"Sandboxing\" as the feature name."
  [feature-flag :- keyword?
   feature-name :- [:or string? mu/localized-string-schema]]
  (when-not (has-feature? feature-flag)
    (throw (ee-feature-error feature-name))))

(mu/defn assert-has-any-features
  "Check if has at least one of feature in `features`. Throw an error if none of the features are available."
  [feature-flag :- [:sequential keyword?]
   feature-name :- [:or string? mu/localized-string-schema]]
  (when-not (some has-feature? feature-flag)
    (throw (ee-feature-error feature-name))))

(defn is-trial?
  "True if the current premium token is a trial subscription.
   Returns false if there is no token or the status cannot be fetched."
  []
  (-> (-token-status) :trial boolean))

(defn log-enabled?
  "Returns true when we should record audit data into the audit log."
  []
  (or (premium-features.settings/is-hosted?) (has-feature? :audit-app)))

(defn query-transforms-enabled?
  "Whether query (native/MBQL) transforms are available on this instance. Available on any non-hosted
  instance (OSS intentionally gets query transforms without a license), or on hosted instances with the
  `:transforms-basic` feature. Also requires the :transforms-enabled setting to be true."
  []
  (and (setting/get :transforms-enabled)
       (or (not (premium-features.settings/is-hosted?))
           (has-feature? :transforms-basic))))

(defn python-transforms-enabled?
  "Whether Python transforms are available on this instance. EE only; requires both `:transforms-basic`
  and `:transforms-python`. Also requires the :transforms-enabled setting to be true."
  []
  (and (setting/get :transforms-enabled)
       (has-feature? :transforms-basic)
       (has-feature? :transforms-python)))

(defn any-transforms-enabled?
  "Whether any kind of transform is available on this instance."
  []
  (or (query-transforms-enabled?) (python-transforms-enabled?)))

(defenterprise decode-airgap-token
  "In OSS, this returns an empty map."
  metabase-enterprise.premium-features.airgap
  [_]
  {})
