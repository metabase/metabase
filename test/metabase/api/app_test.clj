(ns metabase.api.app-test
  (:require
    [clojure.test :refer [deftest is testing]]
    [medley.core :as m]
    [metabase.models :refer [App Card Collection Dashboard Permissions]]
    [metabase.models.collection.graph :as graph]
    [metabase.models.permissions :as perms]
    [metabase.models.permissions-group :as perms-group]
    [metabase.test :as mt]
    [metabase.test.data :as data]
    [toucan.db :as db]
    [toucan.hydrate :refer [hydrate]]))

(deftest create-test
  (mt/with-model-cleanup [Collection Permissions]
    (let [base-params {:name "App collection"
                       :color "#123456"}]
      (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
        (testing "parent_id is ignored when creating apps"
          (mt/with-temp* [Collection [{collection-id :id}]]
            (let [coll-params (assoc base-params :parent_id collection-id)
                  response (mt/user-http-request :crowberto :post 200 "app" {:collection coll-params})]
              (is (pos-int? (:id response)))
              (is (pos-int? (:collection_id response)))
              (is (partial= (assoc base-params :location "/")
                            (:collection response)))
              (is (partial= {:groups {(:id (perms-group/all-users)) {(:collection_id response) :none}}}
                            (graph/graph))
                  "''All Users'' should have the default permission on the app collection"))))
        (testing "Create app in the root"
          (mt/with-temporary-setting-values [all-users-app-permission :read]
            (let [response (mt/user-http-request :crowberto :post 200 "app" {:collection base-params})]
             (is (pos-int? (:id response)))
             (is (pos-int? (:collection_id response)))
             (is (partial= (assoc base-params :location "/")
                           (:collection response)))
             (is (partial= {:groups {(:id (perms-group/all-users)) {(:collection_id response) :read}}}
                           (graph/graph))
                 "''All Users'' should have the default permission on the app collection"))))
        (testing "With initial dashboard and nav_items"
          (mt/with-temp Dashboard [{dashboard-id :id}]
            (let [nav_items [{:options {:click_behavior {}}}]]
              (is (partial= {:collection (assoc base-params :location "/")
                             :dashboard_id dashboard-id
                             :nav_items nav_items}
                            (mt/user-http-request :rasta :post 200 "app" {:collection base-params
                                                                          :dashboard_id dashboard-id
                                                                          :nav_items nav_items}))))))))))

