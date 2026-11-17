(ns metabase-enterprise.data-testing.models.test-suite
  "`:model/TestSuite`, a named list of saved data tests, and `:model/TestSuiteMember`, one test in a suite. A member
  names its test by test type and entity id, with no foreign key: a suite can name a test this instance lacks."
  (:require
   [metabase.audit-app.core :as audit-app]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TestSuite [_model] :test_suite)

(methodical/defmethod t2/table-name :model/TestSuiteMember [_model] :test_suite_member)

(doto :model/TestSuite
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(derive :model/TestSuiteMember :metabase/model)

(t2/deftransforms :model/TestSuiteMember
  {:test_type mi/transform-keyword})

(defmethod audit-app/model-details :model/TestSuite
  [suite _event-type]
  (select-keys suite [:name :description]))

(t2/define-after-insert :model/TestSuite [suite]
  (when-not mi/*deserializing?*
    (events/publish-event! :event/test-suite-create
                           {:object  (t2/instance :model/TestSuite suite)
                            :user-id (:creator_id suite)}))
  suite)

(t2/define-after-update :model/TestSuite [suite]
  (when-not mi/*deserializing?*
    (events/publish-event! :event/test-suite-update {:object (t2/instance :model/TestSuite suite)}))
  suite)

(t2/define-before-delete :model/TestSuite [suite]
  (when-not mi/*deserializing?*
    (events/publish-event! :event/test-suite-delete {:object suite}))
  suite)
