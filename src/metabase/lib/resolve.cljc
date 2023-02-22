(ns metabase.lib.resolve
  (:require [metabase.lib.dispatch :as lib.dispatch]))

(defmulti resolve
  {:arglists '([metadata x])}
  (fn [_metadata x]
    (lib.dispatch/dispatch-value x)))

(defmethod resolve :default
  [_metadata x]
  x)
