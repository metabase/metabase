(ns metabase-enterprise.remote-sync.impl-progress-test
  "Serialize-phase progress hook for remote-sync export (GHY-4132)."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]))

(set! *warn-on-reflection* true)

;; A CommitBuilder that records staged paths and does nothing else.
(defrecord RecordingCommit [staged]
  source.p/CommitBuilder
  (stage-upsert! [_ {:keys [path]}] (swap! staged conj path) nil)
  (stage-delete! [_ _] nil)
  (replace-all! [_] nil)
  (empty-commit? [_] false)
  (finish-commit! [_ _message] "sha")
  (abort-commit! [_] nil))

(deftest stage-writes-invokes-on-chunk-with-cumulative-count-test
  (testing "stage-writes calls on-chunk once per chunk with the running staged count, and stages everything"
    (with-redefs [;; make each row its own chunk (matching the real {:model_type :rows} chunk shape) and a
                  ;; trivial entity, so we exercise the loop deterministically without hitting serdes/the app DB
                  impl/->sized-chunks (fn [rows] (map (fn [row] {:model_type (:model_type row) :rows [row]}) rows))
                  impl/extract-chunk  (fn [{:keys [rows]}] (map (fn [row] [row {:e (:model_id row)}]) rows))]
      (let [staged (atom [])
            commit (->RecordingCommit staged)
            rows   [{:model_type "card" :model_id 1 :file_path "a"}
                    {:model_type "card" :model_id 2 :file_path "b"}
                    {:model_type "card" :model_id 3 :file_path "c"}]
            seen   (atom [])]
        (#'impl/stage-writes commit {} rows (fn [n] (swap! seen conj n)))
        (is (= [1 2 3] @seen) "cumulative staged count reported once per chunk")
        (is (= ["a" "b" "c"] @staged) "all rows staged")))))
