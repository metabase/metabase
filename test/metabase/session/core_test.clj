(ns metabase.session.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.session.core :as session]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- activity-cache
  []
  @@#'session/session-last-update-times)

(def ^:private past-throttle-window
  "A [[metabase.util/since-ms]] stub that makes every cached entry look older than the throttle window."
  (constantly (inc @#'session/activity-update-throttle-ms)))

(deftest record-session-activity-update!-throttles-test
  (session/clear-session-activity-cache!)
  (let [key-hash (str (random-uuid))]
    (testing "the first activity update for a session is allowed through"
      (is (true? (session/record-session-activity-update! key-hash))))
    (testing "a second update within the throttle window is throttled"
      (is (false? (session/record-session-activity-update! key-hash))))
    (testing "an update after the throttle window has elapsed is allowed through again"
      (with-redefs [u/since-ms past-throttle-window]
        (is (true? (session/record-session-activity-update! key-hash)))))
    (testing "sessions are throttled independently of one another"
      (is (true? (session/record-session-activity-update! (str (random-uuid))))))))

(deftest prune-session-activity-cache!-test
  (session/clear-session-activity-cache!)
  (let [key-hash (str (random-uuid))]
    (session/record-session-activity-update! key-hash)
    (testing "entries inside the throttle window are kept"
      (session/prune-session-activity-cache!)
      (is (contains? (activity-cache) key-hash)))
    (testing "entries older than the throttle window are dropped"
      (with-redefs [u/since-ms past-throttle-window]
        (session/prune-session-activity-cache!))
      (is (not (contains? (activity-cache) key-hash))))))
