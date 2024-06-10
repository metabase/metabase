(ns metabase.channel.core
  "The channel system of Metabase.

  The API is still in developemt and subject to change."
  (:require
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;; ------------------------------------------------------------------------------------------------;;
;;                                      Channels methods                                           ;;
;; ------------------------------------------------------------------------------------------------;;

(defmulti render-notification
  (fn [channel-type notification-content _recipients]
    [channel-type (:payload-type notification-content)]))

(defmulti send!
  {:arglists '([channel-type message])}
  (fn [channel-type _message]
    channel-type))

;; ------------------------------------------------------------------------------------------------;;
;;                                             Utils                                               ;;
;; ------------------------------------------------------------------------------------------------;;

(defn- find-and-load-metabase-channels!
  "Load namespaces that start with `metabase.channel"
  []
  (doseq [ns-symb u/metabase-namespace-symbols
          :when   (.startsWith (name ns-symb) "metabase.channel.")]
    (log/info "Loading channel namespace:" (u/format-color :blue ns-symb))
    (classloader/require ns-symb)))

(when-not *compile-files*
  (find-and-load-metabase-channels!))
