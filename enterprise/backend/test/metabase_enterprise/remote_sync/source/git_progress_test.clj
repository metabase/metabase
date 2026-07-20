(ns metabase-enterprise.remote-sync.source.git-progress-test
  "Push ProgressMonitor mapping for remote-sync export (GHY-4132)."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.source.git :as git]))

(set! *warn-on-reflection* true)

(deftest push-progress-monitor-maps-writing-objects-into-tail-test
  (testing "the push monitor reports [0.8, ~0.99] over the Writing objects phase and heartbeats 0.8 during
            other phases (so a locale where JGit never titles a phase \"Writing objects\", or reports an
            unknown/zero total, still gets liveness pings)"
    (let [reported (atom [])
          ^org.eclipse.jgit.lib.ProgressMonitor mon
          (#'git/->push-progress-monitor (fn [f] (swap! reported conj f)))]
      ;; a non-writing phase still heartbeats at push-progress-start, not the writing-phase ramp
      (.beginTask mon "Finding sources" 10)
      (.update mon 5)
      (.endTask mon)
      ;; the writing phase drives progress
      (.beginTask mon "Writing objects" 100)
      (.update mon 50)   ; halfway -> ~0.8 + 0.19*0.5
      (.update mon 50)   ; done    -> ~0.99
      (.endTask mon)
      (let [xs @reported]
        (is (seq xs) "reported at least once")
        (is (every? #(<= 0.8 % 0.99) xs) "all reports within the push tail band")
        (is (apply <= xs) "monotonic non-decreasing")
        (is (= 0.8 (first xs)) "non-writing phase heartbeats at push-progress-start")
        (is (> (last xs) 0.98) "writing phase ramp reaches close to the push tail's end")))))
