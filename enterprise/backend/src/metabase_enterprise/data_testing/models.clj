(ns metabase-enterprise.data-testing.models
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.serialization :as data-testing.serialization]
   [metabase.app-db.copy-spec :as app-db-copy]
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
  (derive :hook/events)
  (derive ::saved-test))

(defmethod events/spec :model/TransformTest
  [_model]
  {:create :event/transform-test-create
   :update :event/transform-test-update
   :delete :event/transform-test-delete})

(defmethod audit/spec :model/TransformTest [_model]
  {:track          [:transform_id :name :description]
   :track-redacted [:creator_id :expectations :inputs]
   :skip           [:entity_id]})

(defmethod app-db-copy/spec :model/TransformTest [_model]
  {:skip? false})

(mu/defn json-column :- [:map {:closed true} [:in fn?] [:out fn?]]
  "A Toucan transform storing a value of `schema` as JSON, normalized and validated on its way in and normalized on its
  way out."
  [schema :- :keyword]
  {:in  (comp mi/json-in #(mu/validate-throw schema %) #(lib/normalize schema %))
   :out (comp #(lib/normalize schema %) mi/json-out-with-keywordization)})

(methodical/defmethod t2/model-for-automagic-hydration [:model/TransformTest :transform]
  [_original-model _k]
  :model/Transform)

(t2/deftransforms :model/TransformTest
  {:inputs       (json-column ::data-testing.schema/inputs)
   :expectations (json-column ::data-testing.schema/expectations)})

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

;;; ---------------------------------------------------- Hooks -----------------------------------------------------

(t2/define-before-delete :model/TransformTest [transform-test]
  (data-testing.db/clear-test-id-of-runs! :transform (:id transform-test))
  transform-test)

;;; ------------------------------------------------- Permissions --------------------------------------------------

(defn can-run-native-query?
  "Whether the current user may run native SQL against the Database with `db-id`, as the input and expectation SQL of a
  test does."
  [db-id]
  (query-perms/can-run-query? (lib/native-query (lib-be/application-database-metadata-provider db-id) "SELECT 1")))

(defn query-subject-allows?
  "Whether `subject-check` holds for `subject`, a card or a segment, hydrated with `k`, and the current user may run
  `query`, the subject's query, and write the native SQL of a test against the Database of `query`. False when
  `subject` is nil."
  [subject-check k subject query]
  (boolean
   (when subject
     (and (subject-check (t2/hydrate subject k))
          ;; A run compiles the query with the cards, snippets and segments it includes, and a run's errors can quote
          ;; their SQL, so the user must be allowed to run the query, not only to read the subject.
          (query-perms/can-run-query? query)
          (or (mi/superuser?)
              (some-> (not-empty query) lib/database-id can-run-native-query?))))))

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

(mu/defn create-transform-test! :- ::data-testing.schema/transform-test
  "Insert the TransformTest `transform-test` returning the inserted test."
  [transform-test :- [:merge
                      ::data-testing.schema/transform-test.create
                      [:map {:closed true}
                       [:creator_id ::lib.schema.id/user]]]]
  (data-testing.db/insert-transform-test! transform-test))

(mu/defn update-transform-test! :- :nil
  "Apply `changes` to the TransformTest with `id`."
  [id      :- ms/PositiveInt
   changes :- ::data-testing.schema/transform-test.update]
  (data-testing.db/update-transform-test! id changes)
  nil)

(mu/defn delete-transform-test! :- :nil
  "Delete the TransformTest with `id`."
  [id :- ms/PositiveInt]
  (data-testing.db/delete-transform-test! id)
  nil)

(defenterprise delete-transform-tests!
  "Deletes the tests of the transform `transform-id` whatever the token says,
  since the rows outlive the feature."
  :feature :none
  [transform-id]
  (data-testing.db/delete-transform-tests! transform-id))

;;; -------------------------------------------------- Revisions ---------------------------------------------------

(def ^:private revision-columns
  [:transform_id :name :description :inputs :expectations])

(defn check-revert-available
  "Throw a 402 unless the token has the premium feature that a revert of a saved test needs."
  []
  (premium-features/assert-has-feature :transforms-testing (tru "Transforms Testing")))

(defn- revert-transform-test!
  [id _user-id snapshot]
  (check-revert-available)
  (update-transform-test! id (select-keys snapshot revision-columns)))

(defmethod revisions/spec :model/TransformTest [_model]
  {:track     revision-columns
   :skip      [:creator_id :entity_id]
   :authorize :snapshot
   :revert!   revert-transform-test!})

;;; ------------------------------------------------- Serialization ------------------------------------------------

(defmethod serialization/spec :model/TransformTest [_]
  {:schema              ::data-testing.schema/external-transform-test
   :copy                [:entity_id :name :description :inputs :expectations]
   :transform           {:transform_id (serialization/fk-transform :model/Transform)
                         :creator_id   serialization/user-transform}
   :storage-paths       data-testing.serialization/transform-test-storage-paths
   :import-dependencies data-testing.serialization/transform-test-import-dependencies})

(defmethod remote-sync/spec :model/TransformTest
  [_model]
  {:synced-items         data-testing.db/synced-transform-test-items
   :synced-filter-clause data-testing.db/synced-transform-tests-clause})
