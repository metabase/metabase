(ns metabase.product-notifications.task-test
  (:require
   [clj-http.fake :as http-fake]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.product-notifications.task :as pn.task]
   [metabase.task.core :as task]))

(def ^:private feed-route
  #"https://static.metabase.com/notifications.json.*")

(deftest get-notifications-test
  (testing "the fetched feed is parsed with keywordized keys"
    (http-fake/with-fake-routes-in-isolation
      {feed-route (constantly {:status 200
                               :body   "{\"notifications\":[{\"id\":\"x\",\"schemaVersion\":1}]}"})}
      (is (= {:notifications [{:id "x" :schemaVersion 1}]}
             (@#'pn.task/get-notifications)))))
  (testing "a non-200 response throws"
    (http-fake/with-fake-routes-in-isolation
      {feed-route (constantly {:status 500 :body "boom"})}
      (is (thrown? Exception (@#'pn.task/get-notifications))))))

(deftest triggers-fetch-on-startup-test
  (testing "init! schedules the recurring job and fires an immediate fetch on startup"
    (let [scheduled? (atom false)
          triggered  (atom nil)]
      (with-redefs [task/schedule-task! (fn [_job _trigger] (reset! scheduled? true))
                    task/trigger-now!   (fn [job-key] (reset! triggered job-key))]
        (task/init! :metabase.product-notifications.task/FetchProductNotifications)
        (is (true? @scheduled?))
        (is (str/includes? (str @triggered) "metabase.task.product-notifications.job"))))))
