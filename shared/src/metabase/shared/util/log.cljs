(ns metabase.shared.util.log
  (:require [goog.string :as gstring]
            [goog.string.format :as gstring.format]
            [lambdaisland.glogi :as log]
            [lambdaisland.glogi.console :as glogi-console])
  (:require-macros metabase.shared.util.log)
  (:import goog.debug.Logger
           goog.debug.Logger.Level))

(comment metabase.shared.util.log/keep-me
         gstring.format/keep-me)

(glogi-console/install!)
(log/set-levels {:glogi/root :info})

(defn- log-message [& args]
  (if (> (count args) 1)
    (vec args)
    (first args)))

(defn- logf-message [format-string & args]
  (apply gstring/format format-string args))

(defn log* [msg-fn logger-name level & args]
  (if (instance? js/Error (first args))
    (let [[e & more] args]
      (log/log logger-name level (apply msg-fn more) e))
    (log/log logger-name level (apply msg-fn args))))

(defn- is-loggable? [logger-name level]
  (.isLoggable ^Logger (log/logger logger-name) ^Level (log/levels level)))
