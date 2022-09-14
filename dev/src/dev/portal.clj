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
