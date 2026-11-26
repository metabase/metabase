(ns metabase-enterprise.data-testing.models.segment-test
  "`:model/SegmentTest`: a saved test of one segment."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.serialization :as data-testing.serialization]
   [metabase-enterprise.data-testing.subject.segment :as data-testing.subject.segment]
   [metabase-enterprise.data-testing.test-type :as data-testing.test-type]
   [metabase-enterprise.data-testing.util :as data-testing.util]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.lib.schema.id :as lib.schema.id]
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

(defmethod data-testing.test-type/spec :segment [_test-type]
  {:model      :model/SegmentTest
   :run-topics {:start   :event/segment-test-run-start
                :timeout :event/segment-test-run-timeout}
   ;; A suite records a typed refusal of the subject as the member's refusal.
   :subject    #(testable-segment (:segment_id %))})

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

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defn- segment-database-id
  "The id of the Database of the query of `segment`."
  [segment]
  (data-testing.models/query-database-id (:definition segment)))

(defmethod data-testing.models/saved-test-spec :model/SegmentTest [_model]
  {:test-type         :segment
   :subject-key       :segment_id
   :subject           data-testing.db/segment
   :subjects          data-testing.db/segments-by-ids
   :database-id       segment-database-id
   :validate-test     validate-test
   :check-testable    data-testing.subject.segment/check-testable
   :refuses-archived? true})

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

(defmethod revisions/spec :model/SegmentTest [_model]
  {:track         revision-columns
   :skip          [:creator_id :entity_id]
   :schema        ::data-testing.schema/segment-test.revision
   :authorize     :snapshot
   :before-revert #(data-testing.models/check-revert :model/SegmentTest %1 %2 %3)
   :revert!       revert-segment-test!})

(defmethod audit/spec :model/SegmentTest [_model]
  {:track          [:segment_id :name :description]
   :track-redacted [:creator_id :expectations :inputs]
   :skip           [:entity_id]})
