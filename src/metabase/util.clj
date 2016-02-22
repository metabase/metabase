(ns metabase.util
  "Common utility functions useful throughout the codebase."
  (:require [clojure.java.jdbc :as jdbc]
            (clojure [pprint :refer [pprint]]
                     [string :as s])
            [clojure.tools.logging :as log]
            [clj-time.coerce :as coerce]
            [clj-time.format :as time]
            [colorize.core :as color]
            [metabase.config :as config])
  (:import clojure.lang.Keyword
           (java.net Socket
                     InetSocketAddress
                     InetAddress)
           java.sql.Timestamp
           (java.util Calendar TimeZone)
           javax.xml.bind.DatatypeConverter
           org.joda.time.format.DateTimeFormatter))

;; Set the default width for pprinting to 240 instead of 72. The default width is too narrow and wastes a lot of space for pprinting huge things like expanded queries
(intern 'clojure.pprint '*print-right-margin* 240)

(declare pprint-to-str)

;;; ### Protocols

(defprotocol ITimestampCoercible
  "Coerce object to a `java.sql.Timestamp`."
  (->Timestamp ^java.sql.Timestamp [this]
    "Coerce this object to a `java.sql.Timestamp`.
     Strings are parsed as ISO-8601."))

(extend-protocol ITimestampCoercible
  nil            (->Timestamp [_]
                   nil)
  Timestamp      (->Timestamp [this]
                   this)
  java.util.Date (->Timestamp [this]
                   (Timestamp. (.getTime this)))
  ;; Number is assumed to be a UNIX timezone in milliseconds (UTC)
  Number         (->Timestamp [this]
                   (Timestamp. this))
  Calendar       (->Timestamp [this]
                   (->Timestamp (.getTime this)))
  ;; Strings are expected to be in ISO-8601 format. `YYYY-MM-DD` strings *are* valid ISO-8601 dates.
  String         (->Timestamp [this]
                   (->Timestamp (DatatypeConverter/parseDateTime this))))


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


;;; ## Date Stuff

(defn new-sql-timestamp
  "`java.sql.Date` doesn't have an empty constructor so this is a convenience that lets you make one with the current date.
   (Some DBs like Postgres will get snippy if you don't use a `java.sql.Timestamp`)."
  ^java.sql.Timestamp []
  (->Timestamp (System/currentTimeMillis)))

(defn format-date
  "Format DATE using a given DATE-FORMAT.

   DATE is anything that can coerced to a `Timestamp` via `->Timestamp`, such as a `Date`, `Timestamp`,
   `Long` (ms since the epoch), or an ISO-8601 `String`. DATE defaults to the current moment in time.

   DATE-FORMAT is anything that can be passed to `->DateTimeFormatter`, such as `String`, `Keyword`, or `DateTimeFormatter`.


     (format-date \"yyyy-MM-dd\")                        -> \"2015-11-18\"
     (format-date :year (java.util.Date.))               -> \"2015\"
     (format-date :date-time (System/currentTimeMillis)) -> \"2015-11-18T23:55:03.841Z\""
  (^String [date-format]
   (format-date date-format (System/currentTimeMillis)))
  (^String [date-format date]
   (time/unparse (->DateTimeFormatter date-format) (coerce/from-long (.getTime (->Timestamp date))))))

(def ^{:arglists '([] [date])} date->yyyy-mm-dd
  "Format DATE as a `YYYY-MM-DD` string."
  (partial format-date "yyyy-MM-dd"))

(def ^{:arglists '([] [date])} date->iso-8601
  "Format DATE a an ISO-8601 string."
  (partial format-date :date-time))

(defn date-string?
  "Is S a valid ISO 8601 date string?"
  [^String s]
  (boolean (when (string? s)
             (try (->Timestamp s)
                  (catch Throwable e)))))

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
     (.setTime (->Timestamp date)))))

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
   (date-extract unit (System/currentTimeMillis)))
  ([unit date]
   (let [cal (->Calendar date)]
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
       :quarter-of-year (let [month (date-extract :month-of-year date)]
                          (int (/ (+ 2 month)
                                  3)))
       :year            (.get cal Calendar/YEAR)))))


