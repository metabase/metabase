(ns metabase.premium-features.token-check
  "Code relating to the premium features token check, and related logic.

  WARNING: Token check data, particularly the user count, is used for billing, so errors here have the potential to be
  high consequence. Be extra careful when editing this code!"
  (:require
   [clj-http.client :as http]
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [diehard.circuit-breaker :as dh.cb]
   [diehard.core :as dh]
   [environ.core :refer [env]]
   [metabase.config :as config]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.premium-features.defenterprise :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru trs tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.string :as u.str]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private RemoteCheckedToken
  "Schema for a valid premium token. Must be 64 lower-case hex characters."
  #"^[0-9a-f]{64}$")

(def ^:private AirgapToken
  "Similar to RemoteCheckedToken, but starts with 'airgap_'."
  #"airgap_.+")

(def ^:private TokenStr
  [:or
   [:re RemoteCheckedToken]
   [:re AirgapToken]])

(def token-check-url
  "Base URL to use for token checks. Hardcoded by default but for development purposes you can use a local server.
  Specify the env var `METASTORE_DEV_SERVER_URL`."
  (or
   ;; only enable the changing the token check url during dev because we don't want people switching it out in production!
   (when config/is-dev?
     (some-> (env :metastore-dev-server-url)
             ;; remove trailing slashes
             (str/replace  #"/$" "")))
   "https://token-check.metabase.com"))

(def store-url
  "Store URL, used as a fallback for token checks and for fetching the list of cloud gateway IPs."
  "https://store.metabase.com")

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                TOKEN VALIDATION                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(declare premium-embedding-token)

;; let's prevent the DB from getting slammed with calls to get the active user count, we only really need one in flight
;; at a time.
(let [f    (fn []
             {:post [(integer? %)]}
             (log/debug (u/colorize :yellow "GETTING ACTIVE USER COUNT!"))
             (assert ((requiring-resolve 'metabase.db/db-is-set-up?)) "Metabase DB is not yet set up")
             ;; force this to use a new Connection, it seems to be getting called in situations where the Connection
             ;; is from a different thread and is invalid by the time we get to use it
             (let [result (binding [t2.conn/*current-connectable* nil]
                            (t2/count :model/User :is_active true :type :personal))]
               (log/debug (u/colorize :green "=>") result)
               result))
      lock (Object.)]
  (defn- locking-active-user-count
    "Returns a count of users on the system"
    []
    (locking lock
      (f))))

(defsetting active-users-count
  (deferred-tru "Number of active users")
  :visibility :admin
  :type       :integer
  :audit      :never
  :setter     :none
  :default    0
  :export?    false
  :getter     (fn []
                (if-not ((requiring-resolve 'metabase.db/db-is-set-up?))
                  0
                  (locking-active-user-count))))

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
   [:company       {:optional true} [:string {:min 1}]]])

(def ^:private ^:const token-status-cache-ttl
  "Amount of time to cache the status of a valid enterprise token before forcing a re-check."
  (u/hours->ms 12))

(def ^{:arglists '([token base-url site-uuid])} ^:private fetch-token-and-parse-body*
  "Caches successful and 4XX API responses for 24 hours. 5XX errors, timeouts, etc. may be transient and will NOT be
  cached, but may trigger the *store-circuit-breaker*."
  (memoize/ttl
   ^{::memoize/args-fn (fn [[token base-url site-uuid]]
                         [token base-url site-uuid])}
   (fn [token base-url site-uuid]
     (log/infof "Checking with the MetaStore to see whether token '%s' is valid..." (u.str/mask token))
     (let [{:keys [body status] :as resp} (some-> (token-status-url token base-url)
                                                  (http/get {:query-params     {:users      (active-users-count)
                                                                                :site-uuid  site-uuid
                                                                                :mb-version (:tag config/mb-version-info)}
                                                             :throw-exceptions false}))]
       (cond
         (http/success? resp) (some-> body json/decode+kw)

         (<= 400 status 499) (some-> body json/decode+kw)

         ;; exceptions are not cached.
         :else (throw (ex-info "An unknown error occurred when validating token." {:status status
                                                                                   :body body})))))

   :ttl/threshold token-status-cache-ttl))

(def ^:private store-circuit-breaker-config
  {;; if 10 requests within 10 seconds fail, open the circuit breaker.
   ;; (a lower threshold ratio wouldn't make sense here because successful results are cached, so as soon as we get
   ;; one successful response we're guaranteed to only get successes until cache expiration)
   :failure-threshold-ratio-in-period [10 10 (u/seconds->ms 10)]
   ;; after the circuit is opened, wait 30 seconds before making any more requests to the store
   :delay-ms (u/seconds->ms 30)
   ;; when the circuit breaker is half-open, one request will be permitted. if it's successful, return to normal.
   ;; otherwise we'll wait another 30 seconds.
   :success-threshold 1})

(def ^:dynamic *store-circuit-breaker*
  "A circuit breaker that short-circuits when requests to the API have repeatedly failed.

  This prevents a pathological scenario where the store has a temporary outage (long enough for the cache to expire)
  and then all instances everywhere fire off constant requests to get token status. Instead, execution will constantly
  fail instantly until the circuit breaker is closed."
  (dh.cb/circuit-breaker store-circuit-breaker-config))

(def ^:private ^:const fetch-token-status-timeout-ms (u/seconds->ms 10))

(defn- fetch-token-and-parse-body
  [token base-url site-uuid]
  (try
    (dh/with-circuit-breaker *store-circuit-breaker*
      (dh/with-timeout {:timeout-ms fetch-token-status-timeout-ms
                        :interrupt? true}
        (try (fetch-token-and-parse-body* token base-url site-uuid)
             (catch Exception e
               (throw e)))))
    (catch dev.failsafe.TimeoutExceededException _e
      {:valid         false
       :status        (tru "Unable to validate token")
       :error-details (tru "Token validation timed out.")})
    (catch dev.failsafe.CircuitBreakerOpenException _e
      {:valid         false
       :status        (tru "Unable to validate token")
       :error-details (tru "Token validation is currently unavailable.")})
    ;; other exceptions are wrapped by Diehard in a FailsafeException. Unwrap them before rethrowing.
    (catch dev.failsafe.FailsafeException e
      (throw (.getCause e)))))

;;;;;;;;;;;;;;;;;;;; Airgap Tokens ;;;;;;;;;;;;;;;;;;;;

(declare decode-airgap-token)

(mu/defn max-users-allowed :- [:maybe pos-int?]
  "Returns the max users value from an airgapped key, or nil indicating there is no limt."
  []
  (when-let [token (premium-embedding-token)]
    (when (str/starts-with? token "airgap_")
      (let [max-users (:max-users (decode-airgap-token token))]
        (when (pos? max-users) max-users)))))

(defn airgap-check-user-count
  "Checks that, when in an airgap context, the allowed user count is acceptable."
  []
  (when-let [max-users (max-users-allowed)]
    (when (> (t2/count :model/User :is_active true, :type :personal) max-users)
      (throw (Exception. (trs "You have reached the maximum number of users ({0}) for your plan. Please upgrade to add more users." max-users))))))

(mu/defn- fetch-token-status* :- TokenStatus
  "Fetch info about the validity of `token` from the MetaStore."
  [token :- TokenStr]
  ;; NB that we fetch any settings from this thread, not inside on of the futures in the inner fetch calls.  We
  ;; will have taken a lock to call through to here, and could create a deadlock with the future's thread.  See
  ;; https://github.com/metabase/metabase/pull/38029/
  (cond (mr/validate [:re RemoteCheckedToken] token)
        ;; attempt to query the metastore API about the status of this token. If the request doesn't complete in a
        ;; reasonable amount of time throw a timeout exception
        (let [site-uuid (setting/get :site-uuid-for-premium-features-token-checks)]
          (try (fetch-token-and-parse-body token token-check-url site-uuid)
               (catch Exception e1
                 (log/errorf e1 "Error fetching token status from %s:" token-check-url)
                 ;; Try the fallback URL, which was the default URL prior to 45.2
                 (try (fetch-token-and-parse-body token store-url site-uuid)
                      ;; if there was an error fetching the token from both the normal and fallback URLs, log the
                      ;; first error and return a generic message about the token being invalid. This message
                      ;; will get displayed in the Settings page in the admin panel so we do not want something
                      ;; complicated
                      (catch Exception e2
                        (log/errorf e2 "Error fetching token status from %s:" store-url)
                        (let [body (u/ignore-exceptions (some-> (ex-data e1) :body json/decode+kw))]
                          (or
                           body
                           {:valid         false
                            :status        (tru "Unable to validate token")
                            :error-details (.getMessage e1)})))))))

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

(let [lock (Object.)]
  (defn- fetch-token-status
    "Locked version of `fetch-token-status*` allowing one request at a time."
    [token]
    (locking lock
      (fetch-token-status* token))))

(declare token-valid-now?)

(mu/defn- valid-token->features :- [:set ms/NonBlankString]
  [token :- TokenStr]
  (assert ((requiring-resolve 'metabase.db/db-is-set-up?)) "Metabase DB is not yet set up")
  (let [{:keys [valid status features error-details] :as token-status} (fetch-token-status token)]
    ;; if token isn't valid throw an Exception with the `:status` message
    (when-not valid
      (throw (ex-info status
                      {:status-code 400,
                       :error-details error-details})))
    (when (and (mr/validate [:re AirgapToken] token)
               (not (token-valid-now? token-status)))
      (throw (ex-info status
                      {:status-code 400
                       :error-details (tru "Airgapped token is no longer valid. Please contact Metabase support.")})))
    ;; otherwise return the features this token supports
    (set features)))

(defsetting token-status
  (deferred-tru "Cached token status for premium features. This is to avoid an API request on the the first page load.")
  :visibility :admin
  :type       :json
  :audit      :never
  :setter     :none
  :getter     (fn [] (some-> (premium-embedding-token) (fetch-token-status))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             SETTING & RELATED FNS                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defsetting premium-embedding-token     ; TODO - rename this to premium-features-token?
  (deferred-tru "Token for premium features. Go to the MetaStore to get yours!")
  :audit :never
  :sensitive? true
  :setter
  (fn [new-value]
    ;; validate the new value if we're not unsetting it
    (try
      (when (seq new-value)
        (when (mr/validate [:re AirgapToken] new-value)
          (airgap-check-user-count))
        (when-not (or (mr/validate [:re RemoteCheckedToken] new-value)
                      (mr/validate [:re AirgapToken] new-value))
          (throw (ex-info (tru "Token format is invalid.")
                          {:status-code 400, :error-details "Token should be 64 hexadecimal characters."})))
        (valid-token->features new-value)
        (log/info "Token is valid."))
      (setting/set-value-of-type! :string :premium-embedding-token new-value)
      (catch Throwable e
        (log/error e "Error setting premium features token")
        (throw (ex-info (.getMessage e) (merge
                                         {:message (.getMessage e), :status-code 400}
                                         (ex-data e)))))))) ; merge in error-details if present

(defsetting airgap-enabled
  "Returns true if the current instance is airgapped."
  :type       :boolean
  :visibility :public
  :setter     :none
  :audit      :never
  :export?    false
  :getter     (fn [] (mr/validate AirgapToken (premium-embedding-token))))

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
      (or (some-> (premium-embedding-token) valid-token->features)
          #{})
      (catch Throwable e
        (cached-logger (premium-embedding-token) e)
        #{}))))

(mu/defn plan-alias :- [:maybe :string]
  "Returns a string representing the instance's current plan, if included in the last token status request."
  []
  (some-> (premium-embedding-token)
          fetch-token-status
          :plan-alias))

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

(defsetting is-hosted?
  "Is the Metabase instance running in the cloud?"
  :type       :boolean
  :visibility :public
  :setter     :none
  :audit      :never
  :getter     (fn [] (boolean
                      (and
                       ((*token-features*) "hosting")
                       (not (airgap-enabled)))))
  :doc        false)

(defn log-enabled?
  "Returns true when we should record audit data into the audit log."
  []
  (or (is-hosted?) (has-feature? :audit-app)))

(defenterprise decode-airgap-token "In OSS, this returns an empty map." metabase-enterprise.airgap [_] {})
(defenterprise token-valid-now? "In OSS, this returns false." metabase-enterprise.airgap [_] false)
