(ns metabase-enterprise.data-testing.models.segment-test
  "`:model/SegmentTest`: a saved test of one segment."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.serialization :as data-testing.serialization]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.core :as revisions]
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

(defmethod audit/spec :model/SegmentTest [_model]
  {:track          [:segment_id :name :description]
   :track-redacted [:creator_id :expectations :inputs]
   :skip           [:entity_id]
   :changes?       false
   :creator        :creator_id})

(defmethod app-db-copy/spec :model/SegmentTest [_model]
  {:skip? false})

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

;;; ---------------------------------------------------- Hooks -----------------------------------------------------

(t2/define-before-delete :model/SegmentTest [segment-test]
  (data-testing.db/clear-test-id-of-runs! :segment (:id segment-test))
  segment-test)

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

(methodical/defmethod t2/batched-hydrate [:model/SegmentTest :can_read]
  "Add whether the current user can read the segment of each segment test, loading the segments at once."
  [_model k segment-tests]
  (data-testing.models/with-readable-subjects k segment-tests :segment_id
    (data-testing.db/segments-by-ids (into [] (comp (keep :segment_id) (distinct)) segment-tests))))

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

(defn- revert-segment-test!
  [id _user-id snapshot]
  (data-testing.models/check-revert-available)
  (update-segment-test! id (select-keys snapshot revision-columns)))

(defmethod revisions/spec :model/SegmentTest [_model]
  {:track     revision-columns
   :skip      [:creator_id :entity_id]
   :authorize :snapshot
   :revert!   revert-segment-test!})

;;; ------------------------------------------------- Serialization ------------------------------------------------

(defmethod serialization/spec :model/SegmentTest [_]
  {:schema              ::data-testing.schema/external-segment-test
   :copy                [:entity_id :name :description :inputs :expectations]
   :transform           {:segment_id (serialization/fk-transform :model/Segment)
                         :creator_id serialization/user-transform}
   :storage-paths       data-testing.serialization/segment-test-storage-paths
   :import-dependencies data-testing.serialization/segment-test-import-dependencies})

;;; -------------------------------------------------- Remote sync -------------------------------------------------

(defmethod remote-sync/spec :model/SegmentTest
  [_model]
  {:synced-items         data-testing.db/synced-segment-test-items
   :synced-filter-clause data-testing.db/synced-segment-tests-clause})
