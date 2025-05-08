(ns metabase.actions.events
  (:require
   [metabase.events.core :as events]))

(derive ::event :metabase/event)

(derive :event/action.invoked ::event)
(derive :event/action.success ::event)
(derive :event/action.failure ::event)

(defn publish-action-invocation!
  "Publish the details of action of how a"
  [action-kw {:keys [invocation-id user-id] :as _context} inputs]
  ;; What do we want to do with the rest of the context? De-hydrate it somehow?
  (->> {:action        action-kw
        :invocation_id invocation-id
        :actor_id      user-id
        :inputs        inputs}
       (events/publish-event! :event/action.invoked)))

(defn publish-action-success!
  "Publish the results returned from a successful action."
  [action-kw {:keys [invocation-id user-id] :as _context-after} outputs]
  ;; What do we want to do with the rest of the context? De-hydrate it somehow?
  (->> {:action        action-kw
        :invocation_id invocation-id
        :actor_id      user-id
        :outputs       outputs}
       (events/publish-event! :event/action.success)))

;; TODO what will it mean if we have partial failure? Will this event include the partial success values?
;;      similarly do we want to support "multiple errors"? deep product questions, revisit when we do Workflows.
(defn publish-action-failure!
  "Publish the error returned from a failed action."
  [action-kw {:keys [invocation-id user-id] :as _context-before} msg info]
  (->> {:action        action-kw
        :invocation_id invocation-id
        :actor_id      user-id
        :error         (:error info)
        :message       msg
        :info          info}
       (events/publish-event! :event/action.failure)))
