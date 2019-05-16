(ns metabase.util.pretty
  "Helpers to make it easier to nicely print our custom record types in the REPL or elsewhere."
  (:require [clojure.pprint :as pprint])
  (:import [clojure.lang IPersistentMap IRecord]
           java.util.Map))

(defprotocol PrettyPrintable
  "Implmement this protocol to return custom representations of objects when printing them."
  (pretty [_]
    "Return an appropriate representation of this object to be used when printing it, such as in the REPL or in log
    messages."))

(defmethod print-method metabase.util.pretty.PrettyPrintable
  [s writer]
  (print-method (pretty s) writer))

(defmethod pprint/simple-dispatch metabase.util.pretty.PrettyPrintable
  [s]
  (pprint/write-out (pretty s)))

(doseq [method [print-method pprint/simple-dispatch]
        tyype  [IRecord Map IPersistentMap]]
  (prefer-method method metabase.util.pretty.PrettyPrintable tyype))
