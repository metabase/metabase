(ns metabase.util.redaction
  (:require [metabase.util :as u]
            [metabase.util.log :as log]))

(def ^:dynamic *emitted-warnings*
  "Used to ensure we do not spam the logs with redaction warnings. NB this must be re-bound on every response."
  (atom nil))

(def ^:dynamic *in-silent-scope*
  "Used to determine whether the scope we're currently in should log warnings."
  true)

(defmacro with-isolated-scope
  "Bind a map to track when a given class of redactions has been emitted. NB this must be called in the API middleware."
  [& body]
  `(binding [*emitted-warnings* (atom {})]
     ~@body))

(defmacro with-warnings-at-most-once
  "Ensure that we log the given class of redaction warnings at most once."
  [category & body]
  `(if-let [emitted-warnings# @*emitted-warnings*]
     (binding [*in-silent-scope* (get emitted-warnings# ~category)]
       (u/prog1 ~@body
         (swap! *emitted-warnings* assoc ~category true)))
     ;; Always log warnings if we are not within a scope, e.g. in the REPL.
     (binding [*in-silent-scope* false]
       ~@body)))

(defmacro log
  "Log a message only the first time it happens in a given request. This is a macro preserve the original context."
  [& args]
  `(when-not *in-silent-scope*
    (log/warn ~@args)))
