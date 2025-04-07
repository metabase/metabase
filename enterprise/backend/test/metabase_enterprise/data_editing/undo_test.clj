(ns metabase-enterprise.data-editing.undo-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-editing.test-util :as data-editing.tu]
   [metabase-enterprise.data-editing.undo :as undo]
   [metabase.query-processor :as qp]
   [metabase.test :as mt])
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

;; TODO use actual mutations to create the history (TODO subscribe to the relevant events)
(defn- write-sequence! [table-id pk states]
  (loop [prior  nil
         states states]
    (when (seq states)
      (let [[user-id value] (first states)]
        (undo/track-change! user-id {table-id {pk [prior value]}})
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

            (is (undo/has-undo? true user-id table-id))
            (is (not (undo/has-undo? false user-id table-id)))
            (is (= {table-id [[:create {:id 1, :name "Snorkmaiden", :favourite_food "orc"}]]}
                   (undo/undo! user-id table-id)))
            (is (= [[1 "Snorkmaiden" "orc"]] (table-rows table-id)))

            (is (undo/has-undo? true user-id table-id))
            (is (undo/has-undo? false user-id table-id))
            (is (= {table-id [[:update {:id 1, :name "Snorkmaiden", :favourite_food "pork"}]]}
                   (undo/undo! user-id table-id)))
            (is (= [[1 "Snorkmaiden" "pork"]] (table-rows table-id)))

            (is (undo/has-undo? true user-id table-id))
            (is (undo/has-undo? false user-id table-id))
            ;; This doesn't tell the FE which rows to hide
            (is (= {table-id [[:delete {:id 1}]]}
                   (undo/undo! user-id table-id)))
            (is (= [] (table-rows table-id)))

            (is (not (undo/has-undo? true user-id table-id)))
            (is (undo/has-undo? false user-id table-id))
            (is (thrown-with-msg?
                 ExceptionInfo
                 #"No previous versions found"
                 (undo/undo! user-id table-id)))

            (is (not (undo/has-undo? true user-id table-id)))
            (is (undo/has-undo? false user-id table-id))
            (is (= {table-id [[:create {:id 1, :name "Snorkmaiden", :favourite_food "pork"}]]}
                   (undo/redo! user-id table-id)))
            (is (= [[1 "Snorkmaiden" "pork"]] (table-rows table-id)))

            (is (undo/has-undo? true user-id table-id))
            (is (undo/has-undo? false user-id table-id))
            (is (= {table-id [[:update {:id 1, :name "Snorkmaiden", :favourite_food "orc"}]]}
                   (undo/redo! user-id table-id)))
            (is (= [[1 "Snorkmaiden" "orc"]] (table-rows table-id)))

            (is (undo/has-undo? true user-id table-id))
            (is (undo/has-undo? false user-id table-id))
            (is (= {table-id [[:delete {:id 1}]]}
                   (undo/redo! user-id table-id)))
            (is (= [] (table-rows table-id)))

            (is (undo/has-undo? true user-id table-id))
            (is (not (undo/has-undo? false user-id table-id)))
            (is (thrown-with-msg?
                 ExceptionInfo
                 #"No subsequent versions found"
                 (undo/redo! user-id table-id)))

            (is (undo/has-undo? true user-id table-id))
            (is (not (undo/has-undo? false user-id table-id)))))))))

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

            (is (undo/has-undo? true user-2 table-id))
            (is (not (undo/has-undo? false user-2 table-id)))
            (is (thrown-with-msg?
                 ExceptionInfo
                 #"Blocked by other changes"
                 (undo/undo! user-2 table-id)))

            (is (undo/has-undo? true user-1 table-id))
            (is (not (undo/has-undo? false user-1 table-id)))
            (is (= {table-id [[:create {:id 2, :name "Moominswole", :power 9001}]]}
                   (undo/undo! user-1 table-id)))
            (is (= [[2 "Moominswole" 9001]] (table-rows table-id)))

            (is (undo/has-undo? true user-1 table-id))
            (is (undo/has-undo? false user-1 table-id))
            (is (thrown-with-msg?
                 ExceptionInfo
                 #"Blocked by other changes"
                 (undo/undo! user-1 table-id)))

            (is (undo/has-undo? true user-1 table-id))
            (is (undo/has-undo? false user-1 table-id))
            (is (undo/has-undo? true user-2 table-id))
            (is (not (undo/has-undo? false user-2 table-id)))
            (is (= {table-id [[:update {:id 2, :name "Moomintroll", :power 9001}]]}
                   (undo/undo! user-2 table-id)))
            (is (= [[2 "Moomintroll" 9001]] (table-rows table-id)))

            (is (undo/has-undo? true user-1 table-id))
            (is (undo/has-undo? false user-1 table-id))
            (is (= {table-id [[:update {:id 2, :name "Moomintroll", :power 3}]]}
                   (undo/undo! user-1 table-id)))
            (is (= [[2 "Moomintroll" 3]] (table-rows table-id)))

            (is (undo/has-undo? true user-1 table-id))
            (is (undo/has-undo? false user-1 table-id))
            (is (= {table-id [[:delete {:id 2}]]}
                   (undo/undo! user-1 table-id)))
            (is (= [] (table-rows table-id)))

            (is (not (undo/has-undo? true user-1 table-id)))
            (is (undo/has-undo? false user-1 table-id))
            (is (thrown-with-msg?
                 ExceptionInfo
                 #"No previous versions found"
                 (undo/undo! user-1 table-id)))

            (is (not (undo/has-undo? true user-1 table-id)))
            (is (undo/has-undo? false user-1 table-id))
            (is (= {table-id [[:create {:id 2, :name "Moomintroll", :power 3}]]}
                   (undo/redo! user-1 table-id)))
            (is (= [[2 "Moomintroll" 3]] (table-rows table-id)))

            (is (undo/has-undo? true user-1 table-id))
            (is (undo/has-undo? false user-1 table-id))
            (is (= {table-id [[:update {:id 2, :name "Moomintroll", :power 9001}]]}
                   (undo/redo! user-1 table-id)))
            (is (= [[2 "Moomintroll" 9001]] (table-rows table-id)))

            (is (undo/has-undo? true user-1 table-id))
            (is (undo/has-undo? false user-1 table-id))
            (is (= {table-id [[:update {:id 2, :name "Moominswole", :power 9001}]]}
                   (undo/redo! user-2 table-id)))
            (is (= [[2 "Moominswole" 9001]] (table-rows table-id)))

            (is (undo/has-undo? true user-1 table-id))
            (is (undo/has-undo? false user-1 table-id))
            (is (= {table-id [[:delete {:id 2}]]}
                   (undo/redo! user-1 table-id)))
            (is (= [] (table-rows table-id)))

            (is (undo/has-undo? true user-1 table-id))
            (is (not (undo/has-undo? false user-1 table-id)))
            (is (thrown-with-msg?
                 ExceptionInfo
                 #"No subsequent versions found"
                 (undo/redo! user-1 table-id)))

            (is (undo/has-undo? true user-2 table-id))
            (is (not (undo/has-undo? false user-2 table-id)))
            (is (thrown-with-msg?
                 ExceptionInfo
                 #"No subsequent versions found"
                 (undo/redo! user-2 table-id)))

            (is (undo/has-undo? true user-1 table-id))
            (is (not (undo/has-undo? false user-1 table-id)))))))))
