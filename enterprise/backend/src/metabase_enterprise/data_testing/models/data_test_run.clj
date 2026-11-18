(ns metabase-enterprise.data-testing.models.data-test-run
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DataTestRun [_model] :data_test_run)

(derive :model/DataTestRun :metabase/model)

(defmethod app-db-copy/spec :model/DataTestRun [_model]
  {:skip? false})

(t2/deftransforms :model/DataTestRun
  {:status    mi/transform-keyword
   :test_type mi/transform-keyword})

(methodical/defmethod t2/batched-hydrate [:model/DataTestRun :initiated_by_user]
  "Add the user who started each run, or nil."
  [_model _k runs]
  (let [user-ids (into #{} (keep :initiated_by) runs)
        id->user (when (seq user-ids) (data-testing.db/users-by-id user-ids))]
    (for [run runs]
      (assoc run :initiated_by_user (get id->user (:initiated_by run))))))
