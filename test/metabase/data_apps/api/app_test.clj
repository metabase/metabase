(ns metabase.data-apps.api.app-test
  "Tests for /api/app endpoints for data app consumers"
  (:require
   [clojure.test :refer :all]
   [metabase.data-apps.test-util :as data-apps.tu]
   [metabase.test :as mt]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(defn- get-app-slug
  "Helper function to construct a properly slug-encoded app endpoint."
  [app-slug]
  (str "/app/" (codec/url-encode app-slug)))

(defn- get-app-list
  "Helper function to fetch the list of apps."
  ([user status query-params]
   (let [endpoint (if query-params
                    (str "/app/?" query-params)
                    "/app/")]
     (mt/user-http-request user :get status endpoint)))
  ([]
   (get-app-list :crowberto 200 nil)))

(defn- filter-apps-by-ids
  [response app-ids]
  (assert (set? app-ids))
  (assoc response :data (filter #(app-ids (:id %)) (:data response))))

(deftest get-published-apps-test
  (testing "GET /api/app/ - fetch published data apps"
    (data-apps.tu/with-released-app!
      [app {}]
      (is (=? {:data [{:id (:id app)}]
               :limit nil
               :offset nil
               :total (mt/malli=? pos-int?)}
              (filter-apps-by-ids (get-app-list)
                                  #{(:id app)})))))

  (testing "GET /api/app/ - pagination works"
    (data-apps.tu/with-released-app!
      [app1 {:name "App 1" :slug "/app1"}]
      (data-apps.tu/with-released-app!
        [app2 {:name "App 2" :slug "/app2"}]
        (let [response (filter-apps-by-ids (get-app-list :crowberto 200 "limit=1&offset=0")
                                           #{(:id app1) (:id app2)})]
          (is (=? {:data [{:id (:id app2)}]
                   :limit 1
                   :offset 0
                   :total (mt/malli=? pos-int?)}
                  response)))))))

(deftest get-published-app-by-slug-test
  (testing "GET /api/app/:slug - fetch specific published app"
    (data-apps.tu/with-released-app!
      [app {:slug "my-test-app"}]
      (is (=? {:id         (:id app)
               :name       (:name app)
               :slug       (:slug app)
               :definition (mt/malli=? :map)}
              (mt/user-http-request :crowberto :get 200 (get-app-slug "my-test-app"))))))

  (testing "GET /api/app/:slug - returns 404 for non-existent app"
    (mt/user-http-request :crowberto :get 404 (get-app-slug "non-existent-app")))

  (testing "GET /api/app/:slug - returns 404 for app private app"
    (data-apps.tu/with-data-app! [app {:status :private
                                       :slug   "unreleased-app"}]
      (mt/user-http-request :crowberto :get 404 (get-app-slug "unreleased-app"))))

  (testing "GET /api/app/:slug - returns 404 for app archvied app"
    (data-apps.tu/with-data-app! [app {:status :archived
                                       :slug   "unreleased-app"}]
      (mt/user-http-request :crowberto :get 404 (get-app-slug "unreleased-app"))))

  (testing "GET /api/app/:slug - returns 404 for app released but archvived apps"
    (data-apps.tu/with-released-app! [app]
      (t2/update! :model/DataApp (:id app) {:status :archived})
      (mt/user-http-request :crowberto :get 404 (get-app-slug "unreleased-app")))))

(deftest get-published-app-slug-encoding-test
  (testing "GET /api/app/:slug - handles slug-encoded paths correctly"
    (data-apps.tu/with-released-app!
      [app {:slug "my-app/with-slash"}]
      (let [response (mt/user-http-request :crowberto :get 200 (get-app-slug "my-app/with-slash"))]
        (is (=? {:id (:id app)
                 :name (:name app)
                 :slug "my-app/with-slash"}
                response))))

    (testing "with special characters"
      (data-apps.tu/with-released-app!
        [app {:slug "my app with spaces"}]
        (let [response (mt/user-http-request :crowberto :get 200 (get-app-slug "my app with spaces"))]
          (is (=? {:id (:id app)
                   :name (:name app)
                   :slug "my app with spaces"}
                  response)))))))
