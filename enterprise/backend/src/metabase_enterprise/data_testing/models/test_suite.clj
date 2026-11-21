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
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TestSuite [_model] :test_suite)

(methodical/defmethod t2/table-name :model/TestSuiteMember [_model] :test_suite_member)

(doto :model/TestSuite
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(doto :model/TestSuiteMember
  (derive :metabase/model))

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

(defn- replace-suite-members*
  "Replace the members of the TestSuite `suite-id` with `members`, positioned in their order, returning the events of the
  write, which the caller publishes."
  [suite-id members]
  (let [previous (data-testing.db/suite-members [suite-id])
        removal  (events/deleted :event/test-suite-member-delete :model/TestSuiteMember previous)]
    (data-testing.db/delete-members-of-suite! suite-id)
    (let [inserted (when (seq members)
                     (data-testing.db/insert-suite-members!
                      (into [] (map-indexed (fn [i member] (assoc member :suite_id suite-id :position i))) members)))]
      [removal (events/created :event/test-suite-member-create (vec inserted))])))

(mu/defn create-test-suites! :- [:sequential ::data-testing.schema/test-suite]
  "Insert the TestSuite `rows`, without members, in one transaction, publishing their create event, and return the
  inserted suites."
  [rows :- [:sequential :map]]
  (if (seq rows)
    (t2/with-transaction [_conn]
      (let [suites (data-testing.db/insert-test-suites! rows)]
        (events/publish-lifecycle! [(events/created :event/test-suite-create suites)])
        suites))
    []))

(mu/defn create-test-suite! :- ms/PositiveInt
  "Insert the TestSuite `suite` with its members, positioned in their order, and return its id. The audit log records
  the write as one create of the suite."
  [suite :- ::data-testing.schema/test-suite.create]
  (t2/with-transaction [_conn]
    (let [created (first (data-testing.db/insert-test-suites! [(dissoc suite :members)]))
          members (replace-suite-members* (:id created) (:members suite))]
      (events/publish-lifecycle! (into [(events/created :event/test-suite-create [created])] members))
      (:id created))))

(mu/defn update-test-suite!
  "Apply `changes` to the TestSuite with `id`, replacing its members when `changes` has `:members`. A change of members
  alone also sets the suite's update time. The audit log records the write as one update of the suite."
  [id      :- ms/PositiveInt
   changes :- ::data-testing.schema/test-suite.update]
  (t2/with-transaction [_conn]
    ;; The suite row is updated first: its row lock makes a concurrent update of the same suite wait until this one
    ;; commits, so the second replaces the members the first wrote instead of merging with them.
    (let [previous (data-testing.db/test-suite-for-update id)
          members? (contains? changes :members)
          updates  (cond-> (dissoc changes :members)
                     members? (assoc :updated_at :%now))]
      (when (seq updates)
        (data-testing.db/update-test-suites! [id] updates))
      (let [member-events (when members?
                            (replace-suite-members* id (:members changes)))
            suite-event   (when (and previous (seq updates))
                            (let [object (if members?
                                           (data-testing.db/test-suite id)
                                           (events/updated-row previous updates))]
                              (events/updated :event/test-suite-update [previous] [object])))]
        (events/publish-lifecycle! (into (if suite-event [suite-event] []) member-events))))))

(mu/defn update-test-suites!
  "Apply the changes in `changes-by-id`, a map from the id of a TestSuite to its changes, without members, with one
  statement per distinct change set, publishing their update event."
  [changes-by-id :- [:map-of ms/PositiveInt :map]]
  (when (seq changes-by-id)
    (t2/with-transaction [_conn]
      (let [stored (u/index-by :id (data-testing.db/test-suites-by-ids (vec (keys changes-by-id))))]
        (doseq [[changes pairs] (group-by val changes-by-id)
                :when           (seq changes)]
          (data-testing.db/update-test-suites! (mapv key pairs) changes))
        (let [pairs (into []
                          (keep (fn [[id changes]]
                                  (when-let [previous (stored id)]
                                    (let [object (events/updated-row previous changes)]
                                      (when (not= (into {} previous) (into {} object))
                                        [previous object])))))
                          changes-by-id)]
          (events/publish-lifecycle! [(events/updated :event/test-suite-update
                                                      (mapv first pairs)
                                                      (mapv second pairs))])))))
  nil)

(mu/defn delete-test-suites!
  "Delete the TestSuites with `ids`, and their members, publishing their delete event."
  [ids :- [:sequential ms/PositiveInt]]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (let [event (events/deleted :event/test-suite-delete
                                  :model/TestSuite
                                  (data-testing.db/test-suites-by-ids (vec ids)))]
        (data-testing.db/delete-test-suites! (vec ids))
        (events/publish-lifecycle! [event]))))
  nil)

