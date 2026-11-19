(ns metabase-enterprise.data-testing.models.segment-test
  "`:model/SegmentTest`: a saved test of one segment."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.audit-app.core :as audit-app]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.models.revision :as revision]
   [metabase.serialization.core :as serialization]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SegmentTest [_model] :segment_test)

(doto :model/SegmentTest
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?)
  (derive :hook/events)
  (derive ::data-testing.models/saved-test))

(defmethod events/spec :model/SegmentTest
  [_model]
  {:create :event/segment-test-create
   :update :event/segment-test-update
   :delete :event/segment-test-delete})

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

;;; ---------------------------------------------------- Hooks -----------------------------------------------------

(t2/define-before-delete :model/SegmentTest [segment-test]
  (data-testing.db/clear-test-id-of-runs! :segment (:id segment-test))
  segment-test)

;;; ------------------------------------------------- Permissions --------------------------------------------------

(defn- segment-allows?
  "Whether `segment-check` holds for the Segment `segment-id`, hydrated with `k`, and the current user may run the
  segment's definition and write the native SQL of a test against its Database."
  [segment-check k segment-id]
  (let [segment (some-> (data-testing.db/segment segment-id) (t2/hydrate k))]
    (data-testing.models/query-subject-allows? segment-check segment (:definition segment))))

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

(methodical/defmethod t2/batched-hydrate [:model/SegmentTest :can_run]
  "Add whether the current user may run each segment test, as [[can-run?]] says, loading their segments at once."
  [_model _k segment-tests]
  (data-testing.models/with-can-run segment-tests :segment_id data-testing.db/segments-by-ids :definition))

(methodical/defmethod t2/simple-hydrate [:model/SegmentTest :can_read]
  [_model k instance]
  (vary-meta instance assoc k (boolean (some-> (data-testing.db/segment (:segment_id instance))
                                               (t2/hydrate :can_read)
                                               mi/can-read?))))

(methodical/defmethod t2/simple-hydrate [:model/SegmentTest :can_write]
  [_model k instance]
  (assoc instance k (boolean (can-save-test? (:segment_id instance)))))

(defmethod mi/can-create? :model/SegmentTest
  [_model instance]
  (can-save-test? (:segment_id instance)))

(defmethod mi/can-update? :model/SegmentTest
  [instance changes]
  (and (mi/can-write? instance)
       (can-save-test? (:segment_id changes (:segment_id instance)))))

;;; ---------------------------------------------------- Writes ----------------------------------------------------

(mu/defn create-segment-test! :- ::data-testing.schema/segment-test
  "Insert the SegmentTest `segment-test` returning the inserted test."
  [segment-test :- [:merge
                    ::data-testing.schema/segment-test.create
                    [:map {:closed true}
                     [:creator_id ::lib.schema.id/user]]]]
  (data-testing.db/insert-segment-test! segment-test))

(mu/defn update-segment-test! :- :nil
  "Apply `changes` to the SegmentTest with `id`."
  [id      :- ms/PositiveInt
   changes :- ::data-testing.schema/segment-test.update]
  (data-testing.db/update-segment-test! id changes)
  nil)

(mu/defn delete-segment-test! :- :nil
  "Delete the SegmentTest with `id`."
  [id :- ms/PositiveInt]
  (data-testing.db/delete-segment-test! id)
  nil)

(defenterprise delete-segment-tests!
  "Deletes the tests of the segment `segment-id` whatever the token says, since the rows outlive the feature."
  :feature :none
  [segment-id]
  (data-testing.db/delete-segment-tests! segment-id))

;;; -------------------------------------------------- Revisions ---------------------------------------------------

(def ^:private revision-columns
  [:segment_id :name :description :inputs :expectations])

(defmethod revision/serialize-instance :model/SegmentTest
  [_model _id segment-test]
  (select-keys segment-test revision-columns))

(defmethod revision/revisions-readable? :model/SegmentTest
  [_model objects]
  ;; An older revision can name a segment that has since been deleted; nobody may read a revision about it.
  (let [readable-ids (into #{}
                           (map :id)
                           (mi/readable (data-testing.db/segments-by-ids
                                         (into [] (comp (keep :segment_id) (distinct)) objects))))]
    (mapv #(contains? readable-ids (:segment_id %)) objects)))

(defmethod revision/revert-to-revision! :model/SegmentTest
  [_model id _user-id serialized-instance]
  (update-segment-test! id (select-keys serialized-instance revision-columns)))

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
