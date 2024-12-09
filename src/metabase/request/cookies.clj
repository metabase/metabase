(ns metabase.request.cookies
  "Code and constants related to getting and setting cookies in Ring requests and responses."
  (:require
   [java-time.api :as t]
   [metabase.config :as config]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.public-settings :as public-settings]
   [metabase.request.util :as request.util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [ring.util.response :as response]))

(def metabase-session-cookie
  "Key for the session cookie."
  "metabase.SESSION")

(def metabase-embedded-session-cookie
  "Key for the embedded session cookie."
  "metabase.EMBEDDED_SESSION")

(def metabase-session-timeout-cookie
  "Key for the session timeout cookie. (See #23349 for more on the purpose of this cookie.)"
  "metabase.TIMEOUT")

(def anti-csrf-token-header
  "Header name for the anti-CSRF token we set for certain requests."
  "x-metabase-anti-csrf-token")

(defn- clear-cookie [response cookie-name]
  (response/set-cookie response cookie-name nil {:expires "Thu, 1 Jan 1970 00:00:00 GMT", :path "/"}))

(defn- wrap-body-if-needed
  "You can't add a cookie (by setting the `:cookies` key of a response) if the response is an unwrapped JSON response;
  wrap `response` if needed."
  [response]
  (if (and (map? response) (contains? response :body))
    response
    {:body response, :status 200}))

(defn clear-session-cookie
  "Add a header to `response` to clear the current Metabase session cookie."
  [response]
  (reduce clear-cookie (wrap-body-if-needed response) [metabase-session-cookie
                                                       metabase-embedded-session-cookie
                                                       metabase-session-timeout-cookie]))

