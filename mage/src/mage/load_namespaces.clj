(ns mage.load-namespaces
  (:require
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn load-namespaces
  "Runs the `:load-namespaces` alias, exiting with whatever it exited with."
  []
  (let [{:keys [exit], :or {exit -1}} (shell/sh* "clojure" "-M:ee:drivers:load-namespaces")]
    (u/exit exit)))
