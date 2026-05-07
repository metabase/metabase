(ns metabase.root.mutable-component
  "Protocol for interacting with a mutable component's storage through a uniform interface.")

(defprotocol MutableComponentHandle
  "Handle for reading and mutating a single component's stored value."
  (current [handle]
    "Returns the current value (respecting any thread-local rebinding).")
  (root [handle]
    "Returns the root value, ignoring thread-local rebinding.")
  (do-with-value [handle new-value thunk]
    "Calls `thunk` with the value rebound to `new-value` for the dynamic extent of the call.")
  (reset-value! [handle new-value]
    "Sets the root value to `new-value`.")
  (swap-value!
    [handle f]
    [handle f args]
    "Updates the root value by applying `f` to the current value and any extra `args`."))
