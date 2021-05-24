(ns metabase.api.task-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.models.task-history :refer [TaskHistory]]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db]))

(def ^:private default-task-history
  {:id true, :db_id true, :started_at true, :ended_at true, :duration 10, :task_details nil})

(defn- generate-tasks
  "Creates `n` task history maps with guaranteed increasing `:ended_at` times. This means that when stored and queried
  via the GET `/` endpoint, will return in reverse order from how this function returns the task history maps."
  [n]
  (let [now        (t/zoned-date-time)
        task-names (repeatedly n mt/random-name)]
    (map-indexed (fn [idx task-name]
                   {:task       task-name
                    :started_at now
                    :ended_at   (t/plus now (t/seconds idx))})
                 task-names)))

(deftest list-perms-test
  (testing "Only superusers can query for TaskHistory"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "task/")))))

(deftest list-test
  (testing "Superusers can query TaskHistory, should return DB results"
    (let [[task-hist-1 task-hist-2] (generate-tasks 2)
          task-hist-1 (assoc task-hist-1 :duration 100)
          task-hist-2 (assoc task-hist-1 :duration 200 :task_details {:some "complex", :data "here"})
          task-names (set (map :task [task-hist-1 task-hist-2]))]
      (mt/with-temp* [TaskHistory [task-1 task-hist-1]
                      TaskHistory [task-2 task-hist-2]]
        (is (= (set (map (fn [task-hist]
                           (merge default-task-history (select-keys task-hist [:task :duration :task_details])))
                         [task-hist-2 task-hist-1]))
               (set (for [result (:data (mt/user-http-request :crowberto :get 200 "task/"))
                          :when  (contains? task-names (:task result))]
                      (mt/boolean-ids-and-timestamps result)))))))))

(deftest sort-by-ended-at-test
  (testing (str "Multiple results should be sorted via `:ended_at`. Below creates two tasks, the second one has a "
                "later `:ended_at` date and should be returned first")
    (let [[task-hist-1 task-hist-2 :as task-histories] (generate-tasks 2)
          task-names                                   (set (map :task task-histories))]
      (mt/with-temp* [TaskHistory [task-1 task-hist-1]
                      TaskHistory [task-2 task-hist-2]]
        (is (= (map (fn [{:keys [task]}]
                      (assoc default-task-history :task task))
                    [task-hist-2 task-hist-1])
               (for [result (:data (mt/user-http-request :crowberto :get 200 "task/"))
                     :when  (contains? task-names (:task result))]
                 (mt/boolean-ids-and-timestamps result))))))))

(deftest limit-param-test
  (testing "Should default when only including a limit"
    (is (= (mt/user-http-request :crowberto :get 200 "task/" :limit 100 :offset 0)
           (mt/user-http-request :crowberto :get 200 "task/" :limit 100))))

  (testing "Should default when only including an offset"
    (is (= (mt/user-http-request :crowberto :get 200 "task/" :limit 50 :offset 100)
           (mt/user-http-request :crowberto :get 200 "task/" :offset 100)))))

(deftest paging-test
  (testing "Check that paging information is applied when provided and included in the response"
    (db/delete! TaskHistory)
    (let [[task-hist-1 task-hist-2 task-hist-3 task-hist-4] (generate-tasks 4)]
      (mt/with-temp* [TaskHistory [task-1 task-hist-1]
                      TaskHistory [task-2 task-hist-2]
                      TaskHistory [task-3 task-hist-3]
                      TaskHistory [task-4 task-hist-4]]
        (is (= {:total 4, :limit 2, :offset 0
                :data  (map (fn [{:keys [task]}]
                              (assoc default-task-history :task task))
                            [task-hist-4 task-hist-3])}
               (mt/boolean-ids-and-timestamps
                (mt/user-http-request :crowberto :get 200 "task/" :limit 2 :offset 0))))
        (is (= {:total 4, :limit 2, :offset 2
                :data  (map (fn [{:keys [task]}]
                              (assoc default-task-history :task task))
                            [task-hist-2 task-hist-1])}
               (mt/boolean-ids-and-timestamps
                (mt/user-http-request :crowberto :get 200 "task/" :limit 2 :offset 2))))))))

(deftest not-found-test
  (testing "Superusers querying for a TaskHistory that doesn't exist will get a 404"
    (is (= "Not found."
           (mt/user-http-request :crowberto :get 404 (format "task/%s" Integer/MAX_VALUE))))))

(deftest fetch-perms-test
  (testing "Regular users can't query for a specific TaskHistory"
    (mt/with-temp TaskHistory [task]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 (format "task/%s" (u/the-id task))))))))

(deftest fetch-test
  (testing "Superusers querying for specific TaskHistory will get that task info"
    (mt/with-temp TaskHistory [task {:task     "Test Task"
                                     :duration 100}]
      (is (= (merge default-task-history {:task "Test Task", :duration 100})
             (mt/boolean-ids-and-timestamps
              (mt/user-http-request :crowberto :get 200 (format "task/%s" (u/the-id task)))))))))
