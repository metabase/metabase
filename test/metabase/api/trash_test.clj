(ns metabase.api.trash-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.collections.models.collection :as collection]
   [metabase.queries-rest.api.card-test :refer [card-with-name-and-query]]
   [metabase.test :as mt]))

(def dashboard-defaults {:name          "Dashboard"
                         :parameters    [{:id "abc123", :name "test", :type "date"}]
                         :cache_ttl     1234
                         :collection_id nil})

(deftest ^:parallel cannot-create-card-in-trash-test
  (testing "Cannot create a card in the trash"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :crowberto :post 403 "card" (assoc (card-with-name-and-query)
                                                                    :collection_id (collection/trash-collection-id)))))))

(deftest ^:parallel cannot-create-dashboard-in-trash-test
  (testing "Cannot create a dashboard in the trash"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :crowberto :post 403 "dashboard" (assoc dashboard-defaults
                                                                         :name "Dashboard in trash"
                                                                         :collection_id (collection/trash-collection-id)))))))

(deftest ^:parallel cannot-create-pulse-in-trash-test
  (testing "Cannot create a pulse in the trash"
    (mt/with-temp [:model/Card {card-id :id} {}]
      (let [payload {:name          "A Pulse"
                     :collection_id (collection/trash-collection-id)
                     :cards         [{:id                card-id
                                      :include_csv       false
                                      :include_xls       false
                                      :dashboard_card_id nil}]
                     :channels      [{:enabled       true
                                      :channel_type  "email"
                                      :schedule_type "daily"
                                      :schedule_hour 12
                                      :schedule_day  nil
                                      :recipients    []}]
                     :skip_if_empty false
                     :parameters    [{:id "abc123" :name "test" :type "date"}]}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 "pulse" payload)))))))

(deftest ^:parallel cannot-create-collection-in-trash-test
  (testing "Cannot create a collection in the trash"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :crowberto :post 403 "collection" {:name "Collection in trash"
                                                                    :parent_id (collection/trash-collection-id)})))))

(deftest ^:parallel cannot-create-native-query-snippet-in-trash-test
  (testing "Cannot create a native query snippet in the trash"
    ;; This failure is different because we're actually checking the namespace of the collection
    (is (mt/user-http-request :crowberto :post 400 "native-query-snippet" {:name          "Snippet in trash"
                                                                           :content       "SELECT 1"
                                                                           :collection_id (collection/trash-collection-id)}))))

(deftest ^:parallel cannot-create-timeline-in-trash-test
  (testing "Cannot create a timeline in the trash"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :crowberto :post 403 "timeline" {:name "Timeline in trash"
                                                                  :default       false
                                                                  :creator_id    (mt/user->id :crowberto)
                                                                  :collection_id (collection/trash-collection-id)})))))

(deftest ^:parallel cannot-move-card-to-trash-test
  (testing "Cannot move a card to the trash"
    (let [{id :id} (mt/user-http-request :crowberto :post 200 "card" (card-with-name-and-query))]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :crowberto :put 403 (str "card/" id) {:collection_id (collection/trash-collection-id)}))))))

(deftest ^:parallel cannot-move-dashboard-to-trash-test
  (testing "Cannot move a dashboard to the trash"
    (let [{id :id} (mt/user-http-request :crowberto :post 200 "dashboard" (assoc dashboard-defaults :name "Dashboard in trash"))]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :crowberto :put 403 (str "dashboard/" id) {:collection_id (collection/trash-collection-id)}))))))

(deftest cannot-move-pulse-to-trash-test
  (testing "Cannot move a pulse to the trash"
    (mt/with-temp [:model/Card       {card-id :id}                       {}
                   :model/Dashboard  {dashboard-id :id} {:name "Birdcage KPIs"}]
      (let [payload {:name          "A Pulse"
                     :cards         [{:id                card-id
                                      :include_csv       false
                                      :include_xls       false
                                      :dashboard_card_id nil}]
                     :channels      [{:enabled       true
                                      :channel_type  "email"
                                      :schedule_type "daily"
                                      :schedule_hour 12
                                      :schedule_day  nil
                                      :recipients    []}]
                     :dashboard_id  dashboard-id
                     :skip_if_empty false
                     :parameters    [{:id "abc123" :name "test" :type "date"}]}]
        (mt/with-model-cleanup [:model/Pulse]
          (let [{id :id} (mt/user-http-request :rasta :post 200 "pulse" payload)]
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 (str "pulse/" id) {:collection_id (collection/trash-collection-id)})))))))))

(deftest ^:parallel cannot-move-collection-to-trash-test
  (testing "Cannot move a a collection to the trash"
    (let [{id :id} (mt/user-http-request :crowberto :post 200 "collection" {:name "Collection in trash"})]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :crowberto :put 403 (str "collection/" id) {:parent_id (collection/trash-collection-id)}))))))

(deftest ^:parallel cannot-move-native-query-snippet-to-trash-test
  (testing "Cannot move a native query snippet to the trash"
    (let [{id :id} (mt/user-http-request :crowberto :post 200 "native-query-snippet" {:name    (str (random-uuid))
                                                                                      :content "SELECT 1"})]
      ;; This failure is different because we're actually checking the namespace of the collection
      (is (mt/user-http-request :crowberto :put 400 (str "native-query-snippet/" id) {:collection_id (collection/trash-collection-id)})))))

(deftest ^:parallel cannot-move-timeline-to-trash-test
  (testing "Cannot move a timeline to the trash"
    (let [{id :id} (mt/user-http-request :crowberto :post 200 "timeline" {:name       "Timeline in trash"
                                                                          :default    false
                                                                          :creator_id (mt/user->id :crowberto)})]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :crowberto :put 403 (str "timeline/" id) {:collection_id (collection/trash-collection-id)}))))))

(deftest ^:parallel cannot-archive-trash-test
  (testing "cannot archive the trash"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :crowberto :put 403 (str "collection/" (collection/trash-collection-id))
                                 {:archived true})))))

(deftest ^:parallel cannot-change-trash-name-test
  (testing "cannot change the trash name"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :crowberto :put 403 (str "collection/" (collection/trash-collection-id))
                                 {:name "New Name"})))))
