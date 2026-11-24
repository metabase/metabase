(ns metabase-enterprise.data-testing.models
  (:require
   [java-time.api :as t]
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.models.data-test-run :as data-testing.models.data-test-run]
   [metabase-enterprise.data-testing.models.test-suite :as test-suite]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.serialization :as data-testing.serialization]
   [metabase-enterprise.data-testing.test-type :as data-testing.test-type]
   [metabase-enterprise.data-testing.util :as data-testing.util]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.query-permissions.core :as query-perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.core :as revisions]
   [metabase.serialization.core :as serialization]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TransformTest [_model] :transform_test)

;; `::saved-test` is the parent of every saved test model, for the methods they share.
(doto :model/TransformTest
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?)
  (derive ::saved-test))

(def now-column
  "A Toucan transform for the `now` column of a saved test: a value of [[::data-testing.schema/now]], normalized and
  validated on its way in and normalized on its way out."
  {:in  #(some->> % (lib/normalize ::data-testing.schema/now) (mu/validate-throw ::data-testing.schema/now))
   :out #(some->> % (lib/normalize ::data-testing.schema/now))})

(def now-transform
  "The serialization transform of a saved test's `now`, written in UTC so that a moment exports as the same text on
  every app DB."
  {:export (fn [store batch values opts]
             (serialization/export-dates store batch
                                         (mapv #(some-> % t/instant (t/offset-date-time (t/zone-offset 0))) values)
                                         opts))
   :import serialization/import-dates})

(methodical/defmethod t2/model-for-automagic-hydration [:model/TransformTest :transform]
  [_original-model _k]
  :model/Transform)

(t2/deftransforms :model/TransformTest
  {:now          now-column
   :inputs       (data-testing.util/json-column ::data-testing.schema/inputs)
   :expectations (data-testing.util/json-column ::data-testing.schema/expectations)})

(mu/defn- remove-deleted-tests-from-suites! :- :nil
  "Remove the deleted `test-type` tests with `entity-ids` from every suite, publishing the delete event of their
  members, and do nothing on an instance where remote sync keeps synced content read-only."
  [test-type  :- ::data-testing.schema/test-type
   entity-ids :- [:sequential :string]]
  (when-not (or (remote-sync/read-only?) (empty? entity-ids))
    (test-suite/delete-test-suite-members-for-tests! test-type (vec entity-ids))))

(defn with-last-runs
  "`tests`, saved tests of `test-type`, each with its newest run, or nil, under `:last_run`."
  [test-type tests]
  (if-not (seq tests)
    tests
    (let [id->run (into {}
                        (map (juxt :test_id identity))
                        (data-testing.db/latest-test-runs test-type (into #{} (map :id) tests)))]
      (for [saved-test tests]
        (assoc saved-test :last_run (get id->run (:id saved-test)))))))

(methodical/defmethod t2/batched-hydrate [:model/TransformTest :last_run]
  "Add the newest run, or nil, to each transform test."
  [_model _k transform-tests]
  (with-last-runs :transform transform-tests))

;;; ------------------------------------------------- Permissions --------------------------------------------------

(defn can-run-native-query?
  "Whether the current user may run native SQL against the Database with `db-id`, as the input and expectation SQL of a
  test does."
  [db-id]
  (query-perms/can-run-query? (lib/native-query (lib-be/application-database-metadata-provider db-id) "SELECT 1")))

(defn query-subject-allows?
  "Whether `subject-check` holds for `subject`, a card or a segment, hydrated with `k`, and the current user may run
  `query`, the subject's query, and write the native SQL of a test against the Database of `query`, as `native?`, by
  default [[can-run-native-query?]], answers for a Database id, and false when `subject` is nil."
  ([subject-check k subject query]
   (query-subject-allows? subject-check k subject query can-run-native-query?))
  ([subject-check k subject query native?]
   (boolean
    (when subject
      (and (subject-check (t2/hydrate subject k))
           ;; A run compiles the query with the cards, snippets and segments it includes, and a run's errors can quote
           ;; their SQL, so the user must be allowed to run the query, not only to read the subject.
           (query-perms/can-run-query? query)
           (or (mi/superuser?)
               (some-> (not-empty query) lib/database-id native?)))))))

(defn- can-save-for-transform?
  "Whether the current user may save or delete a test of `transform`: they may edit it, as `transform-writable?` says,
  and run the native SQL of a test against its source Database, as `can-run-native-query?` says."
  [transform transform-writable? can-run-native-query?]
  (boolean
   (and transform
        transform-writable?
        (or (mi/superuser?)
            (some-> (transforms-base.i/source-db-id transform) can-run-native-query?)))))

(mu/defn- can-save? :- :boolean
  "Whether the current user may save or delete a test of the Transform `transform-id` (see [[can-save-for-transform?]])."
  [transform-id :- ::lib.schema.id/transform]
  (let [transform (data-testing.db/transform transform-id)]
    (can-save-for-transform? transform (some-> transform (t2/hydrate :can_write) mi/can-write?) can-run-native-query?)))

(mu/defn can-run-test? :- :boolean
  "Whether the current user may run a test of the Transform `transform-id`: they may read it, and run the native SQL of
  a test against its source Database."
  [transform-id :- ::lib.schema.id/transform]
  (let [transform (data-testing.db/transform transform-id)]
    (boolean
     (and transform
          (mi/can-read? (t2/hydrate transform :can_read))
          (or (mi/superuser?)
              (some-> (transforms-base.i/source-db-id transform) can-run-native-query?))))))

(defn with-readable-subjects
  "Add to each of the saved `tests` whether the current user can read its subject, as `:can_read` in its metadata, the
  `subjects` of all the tests loaded together, the subject of a test being the one whose id its `subject-key` holds,
  and none, which no one can read, when it has been deleted."
  [k tests subject-key subjects]
  (let [id->subject (u/index-by :id (t2/hydrate subjects :can_read))]
    (for [saved-test tests]
      (when saved-test
        (vary-meta saved-test assoc k (boolean (some-> (get id->subject (subject-key saved-test)) mi/can-read?)))))))

(methodical/defmethod t2/batched-hydrate [:model/TransformTest :can_read]
  "Add whether the current user can read the transform of each transform test, loading the transforms at once."
  [_model k transform-tests]
  (with-readable-subjects k transform-tests :transform_id
    (data-testing.db/transforms (into [] (comp (keep :transform_id) (distinct)) transform-tests))))

(methodical/defmethod t2/batched-hydrate [:model/TransformTest :can_write]
  "Add whether the current user can write each transform test, loading their transforms at once and checking each
  source Database once."
  [_model k transform-tests]
  (mi/instances-with-hydrated-data
   transform-tests k
   #(let [transforms (u/index-by :id (t2/hydrate (data-testing.db/transforms
                                                  (into [] (comp (keep :transform_id) (distinct)) transform-tests))
                                                 :can_write))
          native?    (memoize can-run-native-query?)]
      (into {}
            (map (fn [{:keys [id transform_id]}]
                   [id (and (not (remote-sync/read-only?))
                            (let [transform (get transforms transform_id)]
                              (can-save-for-transform? transform (:can_write transform) native?)))]))
            (remove nil? transform-tests)))
   :id
   {:default false}))

(defmethod mi/can-create? :model/TransformTest
  [_model instance]
  (can-save? (:transform_id instance)))

(defn- unsynced-change-writable?
  "Whether the current user can apply `changes` that touch no synced column of `instance`, which a read-only instance
  still accepts."
  [instance changes]
  (and (not (remote-sync/synced-changes? :model/TransformTest instance changes))
       (can-save? (:transform_id instance))))

(defmethod mi/can-update? :model/TransformTest
  [instance changes]
  (and (or (mi/can-write? instance)
           (unsynced-change-writable? instance changes))
       (can-save? (:transform_id changes (:transform_id instance)))))

;;; ---------------------------------------------------- Writes ----------------------------------------------------

(def ^:private saved-test-topics
  "The lifecycle event topics of each saved test model."
  {:model/TransformTest {:create :event/transform-test-create
                         :update :event/transform-test-update
                         :delete :event/transform-test-delete}
   :model/CardTest      {:create :event/card-test-create
                         :update :event/card-test-update
                         :delete :event/card-test-delete}
   :model/SegmentTest   {:create :event/segment-test-create
                         :update :event/segment-test-update
                         :delete :event/segment-test-delete}})

(mu/defn create-saved-tests! :- [:sequential ::data-testing.schema/saved-test]
  "Insert the `rows` of the saved tests of `model` in one transaction, publishing their create event, and return the
  inserted tests."
  [model :- :keyword
   rows  :- [:sequential ::data-testing.schema/saved-test.create]]
  (mdb/create-batched! model rows
                       {:after-create #(events/publish-event! (get-in saved-test-topics [model :create])
                                                              (events/create-event %))}))

(mu/defn update-saved-tests! :- :nil
  "Apply the changes in each of `rows`, the id of a test of `model` and the columns to change, in one transaction,
  publishing their update event."
  [model :- :keyword
   rows  :- [:sequential ::data-testing.schema/saved-test.update]
   opts  :- :metabase.events.schema/write-opts]
  (mdb/update-batched! model rows
                       {:reread?      true
                        :after-update (fn [updates id->stored id->updated]
                                        (events/publish-event! (get-in saved-test-topics [model :update])
                                                               (events/update-event id->stored updates
                                                                                    (assoc opts :objects id->updated))))}))

(defn- delete-and-publish!
  "Set the test id of the runs of the deleted `test-type` `tests` of `model` to nil and remove them from the suites, then
  publish their delete event."
  [test-type model tests]
  (data-testing.models.data-test-run/clear-test-ids-of-runs! test-type (mapv :id tests))
  (remove-deleted-tests-from-suites! test-type (mapv :entity_id tests))
  (events/publish-event! (get-in saved-test-topics [model :delete]) (events/delete-event tests)))

(mu/defn delete-saved-tests! :- :nil
  "Delete the saved tests of `model`, a `test-type` test, with `ids`, in one transaction, publishing their delete
  event right before the statement, so that a run of a deleted test no longer names it and a suite no longer holds
  it."
  [test-type :- ::data-testing.schema/test-type
   model     :- :keyword
   ids       :- [:sequential ms/PositiveInt]]
  (mdb/delete-batched! model ids {:before-delete #(delete-and-publish! test-type model %)}))

(mu/defn create-transform-tests! :- [:sequential ::data-testing.schema/transform-test]
  "Insert the TransformTests `rows`, returning the inserted tests, each row normalized and validated by the column
  transforms of the model."
  [rows :- [:sequential ::data-testing.schema/transform-test.create]]
  (create-saved-tests! :model/TransformTest rows))

(mu/defn update-transform-tests! :- :nil
  "Apply the changes in each of `rows`, the id of a TransformTest and the columns to change, which the column
  transforms of the model normalize and validate, publishing one update event for all."
  ([rows :- [:sequential ::data-testing.schema/transform-test.update]]
   (update-transform-tests! rows nil))
  ([rows :- [:sequential ::data-testing.schema/transform-test.update]
    opts :- :metabase.events.schema/write-opts]
   (update-saved-tests! :model/TransformTest rows opts)))

(mu/defn delete-transform-tests! :- :nil
  "Delete the TransformTests with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (delete-saved-tests! :transform :model/TransformTest ids))

(defenterprise delete-transform-tests-for-transforms!
  "Deletes the tests of the transforms with `transform-ids` whatever the token says,
  since the rows outlive the feature."
  :feature :none
  [transform-ids]
  (delete-transform-tests! (data-testing.db/saved-test-ids-of-subjects :model/TransformTest :transform_id (vec transform-ids))))

(defmethod data-testing.test-type/spec :transform [_test-type]
  {:model      :model/TransformTest
   :run-topics {:start   :event/transform-test-run-start
                :timeout :event/transform-test-run-timeout}
   :subject    #(data-testing.db/transform (:transform_id %))
   :can-run?   #(can-run-test? (:transform_id %))})

;;; -------------------------------------------------- Revisions ---------------------------------------------------

(def ^:private revision-columns
  [:transform_id :name :description :now :inputs :expectations])

(defn check-revert-available
  "Throw a 402 unless the token has the premium feature that a revert of a saved test needs."
  []
  (premium-features/assert-has-feature :transforms-testing (tru "Transforms Testing")))

(defn validates-edit?
  "Whether an edit that sets the keys `edited-keys` of a saved test, whose subject `subject-key` names, is checked as
  a new test would be: it sets the subject, or one of the [[data-testing.runner/definition-keys]]."
  [subject-key edited-keys]
  (boolean (some (set (cons subject-key data-testing.runner/definition-keys)) edited-keys)))

(defn- comparable
  "`v` as compared for a revert: a moment as its instant, since the app DB can read back another offset."
  [v]
  (cond-> v
    (instance? java.time.OffsetDateTime v) t/instant))

(defn reverted-keys
  "The keys of `snapshot` whose values a revert of the saved test `current` to `snapshot` changes."
  [current snapshot]
  (into []
        (remove #(= (comparable (get current %)) (comparable (get snapshot %))))
        (keys snapshot)))

(defn- revert-transform-test!
  [id _user-id snapshot]
  (update-transform-tests! [(assoc snapshot :id id)] {:writer :revert}))

(defn- check-revert
  "Returns `snapshot`, after refusing it as an edit to the same state would be refused."
  [id _user-id snapshot]
  (check-revert-available)
  (when (validates-edit? :transform_id (reverted-keys (data-testing.db/transform-test id) snapshot))
    (data-testing.errors/refusing
     "transform-test"
     #(data-testing.runner/validate-test :transform
                                         (data-testing.db/transform (:transform_id snapshot))
                                         (data-testing.runner/test-definition snapshot))))
  snapshot)

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defmethod app-db-copy/spec :model/TransformTest [_model]
  {:skip? false})

(defmethod serialization/spec :model/TransformTest [_]
  {:schema              ::data-testing.schema/external-transform-test
   :insert!             create-transform-tests!
   :update!             #(update-transform-tests! % {:writer :import})
   :delete!             delete-transform-tests!
   :copy                [:entity_id :name :description :inputs :expectations]
   :transform           {:transform_id (serialization/fk-transform :model/Transform)
                         :creator_id   serialization/user-transform
                         :now          now-transform}
   :storage-paths       data-testing.serialization/transform-test-storage-paths
   :import-dependencies data-testing.serialization/transform-test-import-dependencies})

(defmethod remote-sync/spec :model/TransformTest
  [_model]
  {:synced-items         data-testing.db/synced-transform-test-items
   :synced-filter-clause data-testing.db/synced-transform-tests-clause})

(defmethod revisions/spec :model/TransformTest [_model]
  {:track         revision-columns
   :skip          [:creator_id :entity_id]
   :schema        ::data-testing.schema/transform-test.revision
   :authorize     :snapshot
   :before-revert check-revert
   :revert!       revert-transform-test!})

(defmethod audit/spec :model/TransformTest [_model]
  {:track          [:transform_id :name :description :now]
   :track-redacted [:creator_id :expectations :inputs]
   :skip           [:entity_id]})
