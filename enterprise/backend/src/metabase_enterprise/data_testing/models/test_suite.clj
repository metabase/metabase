(ns metabase-enterprise.data-testing.models.test-suite
  "`:model/TestSuite`, a named list of saved data tests; `:model/TestSuiteMember`, one test in a suite; and
  `:model/TestSuiteRun`, a run of a suite. A member names its test by test type and entity id, with no foreign key: a
  suite can name a test this instance lacks."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.models.data-test-run :as data-testing.models.data-test-run]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.api.common :as api]
   [metabase.audit-app.core :as audit-app]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TestSuite [_model] :test_suite)

(methodical/defmethod t2/table-name :model/TestSuiteMember [_model] :test_suite_member)

(doto :model/TestSuite
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?)
  (derive :hook/events))

(defmethod events/spec :model/TestSuite
  [_model]
  {:create :event/test-suite-create
   :update :event/test-suite-update
   :delete :event/test-suite-delete})

(methodical/defmethod t2/table-name :model/TestSuiteRun [_model] :test_suite_run)

(derive :model/TestSuiteMember :metabase/model)

(derive :model/TestSuiteRun :metabase/model)

(t2/deftransforms :model/TestSuiteMember
  {:test_type mi/transform-keyword})

(t2/deftransforms :model/TestSuiteRun
  {:status  mi/transform-keyword
   :members (data-testing.models/json-column ::data-testing.schema/test-suite-run.stored-members)})

(defmethod audit-app/model-details :model/TestSuiteRun
  [run _event-type]
  (select-keys run [:suite_id :status]))

(methodical/defmethod t2/batched-hydrate [:model/TestSuiteRun :initiated_by_user]
  "Add the user who started each run, or nil."
  [_model _k runs]
  (data-testing.models.data-test-run/with-initiated-by-users runs))

(defmethod audit-app/model-details :model/TestSuite
  [suite _event-type]
  (select-keys suite [:name :description]))

;;; ------------------------------------------------- Permissions --------------------------------------------------

(defn- may-change-suites?
  "Whether the current user may create, change, or delete test suites: they may enter Data Studio, and remote sync,
  which syncs every suite, does not keep synced content read-only."
  []
  (and (api/entitled-data-analyst?)
       (not (remote-sync/read-only?))))

(defmethod mi/can-create? :model/TestSuite
  [_model _suite]
  (may-change-suites?))

(defmethod mi/can-update? :model/TestSuite
  [suite _changes]
  (mi/can-write? suite))

;;; -------------------------------------------------- Hydration ---------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/TestSuite :can_read]
  "Whether the current user may read each suite: any suite, when they may enter Data Studio."
  [_model k suites]
  (let [answer (boolean (api/entitled-data-analyst?))]
    (mapv #(vary-meta % assoc k answer) suites)))

(methodical/defmethod t2/batched-hydrate [:model/TestSuite :can_write]
  "Whether the current user may change or delete each suite."
  [_model k suites]
  (let [answer (may-change-suites?)]
    (mapv #(assoc % k answer) suites)))

;;; ------------------------------------------------- Serialization ------------------------------------------------

(defmethod serialization/spec :model/TestSuite [_]
  {:schema    ::data-testing.schema/external-test-suite
   :copy      [:entity_id :name :description]
   :transform {:creator_id serialization/user-transform}
   :children  {:members :model/TestSuiteMember}})

(defmethod serialization/spec :model/TestSuiteMember [_]
  ;; A member is found by its test, not its position, so that an import that reorders members never puts two rows of
  ;; one suite on the same test, which the unique constraint refuses.
  {:schema    ::data-testing.schema/external-test-suite-member
   :identity  [:suite_id :test_type :test_entity_id]
   :copy      [:test_entity_id :position]
   :parent    {:model :model/TestSuite :key :suite_id :order :position}
   ;; The model reads `test_type` as a keyword, so the import makes it one too: an imported member then matches its row
   ;; on the identity.
   :transform {:suite_id  serialization/import-only-transform
               :test_type {:export (fn [_store _rows values _opts] (mapv name values))
                           :import (fn [_store _entities values _opts] (mapv keyword values))}}})

(defmethod serialization/storage-paths :model/TestSuite [_ entities _ctx]
  (mapv (fn [suite]
          [{:label "test_suites"} {:label (:name suite) :key (:entity_id suite)}])
        entities))

;;; -------------------------------------------------- Remote sync -------------------------------------------------

(defmethod remote-sync/spec :model/TestSuite
  [_model]
  ;; No filter clause: every suite syncs, whatever its members, and a run reports a member the instance lacks as
  ;; missing.
  {:synced-items data-testing.db/synced-test-suite-items})
