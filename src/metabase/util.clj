(ns metabase.util
  "Common utility functions useful throughout the codebase."
  (:require [clojure.tools.logging :as log]
            [medley.core :refer :all]
            [clj-time.format :as time]
            [clj-time.coerce :as coerce])
  (:import (java.net Socket
                     InetSocketAddress
                     InetAddress)))

(defn contains-many? [m & ks]
  (every? true? (map #(contains? m %) ks)))

(defn select-non-nil-keys
  "Like `select-keys` but filters out key-value pairs whose value is nil.
   Unlike `select-keys`, KEYS are rest args (should not be wrapped in a vector).
   TODO: Why?"
  [m & keys]
  {:pre [(map? m)
         (every? keyword? keys)]}
  (->> (select-keys m keys)
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


(declare -assoc*)
(defmacro assoc*
  "Like `assoc`, but associations happen sequentially; i.e. each successive binding can build
   upon the result of the previous one using `<>`.

    (assoc* {}
            :a 100
            :b (+ 100 (:a <>)) ; -> {:a 100 :b 200}"
  [object & kvs]
  `((fn [~'<>]          ; wrap in a `fn` so this can be used in `->`/`->>` forms
      (-assoc* ~@kvs))
    ~object))

(defmacro -assoc* [k v & rest]
  `(let [~'<> (assoc ~'<> ~k ~v)]
        ~(if (empty? rest) `~'<>
             `(-assoc* ~@rest))))

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

(defn jdbc-clob->str
  "Convert a `JdbcClob` to a `String`."
  (^String
   [clob]
   (when clob
     (if (string? clob) clob
         (->> (jdbc-clob->str (.getCharacterStream ^org.h2.jdbc.JdbcClob clob) [])
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
  "Returns true if v is an email address"
  [v]
  (if (nil? v)
    false
    (boolean (re-matches #"[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
                         (clojure.string/lower-case v)))))

(defn host-port-up?
  "Returns true if the port is active on a given host, false otherwise"
  [hostname port]
  (try
    (let [sock-addr (InetSocketAddress. hostname port)
          timeout 5000]
      (with-open [sock (Socket.)]
        (. sock connect sock-addr timeout)
        true))
    (catch Exception _ false)))

(defn host-up?
  "Returns true if the host given by hostname is reachable, false otherwise "
  [hostname]
  (try
    (let [host-addr (. InetAddress getByName hostname)
          timeout 5000]
      (. host-addr isReachable timeout))
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
