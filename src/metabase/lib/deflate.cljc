(ns metabase.lib.deflate
  (:require [metabase.lib.dispatch :as lib.dispatch]))

(defmulti deflate
  {:arglists '([db-metadata x])}
  (fn [_db-metadata x]
    (lib.dispatch/dispatch-value x)))
