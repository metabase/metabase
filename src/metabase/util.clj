(ns metabase.util
  "Common utility functions useful throughout the codebase."
  (:require [clojure.data :as data]
            (clojure.java [classpath :as classpath]
                          [jdbc :as jdbc])
            [clojure.math.numeric-tower :as math]
            (clojure [pprint :refer [pprint]]
                     [string :as s])
            [clojure.tools.logging :as log]
            [clojure.tools.namespace.find :as ns-find]
            (clj-time [core :as t]
                      [coerce :as coerce]
                      [format :as time])
            colorize.core
            [ring.util.codec :as codec]
            [metabase.config :as config]
            metabase.logger)             ; make sure this is loaded since we use clojure.tools.logging here
  (:import clojure.lang.Keyword
           (java.net Socket
                     InetSocketAddress
                     InetAddress)
           (java.sql SQLException Timestamp)
           (java.text Normalizer Normalizer$Form)
           (java.util Calendar Date TimeZone)
           javax.xml.bind.DatatypeConverter
           org.joda.time.DateTime
           org.joda.time.format.DateTimeFormatter))

;; This is the very first log message that will get printed.
;; It's here because this is one of the very first namespaces that gets loaded, and the first that has access to the logger
;; It shows up a solid 10-15 seconds before the "Starting Metabase in STANDALONE mode" message because so many other namespaces need to get loaded
(log/info "Loading Metabase...")

;; Set the default width for pprinting to 200 instead of 72. The default width is too narrow and wastes a lot of space for pprinting huge things like expanded queries
(intern 'clojure.pprint '*print-right-margin* 200)

(declare pprint-to-str)

