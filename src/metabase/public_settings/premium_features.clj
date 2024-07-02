(ns metabase.public-settings.premium-features
  "Settings related to checking premium token validity and which premium features it allows."
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.core.memoize :as memoize]
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [environ.core :refer [env]]
   [malli.core :as mc]
   [metabase.api.common :as api]
   [metabase.config :as config]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
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
(let [f        (fn []
                 {:post [(integer? %)]}
                 (log/debug (u/colorize :yellow "GETTING ACTIVE USER COUNT!"))
                 (assert ((requiring-resolve 'metabase.db/db-is-set-up?)) "Metabase DB is not yet set up")
                 ;; force this to use a new Connection, it seems to be getting called in situations where the Connection
                 ;; is from a different thread and is invalid by the time we get to use it
                 (let [result (binding [t2.conn/*current-connectable* nil]
                                (t2/count :model/User :is_active true :type :personal))]
                   (log/debug (u/colorize :green "=>") result)
                   result))
      memoized (memoize/ttl
                f
                :ttl/threshold (u/minutes->ms 5))
      lock     (Object.)]
  (defn cached-active-users-count
    "Primarily used for the settings because we don't wish it to be 100%. (HUH?)"
    []
    (locking lock
      (memoized))))

(defsetting active-users-count
  (deferred-tru "Cached number of active users. Refresh every 5 minutes.")
  :visibility :admin
  :type       :integer
  :audit      :never
  :setter     :none
  :default    0
  :getter     (fn []
                (if-not ((requiring-resolve 'metabase.db/db-is-set-up?))
                 0
                 (cached-active-users-count))))

(defn- token-status-url [token base-url]
  (when (seq token)
    (format "%s/api/%s/v2/status" base-url token)))

(def ^:private ^:const fetch-token-status-timeout-ms (u/seconds->ms 10))

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

(defn- fetch-token-and-parse-body*
  [token base-url site-uuid]
  (some-> (token-status-url token base-url)
          (http/get {:query-params {:users      (cached-active-users-count)
                                    :site-uuid  site-uuid
                                    :mb-version (:tag config/mb-version-info)}})
          :body
          (json/parse-string keyword)))

(defn- fetch-token-and-parse-body
  [token base-url site-uuid]
  (let [fut    (future (fetch-token-and-parse-body* token base-url site-uuid))
        result (deref fut fetch-token-status-timeout-ms ::timed-out)]
    (if (not= result ::timed-out)
      result
      (do
        (future-cancel fut)
        {:valid         false
         :status        (tru "Unable to validate token")
         :error-details (tru "Token validation timed out.")}))))

;;;;;;;;;;;;;;;;;;;; Airgap Tokens ;;;;;;;;;;;;;;;;;;;;
(declare decode-airgap-token)

(mu/defn max-users-allowed
  "Returns the max users value from an airgapped key, or nil indicating there is no limt."
  [] :- [:or pos-int? :nil]
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

(mu/defn ^:private fetch-token-status* :- TokenStatus
  "Fetch info about the validity of `token` from the MetaStore."
  [token :- TokenStr]
  ;; NB that we fetch any settings from this thread, not inside on of the futures in the inner fetch calls.  We
  ;; will have taken a lock to call through to here, and could create a deadlock with the future's thread.  See
  ;; https://github.com/metabase/metabase/pull/38029/
  (cond (mc/validate [:re RemoteCheckedToken] token)
        ;; attempt to query the metastore API about the status of this token. If the request doesn't complete in a
        ;; reasonable amount of time throw a timeout exception
        (do
          (log/infof "Checking with the MetaStore to see whether token '%s' is valid..." (u.str/mask token))
          (let [site-uuid (setting/get :site-uuid-for-premium-features-token-checks)]
            (try (fetch-token-and-parse-body token token-check-url site-uuid)
                 (catch Exception e1
                   ;; Unwrap exception from inside the future
                   (let [e1 (ex-cause e1)]
                     (log/errorf e1 "Error fetching token status from %s:" token-check-url)
                     ;; Try the fallback URL, which was the default URL prior to 45.2
                     (try (fetch-token-and-parse-body token store-url site-uuid)
                          ;; if there was an error fetching the token from both the normal and fallback URLs, log the
                          ;; first error and return a generic message about the token being invalid. This message
                          ;; will get displayed in the Settings page in the admin panel so we do not want something
                          ;; complicated
                          (catch Exception e2
                            (log/errorf (ex-cause e2) "Error fetching token status from %s:" store-url)
                            (let [body (u/ignore-exceptions (some-> (ex-data e1) :body (json/parse-string keyword)))]
                              (or
                               body
                               {:valid         false
                                :status        (tru "Unable to validate token")
                                :error-details (.getMessage e1)})))))))))

        (mc/validate [:re AirgapToken] token)
        (do
          (log/infof "Checking airgapped token '%s'..." (u.str/mask token))
          (decode-airgap-token token))

        :else
        (do
          (log/error (u/format-color 'red "Invalid token format!"))
          {:valid         false
           :status        "invalid"
           :error-details (trs "Token should be a valid 64 hexadecimal character token or an airgap token.")})))

(def ^{:arglists '([token])} fetch-token-status
  "TTL-memoized version of `fetch-token-status*`. Caches API responses for 5 minutes. This is important to avoid making
  too many API calls to the Store, which will throttle us if we make too many requests; putting in a bad token could
  otherwise put us in a state where `valid-token->features*` made API calls over and over, never itself getting cached
  because checks failed."
  ;; don't blast the token status check API with requests if this gets called a bunch of times all at once -- wait for
  ;; the first request to finish
  (let [lock (Object.)
        f    (memoize/ttl
              (fn [token]
                ;; this is a sanity check to make sure we can actually get the active user count BEFORE we try to call
                ;; [[fetch-token-status*]], because `fetch-token-status*` catches Exceptions and therefore caches failed
                ;; results. We were running into issues in the e2e tests where `active-users-count` was timing out
                ;; because of to weird timeouts after restoring the app DB from a snapshot, which would cause other
                ;; tests to fail because a timed-out token check would get cached as a result.
                (assert ((requiring-resolve 'metabase.db/db-is-set-up?)) "Metabase DB is not yet set up")
                (u/with-timeout (u/seconds->ms 5)
                  (cached-active-users-count))
                (fetch-token-status* token))
              :ttl/threshold (u/minutes->ms 5))]
    (fn [token]
      (locking lock
        (f token)))))

(declare token-valid-now?)

(mu/defn ^:private valid-token->features* :- [:set ms/NonBlankString]
  [token :- TokenStr]
  (let [{:keys [valid status features error-details] :as token-status} (fetch-token-status token)]
    ;; if token isn't valid throw an Exception with the `:status` message
    (when-not valid
      (throw (ex-info status
                      {:status-code 400,
                       :error-details error-details})))
    (when (and (mc/validate [:re AirgapToken] token)
               (not (token-valid-now? token-status)))
      (throw (ex-info status
                      {:status-code 400
                       :error-details (tru "Airgapped token is no longer valid. Please contact Metabase support.")})))
    ;; otherwise return the features this token supports
    (set features)))

(def ^:private ^:const valid-token-recheck-interval-ms
  "Amount of time to cache the status of a valid embedding token before forcing a re-check"
  (u/hours->ms 24)) ; once a day

(def ^:private ^{:arglists '([token])} valid-token->features
  "Check whether `token` is valid. Throws an Exception if not. Returns a set of supported features if it is."
  ;; this is just `valid-token->features*` with some light caching
  (let [f (memoize/ttl valid-token->features* :ttl/threshold valid-token-recheck-interval-ms)]
    (fn [token]
      (assert ((requiring-resolve 'metabase.db/db-is-set-up?)) "Metabase DB is not yet set up")
      (f token))))

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
        (when (mc/validate [:re AirgapToken] new-value)
          (airgap-check-user-count))
        (when-not (or (mc/validate [:re RemoteCheckedToken] new-value)
                      (mc/validate [:re AirgapToken] new-value))
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

(defn is-airgapped?
  "Returns true if the current instance is airgapped."
  []
  (mc/validate AirgapToken (premium-embedding-token)))

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
           {:status-code 402}))

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

(defn- default-premium-feature-getter [feature]
  (fn []
    (and config/ee-available?
         (has-feature? feature))))

(def premium-features
  "Set of defined premium feature keywords."
  (atom #{}))

(defmacro ^:private define-premium-feature
  "Convenience for generating a [[metabase.models.setting/defsetting]] form for a premium token feature. (The Settings
  definitions for Premium token features all look more or less the same, so this prevents a lot of code duplication.)"
  [setting-name docstring feature & {:as options}]
  (let [options (merge {:type       :boolean
                        :visibility :public
                        :setter     :none
                        :audit      :never
                        :getter     `(default-premium-feature-getter ~(some-> feature name))}
                       options)]
    `(do
      (swap! premium-features conj ~feature)
      (defsetting ~setting-name
        ~docstring
        ~@(mapcat identity options)))))

(define-premium-feature hide-embed-branding?
  "Logo Removal and Full App Embedding. Should we hide the 'Powered by Metabase' attribution on the embedding pages?
   `true` if we have a valid premium embedding token."
  :embedding
  :export? true
  ;; This specific feature DOES NOT require the EE code to be present in order for it to return truthy, unlike
  ;; everything else.
  :getter #(has-feature? :embedding))

(define-premium-feature enable-whitelabeling?
  "Should we allow full whitelabel embedding (reskinning the entire interface?)"
  :whitelabel
  :export? true)

(define-premium-feature enable-audit-app?
  "Should we enable the Audit Logs interface in the Admin UI?"
  :audit-app)

(define-premium-feature ^{:added "0.41.0"} enable-email-allow-list?
  "Should we enable restrict email domains for subscription recipients?"
  :email-allow-list)

(define-premium-feature ^{:added "0.41.0"} enable-cache-granular-controls?
  "Should we enable granular controls for cache TTL at the database, dashboard, and card level?"
  :cache-granular-controls)

(define-premium-feature ^{:added "0.41.0"} enable-config-text-file?
  "Should we enable initialization on launch from a config file?"
  :config-text-file)

(define-premium-feature enable-sandboxes?
  "Should we enable data sandboxes (row-level permissions)?"
  :sandboxes
  :export? true)

(define-premium-feature enable-sso-jwt?
  "Should we enable JWT-based authentication?"
  :sso-jwt)

(define-premium-feature enable-sso-saml?
  "Should we enable SAML-based authentication?"
  :sso-saml)

(define-premium-feature enable-sso-ldap?
  "Should we enable advanced configuration for LDAP authentication?"
  :sso-ldap)

(define-premium-feature enable-sso-google?
  "Should we enable advanced configuration for Google Sign-In authentication?"
  :sso-google)

(define-premium-feature enable-scim?
  "Should we enable user/group provisioning via SCIM?"
  :scim)

(defn enable-any-sso?
  "Should we enable any SSO-based authentication?"
  []
  (or (enable-sso-jwt?)
      (enable-sso-saml?)
      (enable-sso-ldap?)
      (enable-sso-google?)))

(define-premium-feature enable-session-timeout-config?
  "Should we enable configuring session timeouts?"
  :session-timeout-config)

(define-premium-feature can-disable-password-login?
  "Can we disable login by password?"
  :disable-password-login)

(define-premium-feature ^{:added "0.41.0"} enable-dashboard-subscription-filters?
  "Should we enable filters for dashboard subscriptions?"
  :dashboard-subscription-filters)

(define-premium-feature ^{:added "0.41.0"} enable-advanced-permissions?
  "Should we enable extra knobs around permissions (block access, and in the future, moderator roles, feature-level
  permissions, etc.)?"
  :advanced-permissions)

(define-premium-feature ^{:added "0.41.0"} enable-content-verification?
  "Should we enable verified content, like verified questions and models (and more in the future, like actions)?"
  :content-verification)

(define-premium-feature ^{:added "0.41.0"} enable-official-collections?
  "Should we enable Official Collections?"
  :official-collections)

(define-premium-feature ^{:added "0.41.0"} enable-snippet-collections?
  "Should we enable SQL snippet folders?"
  :snippet-collections)

(define-premium-feature ^{:added "0.45.0"} enable-serialization?
  "Enable the v2 SerDes functionality"
  :serialization)

(define-premium-feature ^{:added "0.47.0"} enable-email-restrict-recipients?
  "Enable restrict email recipients?"
  :email-restrict-recipients)

(define-premium-feature ^{:added "0.50.0"} enable-llm-autodescription?
  "Enable automatic descriptions of questions and dashboards by LLMs?"
  :llm-autodescription)

(define-premium-feature enable-upload-management?
  "Should we allow admins to clean up tables created from uploads?"
  :upload-management)

(define-premium-feature has-attached-dwh?
  "Does the Metabase Cloud instance have an internal data warehouse attached?"
  :attached-dwh)

(defsetting is-hosted?
  "Is the Metabase instance running in the cloud?"
  :type       :boolean
  :visibility :public
  :setter     :none
  :audit      :never
  :getter     (fn [] (boolean ((*token-features*) "hosting")))
  :doc        false)

(defn log-enabled?
  "Returns true when we should record audit data into the audit log."
  []
  (or (is-hosted?) (has-feature? :audit-app)))

;; `enhancements` are not currently a specific "feature" that EE tokens can have or not have. Instead, it's a
;; catch-all term for various bits of EE functionality that we assume all EE licenses include. (This may change in the
;; future.)
;;
;; By checking whether `(*token-features*)` is non-empty we can see whether we have a valid EE token. If the token is
;; valid, we can enable EE enhancements.
;;
;; DEPRECATED -- it should now be possible to use the new 0.41.0+ features for everything previously covered by
;; 'enhancements'.
(define-premium-feature ^:deprecated enable-enhancements?
  "Should we various other enhancements, e.g. NativeQuerySnippet collection permissions?"
  :enhancements
  :getter #(and config/ee-available? (has-any-features?)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Defenterprise Macro                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- in-ee?
  "Is the current namespace an Enterprise Edition namespace?"
  []
  (str/starts-with? (ns-name *ns*) "metabase-enterprise"))

(defonce
  ^{:doc "A map from fully-qualified EE function names to maps which include their EE and OSS implementations, as well
         as any additional options. This information is used to dynamically dispatch a call to the right implementation,
         depending on the available feature flags.

         For example:
           {ee-ns/ee-fn-name {:oss      oss-fn
                              :ee       ee-fn
                              :feature  :embedding
                              :fallback :oss}"}
  registry
  (atom {}))

(defn register-mapping!
  "Adds new values to the `registry`, associated with the provided function name."
  [ee-fn-name values]
  (swap! registry update ee-fn-name merge values))

(defn- check-feature
  [feature]
  (or (= feature :none)
      (has-feature? feature)))

(defn dynamic-ee-oss-fn
  "Dynamically tries to require an enterprise namespace and determine the correct implementation to call, based on the
  availability of EE code and the necessary premium feature. Returns a fn which, when invoked, applies its args to one
  of the EE implementation, the OSS implementation, or the fallback function."
  [ee-ns ee-fn-name]
  (fn [& args]
    (u/ignore-exceptions (classloader/require ee-ns))
    (let [{:keys [ee oss feature fallback]} (get @registry ee-fn-name)]
      (cond
        (and ee (check-feature feature))
        (apply ee args)

        (and ee (fn? fallback))
        (apply fallback args)

        :else
        (apply oss args)))))

(defn- validate-ee-args
  "Throws an exception if the required :feature option is not present."
  [{feature :feature :as options}]
  (when-not feature
    (throw (ex-info (trs "The :feature option is required when using defenterprise in an EE namespace!")
                    {:options options}))))

(defn- oss-options-error
  "The exception to throw when the provided option is not included in the `options` map."
  [option options]
  (ex-info (trs "{0} option for defenterprise should not be set in an OSS namespace! Set it on the EE function instead." option)
           {:options options}))

(defn validate-oss-args
  "Throws exceptions if EE options are provided, or if an EE namespace is not provided."
  [ee-ns {:keys [feature fallback] :as options}]
  (when-not ee-ns
    (throw (Exception. (str (trs "An EE namespace must be provided when using defenterprise in an OSS namespace!")
                            " "
                            (trs "Add it immediately before the argument list.")))))
  (when feature (throw (oss-options-error :feature options)))
  (when fallback (throw (oss-options-error :fallback options))))

(defn- docstr-exception
  "The exception to throw when defenterprise is used without a docstring."
  [fn-name]
  (Exception. (tru "Enterprise function {0}/{1} does not have a docstring. Go add one!" (ns-name *ns*) fn-name)))

(defmacro defenterprise-impl
  "Impl macro for `defenterprise` and `defenterprise-schema`. Don't use this directly."
  [{:keys [fn-name docstr ee-ns fn-tail options schema? return-schema]}]
  (when-not docstr (throw (docstr-exception fn-name)))
  (let [oss-or-ee (if (in-ee?) :ee :oss)]
    (case oss-or-ee
      :ee  (validate-ee-args options)
      :oss (validate-oss-args '~ee-ns options))
    `(let [ee-ns#        '~(or ee-ns (ns-name *ns*))
           ee-fn-name#   (symbol (str ee-ns# "/" '~fn-name))
           oss-or-ee-fn# ~(if schema?
                            `(mu/fn ~(symbol (str fn-name)) :- ~return-schema ~@fn-tail)
                            `(fn ~(symbol (str fn-name)) ~@fn-tail))]
       (register-mapping! ee-fn-name# (merge ~options {~oss-or-ee oss-or-ee-fn#}))
       (def
         ~(vary-meta fn-name assoc :arglists ''([& args]))
         ~docstr
         (dynamic-ee-oss-fn ee-ns# ee-fn-name#)))))

(defn- options-conformer
  [conformed-options]
  (into {} (map (comp (juxt :k :v) second) conformed-options)))

(s/def ::defenterprise-options
  (s/&
   (s/*
    (s/alt
     :feature  (s/cat :k #{:feature}  :v keyword?)
     :fallback (s/cat :k #{:fallback} :v #(or (#{:oss} %) (symbol? %)))))
   (s/conformer options-conformer)))

(s/def ::defenterprise-args
  (s/cat :docstr  (s/? string?)
         :ee-ns   (s/? symbol?)
         :options (s/? ::defenterprise-options)
         :fn-tail (s/* any?)))

(s/def ::defenterprise-schema-args
  (s/cat :return-schema      (s/? (s/cat :- #{:-}
                                             :schema any?))
         :defenterprise-args (s/? ::defenterprise-args)))

(defmacro defenterprise
  "Defines a function that has separate implementations between the Metabase Community Edition (aka OSS) and
  Enterprise Edition (EE).

  When used in a OSS namespace, defines a function that should have a corresponding implementation in an EE namespace
  (using the same macro). The EE implementation will be used preferentially to the OSS implementation if it is available.
  The first argument after the function name should be a symbol of the namespace containing the EE implementation. The
  corresponding EE function must have the same name as the OSS function.

  When used in an EE namespace, the namespace of the corresponding OSS implementation does not need to be included --
  it will be inferred automatically, as long as a corresponding [[defenterprise]] call exists in an OSS namespace.

  Two additional options can be defined, when using this macro in an EE namespace. These options should be defined
  immediately before the args list of the function:

  ###### `:feature`

  A keyword representing a premium feature which must be present for the EE implementation to be used. Use `:none` to
  always run the EE implementation if available, regardless of token (WARNING: this is not recommended for most use
  cases. You probably want to gate your code by a specific premium feature.)

  ###### `:fallback`

  The keyword `:oss`, or a function representing the fallback mechanism which should be used if the instance does not
  have the premium feature defined by the :feature option. If a function is provided, it will be called with the same
  args as the EE function. If `:oss` is provided, it causes the OSS implementation of the function to be called.
  (Default: `:oss`)"
  [fn-name & defenterprise-args]
  {:pre [(symbol? fn-name)]}
  (let [parsed-args (s/conform ::defenterprise-args defenterprise-args)
        _           (when (s/invalid? parsed-args)
                      (throw (ex-info "Failed to parse defenterprise args"
                                      (s/explain-data ::defenterprise-args parsed-args))))
        args        (assoc parsed-args :fn-name fn-name)]
    `(defenterprise-impl ~args)))

(defmacro defenterprise-schema
  "A version of defenterprise which allows for schemas to be defined for the args and return value. Schema syntax is
  the same as when using `mu/defn`. Otherwise identical to `defenterprise`; see the docstring of that macro for
  usage details."
  [fn-name & defenterprise-args]
  {:pre [(symbol? fn-name)]}
  (let [parsed-args (s/conform ::defenterprise-schema-args defenterprise-args)
        _           (when (s/invalid? parsed-args)
                      (throw (ex-info "Failed to parse defenterprise-schema args"
                                      (s/explain-data ::defenterprise-schema-args parsed-args))))
        args        (-> (:defenterprise-args parsed-args)
                        (assoc :schema? true)
                        (assoc :return-schema (-> parsed-args :return-schema :schema))
                        (assoc :fn-name fn-name))]
    `(defenterprise-impl ~args)))

(defenterprise sandboxed-user?
  "Returns a boolean if the current user uses sandboxing for any database. In OSS this is always false. Will throw an
  error if [[api/*current-user-id*]] is not bound."
  metabase-enterprise.sandbox.api.util
  []
  (when-not api/*current-user-id*
    ;; If no *current-user-id* is bound we can't check for sandboxes, so we should throw in this case to avoid
    ;; returning `false` for users who should actually be sandboxes.
    (throw (ex-info (str (tru "No current user found"))
                    {:status-code 403})))
  ;; oss doesn't have sandboxing. But we throw if no current-user-id so the behavior doesn't change when ee version
  ;; becomes available
  false)

(defenterprise impersonated-user?
  "Returns a boolean if the current user uses connection impersonation for any database. In OSS this is always false.
  Will throw an error if [[api/*current-user-id*]] is not bound."
  metabase-enterprise.advanced-permissions.api.util
  []
  (when-not api/*current-user-id*
    ;; If no *current-user-id* is bound we can't check for impersonations, so we should throw in this case to avoid
    ;; returning `false` for users who should actually be using impersonations.
    (throw (ex-info (str (tru "No current user found"))
                    {:status-code 403})))
  ;; oss doesn't have connection impersonation. But we throw if no current-user-id so the behavior doesn't change when
  ;; ee version becomes available
  false)

(defn sandboxed-or-impersonated-user?
  "Returns a boolean if the current user uses sandboxing or connection impersonation for any database. In OSS is always
  false. Will throw an error if [[api/*current-user-id*]] is not bound."
  []
  (or (sandboxed-user?)
      (impersonated-user?)))

(defenterprise decode-airgap-token "In OSS, this returns an empty map." metabase-enterprise.airgap [_] {})
(defenterprise token-valid-now? "In OSS, this returns false." metabase-enterprise.airgap [_] false)
