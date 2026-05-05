(ns metabase.util.jvm
  "JVM-specific utilities and helpers.
  You don't want to import this namespace directly - these functions are re-exported by [[metabase.util]]."
  (:require
   [clojure.string :as str]
   [metabase.util.format :as u.format]
   [metabase.util.log :as log])
  (:import
   (java.net InetAddress InetSocketAddress Socket)
   (java.nio.charset StandardCharsets)
   (java.util
    Base64
    Base64$Decoder
    Base64$Encoder
    Locale
    PriorityQueue)
   (java.util.concurrent Executors ExecutorService TimeoutException)))

(set! *warn-on-reflection* true)

(defonce ^:private ^ExecutorService virtual-thread-executor
  (Executors/newVirtualThreadPerTaskExecutor))

(defmacro varargs
  "Make a properly-tagged Java interop varargs argument. This is basically the same as `into-array` but properly tags
  the result.

    (u/varargs String)
    (u/varargs String [\"A\" \"B\"])"
  {:style/indent [:defn], :arglists '([klass] [klass xs])}
  [klass & [objects]]
  (vary-meta `(into-array ~klass ~objects)
             assoc :tag (format "[L%s;" (.getTypeName ^Class (ns-resolve *ns* klass)))))

(def ^:private ^:const host-up-timeout
  "Timeout (in ms) for checking if a host is available with `host-up?` and `host-port-up?`."
  5000)

(defn host-port-up?
  "Returns true if the port is active on a given host, false otherwise"
  [^String hostname, ^Integer port]
  (try
    (let [sock-addr (InetSocketAddress. hostname port)]
      (with-open [sock (Socket.)]
        (.connect sock sock-addr host-up-timeout)
        true))
    (catch Throwable _ false)))

(defn host-up?
  "Returns true if the host given by hostname is reachable, false otherwise"
  [^String hostname]
  (try
    (let [host-addr (InetAddress/getByName hostname)]
      (.isReachable host-addr host-up-timeout))
    (catch Throwable _ false)))

(defprotocol ^:private IFilteredStacktrace
  (filtered-stacktrace [this]
    "Get the stack trace associated with E and return it as a vector with non-metabase frames after the last Metabase
    frame filtered out."))

(extend-protocol IFilteredStacktrace
  nil
  (filtered-stacktrace [_] nil)

  Throwable
  (filtered-stacktrace [^Throwable this]
    (filtered-stacktrace (.getStackTrace this)))

  Thread
  (filtered-stacktrace [^Thread this]
    (filtered-stacktrace (.getStackTrace this))))

(extend (Class/forName "[Ljava.lang.StackTraceElement;")
  IFilteredStacktrace
  {:filtered-stacktrace
   (fn [this]
     ;; keep all the frames before the last Metabase frame, but then filter out any other non-Metabase frames after
     ;; that
     (let [[frames-after-last-mb other-frames]     (split-with #(not (str/includes? % "metabase"))
                                                               (seq this))
           [last-mb-frame & frames-before-last-mb] (for [frame other-frames
                                                         :when (str/includes? frame "metabase")]
                                                     (str/replace frame #"^metabase\." ""))]
       (vec
        (concat
         (map str frames-after-last-mb)
         ;; add a little arrow to the frame so it stands out more
         (cons
          (some->> last-mb-frame (str "--> "))
          frames-before-last-mb)))))})

(defn ip-address?
  "Whether string `s` is a valid IP (v4 or v6) address."
  [s]
  (and (string? s)
       (.isValid (org.apache.commons.validator.routines.InetAddressValidator/getInstance) ^String s)))

(defn sorted-take
  "A reducing function that maintains a queue of the largest items as determined by `kompare`. The queue is bounded
  in size by `size`. Useful if you are interested in the largest `size` number of items without keeping the entire
  collection in memory.

  In general,
  (=
    (take-last 2 (sort-by identity kompare coll))
    (transduce (map identity) (u/sorted-take 2 kompare) coll))
  But the entire collection is not in memory, just at most"
  [size kompare]
  (fn bounded-heap-acc
    ([] (PriorityQueue. size kompare))
    ([^PriorityQueue q]
     (loop [acc []]
       (if-let [x (.poll q)]
         (recur (conj acc x))
         acc)))
    ([^PriorityQueue q item]
     (if (>= (.size q) size)
       (let [smallest (.peek q)]
         (if (pos? (kompare item smallest))
           (doto q
             (.poll)
             (.offer item))
           q))
       (doto q
         (.offer item))))))

(defn full-exception-chain
  "Gather the full exception chain into a sequence."
  [e]
  (when (instance? Throwable e)
    (take-while some? (iterate ex-cause e))))

(defn all-ex-data
  "Like `ex-data`, but merges `ex-data` from causes. If duplicate keys exist, the keys from the highest level are
  preferred.

    (def e (ex-info \"A\" {:a true, :both \"a\"} (ex-info \"B\" {:b true, :both \"A\"})))

    (ex-data e)
    ;; -> {:a true, :both \"a\"}

    (u.jvm/all-ex-data e)
    ;; -> {:a true, :b true, :both \"a\"}"
  [e]
  (reduce
   (fn [data e]
     (merge (ex-data e) data))
   nil
   (full-exception-chain e)))

(defn all-ex-messages
  "Returns a list of all non-nil messages in an exception, starting from the outermost and working inward.
  If no messages are found, returns nil."
  [^Throwable e]
  (loop [ex e
         messages []]
    (if ex
      (recur (.getCause ex)
             (conj messages (.getMessage ex)))
      (seq (remove nil? messages)))))

(defn do-with-auto-retries
  "Execute `f`, a function that takes no arguments, and return the results.
   If `f` fails with an exception, retry `f` up to `num-retries` times until it succeeds.

   Consider using the `auto-retry` macro instead of calling this function directly.

   For implementing more fine grained retry policies like exponential backoff,
   consider using the `metabase.util.retry` namespace."
  [num-retries f]
  (if (<= num-retries 0)
    (f)
    (try
      (f)
      (catch Throwable e
        (when (::no-auto-retry? (all-ex-data e))
          (throw e))
        (log/warn (u.format/format-color 'red "auto-retry %s: %s" f (.getMessage e)))
        (do-with-auto-retries (dec num-retries) f)))))

(defmacro auto-retry
  "Execute `body` and return the results. If `body` fails with an exception, retry execution up to `num-retries` times
  until it succeeds.

  You can disable auto-retries for a specific ExceptionInfo by including `{:metabase.util.jvm/no-auto-retry? true}` in
  its data (or the data of one of its causes.)

  For implementing more fine grained retry policies like exponential backoff,
  consider using the `metabase.util.retry` namespace."
  {:style/indent 1}
  [num-retries & body]
  `(do-with-auto-retries
    ~num-retries
    (fn [] ~@body)))

(def ^:private ^Base64$Decoder base64-decoder
  "A shared Base64 decoder instance."
  (Base64/getDecoder))

(defn bytes-to-string
  "Converts UTF-8 bytes into a string."
  ^String [^bytes bs]
  (String. bs StandardCharsets/UTF_8))

(defn decode-base64-to-bytes
  "Decodes a Base64 string into bytes."
  ^bytes [^String string]
  (.decode base64-decoder string))

(defn decode-base64
  "Decodes the Base64 string `input` to a UTF-8 string."
  [input]
  (bytes-to-string (decode-base64-to-bytes input)))

(def ^:private ^Base64$Encoder base64-encoder
  "A shared Base64 encoder instance."
  (Base64/getEncoder))

(defn string-to-bytes
  "Converts a string into UTF-8 bytes"
  ^bytes [^String input]
  (.getBytes input StandardCharsets/UTF_8))

(defn encode-base64
  "Encodes the UTF-8 encoding of the string `input` to a Base64 string."
  ^String [^String input]
  (.encodeToString base64-encoder (string-to-bytes input)))

(defn encode-base64-bytes
  "Encodes the bytes `input` to a Base64 string."
  ^String [^bytes input]
  (.encodeToString base64-encoder input))

(def ^:private do-with-us-locale-lock (Object.))

(defn do-with-us-locale
  "Implementation for `with-us-locale` macro; see below."
  [f]
  ;; Since I'm 99% sure default Locale isn't thread-local we better put a lock in place here so we don't end up with
  ;; the following race condition:
  ;;
  ;; Thread 1 ....*.............................*........................*...........*
  ;;              ^getDefault() -> Turkish      ^setDefault(US)          ^(f)        ^setDefault(Turkish)
  ;; Thread 2 ....................................*....................*................*......*
  ;;                                              ^getDefault() -> US  ^setDefault(US)  ^(f)   ^setDefault(US)
  (locking do-with-us-locale-lock
    (let [original-locale (Locale/getDefault)]
      (try
        (Locale/setDefault Locale/US)
        (f)
        (finally
          (Locale/setDefault original-locale))))))

(defmacro with-us-locale
  "Execute `body` with the default system locale temporarily set to `locale`. Why would you want to do this? Tons of
  code relies on `String/toUpperCase` which converts a string to uppercase based on the default locale. Normally, this
  does what you'd expect, but when the default locale is Turkish, all hell breaks loose:

    ;; Locale is Turkish / -Duser.language=tr
    (.toUpperCase \"filename\") ;; -> \"FİLENAME\"

  Rather than submit PRs to every library in the world to use `(.toUpperCase <str> Locale/US)`, it's simpler just to
  temporarily bind the default Locale to something predicatable (i.e. US English) when doing something important that
  tends to break like running Liquibase migrations.)

  Note that because `Locale/setDefault` and `Locale/getDefault` aren't thread-local (as far as I know) I've had to put
  a lock in place to prevent race conditions where threads simultaneously attempt to fetch and change the default
  Locale. Thus this macro should be used sparingly, and only in places that are already single-threaded (such as the
  launch code that runs Liquibase).

  DO NOT use this macro in API endpoints or other places that are multithreaded or performance will be negatively
  impacted. (You shouldn't have a good reason for using this there anyway. Rewrite your code to pass `Locale/US` when
  you call `.toUpperCase` or `str/upper-case`. Only use this macro if the calls in question are part of a 3rd-party
  library.)"
  {:style/indent 0}
  [& body]
  `(do-with-us-locale (fn [] ~@body)))

(defn deref-with-timeout
  "Call `deref` on a something derefable (e.g. a future or promise), and throw an exception if it takes more than
  `timeout-ms`. If `ref` is a future it will attempt to cancel it as well."
  [reff timeout-ms]
  (let [result (deref reff timeout-ms ::timeout)]
    (when (= result ::timeout)
      (when (future? reff)
        (future-cancel reff))
      (throw (TimeoutException. (format "Timed out after %s" (u.format/format-milliseconds timeout-ms)))))
    result))

(defn do-with-timeout
  "Impl for `with-timeout` macro."
  [timeout-ms f]
  (try
    (deref-with-timeout (future-call f) timeout-ms)
    (catch java.util.concurrent.ExecutionException e
      (throw (.getCause e)))))

(defmacro with-timeout
  "Run `body` in a `future` and throw an exception if it fails to complete after `timeout-ms`."
  [timeout-ms & body]
  `(do-with-timeout ~timeout-ms (fn [] ~@body)))

(defn poll
  "Returns `(thunk)` if the result satisfies the `done?` predicate within the timeout and nil otherwise.
  The default timeout is 1000ms and the default interval is 100ms.

    (u/poll {:thunk       (fn [] (upload!))
             :done?       (fn [response] (get-in response [:status :done]))
             :timeout-ms  1000
             :interval-ms 100})"
  [{:keys [thunk done? timeout-ms interval-ms]
    :or   {timeout-ms 1000 interval-ms 100}}]
  (let [start-time (System/currentTimeMillis)]
    (loop []
      (let [response (thunk)]
        (if (done? response)
          response
          (let [current-time (System/currentTimeMillis)
                elapsed-time (- current-time start-time)]
            (if (>= elapsed-time timeout-ms)
              nil ; timeout reached
              (do
                (Thread/sleep (long interval-ms))
                (recur)))))))))

;; Following function is not compatible with Safari 16.3 and older because it uses lookbehind regex.
(defn parse-currency
  "Parse a currency String to a BigDecimal. Handles a variety of different formats, such as:

    $1,000.00
    -£127.54
    -127,54 €
    kr-127,54
    € 127,54-
    ¥200"
  ^java.math.BigDecimal [^String s]
  (when-not (str/blank? s)
    (bigdec
     (reduce
      (partial apply str/replace)
      s
      [;; strip out any current symbols
       [#"[^\d,.-]+"          ""]
       ;; now strip out any thousands separators
       [#"(?<=\d)[,.](\d{3})" "$1"]
       ;; now replace a comma decimal separator with a period
       [#","                  "."]
       ;; move minus sign at end to front
       [#"(^[^-]+)-$"         "-$1"]]))))

(defn run-in-virtual-thread
  "Run `thunk` in a virtual thread. Returns the j.u.concurrent.Future immediately. The Future will contain the return value."
  [thunk]
  (.submit virtual-thread-executor ^Runnable thunk))

(defmacro in-virtual-thread*
  "Run body once in a virtual thread. Uses ^:once metadata and `bound-fn*` to define the function."
  [& body]
  `(run-in-virtual-thread (bound-fn* (^:once fn [] ~@body))))
