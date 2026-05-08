(ns metabase.root.mutable-component
  "Protocol for interacting with a mutable component's storage through a uniform interface."
  (:refer-clojure :exclude [binding reset! swap!]))

(defprotocol MutableComponentHandle
  "Handle for reading and mutating a single component's stored value."
  (current [handle]
    "Returns the current value (respecting any thread-local rebinding).")
  (root [handle]
    "Returns the root value, ignoring thread-local rebinding.")
  (binding [handle new-value thunk]
    "Calls `thunk` with the value rebound to `new-value` for the dynamic extent of the call.
     Visible only to `thunk` and code it (transitively, on the same thread) calls.")
  (reset! [handle new-value]
    "Sets the value in the atom held by the current dynamic binding. Visible to all scopes
     reading through that same binding (including sibling calls), but not to code outside
     the current dynamic scope.")
  (swap!
    [handle f]
    [handle f args]
    "Updates the value in the atom held by the current dynamic binding by applying `f` to
     the current value and any extra `args`. Visibility same as [[reset!]].")
  (alter-root [handle new-value]
    "Installs a new root binding (a fresh atom) for the underlying var. Visible to all
     threads and all scopes that are not inside an active dynamic binding, ignoring any
     currently-active dynamic bindings on this thread."))
