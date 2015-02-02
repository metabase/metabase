(ns metabase.core
  (:gen-class))

(defn -main
  "I don't do a whole lot ... yet."
  [& args]
  (println "Hello, World!"))

(defn first-element [sequence default]
  (if (nil? sequence)
    default
    (first sequence)))