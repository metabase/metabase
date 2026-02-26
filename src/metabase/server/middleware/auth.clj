(ns metabase.server.middleware.auth
  "Middleware related to enforcing authentication/API keys (when applicable). Unlike most other middleware most of this
  is not used as part of the normal `app`; it is instead added selectively to appropriate routes."
  (:require
   [buddy.core.bytes :as bytes]
   [buddy.core.codecs :as codecs]
   [buddy.core.mac :as mac]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise metabot-slack-signing-secret-setting
  "Returns the Slack signing secret for Metabot (EE only)."
  metabase-enterprise.metabot-v3.settings
  []
  nil)

(def ^:private ^:const max-slack-timestamp-age-seconds
  "Maximum age in seconds for a Slack request timestamp. Requests older than this are rejected
   to prevent replay attacks. Slack recommends 5 minutes (300 seconds)."
  300)

(defn- current-unix-timestamp
  "Returns current Unix timestamp in seconds. Extracted for testability."
  []
  (quot (System/currentTimeMillis) 1000))

(defn- slack-timestamp-valid?
  "Check if the Slack request timestamp is within the acceptable time window.
   Returns false if timestamp is missing, malformed, or too old."
  [timestamp]
  (if timestamp
    (try
      (let [request-time (Long/parseLong timestamp)
            current-time (current-unix-timestamp)
            age (Math/abs (long (- current-time request-time)))]
        (<= age max-slack-timestamp-age-seconds))
      (catch NumberFormatException _
        false))
    false))

(def ^:private ^:const ^String static-metabase-api-key-header "x-metabase-apikey")

(defn- wrap-static-api-key* [{:keys [headers], :as request}]
  (if-let [api-key (headers static-metabase-api-key-header)]
    (assoc request :static-metabase-api-key api-key)
    request))

(defn wrap-static-api-key
  "Middleware that sets the `:static-metabase-api-key` keyword on the request if a valid API Key can be found. We check
  the request headers for `X-METABASE-APIKEY` and if it's not found then no keyword is bound to the request."
  [handler]
  (fn [request respond raise]
    (handler (wrap-static-api-key* request) respond raise)))

(defn- hmac-sha256
  "Generate HMAC-SHA256 signature"
  [key message]
  (-> (mac/hash message {:key key :alg :hmac+sha256})
      codecs/bytes->hex))

(defn- verify-slack-signature
  "Verify that the request came from Slack using signature verification.
   Returns nil if no signing secret is configured, false if timestamp is too old
   (replay attack prevention) or signature is invalid, true if valid."
  [request-body timestamp slack-signature]
  (when-let [signing-secret (metabot-slack-signing-secret-setting)]
    (and (slack-timestamp-valid? timestamp)
         (some? slack-signature)
         (let [message (str "v0:" timestamp ":" request-body)
               computed-signature (hmac-sha256 signing-secret message)
               expected-signature (str "v0=" computed-signature)]
           ;; Use constant-time comparison to prevent timing attacks
           (bytes/equals? (.getBytes expected-signature "UTF-8")
                          (.getBytes slack-signature "UTF-8"))))))

(defn verify-slack-request
  "Middleware that detects if an incoming request is from Slack and sets the `:slack/validated?` keyword on a request
  with a boolean if that request has been correctly signed with our signing secret."
  [handler]
  (fn
    [req respond raise]
    (let [signature (get-in req [:headers "x-slack-signature"])]
      (if signature
        (let [timestamp (get-in req [:headers "x-slack-request-timestamp"])
              str-body (slurp (:body req))
              valid? (verify-slack-signature str-body timestamp signature)]
          (handler (-> req
                       (assoc :body (java.io.StringBufferInputStream. str-body))
                       (assoc :slack/validated? valid?))
                   respond raise))
        (handler req respond raise)))))
