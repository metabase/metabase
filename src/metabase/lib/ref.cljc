(ns metabase.lib.ref
  (:refer-clojure :exclude [ref])
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.util.malli :as mu]))

;;; TODO (Cam 6/12/25) -- update `ref-method` to take an options map instead of needing a dynamic variable for stuff
;;; like this.
(def ^:dynamic *ref-style*
  "The style of field ref to generate -- either the default MLv2-style (`:ref.style/default`) or the broken legacy style
  returned by the QP results (`:ref.style/broken-legacy-qp-results`). These broken refs are mostly generated for
  compatibility with legacy viz settings maps that used them as keys."
  :ref.style/default)

(defmulti ref-method
  "Impl for [[ref]]. This should create a new ref every time it is called, i.e. it should have a fresh UUID every time
  you call it."
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(mu/defn ref :- ::lib.schema.ref/ref
  "Create a fresh ref that can be added to a query, e.g. a `:field`, `:aggregation`, or `:expression` reference. Will
  create a new UUID every time this is called."
  [x :- some?]
  (ref-method x))
