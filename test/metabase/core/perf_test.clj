(ns metabase.core.perf-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.core.perf :as perf])
  (:import
   (java.nio.file Path)))

(set! *warn-on-reflection* true)

(deftest ^:parallel resolve-output-path-test
  (testing "\"true\" generates a timestamped filename"
    (let [^Path path (#'perf/resolve-output-path "true")]
      (is (instance? Path path))
      (is (.isAbsolute path))
      (is (re-matches #".*metabase-\d{4}_\d{2}_\d{2}\.jfr" (str path)))))
  (testing "custom filename is used as-is when it has .jfr extension"
    (let [^Path path (#'perf/resolve-output-path "my-profile.jfr")]
      (is (= "my-profile.jfr" (str (.getFileName path))))))
  (testing ".jfr extension is appended when missing"
    (let [^Path path (#'perf/resolve-output-path "my-profile")]
      (is (= "my-profile.jfr" (str (.getFileName path)))))))
