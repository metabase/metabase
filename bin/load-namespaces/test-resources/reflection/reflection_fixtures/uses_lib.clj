(ns reflection-fixtures.uses-lib
  (:require
   [reflection-lib.sloppy :as sloppy]))

(defn shout [^String s]
  (sloppy/upper s))
