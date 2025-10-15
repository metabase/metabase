(ns metabase-enterprise.action-v2.models.undo-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.action-v2.models.undo :as undo]
   [metabase-enterprise.action-v2.test-util :as action-v2.tu]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users-personal-collections))

(deftest ^:parallel diff-keys-test
  (testing "Detect which keys have changes"
    (is (= [:a :b :c] (#'undo/diff-keys
                       nil
                       (zipmap [:a :b :c] (range)))))
    (is (= [:a :b :c] (#'undo/diff-keys
                       (zipmap [:a :b :c] (range))
                       nil)))
    (is (= [:b :c :d] (#'undo/diff-keys
                       (zipmap [:a :b :c] (range))
                       (zipmap [:a :c :d] (range)))))))

(defn- table-rows [table-id]
  (mt/rows
   (qp/process-query
    {:database (mt/id)
     :type     :query
     :query    {:source-table table-id}})))

(defn next-batch-num
  "Return the batch number of the new change that we would (un-)revert.
  NOTE: this does not check whether there is a conflict preventing us from actually performing it."
  [undo-or-redo user-id scope]
  (:batch_num (first (#'undo/next-batch (= :undo undo-or-redo) user-id scope))))

(defn- undo-via-api! [user-id scope]
  (mt/user-http-request user-id :post "/ee/action-v2/execute-bulk"
                        {:action :data-editing/undo
                         :scope  scope
                         :inputs [{}]}))

(defn- redo-via-api! [user-id scope]
  (mt/user-http-request user-id :post "/ee/action-v2/execute-bulk"
                        {:action :data-editing/redo
                         :scope  scope
                         :inputs [{}]}))

(defn- write-sequence! [table-id pk states]
  (loop [prior  nil
         states states]
    (when (seq states)
      (let [[user-id value] (first states)]
        (case [(some? prior) (some? value)]
          [false false] nil
          [false true] (action-v2.tu/create-rows! table-id user-id 200 [(merge pk value)])
          [true false] (action-v2.tu/delete-rows! table-id user-id 200 [pk])
          [true true] (action-v2.tu/update-rows! table-id user-id 200 [(merge pk value)]))
        (recur value (rest states))))))

;; I'm OK reducing this scenario's scope once we have e2e tests.
;; Until then, I think this is ideal.
#_{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(deftest undo-redo-single-user-single-table-single-record-integration-test
  (mt/with-empty-h2-app-db!
    (mt/with-premium-features #{:table-data-editing}
      (testing "Single-user chain, non-generated pk"
        ;; TODO test with a real PK
        ;; Beware: h2 will not allow un-delete, we'll need to adjust the test not to include deletion in its history.
        ;;         and, we'll want to test the failure we get when we try to un-delete
        ;; Blocker for other drivers: https://linear.app/metabase/issue/WRK-223/pk-creation-for-non-h2-drivers
        (action-v2.tu/with-test-tables! [table-id [{:id             [:int]
                                                    :name           [:text]
                                                    :favourite_food [:text]}
                                                   {:primary-key [:id]}]]
          (let [user-id    (mt/user->id :crowberto)
                test-scope {:table-id table-id}]

            (write-sequence! table-id {:id 1} [[user-id {:name "Snorkmaiden" :favourite_food "pork"}]
                                               [user-id {:name "Snorkmaiden" :favourite_food "orc"}]
                                               [user-id nil]])

            (is (= [] (table-rows table-id)))

            (is (next-batch-num :undo user-id test-scope))
            (is (not (next-batch-num :redo user-id test-scope)))
            (is (= {:outputs [{:op "created", :table-id table-id :row {:id 1, :name "Snorkmaiden", :favourite_food "orc"}}]}
                   (undo-via-api! user-id test-scope)))
            (is (= [[1 "Snorkmaiden" "orc"]] (table-rows table-id)))

            (is (next-batch-num :undo user-id test-scope))
            (is (next-batch-num :redo user-id test-scope))
            (is (= {:outputs [{:op "updated", :table-id table-id, :row {:id 1, :name "Snorkmaiden", :favourite_food "pork"}}]}
                   (undo-via-api! user-id test-scope)))
            (is (= [[1 "Snorkmaiden" "pork"]] (table-rows table-id)))

            (is (next-batch-num :undo user-id test-scope))
            (is (next-batch-num :redo user-id test-scope))
            (is (= {:outputs [{:op "deleted", :table-id table-id, :row {:id 1}}]}
                   (undo-via-api! user-id test-scope)))
            (is (= [] (table-rows table-id)))

            (is (not (next-batch-num :undo user-id test-scope)))
            (is (next-batch-num :redo user-id test-scope))
            (is (= "Nothing to do" (undo-via-api! user-id test-scope)))

            (is (not (next-batch-num :undo user-id test-scope)))
            (is (next-batch-num :redo user-id test-scope))
            (is (= {:outputs [{:op "created", :table-id table-id :row {:id 1, :name "Snorkmaiden", :favourite_food "pork"}}]}
                   (redo-via-api! user-id test-scope)))
            (is (= [[1 "Snorkmaiden" "pork"]] (table-rows table-id)))

            (is (next-batch-num :undo user-id test-scope))
            (is (next-batch-num :redo user-id test-scope))
            (is (= {:outputs [{:op "updated", :table-id table-id, :row {:id 1, :name "Snorkmaiden", :favourite_food "orc"}}]}
                   (redo-via-api! user-id test-scope)))
            (is (= [[1 "Snorkmaiden" "orc"]] (table-rows table-id)))

            (is (next-batch-num :undo user-id test-scope))
            (is (next-batch-num :redo user-id test-scope))
            (is (= {:outputs [{:op "deleted", :table-id table-id, :row {:id 1}}]}
                   (redo-via-api! user-id test-scope)))
            (is (= [] (table-rows table-id)))

            (is (next-batch-num :undo user-id test-scope))
            (is (not (next-batch-num :redo user-id test-scope)))
            (is (= "Nothing to do" (redo-via-api! user-id test-scope)))

            (is (next-batch-num :undo user-id test-scope))
            (is (not (next-batch-num :redo user-id test-scope)))))))))

;; I'm OK reducing this scenario's scope once we have e2e tests.
;; Until then, I think this is ideal.
#_{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(deftest undo-redo-multi-user-single-table-single-record-integration-test
  (mt/with-empty-h2-app-db!
    (mt/with-premium-features #{:table-data-editing}
      (testing "Multi-user chain"
        (action-v2.tu/with-test-tables! [table-id [{:id    [:int]
                                                    :name  [:text]
                                                    :power [:int]}
                                                   {:primary-key [:id]}]]
          (mt/with-temp [:model/User {user-2 :id} {:is_superuser true}]
            (let [user-1     (mt/user->id :crowberto)
                  test-scope {:table-id table-id}]

             ;; NOTE: this test relies on the "conflicts even when different columns changed" semantics
             ;; If we improve the semantics, we'll need to improve this test!

              (write-sequence! table-id {:id 2} [[user-1 {:name "Moomintroll" :power 3}]
                                                 [user-1 {:name "Moomintroll" :power 9001}]
                                                 [user-2 {:name "Moominswole" :power 9001}]
                                                 [user-1 nil]])

              (is (= [] (table-rows table-id)))

              (is (next-batch-num :undo user-2 test-scope))
              (is (not (next-batch-num :redo user-2 test-scope)))
              (is (= "Your previous change has a conflict with another edit" (undo-via-api! user-2 test-scope)))

              (is (next-batch-num :undo user-1 test-scope))
              (is (not (next-batch-num :redo user-1 test-scope)))
              (is (= {:outputs [{:op "created", :table-id table-id, :row {:id 2, :name "Moominswole", :power 9001}}]}
                     (undo-via-api! user-1 test-scope)))
              (is (= [[2 "Moominswole" 9001]] (table-rows table-id)))

              (is (next-batch-num :undo user-1 test-scope))
              (is (next-batch-num :redo user-1 test-scope))
              (is (= "Your previous change has a conflict with another edit" (undo-via-api! user-1 test-scope)))

              (is (next-batch-num :undo user-1 test-scope))
              (is (next-batch-num :redo user-1 test-scope))
              (is (next-batch-num :undo user-2 test-scope))
              (is (not (next-batch-num :redo user-2 test-scope)))
              (is (= {:outputs [{:op "updated", :table-id table-id, :row {:id 2, :name "Moomintroll", :power 9001}}]}
                     (undo-via-api! user-2 test-scope)))
              (is (= [[2 "Moomintroll" 9001]] (table-rows table-id)))

              (is (next-batch-num :undo user-1 test-scope))
              (is (next-batch-num :redo user-1 test-scope))
              (is (= {:outputs [{:op "updated", :table-id table-id, :row {:id 2, :name "Moomintroll", :power 3}}]}
                     (undo-via-api! user-1 test-scope)))
              (is (= [[2 "Moomintroll" 3]] (table-rows table-id)))

              (is (next-batch-num :undo user-1 test-scope))
              (is (next-batch-num :redo user-1 test-scope))
              (is (= {:outputs [{:op "deleted", :table-id table-id, :row {:id 2}}]}
                     (undo-via-api! user-1 test-scope)))
              (is (= [] (table-rows table-id)))

              (is (not (next-batch-num :undo user-1 test-scope)))
              (is (next-batch-num :redo user-1 test-scope))
              (is (= "Nothing to do" (undo-via-api! user-1 test-scope)))

              (is (not (next-batch-num :undo user-1 test-scope)))
              (is (next-batch-num :redo user-1 test-scope))
              (is (= {:outputs [{:op "created", :table-id table-id, :row {:id 2, :name "Moomintroll", :power 3}}]}
                     (redo-via-api! user-1 test-scope)))
              (is (= [[2 "Moomintroll" 3]] (table-rows table-id)))

              (is (next-batch-num :undo user-1 test-scope))
              (is (next-batch-num :redo user-1 test-scope))
              (is (= {:outputs [{:op "updated", :table-id table-id, :row {:id 2, :name "Moomintroll", :power 9001}}]}
                     (redo-via-api! user-1 test-scope)))
              (is (= [[2 "Moomintroll" 9001]] (table-rows table-id)))

              (is (next-batch-num :undo user-1 test-scope))
              (is (next-batch-num :redo user-1 test-scope))
              (is (= {:outputs [{:op "updated", :table-id table-id, :row {:id 2, :name "Moominswole", :power 9001}}]}
                     (redo-via-api! user-2 test-scope)))
              (is (= [[2 "Moominswole" 9001]] (table-rows table-id)))

              (is (next-batch-num :undo user-1 test-scope))
              (is (next-batch-num :redo user-1 test-scope))
              (is (= {:outputs [{:op "deleted", :table-id table-id, :row {:id 2}}]}
                     (redo-via-api! user-1 test-scope)))
              (is (= [] (table-rows table-id)))

              (is (next-batch-num :undo user-1 test-scope))
              (is (not (next-batch-num :redo user-1 test-scope)))
              (is (= "Nothing to do" (redo-via-api! user-1 test-scope)))

              (is (next-batch-num :undo user-2 test-scope))
              (is (not (next-batch-num :redo user-2 test-scope)))
              (is (= "Nothing to do" (redo-via-api! user-2 test-scope)))

              (is (next-batch-num :undo user-1 test-scope))
              (is (not (next-batch-num :redo user-1 test-scope))))))))))

(deftest undo-reverted-changes-integration-test
  (mt/with-empty-h2-app-db!
    (mt/with-premium-features #{:table-data-editing}
      (testing "Reverted changes have their snapshots deleted when there are further changes"
        (action-v2.tu/with-test-tables! [table-id [{:id     [:int]
                                                    :name   [:text]
                                                    :status [:text]}
                                                   {:primary-key [:id]}]]
          (let [user-id    (mt/user->id :crowberto)
                test-scope {:table-id table-id}]

            ;; NOTE: this test relies on the "conflicts even when different columns changed" semantics
            ;; If we improve the semantics, we'll need to improve this test!

            (write-sequence! table-id {:id 1} [[user-id {:name "Too-ticky" :status "sitting"}]
                                               [user-id {:name "Too-tickley" :status "squirming"}]
                                               [user-id nil]])

            (write-sequence! table-id {:id 2} [[user-id {:name "Toffle" :status "uncomfortable"}]
                                               [user-id {:name "Toffle" :status "comforted"}]
                                               [user-id nil]])

            (action-v2.tu/create-rows! table-id user-id 200 [{:id 1, :name "Too-tickley", :status "squirming"}])

            (action-v2.tu/create-rows! table-id user-id 200 [{:id 2, :name "Toggle", :status "restored"}])
            (action-v2.tu/delete-rows! table-id user-id 200 [{:id 2}])

            (is (= [[1 "Too-tickley" "squirming"]] (table-rows table-id)))

            (is (nil? (next-batch-num :redo user-id test-scope)))
            (is (next-batch-num :undo user-id test-scope))

            (undo-via-api! user-id test-scope)
            (is (= [[1 "Too-tickley" "squirming"]
                    [2 "Toggle" "restored"]] (table-rows table-id)))

            (redo-via-api! user-id test-scope)
            (is (= [[1 "Too-tickley" "squirming"]] (table-rows table-id)))))))))

(defn- count-batches [& [where]]
  (val (ffirst (t2/query {:select [[[:count [:distinct :batch_num]] :cnt]]
                          :from   [(t2/table-name :model/Undo)]
                          :where  (or where true)}))))

(deftest prune-snapshots-test
  (mt/with-empty-h2-app-db!
    (mt/with-premium-features #{:table-data-editing}
      (testing "We delete older batches when they exceed our retention limits"
        (action-v2.tu/with-test-tables! [table-1 [{:id [:int]} {:primary-key [:id]}]
                                         table-2 [{:id [:int]} {:primary-key [:id]}]]
          (let [user-1     (mt/user->id :crowberto)
                user-2     (mt/user->id :rasta)]

            (testing "Total rows"
              (with-redefs [undo/retention-total-rows 17]
                (dotimes [i 25]
                  (undo/track-change! user-1
                                      {:table-id table-1}
                                      {table-1
                                       {{:id 1} {:raw_before (if (even? i) {} nil)
                                                 :raw_after  (if (even? i) nil {})}
                                        {:id 2} {:raw_before (if (odd? i) {} nil)
                                                 :raw_after  (if (odd? i) nil {})}}})))

              (is (= 16 (t2/count :model/Undo)))
              (is (= 8 (count-batches))))

            (testing "Total batches"
              (with-redefs [undo/retention-total-batches 15]
                (dotimes [i 25]
                  (undo/track-change! user-1
                                      {:table-id table-1}
                                      {table-1
                                       {{:id 1} {:raw_before (if (even? i) {} nil)
                                                 :raw_after  (if (even? i) nil {})}
                                        {:id 2} {:raw_before (if (odd? i) {} nil)
                                                 :raw_after  (if (odd? i) nil {})}}})))

              (is (= 30 (t2/count :model/Undo)))
              (is (= 15 (count-batches))))

            (testing "User id"
              (with-redefs [undo/retention-batches-per-user 5]
                (dotimes [i 25]
                  ;; just toggle existence
                  (undo/track-change! (if (zero? (mod i 3)) user-1 user-2)
                                      {:table-id table-1}
                                      {table-1
                                       {{:id 1} {:raw_before (if (even? i) {} nil)
                                                 :raw_after  (if (even? i) nil {})}
                                        {:id 2} {:raw_before (if (odd? i) {} nil)
                                                 :raw_after  (if (odd? i) nil {})}}})))

              (is (= 20 (t2/count :model/Undo)))
              (is (= 10 (count-batches)))
              (is (= 5 (count-batches [:= :user_id user-1])))
              (is (= 5 (count-batches [:= :user_id user-2]))))

            (testing "Scope"
              (t2/delete! :model/Undo)
              (with-redefs [undo/retention-batches-per-scope 9]
                (dotimes [i 35]
                  ;; just toggle existence
                  (let [table-id (if (zero? (mod i 5)) table-1 table-2)]
                    (undo/track-change! user-1
                                        {:table-id table-id}
                                        {table-id
                                         {{:id 1} {:raw_before (if (even? i) {} nil)
                                                   :raw_after  (if (even? i) nil {})}
                                          {:id 2} {:raw_before (if (odd? i) {} nil)
                                                   :raw_after  (if (odd? i) nil {})}}})))

                (is (= 32 (t2/count :model/Undo)))
                (is (= 16 (count-batches)))
                (is (= 7 (count-batches [:= :table_id table-1])))
                (is (= 9 (count-batches [:= :table_id table-2])))))

            (testing "A haphazard mix"
              (with-redefs [undo/retention-total-rows        17
                            undo/retention-total-batches     21
                            undo/retention-batches-per-user  5
                            undo/retention-batches-per-scope 9]

                (dotimes [i 25]
                  ;; just toggle existence
                  (undo/track-change! (if (zero? (mod i 3)) user-1 user-2)
                                      {:dashboard-id 1}
                                      {(if (zero? (mod i 5)) table-1 table-2)
                                       {{:id 1} {:raw_before (if (even? i) {} nil)
                                                 :raw_after  (if (even? i) nil {})}
                                        {:id 2} {:raw_before (if (odd? i) {} nil)
                                                 :raw_after  (if (odd? i) nil {})}}})))

              (is (= 16 (t2/count :model/Undo)))
              (is (= 8 (count-batches)))
              (is (= 3 (count-batches [:= :user_id user-1])))
              (is (= 5 (count-batches [:= :user_id user-2])))
              (is (= 1 (count-batches [:= :table_id table-1])))
              (is (= 7 (count-batches [:= :table_id table-2]))))))))))

(deftest undo-non-undoable-batch-test
  (mt/with-empty-h2-app-db!
    (mt/with-premium-features #{:table-data-editing}
      (testing "Cannot undo a batch marked as undoable: false"
        (action-v2.tu/with-test-tables! [table-id [{:id   [:int]
                                                    :name [:text]}
                                                   {:primary-key [:id]}]]
          (let [user-id    (mt/user->id :crowberto)
                test-scope {:table-id table-id}]

            ;; Create a regular undoable change first
            (action-v2.tu/create-rows! table-id user-id 200 [{:id 1, :name "Undoable change"}])

            ;; Manually create a non-undoable change using track-change! directly
            (undo/track-change!
             user-id
             test-scope
             {table-id
              {{:id 2} {:raw_before nil                                  ; before (nil for create)
                        :raw_after  {:id 2, :name "Non-undoable change"} ; after
                        :undoable   false}}})                            ; mark as non-undoable

            (is (= [[1 "Undoable change"]] (table-rows table-id)))

            ;; Should have batches available to undo
            (is (next-batch-num :undo user-id test-scope))
            (is (not (next-batch-num :redo user-id test-scope)))

            ;; Try to undo - should fail because the latest batch has undoable: false
            (let [before-batch-num (next-batch-num :undo user-id test-scope)]
              (is (= "Your previous change cannot be undone"
                     (undo-via-api! user-id test-scope)))
              (testing "batchnum is unchanged"
                (is (= before-batch-num (next-batch-num :undo user-id test-scope)))))

            ;; Table should remain unchanged
            (is (= [[1 "Undoable change"]] (table-rows table-id)))))))))
