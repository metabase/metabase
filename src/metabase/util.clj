(ns metabase.util
  "Common utility functions useful throughout the codebase."
  (:require [clojure.math.numeric-tower :as math]
            [clojure.pprint :refer [pprint]]
            [clojure.tools.logging :as log]
            [colorize.core :as color]
            [medley.core :as m]
            [clj-time.format :as time]
            [clj-time.coerce :as coerce])
  (:import (java.net Socket
                     InetSocketAddress
                     InetAddress)
           java.text.SimpleDateFormat
           (java.util Calendar
                      Date)
           javax.xml.bind.DatatypeConverter))

(defmacro -assoc*
  "Internal. Don't use this directly; use `assoc*` instead."
  [k v & more]
 `(let [~'<> (assoc ~'<> ~k ~v)]
    ~(if (empty? more) `~'<>
         `(-assoc* ~@more))))

(defmacro assoc*
  "Like `assoc`, but associations happen sequentially; i.e. each successive binding can build
   upon the result of the previous one using `<>`.

    (assoc* {}
            :a 100
            :b (+ 100 (:a <>)) ; -> {:a 100 :b 200}"
  [object & kvs]
  `((fn [~'<>] ; wrap in a `fn` so this can be used in `->`/`->>` forms
      (-assoc* ~@kvs))
    ~object))

(defn new-sql-timestamp
  "`java.sql.Date` doesn't have an empty constructor so this is a convenience that lets you make one with the current date.
   (Some DBs like Postgres will get snippy if you don't use a `java.sql.Timestamp`)."
  []
  (java.sql.Timestamp. (System/currentTimeMillis)))

(defn parse-iso-8601
  "Parse a [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) formatted date string and return a `java.sql.Timestamp`."
  ^java.sql.Timestamp
  [^String datetime]
  (some->> datetime
           DatatypeConverter/parseDateTime
           .getTime         ; Calendar
           .getTime         ; java.util.Date
           java.sql.Timestamp.))

(def ^:private ^SimpleDateFormat yyyy-mm-dd-simple-date-format
  (SimpleDateFormat. "yyyy-MM-dd"))

(defn date->yyyy-mm-dd
  "Convert a date to a `YYYY-MM-DD` string."
  ^String [^Date date]
  (.format yyyy-mm-dd-simple-date-format date))

(defn date-yyyy-mm-dd->unix-timestamp
  "Convert a string DATE in the `YYYY-MM-DD` format to a Unix timestamp in seconds."
  ^Float [^String date]
  (-> date
      parse-iso-8601
      .getTime
      (/ 1000)))

(defn date-string?
  "Is S a valid [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) date string?
   (`YYYY-MM-DD` date strings *are* ISO 8601 date strings)"
  [s]
  (boolean (when (string? s)
             (try (parse-iso-8601 s)
                  (catch Throwable _)))))

(defn ^Date relative-date
  "Create a relative date. Valid values of UNITS are the keywords in `metabase.driver.query-processor.interface/datetime-value-units`."
  [n unit & [^Date date]]
  (let [[multiplier unit] (case unit
                            :minute  [1 Calendar/MINUTE]
                            :hour    [1 Calendar/HOUR_OF_DAY]
                            :day     [1 Calendar/DATE]
                            :week    [7 Calendar/DATE]
                            :month   [1 Calendar/MONTH]
                            :quarter [3 Calendar/MONTH]
                            :year    [1 Calendar/YEAR])
        cal (Calendar/getInstance)]
    (when date
      (.setTime cal date))
    (.set cal unit (+ n (* (.get cal unit) multiplier)))
    (.getTime cal)))

(defn ^Integer date-extract
  "Extract a UNIT such as `:day-of-month` from DATE."
  [unit ^Date date]
  (let [cal (Calendar/getInstance)]
    (.setTime cal date)
    (case unit
      :minute-of-hour  (.get cal Calendar/MINUTE)
      :hour-of-day     (.get cal Calendar/HOUR_OF_DAY)
      :day-of-week     (.get cal Calendar/DAY_OF_WEEK)  ; 1 (Sunday) - 7 (Saturday)
      :day-of-month    (.get cal Calendar/DAY_OF_MONTH)
      :day-of-year     (.get cal Calendar/DAY_OF_YEAR)
      :week-of-year    (.get cal Calendar/WEEK_OF_YEAR)
      :month-of-year   (inc (.get cal Calendar/MONTH))  ; 1 - 12
      :quarter-of-year (-> (date-extract :month-of-year date)
                           (/ 3.0)
                           math/ceil
                           int)
      :year            (.get cal Calendar/YEAR))))

(defn ^Integer date-trunc
  "Floor DATE to the nearest whole UNIT. Accepts the same values of UNIT as `relative-date`."
  [unit ^Date date]
  (let [cal (Calendar/getInstance)]
    (.setTime cal date)
    (let [set-in-cal! (fn [calendar-unit & [n]]
                        (.set cal calendar-unit (or n 0)))
          ;; keyed unit should also do the truncation operations recursively for corresponding value
          ^:const unit->recursive-truncation {:hour    :minute
                                              :day     :hour
                                              :week    :day
                                              :month   :day
                                              :quarter :month
                                              :year    :month}]
      (loop [unit unit]
        (case unit
          :minute  (do (set-in-cal! Calendar/MILLISECOND)
                       (set-in-cal! Calendar/SECOND))
          :hour    (set-in-cal! Calendar/MINUTE)
          :day     (set-in-cal! Calendar/HOUR_OF_DAY)
          :week    (set-in-cal! Calendar/DAY_OF_WEEK 1)
          :month   (set-in-cal! Calendar/DAY_OF_MONTH 1)
          :quarter (set-in-cal! Calendar/MONTH (-> (date-extract :quarter-of-year date) ; 1 - 4
                                                   dec                                  ; 0 - 3
                                                   (* 3)))                              ; 0, 3, 6, 9. Java calendar is 0 - 11
          :year    (set-in-cal! Calendar/MONTH 0))
        (when-let [unit (unit->recursive-truncation unit)]
          (recur unit))))
    (.getTime cal)))

(defn date-trunc-or-extract
  "Extract (via `date-extract`) or truncate to (via `date-trunc`) UNIT."
  [unit ^Date date]
  (if (contains? #{:minute :hour :day :week :month :quarter :year} unit)
    (date-trunc unit date)
    (date-extract unit date)))

(defn now-iso8601
  "format the current time as iso8601 date/time string."
  []
  (time/unparse (time/formatters :date-time) (coerce/from-long (System/currentTimeMillis))))

(defn now-with-format
  "format the current time using a custom format."
  [format-string]
  (time/unparse (time/formatter format-string) (coerce/from-long (System/currentTimeMillis))))

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

(defn jdbc-clob->str
  "Convert a `JdbcClob` or `PGobject` to a `String`."
  (^String
   [clob]
   (when clob
     (condp = (type clob)
       java.lang.String             clob
       org.postgresql.util.PGobject (.getValue ^org.postgresql.util.PGobject clob)
       org.h2.jdbc.JdbcClob         (->> (jdbc-clob->str (.getCharacterStream ^org.h2.jdbc.JdbcClob clob) [])
                                         (interpose "\n")
                                         (apply str)))))
  ([^java.io.BufferedReader reader acc]
   (if-let [line (.readLine reader)]
     (recur reader (conj acc line))
     (do (.close reader)
         acc))))

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


(defn is-email?
  "Is STRING a valid email address?"
  [string]
  (boolean (when string
             (re-matches #"[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
                         (clojure.string/lower-case string)))))

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
  [^String hostname ^Integer port]
  (try
    (let [sock-addr (InetSocketAddress. hostname port)]
      (with-open [sock (Socket.)]
        (. sock connect sock-addr host-up-timeout)
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

(defn runtime-resolved-fn
  "Return a function that calls a function in another namespace.
   Function is resolved (and its namespace required, if need be) at runtime.
   Useful for avoiding circular dependencies.

    (def ^:private table->id (runtime-resolved-fn 'metabase.test.data 'table->id))
    (id :users) -> 4"
  [orig-namespace orig-fn-name]
  {:pre [(symbol? orig-namespace)
         (symbol? orig-fn-name)]}
  (fn [& args]
    (require orig-namespace)
    (apply @(ns-resolve orig-namespace orig-fn-name) args))
  ;; (let [resolve-fn (fn [] (try @(ns-resolve orig-namespace orig-fn-name)
  ;;                              (catch Throwable _
  ;;                                (require orig-namespace)
  ;;                                @(ns-resolve orig-namespace orig-fn-name))))]
  ;;   (fn [& args]
  ;;     (apply (resolve-fn) args)))
  )

(defmacro deref->
  "Threads OBJ through FORMS, calling `deref` after each.
   Now you can write:

    (deref-> (sel :one Field :id 12) :table :db :organization)

   Instead of:

    @(:organization @(:db @(:table (sel :one Field :id 12))))"
  {:arglists '([obj & forms])}
  [obj & forms]
  `(-> ~obj
       ~@(interpose 'deref forms)
       deref))

(defn require-dox-in-this-namespace
  "Throw an exception if any public interned symbol in this namespace is missing a docstring."
  []
  (->> (ns-publics *ns*)
       (map (fn [[symb varr]]
              (when-not (:doc (meta varr))
                (throw (Exception. (format "All public symbols in %s are required to have a docstring, but %s is missing one." (.getName *ns*) symb))))))
       dorun))

(defmacro pdoseq
  "Just like `doseq` but runs in parallel."
  [[binding collection] & body]
  `(dorun (pmap (fn [~binding]
                  ~@body)
                ~collection)))

(defmacro try-apply
  "Call F with PARAMS inside a try-catch block and log exceptions caught."
  [f & params]
  `(try
     (~f ~@params)
     (catch Throwable e#
       (log/error (color/red ~(format "Caught exception in %s:" f)
                             (or (.getMessage e#) e#)
                             (with-out-str (.printStackTrace e#)))))))

(defn indecies-satisfying
  "Return a set of indencies in COLL that satisfy PRED.

    (indecies-satisfying keyword? ['a 'b :c 3 :e])
      -> #{2 4}"
  [pred coll]
  (->> (for [[i item] (m/indexed coll)]
         (when (pred item)
           i))
       (filter identity)
       set))

(defn format-color
  "Like `format`, but uses a function in `colorize.core` to colorize the output.
   COLOR-SYMB should be a symbol like `green`.

     (format-color 'red \"Fatal error: %s\" error-message)"
  [color-symb format-string & args]
  ((ns-resolve 'colorize.core color-symb) (apply format format-string args)))

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
    (vec (or (seq (when-let [stacktrace (.getStackTrace e)]
                    (->> (map str (.getStackTrace e))
                         (filter (partial re-find #"metabase")))))
             (.getStackTrace e)))))

(require-dox-in-this-namespace)
