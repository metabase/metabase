(ns ^{:added "0.51.0"} metabase.channel.core
  "The Metabase channel system.

  The API is still in development and subject to change."
  (:require
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;; ------------------------------------------------------------------------------------------------;;
;;                                      Channels methods                                           ;;
;; ------------------------------------------------------------------------------------------------;;

(defmulti render-notification
  "Given a notification content, return a sequence of channel-specific messages.

  The message format is channel-specific, one requirement is that it should be the same format that
  the [[send!]] multimethod expects."
  {:added    "0.51.0"
   :arglists '([channel-type notification-content recipients])}
  (fn [channel-type notification-content _recipients]
    [channel-type (:payload-type notification-content)]))

(defmulti send!
  "Send a message to a channel."
  {:added    "0.51.0"
   :arglists '([channel-type message])}
  (fn [channel-type _message]
    channel-type))

;; ------------------------------------------------------------------------------------------------;;
;;                                             Utils                                               ;;
;; ------------------------------------------------------------------------------------------------;;

(defn- find-and-load-metabase-channels!
  "Load namespaces that start with `metabase.channel."
  []
  (doseq [ns-symb u/metabase-namespace-symbols
          :when   (.startsWith (name ns-symb) "metabase.channel.")]
    (log/info "Loading channel namespace:" (u/format-color :blue ns-symb))
    (classloader/require ns-symb)))

(when-not *compile-files*
  (find-and-load-metabase-channels!))
