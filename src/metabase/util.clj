(ns metabase.util
  "Common utility functions useful throughout the codebase."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.pprint :refer [pprint]]
            [clojure.tools.logging :as log]
            [clj-time.coerce :as coerce]
            [clj-time.format :as time]
            [colorize.core :as color]
            [medley.core :as m])
  (:import (java.net Socket
                     InetSocketAddress
                     InetAddress)
           java.sql.Timestamp
           javax.xml.bind.DatatypeConverter))

(set! *warn-on-reflection* true)

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
  (Timestamp. (System/currentTimeMillis)))

;; Actually this only supports [RFC 3339](https://tools.ietf.org/html/rfc3339), which is basically a subset of ISO 8601
(defn parse-iso8601
  "Parse a string value expected in the iso8601 format into a `java.sql.Timestamp`.
   NOTE: `YYYY-MM-DD` dates *are* valid iso8601 dates."
  ^java.sql.Timestamp
  [^String datetime]
  (some->> datetime
           DatatypeConverter/parseDateTime
           .getTime     ; Calendar -> Date
           .getTime     ; Date -> ms
           Timestamp.))

(def ^:private ^java.text.SimpleDateFormat yyyy-mm-dd-simple-date-format
  (java.text.SimpleDateFormat. "yyyy-MM-dd"))

(defn date->yyyy-mm-dd
  "Convert a date to a `YYYY-MM-DD` string."
  ^String [^java.util.Date date]
  (.format yyyy-mm-dd-simple-date-format date))

(defn date-string?
  "Is S a valid ISO 8601 date string?"
  [s]
  (boolean (when (string? s)
             (try (parse-iso8601 s)
                  (catch Throwable e)))))

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
  (let [resolved-fn (delay (require orig-namespace)
                           (ns-resolve orig-namespace orig-fn-name))]
    (fn [& args]
      (apply @resolved-fn args))))

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
   COLOR-SYMB should be a quoted symbol like `green`, `red`, `yellow`, `blue`,
   `cyan`, `magenta`, etc. See the entire list of avaliable colors
   [here](https://github.com/ibdknox/colorize/blob/master/src/colorize/core.clj).

     (format-color 'red \"Fatal error: %s\" error-message)"
  [color-symb format-string & args]
  {:pre [(symbol? color-symb)]}
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
    (when-let [stacktrace (.getStackTrace e)]
      (->> (map str (.getStackTrace e))
           (filterv (partial re-find #"metabase"))))))

(defn wrap-try-catch
  "Returns a new function that wraps F in a `try-catch`. When an exception is caught, it is logged
   with `log/error` and returns `nil`."
  [f]
  (fn [& args]
    (try
      (apply f args)
      (catch java.sql.SQLException e
        (log/error (color/red "Caught exception:\n"
                              (with-out-str (jdbc/print-sql-exception-chain e)) "\n"
                              (pprint-to-str (filtered-stacktrace e)))))
      (catch Throwable e
        (log/error (color/red "Caught exception: " (or (.getMessage e) e) "\n"
                              (pprint-to-str (filtered-stacktrace e))))))))

(defn try-apply
  "Like `apply`, but wraps F inside a `try-catch` block and logs exceptions caught."
  [^clojure.lang.IFn f & args]
  (apply (wrap-try-catch f) args))

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
    (intern nmspc symb (wrap-try-catch @varr))))

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

(require-dox-in-this-namespace)