(mu/defn delete-test-suite!
  "Delete the TestSuite with `id`, and its members."
  [id :- ms/PositiveInt]
  (delete-test-suites! [id]))

(mu/defn create-test-suite-members! :- [:sequential ::data-testing.schema/test-suite.member]
  "Insert the TestSuiteMember `rows`, publishing their create event, and return the inserted members."
  [rows :- [:sequential :map]]
  (if (seq rows)
    (t2/with-transaction [_conn]
      (let [members (data-testing.db/insert-suite-members! rows)]
        (events/publish-lifecycle! [(events/created :event/test-suite-member-create members)])
        members))
    []))

(mu/defn update-test-suite-members!
  "Apply the changes in `changes-by-id`, a map from the id of a TestSuiteMember to its changes, with one statement per
  distinct change set, publishing their update event."
  [changes-by-id :- [:map-of ms/PositiveInt :map]]
  (when (seq changes-by-id)
    (t2/with-transaction [_conn]
      (let [stored (u/index-by :id (data-testing.db/suite-members-by-ids (vec (keys changes-by-id))))]
        (doseq [[changes pairs] (group-by val changes-by-id)
                :when           (seq changes)]
          (data-testing.db/update-suite-members! (mapv key pairs) changes))
        (let [pairs (into []
                          (keep (fn [[id changes]]
                                  (when-let [previous (stored id)]
                                    (let [object (events/updated-row previous changes)]
                                      (when (not= (into {} previous) (into {} object))
                                        [previous object])))))
                          changes-by-id)]
          (events/publish-lifecycle! [(events/updated :event/test-suite-member-update
                                                      (mapv first pairs)
                                                      (mapv second pairs))])))))
  nil)

(mu/defn delete-test-suite-members!
  "Delete the TestSuiteMembers with `ids`, publishing their delete event."
  [ids :- [:sequential ms/PositiveInt]]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (let [event (events/deleted :event/test-suite-member-delete
                                  :model/TestSuiteMember
                                  (data-testing.db/suite-members-by-ids (vec ids)))]
        (data-testing.db/delete-suite-members! (vec ids))
        (events/publish-lifecycle! [event]))))
  nil)

(mu/defn delete-members-of-tests* :- [:sequential :any]
  "Delete the members of every TestSuite that name the `test-type` tests with `entity-ids`, returning the events of the
  delete, which the caller publishes."
  [test-type  :- ::data-testing.schema/test-type
   entity-ids :- [:sequential :string]]
  (let [members (data-testing.db/suite-members-of-tests test-type entity-ids)
        event   (events/deleted :event/test-suite-member-delete :model/TestSuiteMember members)]
    (when (seq members)
      (data-testing.db/delete-suite-members-of-tests! test-type entity-ids))
    [event]))

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defn- update-imported-test-suites!
  "Update the TestSuites of an import with `rows`, each its id and changed columns, returning `rows`."
  [rows]
  (update-test-suites! (into {} (map (fn [{:keys [id] :as row}] [id (dissoc row :id)])) rows))
  rows)

(defn- update-imported-test-suite-members!
  "Update the TestSuiteMembers of an import with `rows`, each its id and changed columns, returning `rows`."
  [rows]
  (update-test-suite-members! (into {} (map (fn [{:keys [id] :as row}] [id (dissoc row :id)])) rows))
  rows)

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
   :insert!       create-test-suites!
   :update!       update-imported-test-suites!
   :delete!       delete-test-suites!
   :storage-paths data-testing.serialization/test-suite-storage-paths})

(defmethod serialization/spec :model/TestSuiteMember [_]
  ;; A member is found by its test, not its position, so that an import that reorders members never puts two rows of
  ;; one suite on the same test, which the unique constraint refuses.
  {:schema    ::data-testing.schema/external-test-suite-member
   :identity  [:suite_id :test_type :test_entity_id]
   :copy      [:test_entity_id :position]
   :parent    {:model :model/TestSuite :key :suite_id :order :position}
   :insert!   create-test-suite-members!
   :update!   update-imported-test-suite-members!
   :delete!   delete-test-suite-members!
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
