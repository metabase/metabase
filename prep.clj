(ns prep
  (:require [clojure.tools.deps.alpha :as deps]))

(defn edn []
  (deps/merge-edns ((juxt :root-edn :user-edn :project-edn) (deps/find-edn-maps))))

(defn basis [{:keys [aliases]}]
  (let [edn            (edn)
        combined-alias (deps/combine-aliases edn (set aliases))]
    (deps/calc-basis edn {:resolve-args combined-alias, :classpath-args combined-alias})))

(defn prep* [basis]
  (deps/prep-libs! (:libs basis) {:action :prep} basis))

(defn prep [{:keys [aliases], :as options}]
  (println "Prepping deps including aliases" (pr-str aliases) "...")
  (prep* (basis options)))
