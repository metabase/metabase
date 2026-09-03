(ns metabase.app-db.toucan2
  "Toucan 2 integration helpers for the application database."
  (:require [next.jdbc.prepare]))

(deftype Param
         [value]
  next.jdbc.prepare/SettableParameter
  (set-parameter [_ stmt ix]
    (next.jdbc.prepare/set-parameter value stmt ix)))

(defmethod print-method
  Param
  [m writer]
  (print-method (tagged-literal 'param (.-value ^Param m)) writer))

(defn param
  [v]
  (->Param v))
