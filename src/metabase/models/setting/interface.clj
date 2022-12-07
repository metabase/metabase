(ns metabase.models.setting.interface
  "Multimethod definitions for getting and setting Settings of different types. Actual implementations live
  in [[metabase.models.setting]].")

(defmulti get-value-of-type
  "Get the value of `setting-definition-or-name` as a value of type `setting-type`. This is used as the default getter
  for Settings with `setting-type`.

  Impls should call [[get-raw-value]] to get the underlying possibly-serialized value and parse it appropriately if it
  comes back as a String; impls should only return values that are of the correct type (e.g. the `:boolean` impl
  should only return [[Boolean]] values)."
  {:arglists '([setting-type setting-definition-or-name])}
  (fn [setting-type _]
    (keyword setting-type)))

(defmulti set-value-of-type!
  "Set the value of a `setting-type` `setting-definition-or-name`. A `nil` value deletes the current value of the
  Setting (when set in the application database). Returns `new-value`.

  Impls of this method should ultimately call the implementation for `:string`, which handles the low-level logic of
  updating the cache and application database."
  {:arglists '([setting-type setting-definition-or-name new-value])}
  (fn [setting-type _ _]
    (keyword setting-type)))
