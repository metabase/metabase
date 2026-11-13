(ns metabase-enterprise.data-testing.models.segment-test
  "`:model/SegmentTest`: a saved test of one segment."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.audit-app.core :as audit-app]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-permissions.core :as query-perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.models.revision :as revision]
   [metabase.serialization.core :as serialization]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SegmentTest [_model] :segment_test)

(doto :model/SegmentTest
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?)
  (derive ::data-testing.models/saved-test))

(methodical/defmethod t2/model-for-automagic-hydration [:model/SegmentTest :segment]
  [_original-model _k]
  :model/Segment)

(t2/deftransforms :model/SegmentTest
  {:inputs       (data-testing.models/json-column ::data-testing.schema/inputs)
   :expectations (data-testing.models/json-column ::data-testing.schema/expectations)})

(methodical/defmethod t2/batched-hydrate [:model/SegmentTest :last_run]
  "Add the newest run, or nil, to each segment test."
  [_model _k segment-tests]
  (data-testing.models/with-last-runs :segment segment-tests))

(defmethod audit-app/model-details :model/SegmentTest
  [segment-test _event-type]
  (select-keys segment-test [:segment_id :name :description]))

;;; ---------------------------------------------------- Events ----------------------------------------------------

(defenterprise delete-segment-tests!
  "Enterprise implementation: delete the tests of the segment `segment-id`, each through its own hook. Runs whatever
  the token says, since the rows outlive the feature."
  :feature :none
  [segment-id]
  (data-testing.db/delete-segment-tests! segment-id))

(t2/define-before-delete :model/SegmentTest [segment-test]
  ;; No foreign key keeps a run's test id valid, so the hook sets the test id of the test's runs to null, in the
  ;; delete's transaction. Toucan 2 has no after-delete hook. A delete that skips model hooks (a Table or Database
  ;; deleted by database cascade) leaves the runs' test id naming no test; such runs are never listed or shown as
  ;; `last_run`.
  (data-testing.db/clear-test-id-of-runs! :segment (:id segment-test))
  (when-not mi/*deserializing?*
    (events/publish-event! :event/segment-test-delete {:object segment-test}))
  segment-test)

(t2/define-after-insert :model/SegmentTest [segment-test]
  (when-not mi/*deserializing?*
    (events/publish-event! :event/segment-test-create
                           {:object  (t2/instance :model/SegmentTest segment-test)
                            :user-id (:creator_id segment-test)}))
  segment-test)

(t2/define-after-update :model/SegmentTest [segment-test]
  (when-not mi/*deserializing?*
    (events/publish-event! :event/segment-test-update
                           {:object (t2/instance :model/SegmentTest segment-test)}))
  segment-test)

;;; ------------------------------------------------- Permissions --------------------------------------------------

(defn- segment-allows?
  "Whether `segment-check` holds for the Segment `segment-id`, and the current user may run the segment's definition
  and write the native SQL of a test against its Database."
  [segment-check segment-id]
  (boolean
   (when-let [{:keys [definition] :as segment} (data-testing.db/segment segment-id)]
     (and (segment-check segment)
          ;; A run compiles the definition with the segments it uses, and its errors can quote their SQL.
          (query-perms/can-run-query? definition)
          (or (mi/superuser?)
              (some-> (not-empty definition) lib/database-id data-testing.models/can-run-native-query?))))))

(mu/defn- can-save-test? :- :boolean
  "Whether the current user may save or delete a test of the Segment `segment-id`: they may edit the segment and run
  its definition, and write the native SQL of a test against its Database."
  [segment-id :- ::lib.schema.id/segment]
  (segment-allows? mi/can-write? segment-id))

(mu/defn can-run? :- :boolean
  "Whether the current user may run the saved `segment-test`: they may read its segment and run the segment's
  definition, and write the native SQL of a test against its Database."
  [segment-test :- ::data-testing.schema/segment-test]
  ;; Input SQL can read any table of the Database, and the guards do not check it, so reading the segment is not
  ;; enough.
  (segment-allows? mi/can-read? (:segment_id segment-test)))

(defmethod mi/can-read? :model/SegmentTest
  ([instance]
   (boolean (some-> (data-testing.db/segment (:segment_id instance)) mi/can-read?)))
  ([_model pk]
   (when-let [segment-test (data-testing.db/segment-test pk)]
     (mi/can-read? segment-test))))

(defmethod mi/can-write? :model/SegmentTest
  ([instance]
   (can-save-test? (:segment_id instance)))
  ([_model pk]
   (when-let [segment-test (data-testing.db/segment-test pk)]
     (mi/can-write? segment-test))))

(defmethod mi/can-create? :model/SegmentTest
  [_model instance]
  (can-save-test? (:segment_id instance)))

(defmethod mi/can-update? :model/SegmentTest
  [instance changes]
  (and (can-save-test? (:segment_id instance))
       (can-save-test? (:segment_id changes (:segment_id instance)))))

;;; -------------------------------------------------- Revisions ---------------------------------------------------

(def ^:private revision-columns
  [:segment_id :name :description :inputs :expectations])

(defmethod revision/serialize-instance :model/SegmentTest
  [_model _id segment-test]
  (select-keys segment-test revision-columns))

(defmethod revision/revision-readable? :model/SegmentTest
  [_model object]
  ;; An older revision can name a segment that has since been deleted; nobody may read a revision about it.
  (boolean (some-> (data-testing.db/segment (:segment_id object)) mi/can-read?)))

(defmethod revision/revert-to-revision! :model/SegmentTest
  [_model id _user-id serialized-instance]
  (data-testing.db/update-segment-test! id (select-keys serialized-instance revision-columns)))

;;; ------------------------------------------------- Serialization ------------------------------------------------

(defmethod serialization/spec :model/SegmentTest [_]
  {:schema    ::data-testing.schema/external-segment-test
   :copy      [:entity_id :name :description :inputs :expectations]
   :transform {:segment_id (serialization/fk-transform :model/Segment)
               :creator_id serialization/user-transform}})

(defmethod serialization/storage-paths :model/SegmentTest [_ entities _ctx]
  ;; A segment's path comes from its table, which only its exported definition names.
  (let [segments (vals (serialization/rows-by-refs :model/Segment (into #{} (keep :segment_id) entities) nil))
        exported (zipmap (map :entity_id segments) (serialization/export-batch :model/Segment segments))
        paths    (serialization/batch-storage-paths (mapv #(get exported (:segment_id %)) entities))]
    (mapv (fn [segment-test path]
            (conj path {:label (:name segment-test) :key (:entity_id segment-test)}))
          entities paths)))

(defmethod serialization/import-dependencies :model/SegmentTest [_ entities]
  (mapv (fn [{:keys [segment_id]}]
          #{[:model/Segment segment_id]})
        entities))

;;; -------------------------------------------------- Remote sync -------------------------------------------------

(defmethod remote-sync/spec :model/SegmentTest
  [_model]
  {:synced-items         data-testing.db/synced-segment-test-items
   :synced-filter-clause data-testing.db/synced-segment-tests-clause})
