(ns metabase.public-settings.premium-features
  "Settings related to checking premium token validity and which premium features it allows."
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.core.memoize :as memoize]
            #_:clj-kondo/ignore
            [clojure.spec.alpha :as spec]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [environ.core :refer [env]]
            [metabase.config :as config]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [metabase.util.i18n :refer [deferred-tru trs tru]]
            [metabase.util.schema :as su]
            [schema.core :as schema]
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
  {:valid                               schema/Bool
   :status                              su/NonBlankString
   (schema/optional-key :error-details) (schema/maybe su/NonBlankString)
   (schema/optional-key :features)      [su/NonBlankString]
   (schema/optional-key :trial)         schema/Bool
   (schema/optional-key :valid_thru)    su/NonBlankString ; ISO 8601 timestamp
   ;; don't explode in the future if we add more to the response! lol
   schema/Any                           schema/Any})

(schema/defn ^:private fetch-token-status* :- TokenStatus
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
          (catch Exception e
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

(schema/defn ^:private valid-token->features* :- #{su/NonBlankString}
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
        (when (schema/check ValidToken new-value)
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

(let [cached-logger (memoize/ttl
                     ^{::memoize/args-fn (fn [[token _e]] [token])}
                     (fn [_token e]
                       (log/error (trs "Error validating token") ":" (ex-message e))
                       (log/debug e (trs "Error validating token")))
                     ;; log every five minutes
                     :ttl/threshold (* 1000 60 5))]
  (schema/defn ^:private token-features :- #{su/NonBlankString}
    "Get the features associated with the system's premium features token."
    []
    (try
      (or (some-> (premium-embedding-token) valid-token->features)
          #{})
      (catch Throwable e
        (cached-logger (premium-embedding-token) e)
        #{}))))

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
      (if (= feature :any)
        #_{:clj-kondo/ignore [:deprecated-var]}
        (enable-enhancements?)
        (has-feature? feature))))

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
                            `(schema/fn ~(symbol (str fn-name)) :- ~return-schema ~@fn-tail)
                            `(fn ~(symbol (str fn-name)) ~@fn-tail))]
       (register-mapping! ee-fn-name# (merge ~options {~oss-or-ee oss-or-ee-fn#}))
       (def
         ~(vary-meta fn-name assoc :arglists ''([& args]))
         ~docstr
         (dynamic-ee-oss-fn ee-ns# ee-fn-name#)))))

(defn- options-conformer
  [conformed-options]
  (into {} (map (comp (juxt :k :v) second) conformed-options)))

(spec/def ::defenterprise-options
  (spec/&
   (spec/*
    (spec/alt
     :feature  (spec/cat :k #{:feature}  :v keyword?)
     :fallback (spec/cat :k #{:fallback} :v #(or (#{:oss} %) (symbol? %)))))
   (spec/conformer options-conformer)))

(spec/def ::defenterprise-args
  (spec/cat :docstr  (spec/? string?)
            :ee-ns   (spec/? symbol?)
            :options (spec/? ::defenterprise-options)
            :fn-tail (spec/* any?)))

(spec/def ::defenterprise-schema-args
  (spec/cat :return-schema      (spec/? (spec/cat :- #{:-}
                                                  :schema any?))
            :defenterprise-args (spec/? ::defenterprise-args)))

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

  A keyword representing a premium feature which must be present for the EE implementation to be used. Use `:any` to
  require a valid premium token with at least one feature, but no specific feature. Use `:none` to always run the
  EE implementation if available, regardless of token.

  ###### `:fallback`

  The keyword `:oss`, or a function representing the fallback mechanism which should be used if the instance does not
  have the premium feature defined by the :feature option. If a function is provided, it will be called with the same
  args as the EE function. If `:oss` is provided, it causes the OSS implementation of the function to be called.
  (Default: `:oss`)"
  [fn-name & defenterprise-args]
  {:pre [(symbol? fn-name)]}
  (let [parsed-args (spec/conform ::defenterprise-args defenterprise-args)
        _           (when (spec/invalid? parsed-args)
                      (throw (ex-info "Failed to parse defenterprise args"
                                      (spec/explain-data ::defenterprise-args parsed-args))))
        args        (assoc parsed-args :fn-name fn-name)]
    `(defenterprise-impl ~args)))

(defmacro defenterprise-schema
  "A version of defenterprise which allows for schemas to be defined for the args and return value. Schema syntax is
  the same as when using `schema/defn`. Otherwise identical to `defenterprise`; see the docstring of that macro for
  usage details."
  [fn-name & defenterprise-args]
  {:pre [(symbol? fn-name)]}
  (let [parsed-args (spec/conform ::defenterprise-schema-args defenterprise-args)
        _           (when (spec/invalid? parsed-args)
                      (throw (ex-info "Failed to parse defenterprise-schema args"
                                      (spec/explain-data ::defenterprise-schema-args parsed-args))))
        args        (-> (:defenterprise-args parsed-args)
                        (assoc :schema? true)
                        (assoc :return-schema (-> parsed-args :return-schema :schema))
                        (assoc :fn-name fn-name))]
    `(defenterprise-impl ~args)))
