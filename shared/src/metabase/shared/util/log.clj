(ns metabase.shared.util.log
  (:require [net.cgrand.macrovich :as macros]))

(defmacro js-logp [level & args]
  `(let [logger-name# ~(name (ns-name *ns*))]
     (when (is-loggable? logger-name# ~level)
       (log* log-message logger-name# ~level ~@args))))

(defmacro js-logf [level & args]
  `(let [logger-name# ~(name (ns-name *ns*))]
     (when (is-loggable? logger-name# ~level)
       (log* logf-message logger-name# ~level ~@args))))

(defmacro logp [level & args]
  (macros/case
    :clj
    `(clojure.tools.logging/logp ~level ~@args)

    :cljs
    `(js-logp ~level ~@args)))

(defmacro logf [level & args]
  (macros/case
    :clj
    `(clojure.tools.logging/logf ~level ~@args)

    :cljs
    `(js-logf ~level ~@args)))

(defmacro trace
  {:arglists '([& args] [e & args])}
  [& args]
  `(logp :trace ~@args))

(defmacro tracef
  {:arglists '([format-string & args] [e format-string & args])}
  [& args]
  `(logf :trace ~@args))

(defmacro debug
  {:arglists '([& args] [e & args])}
  [& args]
  `(logp :debug ~@args))

(defmacro debugf
  {:arglists '([format-string & args] [e format-string & args])}
  [& args]
  `(logf :debug ~@args))

(defmacro info
  {:arglists '([& args] [e & args])}
  [& args]
  `(logp :info ~@args))

(defmacro infof
  {:arglists '([format-string & args] [e format-string & args])}
  [& args]
  `(logf :info ~@args))

(defmacro warn
  {:arglists '([& args] [e & args])}
  [& args]
  `(logp :warn ~@args))

(defmacro warnf
  {:arglists '([format-string & args] [e format-string & args])}
  [& args]
  `(logf :warn ~@args))

(defmacro error
  {:arglists '([& args] [e & args])}
  [& args]
  `(logp :error ~@args))

(defmacro errorf
  {:arglists '([format-string & args] [e format-string & args])}
  [& args]
  `(logf :error ~@args))
