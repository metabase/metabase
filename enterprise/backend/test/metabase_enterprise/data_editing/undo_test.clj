(ns metabase-enterprise.data-editing.undo-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-editing.test-util :as data-editing.tu]
   [metabase-enterprise.data-editing.undo :as undo]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(deftest diff-keys-test
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

(def ^:private test-scope {:test-ns (ns-name *ns*)})

(defn- create-row! [user-id table-id row]
  (mt/user-http-request user-id :post 200 (data-editing.tu/table-url table-id) {:rows [row]}))

(defn- update-row! [user-id table-id row]
  (mt/user-http-request user-id :put 200 (data-editing.tu/table-url table-id) {:rows [row]}))

(defn- delete-row! [user-id table-id pk]
  (mt/user-http-request user-id :post 200 (str (data-editing.tu/table-url table-id) "/delete") {:rows [pk]}))

(defn- write-sequence! [table-id pk states]
  (loop [prior  nil
         states states]
    (when (seq states)
      (let [[user-id value] (first states)]
        (case [(nil? prior) (nil? value)]
          [true   true] nil
          [true  false] (create-row! user-id table-id (merge pk value))
          [false  true] (delete-row! user-id table-id pk)
          [false false] (update-row! user-id table-id (merge pk value)))
        (recur value (rest states))))))

;; I'm OK reducing this scenario's scope once we have e2e tests.
;; Until then, I think this is ideal.
#_{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(deftest undo-redo-single-user-single-table-single-record-integration-test
  (mt/with-empty-h2-app-db
    (mt/with-premium-features #{:table-data-editing}
      (testing "Single-user chain, non-generated pk"
        ;; TODO test with a real PK
        ;; Beware: h2 will not allow un-delete, we'll need to adjust the test not to include deletion in its history.
        ;;         and, we'll want to test the failure we get when we try to un-delete
        ;; Blocker for other drivers: https://linear.app/metabase/issue/WRK-223/pk-creation-for-non-h2-drivers
        (with-open [table-ref (data-editing.tu/open-test-table! {:id             [:int]
                                                                 :name           [:text]
                                                                 :favourite_food [:text]}
                                                                {:primary-key [:id]})]
          (let [table-id @table-ref
                user-id  (mt/user->id :crowberto)]
            (data-editing.tu/toggle-data-editing-enabled! true)

            (write-sequence! table-id {:id 1} [[user-id {:name "Snorkmaiden" :favourite_food "pork"}]
                                               [user-id {:name "Snorkmaiden" :favourite_food "orc"}]
                                               [user-id nil]])

            (is (= [] (table-rows table-id)))

            (is (undo/next-batch-num :undo user-id test-scope))
            (is (not (undo/next-batch-num :redo user-id test-scope)))
            (is (= {table-id [[:create {:id 1, :name "Snorkmaiden", :favourite_food "orc"}]]}
                   (undo/undo! user-id test-scope)))
            (is (= [[1 "Snorkmaiden" "orc"]] (table-rows table-id)))

            (is (undo/next-batch-num :undo user-id test-scope))
            (is (undo/next-batch-num :redo user-id test-scope))
            (is (= {table-id [[:update {:id 1, :name "Snorkmaiden", :favourite_food "pork"}]]}
                   (undo/undo! user-id test-scope)))
            (is (= [[1 "Snorkmaiden" "pork"]] (table-rows table-id)))

            (is (undo/next-batch-num :undo user-id test-scope))
            (is (undo/next-batch-num :redo user-id test-scope))
            ;; This doesn't tell the FE which rows to hide
            (is (= {table-id [[:delete {:id 1}]]}
                   (undo/undo! user-id test-scope)))
            (is (= [] (table-rows table-id)))

            (is (not (undo/next-batch-num :undo user-id test-scope)))
            (is (undo/next-batch-num :redo user-id test-scope))
            (is (thrown-with-msg?
                 ExceptionInfo
                 #"No previous versions found"
                 (undo/undo! user-id test-scope)))

            (is (not (undo/next-batch-num :undo user-id test-scope)))
            (is (undo/next-batch-num :redo user-id test-scope))
            (is (= {table-id [[:create {:id 1, :name "Snorkmaiden", :favourite_food "pork"}]]}
                   (undo/redo! user-id test-scope)))
            (is (= [[1 "Snorkmaiden" "pork"]] (table-rows table-id)))

            (is (undo/next-batch-num :undo user-id test-scope))
            (is (undo/next-batch-num :redo user-id test-scope))
            (is (= {table-id [[:update {:id 1, :name "Snorkmaiden", :favourite_food "orc"}]]}
                   (undo/redo! user-id test-scope)))
            (is (= [[1 "Snorkmaiden" "orc"]] (table-rows table-id)))

            (is (undo/next-batch-num :undo user-id test-scope))
            (is (undo/next-batch-num :redo user-id test-scope))
            (is (= {table-id [[:delete {:id 1}]]}
                   (undo/redo! user-id test-scope)))
            (is (= [] (table-rows table-id)))

            (is (undo/next-batch-num :undo user-id test-scope))
            (is (not (undo/next-batch-num :redo user-id test-scope)))
            (is (thrown-with-msg?
                 ExceptionInfo
                 #"No subsequent versions found"
                 (undo/redo! user-id test-scope)))

            (is (undo/next-batch-num :undo user-id test-scope))
            (is (not (undo/next-batch-num :redo user-id test-scope)))))))))

