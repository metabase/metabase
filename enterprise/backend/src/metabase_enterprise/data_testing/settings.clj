(ns metabase-enterprise.data-testing.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting data-test-run-result-retention-days
  "How many days a test run keeps its stored result. Once a day the results of older runs are cleared; the runs
  themselves stay in the run history. Set to 0 to keep every result."
  :encryption :no
  :type       :integer
  :default    30
  :visibility :internal
  :export?    false
  :audit      :never)

(defsetting data-test-run-retention-days
  "How many days a test run stays in the run history. Once a day older runs are deleted, except the newest run of
  each test. Set to 0 to keep every run."
  :encryption :no
  :type       :integer
  :default    180
  :visibility :internal
  :export?    false
  :audit      :never)