(defmacro ignore-exceptions
  "Simple macro which wraps the given expression in a try/catch block and ignores the exception if caught."
  {:style/indent 0}
  [& body]
  `(try ~@body (catch Throwable ~'_)))

;;; ### Protocols

(defprotocol ITimestampCoercible
  "Coerce object to a `java.sql.Timestamp`."
  (->Timestamp ^java.sql.Timestamp [this]
    "Coerce this object to a `java.sql.Timestamp`.
     Strings are parsed as ISO-8601."))

(extend-protocol ITimestampCoercible
  nil       (->Timestamp [_]
              nil)
  Timestamp (->Timestamp [this]
              this)
  Date       (->Timestamp [this]
               (Timestamp. (.getTime this)))
  ;; Number is assumed to be a UNIX timezone in milliseconds (UTC)
  Number    (->Timestamp [this]
              (Timestamp. this))
  Calendar  (->Timestamp [this]
              (->Timestamp (.getTime this)))
  ;; Strings are expected to be in ISO-8601 format. `YYYY-MM-DD` strings *are* valid ISO-8601 dates.
  String    (->Timestamp [this]
              (->Timestamp (DatatypeConverter/parseDateTime this)))
  DateTime  (->Timestamp [this]
              (->Timestamp (.getMillis this))))


(defprotocol IDateTimeFormatterCoercible
  "Protocol for converting objects to `DateTimeFormatters`."
  (->DateTimeFormatter ^org.joda.time.format.DateTimeFormatter [this]
    "Coerce object to a `DateTimeFormatter`."))

(extend-protocol IDateTimeFormatterCoercible
  ;; Specify a format string like "yyyy-MM-dd"
  String            (->DateTimeFormatter [this] (time/formatter this))
  DateTimeFormatter (->DateTimeFormatter [this] this)
  ;; Keyword will be used to get matching formatter from time/formatters
  Keyword           (->DateTimeFormatter [this] (or (time/formatters this)
                                                    (throw (Exception. (format "Invalid formatter name, must be one of:\n%s"
                                                                               (pprint-to-str (sort (keys time/formatters)))))))))

(defn parse-date
  "Parse a datetime string S with a custom DATE-FORMAT, which can be a format string,
   clj-time formatter keyword, or anything else that can be coerced to a `DateTimeFormatter`.

     (parse-date \"yyyyMMdd\" \"20160201\") -> #inst \"2016-02-01\"
     (parse-date :date-time \"2016-02-01T00:00:00.000Z\") -> #inst \"2016-02-01\""
  ^java.sql.Timestamp [date-format, ^String s]
  (->Timestamp (time/parse (->DateTimeFormatter date-format) s)))


(defprotocol ISO8601
  "Protocol for converting objects to ISO8601 formatted strings."
  (->iso-8601-datetime ^String [this timezone-id]
    "Coerce object to an ISO8601 date-time string such as \"2015-11-18T23:55:03.841Z\" with a given TIMEZONE."))

(def ^:private ISO8601Formatter
  ;; memoize this because the formatters are static. They must be distinct per timezone though.
  (memoize (fn [timezone-id]
             (if timezone-id
               (time/with-zone (time/formatters :date-time) (t/time-zone-for-id timezone-id))
               (time/formatters :date-time)))))

(extend-protocol ISO8601
  nil                    (->iso-8601-datetime [_ _] nil)
  java.util.Date         (->iso-8601-datetime [this timezone-id] (time/unparse (ISO8601Formatter timezone-id) (coerce/from-date this)))
  java.sql.Date          (->iso-8601-datetime [this timezone-id] (time/unparse (ISO8601Formatter timezone-id) (coerce/from-sql-date this)))
  java.sql.Timestamp     (->iso-8601-datetime [this timezone-id] (time/unparse (ISO8601Formatter timezone-id) (coerce/from-sql-time this)))
  org.joda.time.DateTime (->iso-8601-datetime [this timezone-id] (time/unparse (ISO8601Formatter timezone-id) this)))


;;; ## Date Stuff

(defn is-temporal?
  "Is VALUE an instance of a datetime class like `java.util.Date` or `org.joda.time.DateTime`?"
  [v]
  (or (instance? java.util.Date v)
      (instance? org.joda.time.DateTime v)))

(defn new-sql-timestamp
  "`java.sql.Date` doesn't have an empty constructor so this is a convenience that lets you make one with the current date.
   (Some DBs like Postgres will get snippy if you don't use a `java.sql.Timestamp`)."
  ^java.sql.Timestamp []
  (->Timestamp (System/currentTimeMillis)))

(defn format-date
  "Format DATE using a given DATE-FORMAT.

   DATE is anything that can coerced to a `Timestamp` via `->Timestamp`, such as a `Date`, `Timestamp`,
   `Long` (ms since the epoch), or an ISO-8601 `String`. DATE defaults to the current moment in time.

   DATE-FORMAT is anything that can be passed to `->DateTimeFormatter`, such as `String`
   (using [the usual date format args](http://docs.oracle.com/javase/7/docs/api/java/text/SimpleDateFormat.html)),
   `Keyword`, or `DateTimeFormatter`.


     (format-date \"yyyy-MM-dd\")                        -> \"2015-11-18\"
     (format-date :year (java.util.Date.))               -> \"2015\"
     (format-date :date-time (System/currentTimeMillis)) -> \"2015-11-18T23:55:03.841Z\""
  (^String [date-format]
   (format-date date-format (System/currentTimeMillis)))
  (^String [date-format date]
   (time/unparse (->DateTimeFormatter date-format) (coerce/from-sql-time (->Timestamp date)))))

(def ^{:arglists '([] [date])} date->iso-8601
  "Format DATE a an ISO-8601 string."
  (partial format-date :date-time))

(defn date-string?
  "Is S a valid ISO 8601 date string?"
  [^String s]
  (boolean (when (string? s)
             (ignore-exceptions
               (->Timestamp s)))))


(defn ->Date
  "Coerece DATE to a `java.util.Date`."
  (^java.util.Date []
   (java.util.Date.))
  (^java.util.Date [date]
   (java.util.Date. (.getTime (->Timestamp date)))))


(defn ->Calendar
  "Coerce DATE to a `java.util.Calendar`."
  (^java.util.Calendar []
   (doto (Calendar/getInstance)
     (.setTimeZone (TimeZone/getTimeZone "UTC"))))
  (^java.util.Calendar [date]
   (doto (->Calendar)
     (.setTime (->Timestamp date))))
  (^java.util.Calendar [date, ^String timezone-id]
   (doto (->Calendar date)
     (.setTimeZone (TimeZone/getTimeZone timezone-id)))))


(defn relative-date
  "Return a new `Timestamp` relative to the current time using a relative date UNIT.

     (relative-date :year -1) -> #inst 2014-11-12 ..."
  (^java.sql.Timestamp [unit amount]
   (relative-date unit amount (Calendar/getInstance)))
  (^java.sql.Timestamp [unit amount date]
   (let [cal               (->Calendar date)
         [unit multiplier] (case unit
                             :second  [Calendar/SECOND 1]
                             :minute  [Calendar/MINUTE 1]
                             :hour    [Calendar/HOUR   1]
                             :day     [Calendar/DATE   1]
                             :week    [Calendar/DATE   7]
                             :month   [Calendar/MONTH  1]
                             :quarter [Calendar/MONTH  3]
                             :year    [Calendar/YEAR   1])]
     (.set cal unit (+ (.get cal unit)
                       (* amount multiplier)))
     (->Timestamp cal))))


(def ^:private ^:const date-extract-units
  #{:minute-of-hour :hour-of-day :day-of-week :day-of-month :day-of-year :week-of-year :month-of-year :quarter-of-year :year})

(defn date-extract
  "Extract UNIT from DATE. DATE defaults to now.

     (date-extract :year) -> 2015"
  ([unit]
   (date-extract unit (System/currentTimeMillis) "UTC"))
  ([unit date]
   (date-extract unit date "UTC"))
  ([unit date timezone-id]
   (let [cal (->Calendar date timezone-id)]
     (case unit
       :minute-of-hour  (.get cal Calendar/MINUTE)
       :hour-of-day     (.get cal Calendar/HOUR_OF_DAY)
       ;; 1 = Sunday <-> 6 = Saturday
       :day-of-week     (.get cal Calendar/DAY_OF_WEEK)
       :day-of-month    (.get cal Calendar/DAY_OF_MONTH)
       :day-of-year     (.get cal Calendar/DAY_OF_YEAR)
       ;; 1 = First week of year
       :week-of-year    (.get cal Calendar/WEEK_OF_YEAR)
       :month-of-year   (inc (.get cal Calendar/MONTH))
       :quarter-of-year (let [month (date-extract :month-of-year date timezone-id)]
                          (int (/ (+ 2 month)
                                  3)))
       :year            (.get cal Calendar/YEAR)))))


(def ^:private ^:const date-trunc-units
  #{:minute :hour :day :week :month :quarter :year})

(defn- trunc-with-format [format-string date timezone-id]
  (->Timestamp (format-date (time/with-zone (time/formatter format-string)
                              (t/time-zone-for-id timezone-id))
                            date)))

(defn- trunc-with-floor [date amount-ms]
  (->Timestamp (* (math/floor (/ (.getTime (->Timestamp date))
                                 amount-ms))
                  amount-ms)))

(defn- ->first-day-of-week [date timezone-id]
  (let [day-of-week (date-extract :day-of-week date timezone-id)]
    (relative-date :day (- (dec day-of-week)) date)))

(defn- format-string-for-quarter ^String [date timezone-id]
  (let [year    (date-extract :year date timezone-id)
        quarter (date-extract :quarter-of-year date timezone-id)
        month   (- (* 3 quarter) 2)]
    (format "%d-%02d-01ZZ" year month)))

(defn date-trunc
  "Truncate DATE to UNIT. DATE defaults to now.

     (date-trunc :month).
     ;; -> #inst \"2015-11-01T00:00:00\""
  (^java.sql.Timestamp [unit]
   (date-trunc unit (System/currentTimeMillis) "UTC"))
  (^java.sql.Timestamp [unit date]
   (date-trunc unit date "UTC"))
  (^java.sql.Timestamp [unit date timezone-id]
   (case unit
     ;; For minute and hour truncation timezone should not be taken into account
     :minute  (trunc-with-floor date (* 60 1000))
     :hour    (trunc-with-floor date (* 60 60 1000))
     :day     (trunc-with-format "yyyy-MM-ddZZ" date timezone-id)
     :week    (trunc-with-format "yyyy-MM-ddZZ" (->first-day-of-week date timezone-id) timezone-id)
     :month   (trunc-with-format "yyyy-MM-01ZZ" date timezone-id)
     :quarter (trunc-with-format (format-string-for-quarter date timezone-id) date timezone-id)
     :year    (trunc-with-format "yyyy-01-01ZZ" date timezone-id))))


(defn date-trunc-or-extract
  "Apply date bucketing with UNIT to DATE. DATE defaults to now."
  ([unit]
   (date-trunc-or-extract unit (System/currentTimeMillis) "UTC"))
  ([unit date]
   (date-trunc-or-extract unit date "UTC"))
  ([unit date timezone-id]
   (cond
     (= unit :default) date

     (contains? date-extract-units unit)
     (date-extract unit date timezone-id)

     (contains? date-trunc-units unit)
     (date-trunc unit date timezone-id))))

(defn format-nanoseconds
  "Format a time interval in nanoseconds to something more readable (µs/ms/etc.)
   Useful for logging elapsed time when using `(System/nanotime)`"
  ^String [nanoseconds]
  (loop [n nanoseconds, [[unit divisor] & more] [[:ns 1000] [:µs 1000] [:ms 1000] [:s 60] [:mins 60] [:hours Integer/MAX_VALUE]]]
    (if (and (> n divisor)
             (seq more))
      (recur (/ n divisor) more)
      (format "%.0f %s" (double n) (name unit)))))


;;; ## Etc

(defprotocol ^:private IClobToStr
  (jdbc-clob->str ^String [this]
   "Convert a Postgres/H2/SQLServer JDBC Clob to a string. (If object isn't a Clob, this function returns it as-is.)"))

(extend-protocol IClobToStr
  nil     (jdbc-clob->str [_]    nil)
  Object  (jdbc-clob->str [this] this)

  org.postgresql.util.PGobject
  (jdbc-clob->str [this] (.getValue this))

  ;; H2 + SQLServer clobs both have methods called `.getCharacterStream` that officially return a `Reader`,
  ;; but in practice I've only seen them return a `BufferedReader`. Just to be safe include a method to convert
  ;; a plain `Reader` to a `BufferedReader` so we don't get caught with our pants down
  java.io.Reader
  (jdbc-clob->str [this]
    (jdbc-clob->str (java.io.BufferedReader. this)))

  ;; Read all the lines for the `BufferedReader` and combine into a single `String`
  java.io.BufferedReader
  (jdbc-clob->str [this]
    (with-open [_ this]
      (loop [acc []]
        (if-let [line (.readLine this)]
          (recur (conj acc line))
          (s/join "\n" acc)))))

  ;; H2 -- See also http://h2database.com/javadoc/org/h2/jdbc/JdbcClob.html
  org.h2.jdbc.JdbcClob
  (jdbc-clob->str [this]
    (jdbc-clob->str (.getCharacterStream this)))

  ;; SQL Server -- See also http://jtds.sourceforge.net/doc/net/sourceforge/jtds/jdbc/ClobImpl.html
  net.sourceforge.jtds.jdbc.ClobImpl
  (jdbc-clob->str [this]
    (jdbc-clob->str (.getCharacterStream this))))


(defn optional
  "Helper function for defining functions that accept optional arguments.
   If PRED? is true of the first item in ARGS, a pair like `[first-arg other-args]`
   is returned; otherwise, a pair like `[DEFAULT other-args]` is returned.

   If DEFAULT is not specified, `nil` will be returned when PRED? is false.

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


;; TODO - rename to `email?`
(defn is-email?
  "Is STRING a valid email address?"
  ^Boolean [^String s]
  (boolean (when (string? s)
             (re-matches #"[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
                         (s/lower-case s)))))

;; TODO - rename to `url?`
(defn is-url?
  "Is STRING a valid HTTP/HTTPS URL? (This only handles `localhost` and domains like `metabase.com`; URLs containing IP addresses will return `false`.)"
  ^Boolean [^String s]
  (boolean (when (seq s)
             (when-let [^java.net.URL url (ignore-exceptions (java.net.URL. s))]
               ;; these are both automatically downcased
               (let [protocol (.getProtocol url)
                     host     (.getHost url)]
                 (and protocol
                      host
                      (re-matches #"^https?$" protocol)
                      (or (re-matches #"^.+\..{2,}$" host) ; 2+ letter TLD
                          (= host "localhost"))))))))

(defn sequence-of-maps?
  "Is COLL a sequence of maps?"
  [coll]
  (and (sequential? coll)
       (every? map? coll)))

(defn maybe?
  "Returns `true` if X is `nil`, otherwise calls (F X).
   This can be used to see something is either `nil` or statisfies a predicate function:

     (string? nil)          -> false
     (string? \"A\")        -> true
     (maybe? string? nil)   -> true
     (maybe? string? \"A\") -> true

   It can also be used to make sure a given function won't throw a `NullPointerException`:

     (s/lower-case nil)            -> NullPointerException
     (s/lower-case \"ABC\")        -> \"abc\"
     (maybe? s/lower-case nil)     -> true
     (maybe? s/lower-case \"ABC\") -> \"abc\"

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

(defn rpartial
  "Like `partial`, but applies additional args *before* BOUND-ARGS.
   Inspired by [`-rpartial` from dash.el](https://github.com/magnars/dash.el#-rpartial-fn-rest-args)

    ((partial - 5) 8)  -> (- 5 8) -> -3
    ((rpartial - 5) 8) -> (- 8 5) -> 3"
  [f & bound-args]
  (fn [& args]
    (apply f (concat args bound-args))))

(defmacro pdoseq
  "(Almost) just like `doseq` but runs in parallel. Doesn't support advanced binding forms like `:let` or `:when` and only supports a single binding </3"
  {:style/indent 1}
  [[binding collection] & body]
  `(dorun (pmap (fn [~binding]
                  ~@body)
                ~collection)))

