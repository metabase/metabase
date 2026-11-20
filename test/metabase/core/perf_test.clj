(ns metabase.core.perf-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.config.core :as config]
   [metabase.core.perf :as perf]
   [metabase.global-system.system :as global-system]
   [metabase.global-system.test-util :as global-system.tu]
   [metabase.test :as mt])
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
    (mt/with-dynamic-fn-redefs [config/config-int (constantly 10)]
      (is (= 10 (#'perf/save-rate-minutes 5)))
      (is (= 10 (#'perf/save-rate-minutes 30)))))
  (testing "falls back to default when env var is nil"
    (mt/with-dynamic-fn-redefs [config/config-int (constantly nil)]
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

(def ^:private later-component
  (global-system/mutable-component-handle ::later (constantly nil)))

(deftest recording-starts-through-the-global-system-test
  (testing "the recording starts through the global system, so a halt stops it after what started later"
    (let [handle     @#'perf/recording-component
          halt-order #(filterv #{handle later-component} (global-system.tu/halt-order))
          stops      (atom 0)]
      (global-system.tu/with-root handle nil
        (global-system.tu/with-root later-component nil
          (mt/with-dynamic-fn-redefs [config/config-str    (constantly "true")
                                      perf/start-recording! (constantly ::recording)
                                      perf/stop-recording!  #(swap! stops inc)]
            (try
              (perf/maybe-enable-monitoring!)
              (global-system/start! later-component (constantly ::later) (constantly nil))
              (let [after-start (halt-order)]
                (perf/stop-monitoring!)
                (is (= {:after-start [later-component handle]
                        :after-stop  {:halt-order [later-component], :stops 1}}
                       {:after-start after-start
                        :after-stop  {:halt-order (halt-order), :stops @stops}})))
              (finally
                (global-system/stop! later-component)
                (global-system/stop! handle)))))))))

(deftest stop-monitoring-stops-a-recording-left-by-a-failed-start-test
  (testing "a start that throws after creating the recording registers nothing, but stopping still stops it"
    (let [stops (atom 0)]
      (global-system.tu/with-root @#'perf/recording-component nil
        (mt/with-dynamic-fn-redefs [config/config-str     (constantly "true")
                                    perf/start-recording! (fn [_] (throw (ex-info "save rate rejected" {})))
                                    perf/stop-recording!  #(swap! stops inc)]
          (perf/maybe-enable-monitoring!)
          (perf/stop-monitoring!)
          (is (= 1 @stops)))))))
