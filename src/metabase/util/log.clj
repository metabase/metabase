(ns metabase.util.log
  "Common logging interface that wraps clojure.tools.logging in JVM Clojure and Glogi in CLJS.

  The interface is the same as [[clojure.tools.logging]]."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.pprint :as pprint]
   [clojure.string :as str]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [clojure.tools.logging]
   [clojure.tools.logging.impl]
   [metabase.config.core :as config]
   [metabase.util.format :as u.format]
   [metabase.util.log.capture]
   [metabase.util.performance :as perf]
   [net.cgrand.macrovich :as macros])
  (:import
   (clojure.lang ExceptionInfo)
   (org.apache.logging.log4j ThreadContext)))

(set! *warn-on-reflection* true)

(def ^:private suppressed-exception-context-message "METABASE HIDDEN EXCEPTION ONLY FOR CONTEXT")

(defn get-exception-data
  "Given an exception/throwable thrown by `with-exception-context-fn`, get the map of all context data contained in the
  suppressed exception(s) added. Inner context overrides outer context."
  [e]
  (let [ex-chain (->> e (iterate ex-cause) (take-while some?))
        suppressed-exception-data (->> ex-chain
                                       (mapcat (fn [^Throwable t]
                                                 ;; reversed to make inner context override outer context
                                                 (reverse (.getSuppressed t))))
                                       (keep #(when (= suppressed-exception-context-message (ex-message %))
                                                (::context (ex-data %)))))]
    (into {} suppressed-exception-data)))

