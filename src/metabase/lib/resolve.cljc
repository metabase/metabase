(ns metabase.lib.resolve
  (:require [metabase.lib.dispatch :as lib.dispatch]))

;; TODO -- we should reverse the arguments so it's easier to use when threading stuff.
(defmulti resolve
  {:arglists '([metadata x])}
  (fn [_metadata x]
    (lib.dispatch/dispatch-value x)))

(defmethod resolve :default
  [_metadata x]
  x)
