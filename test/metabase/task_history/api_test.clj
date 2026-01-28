(ns metabase.task-history.api-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [toucan2.core :as t2]))

(def ^:private default-task-history
  {:id true, :db_id true, :started_at true, :ended_at true, :duration 10, :task_details nil :status "success" :logs nil :run_id false})

(defn- generate-tasks
  "Creates `n` task history maps with guaranteed increasing `:ended_at` times. This means that when stored and queried
  via the GET `/` endpoint, will return in reverse order from how this function returns the task history maps."
  [n]
  (let [task-names (repeatedly n mt/random-name)]
    (map-indexed (fn [idx task-name]
                   (let [now (t/zoned-date-time)]
                     {:status     :success
                      :task       task-name
                      :started_at now
                      :ended_at   (t/plus now (t/seconds idx))}))
                 task-names)))

(deftest list-perms-test
  (testing "Only superusers can query for TaskHistory"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "task/")))))

(deftest list-test
  (testing "Superusers can query TaskHistory, should return DB results"
    (let [[task-hist-1 _task-hist-2] (generate-tasks 2)
          task-hist-1 (assoc task-hist-1 :duration 100)
          task-hist-2 (assoc task-hist-1 :duration 200 :task_details {:some "complex", :data "here"})
          task-names (set (map :task [task-hist-1 task-hist-2]))]
      (mt/with-temp [:model/TaskHistory _ task-hist-1
                     :model/TaskHistory _ task-hist-2]
        (is (= (set (map (fn [task-hist]
                           (merge default-task-history (select-keys task-hist [:task :duration :task_details])))
                         [task-hist-2 task-hist-1]))
               (set (for [result (:data (mt/user-http-request :crowberto :get 200 "task/"))
                          :when  (contains? task-names (:task result))]
                      (mt/boolean-ids-and-timestamps result)))))))))

(deftest sort-by-started-at-test
  (testing (str "Multiple results should be sorted via `:started_at`. Below creates two tasks, the second one has a "
                "later `:started_at` date and should be returned first")
    (let [now             (t/zoned-date-time)
          now-1s          (t/minus now (t/seconds 1))
          now-2s          (t/minus now (t/seconds 2))
          task-hist-1     {:task (mt/random-name)
                           :started_at now-2s
                           :ended_at   now}
          task-hist-2     {:task (mt/random-name)
                           :started_at now-1s
                           :ended_at   now-1s}
          task-names      (set (map :task [task-hist-1 task-hist-2]))]
      (mt/with-temp [:model/TaskHistory _ task-hist-1
                     :model/TaskHistory _ task-hist-2]
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
    (t2/delete! :model/TaskHistory)
    (let [[task-hist-1 task-hist-2 task-hist-3 task-hist-4] (generate-tasks 4)]
      (mt/with-temp [:model/TaskHistory _ task-hist-1
                     :model/TaskHistory _ task-hist-2
                     :model/TaskHistory _ task-hist-3
                     :model/TaskHistory _ task-hist-4]
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
    (mt/with-temp [:model/TaskHistory task]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 (format "task/%s" (u/the-id task))))))))

(deftest fetch-test
  (testing "Superusers querying for specific TaskHistory will get that task info"
    (mt/with-temp [:model/TaskHistory task {:task     "Test Task"
                                            :duration 100}]
      (is (= (merge default-task-history {:task "Test Task", :duration 100})
             (mt/boolean-ids-and-timestamps
              (mt/user-http-request :crowberto :get 200 (format "task/%s" (u/the-id task)))))))))

(deftest fetch-info-test
  (testing "Regular user can't get task info"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "task/info"))))

  (testing "Superusers could get task info"
    (is (malli= [:map
                 [:scheduler :any]
                 [:jobs      [:sequential
                              [:map-of :any :any]]]]
                (mt/user-http-request :crowberto :get 200 "task/info")))))