;;; --------------------------------------------- CLJ-side macro helpers ---------------------------------------------
(defn- glogi-logp
  "Macro helper for [[logp]] in CLJS."
  [logger-name level x more]
  `(let [level#  (glogi-level ~level)
         logger# ~logger-name]
     (when (is-loggable? logger# level#)
       (let [x# ~x]
         (if (instance? js/Error x#)
           (lambdaisland.glogi/log logger# level# (print-str ~@more) x#)
           (lambdaisland.glogi/log logger# level# (print-str x# ~@more) nil))))))

(defn- glogi-logf
  "Macro helper for [[logf]] in CLJS."
  [logger-name level x more]
  `(let [level#  (glogi-level ~level)
         logger# ~logger-name]
     (when (is-loggable? logger# level#)
       (let [x# ~x]
         (if (instance? js/Error x#)
           (lambdaisland.glogi/log logger# level# (format-msg ~@more) x#)
           (lambdaisland.glogi/log logger# level# (format-msg x# ~@more) nil))))))

(defn- glogi-spy
  "Macro helper for [[spy]] and [[spyf]] in CLJS."
  [logger-name level expr formatter]
  `(let [level#  (glogi-level ~level)
         logger# ~logger-name]
     (when (is-loggable? logger# level#)
       (let [a# ~expr
             s# (~formatter a#)]
         (lambdaisland.glogi/log logger# level# nil s#)
         a#))))

(defn with-thread-context-fn
  "Not for public consumption. See macro docstring for details."
  [context-map f]
  (let [context-map (perf/update-keys context-map #(str "mb-" (u.format/qualified-name %)))
        context-keys (keys context-map)
        ;; Store original values before modifying
        original-context (into {}
                               (keep (fn [k]
                                       (when-let [v (ThreadContext/get (name k))]
                                         [(name k) v])))
                               context-keys)]
    (try
      (doseq [k context-keys]
        (ThreadContext/put (name k) (str (get context-map k))))
      (f)
      (finally
        (doseq [k context-keys]
          (if-let [original (find original-context (name k))]
            (ThreadContext/put (name k) (val original))
            (ThreadContext/remove (name k))))))))

(defmacro with-thread-context
  "Executes body with the given context map and message prefix in ThreadContext.
   The context map's keys and values are added to the ThreadContext individually.
   Preserves any existing context values and restores them after execution.

   Example usage:
   (with-context {:notification_id 1}
     (log/infof \"Hello\"))

   ThreadContext will contain: {\"notification_id\" \"1\"} and stack \"Notification 1\""
  [context-map & body]
  `(with-thread-context-fn ~context-map
     (fn [] ~@body)))

(let [config (-> (io/resource "metabase/config/modules.edn")
                 slurp edn/read-string :metabase/modules)
      first-segment (fn first-segment [ns-sym]
                      (-> (str/split (name ns-sym) #"\.") second))
      chop (fn chop [ns-sym]
             (if (str/starts-with? (name ns-sym) "metabase-enterprise")
               (symbol "enterprise" (first-segment ns-sym))
               (symbol (first-segment ns-sym))))]
  (defn ns->team*
    "Chops the namespace symbol to look up which team owns this namespace in the module config. Assumes that the first
  segment of the namespace is a module. Should be memoized for speed."
    [ns-sym]
    (if ('#{metabase.server.middleware.log} ns-sym)
      ::skip
      (-> ns-sym chop config :team))))

(let [attribution (memoize ns->team*)]
  (defn ns->team
    "Returns a string of the team for a namespace symbol, or nil. We skip a few chatty namespaces like
  `metabase.server.middleware.log` which logs requests."
    [logger-ns]
    ;; read from ".clj-kondo/config/modules/config.edn",
    (let [team (attribution logger-ns)]
      (when (and team (not (identical? team ::skip)))
        team))))

(defn- tools-logp
  "Macro helper for [[logp]] in CLJ."
  [logger-ns level x more]
  `(let [logger-ns# ~logger-ns
         logger# (clojure.tools.logging.impl/get-logger clojure.tools.logging/*logger-factory* ~logger-ns)]
     (when (clojure.tools.logging.impl/enabled? logger# ~level)
       (let [team# (ns->team (ns-name logger-ns#))]
         (try
           (when team#
             (ThreadContext/put "mb-team" team#)) ;; <---- new
           (let [x# ~x]
             (if (instance? Throwable x#)
               (let [d# (get-exception-data x#)]
                 (with-thread-context d#
                   (clojure.tools.logging/log* logger# ~level x#  ~(if (nil? more)
                                                                     ""
                                                                     `(print-str ~@more)))))
               (clojure.tools.logging/log* logger# ~level nil (print-str x# ~@more))))
           (finally (when team# (ThreadContext/remove "mb-team"))))))))      ;; <------ new cleanup

(defn- tools-logf
  "Macro helper for [[logf]] in CLJ."
  [logger-ns level x more]
  (if (and (instance? String x) (nil? more))
    ;; Simple case: just a String and no args.
    `(let [logger-ns# ~logger-ns
           logger# (clojure.tools.logging.impl/get-logger clojure.tools.logging/*logger-factory* logger-ns#)]
       (when (clojure.tools.logging.impl/enabled? logger# ~level)
         (let [team# (ns->team (ns-name logger-ns#))]
           (try
             (when team# (ThreadContext/put "mb-team" team#))
             (clojure.tools.logging/log* logger# ~level nil ~x)
             (finally (when team# (ThreadContext/remove "mb-team"))))))) ;; Full case, with formatting.
    `(let [logger-ns# ~logger-ns
           logger# (clojure.tools.logging.impl/get-logger clojure.tools.logging/*logger-factory* logger-ns#)]
       (when (clojure.tools.logging.impl/enabled? logger# ~level)
         (let [x# ~x
               team# (ns->team (ns-name logger-ns#))]
           (try
             (when team# (ThreadContext/put "mb-team" team#))
             (if (instance? Throwable x#)
               (clojure.tools.logging/log* logger# ~level x#  (format ~@more))
               (clojure.tools.logging/log* logger# ~level nil (format x# ~@more)))
             (finally (when team# (ThreadContext/remove "mb-team")))))))))

;;; ------------------------------------------------ Internal macros -------------------------------------------------
(defmacro logp
  "Implementation for prn-style `logp`.
  You shouldn't have to use this directly; prefer the level-specific macros like [[info]]."
  {:arglists '([level message & more] [level throwable message & more])}
  [level x & more]
  `(do
     ~(config/build-type-case
       :dev
       `(metabase.util.log.capture/capture-logp ~(str *ns*) ~level ~x ~@more))
     ~(macros/case
        :cljs (glogi-logp (str *ns*) level x more)
        :clj  (tools-logp *ns*       level x more))))

(defmacro logf
  "Implementation for printf-style `logf`.
  You shouldn't have to use this directly; prefer the level-specific macros like [[infof]]."
  [level x & args]
  `(do
     ~(config/build-type-case
       :dev
       `(metabase.util.log.capture/capture-logf ~(str *ns*) ~level ~x ~@args))
     ~(macros/case
        :cljs (glogi-logf (str *ns*) level x args)
        :clj  (tools-logf *ns*       level x args))))

;;; --------------------------------------------------- Public API ---------------------------------------------------
(defmacro trace
  "Log one or more args at the `:trace` level."
  {:arglists '([& args] [e & args])}
  [& args]
  `(logp :trace ~@args))

(defmacro tracef
  "Log a message at the `:trace` level by applying `format` to a format string and args."
  {:arglists '([format-string & args] [e format-string & args])}
  [& args]
  `(logf :trace ~@args))

(defmacro debug
  "Log one or more args at the `:debug` level."
  {:arglists '([& args] [e & args])}
  [& args]
  `(logp :debug ~@args))

(defmacro debugf
  "Log a message at the `:debug` level by applying `format` to a format string and args."
  {:arglists '([format-string & args] [e format-string & args])}
  [& args]
  `(logf :debug ~@args))

(defmacro info
  "Log one or more args at the `:info` level."
  {:arglists '([& args] [e & args])}
  [& args]
  `(logp :info ~@args))

(defmacro infof
  "Log a message at the `:info` level by applying `format` to a format string and args."
  {:arglists '([format-string & args] [e format-string & args])}
  [& args]
  `(logf :info ~@args))

(defmacro warn
  "Log one or more args at the `:warn` level."
  {:arglists '([& args] [e & args])}
  [& args]
  `(logp :warn ~@args))

(defmacro warnf
  "Log a message at the `:warn` level by applying `format` to a format string and args."
  {:arglists '([format-string & args] [e format-string & args])}
  [& args]
  `(logf :warn ~@args))

(defmacro error
  "Log one or more args at the `:error` level."
  {:arglists '([& args] [e & args])}
  [& args]
  `(logp :error ~@args))

(defmacro errorf
  "Log a message at the `:error` level by applying `format` to a format string and args."
  {:arglists '([format-string & args] [e format-string & args])}
  [& args]
  `(logf :error ~@args))

#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(defmacro fatal
  "Log one or more args at the `:fatal` level."
  {:arglists '([& args] [e & args])}
  [& args]
  `(logp :fatal ~@args))

(defmacro fatalf
  "Log a message at the `:fatal` level by applying `format` to a format string and args."
  {:arglists '([format-string & args] [e format-string & args])}
  [& args]
  `(logf :fatal ~@args))

(defmacro spy
  "Evaluates an expression, and may write both the form and its result to the log.
  Returns the result of `expr`.
  Defaults to the `:debug` level."
  ([expr] `(spy :debug ~expr))
  ([level expr]
   (macros/case
     :cljs (glogi-spy (str *ns*) level expr
                      #(str/trim-newline
                        (with-out-str
                          #_{:clj-kondo/ignore [:discouraged-var]}
                          (pprint/with-pprint-dispatch pprint/code-dispatch
                            (pprint/pprint '~expr)
                            (print "=> ")
                            (pprint/pprint %)))))
     :clj  `(clojure.tools.logging/spy ~level ~expr))))

#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(defmacro spyf
  "Evaluates an expression, and may write both the form and its formatted result to the log.
  Defaults to the `:debug` level."
  ([fmt expr]
   `(spyf :debug ~fmt ~expr))
  ([level fmt expr]
   (macros/case
     :cljs (glogi-spy (str *ns*) level expr #(format ~fmt %))
     :clj  `(spyf ~level ~fmt ~expr))))

(defmacro with-no-logs
  "Turns off logs in body."
  [& body]
  `(binding [clojure.tools.logging/*logger-factory* clojure.tools.logging.impl/disabled-logger-factory]
     ~@body))

(defn- copy-ex-info
  "Copies an ExceptionInfo into a new ExceptionInfo with different ex-data & cause, but all other data the same"
  ^ExceptionInfo
  [^ExceptionInfo e new-data new-cause]
  (let [^ExceptionInfo new-e (ex-info (ex-message e) new-data new-cause)]
    (.setStackTrace new-e (.getStackTrace e))
    (doseq [^Throwable t (.getSuppressed e)]
      (.addSuppressed new-e t))
    new-e))

(defn- suppressed-exception
  [context-map]
  (ex-info suppressed-exception-context-message {::context context-map}))

(defn- annotate-ex-info [e context-map]
  (let [new-e (copy-ex-info e
                            (assoc (ex-data e) ::context (merge {} context-map (::context (ex-data e))))
                            (ex-cause e))]
    (.addSuppressed new-e (suppressed-exception context-map))
    new-e))

(defn- annotate-throwable [e context-map]
  (.addSuppressed ^Throwable e (suppressed-exception context-map))
  e)

(defn with-exception-context-fn
  "Not meant for public consumption.

  Runs `f`, catching any exceptions thrown and rethrowing them with:
  - `ex-data` augmented with `context-map`, only if the exception was an `ExceptionInfo`, and
  - a *suppressed* exception attached. The suppressed exception is meant purely to hold `ex-data` for later logging."
  [context-map f]
  (try
    (f)
    (catch ExceptionInfo e
      (throw (annotate-ex-info e context-map)))
    (catch Throwable e
      (throw (annotate-throwable e context-map)))))

(defmacro with-exception-context
  "Not meant for public consumption, use `with-context` instead."
  [context-map & body]
  `(with-exception-context-fn ~context-map
     (fn [] ~@body)))

(defmacro with-context
  "Executes body with the given context map and message prefix in ThreadContext.
   The context map's keys and values are added to the ThreadContext individually.
   Preserves any existing context values and restores them after execution.

   Example usage:
   (with-context {:notification_id 1}
     (log/infof \"Hello\"))

   ThreadContext will contain: {\"notification_id\" \"1\"} and stack \"Notification 1\"

  Any exceptions thrown within the body will ALSO be annotated with the context (in a suppressed `ExceptionInfo`
  attached to the original exception, and/or directly in the `ex-data` if they're `ExceptionInfo`s already.

  If the exception is logged (via `log/error` or similar), the exception data attached above will be logged as well."
  [context-map & body]
  (macros/case
    :clj `(with-thread-context ~context-map
            (with-exception-context ~context-map
              ~@body))
    :cljs ~@body))

(defn with-context-meta
  "Given a map, returns the map with the `::context` set. Used for propagation of log context across threads."
  [m]
  (vary-meta m assoc ::context (->> (ThreadContext/getImmutableContext)
                                    (keep (fn [[k v]] (when (str/starts-with? k "mb-")
                                                        [(str/replace k "mb-" "") v])))
                                    (into {}))))

(defmacro with-restored-context-from-meta
  "Given a map presumably containing metadata from `with-context-meta`, sets the current ThreadContext"
  [m & body]
  `(with-context (::context (meta ~m))
     ~@body))
