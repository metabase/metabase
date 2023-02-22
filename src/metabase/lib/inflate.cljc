(ns metabase.lib.inflate
  (:require [metabase.lib.dispatch :as lib.dispatch]))

(defmulti inflate
  {:arglists '([db-metadata x])}
  (fn [_db-metadata x]
    (lib.dispatch/dispatch-value x)))
