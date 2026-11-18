(ns metabase-enterprise.data-testing.models.test-suite
  "`:model/TestSuite`, a named list of saved data tests; `:model/TestSuiteMember`, one test in a suite; and
  `:model/TestSuiteRun`, a run of a suite. A member names its test by test type and entity id, with no foreign key: a
  suite can name a test this instance lacks."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.models.data-test-run :as data-testing.models.data-test-run]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.suite :as data-testing.suite]
   [metabase.audit-app.core :as audit-app]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TestSuite [_model] :test_suite)

(methodical/defmethod t2/table-name :model/TestSuiteMember [_model] :test_suite_member)

(doto :model/TestSuite
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

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
   ;; Rows of the app DB hold the test type as a keyword, so an imported one must be too, to match on the identity.
   :transform {:suite_id  serialization/import-only-transform
               :test_type {:export (fn [_store _rows values _opts] (mapv name values))
                           :import (fn [_store _entities values _opts] (mapv keyword values))}}})

(defmethod serialization/before-load :model/TestSuite [_ items]
  ;; A hand-edited file can name a test twice, or have a member with no test_type or test_entity_id; refuse the file with
  ;; a message that names the suite, rather than fail on a database constraint.
  (doseq [{{suite-name :name :keys [members]} :entity} items]
    (when (some #(or (nil? (:test_type %)) (nil? (:test_entity_id %))) members)
      (throw (ex-info (tru "Test suite {0} has a member without a test_type or test_entity_id." (pr-str suite-name))
                      {:status-code 400
                       :suite       suite-name})))
    (when-let [repeated (not-empty (data-testing.suite/repeated-tests members))]
      (throw (ex-info (tru "Test suite {0} names the same test more than once: {1}"
                           (pr-str suite-name)
                           (str/join ", " repeated))
                      {:status-code 400
                       :suite       suite-name}))))
  items)

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