(def ^:private ^:const date-trunc-units
  #{:minute :hour :day :week :month :quarter})

(defn date-trunc
  "Truncate DATE to UNIT. DATE defaults to now.

     (date-trunc :month).
     ;; -> #inst \"2015-11-01T00:00:00\""
  (^java.sql.Timestamp [unit]
   (date-trunc unit (System/currentTimeMillis)))
  (^java.sql.Timestamp [unit date]
   (let [trunc-with-format (fn trunc-with-format
                             ([format-string]
                              (trunc-with-format format-string date))
                             ([format-string d]
                              (->Timestamp (format-date format-string d))))]
     (case unit
       :minute  (trunc-with-format "yyyy-MM-dd'T'HH:mm:00+00:00")
       :hour    (trunc-with-format "yyyy-MM-dd'T'HH:00:00+00:00")
       :day     (trunc-with-format "yyyy-MM-dd+00:00")
       :week    (let [day-of-week (date-extract :day-of-week date)
                      date        (relative-date :day (- (dec day-of-week)) date)]
                  (trunc-with-format "yyyy-MM-dd+00:00" date))
       :month   (trunc-with-format "yyyy-MM-01+00:00")
       :quarter (let [year    (date-extract :year date)
                      quarter (date-extract :quarter-of-year date)]
                  (->Timestamp (format "%d-%02d-01+00:00" year (- (* 3 quarter)
                                                                  2))))))))

(defn date-trunc-or-extract
  "Apply date bucketing with UNIT to DATE. DATE defaults to now."
  ([unit]
   (date-trunc-or-extract unit (System/currentTimeMillis)))
  ([unit date]
   (cond
     (= unit :default) date

     (contains? date-extract-units unit)
     (date-extract unit date)

     (contains? date-trunc-units unit)
     (date-trunc unit date))))

(defn format-nanoseconds
  "Format a time interval in nanoseconds to something more readable (µs/ms/etc.)
   Useful for logging elapsed time when using `(System/nanotime)`"
  [nanoseconds]
  (loop [n nanoseconds, [[unit divisor] & more] [[:ns 1000] [:µs 1000] [:ms 1000] [:s 1000] [:mins 60] [:hours 60]]]
    (if (and (> n divisor)
             (seq more))
      (recur (/ n divisor) more)
      (format "%.0f %s" (double n) (name unit)))))


;;; ## Etc

(defmacro assoc<>
  "Like `assoc`, but associations happen sequentially; i.e. each successive binding can build
   upon the result of the previous one using `<>`.

    (assoc<> {}
       :a 100
       :b (+ 100 (:a <>)) ; -> {:a 100 :b 200}"
  {:style/indent 1}
  [object & kvs]
  ;; wrap in a `fn` so this can be used in `->`/`->>` forms
  `((fn [~'<>]
      (let [~@(apply concat (for [[k v] (partition 2 kvs)]
                              ['<> `(assoc ~'<> ~k ~v)]))]
        ~'<>))
    ~object))

(defn format-num
  "format a number into a more human readable form."
  [number]
  {:pre [(number? number)]}
  (let [decimal-type? #(or (float? %) (decimal? %))]
    (cond
      ;; looks like this is a decimal number, format with precision of 2
      (and (decimal-type? number) (not (zero? (mod number 1)))) (format "%,.2f" number)
      ;; this is a decimal type number with no actual decimal value, so treat it as a whole number
      (decimal-type? number) (format "%,d" (long number))
      ;; otherwise this is a whole number
      :else (format "%,d" number))))

(defprotocol ^:private IClobToStr
  (jdbc-clob->str ^String [this]
   "Convert a Postgres/H2/SQLServer JDBC Clob to a string."))

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
          (apply str (interpose "\n" acc))))))

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

;; provided courtesy of Jay Fields http://blog.jayfields.com/2011/08/clojure-apply-function-to-each-value-of.html
(defn update-values
  "Update the values of a map by applying the given function.
   Function expects the map value as an arg and optionally accepts additional args as passed."
  [m f & args]
  (reduce (fn [r [k v]] (assoc r k (apply f v args))) {} m))

(defn is-email?
  "Is STRING a valid email address?"
  [string]
  (boolean (when string
             (re-matches #"[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
                         (s/lower-case string)))))

