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
    (testing "With initial dashboard and nav-items"
      (mt/with-temp* [Collection [{collection_id :id}]
                      Dashboard [{dashboard_id :id}]]
        (let [nav-items [{:options {:click_behavior {}}}]]
          (is (partial= {:collection_id collection_id
                         :dashboard_id dashboard_id
                         :nav-items nav-items}
                        (mt/user-http-request :crowberto :post 200 "app" {:collection_id collection_id
                                                                          :dashboard_id dashboard_id
                                                                          :nav-items nav-items}))))))))

(deftest update-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-temp* [Collection [{collection_id :id}]
                    App [{app_id :id} {:collection_id collection_id}]
                    Dashboard [{dashboard_id :id}]]
      (is (partial= {:collection_id collection_id :dashboard_id dashboard_id}
                    (mt/user-http-request :crowberto :put 200 (str "app/" app_id) {:dashboard_id dashboard_id}))))
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