(defn first-index-satisfying
  "Return the index of the first item in COLL where `(pred item)` is logically `true`.

     (first-index-satisfying keyword? ['a 'b :c 3 \"e\"]) -> 2"
  {:style/indent 1}
  [pred coll]
  (loop [i 0, [item & more] coll]
    (cond
      (pred item) i
      (seq more)  (recur (inc i) more))))

(defmacro prog1
  "Execute FIRST-FORM, then any other expressions in BODY, presumably for side-effects; return the result of FIRST-FORM.

     (def numbers (atom []))

     (defn find-or-add [n]
       (or (first-index-satisfying (partial = n) @numbers)
           (prog1 (count @numbers)
             (swap! numbers conj n))))

     (find-or-add 100) -> 0
     (find-or-add 200) -> 1
     (find-or-add 100) -> 0

   The result of FIRST-FORM is bound to the anaphor `<>`, which is convenient for logging:

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
  "Returns the EMOJI-STRING passed in if emoji in logs are enabled, otherwise always returns an empty string."
  (if (config/config-bool :mb-emoji-in-logs)
    identity
    (constantly "")))

(def ^String ^{:style/indent 2, :arglists '([color-symb x] [color-symb format-str & args])}
  format-color
  "Like `format`, but uses a function in `colorize.core` to colorize the output.
   COLOR-SYMB should be a quoted symbol like `green`, `red`, `yellow`, `blue`,
   `cyan`, `magenta`, etc. See the entire list of avaliable colors
   [here](https://github.com/ibdknox/colorize/blob/master/src/colorize/core.clj).

     (format-color 'red \"Fatal error: %s\" error-message)"
  (if (config/config-bool :mb-colorize-logs)
    (fn
      ([color-symb x]
       {:pre [(symbol? color-symb)]}
       ((ns-resolve 'colorize.core color-symb) x))
      ([color-symb format-string & args]
       (format-color color-symb (apply format format-string args))))
    (fn
      ([_ x] x)
      ([_ format-string & args] (apply format format-string args)))))

(defn pprint-to-str
  "Returns the output of pretty-printing X as a string.
   Optionally accepts COLOR-SYMB, which colorizes the output with the corresponding
   function from `colorize.core`.

     (pprint-to-str 'green some-obj)"
  ([x]
   (when x
     (with-out-str (pprint x))))
  ([color-symb x]
   ((ns-resolve 'colorize.core color-symb) (pprint-to-str x))))

(def emoji-progress-bar
  "Create a string that shows progress for something, e.g. a database sync process.

     (emoji-progress-bar 10 40)
       -> \"[************······································] 😒   25%"
  (let [^:const meter-width    50
        ^:const progress-emoji ["😱"  ; face screaming in fear
                                "😢"  ; crying face
                                "😞"  ; disappointed face
                                "😒"  ; unamused face
                                "😕"  ; confused face
                                "😐"  ; neutral face
                                "😬"  ; grimacing face
                                "😌"  ; relieved face
                                "😏"  ; smirking face
                                "😋"  ; face savouring delicious food
                                "😊"  ; smiling face with smiling eyes
                                "😍"  ; smiling face with heart shaped eyes
                                "😎"] ; smiling face with sunglasses
        percent-done->emoji    (fn [percent-done]
                                 (progress-emoji (int (math/round (* percent-done (dec (count progress-emoji)))))))]
    (fn [completed total]
      (let [percent-done (float (/ completed total))
            filleds      (int (* percent-done meter-width))
            blanks       (- meter-width filleds)]
        (str "["
             (s/join (repeat filleds "*"))
             (s/join (repeat blanks "·"))
             (format "] %s  %3.0f%%" (emoji (percent-done->emoji percent-done)) (* percent-done 100.0)))))))

(defn filtered-stacktrace
  "Get the stack trace associated with E and return it as a vector with non-metabase frames filtered out."
  [^Throwable e]
  (when e
    (when-let [stacktrace (.getStackTrace e)]
      (vec (for [frame stacktrace
                 :let  [s (str frame)]
                 :when (re-find #"metabase" s)]
             (s/replace s #"^metabase\." ""))))))

(defn wrap-try-catch
  "Returns a new function that wraps F in a `try-catch`. When an exception is caught, it is logged
   with `log/error` and returns `nil`."
  ([f]
   (wrap-try-catch f nil))
  ([f f-name]
   (let [exception-message (if f-name
                             (format "Caught exception in %s: " f-name)
                             "Caught exception: ")]
     (fn [& args]
       (try
         (apply f args)
         (catch SQLException e
           (log/error (format-color 'red "%s\n%s\n%s"
                                    exception-message
                                    (with-out-str (jdbc/print-sql-exception-chain e))
                                    (pprint-to-str (filtered-stacktrace e)))))
         (catch Throwable e
           (log/error (format-color 'red "%s %s\n%s"
                                    exception-message
                                    (or (.getMessage e) e)
                                    (pprint-to-str (filtered-stacktrace e))))))))))

(defn try-apply
  "Like `apply`, but wraps F inside a `try-catch` block and logs exceptions caught.
   (This is actaully more flexible than `apply` -- the last argument doesn't have to be
   a sequence:

     (try-apply vector :a :b [:c :d]) -> [:a :b :c :d]
     (apply vector :a :b [:c :d])     -> [:a :b :c :d]
     (try-apply vector :a :b :c :d)   -> [:a :b :c :d]
     (apply vector :a :b :c :d)       -> Not ok - :d is not a sequence

   This allows us to use `try-apply` in more situations than we'd otherwise be able to."
  [^clojure.lang.IFn f & args]
  (apply (wrap-try-catch f) (concat (butlast args) (if (sequential? (last args))
                                                     (last args)
                                                     [(last args)]))))

(defn deref-with-timeout
  "Call `deref` on a FUTURE and throw an exception if it takes more than TIMEOUT-MS."
  [futur timeout-ms]
  (let [result (deref futur timeout-ms ::timeout)]
    (when (= result ::timeout)
      (throw (Exception. (format "Timed out after %d milliseconds." timeout-ms))))
    result))

(defmacro with-timeout
  "Run BODY in a `future` and throw an exception if it fails to complete after TIMEOUT-MS."
  [timeout-ms & body]
  `(deref-with-timeout (future ~@body) ~timeout-ms))

(defn round-to-decimals
  "Round (presumabily floating-point) NUMBER to DECIMAL-PLACE. Returns a `Double`.

     (round-to-decimals 2 35.5058998M) -> 35.51"
  ^Double [^Integer decimal-place, ^Number number]
  {:pre [(integer? decimal-place) (number? number)]}
  (double (.setScale (bigdec number) decimal-place BigDecimal/ROUND_HALF_UP)))

(defn drop-first-arg
  "Returns a new fn that drops its first arg and applies the rest to the original.
   Useful for creating `extend` method maps when you don't care about the `this` param. :flushed:

     ((drop-first-arg :value) xyz {:value 100}) -> (apply :value [{:value 100}]) -> 100"
  ^clojure.lang.IFn [^clojure.lang.IFn f]
  (comp (partial apply f) rest list))


(defn- check-protocol-impl-method-map
  "Check that the methods expected for PROTOCOL are all implemented by METHOD-MAP, and that no extra methods are provided.
   Used internally by `strict-extend`."
  [protocol method-map]
  (let [[missing-methods extra-methods] (data/diff (set (keys (:method-map protocol))) (set (keys method-map)))]
    (when missing-methods
      (throw (Exception. (format "Missing implementations for methods in %s: %s" (:var protocol) missing-methods))))
    (when extra-methods
      (throw (Exception. (format "Methods implemented that are not in %s: %s " (:var protocol) extra-methods))))))

(defn strict-extend
  "A strict version of `extend` that throws an exception if any methods declared in the protocol are missing or any methods not
   declared in the protocol are provided.
   Since this has better compile-time error-checking, prefer `strict-extend` to regular `extend` in all situations, and to
   `extend-protocol`/ `extend-type` going forward." ; TODO - maybe implement strict-extend-protocol and strict-extend-type ?
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
    (s/replace
     ;; First, "decompose" the characters. e.g. replace 'LATIN CAPITAL LETTER A WITH ACUTE' with 'LATIN CAPITAL LETTER A' + 'COMBINING ACUTE ACCENT'
     ;; See http://docs.oracle.com/javase/8/docs/api/java/text/Normalizer.html
     (Normalizer/normalize s Normalizer$Form/NFD)
     ;; next, remove the combining diacritical marks -- this SO answer explains what's going on here best: http://stackoverflow.com/a/5697575/1198455
     ;; The closest thing to a relevant JavaDoc I could find was http://docs.oracle.com/javase/7/docs/api/java/lang/Character.UnicodeBlock.html#COMBINING_DIACRITICAL_MARKS
     #"\p{Block=CombiningDiacriticalMarks}+"
     "")))


(def ^:private ^:const slugify-valid-chars
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
  "Return a version of `String` S appropriate for use as a URL slug.
   Downcase the name, remove diacritcal marks, and replace non-alphanumeric *ASCII* characters with underscores;
   URL-encode non-ASCII characters. (Non-ASCII characters are encoded rather than replaced with underscores in order
   to support languages that don't use the Latin alphabet; see issue #3818).

   Optionally specify MAX-LENGTH which will truncate the slug after that many characters."
  (^String [^String s]
   (when (seq s)
     (s/join (for [c (remove-diacritical-marks (s/lower-case s))]
               (slugify-char c)))))
  (^String [s max-length]
   (s/join (take max-length (slugify s)))))

(defn do-with-auto-retries
  "Execute F, a function that takes no arguments, and return the results.
   If F fails with an exception, retry F up to NUM-RETRIES times until it succeeds.

   Consider using the `auto-retry` macro instead of calling this function directly."
  {:style/indent 1}
  [num-retries f]
  (if (<= num-retries 0)
    (f)
    (try (f)
         (catch Throwable e
           (log/warn (format-color 'red "auto-retry %s: %s" f (.getMessage e)))
           (do-with-auto-retries (dec num-retries) f)))))

(defmacro auto-retry
  "Execute BODY and return the results.
   If BODY fails with an exception, retry execution up to NUM-RETRIES times until it succeeds."
  {:style/indent 1}
  [num-retries & body]
  `(do-with-auto-retries ~num-retries
     (fn [] ~@body)))

(defn string-or-keyword?
  "Is X a `String` or a `Keyword`?"
  [x]
  (or (string? x)
      (keyword? x)))

(defn key-by
  "Convert a sequential COLL to a map of `(f item)` -> `item`.
   This is similar to `group-by`, but the resultant map's values are single items from COLL rather than sequences of items.
   (Because only a single item is kept for each value of `f`,  items producing duplicate values will be discarded).

     (key-by :id [{:id 1, :name :a} {:id 2, :name :b}]) -> {1 {:id 1, :name :a}, 2 {:id 2, :name :b}}"
  {:style/indent 1}
  [f coll]
  (into {} (for [item coll]
             {(f item) item})))

(defn keyword->qualified-name
  "Return keyword K as a string, including its namespace, if any (unlike `name`).

     (keyword->qualified-name :type/FK) ->  \"type/FK\""
  [k]
  (when k
    (s/replace (str k) #"^:" "")))

(defn get-id
  "Return the value of `:id` if OBJECT-OR-ID is a map, or otherwise return OBJECT-OR-ID as-is if it is an integer.
   This is guaranteed to return an integer ID; it will throw an Exception if it cannot find one.
   This is provided as a convenience to allow model-layer functions to easily accept either an object or raw ID."
  ;; TODO - lots of functions can be rewritten to use this, which would make them more flexible
  ^Integer [object-or-id]
  (cond
    (map? object-or-id)     (recur (:id object-or-id))
    (integer? object-or-id) object-or-id
    :else                   (throw (Exception. (str "Not something with an ID: " object-or-id)))))

(defmacro profile
  "Like `clojure.core/time`, but lets you specify a MESSAGE that gets printed with the total time,
   and formats the time nicely using `format-nanoseconds`."
  {:style/indent 1}
  ([form]
   `(profile ~(str form) ~form))
  ([message & body]
   `(let [start-time# (System/nanoTime)]
      (prog1 (do ~@body)
        (println (format-color '~'green "%s took %s" ~message (format-nanoseconds (- (System/nanoTime) start-time#))))))))

(def metabase-namespace-symbols
  "Delay to a vector of symbols of all Metabase namespaces, excluding test namespaces.
   This is intended for use by various routines that load related namespaces, such as task and events initialization.
   Using `ns-find/find-namespaces` is fairly slow, and can take as much as half a second to iterate over the thousand or so
   namespaces that are part of the Metabase project; use this instead for a massive performance increase."
  ;; Actually we can go ahead and start doing this in the background once the app launches while other stuff is loading, so use a future here
  ;; This would be faster when running the *JAR* if we just did it at compile-time and made it ^:const, but that would inhibit the "plugin system"
  ;; from loading "plugin" namespaces at launch if they're on the classpath
  (future (vec (for [ns-symb (ns-find/find-namespaces (classpath/classpath))
                     :when   (and (.startsWith (name ns-symb) "metabase.")
                                  (not (.contains (name ns-symb) "test")))]
                 ns-symb))))

(def ^:const ^java.util.regex.Pattern uuid-regex
  "A regular expression for matching canonical string representations of UUIDs."
  #"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")


(defn select-nested-keys
  "Like `select-keys`, but can also handle nested keypaths:

     (select-nested-keys {:a 100, :b {:c 200, :d 300}} [:a [:b :d] :c])
     ;; -> {:a 100, :b {:d 300}}

   The values of KEYSEQ can be either regular keys, which work the same way as `select-keys`,
   or vectors of the form `[k & nested-keys]`, which call `select-nested-keys` recursively
   on the value of `k`. "
  [m keyseq]
  ;; TODO - use (empty m) once supported by model instances
  (into {} (for [k     keyseq
                 :let  [[k & nested-keys] (if (sequential? k) k [k])
                        v                 (get m k)]
                 :when (contains? m k)]
             {k (if-not (seq nested-keys)
                  v
                  (select-nested-keys v nested-keys))})))

(defn base-64-string?
  "Is S a Base-64 encoded string?"
  ^Boolean [s]
  (boolean (when (string? s)
             (re-find #"^[0-9A-Za-z/+]+=*$" s))))
