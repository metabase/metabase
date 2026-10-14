(ns metabase-enterprise.remote-sync.cost-test-util-test
  "Tests for the cost helpers. Not ^:parallel: [[cost/measure!]] uses the JVM-wide JDBC counter."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.cost-test-util :as cost]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest rows-rewritten-empty-table-test
  (testing ":rows-rewritten of one card insert is 1, also when the Card table was empty before"
    (mt/with-empty-h2-app-db!
      (let [user      (t2/insert-returning-pk! :model/User {:email      "cost@example.com"
                                                            :first_name "Cost"
                                                            :last_name  "Test"
                                                            :password   "p4ssw0rd!x"})
            db        (t2/insert-returning-pk! :model/Database {:name "Cost" :engine :h2 :details {}})
            new-card! (fn [n]
                        (t2/insert-returning-pk! :model/Card
                                                 {:name                   (str "Cost card " n)
                                                  :creator_id             user
                                                  :database_id            db
                                                  :display                :table
                                                  :visualization_settings {}
                                                  :dataset_query          {:database db
                                                                           :type     :native
                                                                           :native   {:query "SELECT 1"}}}))
            into-empty    (cost/measure! #(new-card! 1))
            into-nonempty (cost/measure! #(new-card! 2))]
        (is (= [1 1] [(:rows-rewritten into-empty) (:rows-rewritten into-nonempty)]))))))

(defn- insert-card!
  "Insert an MBQL card on `venues` into collection `coll` with the extra columns `extra`; return its id."
  [coll extra]
  (let [mp (mt/metadata-provider)]
    (t2/insert-returning-pk! :model/Card
                             (merge {:name                   "Cost card"
                                     :collection_id          coll
                                     :creator_id             (mt/user->id :rasta)
                                     :display                :table
                                     :visualization_settings {}
                                     :dataset_query          (lib/query mp (lib.metadata/table mp (mt/id :venues)))}
                                    extra))))

(deftest rows-rewritten-with-future-updated-at-test
  (testing ":rows-rewritten counts an update of a card while another card has a later updated_at"
    (mt/with-model-cleanup [:model/Card :model/Collection]
      (let [coll  (t2/insert-returning-pk! :model/Collection {:name "Cost" :location "/"})
            _     (insert-card! coll {:updated_at (t/plus (t/offset-date-time) (t/days 1))})
            other (insert-card! coll {})]
        (is (= 1 (:rows-rewritten (cost/measure! #(t2/update! :model/Card other {:description "changed"})))))))))

(deftest metadata-inferences-test
  (testing ":metadata-inferences counts inferences on the calling thread and on a future, and not on a raw Thread"
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :venues)))
          infer #(card.metadata/infer-metadata query)]
      (is (= 2 (:metadata-inferences (cost/measure! (fn []
                                                      (infer)
                                                      @(future (infer))
                                                      (doto (Thread. ^Runnable infer) .start .join)))))))))

(deftest per-entity-test
  (testing "per-entity divides the difference of each count by the difference of the sizes"
    (let [zeros (zipmap @#'cost/cost-keys (repeat 0))]
      (is (= (assoc (update-vals zeros double) :statements 2.0 :rows-rewritten 1.0)
             (cost/per-entity (merge zeros {:statements 10 :rows-rewritten 3})
                              (merge zeros {:statements 30 :rows-rewritten 13})
                              10 20))))))
