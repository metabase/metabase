(ns metabase.util.system-info-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.system-info :as u.system-info]))

(deftest system-info-test
  (testing "system-info includes JVM hardware info for diagnosing performance problems"
    (let [info (u.system-info/system-info)]
      (testing "number of CPUs available to the JVM"
        (is (pos-int? (get info "jvm.available-processors"))))
      (testing "max memory available to the JVM, formatted like the startup log line"
        (is (re-matches #"[\d.]+ [KMGT]?B" (get info "jvm.max-memory"))))
      (testing "total physical memory on the host"
        (is (re-matches #"[\d.]+ [KMGT]?B" (get info "system.total-memory")))))))
