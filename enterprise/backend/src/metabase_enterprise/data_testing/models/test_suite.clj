(ns metabase-enterprise.data-testing.models.test-suite
  "`:model/TestSuite`, a named list of saved data tests, and `:model/TestSuiteMember`, one test in a suite. A member
  names its test by test type and entity id, with no foreign key: a suite can name a test this instance lacks."
  (:require
   [malli.util :as mut]
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.serialization :as data-testing.serialization]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
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
  their order."
  [rows]
  (data-testing.db/delete-members-of-suites! (mapv :id rows))
  (when-let [new-members (not-empty (member-rows (map (juxt :id :members) rows)))]
    (data-testing.db/insert-suite-members! new-members)))

(def ^:private SuiteMember
  "A test in the `:members` of a suite as a write gives it: its test, by type and entity id."
  (mut/select-keys ::data-testing.schema/test-suite-member.create [:test_type :test_entity_id]))

(def ^:private NewTestSuite
  [:merge
   ::data-testing.schema/test-suite.create
   [:map {:closed true}
    [:members {:optional true} [:sequential SuiteMember]]]])

(defn- create-batch!
  "Insert the TestSuite `rows` with their members, positioned in their order, and return the inserted suites."
  [rows]
  (let [suites  (data-testing.db/insert-test-suites! (mapv #(dissoc % :members) rows))
        members (member-rows (map (fn [suite row] [(:id suite) (:members row)]) suites rows))]
    (when (seq members)
      (data-testing.db/insert-suite-members! members))
    suites))

(mu/defn create-test-suites! :- [:sequential ::data-testing.schema/test-suite]
  "Insert the TestSuite `rows` with their members, positioned in their order, in one transaction, publishing their create
  event last, and return the inserted suites."
  ([rows :- [:sequential NewTestSuite]]
   (create-test-suites! rows nil))
  ([rows :- [:sequential NewTestSuite]
    opts :- :metabase.events.schema/write-opts]
   (t2/with-transaction [_conn]
     (let [suites (into [] (mapcat (comp create-batch! vec)) (partition-all mdb/create-partition-size rows))]
       (when (seq suites)
         (events/publish-event! :event/test-suite-create (events/create-event suites opts)))
       suites))))

(def ^:private UpdateTestSuite
  [:merge
   (mut/dissoc ::data-testing.schema/test-suite.update :id)
   [:map {:closed true}
    [:members {:optional true} [:sequential SuiteMember]]]])

(defn- publish-update!
  "Publish, as the last step of a write, the update event of the suites that the `rows` change, as `fresh` holds them
  after it, and the touch event of the suites of `touched-ids` that the rows leave unchanged, whose members the write
  changed, so that their records are made once; `stored` holds the suites as read before."
  [stored fresh rows touched-ids opts]
  (let [event   (events/update-event stored rows (assoc opts :objects (select-keys fresh (map :id rows))))
        updated (into #{} (map (comp :id :object)) (:changes event))
        touched (into [] (comp (remove updated) (distinct) (keep stored)) touched-ids)
        event   (update event :changes into (:changes (events/touch-event touched)))]
    (when (seq (:changes event))
      (events/publish-event! :event/test-suite-update event))))

(defn- publish-suite-updates!
  "Publish the update event of the suites of `id->stored` as `id->updated` holds them after the write, and for an import
  the touch of those it leaves unchanged."
  [opts id->stored id->updated]
  (when (seq id->stored)
    (let [ids (vec (keys id->stored))]
      (publish-update! id->stored id->updated (mapv #(hash-map :id %) ids) (if (= :import (:writer opts)) ids []) opts))))

(defn- update-suite-batch!
  "Lock the suites of `rows`, one batch of a call, each a suite id and the columns to change, apply the changes, and
  return the suites by id as read and as they are after."
  [rows]
  (let [id->stored (u/index-by :id (data-testing.db/test-suites-for-update (mapv :id rows)))]
    (data-testing.db/update-test-suites! (filterv (comp id->stored :id) rows))
    {:id->stored  id->stored
     :id->updated (when (seq id->stored) (u/index-by :id (data-testing.db/test-suites-by-ids (vec (keys id->stored)))))}))

(mu/defn update-test-suites! :- :nil
  "Apply the changes in each of `rows`, the id of a TestSuite and the columns to change, without its members, in one
  transaction after locking the suite rows, publishing their update event last, and for an import a touch of the
  suites that it leaves unchanged."
  ([rows :- [:sequential ::data-testing.schema/test-suite.update]]
   (update-test-suites! rows nil))
  ([rows :- [:sequential ::data-testing.schema/test-suite.update]
    opts :- :metabase.events.schema/write-opts]
   (t2/with-transaction [_conn]
     (let [batches (mapv (comp update-suite-batch! vec) (partition-all mdb/update-partition-size rows))]
       (publish-suite-updates! opts (into {} (map :id->stored) batches) (into {} (map :id->updated) batches))))
   nil))

(mu/defn update-test-suite! :- :nil
  "Apply the `changes`, columns of the TestSuite with `id`, and the `:members` it has afterwards, replacing its
  members when `changes` has `:members`, in one transaction after locking the suite row, publishing, last, one update
  event of its columns or members, and for an import a touch when nothing changes."
  ([id      :- ms/PositiveInt
    changes :- UpdateTestSuite]
   (update-test-suite! id changes nil))
  ([id      :- ms/PositiveInt
    changes :- UpdateTestSuite
    opts    :- :metabase.events.schema/write-opts]
   (t2/with-transaction [_conn]
     (let [stored  (u/index-by :id (data-testing.db/test-suites-for-update [id]))
           columns (dissoc changes :members)
           members? (contains? changes :members)]
       (when (seq stored)
         (when (seq columns)
           (data-testing.db/update-test-suites! [(assoc columns :id id)]))
         (when members?
           (data-testing.db/touch-test-suites! [id])
           (replace-suite-members! [{:id id :members (:members changes)}]))
         (publish-update! stored
                          (u/index-by :id (data-testing.db/test-suites-by-ids [id]))
                          (if (seq columns) [{:id id}] [])
                          (if (or members? (= :import (:writer opts))) [id] [])
                          opts))))
   nil))

(mu/defn delete-test-suites!
  "Delete the TestSuites with `ids`, and their members, in one transaction, publishing their delete event."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/delete-batched! :model/TestSuite ids
                       {:before-delete #(events/publish-event! :event/test-suite-delete (events/delete-event %))}))

(mu/defn- create-test-suite-members! :- [:sequential ::data-testing.schema/test-suite.member]
  "Insert the TestSuiteMember `rows` in a plain write that publishes nothing, and return the inserted members."
  [rows :- [:sequential ::data-testing.schema/test-suite-member.create]]
  (if (seq rows)
    (data-testing.db/insert-suite-members! rows)
    []))

(mu/defn- update-test-suite-members! :- [:sequential ::data-testing.schema/test-suite-member.update]
  "Apply the changes in each of `rows`, the id of a TestSuiteMember and the columns to change, with one statement per
  distinct change set, in a plain write that publishes nothing, and return `rows`."
  [rows :- [:sequential ::data-testing.schema/test-suite-member.update]]
  (doseq [[changes group] (group-by #(dissoc % :id) rows)
          :when           (seq changes)]
    (data-testing.db/update-suite-members! (mapv :id group) changes))
  (vec rows))

(mu/defn- delete-test-suite-members!
  "Delete the TestSuiteMembers with `ids` in a plain write that publishes nothing."
  [ids :- [:sequential ms/PositiveInt]]
  (when (seq ids)
    (data-testing.db/delete-suite-members! (vec ids)))
  nil)

(mu/defn delete-test-suite-members-for-tests! :- :nil
  "Delete the members of every TestSuite that name the `test-type` tests with `entity-ids`, publishing the update event
  of their suites as a touch."
  [test-type  :- ::data-testing.schema/test-type
   entity-ids :- [:sequential :string]]
  (t2/with-transaction [_conn]
    (when-let [members (not-empty (data-testing.db/suite-members-of-tests test-type entity-ids))]
      (let [stored (u/index-by :id (data-testing.db/test-suites-by-ids (vec (distinct (map :suite_id members)))))]
        (data-testing.db/delete-suite-members-of-tests! test-type entity-ids)
        (events/publish-event! :event/test-suite-update (events/touch-event (vec (vals stored)))))))
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
   :insert!       #(create-test-suites! % {:writer :import})
   :update!       #(update-test-suites! % {:writer :import})
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
