(ns ^{:added "0.51.0"} metabase.channel.core
  "The Metabase channel system.

  The API is still in development and subject to change.")

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
  "Given a notification payload, return a sequence of channel-specific messages.

  The message format is channel-specific, one requirement is that it should be the same format that
  the [[send!]] multimethod expects."
  {:added    "0.51.0"
   :arglists '([channel-type notification-payload template recipients])}
  (fn [channel-type notification-payload _template _recipients]
    [channel-type (:payload_type notification-payload)]))

(defmulti send!
  "Send a message to a channel."
  {:added    "0.51.0"
   :arglists '([channel message])}
  (fn [channel _message]
    (:type channel)))
