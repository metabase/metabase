(ns metabase-enterprise.data-testing.models.segment-test
  "`:model/SegmentTest`: a saved test of one segment."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.serialization :as data-testing.serialization]
   [metabase-enterprise.data-testing.subject :as data-testing.subject]
   [metabase-enterprise.data-testing.subject.segment :as data-testing.subject.segment]
   [metabase-enterprise.data-testing.test-type :as data-testing.test-type]
   [metabase-enterprise.data-testing.util :as data-testing.util]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.eid-translation.spec :as eid-translation]
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

(set! *warn-on-reflection* true)

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
  {:inputs       (data-testing.util/json-column ::data-testing.schema/inputs)
   :expectations (data-testing.util/json-column ::data-testing.schema/expectations)})

(methodical/defmethod t2/batched-hydrate [:model/SegmentTest :last_run]
  "Add the newest run, or nil, to each segment test."
  [_model _k segment-tests]
  (data-testing.models/with-last-runs :segment segment-tests))

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

;;; -------------------------------------------------- Validation --------------------------------------------------

(mu/defn testable-segment :- [:maybe :map]
  "The Segment with `segment-id`, or nil when there is none. Throws a typed refusal when there is no query to test (see
  [[data-testing.subject.segment/check-testable]])."
  [segment-id :- ::lib.schema.id/segment]
  (doto (data-testing.db/segment segment-id)
    (data-testing.subject.segment/check-testable)))

(mu/defn validate-test :- :nil
  "Throws the typed refusal of a test of the Segment `segment-id` with the inputs and expectations of `definition`
  that could not run."
  [segment-id :- ::lib.schema.id/segment
   definition :- ::data-testing.runner/definition]
  (data-testing.runner/validate-test :segment (testable-segment segment-id) definition))

(mu/defn check-edit :- :nil
  "Throws the typed refusal of an edit that sets the keys `edited-keys` of a segment test and leaves it as `edited`. An
  edit that sets the segment or what a run reads is refused as a new test like `edited` would be. Any other edit is
  refused when the segment is archived."
  [edited      :- [:map [:segment_id ::lib.schema.id/segment]]
   edited-keys :- [:sequential :keyword]]
  (if (data-testing.models/validates-edit? :segment_id edited-keys)
    (validate-test (:segment_id edited) (data-testing.runner/test-definition edited))
    (let [segment (data-testing.db/segment (:segment_id edited))]
      ;; A new test of an archived segment with no query is refused for having no query; so is this edit.
      (when (:archived segment)
        (data-testing.subject.segment/check-testable segment))
      (data-testing.subject/check-not-archived :segment segment))))

(defmethod data-testing.test-type/spec :segment [_test-type]
  {:model      :model/SegmentTest
   :run-topics {:start   :event/segment-test-run-start
                :timeout :event/segment-test-run-timeout}
   ;; A suite records a typed refusal of the subject as the member's refusal.
   :subject    #(testable-segment (:segment_id %))
   :can-run?   can-run?})

;;; ---------------------------------------------------- Writes ----------------------------------------------------

(mu/defn create-segment-tests! :- [:sequential ::data-testing.schema/segment-test]
  "Insert the SegmentTests `rows`, returning the inserted tests, each row normalized and validated by the column
  transforms of the model."
  [rows :- [:sequential ::data-testing.schema/segment-test.create]]
  (data-testing.models/create-saved-tests! :model/SegmentTest rows))

(mu/defn update-segment-tests! :- :nil
  "Apply the changes in each of `rows`, the id of a SegmentTest and the columns to change, which the column transforms of
  the model normalize and validate, publishing one update event for all."
  ([rows :- [:sequential ::data-testing.schema/segment-test.update]]
   (update-segment-tests! rows nil))
  ([rows :- [:sequential ::data-testing.schema/segment-test.update]
    opts :- :metabase.events.schema/write-opts]
   (data-testing.models/update-saved-tests! :model/SegmentTest rows opts)))

(mu/defn delete-segment-tests! :- :nil
  "Delete the SegmentTests with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (data-testing.models/delete-saved-tests! :segment :model/SegmentTest ids))

(defenterprise delete-segment-tests-for-segments!
  "Deletes the tests of the segments with `segment-ids` whatever the token says, since the rows outlive the feature."
  :feature :none
  [segment-ids]
  (delete-segment-tests! (data-testing.db/saved-test-ids-of-subjects :model/SegmentTest :segment_id (vec segment-ids))))

;;; -------------------------------------------------- Revisions ---------------------------------------------------

(def ^:private revision-columns
  [:segment_id :name :description :inputs :expectations])

(defn- revert-segment-test!
  [id _user-id snapshot]
  (update-segment-tests! [(assoc snapshot :id id)] {:writer :revert}))

(defn- check-revert
  "Returns `snapshot`, after refusing it as an edit to the same state would be refused."
  [id _user-id snapshot]
  (data-testing.models/check-revert-available)
  (data-testing.errors/refusing
   "segment-test"
   #(check-edit snapshot (data-testing.models/reverted-keys (data-testing.db/segment-test id) snapshot)))
  snapshot)

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defmethod app-db-copy/spec :model/SegmentTest [_model]
  {:skip? false})

(defmethod serialization/spec :model/SegmentTest [_]
  {:schema              ::data-testing.schema/external-segment-test
   :insert!             create-segment-tests!
   :update!             #(update-segment-tests! % {:writer :import})
   :delete!             delete-segment-tests!
   :copy                [:entity_id :name :description :inputs :expectations]
   :transform           {:segment_id (serialization/fk-transform :model/Segment)
                         :creator_id serialization/user-transform}
   :storage-paths       data-testing.serialization/segment-test-storage-paths
   :import-dependencies data-testing.serialization/segment-test-import-dependencies})

(defmethod remote-sync/spec :model/SegmentTest
  [_model]
  {:synced-items         data-testing.db/synced-segment-test-items
   :synced-filter-clause data-testing.db/synced-segment-tests-clause})

(defmethod eid-translation/spec :model/SegmentTest [_model]
  {:names [:segment-test]})

(defmethod revisions/spec :model/SegmentTest [_model]
  {:track         revision-columns
   :skip          [:creator_id :entity_id]
   :schema        ::data-testing.schema/segment-test.revision
   :authorize     :snapshot
   :before-revert check-revert
   :revert!       revert-segment-test!})

(defmethod audit/spec :model/SegmentTest [_model]
  {:track          [:segment_id :name :description]
   :track-redacted [:creator_id :expectations :inputs]
   :skip           [:entity_id]})
