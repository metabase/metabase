(ns mage.codespell
  (:require
   [mage.shell :as shell]))

(set! *warn-on-reflection* true)

(defn codespell [_cli-args]
  (let [{:keys [exit], :or {exit -1}} (shell/sh* "codespell"
                                                 #_"dev"
                                                 "docs"
                                                 #_"e2e"
                                                 #_"enterprise"
                                                 #_"frontend"
                                                 #_"modules/drivers"
                                                 #_"src"
                                                 #_"test")]
    (System/exit exit)))