(deftest update-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (let [app-data {:nav_items [{:options {:item "stuff"}}]
                    :options {:frontend "stuff"}}]
      (mt/with-temp* [Collection [{collection_id :id}]
                      App [{app_id :id} (assoc app-data :collection_id collection_id)]
                      Dashboard [{dashboard_id :id}]]
        (let [expected (assoc app-data :collection_id collection_id :dashboard_id dashboard_id)]
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

(deftest list-apps-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (let [app-data {:nav_items [{:options {:item "stuff"}}]
                    :options {:frontend "stuff"}}]
      (mt/with-temp* [Collection [{collection_id :id :as collection}]
                      Dashboard [{dashboard_id :id}]
                      App [{app-id :id} (assoc app-data :collection_id collection_id :dashboard_id dashboard_id)]]
        (let [expected (merge app-data {:id app-id
                                        :collection_id collection_id
                                        :dashboard_id dashboard_id
                                        :collection (assoc collection :can_write true)})]
          (testing "can query non-archived apps"
            (is (partial= [expected]
                          (mt/user-http-request :crowberto :get 200 "app"))))))
      (testing "can only see apps with permission for"
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp* [Collection [collection-1 {:name "Collection 1"}]
                          Collection [collection-2 {:name "Collection 2"}]
                          Dashboard [{dashboard_id :id}]
                          App [{app-id :id} (assoc app-data :collection_id (:id collection-1) :dashboard_id dashboard_id)]
                          App [_            (assoc app-data :collection_id (:id collection-2) :dashboard_id dashboard_id)]]
            (perms/grant-collection-read-permissions! (perms-group/all-users) collection-1)
            (let [expected (merge app-data {:id app-id
                                            :collection_id (:id collection-1)
                                            :dashboard_id dashboard_id
                                            :collection (assoc collection-1 :can_write false)})]
              (is (partial= [expected]
                            (mt/user-http-request :rasta :get 200 "app")))))))
      (testing "archives"
        (mt/with-temp* [Collection [collection-1 {:name "Collection 1"}]
                        Collection [collection-2 {:name "Collection 2" :archived true}]
                        Dashboard [{dashboard_id :id}]
                        App [{app-1-id :id} (assoc app-data :collection_id (:id collection-1) :dashboard_id dashboard_id)]
                        App [{app-2-id :id} (assoc app-data :collection_id (:id collection-2) :dashboard_id dashboard_id)]]
          (testing "listing normal apps"
            (let [expected (merge app-data {:id app-1-id
                                            :collection_id (:id collection-1)
                                            :dashboard_id dashboard_id
                                            :collection (assoc collection-1 :can_write true)})]
              (is (partial= [expected]
                            (mt/user-http-request :rasta :get 200 "app")))))
          (testing "listing archived"
            (let [expected (merge app-data {:id app-2-id
                                            :collection_id (:id collection-2)
                                            :dashboard_id dashboard_id
                                            :collection (assoc collection-2 :can_write true)})]
              (is (partial= [expected]
                            (mt/user-http-request :rasta :get 200 "app/?archived=true"))))))))))

(deftest fetch-app-test
  (let [app-data {:nav_items [{:options {:item "stuff"}}]
                  :options {:frontend "stuff"}}]
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp* [Collection [{collection_id :id :as collection}]
                      Dashboard [{dashboard_id :id}]
                      App [{app-id :id} (assoc app-data :collection_id collection_id :dashboard_id dashboard_id)]]
        (testing "that we can see app details"
          (let [expected (merge app-data {:id app-id
                                          :collection_id collection_id
                                          :dashboard_id dashboard_id
                                          :collection (assoc collection :can_write true)})]
            (is (partial= expected
                          (mt/user-http-request :crowberto :get 200 (str "app/" app-id))))))
        (testing "that app detail properly checks permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (str "app/" app-id)))))))))

(deftest scaffold-test
  (mt/with-model-cleanup [Card Dashboard Collection Permissions]
    (testing "Golden path"
      (mt/with-temporary-setting-values [all-users-app-permission :read]
        (let [app (mt/user-http-request
                   :crowberto :post 200 "app/scaffold"
                   {:table-ids [(data/id :venues)]
                    :app-name "My test app"})
              pages (m/index-by :name (hydrate (db/select Dashboard :collection_id (:collection_id app)) :ordered_cards))
              list-page (get pages "Venues List")
              detail-page (get pages "Venues Detail")]
          (is (partial= {:nav_items [{:page_id (:id list-page)}
                                     {:page_id (:id detail-page) :hidden true :indent 1}]
                         :dashboard_id (:id list-page)}
                        app))
          (is (partial= {:ordered_cards [{:visualization_settings {:click_behavior
                                                                   {:type "link",
                                                                    :linkType "page",
                                                                    :targetId (:id detail-page)}}}
                                         {}]}
                        list-page))
          (is (partial= {:groups {(:id (perms-group/all-users)) {(:collection_id app) :read}}}
                        (graph/graph))
              "''All Users'' should have the default permission on the app collection"))))
    (testing "Bad or duplicate tables"
      (is (= (format "Some tables could not be found. Given: (%s %s) Found: (%s)"
                     (data/id :venues)
                     Integer/MAX_VALUE
                     (data/id :venues))
             (mt/user-http-request
               :crowberto :post 400 "app/scaffold"
               {:table-ids [(data/id :venues) (data/id :venues) Integer/MAX_VALUE]
                :app-name (str "My test app " (gensym))}))))))

(deftest scaffold-app-test
  (mt/with-model-cleanup [Card Dashboard]
    (mt/with-temp* [Collection [{collection-id :id}]
                    App [{app-id :id} {:collection_id collection-id}]]
      (testing "Without existing pages"
        (let [app (mt/user-http-request
                    :crowberto :post 200 (format "app/%s/scaffold" app-id)
                    {:table-ids [(data/id :venues)]})
              pages (m/index-by :name (hydrate (db/select Dashboard :collection_id (:collection_id app)) :ordered_cards))
              list-page (get pages "Venues List")
              detail-page (get pages "Venues Detail")]
          (is (partial= {:nav_items [{:page_id (:id list-page)}
                                     {:page_id (:id detail-page) :hidden true :indent 1}]}
                        app))
          (is (partial= {:ordered_cards [{:visualization_settings {:click_behavior
                                                                   {:type "link",
                                                                    :linkType "page",
                                                                    :targetId (:id detail-page)}}}
                                         {}]}
                        list-page))))
      (testing "With existing pages"
        (let [app (mt/user-http-request
                    :crowberto :post 200 (format "app/%s/scaffold" app-id)
                    {:table-ids [(data/id :checkins)]})
              pages (m/index-by :name (hydrate (db/select Dashboard :collection_id (:collection_id app)) :ordered_cards))
              list-page (get pages "Checkins List")
              detail-page (get pages "Checkins Detail")]
          (is (partial= {:nav_items [{:page_id (get-in pages ["Venues List" :id])}
                                     {:page_id (get-in pages ["Venues Detail" :id])}
                                     {:page_id (:id list-page)}
                                     {:page_id (:id detail-page) :hidden true :indent 1}]}
                        app))
          (is (partial= {:ordered_cards [{:visualization_settings {:click_behavior
                                                                   {:type "link",
                                                                    :linkType "page",
                                                                    :targetId (:id detail-page)}}}
                                         {}]}
                        list-page)))))))

(deftest global-ggraph-test
  (mt/with-model-cleanup [Collection Permissions]
    (let [base-params {:name "App collection"
                       :color "#123456"}]
      (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
        (testing "changing default permission"
          (mt/with-temp* [Collection [{collection-id :id}]]
            (let [coll-params (assoc base-params :parent_id collection-id)
                  response1 (mt/user-http-request :crowberto :post 200 "app" {:collection coll-params})
                  response2 (mt/user-http-request :crowberto :post 200 "app" {:collection base-params})]
              (is (partial= {:groups {(:id (perms-group/all-users)) {(:collection_id response1) :none
                                                                     (:collection_id response2) :none}}}
                            (graph/graph)))
              (mt/user-http-request :crowberto :put 200 "app/global-graph"
                                    (assoc-in (mt/user-http-request :crowberto :get 200 "app/global-graph")
                                              [:groups (:id (perms-group/all-users))]
                                              :write))
              (is (partial= {:groups {(:id (perms-group/all-users)) {(:collection_id response1) :write
                                                                     (:collection_id response2) :write}}}
                            (graph/graph))))))))))
