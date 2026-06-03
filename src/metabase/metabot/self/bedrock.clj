(ns metabase.metabot.self.bedrock
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [malli.json-schema :as mjs]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.schema :as schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu])
  (:import
   (java.io ByteArrayInputStream DataInputStream InputStream)
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

(defn- sigv4-headers
  "Compute the SigV4 Authorization and x-amz-date headers for an AWS request.

  Returns a map of header-name → header-value to merge into the HTTP request headers.
  The caller must also send content-type and host (they're included in the signed headers)."
  [{:keys [access-key-id secret-access-key region session-token
           service method host path body-bytes datetime]}]
  (let [date      (subs datetime 0 8)
        b-hash    (hex-encode (sha256 (or body-bytes (byte-array 0))))
        hdr-map   (cond-> {"host"         host
                           "content-type" "application/json"
                           "x-amz-date"   datetime}
                    session-token (assoc "x-amz-security-token" session-token))
        signed    (sort (keys hdr-map))
        canon-hdrs (str (str/join "\n" (map #(str % ":" (get hdr-map %)) signed)) "\n")
        signed-str (str/join ";" signed)
        canon-req  (str/join "\n" [(str/upper-case method)
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

;;; ---- AWS event stream parser ----

(defn- read-bytes! ^bytes [^DataInputStream dis n]
  (let [buf (byte-array n)]
    (.readFully dis buf)
    buf))

(defn- parse-header-block
  "Parse the packed headers section into a {name value} map."
  [^bytes header-bytes]
  (let [bis (ByteArrayInputStream. header-bytes)
        dis (DataInputStream. bis)
        out (java.util.HashMap.)]
    (while (pos? (.available bis))
      (let [nlen  (.readUnsignedByte dis)
            name  (String. ^bytes (read-bytes! dis nlen) "UTF-8")
            _type (.readUnsignedByte dis)
            vlen  (.readUnsignedShort dis)
            value (String. ^bytes (read-bytes! dis vlen) "UTF-8")]
        (.put out name value)))
    (into {} out)))

(defn- read-frame
  "Read one AWS event stream frame from dis.
  Returns {:headers {string→string} :payload parsed-json-or-nil}."
  [^DataInputStream dis]
  (let [total-len   (.readInt dis)
        headers-len (.readInt dis)
        _           (.readInt dis)                         ; prelude CRC — skip validation
        headers     (parse-header-block (read-bytes! dis headers-len))
        payload-len (- total-len 16 headers-len)          ; 12-byte prelude + 4-byte message CRC
        payload     (when (pos? payload-len)
                      (json/decode+kw (String. ^bytes (read-bytes! dis payload-len) "UTF-8")))
        _           (.readInt dis)]                        ; message CRC — skip validation
    {:headers headers :payload payload}))

(defn- event-stream-reducible
  "Return a reducible that produces parsed AWS event stream frames from `input`."
  [^InputStream input]
  (reify
    clojure.lang.IReduceInit
    (reduce [_ rf init]
      (with-open [dis (DataInputStream. input)]
        (loop [acc init]
          (if (reduced? acc)
            @acc
            (let [frame (try
                          (read-frame dis)
                          (catch java.io.EOFException _
                            ::done))]
              (if (= ::done frame)
                acc
                (recur (rf acc frame))))))))
    java.io.Closeable
    (close [_] (.close input))))

;;; ---- Message format: AISDK parts → Bedrock messages ----

(defn- merge-consecutive
  "Merge consecutive messages with the same role into one, combining content arrays."
  [messages]
  (into [] (comp (partition-by :role)
                 (map (fn [group]
                        {:role    (:role (first group))
                         :content (into [] (mapcat :content) group)})))
        messages))

(defn- tool-output->text
  [part]
  (or (get-in part [:result :output])
      (when-let [err (:error part)] (str "Error: " (:message err)))
      (pr-str (:result part))))

(defn parts->bedrock-messages
  "Convert AISDK parts to Bedrock Converse messages array."
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
                                                       :content   [{:text (tool-output->text part)}]
                                                       :status    (if (:error part) "error" "success")}}]}
                 {:role    (name (or (:role part) "user"))
                  :content [{:text (or (:content part) "")}]})))
       merge-consecutive
       vec))

;;; ---- Tool definition format ----

(defn- tool->bedrock
  [{:keys [tool-name doc schema]}]
  (let [[_:=> [_:cat params] _out] schema
        params (schema/filter-schema-by-features params)
        doc    (if (str/starts-with? (or doc "") "Inputs: ")
                 (second (str/split doc #"\n\n  " 2))
                 doc)]
    {:toolSpec {:name        (or tool-name "unknown")
                :description doc
                :inputSchema {:json (mjs/transform params {:additionalProperties false})}}}))

;;; ---- AISDK chunks transducer ----

(defn bedrock->aisdk-chunks-xf
  "Translates Bedrock ConverseStream event frames into AI SDK v5 protocol chunks."
  []
  (fn [rf]
    (let [current-type (volatile! nil)
          current-id   (volatile! nil)
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
           true          rf))
        ([result {headers :headers, data :payload}]
         (let [event-type (get headers ":event-type")]
           (case event-type
             "messageStart"
             (rf result {:type :start :messageId (core/mkid)})

             "contentBlockStart"
             (let [start      (:start data)
                   block-type (cond (:toolUse start) :tool_use
                                    :else            :text)]
               (let [chunk-id (or (get-in start [:toolUse :toolUseId]) (core/mkid))]
                 (vreset! current-type block-type)
                 (vreset! current-id chunk-id)
                 (vreset! payload (case block-type
                                    :text     {:id chunk-id}
                                    :tool_use {:toolCallId chunk-id
                                               :toolName   (get-in start [:toolUse :name])}))
                 (rf result (merge (case block-type
                                     :text     {:type :text-start}
                                     :tool_use {:type :tool-input-start})
                                   @payload))))

             "contentBlockDelta"
             (let [delta (:delta data)]
               (cond
                 (:text delta)
                 (rf result {:type  :text-delta
                             :id    (:id @payload)
                             :delta (:text delta)})

                 (get-in delta [:toolUse :input])
                 (rf result {:type           :tool-input-delta
                             :toolCallId     (:toolCallId @payload)
                             :inputTextDelta (get-in delta [:toolUse :input])})

                 :else result))

             "contentBlockStop"
             (if @current-type (close! result) result)

             "metadata"
             (let [usage (:usage data)]
               (rf result {:type  :usage
                           :usage {:promptTokens     (:inputTokens usage 0)
                                   :completionTokens (:outputTokens usage 0)}}))

             ;; messageStop and unknown events — no-op
             result)))))))

;;; ---- HTTP + error handling ----

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

(defn- bedrock-host [region service]
  (str service "." region ".amazonaws.com"))

(defn- bedrock-request
  "Sign and execute an HTTP request against AWS Bedrock.
  `creds` map: :access-key-id, :secret-access-key, :region, :session-token.
  `method` is :get or :post. `path` is the URL path. `body-bytes` is nil for GET."
  [{:keys [access-key-id secret-access-key region session-token]} service method path body-bytes]
  (let [host     (bedrock-host region service)
        datetime (now-datetime)
        sig-hdrs (sigv4-headers {:access-key-id     access-key-id
                                 :secret-access-key secret-access-key
                                 :region            region
                                 :session-token     session-token
                                 :service           "bedrock"
                                 :method            (str/upper-case (name method))
                                 :host              host
                                 :path              path
                                 :body-bytes        body-bytes
                                 :datetime          datetime})
        req      (cond-> {:method  method
                          :url     (str "https://" host path)
                          :headers (merge {"content-type" "application/json"} sig-hdrs)}
                   body-bytes (assoc :as :stream :body body-bytes)
                   (nil? body-bytes) (assoc :as :json))]
    (http/request req)))

;;; ---- Public API ----

(defn list-models
  "List Bedrock foundation models that support streaming on-demand inference.
  No-arg uses configured settings. Opts map supports :api-key (access key id),
  :access-key-id, :secret-access-key, :region, :session-token."
  ([] (list-models {}))
  ([{:keys [api-key access-key-id secret-access-key region session-token]}]
   (let [key-id  (not-empty (or access-key-id api-key (llm/llm-bedrock-access-key-id)))
         secret  (not-empty (or secret-access-key (llm/llm-bedrock-secret-access-key)))
         region  (or (not-empty region) (not-empty (llm/llm-bedrock-region)) "us-east-1")
         session (not-empty (or session-token (llm/llm-bedrock-session-token)))]
     (when-not key-id
       (throw (core/missing-api-key-ex "AWS Bedrock")))
     (when-not secret
       (throw (ex-info (tru "AWS Bedrock Secret Access Key is not configured")
                       {:api-error true :error-code :api-key-missing :status 401})))
     (try
       (let [creds    {:access-key-id     key-id
                       :secret-access-key secret
                       :region            region
                       :session-token     session}
             response (bedrock-request creds "bedrock" :get "/foundation-models" nil)]
         {:models (->> (get-in response [:body :modelSummaries])
                       (filter :responseStreamingSupported)
                       (filter #(contains? (set (:inferenceTypesSupported %)) "ON_DEMAND"))
                       (mapv (fn [m] {:id (:modelId m) :display_name (:modelName m)})))})
       (catch Exception e
         (core/rethrow-api-error! "bedrock" bedrock-error-msg e))))))

(mu/defn bedrock-raw
  "Perform a streaming request to AWS Bedrock Converse API.
  Returns a reducible of raw event stream frame maps."
  [{:keys [model system input tools schema tool_choice temperature max-tokens]
    :or   {model "global.anthropic.claude-haiku-4-5-20251001-v1:0"}} :- core/LLMRequestOpts]
  (let [key-id  (not-empty (llm/llm-bedrock-access-key-id))
        secret  (not-empty (llm/llm-bedrock-secret-access-key))
        region  (or (not-empty (llm/llm-bedrock-region)) "us-east-1")
        session (not-empty (llm/llm-bedrock-session-token))
        creds   {:access-key-id     key-id
                 :secret-access-key secret
                 :region            region
                 :session-token     session}
        _       (when-not key-id (throw (core/missing-api-key-ex "AWS Bedrock")))
        _       (when-not secret
                  (throw (ex-info (tru "AWS Bedrock Secret Access Key is not configured")
                                  {:api-error true :error-code :api-key-missing :status 401})))
        messages  (parts->bedrock-messages input)
        all-tools (or (when schema
                        [{:toolSpec {:name        "structured_output"
                                     :description "Output structured data"
                                     :inputSchema {:json schema}}}])
                      (when (seq tools) (mapv tool->bedrock tools)))
        req       (cond-> {:messages messages}
                    system     (assoc :system [{:text system}])
                    all-tools  (assoc :toolConfig
                                      (cond-> {:tools all-tools}
                                        schema
                                        (assoc :toolChoice {:tool {:name "structured_output"}})
                                        (and (not schema) tool_choice)
                                        (assoc :toolChoice (case (name tool_choice)
                                                             "required" {:any {}}
                                                             {:auto {}}))))
                    (or temperature max-tokens)
                    (assoc :inferenceConfig
                           (cond-> {}
                             temperature (assoc :temperature temperature)
                             max-tokens  (assoc :maxTokens max-tokens))))
        body-bytes (.getBytes (json/encode req) "UTF-8")
        path       (str "/model/" model "/converse-stream")]
    (try
      (let [response (bedrock-request creds "bedrock-runtime" :post path body-bytes)]
        (event-stream-reducible (:body response)))
      (catch Exception e
        (core/rethrow-api-error! "bedrock" bedrock-error-msg e)))))

(comment
  (into [] (metabase.metabot.self.bedrock/bedrock
            {:model "global.anthropic.claude-haiku-4-5-20251001-v1:0"
             :input [{:role :user :content "hello"}]})))

(comment

  (into [] (metabase.metabot.self.bedrock/bedrock
            {:model "global.anthropic.claude-haiku-4-5-20251001-v1:0"
             :input [{:role :user :content "hello"}]})))

(defn bedrock
  "Call AWS Bedrock Converse API, return AISDK stream."
  [& args]
  (eduction (bedrock->aisdk-chunks-xf) (apply bedrock-raw args)))
