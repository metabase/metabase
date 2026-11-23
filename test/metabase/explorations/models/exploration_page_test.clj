(ns metabase.explorations.models.exploration-page-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.test-util :as events.tu]
   [metabase.explorations.models.exploration-page :as exploration-page]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.users.models.user :as user]
   [toucan2.core :as t2]))

(deftest perms-delegate-to-block-test
  (testing "read/write perms delegate through block → thread → exploration"
    (mt/with-model-cleanup [:model/User]
      (let [[owner] (user/create-users! [{:email "explorations-owner@example.com"}])]
        (mt/with-temp [:model/Card metric {:type :metric :creator_id (:id owner)}
                       :model/Exploration e {:name "x" :creator_id (:id owner)}
                       :model/ExplorationThread t {:exploration_id (:id e)}
                       :model/ExplorationBlock b {:exploration_thread_id (:id t)}
                       :model/ExplorationPage p {:exploration_block_id (:id b)
                                                 :card_id (:id metric)
                                                 :dimension_id "d1"
                                                 :query_type "default"}]
          (mt/with-current-user (:id owner)
            (is (true? (mi/can-read? (t2/hydrate (t2/select-one :model/ExplorationPage :id (:id p)) :can_read))))
            (is (true? (mi/can-write? (t2/hydrate (t2/select-one :model/ExplorationPage :id (:id p)) :can_write)))))
          (testing "entity_id + timestamps populated"
            (let [reloaded (t2/select-one :model/ExplorationPage :id (:id p))]
              (is (some? (:entity_id reloaded)))
              (is (some? (:created_at reloaded)))
              (is (some? (:updated_at reloaded))))))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Card                {card-id :id}        {:type :metric}
                 :model/Exploration         {exploration-id :id} {}
                 :model/ExplorationThread   {thread-id :id}      {:exploration_id exploration-id}
                 :model/ExplorationBlock    {block-id :id}       {:exploration_thread_id thread-id}]
    (let [rows    (fn [n]
                    (mapv (fn [i] {:exploration_block_id block-id :card_id card-id :dimension_id (str "d" i)
                                   :query_type "default" :position i})
                          (range n)))
          fresh!  (fn [n] (mapv :id (exploration-page/create-pages! (rows n))))
          counted (fn [f]
                    (f 1)
                    (is (= (f 2) (f 6))))
          counted-updates (fn [f]
                            (f 1)
                            (is (<= (- (f 6) (f 2)) (* 2 (- 6 2)))
                                "each more row costs its SELECT by the hook and its UPDATE"))]
      (testing "creating pages"
        (counted (fn [n] (let [rows (rows n)] (events.tu/statement-count! #(exploration-page/create-pages! rows))))))
      (testing "updating pages, some already holding the new value"
        (counted-updates (fn [n]
                           (let [ids (fresh! n)]
                             (exploration-page/update-pages! (mapv (fn [id] {:id id :starred true}) (take-nth 2 ids)))
                             (events.tu/statement-count!
                              #(exploration-page/update-pages! (mapv (fn [id] {:id id :starred true}) ids)))))))
      (testing "deleting pages"
        (counted (fn [n] (let [ids (fresh! n)] (events.tu/statement-count! #(exploration-page/delete-pages! ids)))))))))