(deftest ^:synchronized single-filter-test
  (testing "Check that paging information is applied when provided and included in the response"
    (t2/delete! :model/TaskHistory)
    (let [now (t/zoned-date-time)]
      (mt/with-temp [:model/TaskHistory
                     _
                     {:status "success"
                      :task "success"
                      :started_at (t/minus now (t/hours 1))
                      :ended_at (t/plus (t/minus now (t/hours 1)) (t/seconds 30))}

                     :model/TaskHistory
                     _
                     {:status :failed
                      :task "failed"
                      :started_at (t/zoned-date-time)
                      :ended_at (t/zoned-date-time)}

                     :model/TaskHistory
                     _
                     {:status :started
                      :task "started"
                      :started_at (t/zoned-date-time)}]
        (letfn [(status-test-filtering-response
                  [status]
                  (testing (format "Filtering for %s response works correctly" status)
                    (let [response (mt/user-http-request :crowberto :get 200 "task/" :status status)]
                      (is (= 1 (-> response :data count)))
                      (is (= status (-> response :data first :task)))
                      (is (= status (-> response :data first :status))))))]
          (status-test-filtering-response "success")
          (status-test-filtering-response "started")
          (status-test-filtering-response "failed"))
        (testing "No filter in query params returns all tasks"
          (let [response (mt/user-http-request :crowberto :get 200 "task/")]
            (is (= 3 (-> response :data count)))))
        (testing "Error is returned on explicit nil status"
          (is (=? {:errors {:status "enum of :started, :unknown, :success, :failed"}}
                  (mt/user-http-request :crowberto :get 400 "task/" :status nil))))
        (testing "Error is returned for unexpected status values"
          (is (=? {:errors {:status "enum of :started, :unknown, :success, :failed"}}
                  (mt/user-http-request :crowberto :get 400 "task/" :status 1))))
        (letfn [(task-test-filtering-response
                  [task]
                  (testing (format "Filtering for `%s` named task works correctly" task)
                    (let [response (mt/user-http-request :crowberto :get 200 "task/" :task task)]
                      (is (= 1 (-> response :data count)))
                      (is (= task (-> response :data first :task)))
                      (is (= task (-> response :data first :status))))))]
          (task-test-filtering-response "success")
          (task-test-filtering-response "started")
          (task-test-filtering-response "failed"))))))

(deftest ^:synchronized combined-filter-test
  (testing "Check that paging information is applied when provided and included in the response"
    (t2/delete! :model/TaskHistory)
    (let [now (t/zoned-date-time)]
      (mt/with-temp [:model/TaskHistory
                     _
                     {:status "success"
                      :task "a"
                      :started_at (t/minus now (t/hours 1))
                      :ended_at (t/plus (t/minus now (t/hours 1)) (t/seconds 30))}

                     :model/TaskHistory
                     _
                     {:status :failed
                      :task "b"
                      :started_at (t/zoned-date-time)
                      :ended_at (t/zoned-date-time)}

                     :model/TaskHistory
                     _
                     {:status :started
                      :task "c"
                      :started_at (t/zoned-date-time)}]
        (doseq [task ["a" "b" "c"]
                status [:success :failed :started]
                :let [expecting-results (or (and (= task "a") (= status :success))
                                            (and (= task "b") (= status :failed))
                                            (and (= task "c") (= status :started)))]]
          (let [response (mt/user-http-request :crowberto :get 200 "task/" :task task :status status)]
            (if expecting-results
              (testing "Correct results returned for combined filter"
                (is (= 1 (count (:data response))))
                (is (= task (-> response :data first :task)))
                (is (= (name status) (-> response :data first :status))))
              (testing "No results returned for too strict combined filter"
                (is (empty? (-> response :data)))))))))))

