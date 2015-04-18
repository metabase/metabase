(ns metabase.util
  "Common utility functions useful throughout the codebase."
  (:require [clojure.tools.logging :as log]
            [colorize.core :as color]
            [medley.core :refer :all]
            [clj-time.format :as time]
            [clj-time.coerce :as coerce])
  (:import (java.net Socket
                     InetSocketAddress
                     InetAddress)))

(defn contains-many?
  "Does M contain every key in KS?"
  [m & ks]
  (every? (partial contains? m) ks))

(defn select-non-nil-keys
  "Like `select-keys` but filters out key-value pairs whose value is nil.
   Unlike `select-keys`, KEYS are rest args (should not be wrapped in a vector).
   TODO: Why?"
  [m & ks]
  {:pre [(map? m)
         (every? keyword? ks)]}
  (->> (select-keys m ks)
       (filter-vals identity)))

(defmacro fn->
  "Returns a function that threads arguments to it through FORMS via `->`."
  [& forms]
  `(fn [x#]
     (-> x#
         ~@forms)))

(defmacro fn->>
  "Returns a function that threads arguments to it through FORMS via `->>`."
  [& forms]
  `(fn [x#]
     (->> x#
          ~@forms)))

(defn regex?
  "Is ARG a regular expression?"
  [arg]
  (= (type arg)
     java.util.regex.Pattern))

(defn regex=
  "Returns `true` if the literal string representations of REGEXES are exactly equal.

    (= #\"[0-9]+\" #\"[0-9]+\")           -> false
    (regex= #\"[0-9]+\" #\"[0-9]+\")      -> true
    (regex= #\"[0-9]+\" #\"[0-9][0-9]*\") -> false (although it's theoretically true)"
  [& regexes]
  (->> regexes
       (map #(.toString ^java.util.regex.Pattern %))
       (apply =)))

(defn self-mapping
  "Given a function F that takes a single arg, return a function that will call `(f arg)` when
  passed a non-sequential ARG, or `(map f arg)` when passed a sequential ARG.

    (def f (self-mapping (fn [x] (+ 1 x))))
    (f 2)       -> 3
    (f [1 2 3]) -> (2 3 4)"
  [f & args]
  (fn [arg]
    (if (sequential? arg) (map f arg)
        (f arg))))

;; looking for `apply-kwargs`?
;; turns out `medley.core/mapply` does the same thingx

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
  (-> (java.util.Date.)
      .getTime
      (java.sql.Timestamp.)))

(defn parse-iso8601
  "parse a string value expected in the iso8601 format into a `java.sql.Date`."
  ^java.sql.Date
  [datetime]
  (some->> datetime
           (time/parse (time/formatters :date-time))
           (coerce/to-long)
           (java.sql.Date.)))

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

(defn
  ^{:arglists ([pred? args]
               [pred? args default])}
  optional
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

    (def ^:private table->id (runtime-resolved-fn 'metabase.test-data 'table->id))
    (table->id :users) -> 4"
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

(defmacro try-apply
  "Call F with PARAMS inside a try-catch block and log exceptions caught."
  [f & params]
  `(try
     (~f ~@params)
     (catch Throwable e#
       (log/error (color/red ~(format "Caught exception in %s:" f)
                             (or (.getMessage e#) e#)
                             (with-out-str (.printStackTrace e#)))))))

(require-dox-in-this-namespace)
