(ns metabase.util
  "Common utility functions useful throughout the codebase."
  (:require [clojure
             [data :as data]
             [pprint :refer [pprint]]
             [set :as set]
             [string :as str]
             [walk :as walk]]
            [clojure.java.classpath :as classpath]
            [clojure.math.numeric-tower :as math]
            [clojure.tools.logging :as log]
            [clojure.tools.namespace.find :as ns-find]
            [colorize.core :as colorize]
            [flatland.ordered.map :refer [ordered-map]]
            [medley.core :as m]
            [metabase.config :as config]
            [metabase.util.i18n :refer [trs tru]]
            [ring.util.codec :as codec]
            [weavejester.dependency :as dep])
  (:import [java.net InetAddress InetSocketAddress Socket]
           [java.text Normalizer Normalizer$Form]
           java.util.concurrent.TimeoutException
           java.util.Locale
           javax.xml.bind.DatatypeConverter
           [org.apache.commons.validator.routines RegexValidator UrlValidator]))

;; This is the very first log message that will get printed.
;;
;; It's here because this is one of the very first namespaces that gets loaded, and the first that has access to the
;; logger It shows up a solid 10-15 seconds before the "Starting Metabase in STANDALONE mode" message because so many
;; other namespaces need to get loaded
(when-not *compile-files*
  (log/info (trs "Loading Metabase...")))

(defn format-bytes
  "Nicely format `num-bytes` as kilobytes/megabytes/etc.

    (format-bytes 1024) ; -> 2.0 KB"
  [num-bytes]
  (loop [n num-bytes [suffix & more] ["B" "KB" "MB" "GB"]]
    (if (and (seq more)
             (>= n 1024))
      (recur (/ n 1024.0) more)
      (format "%.1f %s" n suffix))))

;; Log the maximum memory available to the JVM at launch time as well since it is very handy for debugging things
(when-not *compile-files*
  (log/info (trs "Maximum memory available to JVM: {0}" (format-bytes (.maxMemory (Runtime/getRuntime))))))

;; Set the default width for pprinting to 200 instead of 72. The default width is too narrow and wastes a lot of space
;; for pprinting huge things like expanded queries
(alter-var-root #'clojure.pprint/*print-right-margin* (constantly 200))

(defmacro ignore-exceptions
  "Simple macro which wraps the given expression in a try/catch block and ignores the exception if caught."
  {:style/indent 0}
  [& body]
  `(try ~@body (catch Throwable ~'_)))

(defn optional
  "Helper function for defining functions that accept optional arguments. If `pred?` is true of the first item in `args`,
  a pair like `[first-arg other-args]` is returned; otherwise, a pair like `[default other-args]` is returned.

  If `default` is not specified, `nil` will be returned when `pred?` is false.

    (defn
      ^{:arglists ([key? numbers])}
      wrap-nums [& args]
      (let [[k nums] (optional keyword? args :nums)]
        {k nums}))
    (wrap-nums 1 2 3)          -> {:nums [1 2 3]}
    (wrap-nums :numbers 1 2 3) -> {:numbers [1 2 3]}"
  {:arglists '([pred? args]
               [pred? args default])}
  [pred? args & [default]]
  (if (pred? (first args)) [(first args) (next args)]
      [default args]))

(defmacro varargs
  "Make a properly-tagged Java interop varargs argument. This is basically the same as `into-array` but properly tags
  the result.

    (u/varargs String)
    (u/varargs String [\"A\" \"B\"])"
  {:style/indent 1, :arglists '([klass] [klass xs])}
  [klass & [objects]]
  (vary-meta `(into-array ~klass ~objects)
             assoc :tag (format "[L%s;" (.getCanonicalName ^Class (ns-resolve *ns* klass)))))

(defn email?
  "Is `s` a valid email address string?"
  ^Boolean [^String s]
  (boolean (when (string? s)
             (re-matches #"[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
                         (str/lower-case s)))))

(defn url?
  "Is `s` a valid HTTP/HTTPS URL string?"
  ^Boolean [s]
  (let [validator (UrlValidator. (varargs String ["http" "https"])
                                 (RegexValidator. "^\\p{Alnum}+([\\.|\\-]\\p{Alnum}+)*(:\\d*)?")
                                 UrlValidator/ALLOW_LOCAL_URLS)]
    (.isValid validator (str s))))

