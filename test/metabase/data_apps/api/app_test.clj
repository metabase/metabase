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
  "To avoid failure during devs since we might have data apps in the db."
  [response app-ids]
  (assert (set? app-ids))
  ;; TODO should refactor this pattern to filter out the pre-existing app ids
  (assoc response :data (filter #(app-ids (:id %)) (:data response))))

(deftest get-published-apps-test
  (testing "GET /api/app/ - fetch published data apps"
    (data-apps.tu/with-released-app!
      [app {}]
      (is (=? {:data   [{:id (:id app)}]
               :limit  nil
               :offset nil
               :total  (mt/malli=? pos-int?)}
              (filter-apps-by-ids (get-app-list) #{(:id app)})))))

  (testing "GET /api/app/ - pagination works"
    (data-apps.tu/with-released-app!
      [app1 {:name "App 1" :slug "app1"}
       app2 {:name "App 2" :slug "app2"}]
      (let [response (filter-apps-by-ids (get-app-list :crowberto 200 "limit=1&offset=0")
                                         #{(:id app1) (:id app2)})]
        (is (=? {:data   [{:id (:id app2)}]
                 :limit  1
                 :offset 0
                 :total  (mt/malli=? pos-int?)}
                response))))))

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
    (data-apps.tu/with-data-app! [_app {:status :private
                                        :slug   "unreleased-app"}]
      (mt/user-http-request :crowberto :get 404 (get-app-slug "unreleased-app"))))

  (testing "GET /api/app/:slug - returns 404 for app archived app"
    (data-apps.tu/with-data-app! [_app {:status :archived
                                        :slug   "archived-app"}]
      (mt/user-http-request :crowberto :get 404 (get-app-slug "archived-app"))))

  (testing "GET /api/app/:slug - returns 404 for app released but archived apps"
    (data-apps.tu/with-released-app! [app {:status :published
                                           :slug   "archived-app"}]
      (t2/update! :model/DataApp (:id app) {:status :archived})
      (mt/user-http-request :crowberto :get 404 (get-app-slug "archived-app"))))

  (testing "GET /api/appp/:slug - returns 404 for published app without any active releases"
    (data-apps.tu/with-released-app! [app {:status :published
                                           :slug   "published-no-release-app"}]
      (t2/update! :model/DataAppRelease :app_id (:id app) {:retracted true})
      (mt/user-http-request :crowberto :get 404 (get-app-slug "published-no-release-app")))))
