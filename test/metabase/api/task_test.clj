(ns metabase.api.task-test
  (:require [expectations :refer :all]
            [java-time :as t]
            [metabase.models.task-history :refer [TaskHistory]]
            [metabase.test.data.users :as users]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(def ^:private default-task-history
  {:id true, :db_id true, :started_at true, :ended_at true, :duration 10, :task_details nil})

(defn- generate-tasks
  "Creates `n` task history maps with guaranteed increasing `:ended_at` times. This means that when stored and queried
  via the GET `/` endpoint, will return in reverse order from how this function returns the task history maps."
  [n]
  (let [now        (t/zoned-date-time)
        task-names (repeatedly n tu/random-name)]
    (map-indexed (fn [idx task-name]
                   {:task       task-name
                    :started_at now
                    :ended_at   (t/plus now (t/seconds idx))})
                 task-names)))

;; Only superusers can query for TaskHistory
(expect
  "You don't have permissions to do that."
  ((users/user->client :rasta) :get 403 "task/"))

;; Superusers can query TaskHistory, should return DB results
(let [[task-hist-1 task-hist-2] (generate-tasks 2)
      task-hist-1 (assoc task-hist-1 :duration 100)
      task-hist-2 (assoc task-hist-1 :duration 200 :task_details {:some "complex", :data "here"})
      task-names (set (map :task [task-hist-1 task-hist-2]))]
  (expect
    (set (map (fn [task-hist]
                (merge default-task-history (select-keys task-hist [:task :duration :task_details])))
              [task-hist-2 task-hist-1]))
    (tt/with-temp* [TaskHistory [task-1 task-hist-1]
                    TaskHistory [task-2 task-hist-2]]
      (set (for [result (:data ((users/user->client :crowberto) :get 200 "task/"))
                 :when  (contains? task-names (:task result))]
             (tu/boolean-ids-and-timestamps result))))))

;; Multiple results should be sorted via `:ended_at`. Below creates two tasks, the second one has a later `:ended_at`
;; date and should be returned first
(let [[task-hist-1 task-hist-2 :as task-histories] (generate-tasks 2)
      task-names (set (map :task task-histories))]
  (expect
    (map (fn [{:keys [task]}]
           (assoc default-task-history :task task))
         [task-hist-2 task-hist-1])
    (tt/with-temp* [TaskHistory [task-1 task-hist-1]
                    TaskHistory [task-2 task-hist-2]]
      (for [result (:data ((users/user->client :crowberto) :get 200 "task/"))
            :when  (contains? task-names (:task result))]
        (tu/boolean-ids-and-timestamps result)))))

;; Should fail when only including a limit
(expect
  "When including a limit, an offset must also be included."
  ((users/user->client :crowberto) :get 400 "task/" :limit 100))

;; Should fail when only including an offset
(expect
  "When including an offset, a limit must also be included."
  ((users/user->client :crowberto) :get 400 "task/" :offset 100))

;; Check that we don't support a 0 limit, which wouldn't make sense
(expect
  {:errors {:limit "value may be nil, or if non-nil, value must be a valid integer greater than zero."}}
  ((users/user->client :crowberto) :get 400 "task/" :limit 0 :offset 100))

;; Check that paging information is applied when provided and included in the response
(let [[task-hist-1 task-hist-2 task-hist-3 task-hist-4] (generate-tasks 4)]
  (expect
    [{:total 4, :limit 2, :offset 0
      :data     (map (fn [{:keys [task]}]
                       (assoc default-task-history :task task))
                     [task-hist-4 task-hist-3])}
     {:total 4, :limit 2, :offset 2
      :data (map (fn [{:keys [task]}]
                       (assoc default-task-history :task task))
                     [task-hist-2 task-hist-1])}]
    (do
      (db/delete! TaskHistory)
      (tt/with-temp* [TaskHistory [task-1 task-hist-1]
                      TaskHistory [task-2 task-hist-2]
                      TaskHistory [task-3 task-hist-3]
                      TaskHistory [task-4 task-hist-4]]
        (map tu/boolean-ids-and-timestamps
             [((users/user->client :crowberto) :get 200 "task/" :limit 2 :offset 0)
              ((users/user->client :crowberto) :get 200 "task/" :limit 2 :offset 2)])))))

;; Only superusers can query for TaskHistory
(expect
  "You don't have permissions to do that."
  ((users/user->client :rasta) :get 403 "task/"))

;; Regular users can't query for a specific TaskHistory
(expect
  "You don't have permissions to do that."
  (tt/with-temp TaskHistory [task]
    ((users/user->client :rasta) :get 403 (format "task/%s" (u/get-id task)))))

;; Superusers querying for a TaskHistory that doesn't exist will get a 404
(expect
  "Not found."
  ((users/user->client :crowberto) :get 404 (format "task/%s" Integer/MAX_VALUE)))

;; Superusers querying for specific TaskHistory will get that task info
(expect
  (merge default-task-history {:task "Test Task", :duration 100})
  (tt/with-temp TaskHistory [task {:task "Test Task"
                                   :duration 100}]
    (tu/boolean-ids-and-timestamps
     ((users/user->client :crowberto) :get 200 (format "task/%s" (u/get-id task))))))
