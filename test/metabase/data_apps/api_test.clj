(ns metabase.data-apps.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- create-app! []
  (t2/insert! :model/DataApp
              :name         "demo"
              :display_name "Demo"
              :bundle       (.getBytes "BUNDLE" "UTF-8")
              :bundle_hash  "abc123"))

;;; Data apps run arbitrary JS, so managing AND viewing them are superuser-only
;;; (matching the IsAdmin guards on the admin and /data-app/:name routes).

(deftest non-superuser-is-forbidden-test
  (mt/with-model-cleanup [:model/DataApp]
    (create-app!)
    (testing "a non-superuser is forbidden from every data-app endpoint"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "data-app")))
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "data-app/demo")))
      (mt/user-real-request :rasta :get 403 "data-app/demo/bundle")
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :delete 403 "data-app/demo"))))))

(deftest superuser-can-manage-and-view-test
  (mt/with-model-cleanup [:model/DataApp]
    (create-app!)
    (testing "a superuser can list, read metadata, and serve the bundle"
      (is (=? [{:name "demo" :display_name "Demo"}]
              (mt/user-http-request :crowberto :get 200 "data-app")))
      (is (=? {:name "demo"}
              (mt/user-http-request :crowberto :get 200 "data-app/demo")))
      (is (str/includes?
           (str (mt/user-real-request :crowberto :get 200 "data-app/demo/bundle"))
           "BUNDLE")))))
