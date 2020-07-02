(ns metabase.models.native-query-snippet.permissions
  "NativeQuerySnippets have different permissions implementations. In Metabase CE, anyone can read/edit/create all
  NativeQuerySnippets. EE has a more advanced implementation.

  The code in this namespace provides sort of a strategy pattern interface to the underlying permissions operations.
  The default implementation is defined below and can be swapped out at runtime with the more advanced EE
  implementation."
  (:require [potemkin.types :as p.types]
            [pretty.core :refer [PrettyPrintable]]))

(p.types/defprotocol+ PermissionsImpl
  "Protocol for implementing the permissions logic for NativeQuerySnippets."
  (can-read?* [this snippet] [this model id]
    "Can the current User read this `snippet`?")
  (can-write?*  [this snippet] [this model id]
    "Can the current User edit this `snippet`?")
  (can-create?* [this snippet] [this model id]
    "Can the current User save a new `snippet` with these values?"))

(defonce ^:private impl (atom nil))

(defn set-impl!
  "Change the implementation used for NativeQuerySnippet permissions. `new-impl` must satisfy the `PermissionsImpl`
  protocol defined above."
  [new-impl]
  (reset! impl new-impl))

(def default-impl
  "Default 'simple' permissions implementation for NativeQuerySnippets for Metabase CE."
  (reify
    PrettyPrintable
    (pretty [_]
      `default-impl)
    PermissionsImpl
    (can-read?* [_ _] true)
    (can-read?* [_ _ _] true)
    (can-write?* [_ _] true)
    (can-write?* [_ _ _] true)
    (can-create?* [_ _] true)
    (can-create?* [_ _ _] true)))

(when-not @impl
  (set-impl! default-impl))

(defn can-read?
  "Can the current User read this `snippet`?"
  ([snippet]
   (can-read?* @impl snippet))
  ([model id]
   (can-read?* @impl model id)))

(defn can-write?
  "Can the current User edit this `snippet`?"
  ([snippet]
   (can-write?* @impl snippet))
  ([model id]
   (can-write?* @impl model id)))

(defn can-create?
  "Can the current User save a new `snippet` with these values?"
  ([snippet]
   (can-create?* @impl snippet))
  ([model id]
   (can-create?* @impl model id)))
