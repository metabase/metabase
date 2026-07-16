(ns metabase-enterprise.remote-sync.source.git-progress-test
  "Push ProgressMonitor mapping for remote-sync export (GHY-4132)."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.source.git :as git]))

(set! *warn-on-reflection* true)

(deftest push-progress-monitor-maps-writing-objects-into-tail-test
  (testing "the push monitor reports [0.8, ~0.99] over the Writing objects phase and ignores other phases"
    (let [reported (atom [])
          ^org.eclipse.jgit.lib.ProgressMonitor mon
          (#'git/->push-progress-monitor (fn [f] (swap! reported conj f)))]
      ;; a non-writing phase should not move the bar
      (.beginTask mon "Finding sources" 10)
      (.update mon 5)
      (.endTask mon)
      ;; the writing phase drives progress
      (.beginTask mon "Writing objects" 100)
      (.update mon 50)   ; halfway -> ~0.8 + 0.19*0.5
      (.update mon 50)   ; done    -> ~0.99
      (.endTask mon)
      (let [xs @reported]
        (is (seq xs) "reported at least once during Writing objects")
        (is (every? #(<= 0.8 % 0.99) xs) "all reports within the push tail band")
        (is (apply <= xs) "monotonic non-decreasing")))))
