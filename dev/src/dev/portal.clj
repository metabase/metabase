(ns dev.portal
  (:require [portal.api :as p]))

(defonce
  ^{:doc "The handle to portal. Can be used as @p to get the selected item."}
  p
  (p/open {:port 5678}))

;; Listen by default.
(add-tap #'p/submit)

;; Register some useful functions for use in the portal window.
(doseq [f [#'reverse #'vec]]
  (p/register! f))

(defn unfreeze
  "Sometimes the portal window stops responding. Closing the window and
  running this function brings up a new, responsive window preserving
  the contents."
  []
  (p/open p))

(defn send-log
  "Tap `value` as a portal log message.

  The options :level, :ns, :line, :column and :time can be used to
  override the defaults (:info level, the current namespace, line -1,
  column -1 and the current time.)"
  ([value] (send-log value nil))
  ([value {:keys [level ns line column time]
           :or {level  :info
                ns     (ns-name *ns*)
                line   -1
                column -1
                time   (java.util.Date.)}}]
   (tap> {:result value
          :level  level
          :ns     ns
          :line   line
          :column column
          :time   time})))

(defmacro log
  "Send `value` as a log message to portal using the place of the call
  as source (namespace, line, column) of the message."
  [value & [opts]]
  `(send-log ~value ~(merge (meta &form)
                            {:ns (list 'quote (ns-name *ns*))}
                            opts)))

(defn debug-qp-log
  "Sends debug events from `dev.debug-qp/process-query-debug` to portal.

  This is a simplistic function that send known transformation events to
  portal as a log message. The diff of the second and third parameters
  form the message and the location of the definition of the var in the
  first parameter is used as origin.
  Any other events are sent to portal as is.

  A typical use looks like this:

  (debug-qp/process-query-debug a-query :printer portal/debug-qp-log)"
  [[tag middleware-var before after :as event]]
  (if (#{:dev.debug-qp/transformed-query, :dev.debug-qp/transformed-metadata
         :dev.debug-qp/transformed-result, :dev.debug-qp/transformed-row}
       tag)
    (send-log (with-meta [before after]
                {:portal.viewer/default :portal.viewer/diff})
              (update (meta middleware-var) :ns #(.name %)))
    (send-log event)))
