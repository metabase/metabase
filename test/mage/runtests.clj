(ns mage.runtests
  (:require
   [clojure.test :as t]))

(set! *warn-on-reflection* true)

(def ^:private test-ns
  '[mage.core-test mage.examples-test mage.start-db-test])

(when (= *file* (System/getProperty "babashka.file"))
  (run! require test-ns)
  (run! t/run-tests test-ns)
  :ok)