;; I'm OK reducing this scenario's scope once we have e2e tests.
;; Until then, I think this is ideal.
#_{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(deftest undo-redo-multi-user-single-table-single-record-integration-test
  (mt/with-empty-h2-app-db
    (mt/with-premium-features #{:table-data-editing}
      (testing "Multi-user chain"
        (with-open [table-ref (data-editing.tu/open-test-table! {:id    [:int]
                                                                 :name  [:text]
                                                                 :power [:int]}
                                                                {:primary-key [:id]})]
          (let [table-id @table-ref
                user-1   (mt/user->id :crowberto)
                user-2   (mt/user->id :rasta)]
            (data-editing.tu/toggle-data-editing-enabled! true)

            ;; NOTE: this test relies on the "conflicts even when different columns changed" semantics
            ;; If we improve the semantics, we'll need to improve this test!

            (write-sequence! table-id {:id 2} [[user-1 {:name "Moomintroll" :power 3}]
                                               [user-1 {:name "Moomintroll" :power 9001}]
                                               [user-2 {:name "Moominswole" :power 9001}]
                                               [user-1 nil]])

            (is (= [] (table-rows table-id)))

            (is (undo/next-batch-num :undo user-2 test-scope))
            (is (not (undo/next-batch-num :redo user-2 test-scope)))
            (is (thrown-with-msg?
                 ExceptionInfo
                 #"Blocked by other changes"
                 (undo/undo! user-2 test-scope)))

            (is (undo/next-batch-num :undo user-1 test-scope))
            (is (not (undo/next-batch-num :redo user-1 test-scope)))
            (is (= {table-id [[:create {:id 2, :name "Moominswole", :power 9001}]]}
                   (undo/undo! user-1 test-scope)))
            (is (= [[2 "Moominswole" 9001]] (table-rows table-id)))

            (is (undo/next-batch-num :undo user-1 test-scope))
            (is (undo/next-batch-num :redo user-1 test-scope))
            (is (thrown-with-msg?
                 ExceptionInfo
                 #"Blocked by other changes"
                 (undo/undo! user-1 test-scope)))

            (is (undo/next-batch-num :undo user-1 test-scope))
            (is (undo/next-batch-num :redo user-1 test-scope))
            (is (undo/next-batch-num :undo user-2 test-scope))
            (is (not (undo/next-batch-num :redo user-2 test-scope)))
            (is (= {table-id [[:update {:id 2, :name "Moomintroll", :power 9001}]]}
                   (undo/undo! user-2 test-scope)))
            (is (= [[2 "Moomintroll" 9001]] (table-rows table-id)))

            (is (undo/next-batch-num :undo user-1 test-scope))
            (is (undo/next-batch-num :redo user-1 test-scope))
            (is (= {table-id [[:update {:id 2, :name "Moomintroll", :power 3}]]}
                   (undo/undo! user-1 test-scope)))
            (is (= [[2 "Moomintroll" 3]] (table-rows table-id)))

            (is (undo/next-batch-num :undo user-1 test-scope))
            (is (undo/next-batch-num :redo user-1 test-scope))
            (is (= {table-id [[:delete {:id 2}]]}
                   (undo/undo! user-1 test-scope)))
            (is (= [] (table-rows table-id)))

            (is (not (undo/next-batch-num :undo user-1 test-scope)))
            (is (undo/next-batch-num :redo user-1 test-scope))
            (is (thrown-with-msg?
                 ExceptionInfo
                 #"No previous versions found"
                 (undo/undo! user-1 test-scope)))

            (is (not (undo/next-batch-num :undo user-1 test-scope)))
            (is (undo/next-batch-num :redo user-1 test-scope))
            (is (= {table-id [[:create {:id 2, :name "Moomintroll", :power 3}]]}
                   (undo/redo! user-1 test-scope)))
            (is (= [[2 "Moomintroll" 3]] (table-rows table-id)))

            (is (undo/next-batch-num :undo user-1 test-scope))
            (is (undo/next-batch-num :redo user-1 test-scope))
            (is (= {table-id [[:update {:id 2, :name "Moomintroll", :power 9001}]]}
                   (undo/redo! user-1 test-scope)))
            (is (= [[2 "Moomintroll" 9001]] (table-rows table-id)))

            (is (undo/next-batch-num :undo user-1 test-scope))
            (is (undo/next-batch-num :redo user-1 test-scope))
            (is (= {table-id [[:update {:id 2, :name "Moominswole", :power 9001}]]}
                   (undo/redo! user-2 test-scope)))
            (is (= [[2 "Moominswole" 9001]] (table-rows table-id)))

            (is (undo/next-batch-num :undo user-1 test-scope))
            (is (undo/next-batch-num :redo user-1 test-scope))
            (is (= {table-id [[:delete {:id 2}]]}
                   (undo/redo! user-1 test-scope)))
            (is (= [] (table-rows table-id)))

            (is (undo/next-batch-num :undo user-1 test-scope))
            (is (not (undo/next-batch-num :redo user-1 test-scope)))
            (is (thrown-with-msg?
                 ExceptionInfo
                 #"No subsequent versions found"
                 (undo/redo! user-1 test-scope)))

            (is (undo/next-batch-num :undo user-2 test-scope))
            (is (not (undo/next-batch-num :redo user-2 test-scope)))
            (is (thrown-with-msg?
                 ExceptionInfo
                 #"No subsequent versions found"
                 (undo/redo! user-2 test-scope)))

            (is (undo/next-batch-num :undo user-1 test-scope))
            (is (not (undo/next-batch-num :redo user-1 test-scope)))))))))

