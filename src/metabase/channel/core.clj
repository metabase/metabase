(ns metabase.channel.core
  (:require
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

;; ------------------------------------------------------------------------------------------------;;
;;                                      Channels methods                                           ;;
;; ------------------------------------------------------------------------------------------------;;

(defmulti render-notification
  (fn [channel-details payload _recipients _template]
    [(:channel_type channel-details) (:payload-type payload)]))

(defmulti send!
  (fn [channel-details _message]
    [(:channel_type channel-details)]))

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