(defn maybe?
  "Returns `true` if X is `nil`, otherwise calls (F X).
   This can be used to see something is either `nil` or statisfies a predicate function:

     (string? nil)          -> false
     (string? \"A\")        -> true
     (maybe? string? nil)   -> true
     (maybe? string? \"A\") -> true

   It can also be used to make sure a given function won't throw a `NullPointerException`:

     (str/lower-case nil)            -> NullPointerException
     (str/lower-case \"ABC\")        -> \"abc\"
     (maybe? str/lower-case nil)     -> true
     (maybe? str/lower-case \"ABC\") -> \"abc\"

   The latter use-case can be useful for things like sorting where some values in a collection
   might be `nil`:

     (sort-by (partial maybe? s/lower-case) some-collection)"
  [f x]
  (or (nil? x)
      (f x)))


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
  "Returns true if the host given by hostname is reachable, false otherwise "
  [^String hostname]
  (try
    (let [host-addr (InetAddress/getByName hostname)]
      (.isReachable host-addr host-up-timeout))
    (catch Throwable _ false)))

(defn ^:deprecated rpartial
  "Like `partial`, but applies additional args *before* `bound-args`.
   Inspired by [`-rpartial` from dash.el](https://github.com/magnars/dash.el#-rpartial-fn-rest-args)

    ((partial - 5) 8)  -> (- 5 8) -> -3
    ((rpartial - 5) 8) -> (- 8 5) -> 3

  DEPRECATED: just use `#()` function literals instead. No need to be needlessly confusing."
  [f & bound-args]
  (fn [& args]
    (apply f (concat args bound-args))))

(defmacro pdoseq
  "(Almost) just like `doseq` but runs in parallel. Doesn't support advanced binding forms like `:let` or `:when` and
  only supports a single binding </3"
  {:style/indent 1}
  [[binding collection] & body]
  `(dorun (pmap (fn [~binding]
                  ~@body)
                ~collection)))

(defmacro prog1
  "Execute `first-form`, then any other expressions in `body`, presumably for side-effects; return the result of
  `first-form`.

    (def numbers (atom []))

    (defn find-or-add [n]
      (or (first-index-satisfying (partial = n) @numbers)
          (prog1 (count @numbers)
            (swap! numbers conj n))))

    (find-or-add 100) -> 0
    (find-or-add 200) -> 1
    (find-or-add 100) -> 0

   The result of `first-form` is bound to the anaphor `<>`, which is convenient for logging:

     (prog1 (some-expression)
       (println \"RESULTS:\" <>))

  `prog1` is an anaphoric version of the traditional macro of the same name in
   [Emacs Lisp](http://www.gnu.org/software/emacs/manual/html_node/elisp/Sequencing.html#index-prog1)
   and [Common Lisp](http://www.lispworks.com/documentation/HyperSpec/Body/m_prog1c.htm#prog1).

  Style note: Prefer `doto` when appropriate, e.g. when dealing with Java objects."
  {:style/indent 1}
  [first-form & body]
  `(let [~'<> ~first-form]
     ~@body
     ~'<>))

(def ^String ^{:arglists '([emoji-string])} emoji
  "Returns the `emoji-string` passed in if emoji in logs are enabled, otherwise always returns an empty string."
  (if (config/config-bool :mb-emoji-in-logs)
    identity
    (constantly "")))

(def ^:private colorize?
  ;; As of 0.35.0 we support the NO_COLOR env var. See https://no-color.org/ (But who hates color logs?)
  (if (config/config-str :no-color)
    false
    (config/config-bool :mb-colorize-logs)))

(def ^{:arglists '(^String [color-symb x]), :style/indent 1} colorize
  "Colorize string `x` using `color`, a symbol or keyword, but only if `MB_COLORIZE_LOGS` is enabled (the default).
  `color` can be `green`, `red`, `yellow`, `blue`, `cyan`, `magenta`, etc. See the entire list of avaliable
  colors [here](https://github.com/ibdknox/colorize/blob/master/src/colorize/core.clj)"
  (if colorize?
    (fn [color x]
      (colorize/color (keyword color) (str x)))
    (fn [_ x]
      (str x))))

(defn format-color
  "With one arg, converts something to a string and colorizes it. With two args, behaves like `format`, but colorizes
  the output.

    (format-color :red \"%d cans\" 2)"
  {:arglists '(^String [color x] ^String [color format-string & args]), :style/indent 2}
  (^String [color x]
   (colorize color x))

  (^String [color format-str & args]
   (colorize color (apply format format-str args))))

(defn pprint-to-str
  "Returns the output of pretty-printing `x` as a string.
  Optionally accepts `color-symb`, which colorizes the output with the corresponding
  function from `colorize.core`.

     (pprint-to-str 'green some-obj)"
  {:style/indent 1}
  (^String [x]
   (when x
     (with-open [w (java.io.StringWriter.)]
       (pprint x w)
       (str w))))

  (^String [color-symb x]
   (colorize color-symb (pprint-to-str x))))


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

(declare format-milliseconds)

(defn deref-with-timeout
  "Call `deref` on a something derefable (e.g. a future or promise), and throw an exception if it takes more than
  `timeout-ms`. If `ref` is a future it will attempt to cancel it as well."
  [reff timeout-ms]
  (let [result (deref reff timeout-ms ::timeout)]
    (when (= result ::timeout)
      (when (instance? java.util.concurrent.Future reff)
        (future-cancel reff))
      (throw (TimeoutException. (tru "Timed out after {0}" (format-milliseconds timeout-ms)))))
    result))

(defn do-with-timeout
  "Impl for `with-timeout` macro."
  [timeout-ms f]
  (let [result (deref-with-timeout
                (future
                  (try
                    (f)
                    (catch Throwable e
                      e)))
                timeout-ms)]
    (if (instance? Throwable result)
      (throw result)
      result)))

(defmacro with-timeout
  "Run `body` in a `future` and throw an exception if it fails to complete after `timeout-ms`."
  [timeout-ms & body]
  `(do-with-timeout ~timeout-ms (fn [] ~@body)))

(defn round-to-decimals
  "Round (presumabily floating-point) `number` to `decimal-place`. Returns a `Double`.

     (round-to-decimals 2 35.5058998M) -> 35.51"
  ^Double [^Integer decimal-place, ^Number number]
  {:pre [(integer? decimal-place) (number? number)]}
  (double (.setScale (bigdec number) decimal-place BigDecimal/ROUND_HALF_UP)))

(defn- check-protocol-impl-method-map
  "Check that the methods expected for `protocol` are all implemented by `method-map`, and that no extra methods are
   provided. Used internally by `strict-extend`."
  [protocol method-map]
  (let [[missing-methods extra-methods] (data/diff (set (keys (:method-map protocol))) (set (keys method-map)))]
    (when missing-methods
      (throw (Exception. (format "Missing implementations for methods in %s: %s" (:var protocol) missing-methods))))
    (when extra-methods
      (throw (Exception. (format "Methods implemented that are not in %s: %s " (:var protocol) extra-methods))))))

(defn strict-extend
  "A strict version of `extend` that throws an exception if any methods declared in the protocol are missing or any
  methods not declared in the protocol are provided.

  Since this has better compile-time error-checking, prefer `strict-extend` to regular `extend` in all situations, and
  to `extend-protocol`/ `extend-type` going forward."
  ;; TODO - maybe implement strict-extend-protocol and strict-extend-type ?
  {:style/indent 1}
  [atype protocol method-map & more]
  (check-protocol-impl-method-map protocol method-map)
  (extend atype protocol method-map)
  (when (seq more)
    (apply strict-extend atype more)))

(defn remove-diacritical-marks
  "Return a version of S with diacritical marks removed."
  ^String [^String s]
  (when (seq s)
    (str/replace
     ;; First, "decompose" the characters. e.g. replace 'LATIN CAPITAL LETTER A WITH ACUTE' with 'LATIN CAPITAL LETTER
     ;; A' + 'COMBINING ACUTE ACCENT' See http://docs.oracle.com/javase/8/docs/api/java/text/Normalizer.html
     (Normalizer/normalize s Normalizer$Form/NFD)
     ;; next, remove the combining diacritical marks -- this SO answer explains what's going on here best:
     ;; http://stackoverflow.com/a/5697575/1198455 The closest thing to a relevant JavaDoc I could find was
     ;; http://docs.oracle.com/javase/7/docs/api/java/lang/Character.UnicodeBlock.html#COMBINING_DIACRITICAL_MARKS
     #"\p{Block=CombiningDiacriticalMarks}+"
     "")))


(def ^:private slugify-valid-chars
  "Valid *ASCII* characters for URL slugs generated by `slugify`."
  #{\a \b \c \d \e \f \g \h \i \j \k \l \m \n \o \p \q \r \s \t \u \v \w \x \y \z
    \0 \1 \2 \3 \4 \5 \6 \7 \8 \9
    \_})

;; unfortunately it seems that this doesn't fully-support Emoji :(, they get encoded as "??"
(defn- slugify-char [^Character c]
  (cond
    (> (int c) 128)                   (codec/url-encode c) ; for non-ASCII characters, URL-encode them
    (contains? slugify-valid-chars c) c                    ; for ASCII characters, if they're in the allowed set of characters, keep them
    :else                             \_))                 ; otherwise replace them with underscores

(defn slugify
  "Return a version of String `s` appropriate for use as a URL slug.
   Downcase the name, remove diacritcal marks, and replace non-alphanumeric *ASCII* characters with underscores;
   URL-encode non-ASCII characters. (Non-ASCII characters are encoded rather than replaced with underscores in order
   to support languages that don't use the Latin alphabet; see issue #3818).

   Optionally specify `max-length` which will truncate the slug after that many characters."
  (^String [^String s]
   (when (seq s)
     (str/join (for [c (remove-diacritical-marks (str/lower-case s))]
                 (slugify-char c)))))
  (^String [s max-length]
   (str/join (take max-length (slugify s)))))

(defn all-ex-data
  "Like `ex-data`, but merges `ex-data` from causes. If duplicate keys exist, the keys from the highest level are
  preferred.

    (def e (ex-info \"A\" {:a true, :both \"a\"} (ex-info \"B\" {:b true, :both \"A\"})))

    (ex-data e)
    ;; -> {:a true, :both \"a\"}

    (u/all-ex-data e)
    ;; -> {:a true, :b true, :both \"a\"}"
  [e]
  (reduce
   (fn [data e]
     (merge (ex-data e) data))
   nil
   (take-while some? (iterate #(.getCause ^Throwable %) e))))

(defn do-with-auto-retries
  "Execute `f`, a function that takes no arguments, and return the results.
   If `f` fails with an exception, retry `f` up to `num-retries` times until it succeeds.

   Consider using the `auto-retry` macro instead of calling this function directly."
  {:style/indent 1}
  [num-retries f]
  (if (<= num-retries 0)
    (f)
    (try
      (f)
      (catch Throwable e
        (when (::no-auto-retry? (all-ex-data e))
          (throw e))
        (log/warn (format-color 'red "auto-retry %s: %s" f (.getMessage e)))
        (do-with-auto-retries (dec num-retries) f)))))

(defmacro auto-retry
  "Execute `body` and return the results. If `body` fails with an exception, retry execution up to `num-retries` times
  until it succeeds.

  You can disable auto-retries for a specific ExceptionInfo by including `{:metabase.util/no-auto-retry? true}` in its
  data (or the data of one of its causes.)"
  {:style/indent 1}
  [num-retries & body]
  `(do-with-auto-retries ~num-retries
     (fn [] ~@body)))

(defn key-by
  "Convert a sequential `coll` to a map of `(f item)` -> `item`.
  This is similar to `group-by`, but the resultant map's values are single items from `coll` rather than sequences of
  items. (Because only a single item is kept for each value of `f`, items producing duplicate values will be
  discarded).

     (key-by :id [{:id 1, :name :a} {:id 2, :name :b}]) -> {1 {:id 1, :name :a}, 2 {:id 2, :name :b}}"
  {:style/indent 1}
  [f coll]
  (into {} (map (juxt f identity)) coll))

(defn qualified-name
  "Return `k` as a string, qualified by its namespace, if any (unlike `name`). Handles `nil` values gracefully as well
  (also unlike `name`).

     (u/qualified-name :type/FK) -> \"type/FK\""
  [k]
  (when (some? k)
    (if-let [namespac (when (instance? clojure.lang.Named k)
                        (namespace k))]
      (str namespac "/" (name k))
      (name k))))

(defn id
  "If passed an integer ID, returns it. If passed a map containing an `:id` key, returns the value if it is an integer.
  Otherwise returns `nil`.

  Provided as a convenience to allow model-layer functions to easily accept either an object or raw ID. Use this in
  cases where the ID/object is allowed to be `nil`. Use `get-id` below in cases where you would also like to guarantee
  it is non-`nil`."
  ^Integer [object-or-id]
  (cond
    (map? object-or-id)     (recur (:id object-or-id))
    (integer? object-or-id) object-or-id))

;; TODO - now that I think about this, I think this should be called `the-id` instead, because the idea is similar to
;; `clojure.core/the-ns`
(defn get-id
  "If passed an integer ID, returns it. If passed a map containing an `:id` key, returns the value if it is an integer.
  Otherwise, throws an Exception.

  Provided as a convenience to allow model-layer functions to easily accept either an object or raw ID, and to assert
  that you have a valid ID."
  ;; TODO - lots of functions can be rewritten to use this, which would make them more flexible
  ^Integer [object-or-id]
  (or (id object-or-id)
      (throw (Exception. (tru "Not something with an ID: {0}" object-or-id)))))

;; This is made `^:const` so it will get calculated when the uberjar is compiled. `find-namespaces` won't work if
;; source is excluded; either way this takes a few seconds, so doing it at compile time speeds up launch as well.
(defonce ^:const ^{:doc "Vector of symbols of all Metabase namespaces, excluding test namespaces. This is intended for
  use by various routines that load related namespaces, such as task and events initialization."}
  metabase-namespace-symbols
  (vec (sort (for [ns-symb (ns-find/find-namespaces (classpath/system-classpath))
                   :when   (and (.startsWith (name ns-symb) "metabase.")
                                (not (.contains (name ns-symb) "test")))]
               ns-symb))))

(def ^java.util.regex.Pattern uuid-regex
  "A regular expression for matching canonical string representations of UUIDs."
  #"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")

(defn one-or-many
  "Wraps a single element in a sequence; returns sequences as-is. In lots of situations we'd like to accept either a
  single value or a collection of values as an argument to a function, and then loop over them; rather than repeat
  logic to check whether something is a collection and wrap if not everywhere, this utility function is provided for
  your convenience.

    (u/one-or-many 1)     ; -> [1]
    (u/one-or-many [1 2]) ; -> [1 2]"
  [arg]
  (if ((some-fn sequential? set? nil?) arg)
    arg
    [arg]))

(defn select-nested-keys
  "Like `select-keys`, but can also handle nested keypaths:

     (select-nested-keys {:a 100, :b {:c 200, :d 300}} [:a [:b :d] :c])
     ;; -> {:a 100, :b {:d 300}}

   The values of `keyseq` can be either regular keys, which work the same way as `select-keys`,
   or vectors of the form `[k & nested-keys]`, which call `select-nested-keys` recursively
   on the value of `k`. "
  [m keyseq]
  ;; TODO - use (empty m) once supported by model instances
  (into {} (for [k     keyseq
                 :let  [[k & nested-keys] (one-or-many k)
                        v                 (get m k)]
                 :when (contains? m k)]
             {k (if-not (seq nested-keys)
                  v
                  (select-nested-keys v nested-keys))})))

(defn base64-string?
  "Is `s` a Base-64 encoded string?"
  ^Boolean [s]
  (boolean (when (string? s)
             (re-find #"^[0-9A-Za-z/+]+=*$" s))))

(defn decode-base64
  "Decodes a Base64 string to a UTF-8 string"
  [input]
  (new java.lang.String (DatatypeConverter/parseBase64Binary input) "UTF-8"))

(defn encode-base64
  "Encodes a string to a Base64 string"
  [^String input]
  (DatatypeConverter/printBase64Binary (.getBytes input "UTF-8")))

(def ^{:arglists '([n])} safe-inc
  "Increment `n` if it is non-`nil`, otherwise return `1` (e.g. as if incrementing `0`)."
  (fnil inc 0))

(defn occurances-of-substring
  "Return the number of times SUBSTR occurs in string S."
  ^Long [^String s, ^String substr]
  (when (and (seq s) (seq substr))
    (loop [index 0, cnt 0]
      (if-let [^long new-index (str/index-of s substr index)]
        (recur (inc new-index) (inc cnt))
        cnt))))

(defn select-non-nil-keys
  "Like `select-keys`, but returns a map only containing keys in KS that are present *and non-nil* in M.

     (select-non-nil-keys {:a 100, :b nil} #{:a :b :c})
     ;; -> {:a 100}"
  [m ks]
  (into {} (for [k     ks
                 :when (some? (get m k))]
             {k (get m k)})))

(defn select-keys-when
  "Returns a map that only contains keys that are either `:present` or `:non-nil`. Combines behavior of `select-keys`
  and `select-non-nil-keys`. This is useful for API endpoints that update a model, which often have complex rules
  about what gets updated (some keys are updated if `nil`, others only if non-nil).

     (select-keys-when {:a 100, :b nil, :d 200, :e nil}
       :present #{:a :b :c}
       :non-nil #{:d :e :f})
     ;; -> {:a 100, :b nil, :d 200}"
  {:style/indent 1}
  [m & {:keys [present non-nil], :as options}]
  {:pre [(every? #{:present :non-nil} (keys options))]}
  (merge (select-keys m present)
         (select-non-nil-keys m non-nil)))

(defn order-of-magnitude
  "Return the order of magnitude as a power of 10 of a given number."
  [x]
  (if (zero? x)
    0
    (long (math/floor (/ (Math/log (math/abs x))
                         (Math/log 10))))))

(defn update-when
  "Like `clojure.core/update` but does not create a new key if it does not exist. Useful when you don't want to create
  cruft."
  [m k f & args]
  (if (contains? m k)
    (apply update m k f args)
    m))

(defn update-in-when
  "Like `clojure.core/update-in` but does not create new keys if they do not exist. Useful when you don't want to create
  cruft."
  [m ks f & args]
  (if (not= ::not-found (get-in m ks ::not-found))
    (apply update-in m ks f args)
    m))

(defn index-of
  "Return index of the first element in `coll` for which `pred` reutrns true."
  [pred coll]
  (first (keep-indexed (fn [i x]
                         (when (pred x) i))
                       coll)))

(defn hexadecimal-string?
  "Returns truthy if `new-value` is a hexadecimal-string"
  [new-value]
  (and (string? new-value)
       (re-matches #"[0-9a-f]{64}" new-value)))

(defn snake-key
  "Convert a keyword or string `k` from `lisp-case` to `snake-case`."
  [k]
  (if (keyword? k)
    (keyword (snake-key (name k)))
    (str/replace k #"-" "_")))

(defn recursive-map-keys
  "Recursively replace the keys in a map with the value of `(f key)`."
  [f m]
  (walk/postwalk
   #(if (map? %)
      (m/map-keys f %)
      %)
   m))

(defn snake-keys
  "Convert the keys in a map from `lisp-case` to `snake-case`."
  [m]
  (recursive-map-keys snake-key m))

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
  a lock in place to prevent race conditions where threads simulataneously attempt to fetch and change the default
  Locale. Thus this macro should be used sparingly, and only in places that are already single-threaded (such as the
  launch code that runs Liquibase).

  DO NOT use this macro in API endpoints or other places that are multithreaded or performance will be negatively
  impacted. (You shouldn't have a good reason for using this there anyway. Rewrite your code to pass `Locale/US` when
  you call `.toUpperCase` or `str/upper-case`. Only use this macro if the calls in question are part of a 3rd-party
  library.)"
  {:style/indent 0}
  [& body]
  `(do-with-us-locale (fn [] ~@body)))

(defn topological-sort
  "Topologically sorts vertexs in graph g. Graph is a map of vertexs to edges. Optionally takes an
   additional argument `edges-fn`, a function used to extract edges. Returns data in the same shape
   (a graph), only sorted.

   Say you have a graph shaped like:

     a     b
     | \\  |
     c  |  |
     \\ | /
        d
        |
        e

   (u/topological-sort identity {:b []
                                 :c [:a]
                                 :e [:d]
                                 :d [:a :b :c]
                                 :a []})

   => (ordered-map :a [] :b [] :c [:a] :d [:a :b :c] :e [:d])

   If the graph has cycles, throws an exception.

   https://en.wikipedia.org/wiki/Topological_sorting"
  ([g] (topological-sort identity g))
  ([edges-fn g]
   (transduce (map (juxt key (comp edges-fn val)))
              (fn
                ([] (dep/graph))
                ([acc [vertex edges]]
                 (reduce (fn [acc edge]
                           (dep/depend acc vertex edge))
                         acc
                         edges))
                ([acc]
                 (let [sorted      (filter g (dep/topo-sort acc))
                       independent (set/difference (set (keys g)) (set sorted))]
                   (not-empty
                    (into (ordered-map)
                          (map (fn [vertex]
                                 [vertex (g vertex)]))
                          (concat independent sorted))))))
              g)))

(defn lower-case-en
  "Locale-agnostic version of `clojure.string/lower-case`.
  `clojure.string/lower-case` uses the default locale in conversions, turning
  `ID` into `ıd`, in the Turkish locale. This function always uses the
  `Locale/US` locale."
  [^CharSequence s]
  (.. s toString (toLowerCase (Locale/US))))

(defn lower-case-map-keys
  "Changes the keys of a given map to lower case."
  [m]
  (into {} (for [[k v] m]
             [(-> k name lower-case-en keyword) v])))

(defn format-nanoseconds
  "Format a time interval in nanoseconds to something more readable. (µs/ms/etc.)"
  ^String [nanoseconds]
  ;; The basic idea is to take `n` and see if it's greater than the divisior. If it is, we'll print it out as that
  ;; unit. If more, we'll divide by the divisor and recur, trying each successively larger unit in turn. e.g.
  ;;
  ;; (format-nanoseconds 500)    ; -> "500 ns"
  ;; (format-nanoseconds 500000) ; -> "500 µs"
  (loop [n nanoseconds, [[unit divisor] & more] [[:ns 1000] [:µs 1000] [:ms 1000] [:s 60] [:mins 60] [:hours 24]
                                                 [:days 7] [:weeks (/ 365.25 7)] [:years Double/POSITIVE_INFINITY]]]
    (if (and (> n divisor)
             (seq more))
      (recur (/ n divisor) more)
      (format "%.1f %s" (double n) (name unit)))))

(defn format-microseconds
  "Format a time interval in microseconds into something more readable."
  ^String [microseconds]
  (format-nanoseconds (* 1000.0 microseconds)))

(defn format-milliseconds
  "Format a time interval in milliseconds into something more readable."
  ^String [milliseconds]
  (format-microseconds (* 1000.0 milliseconds)))

(defn format-seconds
  "Format a time interval in seconds into something more readable."
  ^String [seconds]
  (format-milliseconds (* 1000.0 seconds)))

(defmacro profile
  "Like `clojure.core/time`, but lets you specify a `message` that gets printed with the total time, and formats the
  time nicely using `format-nanoseconds`."
  {:style/indent 1}
  ([form]
   `(profile ~(str form) ~form))
  ([message & body]
   `(let [start-time# (System/nanoTime)]
      (prog1 (do ~@body)
        (println (format-color '~'green "%s took %s"
                   ~message
                   (format-nanoseconds (- (System/nanoTime) start-time#))))))))

(defn seconds->ms
  "Convert `seconds` to milliseconds. More readable than doing this math inline."
  [seconds]
  (* seconds 1000))

(defn minutes->seconds
  "Convert `minutes` to seconds. More readable than doing this math inline."
  [minutes]
  (* 60 minutes))

(defn minutes->ms
  "Convert `minutes` to milliseconds. More readable than doing this math inline."
  [minutes]
  (-> minutes minutes->seconds seconds->ms))

(defn hours->ms
  "Convert `hours` to milliseconds. More readable than doing this math inline."
  [hours]
  (-> (* 60 hours) minutes->seconds seconds->ms))

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
      [
       ;; strip out any current symbols
       [#"[^\d,.-]+"          ""]
       ;; now strip out any thousands separators
       [#"(?<=\d)[,.](\d{3})" "$1"]
       ;; now replace a comma decimal seperator with a period
       [#","                  "."]
       ;; move minus sign at end to front
       [#"(^[^-]+)-$"         "-$1"]]))))
