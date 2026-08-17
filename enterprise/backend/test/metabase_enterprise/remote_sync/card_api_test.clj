(ns ^:synchronous metabase-enterprise.remote-sync.card-api-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.remote-sync.card-api-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [f]
                      (mt/with-temporary-setting-values [remote-sync-type :read-write]
                        (f))))

(deftest bulk-move-into-remote-synced-with-non-remote-synced-deps-test
  (testing "POST /api/card/collections rejects bulk-moving a card with non-remote-synced dependencies into a remote-synced collection (GHY-3791)"
    (mt/with-temp [:model/Collection {regular-id :id} {:name "Regular" :location "/" :type nil}
                   :model/Collection {synced-id :id} {:name "Remote-Synced" :location "/" :is_remote_synced true}
                   :model/Card {source-card-id :id} {:name "Non-remote-synced source card"
                                                     :collection_id regular-id
                                                     :dataset_query (mt/native-query {:query "SELECT 1"})}
                   ;; Card lives at the root (collection_id nil): its pre-update collection_id is the
                   ;; short-circuit case in non-remote-synced-dependencies, exposing the stale-object bug.
                   :model/Card {root-card-id :id} {:name "Card depending on non-synced source"
                                                   :collection_id nil
                                                   :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
      (let [response (mt/user-http-request :crowberto :post 400 "card/collections"
                                           {:collection_id synced-id
                                            :card_ids [root-card-id]})]
        (is (= "Uses content that is not remote synced." (:message response))))
      (testing "card is not moved - transaction rolled back"
        (is (nil? (t2/select-one-fn :collection_id :model/Card root-card-id)))))))

(deftest bulk-move-depended-on-card-out-of-remote-synced-test
  (testing "POST /api/card/collections rejects bulk-moving a remote-synced card that is depended on by other remote-synced content out of the synced set (GHY-3791)"
    (mt/with-temp [:model/Collection {synced-id :id} {:name "Remote-Synced" :location "/" :is_remote_synced true}
                   :model/Collection {regular-id :id} {:name "Regular" :location "/" :type nil}
                   :model/Card {source-card-id :id} {:name "Remote-synced source card"
                                                     :collection_id synced-id
                                                     :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Card {_dependent-id :id} {:name "Remote-synced dependent card"
                                                    :collection_id synced-id
                                                    :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
      (let [response (mt/user-http-request :crowberto :post 400 "card/collections"
                                           {:collection_id regular-id
                                            :card_ids [source-card-id]})]
        (is (= "Used by remote synced content." (:message response))))
      (testing "card is not moved - transaction rolled back"
        (is (= synced-id (t2/select-one-fn :collection_id :model/Card source-card-id)))))))

(deftest bulk-move-into-remote-synced-with-remote-synced-deps-succeeds-test
  (testing "POST /api/card/collections allows bulk-moving a card whose dependencies are all remote-synced into a remote-synced collection (GHY-3791)"
    (mt/with-temp [:model/Collection {synced-id :id} {:name "Remote-Synced" :location "/" :is_remote_synced true}
                   :model/Card {source-card-id :id} {:name "Remote-synced source card"
                                                     :collection_id synced-id
                                                     :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Card {mover-id :id} {:name "Card depending on synced source"
                                               :collection_id nil
                                               :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
      (is (= {:status "ok"}
             (mt/user-http-request :crowberto :post 200 "card/collections"
                                   {:collection_id synced-id
                                    :card_ids [mover-id]})))
      (is (= synced-id (t2/select-one-fn :collection_id :model/Card mover-id))))))
