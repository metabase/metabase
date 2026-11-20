(ns metabase-enterprise.replacement.models.replacement-run-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private pending-run
  {:source_entity_type :card
   :source_entity_id   1
   :target_entity_type :card
   :target_entity_id   2
   :status             :pending
   :progress           0.0})

(deftest insert-derives-active-flag-from-status-test
  (mt/with-model-cleanup [:model/ReplacementRun]
    (testing "pending run inserted as active is stored inactive"
      (let [id (t2/insert-returning-pk! :model/ReplacementRun (assoc pending-run :user_id (mt/user->id :rasta) :is_active true))]
        (is (nil? (t2/select-one-fn :is_active :model/ReplacementRun :id id)))))
    (testing "started run is stored active"
      (let [id (t2/insert-returning-pk! :model/ReplacementRun (assoc pending-run :user_id (mt/user->id :rasta) :status :started))]
        (is (true? (t2/select-one-fn :is_active :model/ReplacementRun :id id)))))))

(deftest update-derives-active-flag-from-status-test
  (mt/with-model-cleanup [:model/ReplacementRun]
    (let [id (t2/insert-returning-pk! :model/ReplacementRun (assoc pending-run :user_id (mt/user->id :rasta)))]
      (testing "starting run makes it active"
        (t2/update! :model/ReplacementRun :id id {:status :started})
        (is (=? {:status :started :is_active true} (t2/select-one :model/ReplacementRun :id id))))
      (testing "terminal status alone makes run inactive and ends it"
        (t2/update! :model/ReplacementRun :id id {:status :succeeded})
        (is (=? {:status :succeeded :is_active nil :end_time some?} (t2/select-one :model/ReplacementRun :id id))))
      (testing "next run can start once previous one ended"
        (let [next-id (t2/insert-returning-pk! :model/ReplacementRun (assoc pending-run :user_id (mt/user->id :rasta)))]
          (t2/update! :model/ReplacementRun :id next-id {:status :started})
          (is (true? (t2/select-one-fn :is_active :model/ReplacementRun :id next-id)))
          (t2/update! :model/ReplacementRun :id next-id {:status :failed}))))))

(deftest update-refuses-active-flag-without-status-test
  (mt/with-model-cleanup [:model/ReplacementRun]
    (let [id (t2/insert-returning-pk! :model/ReplacementRun (assoc pending-run :user_id (mt/user->id :rasta)))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"active flag is computed from its status"
                            (t2/update! :model/ReplacementRun :id id {:is_active true})))
      (is (nil? (t2/select-one-fn :is_active :model/ReplacementRun :id id))))))
