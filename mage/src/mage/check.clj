(ns mage.check
  (:require
   [mage.shell :as shell]))

(set! *warn-on-reflection* true)

(defn check [_cli-args]
  (let [{:keys [exit], :or {exit -1}} (shell/sh* "clojure" "-M:ee:drivers:check")]
    (System/exit exit)))