(deftest undo-reverted-changes-integration-test
  (mt/with-empty-h2-app-db
    (mt/with-premium-features #{:table-data-editing}
      (testing "Reverted changes have their snapshots deleted when there are further changes"
        (with-open [table-ref (data-editing.tu/open-test-table! {:id     [:int]
                                                                 :name   [:text]
                                                                 :status [:text]}
                                                                {:primary-key [:id]})]
          (let [table-id @table-ref
                user-id   (mt/user->id :crowberto)]
            (data-editing.tu/toggle-data-editing-enabled! true)

            ;; NOTE: this test relies on the "conflicts even when different columns changed" semantics
            ;; If we improve the semantics, we'll need to improve this test!

            (write-sequence! table-id {:id 1} [[user-id {:name "Too-ticky" :status "sitting"}]
                                               [user-id {:name "Too-tickley" :status "squirming"}]
                                               [user-id nil]])

            (write-sequence! table-id {:id 2} [[user-id {:name "Toffle" :status "uncomfortable"}]
                                               [user-id {:name "Toffle" :status "comforted"}]
                                               [user-id nil]])

            ;; Create row 1 with Too-tickley directly using CRUD API
            (create-row! user-id table-id {:id 1, :name "Too-tickley", :status "squirming"})

            (is (= [[1 "Too-tickley" "squirming"]] (table-rows table-id)))

            ;; Create row 2 with Toggle using CRUD API
            (create-row! user-id table-id {:id 2, :name "Toggle", :status "restored"})
            ;; Delete it to create an undo history
            (delete-row! user-id table-id {:id 2})

            (is (nil? (undo/next-batch-num :redo user-id test-scope)))
            (is (undo/next-batch-num :undo user-id test-scope))

            (undo/undo! user-id test-scope)
            (is (= [[1 "Too-tickley" "squirming"]
                    [2 "Toggle" "restored"]] (table-rows table-id)))

            (undo/redo! user-id test-scope)
            (is (= [[1 "Too-tickley" "squirming"]] (table-rows table-id)))))))))

