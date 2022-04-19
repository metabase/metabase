(ns metabase.public-settings.premium-features
  "Settings related to checking premium token validity and which premium features it allows."
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.core.memoize :as memoize]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [environ.core :refer [env]]
            [metabase.config :as config]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [metabase.util.i18n :refer [deferred-tru trs tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private ValidToken
  "Schema for a valid premium token. Must be 64 lower-case hex characters."
  #"^[0-9a-f]{64}$")

(def store-url
  "URL to the MetaStore. Hardcoded by default but for development purposes you can use a local server. Specify the env
  var `METASTORE_DEV_SERVER_URL`."
  (or
   ;; only enable the changing the store url during dev because we don't want people switching it out in production!
   (when config/is-dev?
     (some-> (env :metastore-dev-server-url)
             ;; remove trailing slashes
             (str/replace  #"/$" "")))
   "https://store.metabase.com"))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                TOKEN VALIDATION                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- active-user-count []
  ;; NOTE: models.user imports public settings, which imports this namespace,
  ;; so we can't import the User model here.
  (db/count 'User :is_active true))

(defn- token-status-url [token]
  (when (seq token)
    (format "%s/api/%s/v2/status" store-url token)))

(def ^:private ^:const fetch-token-status-timeout-ms 10000) ; 10 seconds

(def ^:private TokenStatus
  {:valid                          s/Bool
   :status                         su/NonBlankString
   (s/optional-key :error-details) (s/maybe su/NonBlankString)
   (s/optional-key :features)      [su/NonBlankString]
   (s/optional-key :trial)         s/Bool
   (s/optional-key :valid_thru)    su/NonBlankString ; ISO 8601 timestamp
   ;; don't explode in the future if we add more to the response! lol
   s/Any                           s/Any})

(s/defn ^:private fetch-token-status* :- TokenStatus
  "Fetch info about the validity of `token` from the MetaStore."
  [token :- ValidToken]
  ;; attempt to query the metastore API about the status of this token. If the request doesn't complete in a
  ;; reasonable amount of time throw a timeout exception
  (log/info (trs "Checking with the MetaStore to see whether {0} is valid..."
                 ;; ValidToken will ensure the length of token is 64 chars long
                 (str (subs token 0 4) "..." (subs token 60 64))))
  (deref
   (future
     (try (some-> (token-status-url token)
                  (http/get {:query-params {:users     (active-user-count)
                                            :site-uuid (setting/get :site-uuid-for-premium-features-token-checks)}})
                  :body
                  (json/parse-string keyword))
          ;; if there was an error fetching the token, log it and return a generic message about the
          ;; token being invalid. This message will get displayed in the Settings page in the admin panel so
          ;; we do not want something complicated
          (catch clojure.lang.ExceptionInfo e
            (log/error e (trs "Error fetching token status:"))
            (let [body (u/ignore-exceptions (some-> (ex-data e) :body (json/parse-string keyword)))]
              (or
               body
               {:valid         false
                :status        (tru "Unable to validate token")
                :error-details (.getMessage e)})))))
   fetch-token-status-timeout-ms
   {:valid         false
    :status        (tru "Unable to validate token")
    :error-details (tru "Token validation timed out.")}))

(def ^{:arglists '([token])} fetch-token-status
  "TTL-memoized version of `fetch-token-status*`. Caches API responses for 5 minutes. This is important to avoid making
  too many API calls to the Store, which will throttle us if we make too many requests; putting in a bad token could
  otherwise put us in a state where `valid-token->features*` made API calls over and over, never itself getting cached
  because checks failed. "
  (memoize/ttl
   fetch-token-status*
   :ttl/threshold (* 1000 60 5)))

(s/defn ^:private valid-token->features* :- #{su/NonBlankString}
  [token :- ValidToken]
  (let [{:keys [valid status features error-details]} (fetch-token-status token)]
    ;; if token isn't valid throw an Exception with the `:status` message
    (when-not valid
      (throw (ex-info status
               {:status-code 400, :error-details error-details})))
    ;; otherwise return the features this token supports
    (set features)))

(def ^:private ^:const valid-token-recheck-interval-ms
  "Amount of time to cache the status of a valid embedding token before forcing a re-check"
  (* 1000 60 60 24)) ; once a day

(def ^:private ^{:arglists '([token])} valid-token->features
  "Check whether `token` is valid. Throws an Exception if not. Returns a set of supported features if it is."
  ;; this is just `valid-token->features*` with some light caching
  (memoize/ttl valid-token->features*
    :ttl/threshold valid-token-recheck-interval-ms))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             SETTING & RELATED FNS                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defsetting premium-embedding-token     ; TODO - rename this to premium-features-token?
  (deferred-tru "Token for premium features. Go to the MetaStore to get yours!")
  :setter
  (fn [new-value]
    ;; validate the new value if we're not unsetting it
    (try
      (when (seq new-value)
        (when (s/check ValidToken new-value)
          (throw (ex-info (tru "Token format is invalid.")
                   {:status-code 400, :error-details "Token should be 64 hexadecimal characters."})))
        (valid-token->features new-value)
        (log/info (trs "Token is valid.")))
      (setting/set-value-of-type! :string :premium-embedding-token new-value)
      (catch Throwable e
        (log/error e (trs "Error setting premium features token"))
        (throw (ex-info (.getMessage e) (merge
                                         {:message (.getMessage e), :status-code 400}
                                         (ex-data e)))))))) ; merge in error-details if present

(s/defn ^:private token-features :- #{su/NonBlankString}
  "Get the features associated with the system's premium features token."
  []
  (try
    (or (some-> (premium-embedding-token) valid-token->features)
        #{})
    (catch Throwable e
      (log/error (trs "Error validating token") ":" (ex-message e))
      (log/debug e (trs "Error validating token"))
      #{})))

(defn- has-any-features?
  "True if we have a valid premium features token with ANY features."
  []
  (boolean (seq (token-features))))

(defn has-feature?
  "Does this instance's premium token have `feature`?

    (has-feature? :sandboxes)          ; -> true
    (has-feature? :toucan-management)  ; -> false"
  [feature]
  (contains? (token-features) (name feature)))

(defn- default-premium-feature-getter [feature]
  (fn []
    (and config/ee-available?
         (has-feature? feature))))

(defmacro ^:private define-premium-feature
  "Convenience for generating a [[metabase.models.setting/defsetting]] form for a premium token feature. (The Settings
  definitions for Premium token features all look more or less the same, so this prevents a lot of code duplication.)"
  [setting-name docstring feature & {:as options}]
  (let [options (merge {:type       :boolean
                        :visibility :public
                        :setter     :none
                        :getter     `(default-premium-feature-getter ~(some-> feature name))}
                       options)]
    `(defsetting ~setting-name
       ~docstring
       ~@(mapcat identity options))))

(define-premium-feature hide-embed-branding?
  "Logo Removal and Full App Embedding. Should we hide the 'Powered by Metabase' attribution on the embedding pages?
   `true` if we have a valid premium embedding token."
  :embedding
  ;; This specific feature DOES NOT require the EE code to be present in order for it to return truthy, unlike
  ;; everything else.
  :getter #(has-feature? :embedding))

(define-premium-feature enable-whitelabeling?
  "Should we allow full whitelabel embedding (reskinning the entire interface?)"
  :whitelabel)

(define-premium-feature enable-audit-app?
  "Should we enable the Audit Logs interface in the Admin UI?"
  :audit-app)

(define-premium-feature enable-sandboxes?
  "Should we enable data sandboxes (row-level permissions)?"
  :sandboxes)

(define-premium-feature enable-sso?
  "Should we enable advanced SSO features (SAML and JWT authentication; role and group mapping)?"
  :sso)

(define-premium-feature ^{:added "0.41.0"} enable-advanced-config?
  "Should we enable knobs and levers for more complex orgs (granular caching controls, allow-lists email domains for
  notifications, more in the future)?"
  :advanced-config)

(define-premium-feature ^{:added "0.41.0"} enable-advanced-permissions?
  "Should we enable extra knobs around permissions (block access, and in the future, moderator roles, feature-level
  permissions, etc.)?"
  :advanced-permissions)

(define-premium-feature ^{:added "0.41.0"} enable-content-management?
  "Should we enable official Collections, Question verifications (and more in the future, like workflows, forking,
  etc.)?"
  :content-management)

(defsetting is-hosted?
  "Is the Metabase instance running in the cloud?"
  :type       :boolean
  :visibility :public
  :setter     :none
  :getter     (fn [] (boolean ((token-features) "hosting"))))

;; `enhancements` are not currently a specific "feature" that EE tokens can have or not have. Instead, it's a
;; catch-all term for various bits of EE functionality that we assume all EE licenses include. (This may change in the
;; future.)
;;
;; By checking whether `(token-features)` is non-empty we can see whether we have a valid EE token. If the token is
;; valid, we can enable EE enhancements.
;;
;; DEPRECATED -- it should now be possible to use the new 0.41.0+ features for everything previously covered by
;; 'enhancements'.
(define-premium-feature ^:deprecated enable-enhancements?
  "Should we various other enhancements, e.g. NativeQuerySnippet collection permissions?"
  nil
  :getter #(and config/ee-available? (has-any-features?)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Defenterprise Macro                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- in-ee?
  "Is the current namespace an Enterprise Edition namespace?"
  []
  (str/starts-with? (name (ns-name *ns*)) "metabase-enterprise"))

(def ^:private valid-options #{:feature :fallback})

(defn- parse-defenterprise-options
  "Parses a list of args to defenterprise for keyword options and their corresponding values. Option keywords can be in
  any order, but must be members of the `valid-options` set. Returns an [options-map other-args] pair."
  [args]
  (let [[option-name more] (u/optional valid-options args)]
    (if-not option-name
      [nil more]
      (let [[option-value & other-options] more
            [options-map other-args]      (parse-defenterprise-options other-options)]
        [(merge options-map {option-name option-value})
         other-args]))))

(defn- parse-result-schema
  "Detects the schema for the return value of an enterprise function, indicated with the keyword :-, and returns
  [schema remaining-args] if it exists. Else returns [nil args]."
  [args]
  (let [[schema-indicator [schema & more]] (u/optional #{:-} args)]
    (if schema-indicator
      [schema more]
      [nil args])))

(defn- parse-defenterprise-args
  [defenterprise-args]
  (let [[result-schema more]    (parse-result-schema defenterprise-args)
        [docstr more]           (u/optional string? more)
        [ee-ns more]            (u/optional symbol? more)
        [options [args & more]] (parse-defenterprise-options more)
        [arg->schema body]      (u/optional (every-pred map? #(every? symbol? (keys %))) more)]
    {:ee-ns         ee-ns
     :docstr        docstr
     :options       options
     :args          args
     :arg->schema   arg->schema
     :result-schema result-schema
     :body          body}))

(defn validate-args
  "Generate a series of s/validate calls for the arg and schema pairs in `arg->schema`."
  [arg->schema]
  (for [[arg schema] arg->schema]
    `(s/validate ~schema ~arg)))

(defonce ^{:doc "A map from EE functions (as [namespace function] tuples) to anonymous fns which have the same body as
                their OSS equivalents. These fns are called when the EE function must fallback to the OSS behavior due
                to absence of a feature flag."}
  ee-registry
  (atom {}))

(defn- register-mapping!
  "Adds mapping from EE->OSS fn to the `ee-registry`."
  [fn-name ee-ns args body]
  (let [ee-parts  [ee-ns fn-name]
        oss-fn    (eval `(fn ~args ~@body))]
    (swap! ee-registry assoc ee-parts oss-fn)))

(defn missing-premium-token-exception
  "The default exception to throw when an EE function is called, but a required premium feature is not present."
  [fn-name feature]
  (let [message (if (= feature :any)
                  (trs "The {0} function requires a valid premium token"
                       fn-name)
                  (trs "The {0} function requires a valid premium token with the {1} feature"
                       fn-name
                       (name feature)))]
    (ex-info message {:status-code 402})))

(defmacro defenterprise-ee
  "Impl macro for `defenterprise` when used in an EE namespace. Don't use this directly."
  [{:keys [fn-name docstr args body result-schema options]}]
  (let [{:keys [feature fallback]} options]
    `(if ~(or (= feature :none)
              (if (or (not feature) (= feature :any))
                `(enable-enhancements?)
                `(has-feature? ~feature)))

       ~(if result-schema
          `(s/validate ~result-schema (do ~@body))
          `(do ~@body))

       ~(cond
          (= fallback :error)
          `(throw (missing-premium-token-exception ~(str fn-name) ~feature))

          (or (symbol? fallback) (seq? fallback))
          `(apply ~fallback ~args)

          ;; :oss and default case
          :else
          `(apply (get @ee-registry [(symbol ~(str (ns-name *ns*)))
                                     (symbol ~(str fn-name))])
                  ~args)))))

(defmacro defenterprise-oss
  "Impl macro for `defenterprise` when used in an OSS namespace. Don't use this directly."
  [{:keys [fn-name ee-ns docstr args body result-schema]}]
  (register-mapping! fn-name ee-ns args body)
  `(let [ee-fn# (u/ignore-exceptions (classloader/require (symbol ~(str ee-ns)))
                                     (ns-resolve (symbol ~(str ee-ns)) (symbol ~(str fn-name))))]
     (if ee-fn#
       (apply ee-fn# ~args)
       (let [result# (do ~@body)]
         (if ~result-schema
           (s/validate ~result-schema result#)
           result#)))))

(defmacro defenterprise
  "Defines a function that has separate implementations between the Metabase Community Edition (CE, aka OSS) and
  Enterprise Edition (EE).

  When used in a CE namespace, defines a function that should have a corresponding implementation in an EE namespace
  (using the same macro). The EE implementation will be used preferentially to the CE implementation if it is available.
  The first argument after the function name should be a symbol of the namespace containing the EE implementation. The
  corresponding EE function must have the same name as the CE function.

  When used in an EE namespace, the namespace of the corresponding CE implementation does not need to be included --
  it will be inferred automatically, as long as a corresponding [[defenterprise]] call exists in an CE namespace.

  Two additional options can be defined, when using this macro in an EE namespace. These options should be defined
  immediately before the args list of the function:

  ###### `:feature`

  A keyword representing a premium feature which must be present for the EE implementation to be used. Use `:any` to
  require a valid premium token with at least one feature, but no specific feature. Use `:none` to always run the
  EE implementation if available, regardless of token. (Default: `:any`)

  ###### `:fallback`

  A keyword or function representing the fallback mechanism which should be used if the instance does not have the
  premium feature defined by the :feature option. If a function is provided, it will be called with the same args
  as the EE function. Valid keyword options are `:error`, which causes an exception to be thrown, or `:oss`, which
  causes the CE implementation of the function to be called. (Default: `:oss`)"
  [fn-name & defenterprise-args]
  {:pre [(symbol? fn-name)]}
  (let [{:keys [docstr args arg->schema result-schema]
         :as defenterprise-args} (-> (parse-defenterprise-args defenterprise-args)
                                     (assoc :fn-name fn-name))]
    (when-not (:docstr defenterprise-args)
      (log/warn (u/format-color 'red "Warning: enterprise function %s/%s does not have a docstring. Go add one."
                  (ns-name *ns*) fn-name)))
    `(defn ~fn-name ~docstr ~args
       ~@(validate-args (:arg->schema defenterprise-args))
       ~(if (in-ee?)
          `(defenterprise-ee ~defenterprise-args)
          `(defenterprise-oss ~defenterprise-args)))))
