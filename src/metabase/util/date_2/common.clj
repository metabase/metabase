(ns metabase.util.date-2.common
  (:require [clojure.string :as str]))

(defn static-instances [^Class klass]
  (into {} (for [^java.lang.reflect.Field f (.getFields klass)
                 :when (.isAssignableFrom klass (.getType f))]
             [(keyword (str/lower-case (str/replace (.getName f) #"_" "-")))
              (.get f nil)])))
