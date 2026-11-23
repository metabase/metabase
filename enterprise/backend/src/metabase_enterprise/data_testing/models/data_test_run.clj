(ns metabase-enterprise.data-testing.models.data-test-run
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DataTestRun [_model] :data_test_run)

(derive :model/DataTestRun :metabase/model)

(t2/deftransforms :model/DataTestRun
  {:status    mi/transform-keyword
   :test_type mi/transform-keyword})

(defn with-initiated-by-users
  "`runs`, each with the user whose id is its `:initiated_by`, or nil, under `:initiated_by_user`."
  [runs]
  (let [user-ids (into #{} (keep :initiated_by) runs)
        id->user (when (seq user-ids) (data-testing.db/users-by-id user-ids))]
    (for [run runs]
      (assoc run :initiated_by_user (get id->user (:initiated_by run))))))

(methodical/defmethod t2/batched-hydrate [:model/DataTestRun :initiated_by_user]
  "Add the user who started each run, or nil."
  [_model _k runs]
  (with-initiated-by-users runs))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn start-data-test-run! :- ::data-testing.schema/data-test-run
  "Insert a started DataTestRun of the `test-type` test `test-id`, started by the user `initiated-by`, and return it."
  [test-type    :- ::data-testing.schema/test-type
   test-id      :- ms/PositiveInt
   initiated-by :- [:maybe ::lib.schema.id/user]]
  (data-testing.db/insert-test-run! test-type test-id initiated-by))

(mu/defn finish-data-test-run! :- :int
  "Set `status` and the end time of the DataTestRun `run-id` if it is still started, returning the number of rows
  updated."
  [run-id :- ms/PositiveInt
   status :- ::data-testing.schema/run-status]
  (data-testing.db/finish-started-test-run! run-id status))

(mu/defn clear-test-ids-of-runs!
  "Set the test id of the runs of the `test-type` tests with `test-ids` to nil, so that no run names a test after it is
  deleted."
  [test-type :- ::data-testing.schema/test-type
   test-ids  :- [:sequential ms/PositiveInt]]
  (when (seq test-ids)
    (data-testing.db/clear-test-ids-of-runs! test-type (vec test-ids)))
  nil)

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/DataTestRun [_model]
  {:skip? false})
