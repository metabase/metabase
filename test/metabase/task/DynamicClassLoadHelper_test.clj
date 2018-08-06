(ns metabase.task.DynamicClassLoadHelper-test
  (:require [expectations :refer :all]
            [metabase.task.DynamicClassLoadHelper :as DynamicClassLoadHelper]))

(expect
  "metabase.task.upgrade-checks"
  (#'DynamicClassLoadHelper/task-class-name->namespace-str "metabase.task.upgrade_checks.CheckForNewVersions"))
