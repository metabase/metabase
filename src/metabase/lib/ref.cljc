(ns metabase.lib.ref
  (:refer-clojure :exclude [ref])
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::ref-style
  [:enum :ref.style/default :ref.style/broken-legacy-qp-results])

(mr/def ::ref-method.options
  [:map
   [:ref-style {:optional true, :default :ref.style/default} ::ref-style]])

(defmulti ref-method
  "Impl for [[ref]]. This should create a new ref every time it is called, i.e. it should have a fresh UUID every time
  you call it."
  {:arglists '([x options])}
  (fn [x _options]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(mu/defn ref :- ::lib.schema.ref/ref
  "Create a fresh ref that can be added to a query, e.g. a `:field`, `:aggregation`, or `:expression` reference. Will
  create a new UUID every time this is called."
  ([x]
   (ref x nil))

  ([x       :- some?
    options :- [:maybe ::ref-method.options]]
   (ref-method x options)))
