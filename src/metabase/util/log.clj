(ns metabase.util.log
  "Common logging interface that wraps clojure.tools.logging in JVM Clojure and Glogi in CLJS.

  The interface is the same as [[clojure.tools.logging]]."
  (:require
   [clojure.pprint :as pprint]
   [clojure.string :as str]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [clojure.tools.logging]
   [clojure.tools.logging.impl]
   [net.cgrand.macrovich :as macros]))

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

(defn- tools-logp
  "Macro helper for [[logp]] in CLJ."
  [logger-ns level x more]
  `(let [logger# (clojure.tools.logging.impl/get-logger clojure.tools.logging/*logger-factory* ~logger-ns)]
     (when (clojure.tools.logging.impl/enabled? logger# ~level)
       (let [x# ~x]
         (if (instance? Throwable x#)
           (clojure.tools.logging/log* logger# ~level x#  ~(if (nil? more)
                                                             ""
                                                             `(print-str ~@more)))
           (clojure.tools.logging/log* logger# ~level nil (print-str x# ~@more)))))))

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
  {:arglists '([level message & more] [level throwable message & more])}
  [level x & more]
  (macros/case
    :cljs (glogi-logp (str *ns*) level x more)
    :clj  (tools-logp *ns*       level x more)))

(defmacro logf
  "Implementation for printf-style `logf`.
  You shouldn't have to use this directly; prefer the level-specific macros like [[infof]]."
  [level x & args]
  (macros/case
    :cljs (glogi-logf (str *ns*) level x args)
    :clj  (tools-logf *ns*       level x args)))

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
