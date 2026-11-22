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

(defn- member-rows
  "The rows of the members of the suites `rows`, each with its suite and its position in the order of the members."
  [suite-ids-and-members]
  (into []
        (mapcat (fn [[suite-id members]]
                  (map-indexed (fn [i member] (assoc member :suite_id suite-id :position i)) members)))
        suite-ids-and-members))

(defn- replace-suite-members!
  "Replace the members of the suites of `rows`, each a suite `:id` and its `:members`, with the new ones, positioned in
  their order, publishing the events of the members that go and of those that come."
  [rows]
  (let [suite-ids (mapv :id rows)
        previous  (data-testing.db/suite-members suite-ids)]
    (events/publish-event! :event/test-suite-member-delete (events/delete-event previous))
    (data-testing.db/delete-members-of-suites! suite-ids)
    (when-let [new-members (not-empty (member-rows (map (juxt :id :members) rows)))]
      (events/publish-event! :event/test-suite-member-create
                             (events/create-event (data-testing.db/insert-suite-members! new-members))))))

(defn- event-context
  "The context of the events of a write with `opts`."
  [{:keys [writer context]}]
  (cond-> context
    (= :revert writer) (assoc :reverting? true)))

(mu/defn create-test-suites! :- [:sequential ::data-testing.schema/test-suite]
  "Insert the TestSuite `rows` with their members, positioned in their order, in one transaction, publishing the create
  events of the members and then of the suites, and return the inserted suites."
  ([rows :- [:sequential ::data-testing.schema/test-suite.create]]
   (create-test-suites! rows nil))
  ([rows :- [:sequential ::data-testing.schema/test-suite.create]
    opts :- ::data-testing.schema/write-opts]
   (if (seq rows)
     (t2/with-transaction [_conn]
       (let [suites  (data-testing.db/insert-test-suites! (mapv #(dissoc % :members) rows))
             members (member-rows (map (fn [suite row] [(:id suite) (:members row)]) suites rows))]
         (when (seq members)
           (events/publish-event! :event/test-suite-member-create
                                  (events/create-event (data-testing.db/insert-suite-members! members))))
         (events/publish-event! :event/test-suite-create (events/create-event suites (event-context opts)))
         suites))
     [])))

(mu/defn update-test-suites! :- [:sequential ::data-testing.schema/test-suite.update-row]
  "Apply the changes in each of `rows`, the id of a TestSuite and the columns to change, replacing its members when the
  row has `:members`, in one transaction with one statement per distinct change set, publishing the events of the
  members and then of the suites. A change of members alone also sets the suite's update time. The suite rows are
  locked first, so a concurrent update of the same suite waits until this one commits and then replaces the members this
  one wrote. Returns `rows`."
  ([rows :- [:sequential ::data-testing.schema/test-suite.update-row]]
   (update-test-suites! rows nil))
  ([rows :- [:sequential ::data-testing.schema/test-suite.update-row]
    opts :- ::data-testing.schema/write-opts]
   (when (seq rows)
     (t2/with-transaction [_conn]
       (let [stored      (u/index-by :id (data-testing.db/test-suites-for-update (mapv :id rows)))
             rows*       (filterv (comp stored :id) rows)
             columns     (fn [row] (dissoc row :id :members))
             with-members (filterv #(contains? % :members) rows*)]
         (doseq [[updates group] (group-by columns rows*)
                 :when           (seq updates)]
           (data-testing.db/update-test-suites! (mapv :id group) updates))
         (when (seq with-members)
           (data-testing.db/touch-test-suites! (mapv :id with-members))
           (replace-suite-members! with-members))
         (let [fresh       (u/index-by :id (data-testing.db/test-suites-by-ids (mapv :id rows*)))
               column-rows (filterv (comp seq columns) rows*)
               parts-rows  (filterv (comp empty? columns) with-members)]
           (events/publish-event! :event/test-suite-update
                                  (events/update-event stored
                                                       (mapv #(select-keys % [:id]) column-rows)
                                                       {:objects (into {} (map (fn [{:keys [id]}] [id (fresh id)])) column-rows)
                                                        :context (event-context opts)}))
           (events/publish-event! :event/test-suite-update
                                  (events/touch-event (mapv (comp stored :id) parts-rows) (event-context opts)))))))
   (vec rows)))

(mu/defn delete-test-suites!
  "Delete the TestSuites with `ids`, and their members, publishing their delete event."
  [ids :- [:sequential ms/PositiveInt]]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (events/publish-event! :event/test-suite-delete
                             (events/delete-event (data-testing.db/test-suites-by-ids (vec ids))))
      (data-testing.db/delete-test-suites! (vec ids))))
  nil)

(mu/defn create-test-suite-members! :- [:sequential ::data-testing.schema/test-suite.member]
  "Insert the TestSuiteMember `rows`, publishing their create event, and return the inserted members."
  [rows :- [:sequential ::data-testing.schema/test-suite-member.row.create]]
  (if (seq rows)
    (t2/with-transaction [_conn]
      (let [members (data-testing.db/insert-suite-members! rows)]
        (events/publish-event! :event/test-suite-member-create (events/create-event members))
        members))
    []))

(mu/defn update-test-suite-members! :- [:sequential ::data-testing.schema/test-suite-member.update-row]
  "Apply the changes in each of `rows`, the id of a TestSuiteMember and the columns to change, with one statement per
  distinct change set, publishing their update event. Returns `rows`."
  [rows :- [:sequential ::data-testing.schema/test-suite-member.update-row]]
  (when (seq rows)
    (t2/with-transaction [_conn]
      (let [stored (u/index-by :id (data-testing.db/suite-members-by-ids (mapv :id rows)))]
        (doseq [[changes group] (group-by #(dissoc % :id) rows)
                :when           (seq changes)]
          (data-testing.db/update-suite-members! (mapv :id group) changes))
        (events/publish-event! :event/test-suite-member-update (events/update-event stored rows)))))
  (vec rows))

(mu/defn delete-test-suite-members!
  "Delete the TestSuiteMembers with `ids`, publishing their delete event."
  [ids :- [:sequential ms/PositiveInt]]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (events/publish-event! :event/test-suite-member-delete
                             (events/delete-event (data-testing.db/suite-members-by-ids (vec ids))))
      (data-testing.db/delete-suite-members! (vec ids))))
  nil)

(mu/defn delete-members-of-tests! :- :nil
  "Delete the members of every TestSuite that name the `test-type` tests with `entity-ids`, publishing their delete
  event."
  [test-type  :- ::data-testing.schema/test-type
   entity-ids :- [:sequential :string]]
  (let [members (data-testing.db/suite-members-of-tests test-type entity-ids)]
    (when (seq members)
      (events/publish-event! :event/test-suite-member-delete (events/delete-event members))
      (data-testing.db/delete-suite-members-of-tests! test-type entity-ids)))
  nil)

;;; ---------------------------------------------------- Specs -----------------------------------------------------

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
   :update!       update-test-suites!
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
   :update!   update-test-suite-members!
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
