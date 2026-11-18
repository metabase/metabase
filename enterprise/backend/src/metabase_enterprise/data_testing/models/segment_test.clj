(ns metabase-enterprise.data-testing.models.segment-test
  "`:model/SegmentTest`: a saved test of one segment."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.audit-app.core :as audit-app]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
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

(defmethod audit-app/model-details :model/SegmentTest
  [segment-test _event-type]
  (select-keys segment-test [:segment_id :name :description]))

;;; ---------------------------------------------------- Events ----------------------------------------------------

(defenterprise delete-segment-tests!
  "Enterprise implementation: delete the tests of the segment `segment-id`, each through its own hook. Runs whether
  or not the premium token grants the feature, since the tests outlive the feature."
  :feature :none
  [segment-id]
  (data-testing.db/delete-segment-tests! segment-id))

;;; ------------------------------------------------- Permissions --------------------------------------------------

(defn- segment-allows?
  "Whether `segment-check` holds for the Segment `segment-id`, hydrated with `k`, and the current user may run the
  segment's definition and write the native SQL of a test against its Database."
  [segment-check k segment-id]
  (let [segment (data-testing.db/segment segment-id)]
    (data-testing.models/query-subject-allows? segment-check k segment (:definition segment))))

(mu/defn- can-save-test? :- :boolean
  "Whether the current user may save or delete a test of the Segment `segment-id`: they may edit the segment and run
  its definition, and write the native SQL of a test against its Database."
  [segment-id :- ::lib.schema.id/segment]
  (segment-allows? mi/can-write? :can_write segment-id))

(mu/defn can-run? :- :boolean
  "Whether the current user may run the saved `segment-test`: they may read its segment and run the segment's
  definition, and write the native SQL of a test against its Database."
  [segment-test :- ::data-testing.schema/segment-test]
  ;; Input SQL can read any table of the Database, and the guards do not check what it reads, so reading the
  ;; segment is not enough.
  (segment-allows? mi/can-read? :can_read (:segment_id segment-test)))

(defmethod data-testing.models/saved-test-spec :model/SegmentTest
  [_model]
  {:test-type   :segment
   :subject-key :segment_id
   :subject     data-testing.db/segment
   :subjects    data-testing.db/segments-by-ids
   :can-save?   can-save-test?})

;;; -------------------------------------------------- Revisions ---------------------------------------------------

(def ^:private revision-columns
  [:segment_id :name :description :inputs :expectations])

(defmethod revision/serialize-instance :model/SegmentTest
  [_model _id segment-test]
  (select-keys segment-test revision-columns))

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
  ;; A segment's path comes from its table, and only the segment's exported definition names that table.
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
