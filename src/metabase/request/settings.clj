(ns metabase.request.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]))

(defsetting source-address-header
  (deferred-tru "Identify the source of HTTP requests by this header''s value, instead of its remote address.")
  :encryption :no
  :default "X-Forwarded-For"
  :export? true
  :audit   :getter
  :getter  (fn [] (some-> (setting/get-value-of-type :string :source-address-header)
                          u/lower-case-en)))

(defsetting not-behind-proxy
  (deferred-tru
   (str "Indicates whether Metabase is running behind a proxy that sets the source-address-header for incoming "
        "requests."))
  :type       :boolean
  :visibility :internal
  :default    false
  :export?    false)

(def ^:private possible-session-cookie-samesite-values
  #{:lax :none :strict nil})

(defn- normalized-session-cookie-samesite [value]
  (some-> value name u/lower-case-en keyword))

(defn- valid-session-cookie-samesite?
  [normalized-value]
  (contains? possible-session-cookie-samesite-values normalized-value))

(defn- -session-cookie-samesite []
  (let [value (normalized-session-cookie-samesite
               (setting/get-raw-value :session-cookie-samesite))]
    (if (valid-session-cookie-samesite? value)
      value
      (throw (ex-info "Invalid value for session cookie samesite"
                      {:possible-values possible-session-cookie-samesite-values
                       :session-cookie-samesite value})))))

(defn- -session-cookie-samesite!
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

(defsetting session-cookie-samesite
  (deferred-tru "Value for the session cookie''s `SameSite` directive.")
  :type :keyword
  :visibility :settings-manager
  :default :lax
  :getter #'-session-cookie-samesite
  :setter #'-session-cookie-samesite!
  :doc "See [Embedding Metabase in a different domain](../embedding/full-app-embedding.md#embedding-metabase-in-a-different-domain).
        Read more about [Full app embedding](../embedding/full-app-embedding.md).
        Learn more about [SameSite cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite).")

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

(defn- -session-timeout []
  (let [value (setting/get-value-of-type :json :session-timeout)]
    (if-let [error-key (check-session-timeout value)]
      (do
        (log/warn (case error-key
                    :amount-must-be-positive            "Session timeout amount must be positive."
                    :amount-must-be-less-than-100-years "Session timeout must be less than 100 years."))
        nil)
      value)))

(defn- -session-timeout! [new-value]
  (when-let [error-key (check-session-timeout new-value)]
    (throw (ex-info (case error-key
                      :amount-must-be-positive            "Session timeout amount must be positive."
                      :amount-must-be-less-than-100-years "Session timeout must be less than 100 years.")
                    {:status-code 400})))
  (setting/set-value-of-type! :json :session-timeout new-value))

(defsetting session-timeout
  ;; Should be in the form "{\"amount\":60,\"unit\":\"minutes\"}" where the unit is one of "seconds", "minutes"
  ;; or "hours". The amount is nillable.
  (deferred-tru "Time before inactive users are logged out. By default, sessions last indefinitely.")
  :encryption :no
  :type       :json
  :default    nil
  :getter     #'-session-timeout
  :setter     #'-session-timeout!
  :doc        (str "Has to be in the JSON format `\"{\"amount\":120,\"unit\":\"minutes\"}\"` where the unit is one of"
                   " \"seconds\", \"minutes\" or \"hours\"."))
