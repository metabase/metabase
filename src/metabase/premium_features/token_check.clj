(ns metabase.premium-features.token-check
  "Code relating to the premium features token check, and related logic.

  WARNING: Token check data, particularly the user count, is used for billing, so errors here have the potential to be
  high consequence. Be extra careful when editing this code!

  TODO -- We should move the settings in this namespace into [[metabase.premium-features.settings]]."
  (:require
   [clj-http.client :as http]
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [diehard.circuit-breaker :as dh.cb]
   [diehard.core :as dh]
   [environ.core :refer [env]]
   [java-time.api :as t]
   [metabase.analytics.prometheus :as analytics]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.internal-stats.core :as internal-stats]
   [metabase.premium-features.defenterprise :refer [defenterprise]]
   [metabase.premium-features.settings :as premium-features.settings]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.string :as u.str]
   [potemkin.types :as p]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2])
  (:import
   (com.google.common.cache CacheBuilder RemovalCause RemovalNotification)
   (java.util.concurrent TimeUnit)))

(set! *warn-on-reflection* true)

(def RemoteCheckedToken
  "Schema for a valid premium token. Must be 64 lower-case hex characters."
  #"^(mb_dev_[0-9a-f]{57}|[0-9a-f]{64})$")

(def ^:private AirgapToken
  "Similar to RemoteCheckedToken, but starts with 'airgap_'."
  #"airgap_.+")

(def ^:private TokenStr
  [:or
   [:re RemoteCheckedToken]
   [:re AirgapToken]])

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
             (assert ((requiring-resolve 'metabase.app-db.core/db-is-set-up?)) "Metabase DB is not yet set up")
             ;; force this to use a new Connection, it seems to be getting called in situations where the Connection
             ;; is from a different thread and is invalid by the time we get to use it
             (let [result (binding [t2.conn/*current-connectable* nil]

                            ;; Because we need this count *during* token checks, this uses `t2/table-name` to avoid
                            ;; the `after-select` method on users, which calls an EE method that needs ... a token
                            ;; check :|
                            (t2/count (t2/table-name :model/User) :is_active true :type "personal"))]
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
  (if-not ((requiring-resolve 'metabase.app-db.core/db-is-set-up?))
    0
    (locking-active-user-count)))

(defenterprise embedding-settings
  "Boolean values that report on the state of different embedding configurations."
  metabase-enterprise.internal-stats.core
  [_embedded-dashboard-count _embedded-question-count]
  {:enabled-embedding-static      false
   :enabled-embedding-interactive false
   :enabled-embedding-sdk         false
   :enabled-embedding-simple      false})

(defn- yesterday []
  (-> (t/offset-date-time (t/zone-offset "+00"))
      (t/minus (t/days 1))
      t/local-date
      str))

(defn- today []
  (-> (t/offset-date-time (t/zone-offset "+00"))
      t/local-date
      str))

(defenterprise metabot-stats
  "Stats for Metabot"
  metabase-enterprise.metabot-v3.core
  []
  {:metabot-tokens     0
   :metabot-queries    0
   :metabot-users      0
   :metabot-usage-date (yesterday)})

(defenterprise transform-stats
  "Stats for Transforms"
  metabase-enterprise.transforms.core
  []
  {:transform-native-runs         0
   :transform-python-runs         0
   :transform-usage-date          (yesterday)
   :transform-rolling-native-runs 0
   :transform-rolling-python-runs 0
   :transform-rolling-usage-date  (today)})

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
                                         (metabot-stats)
                                         (transform-stats)
                                         {:users                     users
                                          :embedding-dashboard-count embedding-dashboard-count
                                          :embedding-question-count  embedding-question-count
                                          :external-users            ext-users
                                          :internal-users            (- users ext-users)
                                          :domains                   (internal-stats/email-domain-count)})]
    (log/info "Reporting Metabase stats:" stats)
    stats))

(defn- token-status-url [token base-url]
  (when (seq token)
    (format "%s/api/%s/v2/status" base-url token)))

(def TokenStatus
  "Schema for a response from the token status API."
  [:map
   [:valid                          :boolean]
   [:status                         [:string {:min 1}]]
   [:error-details {:optional true} [:maybe [:string {:min 1}]]]
   [:features      {:optional true} [:sequential [:string {:min 1}]]]
   [:plan-alias    {:optional true} :string]
   [:trial         {:optional true} :boolean]
   [:valid-thru    {:optional true} [:string {:min 1}]]
   [:max-users     {:optional true} pos-int?]
   [:company       {:optional true} [:string {:min 1}]]
   [:store-users   {:optional true} [:maybe [:sequential [:map
                                                          [:email :string]]]]]
   [:quotas        {:optional true} [:sequential [:map]]]])

(defn- http-fetch
  [base-url token site-uuid]
  (some-> (token-status-url token base-url)
          (http/get {:query-params {:site-uuid site-uuid
                                    :mb-version (:tag config/mb-version-info)}
                     :throw-exceptions false
                     ;; socket is data transfer, connection is handshake and create connection timeout
                     :socket-timeout     5000     ;; in milliseconds
                     :connection-timeout 2000     ;; in milliseconds
                     })))

(defn- fetch-token-and-parse-body
  [token base-url site-uuid]
  (log/infof "Checking with the MetaStore to see whether token '%s' is valid..." (u.str/mask token))
  (let [{:keys [body status] :as resp} (http-fetch base-url token site-uuid)]
    (cond
      (http/success? resp) (do (analytics/inc-if-initialized! :metabase-token-check/attempt {:status :success})
                               (some-> body json/decode+kw))
      (<= 400 status 499) (or (some-> body json/decode+kw)
                              {:valid false
                               :status "Unable to validate token"
                               :error-details "Token validation provided no response"})

      ;; exceptions are not cached.
      :else (do (analytics/inc-if-initialized! :metabase-token-check/attempt {:status :failure})
                (throw (ex-info "An unknown error occurred when validating token." {:status status
                                                                                    :body body}))))))

(defn- metering-url
  [token base-url]
  (format "%s/api/%s/v2/metering" base-url token))

(defn send-metering-events!
  "Send metering events for billing purposes"
  []
  (when-let [token (premium-features.settings/premium-embedding-token)]
    (when (mr/validate [:re RemoteCheckedToken] token)
      (let [site-uuid (premium-features.settings/site-uuid-for-premium-features-token-checks)
            stats (-> (metering-stats)
                      ;; for backwards compatibility, we send values as strings
                      (update-vals str))]
        (try
          (http/post (metering-url token token-check-url)
                     {:body (json/encode (merge stats
                                                {:site-uuid site-uuid
                                                 :mb-version (:tag config/mb-version-info)}))
                      :content-type :json
                      :throw-exceptions false})
          (catch Throwable e
            (log/error e "Error sending metering events")))))))

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
  ;; Because we need this count *during* token checks, this uses `t2/table-name` to avoid the `after-select` method
  ;; on users, which calls an EE method that needs ... a token check :|
  (t2/count (t2/table-name :model/User) :is_active true, :type "personal"))

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
  [token :- TokenStr]
  ;; NB that we fetch any settings from this thread, not inside on of the futures in the inner fetch calls.  We
  ;; will have taken a lock to call through to here, and could create a deadlock with the future's thread.  See
  ;; https://github.com/metabase/metabase/pull/38029/
  (cond (mr/validate [:re RemoteCheckedToken] token)
        (let [site-uuid (premium-features.settings/site-uuid-for-premium-features-token-checks)]
          (fetch-token-and-parse-body token token-check-url site-uuid))

        (mr/validate [:re AirgapToken] token)
        (do
          (log/infof "Checking airgapped token '%s'..." (u.str/mask token))
          (decode-airgap-token token))

        :else
        (do
          (log/error (u/format-color 'red "Invalid token format!"))
          {:valid         false
           :status        "invalid"
           :error-details (trs "Token should be a valid 64 hexadecimal character token or an airgap token.")})))

(def ^:dynamic *token-check-happening* "Var to prevent recursive calls to `fetch-token-status`" false)

(p/defprotocol+ GracePeriod
  "A protocol for providing a grace period for token features in the event they are not fetchable for a little while."
  (save! [_ token features] "Save the features for a particular token.")
  (retrieve [_ token] "Attempt to retrieve features associated with a token. This is best effort, perhaps never set,
  perhaps has timed out. Possible this is nil."))

(defn guava-cache-grace-period
  "Create a grace period of n units. This is just an expiring map using a guava cache. Note this is not sensitive to read times but to write times.


  (let [grace (guava-cache-grace-period 20 TimeUnit/MILLISECONDS)]
    (save! grace \"token\" #{\"features\"})
    (println \"found tokens?: \"
             (if (= (retrieve grace \"token\") #{\"features\"})
               \"🟢\"
               \"🔴\"))
    (Thread/sleep 40)
    (println \"expecting not to find tokens?: \"
             (if (retrieve grace \"token\")
               \"🔴\"
               \"🟢\")))
  found tokens?:  🟢
  expecting not to find tokens?:  🟢
  nil"
  [^long n ^TimeUnit units]
  (let [guava-cache (.. (CacheBuilder/newBuilder)
                        (expireAfterWrite n units)
                        (removalListener (fn [^RemovalNotification rn]
                                           (let [cause (.getCause rn)]
                                             (when (= RemovalCause/EXPIRED cause)
                                               (log/warnf "Removing token: %s from grace period cache"
                                                          (u.str/mask (.getKey rn)))))))
                        (build))]
    (reify GracePeriod
      (save! [_ token features] (.put guava-cache token features))
      (retrieve [_ token]
        (when token
          (let [value (.get guava-cache token (constantly ::not-present))]
            (when-not (identical? value ::not-present)
              value)))))))

(p/defprotocol+ TokenChecker
  "Protocol for checking tokens with cache management."
  (-check-token [this token]
    "Check a token and return TokenStatus map. May throw exceptions on failure.")
  (-clear-cache! [this]
    "Clear any caches in this checker and any wrapped checkers.
     Returns nil. Implementations should delegate to wrapped checkers."))

(def store-and-airgap-token-checker
  "Creates a basic token checker that handles HTTP requests and airgap tokens.
    No caching, no retries, no grace period - just the core logic."
  (reify TokenChecker
    (-check-token [_ token]
      (decode-token* token))
    (-clear-cache! [_]
      ;; No cache to clear at this level
      nil)))

(defn circuit-breaker-token-checker
  "Wraps a token checker with circuit breaker and timeout logic."
  [token-checker {:keys [circuit-breaker timeout-ms lock]
                  :or {lock (Object.)}}]
  (let [breaker (dh.cb/circuit-breaker circuit-breaker)]
    (reify TokenChecker
      (-check-token [_ token]
        (when *token-check-happening*
          (throw (ex-info "Token check is being called recursively, there is a good chance some `defenterprise` is causing this"
                          {:pass-thru true})))
        ;; important to not count these errors against the circuit breaker. These are not the types of errors we need
        ;; to circuit break. (#65294)
        (when-not ((requiring-resolve 'metabase.app-db.core/db-is-set-up?))
          (throw (ex-info "Metabase DB is not yet set up"
                          {:cause :token-check/app-db-not-ready})))
        (locking lock
          (binding [*token-check-happening* true]
            (try (dh/with-circuit-breaker breaker
                   (dh/with-timeout {:timeout-ms timeout-ms
                                     :interrupt? true}
                     (-check-token token-checker token)))
                 (catch dev.failsafe.CircuitBreakerOpenException _e
                   (throw (ex-info (tru "Token validation is currently unavailable.")
                                   {:cause :token-check/circuit-breaker})))
                 ;; other exceptions are wrapped by Diehard in a FailsafeException. Unwrap them before
                 ;; rethrowing.
                 (catch dev.failsafe.FailsafeException e
                   (throw (.getCause e)))))))
      (-clear-cache! [_]
        ;; No cache at this level, but delegate to wrapped checker
        (-clear-cache! token-checker)))))

(defn cached-token-checker
  "Wraps a token checker with TTL-based memoization."
  [token-checker {:keys [ttl-ms]}]
  (let [cached-check (memoize/ttl
                      (fn [token] (-check-token token-checker token))
                      :ttl/threshold ttl-ms)]
    (reify TokenChecker
      (-check-token [_ token]
        (cached-check token))
      (-clear-cache! [_]
        ;; Clear THIS layer's cache
        (memoize/memo-clear! cached-check)
        ;; AND delegate to wrapped checker
        (-clear-cache! token-checker)))))

(defn grace-period-token-checker
  "Wraps a token checker with grace period fallback logic."
  [token-checker {:keys [grace-period]}]
  (let [periodic-logger (memoize/ttl
                         (fn [_token] (log/info "Using token from grace period"))
                         :ttl/threshold (u/hours->ms 4))]
    (reify TokenChecker
      (-check-token [_ token]
        (try (let [response (-check-token token-checker token)]
               (save! grace-period token response)
               response)
             (catch Exception e
               (or (when-let [grace (retrieve grace-period token)]
                     (periodic-logger token)
                     grace)
                   (throw e)))))
      (-clear-cache! [_]
        ;; The grace period itself doesn't need clearing (it expires naturally)
        ;; but we should clear the periodic logger cache
        (memoize/memo-clear! periodic-logger)
        ;; AND delegate to wrapped checker
        (-clear-cache! token-checker)))))

(defn- error-catching-token-checker
  [token-checker]
  (reify TokenChecker
    (-check-token [_ token]
      (try (-check-token token-checker token)
           (catch Exception e
             (when-not (-> e ex-data :cause #{:token-check/circuit-breaker :token-check/app-db-not-ready})
               (log/infof "Error checking token: %s" (ex-message e))
               (analytics/inc-if-initialized! :metabase-token-check/attempt {:status :failure}))
             {:valid         false
              :status        (tru "Unable to validate token")
              :error-details (.getMessage e)})))
    (-clear-cache! [_] (-clear-cache! token-checker))))

(def ^:dynamic *customize-checker*
  "Dynamic variable allowing for customized token checkers. In the app, we want all of these in place. Only in tests
  should we construct ones without circuit breakers "
  false)

(defn make-checker
  "Make a token checker. Takes a base [[TokenChecker]] token checker and then arguments for the middleware-style
  wrapping [[TokenChecker]] arguments. "
  [{:keys [base circuit-breaker timeout-ms ttl-ms grace-period]
    :or   {base store-and-airgap-token-checker}}]
  (when-not *customize-checker*
    (assert (and base circuit-breaker timeout-ms ttl-ms grace-period)
            "Must provide all arguments for token checker"))
  (cond-> base
    ;; don't do it too much
    circuit-breaker
    (circuit-breaker-token-checker {:circuit-breaker circuit-breaker
                                    :timeout-ms      timeout-ms})
    ;; hold onto results for a while
    ttl-ms
    (cached-token-checker {:ttl-ms ttl-ms})
    ;; in case of errors, if we have a recent response use it
    grace-period
    (grace-period-token-checker {:grace-period grace-period})
    :always
    (error-catching-token-checker)))

(def token-checker
  "The token checker. Combines http/airgapping validation, circuit breaking, grace periods, caching, and error
  handling."
  (make-checker {:base            store-and-airgap-token-checker
                 :circuit-breaker {:failure-threshold-ratio-in-period [10 10 (u/seconds->ms 60)]

                                   :delay-ms          (u/seconds->ms 30)
                                   :success-threshold 1
                                   :on-open           (fn [_] (log/info "Engaging circuit breaker in token check"))
                                   :on-half-open      (fn [_] (log/info "In token check circuit breaker but attempting check"))
                                   :on-close          (fn [_] (log/info "Token Check restored"))}
                 :timeout-ms   (u/seconds->ms 10)
                 :ttl-ms       (u/hours->ms 12)
                 :grace-period (guava-cache-grace-period 36 TimeUnit/HOURS)}))

(defn clear-cache!
  "Clear the token cache so that [[fetch-token-and-parse-body]] will return the latest data."
  []
  (-clear-cache! token-checker))

(defn check-token
  "Public entrypoint to the token checking."
  ([token] (check-token token-checker token))
  ([checker token]
   (-check-token checker token)))

(derive :event/set-premium-embedding-token :metabase/event)

(defn -set-premium-embedding-token!
  "Setter for the [[metabase.premium-features.settings/token-status]] setting."
  [new-value]
  ;; validate the new value if we're not unsetting it
  (try
    (when (seq new-value)
      (when (mr/validate [:re AirgapToken] new-value)
        (assert-valid-airgap-user-count!))
      (when-not (or (mr/validate [:re RemoteCheckedToken] new-value)
                    (mr/validate [:re AirgapToken] new-value))
        (throw (ex-info (tru "Token format is invalid.")
                        {:status-code 400, :error-details "Token should be 64 hexadecimal characters."})))
      (let [decoded (check-token new-value)]
        (when-not (:valid decoded)
          (throw (ex-info "Invalid token" {:token (u.str/mask new-value)}))))
      (log/info "Token is valid."))
    (setting/set-value-of-type! :string :premium-embedding-token new-value)
    (events/publish-event! :event/set-premium-embedding-token {})
    (catch Throwable e
      (log/error e "Error setting premium features token")
      ;; merge in error-details if present
      (throw (ex-info (.getMessage e) (merge
                                       {:message (.getMessage e), :status-code 400}
                                       (ex-data e)))))))

(defn -airgap-enabled
  "Getter for [[metabase.premium-features.settings/airgap-enabled]]"
  []
  (mr/validate AirgapToken (premium-features.settings/premium-embedding-token)))

(let [cached-logger (memoize/ttl
                     ^{::memoize/args-fn (fn [[token _e]] [token])}
                     (fn [_token e]
                       (log/error "Error validating token:" (ex-message e))
                       (log/debug e "Error validating token"))
                     ;; log every five minutes
                     :ttl/threshold (* 1000 60 5))]
  (mu/defn ^:dynamic *token-features* :- [:set ms/NonBlankString]
    "Get the features associated with the system's premium features token."
    []
    (try
      (or (some-> (premium-features.settings/premium-embedding-token)
                  (check-token)
                  :features set)
          #{})
      (catch Throwable e
        (when (:pass-thru (ex-data e))
          (throw e))
        (cached-logger (premium-features.settings/premium-embedding-token) e)
        #{}))))

(defn -token-status
  "Getter for the [[metabase.premium-features.settings/token-status]] setting."
  []
  (some-> (premium-features.settings/premium-embedding-token)
          (check-token)))

(mu/defn plan-alias :- [:maybe :string]
  "Returns a string representing the instance's current plan, if included in the last token status request."
  []
  (some-> (premium-features.settings/premium-embedding-token)
          (check-token)
          :plan-alias))

(mu/defn quotas :- [:maybe [:sequential [:map]]]
  "Returns a vector of maps for each quota of the subscription."
  []
  (clear-cache!)
  (some-> (premium-features.settings/premium-embedding-token)
          (check-token)
          :quotas))

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

(defn ee-feature-error
  "Returns an error that can be used to throw when an enterprise feature check fails."
  [feature-name]
  (ex-info (tru "{0} is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                feature-name)
           {:status-code 402 :status "error-premium-feature-not-available"}))

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

(defn log-enabled?
  "Returns true when we should record audit data into the audit log."
  []
  (or (premium-features.settings/is-hosted?) (has-feature? :audit-app)))

(defenterprise decode-airgap-token
  "In OSS, this returns an empty map."
  metabase-enterprise.premium-features.airgap
  [_]
  {})
