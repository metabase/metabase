(ns metabase.api.app-test
  (:require
    [clojure.test :refer [deftest is testing]]
    [metabase.models :refer [App Collection Dashboard]]
    [metabase.test :as mt]))

(deftest create-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-temp* [Collection [{collection_id :id}]]
      (is (partial= {:collection_id collection_id}
                    (mt/user-http-request :crowberto :post 200 "app" {:collection_id collection_id})))
      (is (= "An App already exists on this Collection"
             (mt/user-http-request :crowberto :post 400 "app" {:collection_id collection_id}))))
    (testing "Collection permissions"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp* [Collection [{collection_id :id}]]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 "app" {:collection_id collection_id})))))
      (mt/with-temp* [Collection [{collection_id :id}]]
        (is (partial= {:collection_id collection_id}
                      (mt/user-http-request :rasta :post 200 "app" {:collection_id collection_id})))))
    (testing "With initial dashboard and nav_items"
      (mt/with-temp* [Collection [{collection_id :id}]
                      Dashboard [{dashboard_id :id}]]
        (let [nav_items [{:options {:click_behavior {}}}]]
          (is (partial= {:collection_id collection_id
                         :dashboard_id dashboard_id
                         :nav_items nav_items}
                        (mt/user-http-request :crowberto :post 200 "app" {:collection_id collection_id
                                                                          :dashboard_id dashboard_id
                                                                          :nav_items nav_items}))))))))

(deftest update-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (let [app-data {:nav_items [{:options {:item "stuff"}}]
                    :options {:frontend "stuff"}}]
      (mt/with-temp* [Collection [{collection_id :id}]
                      App [{app_id :id} (assoc app-data :collection_id collection_id)]
                      Dashboard [{dashboard_id :id}]]
        (let [expected (merge app-data {:collection_id collection_id
                                        :dashboard_id dashboard_id})]
          (testing "setting the dashboard_id doesn't affect the other fields"
            (is (partial= expected
                          (mt/user-http-request :crowberto :put 200 (str "app/" app_id) {:dashboard_id dashboard_id}))))
          (testing "can remove nav items"
            (is (partial= (assoc expected :nav_items nil)
                          (mt/user-http-request :crowberto :put 200 (str "app/" app_id) {:dashboard_id dashboard_id
                                                                                         :nav_items nil}))))
          (testing "can remove options"
            (is (partial= (assoc expected :nav_items nil :options nil)
                          (mt/user-http-request :crowberto :put 200 (str "app/" app_id) {:dashboard_id dashboard_id
                                                                                         :options nil})))))))
    (testing "Collection permissions"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp* [Collection [{collection_id :id}]
                        App [{app_id :id} {:collection_id collection_id}]]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 (str "app/" app_id) {})))))
      (mt/with-temp* [Collection [{collection_id :id}]
                      App [{app_id :id} {:collection_id collection_id}]]
        (is (partial= {:collection_id collection_id}
                      (mt/user-http-request :rasta :put 200 (str "app/" app_id) {})))))))
