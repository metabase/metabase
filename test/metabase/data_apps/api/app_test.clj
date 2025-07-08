(ns metabase.data-apps.api.app-test
  "Tests for /api/app endpoints for data app consumers"
  (:require
   [clojure.test :refer :all]
   [metabase.data-apps.test-util :as data-apps.tu]
   [metabase.test :as mt]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(defn- get-app-url
  "Helper function to construct a properly URL-encoded app endpoint."
  [app-url]
  (str "/app/" (codec/url-encode app-url)))

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
      [app1 {:name "App 1" :url "/app1"}]
      (data-apps.tu/with-released-app!
        [app2 {:name "App 2" :url "/app2"}]
        (let [response (filter-apps-by-ids (get-app-list :crowberto 200 "limit=1&offset=0")
                                           #{(:id app1) (:id app2)})]
          (is (=? {:data [{:id (:id app2)}]
                   :limit 1
                   :offset 0
                   :total (mt/malli=? pos-int?)}
                  response)))))))

(deftest get-published-app-by-url-test
  (testing "GET /api/app/:url - fetch specific published app"
    (data-apps.tu/with-released-app!
      [app {:url "my-test-app"}]
      (is (=? {:id (:id app)
               :name (:name app)
               :url (:url app)
               :definition (mt/malli=? :map)}
              (mt/user-http-request :crowberto :get 200 (get-app-url "my-test-app"))))))

  (testing "GET /api/app/:url - returns 404 for non-existent app"
    (mt/user-http-request :crowberto :get 404 (get-app-url "non-existent-app")))

  (testing "GET /api/app/:url - returns 404 for app private app"
    (data-apps.tu/with-data-app [app {:status :private
                                      :url     "unreleased-app"}]
      (mt/user-http-request :crowberto :get 404 (get-app-url "unreleased-app"))))

  (testing "GET /api/app/:url - returns 404 for app archvied app"
    (data-apps.tu/with-data-app [app {:status :archived
                                      :url     "unreleased-app"}]
      (mt/user-http-request :crowberto :get 404 (get-app-url "unreleased-app"))))

  (testing "GET /api/app/:url - returns 404 for app released but archvived apps"
    (data-apps.tu/with-released-app! [app]
      (t2/update! :model/DataApp (:id app) {:status :archived})
      (mt/user-http-request :crowberto :get 404 (get-app-url "unreleased-app")))))

(deftest get-published-app-url-encoding-test
  (testing "GET /api/app/:url - handles URL-encoded paths correctly"
    (data-apps.tu/with-released-app!
      [app {:url "my-app/with-slash"}]
      (let [response (mt/user-http-request :crowberto :get 200 (get-app-url "my-app/with-slash"))]
        (is (=? {:id (:id app)
                 :name (:name app)
                 :url "my-app/with-slash"}
                response))))

    (testing "with special characters"
      (data-apps.tu/with-released-app!
        [app {:url "my app with spaces"}]
        (let [response (mt/user-http-request :crowberto :get 200 (get-app-url "my app with spaces"))]
          (is (=? {:id (:id app)
                   :name (:name app)
                   :url "my app with spaces"}
                  response)))))))
