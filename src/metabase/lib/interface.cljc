(ns metabase.lib.interface
  (:refer-clojure :exclude [resolve])
  (:require [metabase.lib.dispatch :as lib.dispatch]))

(defmulti ->mbql
  "Convert something to an MBQL clause or placeholder. Should be called on args to various clause helpers, for
  example [[metabase.lib.filter/=]]. Something like Field metadata might want to implement this to return a `:field`
  clause."
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defmethod ->mbql :default
  [x]
  x)

(defmulti resolve
  "Replace placeholder MBQL clauses with real clauses once metadata becomes available.

  Example: [[metabase.lib.field/field]] returns a `:field/unresolved` when its called with something like a
  string Field name, because we have no way of figuring out what Field we're talking about (or the base type for that
  Field if it's coming from the previous stage) until we have metadata, but we still want to be able to use `field`
  without having to pass metadata in to it:

    (lib/field \"VENUES\" \"ID\")
    =>
    [:field/unresolved {:table-name \"VENUES\", :field-name \"ID\"}]

  Once metadata is available, we can replace a `:field/unresolved` with an actual `:field` clause:

    (resolve metadata [:field/unresolved {:table-name \"VENUES\", :field-name \"ID\"}])
    =>
    [:field 1 nil]"
  {:arglists '([x metadata])}
  (fn [x _metadata]
    (lib.dispatch/dispatch-value x)))

(defmethod resolve :default
  [x _metadata]
  x)
