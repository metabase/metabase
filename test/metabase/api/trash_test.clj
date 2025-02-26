(ns metabase.api.trash-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.api.card-test :refer [card-with-name-and-query]]
   [metabase.models.collection :as collection]
   [metabase.test :as mt]))

(def dashboard-defaults {:name          "Dashboard"
                         :parameters    [{:id "abc123", :name "test", :type "date"}]
                         :cache_ttl     1234
                         :collection_id nil})

(deftest cannot-create-in-trash
  (testing "Cannot create a card in the trash"
    (is (= "You cannot modify the Trash Collection."
           (mt/user-http-request :crowberto :post 400 "card" (assoc (card-with-name-and-query)
                                                                    :collection_id (collection/trash-collection-id))))))
  (testing "Cannot create a dashboard in the trash"
    (is (= "You cannot modify the Trash Collection."
           (mt/user-http-request :crowberto :post 400 "dashboard" (assoc dashboard-defaults
                                                                         :name "Dashboard in trash"
                                                                         :collection_id (collection/trash-collection-id))))))
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
        (mt/with-model-cleanup [:model/Pulse]
          (is (= "You cannot modify the Trash Collection."
                 (mt/user-http-request :rasta :post 400 "pulse" payload)))))))
  (testing "Cannot create a collection in the trash"
    (is (= "You cannot modify the Trash Collection."
           (mt/user-http-request :crowberto :post 400 "collection" {:name      "Collection in trash"
                                                                    :parent_id (collection/trash-collection-id)}))))
  (testing "Cannot create a native query snippet in the trash"
    (is (mt/user-http-request :crowberto :post 400 "native-query-snippet" {:name          "Snippet in trash"
                                                                           :content       "SELECT 1"
                                                                           :collection_id (collection/trash-collection-id)})))
  (testing "Cannot create a timeline in the trash"
    (is (= "You cannot modify the Trash Collection."
           (mt/user-http-request :crowberto :post 400 "timeline" {:name          "Timeline in trash"
                                                                  :default       false
                                                                  :creator_id    (mt/user->id :crowberto)
                                                                  :collection_id (collection/trash-collection-id)})))))

(deftest cannot-move-to-trash
  (testing "Cannot move a card to the trash"
    (let [{id :id} (mt/user-http-request :crowberto :post 200 "card" (card-with-name-and-query))]
      (is (= "You cannot modify the Trash Collection."
             (mt/user-http-request :crowberto :put 400 (str "card/" id) {:collection_id (collection/trash-collection-id)})))))
  (testing "Cannot move a dashboard to the trash"
    (let [{id :id} (mt/user-http-request :crowberto :post 200 "dashboard" (assoc dashboard-defaults :name "Dashboard in trash"))]
      (is (= "You cannot modify the Trash Collection."
             (mt/user-http-request :crowberto :put 400 (str "dashboard/" id) {:collection_id (collection/trash-collection-id)})))))
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
            (is (= "You cannot modify the Trash Collection."
                   (mt/user-http-request :rasta :put 400 (str "pulse/" id) {:collection_id (collection/trash-collection-id)}))))))))
  (testing "Cannot move a a collection to the trash"
    (let [{id :id} (mt/user-http-request :crowberto :post 200 "collection" {:name "Collection in trash"})]
      (is (= "You cannot modify the Trash Collection."
             (mt/user-http-request :crowberto :put 400 (str "collection/" id) {:parent_id (collection/trash-collection-id)})))))
  (testing "Cannot move a native query snippet to the trash"
    (let [{id :id} (mt/user-http-request :crowberto :post 200 "native-query-snippet" {:name    (str (random-uuid))
                                                                                      :content "SELECT 1"})]
      (is (mt/user-http-request :crowberto :put 400 (str "native-query-snippet/" id) {:collection_id (collection/trash-collection-id)}))))
  (testing "Cannot move a timeline to the trash"
    (let [{id :id} (mt/user-http-request :crowberto :post 200 "timeline" {:name       "Timeline in trash"
                                                                          :default    false
                                                                          :creator_id (mt/user->id :crowberto)})]
      (is (= "You cannot modify the Trash Collection." (mt/user-http-request :crowberto :put 400 (str "timeline/" id) {:collection_id (collection/trash-collection-id)}))))))

(deftest cannot-edit-the-trash
  (testing "cannot archive the trash"
    (is (= "You cannot modify the Trash Collection."
           (mt/user-http-request :crowberto :put 400 (str "collection/" (collection/trash-collection-id))
                                 {:archived true}))))
  (testing "cannot change the trash name"
    (is (= "You cannot modify the Trash Collection."
           (mt/user-http-request :crowberto :put 400 (str "collection/" (collection/trash-collection-id))
                                 {:name "New Name"})))))
