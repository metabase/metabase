(ns metabase.metabot.self.bedrock
  "Amazon Bedrock provider adapter using the Converse Stream API.

  Uses self-contained AWS Signature V4 signing (no AWS SDK dependency).
  Supports 3 auth modes: IAM credentials, session token, and IAM role (auto via IMDS/STS)."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [malli.json-schema :as mjs]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.schema :as schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]])
  (:import
   (java.io InputStream)
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)
   (java.time Instant ZoneOffset)
   (java.time.format DateTimeFormatter)
   (javax.crypto Mac)
   (javax.crypto.spec SecretKeySpec)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ AWS SigV4 Signing ------------------------------------------------

(defn- sha256-hex
  "Compute SHA-256 hex digest of a string."
  ^String [^String s]
  (let [md (MessageDigest/getInstance "SHA-256")
        digest (.digest md (.getBytes (or s "") StandardCharsets/UTF_8))]
    (str/join (map #(format "%02x" %) digest))))

(defn- hmac-sha256
  "Compute HMAC-SHA256, returning raw bytes."
  ^bytes [^bytes key-bytes ^String data]
  (let [mac (Mac/getInstance "HmacSHA256")
        spec (SecretKeySpec. key-bytes "HmacSHA256")]
    (.init mac spec)
    (.doFinal mac (.getBytes data StandardCharsets/UTF_8))))

(defn- derive-signing-key
  "Derive the AWS SigV4 signing key."
  ^bytes [^String secret-key ^String date-stamp ^String region ^String service]
  (-> (.getBytes (str "AWS4" secret-key) StandardCharsets/UTF_8)
      (hmac-sha256 date-stamp)
      (hmac-sha256 region)
      (hmac-sha256 service)
      (hmac-sha256 "aws4_request")))

(defn- bytes->hex
  ^String [^bytes b]
  (str/join (map #(format "%02x" %) b)))

(defn- sign-request
  "Sign an HTTP request with AWS Signature V4.
  Returns a map of headers to add to the request."
  [{:keys [method uri query-string headers body
           access-key secret-key session-token
           region service]}]
  (let [now          (Instant/now)
        amz-date     (.format (.withZone (DateTimeFormatter/ofPattern "yyyyMMdd'T'HHmmss'Z'")
                                         ZoneOffset/UTC)
                              now)
        date-stamp   (.format (.withZone (DateTimeFormatter/ofPattern "yyyyMMdd")
                                         ZoneOffset/UTC)
                              now)
        payload-hash (sha256-hex (or body ""))
        ;; Build headers to sign
        base-headers (sorted-map
                      "content-type"          (get headers "content-type" "application/json")
                      "host"                  (get headers "host")
                      "x-amz-content-sha256"  payload-hash
                      "x-amz-date"            amz-date)
        sign-headers (if session-token
                       (assoc base-headers "x-amz-security-token" session-token)
                       base-headers)
        signed-headers-str (str/join ";" (keys sign-headers))
        canonical-headers  (str/join (map (fn [[k v]] (str k ":" v "\n")) sign-headers))
        ;; AWS SigV4 requires the canonical URI to be URI-encoded per RFC 3986.
        ;; Encode each path segment individually (preserving "/") to match what
        ;; clj-http/Apache HttpClient sends on the wire.
        canonical-uri      (->> (str/split uri #"/")
                                (map #(-> (java.net.URLEncoder/encode ^String % "UTF-8")
                                          (str/replace "+" "%20")))
                                (str/join "/"))
        canonical-request  (str/join "\n"
                                     [(u/upper-case-en (name method))
                                      canonical-uri
                                      (or query-string "")
                                      canonical-headers
                                      signed-headers-str
                                      payload-hash])
        scope              (str date-stamp "/" region "/" service "/aws4_request")
        string-to-sign     (str/join "\n"
                                     ["AWS4-HMAC-SHA256"
                                      amz-date
                                      scope
                                      (sha256-hex canonical-request)])
        signing-key        (derive-signing-key secret-key date-stamp region service)
        signature          (bytes->hex (hmac-sha256 signing-key string-to-sign))
        auth-header        (str "AWS4-HMAC-SHA256 "
                                "Credential=" access-key "/" scope ", "
                                "SignedHeaders=" signed-headers-str ", "
                                "Signature=" signature)]
    (log/debugf "SigV4 canonical request:\n%s" canonical-request)
    (log/debugf "SigV4 string-to-sign:\n%s" string-to-sign)
    (cond-> {"Authorization"        auth-header
             "content-type"         (get headers "content-type" "application/json")
             "x-amz-date"           amz-date
             "x-amz-content-sha256" payload-hash}
      session-token (assoc "x-amz-security-token" session-token))))

;;; ------------------------------------------ Credential Resolution ------------------------------------------

(defonce ^:private credential-cache
  (atom {:access-key-id     nil
         :secret-access-key nil
         :session-token     nil
         :expiration        nil}))

(defn- credentials-expired?
  "Check if cached credentials are within 5 minutes of expiry."
  [{:keys [expiration]}]
  (or (nil? expiration)
      (.isBefore ^Instant expiration
                 (.plusSeconds (Instant/now) 300))))

(defn- fetch-imds-token
  "Fetch an IMDSv2 session token. Returns nil if IMDS is unavailable."
  []
  (try
    (:body (http/put "http://169.254.169.254/latest/api/token"
                     {:headers {"X-aws-ec2-metadata-token-ttl-seconds" "21600"}
                      :socket-timeout 2000
                      :connection-timeout 1000}))
    (catch Exception _ nil)))

(defn- fetch-imds-credentials
  "Fetch credentials from EC2/ECS instance metadata service."
  []
  (let [imds-token (fetch-imds-token)
        imds-headers (when imds-token
                       {"X-aws-ec2-metadata-token" imds-token})
        role-name (str/trim
                   (:body (http/get "http://169.254.169.254/latest/meta-data/iam/security-credentials/"
                                    {:headers imds-headers
                                     :socket-timeout 2000
                                     :connection-timeout 1000})))
        creds-body (json/decode+kw
                    (:body (http/get (str "http://169.254.169.254/latest/meta-data/iam/security-credentials/" role-name)
                                     {:headers imds-headers
                                      :socket-timeout 2000
                                      :connection-timeout 1000})))]
    {:access-key-id     (:AccessKeyId creds-body)
     :secret-access-key (:SecretAccessKey creds-body)
     :session-token     (:Token creds-body)
     :expiration        (Instant/parse (:Expiration creds-body))}))

(defn- assume-role
  "Call STS AssumeRole to get temporary credentials."
  [role-arn region base-creds]
  (let [sts-host   (str "sts." region ".amazonaws.com")
        body-str   (str "Action=AssumeRole"
                        "&Version=2011-06-15"
                        "&RoleArn=" (java.net.URLEncoder/encode ^String role-arn "UTF-8")
                        "&RoleSessionName=metabase-bedrock"
                        "&DurationSeconds=3600")
        sig-headers (sign-request {:method     :post
                                   :uri        "/"
                                   :headers    {"host"         sts-host
                                                "content-type" "application/x-www-form-urlencoded"}
                                   :body       body-str
                                   :access-key (:access-key-id base-creds)
                                   :secret-key (:secret-access-key base-creds)
                                   :session-token (:session-token base-creds)
                                   :region     region
                                   :service    "sts"})
        response   (http/post (str "https://" sts-host "/")
                              {:headers (merge {"content-type" "application/x-www-form-urlencoded"
                                                "host"         sts-host}
                                               sig-headers)
                               :body    body-str
                               :socket-timeout  10000
                               :connection-timeout 5000})
        ;; Parse the XML response for credentials
        body       (:body response)
        extract    (fn [tag]
                     (second (re-find (re-pattern (str "<" tag ">([^<]+)</" tag ">")) body)))]
    {:access-key-id     (extract "AccessKeyId")
     :secret-access-key (extract "SecretAccessKey")
     :session-token     (extract "SessionToken")
     :expiration        (Instant/parse (extract "Expiration"))}))

(defn- resolve-bedrock-credentials
  "Resolve AWS credentials based on the configured auth type.
  Returns {:bearer-token ...} for API key auth, or
  {:access-key-id, :secret-access-key, :session-token (optional)} for SigV4 auth."
  []
  (let [auth-type (llm/llm-bedrock-auth-type)]
    (case auth-type
      "api-key"
      {:bearer-token (llm/llm-bedrock-api-key)}

      "iam-credentials"
      {:access-key-id     (llm/llm-bedrock-access-key-id)
       :secret-access-key (llm/llm-bedrock-secret-access-key)}

      "session-token"
      {:access-key-id     (llm/llm-bedrock-access-key-id)
       :secret-access-key (llm/llm-bedrock-secret-access-key)
       :session-token     (llm/llm-bedrock-session-token)}

      "iam-role"
      (let [cached @credential-cache]
        (if (and (:access-key-id cached) (not (credentials-expired? cached)))
          cached
          (let [region   (llm/llm-bedrock-region)
                role-arn (llm/llm-bedrock-role-arn)
                creds    (if (not-empty role-arn)
                           (let [base-creds (fetch-imds-credentials)]
                             (assume-role role-arn region base-creds))
                           (fetch-imds-credentials))]
            (reset! credential-cache creds)
            creds)))

      ;; default fallback — try API key first, then IAM
      (if-let [bearer (not-empty (llm/llm-bedrock-api-key))]
        {:bearer-token bearer}
        {:access-key-id     (llm/llm-bedrock-access-key-id)
         :secret-access-key (llm/llm-bedrock-secret-access-key)}))))

;;; ------------------------------------------ AISDK ↔ Bedrock Conversion ------------------------------------------

(defn- bedrock-usage->aisdk-usage
  "Convert a Bedrock usage block to AISDK usage shape."
  [u]
  {:promptTokens     (:inputTokens u 0)
   :completionTokens (:outputTokens u 0)})

(defn bedrock->aisdk-chunks-xf
  "Translates Bedrock ConverseStream events into AI SDK v5 protocol chunks.

  Bedrock Converse Stream events:
    messageStart      -> {role: \"assistant\"}
    contentBlockStart -> {contentBlockIndex, start: {text: \"\"} | {toolUse: {toolUseId, name}}}
    contentBlockDelta -> {contentBlockIndex, delta: {text: \"...\"} | {toolUse: {input: \"...\"}}}
    contentBlockStop  -> {contentBlockIndex}
    metadata          -> {usage: {inputTokens, outputTokens}, metrics: {latencyMs}}
    messageStop       -> {stopReason: \"end_turn\"}"
  []
  (fn [rf]
    (let [current-type (volatile! nil)
          current-id   (volatile! nil)
          message-id   (volatile! nil)
          payload      (volatile! {})
          close!       (fn [result]
                         (u/prog1 (rf result (merge {:type (case @current-type
                                                             :text     :text-end
                                                             :tool_use :tool-input-available)}
                                                    @payload))
                           (vreset! current-type nil)
                           (vreset! current-id nil)
                           (vreset! payload {})))]
      (fn
        ([result]
         (cond-> result
           @current-type (close!)
           true          (rf)))
        ([result chunk]
         ;; Bedrock wraps each event in a top-level key matching the event type
         (let [event-type (some #{:messageStart :contentBlockStart :contentBlockDelta
                                  :contentBlockStop :metadata :messageStop}
                                (keys chunk))]
           (case event-type
             :messageStart
             (let [mid (core/mkid)]
               (vreset! message-id mid)
               (rf result {:type :start :messageId mid}))

             :contentBlockStart
             (let [start    (get-in chunk [:contentBlockStart :start])
                   tool-use (:toolUse start)
                   chunk-id (or (:toolUseId tool-use) (core/mkid))]
               (if tool-use
                 (do
                   (vreset! current-type :tool_use)
                   (vreset! current-id chunk-id)
                   (vreset! payload {:toolCallId chunk-id
                                     :toolName   (:name tool-use)})
                   (rf result {:type :tool-input-start
                               :toolCallId chunk-id
                               :toolName   (:name tool-use)}))
                 (do
                   (vreset! current-type :text)
                   (vreset! current-id chunk-id)
                   (vreset! payload {:id chunk-id})
                   (rf result {:type :text-start :id chunk-id}))))

             :contentBlockDelta
             (let [delta (get-in chunk [:contentBlockDelta :delta])]
               (cond
                 (:text delta)
                 (rf result {:type  :text-delta
                             :id    (:id @payload)
                             :delta (:text delta)})

                 (:toolUse delta)
                 (rf result {:type           :tool-input-delta
                             :toolCallId     (:toolCallId @payload)
                             :inputTextDelta (:input (:toolUse delta))})))

             :contentBlockStop
             (if @current-type
               (close! result)
               result)

             :metadata
             (let [usage (get-in chunk [:metadata :usage])]
               (if usage
                 (rf result {:type  :usage
                             :usage (bedrock-usage->aisdk-usage usage)
                             :id    @message-id})
                 result))

             :messageStop
             result

             ;; Unknown event type — pass through
             result)))))))

;;; ------------------------------------------ AISDK parts → Bedrock messages ------------------------------------------

(defn parts->bedrock-messages
  "Convert AISDK parts into Bedrock Converse message format."
  [parts]
  (->> parts
       (mapv (fn [part]
               (case (:type part)
                 :text        {:role    "assistant"
                               :content [{:text (:text part)}]}
                 :tool-input  {:role    "assistant"
                               :content [{:toolUse {:toolUseId (:id part)
                                                    :name      (:function part)
                                                    :input     (or (:arguments part) {})}}]}
                 :tool-output {:role    "user"
                               :content [{:toolResult {:toolUseId (:id part)
                                                       :content   [{:text (or (get-in part [:result :output])
                                                                              (when-let [err (:error part)]
                                                                                (str "Error: " (:message err)))
                                                                              (pr-str (:result part)))}]}}]}
                 ;; User messages
                 {:role    (name (or (:role part) "user"))
                  :content [{:text (or (:content part) "")}]})))
       ;; Merge consecutive same-role messages
       (partition-by :role)
       (mapcat (fn [group]
                 [{:role    (:role (first group))
                   :content (into [] (mapcat :content) group)}]))
       vec))

;;; ------------------------------------------ Tool definition format ------------------------------------------

(defn- tool->bedrock
  "Convert a ToolEntry to Bedrock toolSpec format."
  [{:keys [tool-name doc schema]}]
  (let [[_:=> [_:cat params] _out] schema
        params (schema/filter-schema-by-features params)]
    {:toolSpec {:name        (or tool-name "unknown")
                :description doc
                :inputSchema {:json (mjs/transform params {:additionalProperties false})}}}))

;;; ------------------------------------------ Error handling ------------------------------------------

(defn- bedrock-error-msg
  "Canonical, status-specific Bedrock error message.
  Includes the actual AWS error message when available."
  [res]
  (let [status  (long (:status res 0))
        ;; AWS returns error in :message or :Message
        aws-msg (or (get-in res [:body :message])
                    (get-in res [:body :Message]))
        base    (case status
                  400 (tru "Bedrock request failed")
                  401 (tru "AWS credentials are invalid or expired")
                  403 (tru "Bedrock authentication/authorization failed")
                  404 (tru "Bedrock model not found or not available in this region")
                  429 (tru "Bedrock rate limit exceeded — try again later")
                  500 (tru "Bedrock internal server error")
                  (tru "Bedrock API error (HTTP {0})" status))]
    (if (not-empty aws-msg)
      (str base " — " aws-msg)
      base)))

;;; ------------------------------------------ Model listing ------------------------------------------

(defn list-models
  "List available Bedrock foundation models.
  No-arg uses configured credentials. Opts map supports :api-key and :ai-proxy?."
  ([] (list-models {}))
  ([{:keys [api-key ai-proxy?]}]
   (when ai-proxy?
     (throw (ex-info (tru "Bedrock does not support AI proxy mode")
                     {:api-error true :error-code :proxy-not-supported})))
   (let [creds   (case (llm/llm-bedrock-auth-type)
                   "api-key"
                   (if (not-empty api-key)
                     {:bearer-token api-key}
                     {:bearer-token (llm/llm-bedrock-api-key)})

                   ("iam-credentials" "session-token")
                   {:access-key-id     (or (not-empty api-key) (llm/llm-bedrock-access-key-id))
                    :secret-access-key (llm/llm-bedrock-secret-access-key)
                    :session-token     (when (= "session-token" (llm/llm-bedrock-auth-type))
                                         (llm/llm-bedrock-session-token))}

                   ;; iam-role or unknown — use auto-resolution
                   (resolve-bedrock-credentials))
         region  (llm/llm-bedrock-region)
         _       (log/debugf "list-models: auth-type=%s region=%s" (llm/llm-bedrock-auth-type) region)
         host    (str "bedrock." region ".amazonaws.com")
         uri     "/foundation-models"
         qs      "byInferenceType=ON_DEMAND&byOutputModality=TEXT"
         headers (if (:bearer-token creds)
                   {"host"          host
                    "Authorization" (str "Bearer " (:bearer-token creds))}
                   (merge {"host" host}
                          (sign-request {:method        :get
                                         :uri           uri
                                         :query-string  qs
                                         :headers       {"host" host}
                                         :body          ""
                                         :access-key    (:access-key-id creds)
                                         :secret-key    (:secret-access-key creds)
                                         :session-token (:session-token creds)
                                         :region        region
                                         :service       "bedrock"})))]
     (try
       (let [response (http/get (str "https://" host uri "?" qs)
                                {:headers headers
                                 :socket-timeout  10000
                                 :connection-timeout 5000})
             body     (json/decode+kw (:body response))
             models   (:modelSummaries body)
             ;; Include all models that support streaming text I/O via the ConverseStream API.
             ;; Exclude image-only models (e.g. Stable Diffusion) and legacy/deprecated ones.
             converse-models (filter (fn [m]
                                       (and (:responseStreamingSupported m)
                                            (some #{"TEXT"} (:outputModalities m))
                                            (some #{"TEXT"} (:inputModalities m))
                                            ;; Exclude legacy/deprecated models
                                            (not= "LEGACY" (get-in m [:modelLifecycle :status]))))
                                     models)]
         (log/debugf "Bedrock models: total=%d filtered=%d" (count models) (count converse-models))
         {:models (mapv (fn [m]
                          {:id           (:modelId m)
                           :display_name (or (:modelName m) (:modelId m))
                           :group        (:providerName m)})
                        converse-models)})
       (catch Exception e
         (core/rethrow-api-error! "bedrock" bedrock-error-msg e))))))

;;; ------------------------------------------ Streaming ------------------------------------------

(defn- read-int32
  "Read a big-endian 32-bit integer from a DataInputStream. Returns nil on EOF."
  [^java.io.DataInputStream dis]
  (try
    (.readInt dis)
    (catch java.io.EOFException _ nil)))

(defn- read-bytes
  "Read exactly n bytes from a DataInputStream."
  ^bytes [^java.io.DataInputStream dis ^long n]
  (let [buf (byte-array n)]
    (.readFully dis buf)
    buf))

(defn- parse-event-stream-headers
  "Parse AWS event stream headers from a byte array.
  Each header: 1-byte name length, name bytes, 1-byte type (7=string),
  2-byte value length (big-endian), value bytes."
  [^bytes header-bytes]
  (let [bb (java.nio.ByteBuffer/wrap header-bytes)]
    (loop [headers {}]
      (if (.hasRemaining bb)
        (let [name-len (Byte/toUnsignedInt (.get bb))
              name-buf (byte-array name-len)
              _        (.get bb name-buf)
              name     (String. name-buf StandardCharsets/UTF_8)
              type-id  (.get bb)]
          (if (= type-id 7) ;; type 7 = string
            (let [val-len (Short/toUnsignedInt (.getShort bb))
                  val-buf (byte-array val-len)
                  _       (.get bb val-buf)
                  val     (String. val-buf StandardCharsets/UTF_8)]
              (recur (assoc headers name val)))
            ;; Skip unknown types — shouldn't happen for Bedrock but be safe
            headers))
        headers))))

(defn- bedrock-event-reducible
  "Turn a Bedrock ConverseStream response InputStream into a reducible source of parsed events.

  Bedrock ConverseStream returns the AWS event stream binary encoding:
  each message is [4B total-len][4B headers-len][4B prelude-crc][headers][payload][4B msg-crc]."
  [^InputStream body]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (let [dis (java.io.DataInputStream. body)]
        (loop [acc init]
          (if (reduced? acc)
            @acc
            (let [total-len (read-int32 dis)]
              (if (nil? total-len)
                acc ;; EOF
                (let [headers-len (.readInt dis)
                      _prelude-crc (read-bytes dis 4)
                      header-bytes (read-bytes dis headers-len)
                      ;; payload = total - 4(total) - 4(headers-len) - 4(prelude-crc) - headers - 4(msg-crc)
                      payload-len  (- (int total-len) 12 (int headers-len) 4)
                      payload      (read-bytes dis payload-len)
                      _msg-crc     (read-bytes dis 4)
                      headers      (parse-event-stream-headers header-bytes)
                      event-type   (get headers ":event-type")]
                  (if (and event-type (pos? payload-len))
                    (let [json-str (String. payload StandardCharsets/UTF_8)
                          parsed   (try (json/decode+kw json-str)
                                        (catch Exception _ nil))
                          ;; Wrap the payload with the event type for downstream processing
                          event    (when parsed {(keyword event-type) parsed})]
                      (if event
                        (recur (rf acc event))
                        (recur acc)))
                    (recur acc)))))))))))

(mu/defn bedrock-raw
  "Perform a streaming request to Bedrock ConverseStream API."
  [{:keys [model system input tools schema tool_choice temperature max-tokens ai-proxy?]
    :or   {model "anthropic.claude-sonnet-4-20250514-v1:0"}} :- core/LLMRequestOpts]
  (when ai-proxy?
    (throw (ex-info (tru "Bedrock does not support AI proxy mode")
                    {:api-error true :error-code :proxy-not-supported})))
  (let [messages  (parts->bedrock-messages input)
        all-tools (when (seq tools) (mapv tool->bedrock tools))
        req       (cond-> {:messages messages}
                    system      (assoc :system [{:text system}])
                    all-tools   (assoc :toolConfig {:tools all-tools})
                    (and all-tools
                         tool_choice) (assoc-in [:toolConfig :toolChoice]
                                                (case (name tool_choice)
                                                  "auto"     {:auto {}}
                                                  "required" {:any {}}))
                    true        (assoc :inferenceConfig
                                       (cond-> {:maxTokens (or max-tokens 4096)}
                                         temperature (assoc :temperature temperature)))
                    schema      (assoc :toolConfig
                                       {:tools [{:toolSpec {:name        "structured_output"
                                                            :description "Output structured data"
                                                            :inputSchema {:json schema}}}]
                                        :toolChoice {:tool {:name "structured_output"}}}))]
    (with-span :info {:name       :metabot.bedrock/request
                      :model      model
                      :msg-count  (count input)
                      :tool-count (count tools)}
      (try
        (let [creds    (resolve-bedrock-credentials)
              region   (llm/llm-bedrock-region)
              host     (str "bedrock-runtime." region ".amazonaws.com")
              ;; Use raw model ID — clj-http/Apache HttpClient will URI-encode on the wire.
              uri      (str "/model/" model "/converse-stream")
              body-str (json/encode req)
              ;; Use Bearer token for API key auth, SigV4 for IAM auth
              headers  (if (:bearer-token creds)
                         {"host"          host
                          "content-type"  "application/json"
                          "Authorization" (str "Bearer " (:bearer-token creds))}
                         (merge {"host"         host
                                 "content-type" "application/json"}
                                (sign-request {:method        :post
                                               :uri           uri
                                               :headers       {"host"         host
                                                               "content-type" "application/json"}
                                               :body          body-str
                                               :access-key    (:access-key-id creds)
                                               :secret-key    (:secret-access-key creds)
                                               :session-token (:session-token creds)
                                               :region        region
                                               :service       "bedrock"})))
              url      (str "https://" host uri)
              _        (log/debugf "Bedrock request: model=%s url=%s" model url)
              response (http/post url
                                  {:headers headers
                                   :body    body-str
                                   :as      :stream
                                   :socket-timeout  60000
                                   :connection-timeout 5000})]
          (-> (bedrock-event-reducible (:body response))
              (debug/capture-stream {:provider "bedrock"
                                     :model    model
                                     :url      uri
                                     :request  req})))
        (catch Exception e
          (core/rethrow-api-error! "bedrock" bedrock-error-msg e))))))

(defn bedrock
  "Call Bedrock ConverseStream API, return AISDK stream."
  [& args]
  (let [raw (apply bedrock-raw args)]
    (eduction (bedrock->aisdk-chunks-xf) raw)))
