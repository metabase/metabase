(ns mage.runtests
  (:require
   [clojure.test :as t]))

(set! *warn-on-reflection* true)

(def ^:private test-ns
  ['mage.core-test
   'mage.quick-test-runner-test
   'mage.start-db-test])

(when (= *file* (System/getProperty "babashka.file"))
  (doseq [tns test-ns]
    (println "Requiring test namespace:" tns)
    (require tns)
    (println "Running tests in namespace:" tns)
    (t/run-tests tns))
  :ok)
