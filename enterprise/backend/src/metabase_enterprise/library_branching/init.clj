(ns metabase-enterprise.library-branching.init
  (:require
   [metabase-enterprise.library-branching.operations :as operations]
   [metabase-enterprise.library-branching.settings]
   [metabase-enterprise.library-branching.task-cleanup]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase.startup.core :as startup]))

(set! *warn-on-reflection* true)

(defmethod startup/def-startup-logic! ::supersede-stale-tasks
  [_]
  ;; Only stale tasks: an open task with a fresh heartbeat can belong to a worker of another JVM on this app DB.
  (tasks/supersede-stale!))

(defmethod startup/def-startup-logic! ::first-deploy
  [_]
  ;; A consumption instance with no base takes its branch at boot; later commits come by a deploy.
  (operations/start-initial-deploy!))

(defmethod startup/def-shutdown-logic! ::interrupt-running-tasks
  [_]
  (tasks/interrupt-running-tasks!))