(deftest ^:synchronized multi-results-combined-filter-test
  (testing "Check that paging information is applied when provided and included in the response"
    (t2/delete! :model/TaskHistory)
    (let [now (t/zoned-date-time)]
      (mt/with-temp
        [;; task a
         :model/TaskHistory
         _
         {:status "success"
          :task "a"
          :started_at (t/minus now (t/hours 1))
          :ended_at (t/plus (t/minus now (t/hours 1)) (t/seconds 30))}
         :model/TaskHistory
         _
         {:status "failed"
          :task "a"
          :started_at (t/minus now (t/hours 1))
          :ended_at (t/plus (t/minus now (t/hours 1)) (t/seconds 30))}

         ;; task b
         :model/TaskHistory
         _
         {:status :failed
          :task "b"
          :started_at (t/zoned-date-time)
          :ended_at (t/zoned-date-time)}
         :model/TaskHistory
         _
         {:status :started
          :task "b"
          :started_at (t/zoned-date-time)}

         ;; task c
         :model/TaskHistory
         _
         {:status :started
          :task "c"
          :started_at (t/zoned-date-time)}
         :model/TaskHistory
         _
         {:status :success
          :task "c"
          :started_at (t/zoned-date-time)
          :ended_at (t/zoned-date-time)}]
        (testing "Multiple tasks returned for task"
          (let [response (mt/user-http-request :crowberto :get 200 "task/" :task "a")]
            (is (= 2 (-> response :data count)))
            (is (some (comp #{"failed"} :status) (-> response :data)))
            (is (some (comp #{"success"} :status) (-> response :data)))))
        (testing "Multiple tasks returned for status"
          (let [response (mt/user-http-request :crowberto :get 200 "task/" :status :failed)]
            (is (= 2 (-> response :data count)))
            (is (some (comp #{"b"} :task) (-> response :data)))
            (is (some (comp #{"a"} :task) (-> response :data)))))))))

(deftest ^:synchronized unique-tasks-test
  (testing "Check that paging information is applied when provided and included in the response"
    (t2/delete! :model/TaskHistory)
    (testing "Empty vector is returned for empty task list"
      (is (= []
             (mt/user-http-request :crowberto :get 200 "task/unique-tasks"))))
    (let [now (t/zoned-date-time)]
      (mt/with-temp
        [;; task a
         :model/TaskHistory
         _
         {:status "success"
          :task "a"
          :started_at (t/minus now (t/hours 1))
          :ended_at (t/plus (t/minus now (t/hours 1)) (t/seconds 30))}
         :model/TaskHistory
         _
         {:status "failed"
          :task "a"
          :started_at (t/minus now (t/hours 1))
          :ended_at (t/plus (t/minus now (t/hours 1)) (t/seconds 30))}

           ;; task b
         :model/TaskHistory
         _
         {:status :failed
          :task "b"
          :started_at (t/zoned-date-time)
          :ended_at (t/zoned-date-time)}
         :model/TaskHistory
         _
         {:status :started
          :task "b"
          :started_at (t/zoned-date-time)}

           ;; task c
         :model/TaskHistory
         _
         {:status :started
          :task "c"
          :started_at (t/zoned-date-time)}
         :model/TaskHistory
         _
         {:status :success
          :task "c"
          :started_at (t/zoned-date-time)
          :ended_at (t/zoned-date-time)}]
        (testing "Ordered unique tasks are returned"
          (is (= ["a" "b" "c"]
                 (mt/user-http-request :crowberto :get 200 "task/unique-tasks"))))))))

(deftest ^:synchronized unknown-task-status-test
  (testing "Filtering for unknown status works as expected"
    (t2/delete! :model/TaskHistory)
    (let [now (t/zoned-date-time)]
      (mt/with-temp
        [;; task a
         :model/TaskHistory
         _
         {:status "unknown"
          :task "a"
          :started_at (t/minus now (t/hours 1))
          :ended_at (t/plus (t/minus now (t/hours 1)) (t/seconds 30))}
         :model/TaskHistory
         _
         {:status "failed"
          :task "b"
          :started_at (t/minus now (t/hours 1))
          :ended_at (t/plus (t/minus now (t/hours 1)) (t/seconds 30))}
         :model/TaskHistory
         _
         {:status "unknown"
          :task "c"
          :started_at (t/minus now (t/hours 1))
          :ended_at (t/plus (t/minus now (t/hours 1)) (t/seconds 30))}]
        (let [response (mt/user-http-request :crowberto :get 200 "task/" :status :unknown :offset 1 :limit 1)]
          (is (= 2 (-> response :total)))
          (is (= 1 (-> response :data count)))
          (is (= "unknown" (-> response :data first :status))))))))

(deftest ^:synchronized filtered-tasks-count-test
  (testing "Count respects filtering"
    (t2/delete! :model/TaskHistory)
    (let [now (t/zoned-date-time)]
      (mt/with-temp
        [;; task a
         :model/TaskHistory
         _
         {:status "success"
          :task "a"
          :started_at (t/minus now (t/hours 1))
          :ended_at (t/plus (t/minus now (t/hours 1)) (t/seconds 30))}
         :model/TaskHistory
         _
         {:status "failed"
          :task "a"
          :started_at (t/minus now (t/hours 1))
          :ended_at (t/plus (t/minus now (t/hours 1)) (t/seconds 30))}

          ;; task b
         :model/TaskHistory
         _
         {:status :failed
          :task "b"
          :started_at (t/zoned-date-time)
          :ended_at (t/zoned-date-time)}
         :model/TaskHistory
         _
         {:status :started
          :task "b"
          :started_at (t/zoned-date-time)}

         ;; task c
         :model/TaskHistory
         _
         {:status :started
          :task "c"
          :started_at (t/zoned-date-time)}
         :model/TaskHistory
         _
         {:status :success
          :task "c"
          :started_at (t/zoned-date-time)
          :ended_at (t/zoned-date-time)}]
        (let [response (mt/user-http-request :crowberto :get 200 "task/" :task "a" :offset 0 :limit 1)]
          (is (= 2 (-> response :total)))
          (is (= 1 (-> response :data count)))
          (is (= "a" (-> response :data first :task))))
        (let [response (mt/user-http-request :crowberto :get 200 "task/" :status :success :offset 0 :limit 1)]
          (is (= 2 (-> response :total)))
          (is (= 1 (-> response :data count)))
          (is (= "success" (-> response :data first :status))))))))

(deftest sort-tasks-test
  (t2/delete! :model/TaskHistory)
  (let [now (t/zoned-date-time)]
    (mt/with-temp
      [;; task a
       :model/TaskHistory
       _
       (let [start (t/minus now (t/days 8))
             duration 10000
             end (t/plus start (t/millis duration))]
         {:status "success"
          :task "a"
          :duration duration
          :started_at start
          :ended_at end})
       :model/TaskHistory
       _
       (let [start (t/minus now (t/days 5))
             duration 5000
             end (t/plus start (t/millis duration))]
         {:status "failed"
          :task "a"
          :duration duration
          :started_at start
          :ended_at end})

       ;; task b
       :model/TaskHistory
       _
       (let [start (t/minus now (t/days 4))
             duration 3000
             end (t/plus start (t/millis duration))]
         {:status :failed
          :task "b"
          :duration duration
          :started_at start
          :ended_at end})
       :model/TaskHistory
       _
       (let [start (t/minus now (t/days 3))
             duration 300
             end (t/plus start (t/millis duration))]
         {:status :success
          :task "b"
          :duration duration
          :started_at start
          :ended_at  end})]
      (doseq [sort-column [:started_at :ended_at :duration]
              sort-direction [:asc :desc]
              :let [expected-data (cond (and (= :ended_at sort-column)
                                             (= :desc sort-direction))
                                        (mapv #(hash-map :task  %)
                                              ["b" "b" "a" "a"])

                                        (and (= :started_at sort-column)
                                             (= :desc sort-direction))
                                        (mapv #(hash-map :task  %)
                                              ["b" "b" "a" "a"])

                                        (and (= :ended_at sort-column)
                                             (= :asc sort-direction))
                                        (mapv #(hash-map :task  %)
                                              ["a" "a" "b" "b"])

                                        (and (= :started_at sort-column)
                                             (= :asc sort-direction))
                                        (mapv #(hash-map :task  %)
                                              ["a" "a" "b" "b"])

                                        (and (= :duration sort-column)
                                             (= :asc sort-direction))
                                        (mapv #(hash-map :duration %)
                                              [300 3000 5000 10000])

                                        (and (= :duration sort-column)
                                             (= :desc sort-direction))
                                        (mapv #(hash-map :duration %)
                                              [10000 5000 3000 300]))]]
        (testing (format "Sorting works correctly for %s %s" sort-column sort-direction)
          (let [response (mt/user-http-request :crowberto :get 200 "task/"
                                               :sort_column sort-column :sort_direction sort-direction)]
            (is (= 4 (-> response :total)))
            (is (=? expected-data
                    (-> response :data vec))))))
      (testing "Sorting works with filtering and pagination"
        (let [response (mt/user-http-request :crowberto :get 200 "task/"
                                             :sort_column :duration :sort_direction :desc
                                             :offset 0 :limit 1
                                             :status :success)]
          (is (= 2 (-> response :total)))
          (is (= 1 (-> response :data count)))
          (is [{:duration 10000}]
              (-> response :data vec)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Task Runs API tests                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest runs-list-perms-test
  (testing "Only superusers can query for TaskRuns"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "task/runs")))))

(deftest ^:synchronized runs-list-test
  (t2/delete! :model/TaskRun)
  (testing "Superusers can list TaskRuns"
    (mt/with-temp [:model/Database db {:name "Test DB"}
                   :model/TaskRun _run1 {:run_type    :sync
                                         :entity_type :database
                                         :entity_id   (:id db)
                                         :status      :success
                                         :started_at  (t/minus (t/zoned-date-time) (t/hours 2))
                                         :ended_at    (t/minus (t/zoned-date-time) (t/hours 1))}
                   :model/TaskRun run2 {:run_type    :fingerprint
                                        :entity_type :database
                                        :entity_id   (:id db)
                                        :status      :started
                                        :started_at  (t/zoned-date-time)}]
      (let [response (mt/user-http-request :crowberto :get 200 "task/runs")]
        (is (= 2 (:total response)))
        (is (= 2 (count (:data response))))
        (testing "runs are sorted by started_at desc"
          (is (= (:id run2) (-> response :data first :id))))
        (testing "entity_name is hydrated"
          (is (= "Test DB" (-> response :data first :entity_name))))))))

(deftest ^:synchronized runs-filter-test
  (t2/delete! :model/TaskRun)
  (mt/with-temp [:model/Database db1 {:name "DB1"}
                 :model/Database db2 {:name "DB2"}
                 :model/Dashboard dash {:name "My Dashboard"}
                 :model/TaskRun _ {:run_type    :sync
                                   :entity_type :database
                                   :entity_id   (:id db1)
                                   :status      :success
                                   :started_at  (t/zoned-date-time)
                                   :ended_at    (t/zoned-date-time)}
                 :model/TaskRun _ {:run_type    :sync
                                   :entity_type :database
                                   :entity_id   (:id db2)
                                   :status      :failed
                                   :started_at  (t/zoned-date-time)
                                   :ended_at    (t/zoned-date-time)}
                 :model/TaskRun _ {:run_type    :subscription
                                   :entity_type :dashboard
                                   :entity_id   (:id dash)
                                   :status      :success
                                   :started_at  (t/zoned-date-time)
                                   :ended_at    (t/zoned-date-time)}]
    (testing "filter by run-type"
      (is (= 2 (:total (mt/user-http-request :crowberto :get 200 "task/runs" :run-type "sync"))))
      (is (= 1 (:total (mt/user-http-request :crowberto :get 200 "task/runs" :run-type "subscription")))))
    (testing "filter by entity-type"
      (is (= 2 (:total (mt/user-http-request :crowberto :get 200 "task/runs" :entity-type "database"))))
      (is (= 1 (:total (mt/user-http-request :crowberto :get 200 "task/runs" :entity-type "dashboard")))))
    (testing "filter by entity-id"
      (is (= 1 (:total (mt/user-http-request :crowberto :get 200 "task/runs" :entity-id (:id db1))))))
    (testing "filter by status"
      (is (= 2 (:total (mt/user-http-request :crowberto :get 200 "task/runs" :status "success"))))
      (is (= 1 (:total (mt/user-http-request :crowberto :get 200 "task/runs" :status "failed")))))
    (testing "combined filters"
      (is (= 1 (:total (mt/user-http-request :crowberto :get 200 "task/runs"
                                             :run-type "sync"
                                             :status "failed")))))))

(deftest runs-get-single-test
  (testing "non-superuser cannot access single run"
    (mt/with-temp [:model/TaskRun run {:run_type    :sync
                                       :entity_type :database
                                       :entity_id   1
                                       :status      :success
                                       :started_at  (t/zoned-date-time)}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 (format "task/runs/%d" (:id run)))))))

  (testing "404 for non-existent run"
    (is (= "Not found."
           (mt/user-http-request :crowberto :get 404 (format "task/runs/%d" Integer/MAX_VALUE)))))

  (testing "superuser can get single run with tasks"
    (t2/delete! :model/TaskRun)
    (t2/delete! :model/TaskHistory)
    (mt/with-temp [:model/Database db {:name "Test DB"}
                   :model/TaskRun run {:run_type    :sync
                                       :entity_type :database
                                       :entity_id   (:id db)
                                       :status      :success
                                       :started_at  (t/zoned-date-time)
                                       :ended_at    (t/zoned-date-time)}
                   :model/TaskHistory th1 {:task       "task1"
                                           :status     :success
                                           :run_id     (:id run)
                                           :started_at (t/minus (t/zoned-date-time) (t/seconds 2))
                                           :ended_at   (t/minus (t/zoned-date-time) (t/seconds 1))}
                   :model/TaskHistory _th2 {:task       "task2"
                                            :status     :success
                                            :run_id     (:id run)
                                            :started_at (t/zoned-date-time)
                                            :ended_at   (t/zoned-date-time)}]
      (let [response (mt/user-http-request :crowberto :get 200 (format "task/runs/%d" (:id run)))]
        (is (= (:id run) (:id response)))
        (is (= "Test DB" (:entity_name response)))
        (is (= 2 (count (:tasks response))))
        (testing "tasks are sorted by started_at asc"
          (is (= (:id th1) (-> response :tasks first :id))))))))

(deftest runs-entities-perms-test
  (testing "non-superuser cannot access runs/entities"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "task/runs/entities"
                                 :run-type "sync"
                                 :started-at "past30days")))))

(deftest ^:synchronized runs-task-counts-test
  (t2/delete! :model/TaskRun)
  (t2/delete! :model/TaskHistory)
  (testing "task counts are hydrated correctly"
    (mt/with-temp [:model/Database db {:name "Test DB"}
                   :model/TaskRun run {:run_type    :sync
                                       :entity_type :database
                                       :entity_id   (:id db)
                                       :status      :failed
                                       :started_at  (t/zoned-date-time)
                                       :ended_at    (t/zoned-date-time)}
                   :model/TaskHistory _ {:task       "task1"
                                         :status     :success
                                         :run_id     (:id run)
                                         :started_at (t/zoned-date-time)
                                         :ended_at   (t/zoned-date-time)}
                   :model/TaskHistory _ {:task       "task2"
                                         :status     :success
                                         :run_id     (:id run)
                                         :started_at (t/zoned-date-time)
                                         :ended_at   (t/zoned-date-time)}
                   :model/TaskHistory _ {:task       "task3"
                                         :status     :failed
                                         :run_id     (:id run)
                                         :started_at (t/zoned-date-time)
                                         :ended_at   (t/zoned-date-time)}]
      (let [response (mt/user-http-request :crowberto :get 200 "task/runs")
            run-data (first (:data response))]
        (is (= 3 (:task_count run-data)))
        (is (= 2 (:success_count run-data)))
        (is (= 1 (:failed_count run-data)))))))

(deftest ^:synchronized runs-entities-test
  (t2/delete! :model/TaskRun)
  (testing "returns distinct entities for run type with hydrated names"
    (mt/with-temp [:model/Database db1 {:name "DB1"}
                   :model/Database db2 {:name "DB2"}
                   :model/Dashboard dash {:name "My Dashboard"}
                   ;; Multiple sync runs for same database
                   :model/TaskRun _ {:run_type    :sync
                                     :entity_type :database
                                     :entity_id   (:id db1)
                                     :status      :success
                                     :started_at  (t/zoned-date-time)}
                   :model/TaskRun _ {:run_type    :sync
                                     :entity_type :database
                                     :entity_id   (:id db1)
                                     :status      :success
                                     :started_at  (t/zoned-date-time)}
                   :model/TaskRun _ {:run_type    :sync
                                     :entity_type :database
                                     :entity_id   (:id db2)
                                     :status      :success
                                     :started_at  (t/zoned-date-time)}
                   :model/TaskRun _ {:run_type    :subscription
                                     :entity_type :dashboard
                                     :entity_id   (:id dash)
                                     :status      :success
                                     :started_at  (t/zoned-date-time)}]
      (testing "sync entities"
        (let [response (mt/user-http-request :crowberto :get 200 "task/runs/entities"
                                             :run-type "sync"
                                             :started-at "past30days~")]
          (is (= 2 (count response)))
          (is (every? #(= "database" (:entity_type %)) response))
          (is (= #{"DB1" "DB2"} (set (map :entity_name response))))))
      (testing "subscription entities"
        (let [response (mt/user-http-request :crowberto :get 200 "task/runs/entities"
                                             :run-type "subscription"
                                             :started-at "past30days~")]
          (is (= 1 (count response)))
          (is (= "dashboard" (-> response first :entity_type)))
          (is (= "My Dashboard" (-> response first :entity_name))))))))

(deftest ^:synchronized runs-started-at-filter-test
  (t2/delete! :model/TaskRun)
  (testing "filtering by started-at date range"
    (let [now (t/zoned-date-time)
          old-date (t/minus now (t/days 10))
          recent-date (t/minus now (t/days 2))]
      (mt/with-temp [:model/Database db {:name "Test DB"}
                     :model/Database db2 {:name "Test DB 2"}
                     :model/Database db3 {:name "Test DB 3"}
                     :model/TaskRun _ {:run_type    :sync
                                       :entity_type :database
                                       :entity_id   (:id db3)
                                       :status      :success
                                       :started_at  old-date
                                       :ended_at    old-date}
                     :model/TaskRun _ {:run_type    :sync
                                       :entity_type :database
                                       :entity_id   (:id db2)
                                       :status      :success
                                       :started_at  recent-date
                                       :ended_at    recent-date}
                     :model/TaskRun _ {:run_type    :sync
                                       :entity_type :database
                                       :entity_id   (:id db)
                                       :status      :success
                                       :started_at  now
                                       :ended_at    now}]
        (testing "past7days returns only recent runs"
          (let [response (mt/user-http-request :crowberto :get 200 "task/runs" :started-at "past7days~")]
            (is (= 2 (:total response)))))
        (testing "past30days returns all runs"
          (let [response (mt/user-http-request :crowberto :get 200 "task/runs" :started-at "past30days~")]
            (is (= 3 (:total response)))))
        (testing "absolute date range filtering"
          (let [start-date (u.date/format (t/local-date (t/minus now (t/days 3))))
                end-date (u.date/format (t/local-date now))
                response (mt/user-http-request :crowberto :get 200 "task/runs"
                                               :started-at (str start-date "~" end-date))]
            (is (= 2 (:total response)))))))))

(deftest ^:synchronized runs-started-at-combined-filters-test
  (t2/delete! :model/TaskRun)
  (testing "combining started-at with other filters"
    (let [now (t/zoned-date-time)
          old-date (t/minus now (t/days 10))
          recent-date (t/minus now (t/days 2))]
      (mt/with-temp [:model/Database db {:name "Test DB"}
                     :model/TaskRun _ {:run_type    :sync
                                       :entity_type :database
                                       :entity_id   (:id db)
                                       :status      :success
                                       :started_at  old-date
                                       :ended_at    old-date}
                     :model/TaskRun _ {:run_type    :sync
                                       :entity_type :database
                                       :entity_id   (:id db)
                                       :status      :failed
                                       :started_at  recent-date
                                       :ended_at    recent-date}
                     :model/TaskRun _ {:run_type    :fingerprint
                                       :entity_type :database
                                       :entity_id   (:id db)
                                       :status      :success
                                       :started_at  recent-date
                                       :ended_at    recent-date}]
        (testing "started-at combined with run-type"
          (let [response (mt/user-http-request :crowberto :get 200 "task/runs"
                                               :started-at "past7days"
                                               :run-type "sync")]
            (is (= 1 (:total response)))))
        (testing "started-at combined with status"
          (let [response (mt/user-http-request :crowberto :get 200 "task/runs"
                                               :started-at "past7days"
                                               :status "success")]
            (is (= 1 (:total response)))))
        (testing "started-at combined with multiple filters"
          (let [response (mt/user-http-request :crowberto :get 200 "task/runs"
                                               :started-at "past7days"
                                               :run-type "sync"
                                               :status "failed")]
            (is (= 1 (:total response)))))))))

(deftest runs-started-at-invalid-date-test
  (testing "invalid date string returns 400 error"
    (is (re-matches #"Failed to parse datetime value.*"
                    (mt/user-http-request :crowberto :get 400 "task/runs" :started-at "invalid-date")))))

(deftest ^:synchronized runs-entities-started-at-filter-test
  (t2/delete! :model/TaskRun)
  (testing "/runs/entities with started-at filter"
    (let [now (t/zoned-date-time)
          old-date (t/minus now (t/days 10))
          recent-date (t/minus now (t/days 2))]
      (mt/with-temp [:model/Database db1 {:name "DB1"}
                     :model/Database db2 {:name "DB2"}
                     ;; Old run for db1
                     :model/TaskRun _ {:run_type    :sync
                                       :entity_type :database
                                       :entity_id   (:id db1)
                                       :status      :success
                                       :started_at  old-date
                                       :ended_at    old-date}
                     ;; Recent run for db2
                     :model/TaskRun _ {:run_type    :sync
                                       :entity_type :database
                                       :entity_id   (:id db2)
                                       :status      :success
                                       :started_at  recent-date
                                       :ended_at    recent-date}]
        (testing "started-at is required"
          (is (=? {:errors {:started-at some?}}
                  (mt/user-http-request :crowberto :get 400 "task/runs/entities" :run-type "sync"))))
        (testing "with past30days filter returns all entities"
          (let [response (mt/user-http-request :crowberto :get 200 "task/runs/entities"
                                               :run-type "sync"
                                               :started-at "past30days")]
            (is (= 2 (count response)))))
        (testing "with past7days filter returns only recent entities"
          (let [response (mt/user-http-request :crowberto :get 200 "task/runs/entities"
                                               :run-type "sync"
                                               :started-at "past7days")]
            (is (= 1 (count response)))
            (is (= "DB2" (-> response first :entity_name)))))))))
