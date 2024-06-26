(ns metabase.lib.schema.literal.js
  (:require
   [metabase.util.malli.registry :as mr]))

(defn big-int?
  "Is `x` an instance of the JavaScript `BigInt` class?"
  [x]
  ;; does `instance?` not work like we'd expect in JavaScript??
  (isa? (type x) js/BigInt))

(mr/def ::big-integer
  [:fn
   {:error/message "Instance of JS BigInt"}
   big-int?])
