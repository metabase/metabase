(ns metabase.shared.util.log
  (:require [net.cgrand.macrovich :as macros]))

(defmacro js-logp
  "Cljs impl for `logp`."
  [level & args]
  `(let [logger-name# ~(name (ns-name *ns*))]
     (when (is-loggable? logger-name# ~level)
       (log* log-message logger-name# ~level ~@args))))

(defmacro js-logf
  "Cljs impl for `logf`."
  [level & args]
  `(let [logger-name# ~(name (ns-name *ns*))]
     (when (is-loggable? logger-name# ~level)
       (log* logf-message logger-name# ~level ~@args))))

(defmacro logp
  "Impl for log macros. Log `args` at `level`."
  [level & args]
  (macros/case
    :clj
    `(clojure.tools.logging/logp ~level ~@args)

    :cljs
    `(js-logp ~level ~@args)))

(defmacro logf
  "Impl for log macros. Log at `level`, applying `format` to `args`."
  [level & args]
  (macros/case
    :clj
    `(clojure.tools.logging/logf ~level ~@args)

    :cljs
    `(js-logf ~level ~@args)))

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
