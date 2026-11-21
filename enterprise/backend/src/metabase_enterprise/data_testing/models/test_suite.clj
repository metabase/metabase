(ns metabase-enterprise.data-testing.models.test-suite
  "`:model/TestSuite`, a named list of saved data tests, and `:model/TestSuiteMember`, one test in a suite. A member
  names its test by test type and entity id, with no foreign key: a suite can name a test this instance lacks."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.serialization :as data-testing.serialization]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TestSuite [_model] :test_suite)

(methodical/defmethod t2/table-name :model/TestSuiteMember [_model] :test_suite_member)

(doto :model/TestSuite
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?)
  (derive :hook/events))

(doto :model/TestSuiteMember
  (derive :metabase/model)
  (derive :hook/events))

(t2/deftransforms :model/TestSuiteMember
  {:test_type mi/transform-keyword})

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

;;; ---------------------------------------------------- Writes ----------------------------------------------------

(defn- replace-suite-members!
  "Replace the members of the TestSuite `suite-id` with `members`, positioned in their order."
  [suite-id members]
  (data-testing.db/delete-members-of-suite! suite-id)
  (when (seq members)
    (data-testing.db/insert-suite-members!
     (into [] (map-indexed (fn [i member] (assoc member :suite_id suite-id :position i))) members))))

(mu/defn create-test-suite! :- ms/PositiveInt
  "Insert the TestSuite `suite` with its members, positioned in their order, and return its id. The audit log records
  the write as one create of the suite."
  [suite :- ::data-testing.schema/test-suite.create]
  (events/with-batched-events
    (t2/with-transaction [_conn]
      (let [id (data-testing.db/insert-test-suite! (dissoc suite :members))]
        (replace-suite-members! id (:members suite))
        id))))

(mu/defn update-test-suite!
  "Apply `changes` to the TestSuite with `id`, replacing its members when `changes` has `:members`. A change of members
  alone also sets the suite's update time. The audit log records the write as one update of the suite."
  [id      :- ms/PositiveInt
   changes :- ::data-testing.schema/test-suite.update]
  (events/with-batched-events
    (t2/with-transaction [_conn]
      ;; The suite row is updated first: its row lock makes a concurrent update of the same suite wait until this one
      ;; commits, so the second replaces the members the first wrote instead of merging with them.
      (let [members? (contains? changes :members)
            updates  (cond-> (dissoc changes :members)
                       members? (assoc :updated_at :%now))]
        (when (seq updates)
          (data-testing.db/update-test-suite! id updates))
        (when members?
          (replace-suite-members! id (:members changes)))))))

(mu/defn delete-test-suite!
  "Delete the TestSuite with `id`, and its members."
  [id :- ms/PositiveInt]
  (data-testing.db/delete-test-suite! id))

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defmethod events/spec :model/TestSuite
  [_model]
  {:create :event/test-suite-create
   :update :event/test-suite-update
   :delete :event/test-suite-delete})

(defmethod events/spec :model/TestSuiteMember
  [_model]
  {:create :event/test-suite-member-create
   :update :event/test-suite-member-update
   :delete :event/test-suite-member-delete})

(defmethod app-db-copy/spec :model/TestSuite [_model]
  {:skip? false})

(defmethod app-db-copy/spec :model/TestSuiteMember [_model]
  {:skip? false})

(defmethod audit/spec :model/TestSuite [_model]
  {:track          [:name :description]
   :track-redacted [:creator_id]
   :skip           [:entity_id]})

(defmethod audit/spec :model/TestSuiteMember [_model]
  ;; A change of the members is an update of their suite.
  {:track          []
   :track-redacted [:position :suite_id :test_entity_id :test_type]
   :skip           []
   :parent         {:model :model/TestSuite :key :suite_id}})

(defmethod serialization/spec :model/TestSuite [_]
  {:schema        ::data-testing.schema/external-test-suite
   :copy          [:entity_id :name :description]
   :transform     {:creator_id serialization/user-transform}
   :children      {:members :model/TestSuiteMember}
   :storage-paths data-testing.serialization/test-suite-storage-paths})

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

(defmethod remote-sync/spec :model/TestSuite
  [_model]
  ;; No filter clause: every suite syncs, whatever its members, and a run reports a member the instance lacks as
  ;; missing.
  {:synced-items data-testing.db/synced-test-suite-items})
