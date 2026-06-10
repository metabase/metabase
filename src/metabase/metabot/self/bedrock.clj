(ns metabase.metabot.self.bedrock
  "AWS Bedrock adapter targeting the bedrock-mantle endpoint.

  bedrock-mantle exposes native OpenAI- and Anthropic-compatible API surfaces, so
  this adapter dispatches on the model-id prefix and reuses the wire-format
  builders and stream translators from the dedicated provider namespaces:

    anthropic.*  -> POST /anthropic/v1/messages  (Anthropic Messages API, claude.clj)
    openai.*     -> POST /openai/v1/responses     (OpenAI Responses API, openai.clj)

  Requests are authenticated with plain AWS SigV4 (service \"bedrock\"); the
  bedrock-mantle endpoint accepts SigV4 directly, so no bearer token is required.

  The legacy ConverseStream implementation lives in
  [[metabase.metabot.self.bedrock-runtime]] for reference."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.openai :as openai]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]])
  (:import
   (java.security MessageDigest)
   (java.time ZonedDateTime ZoneOffset)
   (java.time.format DateTimeFormatter)
   (javax.crypto Mac)
   (javax.crypto.spec SecretKeySpec)))

(set! *warn-on-reflection* true)

;;; ---- SigV4 signing ----

(defn- sha256 ^bytes [^bytes data]
  (.digest (MessageDigest/getInstance "SHA-256") data))

(defn- hmac-sha256 ^bytes [^bytes k ^bytes data]
  (let [mac (Mac/getInstance "HmacSHA256")]
    (.init mac (SecretKeySpec. k "HmacSHA256"))
    (.doFinal mac data)))

(defn- hex-encode [^bytes bs]
  (let [sb (StringBuilder.)]
    (run! #(.append sb (format "%02x" (bit-and (int %) 0xff))) bs)
    (str sb)))

(defn- canonical-uri
  "Percent-encode each path segment (unreserved chars only), preserve '/'."
  [path]
  (str/join "/"
            (map (fn [seg]
                   (str/replace seg #"[^A-Za-z0-9\-._~]"
                                (fn [c] (format "%%%02X" (int (.charAt ^String c 0))))))
                 (str/split path #"/"))))

(defn- now-datetime
  "Current UTC timestamp in AWS SigV4 format: yyyyMMdd'T'HHmmss'Z'."
  []
  (.format (ZonedDateTime/now ZoneOffset/UTC)
           (DateTimeFormatter/ofPattern "yyyyMMdd'T'HHmmss'Z'")))

(defn sigv4-headers
  "Compute the SigV4 Authorization and x-amz-date headers for an AWS request.

  Returns a map of header-name -> header-value to merge into the HTTP request
  headers. The caller must also send content-type and host (they're part of the
  signed headers); any header not in the signed set (e.g. anthropic-version) can
  be added freely without invalidating the signature."
  [{:keys [access-key-id secret-access-key region session-token
           service method host path body-bytes datetime]}]
  (let [date       (subs datetime 0 8)
        b-hash     (hex-encode (sha256 (or body-bytes (byte-array 0))))
        hdr-map    (cond-> {"host"         host
                            "content-type" "application/json"
                            "x-amz-date"   datetime}
                     session-token (assoc "x-amz-security-token" session-token))
        signed     (sort (keys hdr-map))
        canon-hdrs (str (str/join "\n" (map #(str % ":" (get hdr-map %)) signed)) "\n")
        signed-str (str/join ";" signed)
        canon-req  (str/join "\n" [(u/upper-case-en method)
                                   (canonical-uri path)
                                   ""
                                   canon-hdrs
                                   signed-str
                                   b-hash])
        cred-scope (str/join "/" [date region service "aws4_request"])
        sts        (str/join "\n" ["AWS4-HMAC-SHA256"
                                   datetime
                                   cred-scope
                                   (hex-encode (sha256 (.getBytes canon-req "UTF-8")))])
        sig-key    (-> (.getBytes (str "AWS4" secret-access-key) "UTF-8")
                       (hmac-sha256 (.getBytes ^String date "UTF-8"))
                       (hmac-sha256 (.getBytes ^String region "UTF-8"))
                       (hmac-sha256 (.getBytes ^String service "UTF-8"))
                       (hmac-sha256 (.getBytes "aws4_request" "UTF-8")))
        signature  (hex-encode (hmac-sha256 sig-key (.getBytes ^String sts "UTF-8")))
        auth       (str "AWS4-HMAC-SHA256 "
                        "Credential=" access-key-id "/" cred-scope ", "
                        "SignedHeaders=" signed-str ", "
                        "Signature=" signature)]
    (cond-> {"x-amz-date"    datetime
             "authorization" auth}
      session-token (assoc "x-amz-security-token" session-token))))

;;; ---- Credentials + HTTP ----

(defn- bedrock-mantle-host [region]
  (str "bedrock-mantle." region ".api.aws"))

(defn- resolve-bedrock-creds
  "Resolve Bedrock credentials from `opts`, falling back to configured settings.
  Opts map supports :api-key (access key id), :access-key-id, :secret-access-key,
  :region, :session-token. Throws when the access key id or secret is missing."
  [{:keys [api-key access-key-id secret-access-key region session-token]}]
  (let [key-id  (not-empty (or access-key-id api-key (llm/llm-bedrock-access-key-id)))
        secret  (not-empty (or secret-access-key (llm/llm-bedrock-secret-access-key)))
        region  (or (not-empty region) (not-empty (llm/llm-bedrock-region)) "us-east-1")
        session (not-empty (or session-token (llm/llm-bedrock-session-token)))]
    (when-not key-id
      (throw (core/missing-api-key-ex "AWS Bedrock")))
    (when-not secret
      (throw (ex-info (tru "AWS Bedrock Secret Access Key is not configured")
                      {:api-error true :error-code :api-key-missing :status 401})))
    {:access-key-id     key-id
     :secret-access-key secret
     :region            region
     :session-token     session}))

(defn- bedrock-error-msg [res]
  (let [status (long (:status res 0))]
    (case status
      400 (tru "AWS Bedrock rejected the request (bad request or unsupported model)")
      401 (tru "AWS Bedrock credentials are invalid")
      403 (tru "AWS Bedrock access denied — check IAM permissions and region")
      404 (tru "AWS Bedrock model not found")
      429 (tru "AWS Bedrock has rate limited us")
      500 (tru "AWS Bedrock internal error")
      (tru "AWS Bedrock API error (HTTP {0})" status))))

(defn- bedrock-request
  "SigV4-sign (service \"bedrock\") and execute an HTTP request against the
  bedrock-mantle endpoint resolved from `creds`.

  `method` is :get or :post. `path` is the request path. Options:
    :body          - a Clojure value to JSON-encode (nil for GET)
    :extra-headers - additional, unsigned request headers (e.g. anthropic-version)
    :as            - clj-http response coercion (:json or :stream)

  Lets clj-http throw on non-2xx so [[core/rethrow-api-error!]] can translate it."
  [{:keys [region] :as creds} method path {:keys [body extra-headers as]}]
  (let [host       (bedrock-mantle-host region)
        body-bytes (when body (.getBytes ^String (json/encode body) "UTF-8"))
        datetime   (now-datetime)
        sig-hdrs   (sigv4-headers {:access-key-id     (:access-key-id creds)
                                   :secret-access-key (:secret-access-key creds)
                                   :region            region
                                   :session-token     (:session-token creds)
                                   :service           "bedrock"
                                   :method            (u/upper-case-en (name method))
                                   :host              host
                                   :path              path
                                   :body-bytes        body-bytes
                                   :datetime          datetime})]
    (http/request (cond-> {:method  method
                           :url     (str "https://" host path)
                           :headers (merge {"content-type" "application/json"} sig-hdrs extra-headers)
                           :as      as}
                    body-bytes (assoc :body body-bytes)))))

;;; ---- Model listing ----

(defn list-all-models
  "List every model in the bedrock-mantle catalog (GET /v1/models), regardless of
  whether this adapter can drive it. No-arg uses configured settings; opts are as
  for [[resolve-bedrock-creds]]."
  ([] (list-all-models {}))
  ([opts]
   (let [creds (resolve-bedrock-creds opts)]
     (try
       (let [response (bedrock-request creds :get "/v1/models" {:as :json})]
         {:models (->> (get-in response [:body :data])
                       (mapv (fn [m] {:id (:id m) :display_name (:id m)})))})
       (catch Exception e
         (core/rethrow-api-error! "bedrock" bedrock-error-msg e))))))

(def ^:private supported-model-prefixes
  "bedrock-mantle model-id prefixes whose API surface this adapter implements."
  ["anthropic." "openai."])

(defn- supported-model-id?
  [id]
  (boolean (some #(str/starts-with? id %) supported-model-prefixes)))

(defn list-models
  "List the bedrock-mantle models this adapter can drive: the anthropic.* (Messages
  API) and openai.* (Responses API) families, filtered out of the full catalog.
  No-arg uses configured settings; opts are as for [[resolve-bedrock-creds]]."
  ([] (list-models {}))
  ([opts]
   (update (list-all-models opts) :models #(filterv (comp supported-model-id? :id) %))))

;;; ---- Streaming inference ----

(defn- anthropic-model? [model] (str/starts-with? (or model "") "anthropic."))
(defn- openai-model?    [model] (str/starts-with? (or model "") "openai."))

(defn- ->mantle-anthropic-body
  "Adapt the shared Claude request body for bedrock-mantle's Anthropic surface,
  which is stricter than api.anthropic.com and rejects the non-standard top-level
  `:cache_control` field. Per-block `cache_control` (on system/tools) is kept."
  [body]
  (dissoc body :cache_control))

(mu/defn bedrock-raw
  "Perform a streaming request to bedrock-mantle and return a reducible of parsed
  SSE events. Dispatches on the model-id prefix: anthropic.* speaks the Anthropic
  Messages wire format, openai.* the OpenAI Responses wire format."
  [{:keys [model input tools]
    :or   {model "anthropic.claude-haiku-4-5"}
    :as   opts} :- core/LLMRequestOpts]
  (let [creds (resolve-bedrock-creds opts)
        [path req extra-headers]
        (cond
          (anthropic-model? model)
          ["/anthropic/v1/messages"
           (->mantle-anthropic-body (claude/claude-request-body (assoc opts :model model)))
           {"anthropic-version" (llm/llm-anthropic-api-version)}]

          (openai-model? model)
          ["/openai/v1/responses"
           (openai/openai-request-body (assoc opts :model model))
           nil]

          :else
          (throw (ex-info (tru "Unsupported Bedrock model: {0}" model)
                          {:api-error true :error-code :unsupported-model :status 400})))]
    (with-span :info {:name       :metabot.bedrock/request
                      :model      model
                      :msg-count  (count input)
                      :tool-count (count tools)}
      (try
        (let [response (bedrock-request creds :post path {:body req :extra-headers extra-headers :as :stream})]
          (core/sse-reducible (:body response)))
        (catch Exception e
          (core/rethrow-api-error! "bedrock" bedrock-error-msg e))))))

(defn bedrock
  "Call AWS Bedrock via the mantle endpoint and return an AISDK chunk stream.
  Selects the stream translator that matches the model's API family."
  [{:keys [model] :as opts}]
  (let [xf (if (openai-model? model)
             (openai/openai->aisdk-chunks-xf)
             (claude/claude->aisdk-chunks-xf))]
    (eduction xf (bedrock-raw opts))))

(comment
  (list-models)
  (list-all-models)

  ;; anthropic (us-east-1)
  (into [] (bedrock {:model "anthropic.claude-haiku-4-5"
                     :input [{:role :user :content "hello"}]}))

  ;; openai (us-east-2)
  (into [] (bedrock {:model  "openai.gpt-5.5"
                     :region "us-east-2"
                     :input  [{:role :user :content "hello"}]})))
