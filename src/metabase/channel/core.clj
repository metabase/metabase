(ns metabase.channel.core
  "The channel system of Metabase.

  The API is still in developemt and subject to change."
  (:require
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

;; ------------------------------------------------------------------------------------------------;;
;;                                      Channels methods                                           ;;
;; ------------------------------------------------------------------------------------------------;;

(defmulti render-notification
  (fn [channel-type notification-content _recipients]
    [channel-type (:payload-type notification-content)]))

(defmulti send!
  {:arglists '([channel-type message])}
  first)

;; ------------------------------------------------------------------------------------------------;;
;;                                             Utils                                               ;;
;; ------------------------------------------------------------------------------------------------;;

(defn do-register!
  "Impl of [[register!]]"
  [channel]
  (when-not *compile-files*
    (assert (= (namespace channel) "channel") "Channel must be a namespaced keyword of :channel. E.g: :channel/slack")
    (log/info (u/format-color :blue "Registered channel %s from namespace %s" channel (ns-name *ns*)))
    (classloader/require (ns-name *ns*))
    (derive channel :channel/*)))

(defmacro register!
  "Register a channel implementation."
  [channel]
  `(do-register! ~channel))
