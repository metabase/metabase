(ns build.plugin-uberjar-test
  (:require
   [build.plugin-uberjar :as plugin-uberjar]
   [clojure.test :refer :all]))

(deftest ^:parallel prune-provided-libs-test
  (let [basis {:classpath-roots ["core.jar" "plugin.jar"]
               :classpath       {"core.jar" {:path-key :core}
                                 "plugin.jar" {:path-key :plugin}}
               :libs            {'example/core   {:paths ["core.jar"]}
                                 'example/plugin {:paths ["plugin.jar"]}}}]
    (is (= {:classpath-roots ["plugin.jar"]
            :classpath       {"plugin.jar" {:path-key :plugin}}
            :libs            {'example/plugin {:paths ["plugin.jar"]}}}
           (plugin-uberjar/prune-provided-libs! basis {'example/core 'metabase-core})))))
