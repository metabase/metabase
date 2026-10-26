(ns metabase.metabot.test-util
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.tools :as metabot.tools]
   [metabase.metabot.tools.core :as tools.core]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.io ByteArrayOutputStream InputStream IOException OutputStream)
   (java.net InetAddress ServerSocket Socket SocketException)
   (java.util.zip GZIPOutputStream)))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Fixture capture / cache
;;; ──────────────────────────────────────────────────────────────────

(def ^:private fixture-dir "test_resources/llm")

(def ^:dynamic *live*
  "When true, `raw-fixture` makes real API calls even if a cached file exists.
  Bind to `true` in the REPL to re-capture all fixtures:

    (binding [test-util/*live* true]
      (run-tests))

  Or set the env var `MB_TEST_LLM_LIVE=true` before running tests."
  (= "true" (System/getenv "MB_TEST_LLM_LIVE")))

(defn raw-fixture
  "Load raw LLM chunks from a cached JSON file, or call the API and cache the result.

  `fixture-name` — filename without extension, e.g. \"claude-text\"
  `raw-fn`       — zero-arg function that calls the raw API and returns a reducible
                   of chunks (only called when cache is missing or `*live*` is true)

  Returns a vector of raw API chunks (decoded JSON maps).

  Usage in tests:
    (raw-fixture \"claude-text\"
      #(claude/claude-raw {:model \"claude-haiku-4-5\"
                           :input [{:role :user :content \"Say hello\"}]}))"
  [fixture-name raw-fn]
  (let [path (str fixture-dir "/" fixture-name ".json")
        file (io/file path)]
    (if (and (.exists file) (not *live*))
      (-> (slurp file) json/decode+kw)
      (do
        (log/infof "Capturing LLM fixture: %s" path)
        (let [chunks (into [] (raw-fn))]
          (.mkdirs (.getParentFile file))
          (spit path (json/encode chunks {:pretty true}))
          chunks)))))

;;; ──────────────────────────────────────────────────────────────────
;;; SSE helpers
;;; ──────────────────────────────────────────────────────────────────

(defn make-sse
  "Encode a sequence of values as an SSE data stream string.
  Includes `event:` lines like the real Anthropic/OpenAI APIs do."
  ^String [v]
  (->> v
       (map (fn [item]
              (let [event-type (or (some-> (:type item) name)
                                   "message")]
                (str "event: " event-type "\ndata: " (json/encode item) "\n\n"))))
       (str/join)))

;;; ──────────────────────────────────────────────────────────────────
;;; Mock chunk builders
;;; ──────────────────────────────────────────────────────────────────

(defn parts->aisdk-chunks
  "Expand high-level parts into low-level AI SDK v5 chunks.
  Accepts parts like `{:type :text :id \"t1\" :text \"Hello\"}` or
  `{:type :tool-input :id \"c1\" :function \"search\" :arguments {...}}`.
  Returns a flat sequence of start / delta / end chunks."
  [parts]
  (mapcat
   (fn [{:keys [id] :as part}]
     (case (:type part)
       :start [{:type :start :messageId id}]
       :usage [part]
       :error [part]
       :text  (concat
               [{:type :text-start :id id}]
               (for [bit (partition-all 5 (:text part))]
                 {:type :text-delta :id id :delta (str/join bit)})
               [{:type :text-end :id id}])
       :tool-input (concat
                    [{:type :tool-input-start :toolName (:function part) :toolCallId id}]
                    (for [bit (partition-all 5 (json/encode (:arguments part)))]
                      {:type :tool-input-delta :toolCallId id :inputTextDelta (str/join bit)})
                    [{:type :tool-input-available :toolName (:function part) :toolCallId id}])))
   parts))

(defn tool-boundary-error
  "Run one tool call through the agent tool boundary — the path production uses — and
  return the error text the model would see, or nil when the call was accepted.

  The text is the outcome's `:output`, which is where a failure's message lives now; a failure also
  carries `:error` with its class and code."
  [tool-name tool-var arguments]
  (let [tools  (metabot.tools/->entries [tool-var] (atom {}) nil nil)
        chunks (parts->aisdk-chunks
                [{:type :start :id "msg-boundary"}
                 {:type :tool-input :id "call-boundary" :function tool-name :arguments arguments}])
        result (-> (into [] (self.core/tool-executor-xf tools) chunks) last :result)]
    (when (:error result)
      (:output result))))

(defn call-tool
  "Call `tool` with `arguments` and return its `tools.core/result`.

  What a test uses in place of invoking a tool var as a function. A converted tool is a record, so
  `(the-tool args)` no longer works and the caller should not have to know whether this one does one
  item or several — `tools.core/call` decides that. `tool` may be the record, or a var holding one.

  `tool-names` is the profile the recovery steps are filtered against; it defaults to a profile that
  has `search`, since most steps offer it. Pass a smaller set to assert a step disappears.

  This is not the agent boundary: arguments are not validated and the scope is not checked. Use
  [[tool-boundary-error]] for those."
  ([tool arguments] (call-tool tool arguments #{"search"}))
  ([tool arguments tool-names]
   (tools.core/call (cond-> tool (var? tool) deref) arguments {:tool-names tool-names})))

(defn tool-failure
  "Call `tool` expecting it to fail, and return what the failure is: `{:class :code}`, plus `:text`
  — the text a model in a profile holding `tool-names` would read — when it is recoverable.

  The counterpart to [[call-tool]]. Throws when the call succeeds, so a test cannot pass by the
  tool quietly working. This is the tool's own contract, not the agent boundary: the runtime's
  rendering of an unrecoverable error, and its dev assertions, are
  `metabase.metabot.tools.runtime-test`'s subject. Use [[tool-boundary-error]] for the boundary."
  ([tool arguments] (tool-failure tool arguments #{"search"}))
  ([tool arguments tool-names]
   (let [outcome (try
                   (call-tool tool arguments tool-names)
                   (catch Throwable e e))]
     (if-not (instance? Throwable outcome)
       (throw (ex-info "expected this tool call to fail, but it returned a result"
                       {:result outcome}))
       (let [{:keys [class code] :as error} (tools.error/classify outcome)]
         (cond-> {:class class :code code}
           (= :recoverable class)
           (assoc :text (tools.error/recoverable-text error tool-names))))))))

(defn mock-llm-response
  "Create a mock LLM response (reducible) from high-level parts."
  [parts]
  (let [chunks (parts->aisdk-chunks parts)]
    (reify clojure.lang.IReduceInit
      (reduce [_ rf init]
        (reduce rf init chunks)))))

;;; ──────────────────────────────────────────────────────────────────
;;; Test tools
;;;
;;; Real (but trivial) tool implementations used by:
;;;   - adapter tests (fixture capture — LLM sees the schemas)
;;;   - self_test (tool-executor-xf — tools are actually called)
;;; ──────────────────────────────────────────────────────────────────

(defn get-time-tool []
  {:tool-name "get-time"
   :doc       "Return current time for a given IANA timezone."
   :schema    [:=> [:cat [:map {:closed true}
                          [:tz [:string {:description "IANA timezone, e.g. Europe/Bucharest"}]]]] :any]
   :fn        (fn [{:keys [tz]}]
                (str (java.time.ZonedDateTime/now (java.time.ZoneId/of tz))))})

(defn convert-currency-tool []
  {:tool-name "convert-currency"
   :doc       "Convert an amount between two ISO currencies using a dummy rate."
   :schema    [:=> [:cat [:map {:closed true}
                          [:amount :float]
                          [:from :string]
                          [:to :string]]] :any]
   :fn        (fn [{:keys [amount from to]}]
                (let [rate (if (= [from to] ["EUR" "USD"]) 1.16 1.0)]
                  {:amount    amount
                   :from      from
                   :to        to
                   :rate      rate
                   :converted (* amount rate)}))})

(defn mock-llm-tool []
  {:tool-name "mock-llm"
   :doc       "Return aisdk-formatted results as a reducible (IReduceInit).
  Useful for testing tool-executor-xf with tools that call back to an LLM."
   :schema    [:=> [:cat [:map {:closed true}
                          [:id :string]
                          [:input :string]]] :any]
   :fn        (fn [{:keys [id input]}]
                (let [chunks (parts->aisdk-chunks
                              [{:type :start :id "mock-1"}
                               {:type :text :id id :text input}])]
                  (reify clojure.lang.IReduceInit
                    (reduce [_ rf init]
                      (reduce rf init chunks)))))})

(defn no-arg-tool []
  {:tool-name "no-arg"
   :doc       "A tool that takes no arguments."
   :schema    [:=> [:cat [:map {:closed true}]] :any]
   :fn        (fn [_] {:output "ok"})})

(def TOOLS
  "Tool map for tests — keyed by tool name string."
  (let [tool-defs (map #(%) [get-time-tool convert-currency-tool mock-llm-tool no-arg-tool])]
    (into {} (map (juxt :tool-name identity)) tool-defs)))

;;; ──────────────────────────────────────────────────────────────────
;;; Queries
;;; ──────────────────────────────────────────────────────────────────

(defn unpermissionable-native-query
  "Build a query on `database-id` with native SQL under a later stage, whose permissions can't be calculated.
  Its snippet tag is missing `:snippet-name`, so the permission check can't normalize it."
  [database-id]
  {:lib/type :mbql/query
   :database database-id
   :stages   [{:lib/type      :mbql.stage/native
               :native        "SELECT * FROM {{snip}}"
               :template-tags {"snip" {:type         :snippet
                                       :name         "snip"
                                       :display-name "snip"
                                       :snippet-id   Integer/MAX_VALUE}}}
              {:lib/type :mbql.stage/mbql}]})

;;; ──────────────────────────────────────────────────────────────────
;;; Chunked SSE fake server
;;;
;;; A raw-socket LLM server that streams SSE with `Transfer-Encoding: chunked`, for tests that must see when
;;; the client drops the connection. Apache HttpClient drains the rest of a chunked body when the body
;;; closes: https://github.com/dakrone/clj-http/issues/627
;;; ──────────────────────────────────────────────────────────────────

(defn- read-head!
  "Read an HTTP request head from `in`, up to the blank line, and return its lines. Nil at EOF."
  [^InputStream in]
  (let [sb (StringBuilder.)]
    (loop []
      (let [b (.read in)]
        (cond
          (neg? b)                                          nil
          (str/ends-with? (.append sb (char b)) "\r\n\r\n") (str/split-lines (str sb))
          :else                                             (recur))))))

(defn- header-value
  "The value of the header `header-name` (lower case) in the head `lines`, or nil."
  [lines header-name]
  (some (fn [line]
          (let [[k v] (str/split line #":\s*" 2)]
            (when (= header-name (u/lower-case-en k))
              v)))
        lines))

(defn- read-request!
  "Read one request from `in`. Return its `:method`, its `:path` and `:max-tokens?`, true when the JSON body
  has a `max_tokens` key. Nil at EOF."
  [^InputStream in]
  (when-let [[request-line & header-lines] (read-head! in)]
    (let [[method path] (str/split request-line #" ")
          length        (parse-long (or (header-value header-lines "content-length") "0"))
          body          (String. (.readNBytes in (int length)) "UTF-8")]
      {:method      method
       :path        path
       :max-tokens? (str/includes? body "\"max_tokens\"")})))

(defn- write-ascii!
  [^OutputStream out ^String s]
  (.write out (.getBytes s "US-ASCII")))

(defn- write-chunk!
  "Write `data` to `out` as one HTTP chunk, and flush it. Write nothing for empty `data`."
  [^OutputStream out ^bytes data]
  (when (pos? (alength data))
    (write-ascii! out (str (Integer/toHexString (alength data)) "\r\n"))
    (.write out data)
    (write-ascii! out "\r\n")
    (.flush out)))

(defn- plain-encoder
  "An encoder that sends text as UTF-8 bytes."
  []
  {:encode (fn [^String s] (.getBytes s "UTF-8"))
   :finish (fn [] (byte-array 0))})

(defn- gzip-encoder
  "An encoder that sends text as one gzip stream. It flushes after each piece, so the client can read it at once."
  []
  (let [buf    (ByteArrayOutputStream.)
        gz     (GZIPOutputStream. buf true)
        drain! (fn [] (let [data (.toByteArray buf)] (.reset buf) data))]
    {:encode (fn [^String s] (.write gz (.getBytes s "UTF-8")) (.flush gz) (drain!))
     :finish (fn [] (.finish gz) (drain!))}))

(defn- response-head
  [gzip?]
  (str "HTTP/1.1 200 OK\r\n"
       "Content-Type: text/event-stream\r\n"
       "Transfer-Encoding: chunked\r\n"
       "Connection: close\r\n"
       (when gzip? "Content-Encoding: gzip\r\n")
       "\r\n"))

(defn- default-event
  "The `i`th event of a stream: an OpenAI Chat Completions text delta."
  [i]
  {:id      "chatcmpl-fake"
   :model   "fake-model"
   :choices [{:index         0
              :delta         {:role "assistant" :content (str "chunk-" i " ")}
              :finish_reason nil}]})

(defn- write-events!
  "Write `n` SSE events, one every `interval-ms`. Call `on-sent` with the count after each event."
  [write! n {:keys [interval-ms event-fn]} on-sent]
  (dotimes [i n]
    (write! (str "data: " (json/encode (event-fn i)) "\n\n"))
    (on-sent (inc i))
    (Thread/sleep (long interval-ms))))

(defn- write-after!
  "Write what comes after the events: `[DONE]` for `:done`, nothing for `:eof`, and for `:keep-alive` `[DONE]`
  and then 20 s of `: ping` comments."
  [write! after]
  (case after
    :done       (write! "data: [DONE]\n\n")
    :eof        nil
    :keep-alive (do (write! "data: [DONE]\n\n")
                    (dotimes [_ 2000]
                      (write! ": ping\n\n")
                      (Thread/sleep 10)))))

(defn- stream-response!
  "Write a chunked SSE response of `n` events to `out`. Throws an `IOException` when the client is gone."
  [^OutputStream out n {:keys [gzip? after] :as opts} on-sent]
  (let [{:keys [encode finish]} (if gzip? (gzip-encoder) (plain-encoder))
        write!                  #(write-chunk! out (encode %))]
    (write-ascii! out (response-head gzip?))
    (.flush out)
    (write-events! write! n opts on-sent)
    (write-after! write! after)
    (write-chunk! out (finish))
    (write-ascii! out "0\r\n\r\n")
    (.flush out)))

(defn- event-count
  "How many events the fake sends for `request`: `:short-total` for a capped (`max_tokens`) call, else `:total`."
  [{:keys [max-tokens?]} {:keys [total short-total]}]
  (if (and short-total max-tokens?) short-total total))

(defn- add-connection!
  "Add the record of a new connection for `request` to `connections`, and return its index."
  [connections request]
  (dec (count (swap! connections conj (assoc request :sent 0 :disconnected-at-ms nil)))))

(defn- serve-post!
  "Stream the response to one `POST`. The first `POST` also reports to the server's `:sent` and `:disconnected`."
  [^OutputStream out request opts {:keys [connections sent disconnected first-post]}]
  (let [idx    (add-connection! connections request)
        first? (compare-and-set! first-post false true)
        count! (fn [n]
                 (swap! connections assoc-in [idx :sent] n)
                 (when first? (reset! sent n)))]
    (try
      (stream-response! out (event-count request opts) opts count!)
      (catch IOException _
        (swap! connections assoc-in [idx :disconnected-at-ms] (System/currentTimeMillis))
        (when first?
          (deliver disconnected (get-in @connections [idx :sent])))))))

(defn- serve-not-found!
  [^OutputStream out request {:keys [connections]}]
  (add-connection! connections request)
  (write-ascii! out "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
  (.flush out))

(defn- serve-connection!
  "Serve the one request of `socket`: a `POST` gets the stream, any other method a 404."
  [^Socket socket opts state]
  (with-open [socket socket]
    (let [out     (.getOutputStream socket)
          request (read-request! (.getInputStream socket))]
      (cond
        (nil? request)               nil
        (= "POST" (:method request)) (serve-post! out request opts state)
        :else                        (serve-not-found! out request state)))))

(defn- accept-loop!
  "Accept connections on `server` until it closes, and serve each one on its own thread."
  [^ServerSocket server opts {:keys [sockets] :as state}]
  (future
    (try
      (loop []
        (let [socket (.accept server)]
          (swap! sockets conj socket)
          (future
            (try
              (serve-connection! socket opts state)
              (catch Exception e
                (log/debug e "Fake SSE server: a connection failed"))))
          (recur)))
      (catch SocketException _
        nil))))

(defn start-chunked-sse-server!
  "Start a fake LLM server on localhost that answers each `POST` with a chunked SSE stream.

  Options (all optional):

    :total        - events per stream (default 10)
    :interval-ms  - pause after each event (default 10)
    :event-fn     - fn of the event index that returns the event map (default: an OpenAI Chat Completions
                    text delta)
    :after        - what follows the events: `:done` (`data: [DONE]`, the default), `:eof` (nothing) or
                    `:keep-alive` (`[DONE]`, then 20 s of `: ping` comments). The chunked terminator follows.
    :gzip?        - send the body with `Content-Encoding: gzip`
    :port         - the port to listen on (default 0, a free port)
    :short-total  - events for a `POST` whose JSON body has `max_tokens`, such as a title call

  Any other method gets a 404. Returns:

    :url          - the base URL, e.g. `http://127.0.0.1:52011`
    :sent         - atom: the events sent on the first `POST`
    :disconnected - promise: the `:sent` count when a write to the first `POST` failed (the client left)
    :connections  - atom: one map per request, `{:method :path :max-tokens? :sent :disconnected-at-ms}`
    :stop!        - fn that closes the server and every open connection"
  ([]
   (start-chunked-sse-server! {}))
  ([opts]
   (let [opts   (merge {:total 10 :interval-ms 10 :event-fn default-event :after :done :port 0} opts)
         server (ServerSocket. (int (:port opts)) 50 (InetAddress/getLoopbackAddress))
         state  {:connections  (atom [])
                 :sent         (atom 0)
                 :disconnected (promise)
                 :first-post   (atom false)
                 :sockets      (atom [])}]
     (accept-loop! server opts state)
     {:url          (str "http://127.0.0.1:" (.getLocalPort server))
      :sent         (:sent state)
      :disconnected (:disconnected state)
      :connections  (:connections state)
      :stop!        (fn []
                      (.close server)
                      (run! #(.close ^Socket %) @(:sockets state)))})))
