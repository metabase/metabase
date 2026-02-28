(ns metabase-enterprise.replacement.execute-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.replacement.execute :as execute]
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase-enterprise.replacement.protocols :as replacement.protocols]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest advance!-progress-write-boundaries-test
  (testing "advance! writes progress at batch boundaries and on final item"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/ReplacementRun]
        (let [writes (atom [])
              done?  (promise)]
          (with-redefs [replacement-run/update-progress!
                        (fn [_run-id progress]
                          (swap! writes conj progress))]
            (let [record (replacement-run/create-run! :card 1 :card 2 (mt/user->id :rasta))
                  progress (replacement-run/run-row->progress record done?)]
              (execute/execute-async!
               (fn [progress]
                 (replacement.protocols/set-total! progress 120)
                 ;; advance one-at-a-time for 120 items
                 (dotimes [_ 120]
                   (replacement.protocols/advance! progress)))
               progress)
              ;; wait for virtual thread
              (is (= :run/success (u/deref-with-timeout done? 500)))
              ;; Writes at items 50, 100, 120 (final) → progress 50/120, 100/120, 120/120
              (is (= [(double (/ 50 120)) (double (/ 100 120)) 1.0]
                     @writes))
              (is (=? {:is_active nil :progress 1.0 :status :succeeded}
                      (t2/select-one :model/ReplacementRun :id (:id record)))))))))))

(deftest advance!-count-arity-test
  (testing "advance! with count arity crosses boundaries correctly"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/ReplacementRun]
        (let [writes (atom [])
              done?  (promise)]
          (with-redefs [replacement-run/update-progress!
                        (fn [_run-id progress]
                          (swap! writes conj progress))]
            (let [record (replacement-run/create-run! :card 1 :card 2 (mt/user->id :rasta))
                  progress (replacement-run/run-row->progress record done?)]
              (execute/execute-async!
               (fn [progress]
                 (replacement.protocols/set-total! progress 100)
                 ;; advance by 30 four times: 30, 60, 90, then by 10 to finish
                 (replacement.protocols/advance! progress 30)
                 (replacement.protocols/advance! progress 30)
                 (replacement.protocols/advance! progress 30)
                 (replacement.protocols/advance! progress 10))
               progress)
              (is (= :run/success (u/deref-with-timeout done? 500)))
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
              done?   (promise)
              pause   (promise)
              ready   (promise)]
          (with-redefs [replacement-run/update-progress!
                        (fn [_run-id progress]
                          (swap! writes conj progress))]
            (let [record (replacement-run/create-run! :card 1 :card 2 (mt/user->id :rasta))
                  progress (replacement-run/run-row->progress record done?)]
              (execute/execute-async!
               (fn [progress]
                 (replacement.protocols/set-total! progress 130)
                 ;; enough to trigger one boundary
                 (dotimes [_ 60] (replacement.protocols/advance! progress))
                 (deliver ready :ready) ;; let outside thread cancel
                 @pause                 ;; wait for cancel to happen
                 ;; next to do the rest, including a boundary
                 (dotimes [_ 70] (replacement.protocols/advance! progress)))
               progress)
              @ready
              (replacement-run/cancel-run! (:id record))
              (deliver pause :continue)
              ;; Poll until run is no longer active (cancel-run! flips is_active)
              (is (= :run/cancelled (u/deref-with-timeout done? 500)))
              ;; First boundary write at 50/100 succeeds, canceled? is false.
              ;; cancel-run! sets is_active=nil. Next boundary at 100 writes progress,
              ;; then checks canceled? → true → throws. Both writes happen.
              (is (= [(double (/ 50 130)) (double (/ 100 130))] @writes)
                  "Both boundary writes happen; cancellation fires after the second write")
              (is (= :canceled (:status (t2/select-one :model/ReplacementRun :id (:id record))))
                  "Run status should be :canceled"))))))))
