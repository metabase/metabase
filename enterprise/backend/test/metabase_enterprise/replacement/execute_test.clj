(ns metabase-enterprise.replacement.execute-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.replacement.execute :as execute]
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest advance!-progress-write-boundaries-test
  (testing "advance! writes progress at batch boundaries and on final item"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/ReplacementRun]
        (let [writes (atom [])]
          (with-redefs [replacement-run/update-progress!
                        (fn [_run-id progress]
                          (swap! writes conj progress))]
            (let [run (execute/execute-async!
                       {:source-type :card :source-id 1
                        :target-type :card :target-id 2
                        :user-id     (mt/user->id :crowberto)}
                       (fn [progress]
                         (execute/set-total! progress 120)
                         ;; advance one-at-a-time for 120 items
                         (dotimes [_ 120]
                           (execute/advance! progress))))
                  deadline (+ (System/currentTimeMillis) 10000)]
              ;; wait for virtual thread
              (loop []
                (let [r (t2/select-one :model/ReplacementRun :id (:id run))]
                  (when (and (:is_active r) (< (System/currentTimeMillis) deadline))
                    (Thread/sleep 50)
                    (recur))))
              ;; Writes at items 50, 100, 120 (final) → progress 50/120, 100/120, 120/120
              (is (= [(double (/ 50 120))
                      (double (/ 100 120))
                      1.0]
                     @writes)))))))))

(deftest advance!-count-arity-test
  (testing "advance! with count arity crosses boundaries correctly"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/ReplacementRun]
        (let [writes (atom [])]
          (with-redefs [replacement-run/update-progress!
                        (fn [_run-id progress]
                          (swap! writes conj progress))]
            (let [run (execute/execute-async!
                       {:source-type :card :source-id 1
                        :target-type :card :target-id 2
                        :user-id     (mt/user->id :crowberto)}
                       (fn [progress]
                         (execute/set-total! progress 100)
                         ;; advance by 30 four times: 30, 60, 90, then by 10 to finish
                         (execute/advance! progress 30)
                         (execute/advance! progress 30)
                         (execute/advance! progress 30)
                         (execute/advance! progress 10)))
                  deadline (+ (System/currentTimeMillis) 10000)]
              (loop []
                (let [r (t2/select-one :model/ReplacementRun :id (:id run))]
                  (when (and (:is_active r) (< (System/currentTimeMillis) deadline))
                    (Thread/sleep 50)
                    (recur))))
              ;; advance(30): 0→30, crosses 0/50→0/50 boundary? quot(0,50)=0, quot(30,50)=0 → no
              ;; advance(30): 30→60, crosses? quot(30,50)=0, quot(60,50)=1 → yes, writes 0.6
              ;; advance(30): 60→90, crosses? quot(60,50)=1, quot(90,50)=1 → no
              ;; advance(10): 90→100, = total → yes, writes 1.0
              (is (= [0.6 1.0] @writes)))))))))

(deftest advance!-cancellation-on-boundary-test
  (testing "canceled? is checked on every progress write and throws"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/ReplacementRun]
        (let [writes  (atom [])
              run-id* (promise)]
          (with-redefs [replacement-run/update-progress!
                        (fn [_run-id progress]
                          (swap! writes conj progress))]
            (let [run (execute/execute-async!
                       {:source-type :card :source-id 1
                        :target-type :card :target-id 2
                        :user-id     (mt/user->id :crowberto)}
                       (fn [progress]
                         (execute/set-total! progress 100)
                         ;; advance 50 items, triggering a boundary write
                         (dotimes [_ 50]
                           (execute/advance! progress))
                         ;; Cancel the run in the DB
                         (replacement-run/cancel-run! (deref run-id* 5000 nil))
                         ;; next 50 should hit the boundary check and throw
                         (dotimes [_ 50]
                           (execute/advance! progress))))]
              (deliver run-id* (:id run))
              ;; Poll until run is no longer active (cancel-run! flips is_active)
              (let [deadline (+ (System/currentTimeMillis) 10000)]
                (loop []
                  (let [r (t2/select-one :model/ReplacementRun :id (:id run))]
                    (when (and (:is_active r) (< (System/currentTimeMillis) deadline))
                      (Thread/sleep 50)
                      (recur)))))
              ;; Grace period for virtual thread to finish catch block
              (Thread/sleep 200)
              ;; First boundary write at 50/100 succeeds, canceled? is false.
              ;; cancel-run! sets is_active=nil. Next boundary at 100 writes progress,
              ;; then checks canceled? → true → throws. Both writes happen.
              (is (= [0.5 1.0] @writes)
                  "Both boundary writes happen; cancellation fires after the second write")
              (is (= :canceled (:status (t2/select-one :model/ReplacementRun :id (:id run))))
                  "Run status should be :canceled"))))))))
