(ns metabase-enterprise.data-testing.models.test-suite-run
  "`:model/TestSuiteRun`, a run of a test suite."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models.data-test-run :as data-testing.models.data-test-run]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.util :as data-testing.util]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TestSuiteRun [_model] :test_suite_run)

(derive :model/TestSuiteRun :metabase/model)

(t2/deftransforms :model/TestSuiteRun
  {:status  mi/transform-keyword
   :members (data-testing.util/json-column ::data-testing.schema/test-suite-run.stored-members)})

(methodical/defmethod t2/batched-hydrate [:model/TestSuiteRun :initiated_by_user]
  "Add the user who started each run, or nil."
  [_model _k runs]
  (data-testing.models.data-test-run/with-initiated-by-users runs))

;;; ---------------------------------------------------- Writes ----------------------------------------------------

(mu/defn start-test-suite-run! :- ::data-testing.schema/test-suite-run
  "Insert a started TestSuiteRun of the suite `suite-id`, started by the user `initiated-by`, and return it."
  [suite-id     :- ms/PositiveInt
   initiated-by :- [:maybe ::lib.schema.id/user]]
  (data-testing.db/insert-suite-run! suite-id initiated-by))

(mu/defn finish-test-suite-run! :- :int
  "Set `status`, the end time, and `members` of the TestSuiteRun `run-id` if it is still started, returning the number
  of rows updated."
  [run-id  :- ms/PositiveInt
   status  :- ::data-testing.schema/run-status
   members :- [:maybe ::data-testing.schema/test-suite-run.stored-members]]
  (data-testing.db/finish-started-suite-run! run-id status members))

(mu/defn add-members-to-ended-test-suite-run! :- :int
  "Set the `members` of the TestSuiteRun `run-id` if the run has ended, returning the number of rows updated. The
  cluster reaper ends a run without its members; this sets them afterward."
  [run-id  :- ms/PositiveInt
   members :- ::data-testing.schema/test-suite-run.stored-members]
  (data-testing.db/add-members-to-ended-suite-run! run-id members))

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defmethod app-db-copy/spec :model/TestSuiteRun [_model]
  {:skip? false})
