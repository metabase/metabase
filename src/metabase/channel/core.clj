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

(defmulti can-connect?
  "Check whether we can connect to a `channel-type` with `detail`.

  Returns `true` if can connect to the channel, otherwise return falsy or throw an appropriate exception.
  In case of failure, to provide a field-specific error message on UI, return or throw an :errors map where key is the
  field name and value is the error message.

  E.g:
    (can-connect? :slack {:email \"name\"})
    ;; => {:errors {:email \"Invalid email\"}}"
  {:added    "0.51.0"
   :arglists '([channel-type details])}
  (fn [channel-type _details]
    channel-type))

(defmulti render-notification
  "Given a notification content, return a sequence of channel-specific messages.

  The message format is channel-specific, one requirement is that it should be the same format that
  the [[send!]] multimethod expects."
  {:added    "0.51.0"
   :arglists '([channel-type notification-content template recipients])}
  (fn [channel-type notification-content _template _recipients]
    [channel-type (:payload_type notification-content)]))

(defmulti send!
  "Send a message to a channel."
  {:added    "0.51.0"
   :arglists '([channel message])}
  (fn [channel _message]
    (:type channel)))

;; ------------------------------------------------------------------------------------------------;;
;;                                             Utils                                               ;;
;; ------------------------------------------------------------------------------------------------;;

(defn find-and-load-metabase-channels!
  "Load namespaces that start with `metabase.channel."
  []
  (doseq [ns-symb u/metabase-namespace-symbols
          :when   (.startsWith (name ns-symb) "metabase.channel.")]
    (log/info "Loading channel namespace:" (u/format-color :blue ns-symb))
    (classloader/require ns-symb)))
