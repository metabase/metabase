(ns metabase-enterprise.library-branching.task-cleanup-test
  "The daily cleanup of old task rows. It deletes task rows, so these tests are not parallel."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.library-branching.task-cleanup :as task-cleanup]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase-enterprise.library-branching.tasks-test-util :as tu]
   [metabase.app-db.core :as mdb]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- started-days-ago!
  "Makes task `id` start `days` days ago."
  [id days]
  (t2/query {:update :library_branching_task
             :set    {:started_at (t/minus (t/offset-date-time) (t/days days))}
             :where  [:= :id id]}))

(defn- ids [] (set (map :id (t2/query {:select [:id] :from [:library_branching_task]}))))

(deftest cleanup-deletes-old-ended-tasks-test
  (testing (str "the cleanup deletes each ended task that started more than 30 days ago; app DB " (mdb/db-type))
    (tu/with-no-tasks
      (let [ended (fn [days status]
                    (let [{:keys [id]} (tasks/start! "pull" nil)]
                      (case status
                        "successful" (tasks/succeed! id {:kind "pulled"})
                        "failed"     (tasks/fail! id "no")
                        "cancelled"  (tasks/cancel! id))
                      (started-days-ago! id days)
                      id))
            old-1  (ended 31 "successful")
            old-2  (ended 90 "failed")
            old-3  (ended 40 "cancelled")
            young  (ended 29 "successful")
            open   (let [{:keys [id]} (tasks/start! "push" nil)]
                     (started-days-ago! id 45)
                     id)]
        (is (= 3 (task-cleanup/delete-old-tasks!)))
        (is (= #{young open} (ids)) "an ended task of 29 days and an open task stay")
        (is (zero? (task-cleanup/delete-old-tasks!)) "a second run deletes nothing")
        (is (not-any? #{old-1 old-2 old-3} (ids)))
        (tasks/cancel! open)))))