(def ^:private possible-session-cookie-samesite-values
  #{:lax :none :strict nil})

(defn- normalized-session-cookie-samesite [value]
  (some-> value name u/lower-case-en keyword))

(defn- valid-session-cookie-samesite?
  [normalized-value]
  (contains? possible-session-cookie-samesite-values normalized-value))

(defsetting session-cookie-samesite
  (deferred-tru "Value for the session cookie's `SameSite` directive.")
  :type :keyword
  :visibility :settings-manager
  :default :lax
  :getter (fn session-cookie-samesite-getter []
            (let [value (normalized-session-cookie-samesite
                         (setting/get-raw-value :session-cookie-samesite))]
              (if (valid-session-cookie-samesite? value)
                value
                (throw (ex-info "Invalid value for session cookie samesite"
                                {:possible-values possible-session-cookie-samesite-values
                                 :session-cookie-samesite value})))))
  :setter (fn session-cookie-samesite-setter
            [new-value]
            (let [normalized-value (normalized-session-cookie-samesite new-value)]
              (if (valid-session-cookie-samesite? normalized-value)
                (setting/set-value-of-type!
                 :keyword
                 :session-cookie-samesite
                 normalized-value)
                (throw (ex-info (tru "Invalid value for session cookie samesite")
                                {:possible-values possible-session-cookie-samesite-values
                                 :session-cookie-samesite normalized-value
                                 :http-status 400})))))
  :doc "See [Embedding Metabase in a different domain](../embedding/interactive-embedding.md#embedding-metabase-in-a-different-domain).
        Read more about [interactive Embedding](../embedding/interactive-embedding.md).
        Learn more about [SameSite cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite).")

(defmulti default-session-cookie-attributes
  "The appropriate cookie attributes to persist a newly created Session to `response`."
  {:arglists '([session-type request])}
  (fn [session-type _] session-type))

(defmethod default-session-cookie-attributes :default
  [session-type _]
  (throw (ex-info (str (tru "Invalid session-type."))
                  {:session-type session-type})))

(defmethod default-session-cookie-attributes :normal
  [_ request]
  (merge
   {:same-site (session-cookie-samesite)
    ;; TODO - we should set `site-path` as well. Don't want to enable this yet so we don't end
    ;; up breaking things issue: https://github.com/metabase/metabase/issues/39346
    :path      "/" #_(site-path)}
   ;; If the authentication request request was made over HTTPS (hopefully always except for
   ;; local dev instances) add `Secure` attribute so the cookie is only sent over HTTPS.
   (when (request.util/https? request)
     {:secure true})))

(defmethod default-session-cookie-attributes :full-app-embed
  [_ request]
  (merge
   {:path "/"}
   (when (request.util/https? request)
     ;; SameSite=None is required for cross-domain full-app embedding. This is safe because
     ;; security is provided via anti-CSRF token. Note that most browsers will only accept
     ;; SameSite=None with secure cookies, thus we are setting it only over HTTPS to prevent
     ;; the cookie from being rejected in case of same-domain embedding.
     {:same-site :none
      :secure    true})))

(defn- check-session-timeout
  "Returns nil if the [[session-timeout]] value is valid. Otherwise returns an error key."
  [timeout]
  (when (some? timeout)
    (let [{:keys [unit amount]} timeout
          units-in-24-hours (case unit
                              "seconds" (* 60 60 24)
                              "minutes" (* 60 24)
                              "hours"   24)
          units-in-100-years (* units-in-24-hours 365.25 100)]
      (cond
        (not (pos? amount))
        :amount-must-be-positive
        (>= amount units-in-100-years)
        :amount-must-be-less-than-100-years))))

(defsetting session-timeout
  ;; Should be in the form "{\"amount\":60,\"unit\":\"minutes\"}" where the unit is one of "seconds", "minutes" or "hours".
  ;; The amount is nillable.
  (deferred-tru "Time before inactive users are logged out. By default, sessions last indefinitely.")
  :encryption :no
  :type       :json
  :default    nil
  :getter     (fn []
                (let [value (setting/get-value-of-type :json :session-timeout)]
                  (if-let [error-key (check-session-timeout value)]
                    (do (log/warn (case error-key
                                    :amount-must-be-positive            "Session timeout amount must be positive."
                                    :amount-must-be-less-than-100-years "Session timeout must be less than 100 years."))
                        nil)
                    value)))
  :setter     (fn [new-value]
                (when-let [error-key (check-session-timeout new-value)]
                  (throw (ex-info (case error-key
                                    :amount-must-be-positive            "Session timeout amount must be positive."
                                    :amount-must-be-less-than-100-years "Session timeout must be less than 100 years.")
                                  {:status-code 400})))
                (setting/set-value-of-type! :json :session-timeout new-value))
  :doc        "Has to be in the JSON format `\"{\"amount\":120,\"unit\":\"minutes\"}\"` where the unit is one of \"seconds\", \"minutes\" or \"hours\".")

(defn session-timeout->seconds
  "Convert the session-timeout setting value to seconds."
  [{:keys [unit amount]}]
  (when amount
    (-> (case unit
          "seconds" amount
          "minutes" (* amount 60)
          "hours"   (* amount 3600))
        (max 60)))) ; Ensure a minimum of 60 seconds so a user can't lock themselves out

(defn session-timeout-seconds
  "Returns the number of seconds before a session times out. An alternative to calling `(session-timeout) directly`"
  []
  (session-timeout->seconds (session-timeout)))

(defn set-session-timeout-cookie
  "Add an appropriate timeout cookie to track whether the session should timeout or not, according to the [[session-timeout]] setting.
   If the session-timeout setting is on, the cookie has an appropriately timed expires attribute.
   If the session-timeout setting is off, the cookie has a max-age attribute, so it expires in the far future."
  [response request session-type request-time]
  (let [response       (wrap-body-if-needed response)
        timeout        (session-timeout-seconds)
        cookie-options (merge
                        (default-session-cookie-attributes session-type request)
                        (if (some? timeout)
                          {:expires (t/format :rfc-1123-date-time (t/plus request-time (t/seconds timeout)))}
                          {:max-age (* 60 (config/config-int :max-session-age))}))]
    (-> response
        wrap-body-if-needed
        (response/set-cookie metabase-session-timeout-cookie "alive" cookie-options))))

(defn session-cookie-name
  "Returns the appropriate cookie name for the session type."
  [session-type]
  (case session-type
    :normal
    metabase-session-cookie
    :full-app-embed
    metabase-embedded-session-cookie))

(defn- use-permanent-cookies?
  "Check if we should use permanent cookies for a given request, which are not cleared when a browser sesion ends."
  [request]
  (if (public-settings/session-cookies)
    ;; Disallow permanent cookies if MB_SESSION_COOKIES is set
    false
    ;; Otherwise check whether the user selected "remember me" during login
    (get-in request [:body :remember])))

(mu/defn set-session-cookies
  "Add the appropriate cookies to the `response` for the Session."
  [request
   response
   {session-uuid :id
    session-type :type
    anti-csrf-token :anti_csrf_token
    :as _session-instance} :- [:map [:id [:or
                                          uuid?
                                          [:re u/uuid-regex]]]]
   request-time]
  (let [cookie-options (merge
                        (default-session-cookie-attributes session-type request)
                        {:http-only true}
                        ;; If permanent cookies should be used, set the `Max-Age` directive; cookies with no
                        ;; `Max-Age` and no `Expires` directives are session cookies, and are deleted when the
                        ;; browser is closed.
                        ;; See https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#define_the_lifetime_of_a_cookie
                        ;; max-session age-is in minutes; Max-Age= directive should be in seconds
                        (when (use-permanent-cookies? request)
                          {:max-age (* 60 (config/config-int :max-session-age))}))]
    (when (and (= (session-cookie-samesite) :none) (not (request.util/https? request)))
      (log/warn
       (str "Session cookie's SameSite is configured to \"None\", but site is served over an insecure connection."
            " Some browsers will reject cookies under these conditions."
            " https://www.chromestatus.com/feature/5633521622188032")))
    (-> response
        wrap-body-if-needed
        (cond-> (= session-type :full-app-embed)
          (assoc-in [:headers anti-csrf-token-header] anti-csrf-token))
        (set-session-timeout-cookie request session-type request-time)
        (response/set-cookie (session-cookie-name session-type) (str session-uuid) cookie-options))))
