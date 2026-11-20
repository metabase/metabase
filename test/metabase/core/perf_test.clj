(ns metabase.core.perf-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [metabase.config.core :as config]
   [metabase.core.perf :as perf]
   [metabase.global-system.system :as global-system]
   [metabase.global-system.test-util :as global-system.tu]
   [metabase.test :as mt])
  (:import
   (clojure.lang ExceptionInfo)
   (java.io File)
   (java.nio.file Path)
   (jdk.jfr FlightRecorder Recording RecordingState)))

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
  (testing "a positive whole number of minutes is used, and anything else, including the blank default, falls back"
    (is (= {"10" 10, " 7 " 7, nil 5, "" 5, "soon" 5, "0" 5, "-3" 5}
           (into {}
                 (for [value ["10" " 7 " nil "" "soon" "0" "-3"]]
                   [value (mt/with-dynamic-fn-redefs [config/config-str (constantly value)]
                            (#'perf/save-rate-minutes 5))]))))))

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

(defn- running-recordings []
  (into #{}
        (filter #(= RecordingState/RUNNING (.getState ^Recording %)))
        (.getRecordings (FlightRecorder/getFlightRecorder))))

(deftest start-recording-stops-what-a-failed-start-began-test
  (testing "a start that fails after creating the recording leaves no recording running"
    (let [output (doto (File/createTempFile "perf-test" ".jfr") (.deleteOnExit))
          before (running-recordings)]
      (try
        (mt/with-dynamic-fn-redefs [perf/start-periodic-dump! (fn [& _] (throw (ex-info "dump not scheduled" {})))]
          (is (thrown-with-msg? ExceptionInfo #"dump not scheduled" (#'perf/start-recording! (str output)))))
        (is (= {:left-running #{}, :recording nil}
               {:left-running (set/difference (running-recordings) before)
                :recording    @@#'perf/recording-atom}))
        (finally
          ;; so a failure here cannot leave an unbounded recording running for the rest of the test run
          (doseq [^Recording recording (set/difference (running-recordings) before)]
            (.close recording)))))))
