(ns metabase.util.log
  "Common logging interface that wraps clojure.tools.logging in JVM Clojure and Glogi in CLJS.

  The interface is the same as [[clojure.tools.logging]]."
  (:require
   [clojure.pprint :as pprint]
   [clojure.string :as str]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [clojure.tools.logging]
   [clojure.tools.logging.impl]
   [metabase.config :as config]
   [metabase.util.format :as u.format]
   [metabase.util.log.capture]
   [net.cgrand.macrovich :as macros])
  (:import
   [org.slf4j MDC]))

(set! *warn-on-reflection* true)

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

;; MDC helpers

(defn- ->str
  [val] ^String
  (if val
    (if (keyword? val)
      (str (symbol val)) ;; fastest way to get a fully-quallified keyword as a string
      (.toString ^Object val))
    ""))

(defn- ->k-str
  [val] ^String
  (u.format/colorize 'cyan (->str val)))

(defn- format-context [ctx]
  (persistent!
   (reduce-kv (fn [m k v]
                (assoc! m (->k-str k) (->str v)))
              (transient {})
              ctx)))

(defn mdc-assoc!
  "Take a context map and put it into the MDC. Keys and values will be stringified."
  [ctx]
  (doseq [[k v] (format-context ctx)
          :when (some? v)]
    (MDC/put ^String k ^String v)))

(defmacro with-context
  "Set the context map for the form. Only sets context for non-`nil` values!
   Values will be stringified."
  [ctx & body]
  `(let [og# (MDC/getCopyOfContextMap)]
     (mdc-assoc! ~ctx)
     (try
       (do ~@body)
       (finally
         (MDC/setContextMap og#)))))

(defn parse-args
  "Parses args for [[trace]], [[debug]], [[info]], [[warn]], [[error]], [[fatal]]
  into a map with message, context and exception keys."
  [& args]
  (let [first-arg (first args)
        has-exception? (instance? Exception first-arg)

        rest-args (if has-exception? (rest args) args)
        has-context? (map? (last rest-args))
        message-args (cond-> rest-args has-context? drop-last)]
    (when (empty? (filter string? message-args))
      (throw (IllegalArgumentException.
              "Must have at least one string in arguments")))
    {:msg (str/join \space message-args)
     :ctx (when has-context? (last rest-args))
     :e (when has-exception? first-arg)}))

(defn- tools-logp
  "Macro helper for [[logp]] in CLJ."
  [logger-ns level x more]
  `(let [logger# (clojure.tools.logging.impl/get-logger clojure.tools.logging/*logger-factory* ~logger-ns)]
     (when (clojure.tools.logging.impl/enabled? logger# ~level)
       (let [args# (parse-args ~@(cons x more))]
         (with-context (:ctx args#)
           (clojure.tools.logging/log* logger# ~level (:e args#) (:msg args#)))))))

(defn- tools-logf
  "Macro helper for [[logf]] in CLJ."
  [logger-ns level x more]
  (if (and (instance? String x) (nil? more))
    ;; Simple case: just a String and no args.
    `(let [logger# (clojure.tools.logging.impl/get-logger clojure.tools.logging/*logger-factory* ~logger-ns)]
       (when (clojure.tools.logging.impl/enabled? logger# ~level)
         (clojure.tools.logging/log* logger# ~level nil ~x)))
    ;; Full case, with formatting.
    `(let [logger# (clojure.tools.logging.impl/get-logger clojure.tools.logging/*logger-factory* ~logger-ns)]
       (when (clojure.tools.logging.impl/enabled? logger# ~level)
         (let [x# ~x]
           (if (instance? Throwable x#)
             (clojure.tools.logging/log* logger# ~level x#  (format ~@more))
             (clojure.tools.logging/log* logger# ~level nil (format x# ~@more))))))))

;;; ------------------------------------------------ Internal macros -------------------------------------------------
(defmacro logp
  "Implementation for prn-style `logp`.
  You shouldn't have to use this directly; prefer the level-specific macros like [[info]]."
  {:arglists '([level message & more]
               [level throwable message & more])}
  [level x & more]
  `(do
     ~(config/build-type-case
        :dev
        `(metabase.util.log.capture/capture-logp ~(str *ns*) ~level ~x ~@more))
     ~(macros/case
        :cljs (glogi-logp (str *ns*) level x more)
        :clj  (tools-logp *ns*      level x more))))

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
  "Log one or more args at the `:trace` level.

   Takes an optional context map as the last argument."
  {:arglists '(;; as many msgs as you want -- must include at least 1 string
               ;; These can optionally take an exception as the first arg
               [msg] [msg1 msg2] [msg1 msg2 msg3] [msg1 msg2 msg3 msg4] [msg1 msg2 msg3 msg4 msg5]
               [msg ctx] [msg1 msg2 ctx] [msg1 msg2 msg3 ctx] [msg1 msg2 msg3 msg4 ctx] [msg1 msg2 msg3 msg4 msg5 ctx]
               [e msg] [e msg1 msg2] [e msg1 msg2 msg3] [e msg1 msg2 msg3 msg4] [e msg1 msg2 msg3 msg4 msg5]
               [e msg ctx] [e msg1 msg2 ctx] [e msg1 msg2 msg3 ctx] [e msg1 msg2 msg3 msg4 ctx] [e msg1 msg2 msg3 msg4 msg5 ctx])}
  [& args]
  `(logp :trace ~@args))

(defmacro debug
  "Log one or more args at the `:debug` level.

   Takes an optional context map as the last argument."
  {:arglists '(;; as many msgs as you want -- must include at least 1 string
               ;; These can optionally take an exception as the first arg
               [msg] [msg1 msg2] [msg1 msg2 msg3] [msg1 msg2 msg3 msg4] [msg1 msg2 msg3 msg4 msg5]
               [msg ctx] [msg1 msg2 ctx] [msg1 msg2 msg3 ctx] [msg1 msg2 msg3 msg4 ctx] [msg1 msg2 msg3 msg4 msg5 ctx]
               [e msg] [e msg1 msg2] [e msg1 msg2 msg3] [e msg1 msg2 msg3 msg4] [e msg1 msg2 msg3 msg4 msg5]
               [e msg ctx] [e msg1 msg2 ctx] [e msg1 msg2 msg3 ctx] [e msg1 msg2 msg3 msg4 ctx] [e msg1 msg2 msg3 msg4 msg5 ctx])}
  [& args]
  `(logp :debug ~@args))

(defmacro info
  "Log one or more args at the `:info` level.

   Takes an optional context map as the last argument."
  {:arglists '(;; as many msgs as you want -- must include at least 1 string
               ;; These can optionally take an exception as the first arg
               [msg] [msg1 msg2] [msg1 msg2 msg3] [msg1 msg2 msg3 msg4] [msg1 msg2 msg3 msg4 msg5]
               [msg ctx] [msg1 msg2 ctx] [msg1 msg2 msg3 ctx] [msg1 msg2 msg3 msg4 ctx] [msg1 msg2 msg3 msg4 msg5 ctx]
               [e msg] [e msg1 msg2] [e msg1 msg2 msg3] [e msg1 msg2 msg3 msg4] [e msg1 msg2 msg3 msg4 msg5]
               [e msg ctx] [e msg1 msg2 ctx] [e msg1 msg2 msg3 ctx] [e msg1 msg2 msg3 msg4 ctx] [e msg1 msg2 msg3 msg4 msg5 ctx])}
  [& args]
  `(logp :info ~@args))

(defmacro warn
  "Log one or more args at the `:warn` level.

   Takes an optional context map as the last argument."
  {:arglists '(;; as many msgs as you want -- must include at least 1 string
               ;; These can optionally take an exception as the first arg
               [msg] [msg1 msg2] [msg1 msg2 msg3] [msg1 msg2 msg3 msg4] [msg1 msg2 msg3 msg4 msg5]
               [msg ctx] [msg1 msg2 ctx] [msg1 msg2 msg3 ctx] [msg1 msg2 msg3 msg4 ctx] [msg1 msg2 msg3 msg4 msg5 ctx]
               [e msg] [e msg1 msg2] [e msg1 msg2 msg3] [e msg1 msg2 msg3 msg4] [e msg1 msg2 msg3 msg4 msg5]
               [e msg ctx] [e msg1 msg2 ctx] [e msg1 msg2 msg3 ctx] [e msg1 msg2 msg3 msg4 ctx] [e msg1 msg2 msg3 msg4 msg5 ctx])}
  [& args]
  `(logp :warn ~@args))

(defmacro error
  "Log one or more args at the `:error` level.

   Takes an optional context map as the last argument."
  {:arglists '(;; as many msgs as you want -- must include at least 1 string
               ;; These can optionally take an exception as the first arg
               [msg] [msg1 msg2] [msg1 msg2 msg3] [msg1 msg2 msg3 msg4] [msg1 msg2 msg3 msg4 msg5]
               [msg ctx] [msg1 msg2 ctx] [msg1 msg2 msg3 ctx] [msg1 msg2 msg3 msg4 ctx] [msg1 msg2 msg3 msg4 msg5 ctx]
               [e msg] [e msg1 msg2] [e msg1 msg2 msg3] [e msg1 msg2 msg3 msg4] [e msg1 msg2 msg3 msg4 msg5]
               [e msg ctx] [e msg1 msg2 ctx] [e msg1 msg2 msg3 ctx] [e msg1 msg2 msg3 msg4 ctx] [e msg1 msg2 msg3 msg4 msg5 ctx])}
  [& args]
  `(logp :error ~@args))

#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(defmacro fatal
  "Log one or more args at the `:fatal` level.

   Takes an optional context map as the last argument."
  {:arglists '(;; as many msgs as you want -- must include at least 1 string
               ;; These can optionally take an exception as the first arg
               [msg] [msg1 msg2] [msg1 msg2 msg3] [msg1 msg2 msg3 msg4] [msg1 msg2 msg3 msg4 msg5]
               [msg ctx] [msg1 msg2 ctx] [msg1 msg2 msg3 ctx] [msg1 msg2 msg3 msg4 ctx] [msg1 msg2 msg3 msg4 msg5 ctx]
               [e msg] [e msg1 msg2] [e msg1 msg2 msg3] [e msg1 msg2 msg3 msg4] [e msg1 msg2 msg3 msg4 msg5]
               [e msg ctx] [e msg1 msg2 ctx] [e msg1 msg2 msg3 ctx] [e msg1 msg2 msg3 msg4 ctx] [e msg1 msg2 msg3 msg4 msg5 ctx])}
  [& args]
  `(logp :fatal ~@args))

(defmacro ^:deprecated tracef
  "Log a message at the `:trace` level by applying `format` to a format string and args.

  DEPRECATION WARNING: Instead of using formatted string logging, use trace, with a map as the last arg."
  {:arglists '([format-string & args] [e format-string & args])}
  [& args]
  `(logf :trace ~@args))

(defmacro ^:deprecated debugf
  "Log a message at the `:debug` level by applying `format` to a format string and args.

  DEPRECATION WARNING: Instead of using formatted string logging, use debug, with a map as the last arg."
  {:arglists '([format-string & args] [e format-string & args])}
  [& args]
  `(logf :debug ~@args))

(defmacro ^:deprecated infof
  "Log a message at the `:info` level by applying `format` to a format string and args.

  DEPRECATION WARNING: Instead of using formatted string logging, use info, with a map as the last arg."
  {:arglists '([format-string & args] [e format-string & args])}
  [& args]
  `(logf :info ~@args))

(defmacro ^:deprecated warnf
  "Log a message at the `:warn` level by applying `format` to a format string and args.

  DEPRECATION WARNING: Instead of using formatted string logging, use warn, with a map as the last arg."
  {:arglists '([format-string & args] [e format-string & args])}
  [& args]
  `(logf :warn ~@args))

(defmacro ^:deprecated errorf
  "Log a message at the `:error` level by applying `format` to a format string and args.

  DEPRECATION WARNING: Instead of using formatted string logging, use error, with a map as the last arg."
  {:arglists '([format-string & args] [e format-string & args])}
  [& args]
  `(logf :error ~@args))

(defmacro ^:deprecated fatalf
  "Log a message at the `:fatal` level by applying `format` to a format string and args.

  DEPRECATION WARNING: Instead of using formatted string logging, use fatal, with a map as the last arg."
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
