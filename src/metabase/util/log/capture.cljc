(ns metabase.util.log.capture
  "Only used in tests and dev runs.

  Basic idea is we have a dynamic variable called [[*capture-logs-fn*]] with the signature

    (f namespace-str level-int)

  and if the logs should be captured at that level, it returns a function with the signature

    (f e message)

  that you should call with the logged exception (if any) and logged message to capture the message.

  Then the actual implementation can basically compose [[*capture-logs-fn*]] so you can have multiple functions capturing
  logs.

  The impl can store the logs in an atom or whatever that you can get later."
  (:require
   #?@(:cljs
       [[goog.string :as gstring]])
   [clojure.set :as set]
   [clojure.spec.alpha :as s]
   [clojure.string :as str]))

(def ^:dynamic ^{:arglists '([namespace-str level-int])} *capture-logs-fn*
  "Function with the signature that given a namespace string and log level (as an int), returns a function that should
  be used to capture a log message, if messages at that level should be captured. Its signature is

    (f namespace-str level-int) => (f e message)"
  (constantly nil))

;;; Code below converts log levels to integers right away, because a simple int comparison like `(<= 5 4)` is super
;;; quick, and definitely quicker than `(<= (level->int :trace) (level->int :debug))`. So we do the conversions at
;;; macroexpansion time

(def ^:private level->int
  {:explode 0
   :fatal   1
   :error   2
   :warn    3
   :info    4
   :debug   5
   :trace   6
   :whisper 7})

(def ^:private int->level
  (set/map-invert level->int))

(defn- capture-logs-fn [logs captured-namespace captured-level-int]
  ;; the prefix stuff is calculated outside of the function so we can be SUPER OPTIMIZED and not do anything
  ;; allocation in cases where we're not going to capture anything.
  (let [captured-namespace-prefix (str captured-namespace \.)]
    (fn [message-namespace message-level-int]
      ;; similarly, the level comparison is done first, because it's faster and will hopefully filter out a lot of
      ;; things we weren't going to capture anyway before we do the more expensive namespace check
      (when (and (<= message-level-int captured-level-int)
                 (or (= message-namespace captured-namespace)
                     (str/starts-with? message-namespace captured-namespace-prefix)))
        ;; VERY IMPORTANT! Only return the capturing function if we actually want to capture a log message.
        (fn capture-fn [e message]
          (swap! logs conj {:namespace (symbol message-namespace)
                            :level     (int->level message-level-int)
                            :e         e
                            :message   message}))))))

(defn do-with-log-messages-for-level
  "Impl for [[with-log-messages-for-level]]."
  [captured-namespace captured-level-int f]
  (let [logs           (atom [])
        old-capture-fn *capture-logs-fn*
        capture-fn     (capture-logs-fn logs captured-namespace captured-level-int)]
    (binding [*capture-logs-fn* (fn composed-fn [a-message message-level-int]
                                  (let [f1 (old-capture-fn a-message message-level-int)
                                        f2 (capture-fn a-message message-level-int)]
                                    (cond
                                      (and f1 f2) (fn [e message]
                                                    (f1 e message)
                                                    (f2 e message))
                                      f1          f1
                                      f2          f2)))]
      (f (fn [] @logs)))))

(s/def ::namespace
  (some-fn symbol? string?))

(s/def ::level
  #{:explode :fatal :error :warn :info :debug :trace :whisper})

(s/def ::with-log-messages-for-level-args
  (s/cat :bindings (s/spec (s/+ (s/cat :messages-fn-binding symbol?
                                       :ns-level            (s/or :ns-level (s/spec (s/cat :ns-str ::namespace
                                                                                           :level  ::level))
                                                                  :ns       ::namespace
                                                                  :level    ::level))))
         :body     (s/+ any?)))

(defmacro with-log-messages-for-level
  "Capture log messages at a given level in a given namespace and all 'child' namespaces inside `body`.

  Captured logs can be accessed by invoking `messages-fn-binding`. `ns-level` can be either a namespace, level, or
  both, i.e. one of the following options:

  1. A namespace string or symbol; assumes level `:trace`. Capture all log message in that namespace and any 'child'
     namespaces

  2. A level keyword like `:trace`; assumes namespace is `metabase`, i.e. captures log messages from any namespace
     that starts with `metabase.`

  3. A vector of [namespace level], e.g. `[my.namespace :debug]`, which would capture all `:debug` and `:trace`
     messages inside `my.namespace`, `my.namespace.x`, etc.

  A code example is worth a thousand-word docstring, so here is an example

  (log.capture/with-log-messages-for-level [messages [metabase.util.log.capture-test :trace]]
    (is (= []
           (messages)))
    (log/trace \"message\")
    (is (= [{:namespace 'metabase.util.log.capture-test
             :level     :trace
             :e         nil
             :message   \"message\"}]
           (messages))))

  See [[metabase.util.log.capture-test]] for more example usages.

  You can pass multiple bindings to this macro without them affecting one another, regardless of whether the things
  they capture overlap or not. See [[metabase.util.log.capture-test/multiple-captures-test]] for an example."
  {:arglists '([[messages-fn-binding ns-level & more-bindings] & body])}
  [& args]
  (let [{:keys [bindings body]} (s/conform ::with-log-messages-for-level-args args)]
    (reduce
     (fn [form bindings]
       (let [{:keys [messages-fn-binding ns-level]} bindings
             [ns-level-type ns-level]               ns-level
             {:keys [ns-str level]}                 (case ns-level-type
                                                      :ns-level ns-level
                                                      :ns       {:ns-str ns-level, :level :trace}
                                                      :level    {:ns-str "metabase", :level ns-level})]
         `(do-with-log-messages-for-level ~(str ns-str) ~(level->int level) (fn [~messages-fn-binding] ~form))))
     `(do ~@body)
     bindings)))

(s/fdef with-log-messages-for-level
  :args ::with-log-messages-for-level-args
  :ret  any?)

;;; The macroexpansion of something like
;;;
;;;    (log/trace "a picture")
;;;
;;; becomes
;;;
;;;    (do
;;;      (metabase.util.log.capture/capture-logp
;;;       "metabase.util.log.capture-test"
;;;       :trace
;;;       "a picture")
;;;      ;; clojure.tools.logging stuff
;;;      ...)
;;;
;;; becomes
;;;
;;;    (do
;;;      (when-let [f# (metabase.util.log.capture/*capture-logs-fn*
;;;                     "metabase.util.log.capture-test"
;;;                     5)]
;;;          (metabase.util.log.capture/capture-logp! f# "a picture"))
;;;      ...)
;;;
;;; VERY VERY IMPORTANT! [[*capture-logs-fn*]] only returns a function if logs for that namespace AND level are to be
;;; captured! Only then is [[capture-logp!]] or [[capture-logf!]], which ultimately call the returned function `f#`,
;;; called with the args to the logging macro -- and only then do they get evaluated! It's super important not to
;;; evaluate the log args unless we actually want to capture them! They might be very expensive!

(defn- parse-args [[x & more]]
  (if (instance? #?(:clj Throwable :cljs js/Error) x)
    {:e x, :args more}
    {:args (cons x more)}))

(defn capture-logp!
  "Impl for log message capturing for [[metabase.util.log/logp]]."
  [f & args]
  (let [{:keys [e args]} (parse-args args)]
    (f e (str/join \space (map print-str args)))))

(defn capture-logf!
  "Impl for log message capturing for [[metabase.util.log/logf]]."
  [f & args]
  (let [{e :e, [format-string & args] :args} (parse-args args)]
    #_{:clj-kondo/ignore [:unresolved-namespace]}
    (f e (apply #?(:clj format
                   :cljs gstring/format)
                format-string args))))

(defmacro capture-logp
  "Impl for log message capturing for [[metabase.util.log/logp]]."
  [namespace-str level & args]
  `(when-let [f# (*capture-logs-fn* ~namespace-str ~(level->int level))]
     (capture-logp! f# ~@args)))

(defmacro capture-logf
  "Impl for log message capturing for [[metabase.util.log/logf]]."
  [namespace-str level & args]
  `(when-let [f# (*capture-logs-fn* ~namespace-str ~(level->int level))]
     (capture-logf! f# ~@args)))
