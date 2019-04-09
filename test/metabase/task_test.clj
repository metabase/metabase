(ns metabase.task-test
  (:require [expectations :refer [expect]]
            [metabase.task :as task]))

(expect
  "metabase.task.upgrade-checks"
  (#'task/task-class-name->namespace-str "metabase.task.upgrade_checks.CheckForNewVersions"))
