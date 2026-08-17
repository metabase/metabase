(ns metabase.global-system.mutable-component
  "Protocol for interacting with a mutable component's storage through a uniform interface."
  (:refer-clojure :exclude [binding reset! swap!]))

(defprotocol MutableComponentHandle
  "Handle for reading and mutating a single component's stored value. Deref the handle to read the value
   currently visible to this thread."
  (binding [handle new-value thunk]
    "Calls `thunk` with the value rebound to `new-value` for the dynamic extent of the call.
     Visible only to `thunk` and code it (transitively, on the same thread) calls.")
  (reset! [handle new-value]
    "Sets the value in whichever slot this thread currently reads: the thread-local one when a [[binding]]
     is active, otherwise the root, in which case every thread outside a [[binding]] sees it too.")
  (swap!*
    [handle f args]
    "Same as [[swap!]] but accepts [[args]] as an explicit collection. Prefer [[swap!]] in most cases.")
  (alter-root [handle new-value]
    "Installs `new-value` as the root value and returns the value it replaced. Visible to every thread and
     scope not inside an active [[binding]] of this component, including this one."))

(defn swap!
  "Updates the value by applying `f` to the current value and any extra `args`. Visibility same
   as [[reset!]].

   This varargs shim exists just because protocol methods can't take varargs."
  [handle f & args]
  (swap!* handle f args))