(defn is-url?
  "Is STRING a valid HTTP/HTTPS URL?"
  [^String string]
  (boolean (when string
             (when-let [^java.net.URL url (try (java.net.URL. string)
                                               (catch java.net.MalformedURLException _
                                                 nil))]
               (and (re-matches #"^https?$" (.getProtocol url))          ; these are both automatically downcased
                    (re-matches #"^.+\..{2,}$" (.getAuthority url))))))) ; this is the part like 'google.com'. Make sure it contains at least one period and 2+ letter TLD

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
    (catch Exception _ false)))

(defn host-up?
  "Returns true if the host given by hostname is reachable, false otherwise "
  [^String hostname]
  (try
    (let [host-addr (InetAddress/getByName hostname)]
      (.isReachable host-addr host-up-timeout))
    (catch Exception _ false)))

(defn rpartial
  "Like `partial`, but applies additional args *before* BOUND-ARGS.
   Inspired by [`-rpartial` from dash.el](https://github.com/magnars/dash.el#-rpartial-fn-rest-args)

    ((partial - 5) 8)  -> (- 5 8) -> -3
    ((rpartial - 5) 8) -> (- 8 5) -> 3"
  [f & bound-args]
  (fn [& args]
    (apply f (concat args bound-args))))

(defn require-dox-in-this-namespace
  "Throw an exception if any public interned symbol in this namespace is missing a docstring."
  []
  (when-not config/is-prod?
    (doseq [[symb varr] (ns-publics *ns*)
            :when       (not (:doc (meta varr)))]
      (throw (Exception. (format "All public symbols in %s are required to have a docstring, but %s is missing one." (.getName *ns*) symb))))))

(defmacro pdoseq
  "(Almost) just like `doseq` but runs in parallel. Doesn't support advanced binding forms like `:let` or `:when` and only supports a single binding </3"
  [[binding collection] & body]
  {:style/indent 1}
  `(dorun (pmap (fn [~binding]
                  ~@body)
                ~collection)))

(defn first-index-satisfying
  "Return the index of the first item in COLL where `(pred item)` is logically `true`.

     (first-index-satisfying keyword? ['a 'b :c 3 \"e\"]) -> 2"
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

   The result of FIRST-FIRST is bound to the anaphor `<>`, which is convenient for logging:

     (prog1 (some-expression)
       (println \"RESULTS:\" <>))

  `prog1` is an anaphoric version of the traditional macro of the same name in
   [Emacs Lisp](http://www.gnu.org/software/emacs/manual/html_node/elisp/Sequencing.html#index-prog1)
   and [Common Lisp](http://www.lispworks.com/documentation/HyperSpec/Body/m_prog1c.htm#prog1)."
  {:style/indent 1}
  [first-form & body]
  `(let [~'<> ~first-form]
     ~@body
     ~'<>))

(def ^String ^{:style/indent 2} format-color
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

(defmacro cond-let
  "Like `if-let` or `when-let`, but for `cond`."
  [binding-form then-form & more]
  `(if-let ~binding-form ~then-form
           ~(when (seq more)
              `(cond-let ~@more))))

(defn filtered-stacktrace
  "Get the stack trace associated with E and return it as a vector with non-metabase frames filtered out."
  [^Throwable e]
  (when e
    (when-let [stacktrace (.getStackTrace e)]
      (vec (for [frame (.getStackTrace e)
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
         (catch java.sql.SQLException e
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

(defmacro try-ignore-exceptions
  "Simple macro which wraps the given expression in a try/catch block and ignores the exception if caught."
  [& body]
  `(try ~@body (catch Throwable ~'_)))


(defn wrap-try-catch!
  "Re-intern FN-SYMB as a new fn that wraps the original with a `try-catch`. Intended for debugging.

     (defn z [] (throw (Exception. \"!\")))
     (z) ; -> exception

     (wrap-try-catch! 'z)
     (z) ; -> nil; exception logged with log/error"
  [fn-symb]
  {:pre [(symbol? fn-symb)
         (fn? @(resolve fn-symb))]}
  (let [varr                    (resolve fn-symb)
        {nmspc :ns, symb :name} (meta varr)]
    (println (format "wrap-try-catch! %s/%s" nmspc symb))
    (intern nmspc symb (wrap-try-catch @varr fn-symb))))

(defn ns-wrap-try-catch!
  "Re-intern all functions in NAMESPACE as ones that wrap the originals with a `try-catch`.
   Defaults to the current namespace. You may optionally exclude a set of symbols using the kwarg `:exclude`.

     (ns-wrap-try-catch!)
     (ns-wrap-try-catch! 'metabase.driver)
     (ns-wrap-try-catch! 'metabase.driver :exclude 'query-complete)

   Intended for debugging."
  {:arglists '([namespace? :exclude & excluded-symbs])}
  [& args]
  (let [[nmspc args] (optional #(try-apply the-ns [%]) args *ns*)
        excluded     (when (= (first args) :exclude)
                       (set (rest args)))]
    (doseq [[symb varr] (ns-interns nmspc)]
      (when (fn? @varr)
        (when-not (contains? excluded symb)
          (wrap-try-catch! (symbol (str (ns-name nmspc) \/ symb))))))))

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

(defmacro cond-as->
  "Anaphoric version of `cond->`. Binds EXPR to NAME through a series
   of pairs of TEST and FORM. NAME is successively bound to the value
   of each FORM whose TEST succeeds.

     (defn maybe-wrap-fn [before after f]
       (as-> f <>
         (fn? before) (fn [] (before) (<>))
         (fn? after)  (fn [] (try (<>)
                                  (finally (after))))))"
  {:arglists '([expr nm tst form & more])}
  [expr nm & clauses]
  {:pre [(even? (count clauses))]}
  `(let [~nm ~expr
         ~@(apply concat (for [[tst form] (partition 2 clauses)]
                           [nm `(if ~tst
                                  ~form
                                  ~nm)]))]
     ~nm))

(defn round-to-decimals
  "Round (presumabily floating-point) NUMBER to DECIMAL-PLACE. Returns a `Double`.

     (round-to-decimals 2 35.5058998M) -> 35.51"
  ^Double [^Integer decimal-place, ^Number number]
  {:pre [(integer? decimal-place) (number? number)]}
  (double (.setScale (bigdec number) decimal-place BigDecimal/ROUND_HALF_UP)))

(defn drop-first-arg
  "Returns a new fn that drops its first arg and applies the rest to the original.
   Useful for creating `extend` method maps when you don't care about the `this` param.

     ((drop-first-arg :value) xyz {:value 100}) -> (apply :value [{:value 100}]) -> 100"
  ^clojure.lang.IFn [^clojure.lang.IFn f]
  (comp (partial apply f) rest list))


(require-dox-in-this-namespace)
