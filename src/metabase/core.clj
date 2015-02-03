(ns metabase.core
  (:gen-class)
  (:require [clojure.tools.logging :as log]))

(defn -main
  "I don't do a whole lot ... yet."
  [& args]
  (println "Hello, World!")
  (log/info "testing logging"))

(defn first-element [sequence default]
  (if (nil? sequence)
    default
    (first sequence)))