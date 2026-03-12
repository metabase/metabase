(ns metabase.core.perf-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.config.core :as config]
   [metabase.core.perf :as perf])
  (:import
   (java.nio.file Path)))

(set! *warn-on-reflection* true)

(deftest ^:parallel resolve-output-path-test
  (testing "\"true\" generates a timestamped filename with date and time"
    (let [^Path path (#'perf/resolve-output-path "true")]
      (is (instance? Path path))
      (is (.isAbsolute path))
      (is (re-matches #".*metabase-\d{8}_\d{6}\.jfr" (str path)))))
  (testing "custom filename is used as-is when it has .jfr extension"
    (let [^Path path (#'perf/resolve-output-path "my-profile.jfr")]
      (is (= "my-profile.jfr" (str (.getFileName path)))))))

(deftest save-rate-minutes-test
  (testing "returns custom value when env var is set"
    (with-redefs [config/config-int (constantly 10)]
      (is (= 10 (#'perf/save-rate-minutes 5)))
      (is (= 10 (#'perf/save-rate-minutes 30)))))
  (testing "falls back to default when env var is nil"
    (with-redefs [config/config-int (constantly nil)]
      (is (= 5 (#'perf/save-rate-minutes 5)))
      (is (= 30 (#'perf/save-rate-minutes 30))))))

(deftest ^:parallel directory-mode?-test
  (testing "blank string is not directory mode"
    (is (not (#'perf/directory-mode? ""))))
  (testing "\"false\" is not directory mode"
    (is (not (#'perf/directory-mode? "false"))))
  (testing "\"true\" is not directory mode"
    (is (not (#'perf/directory-mode? "true"))))
  (testing ".jfr file is not directory mode"
    (is (not (#'perf/directory-mode? "my-profile.jfr"))))
  (testing "plain string is directory mode"
    (is (#'perf/directory-mode? "/tmp/perf-data")))
  (testing "relative path is directory mode"
    (is (#'perf/directory-mode? "perf-data"))))
