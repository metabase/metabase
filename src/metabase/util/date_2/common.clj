(ns metabase.util.date-2.common
  (:require [clojure.string :as str]))

;; TODO - not sure this belongs here, it seems to be a bit more general than just `date-2`.

(defn static-instances
  "Utility function to get the static members of a class. Returns map of `lisp-case` keyword names of members -> value."
  [^Class klass]
  (into {} (for [^java.lang.reflect.Field f (.getFields klass)
                 :when (.isAssignableFrom klass (.getType f))]
             [(keyword (str/lower-case (str/replace (.getName f) #"_" "-")))
              (.get f nil)])))