(defn- count-batches [& [where]]
  (val (ffirst (t2/query {:select   [[[:count [:distinct :batch_num]] :cnt]]
                          :from     [(t2/table-name :model/Undo)]
                          :where    (or where true)}))))

(deftest prune-snapshots-test
  (mt/with-empty-h2-app-db
    (mt/with-premium-features #{:table-data-editing}
      (testing "We delete older batches when they exceed our retention limits"
        (with-open [table-ref-1 (data-editing.tu/open-test-table! {:id [:int]} {:primary-key [:id]})
                    table-ref-2 (data-editing.tu/open-test-table! {:id [:int]} {:primary-key [:id]})]
          (let [table-1 @table-ref-1
                table-2 @table-ref-2
                user-1   (mt/user->id :crowberto)
                user-2   (mt/user->id :rasta)]
            (data-editing.tu/toggle-data-editing-enabled! true)

            (testing "Total rows"
              (with-redefs [undo/retention-total-rows 17]
                (dotimes [i 25]
                  (undo/track-change! user-1
                                      test-scope
                                      {table-1
                                       {{:id 1} [(if (even? i) {} nil)
                                                 (if (even? i) nil {})]
                                        {:id 2} [(if (odd? i) {} nil)
                                                 (if (odd? i) nil {})]}}))

                (is (= 16 (t2/count :model/Undo)))
                (is (= 8 (count-batches)))))

            (testing "Total batches"
              (with-redefs [undo/retention-total-batches 15]
                (dotimes [i 25]
                  (undo/track-change! user-1
                                      test-scope
                                      {table-1
                                       {{:id 1} [(if (even? i) {} nil)
                                                 (if (even? i) nil {})]
                                        {:id 2} [(if (odd? i) {} nil)
                                                 (if (odd? i) nil {})]}}))

                (is (= 30 (t2/count :model/Undo)))
                (is (= 15 (count-batches)))))

            (testing "User id"
              (with-redefs [undo/retention-batches-per-user 5]
                (dotimes [i 25]
                  ;; just toggle existence
                  (undo/track-change! (if (zero? (mod i 3)) user-1 user-2)
                                      test-scope
                                      {table-1
                                       {{:id 1} [(if (even? i) {} nil)
                                                 (if (even? i) nil {})]
                                        {:id 2} [(if (odd? i) {} nil)
                                                 (if (odd? i) nil {})]}}))

                (is (= 20 (t2/count :model/Undo)))
                (is (= 10 (count-batches)))
                (is (= 5 (count-batches [:= :user_id user-1])))
                (is (= 5 (count-batches [:= :user_id user-2])))))

            (testing "Scope"
              (t2/delete! :model/Undo)
              (with-redefs [undo/retention-batches-per-scope 9]
                (dotimes [i 35]
                  ;; just toggle existence
                  (let [table-id (if (zero? (mod i 5)) table-1 table-2)]
                    (undo/track-change! user-1
                                        {:table-id table-id}
                                        {table-id
                                         {{:id 1} [(if (even? i) {} nil)
                                                   (if (even? i) nil {})]
                                          {:id 2} [(if (odd? i) {} nil)
                                                   (if (odd? i) nil {})]}})))

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
                                      test-scope
                                      {(if (zero? (mod i 5)) table-1 table-2)
                                       {{:id 1} [(if (even? i) {} nil)
                                                 (if (even? i) nil {})]
                                        {:id 2} [(if (odd? i) {} nil)
                                                 (if (odd? i) nil {})]}}))

                (is (= 16 (t2/count :model/Undo)))
                (is (= 8 (count-batches)))
                (is (= 3 (count-batches [:= :user_id user-1])))
                (is (= 5 (count-batches [:= :user_id user-2])))
                (is (= 1 (count-batches [:= :table_id table-1])))
                (is (= 7 (count-batches [:= :table_id table-2])))))))))))
