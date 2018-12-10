(ns metabase.public-settings.metastore
  "Settings related to checking token validity and accessing the MetaStore."
  (:require [cheshire.core :as json]
            [clojure.core.memoize :as memoize]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [environ.core :refer [env]]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.util
             [i18n :refer [trs tru]]
             [schema :as su]]
            [schema.core :as s]))

(def ^:private ValidToken
  "Schema for a valid metastore token. Must be 64 lower-case hex characters."
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
  (log/info (trs "Checking with the MetaStore to see whether {0} is valid..." token))
  (deref
   (future
     (println (u/format-color 'green (trs "Using this URL to check token: {0}" (token-status-url token))))
     (try (some-> (token-status-url token)
                  slurp
                  (json/parse-string keyword))
          ;; slurp will throw a FileNotFoundException for 404s, so in that case just return an appropriate
          ;; 'Not Found' message
          (catch java.io.FileNotFoundException e
            {:valid false, :status (tru "Unable to validate token: 404 not found.")})
          ;; if there was any other error fetching the token, log it and return a generic message about the
          ;; token being invalid. This message will get displayed in the Settings page in the admin panel so
          ;; we do not want something complicated
          (catch Throwable e
            (log/error e (trs "Error fetching token status:"))
            {:valid false, :status (str (tru "There was an error checking whether this token was valid:")
                                        " "
                                        (.getMessage e))})))
   fetch-token-status-timeout-ms
   {:valid false, :status (tru "Token validation timed out.")}))

(def ^:private ^{:arglists '([token])} fetch-token-status
  "TTL-memoized version of `fetch-token-status*`. Caches API responses for 5 minutes. This is important to avoid making
  too many API calls to the Store, which will throttle us if we make too many requests; putting in a bad token could
  otherwise put us in a state where `valid-token->features*` made API calls over and over, never itself getting cached
  because checks failed. "
  (memoize/ttl
   fetch-token-status*
   :ttl/threshold (* 1000 60 5)))

(s/defn ^:private valid-token->features* :- #{su/NonBlankString}
  [token :- ValidToken]
  (let [{:keys [valid status features]} (fetch-token-status token)]
    ;; if token isn't valid throw an Exception with the `:status` message
    (when-not valid
      (throw (Exception. ^String status)))
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
  (tru "Token for premium features. Go to the MetaStore to get yours!")
  :setter
  (fn [new-value]
    ;; validate the new value if we're not unsetting it
    (try
      (when (seq new-value)
        (when (s/check ValidToken new-value)
          (throw (ex-info (str (tru "Token format is invalid. Token should be 64 hexadecimal characters."))
                   {:status-code 400})))
        (valid-token->features new-value)
        (log/info (trs "Token is valid.")))
      (setting/set-string! :premium-embedding-token new-value)
      (catch Throwable e
        (log/error e (trs "Error setting premium features token"))
        (throw (ex-info (.getMessage e) {:status-code 400}))))))

(s/defn ^:private token-features :- #{su/NonBlankString}
  "Get the features associated with the system's premium features token."
  []
  (try
    (or (some-> (premium-embedding-token) valid-token->features)
        #{})
    (catch Throwable e
      (log/error (trs "Error validating token:") (.getMessage e))
      #{})))

(defn hide-embed-branding?
  "Should we hide the 'Powered by Metabase' attribution on the embedding pages? `true` if we have a valid premium
   embedding token."
  []
  (boolean ((token-features) "embedding")))

(defn enable-whitelabeling?
  "Should we allow full whitelabel embedding (reskinning the entire interface?)"
  []
  (boolean ((token-features) "whitelabel")))

(defn enable-audit-app?
  "Should we allow use of the audit app?"
  []
  (boolean ((token-features) "audit-app")))

(defn enable-sandboxes?
  "Should we enable data sandboxes (row and column-level permissions?"
  []
  (boolean ((token-features) "sandboxes")))

(defn enable-sso?
  "Should we enable SAML/JWT sign-in?"
  []
  (boolean ((token-features) "sso")))
