(ns metabase-enterprise.data-testing.models
  (:require
   [java-time.api :as t]
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
   [metabase.util.malli.registry :as mr]
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

(mu/defn json-column :- [:map {:closed true} [:in fn?] [:out fn?]]
  "A Toucan transform storing a value of `schema` as JSON, normalized and validated on its way in and normalized on its
  way out."
  [schema :- :keyword]
  {:in  (comp mi/json-in #(mu/validate-throw schema %) #(lib/normalize schema %))
   :out (comp #(lib/normalize schema %) mi/json-out-with-keywordization)})

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
   :inputs       (json-column ::data-testing.schema/inputs)
   :expectations (json-column ::data-testing.schema/expectations)})

;;; ------------------------------------------------- Saved tests --------------------------------------------------

(mr/def ::saved-test-spec
  "What the methods shared by every saved-test model need to know about one model: its test type, how a test reaches
  its subject, who may save a test, and its remote-sync rule."
  [:map {:closed true}
   [:test-type
    {:description "The test type its runs record."}
    ::data-testing.schema/test-type]
   [:subject-key
    {:description "The column that holds the subject's id."}
    :keyword]
   [:subjects
    {:description "A function from subject ids to the subjects that exist."}
    ifn?]
   [:can-save?
    {:description "A function from a subject id to whether the current user may save or delete a test of that subject."}
    ifn?]
   [:remote-sync-guard?
    {:optional    true
     :description (str "True when, on a read-only remote-sync instance, the test's `:can_write` is false for every "
                       "user and no update may change a column that remote sync exports, whatever the subject allows. "
                       "Creating a test is left to `:can-save?`.")}
    :boolean]])

(defmulti saved-test-spec
  "The `::saved-test-spec` of the saved-test `model`. The methods that every saved-test model shares (hydration and
  permissions) read it."
  {:arglists '([model])}
  keyword)

;;; -------------------------------------------------- Hydration ---------------------------------------------------

(defn- with-last-runs
  "`tests`, saved tests of `test-type`, each with its newest run, or nil, under `:last_run`."
  [test-type tests]
  (if-not (seq tests)
    tests
    (let [id->run (into {}
                        (map (juxt :test_id identity))
                        (data-testing.db/latest-test-runs test-type (into #{} (map :id) tests)))]
      (for [saved-test tests]
        (assoc saved-test :last_run (get id->run (:id saved-test)))))))

(methodical/defmethod t2/batched-hydrate [::saved-test :last_run]
  "Add the newest run, or nil, to each saved test."
  [model _k saved-tests]
  (with-last-runs (:test-type (saved-test-spec model)) saved-tests))

(methodical/defmethod t2/batched-hydrate [::saved-test :can_read]
  "Add whether the current user can read each saved test, as `:can_read` in its metadata: they can when they read its
  subject, loaded with the other subjects at once. Nobody can read a test whose subject has been deleted."
  [model k saved-tests]
  (let [{:keys [subject-key subjects]} (saved-test-spec model)
        id->subject                    (u/index-by :id (t2/hydrate (subjects (into []
                                                                                   (comp (keep subject-key) (distinct))
                                                                                   saved-tests))
                                                                   :can_read))]
    (for [saved-test saved-tests]
      (when saved-test
        (vary-meta saved-test assoc k (boolean (some-> (get id->subject (subject-key saved-test)) mi/can-read?)))))))

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

(mu/defn- can-save? :- :boolean
  "Whether the current user may save or delete a test of the Transform `transform-id`: they may write the transform, and
  run the native SQL of a test against its source Database."
  [transform-id :- ::lib.schema.id/transform]
  (let [transform (data-testing.db/transform transform-id)]
    (boolean
     (and transform
          (mi/can-write? (t2/hydrate transform :can_write))
          (or (mi/superuser?)
              (some-> (transforms-base.i/source-db-id transform) can-run-native-query?))))))

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

(defn- remote-sync-refuses-writes?
  "Whether the remote-sync rule of the saved-test `model` refuses writes now."
  [model]
  (boolean (and (:remote-sync-guard? (saved-test-spec model)) (remote-sync/read-only?))))

(methodical/defmethod t2/batched-hydrate [::saved-test :can_write]
  "Add whether the current user can write each saved test, checking each subject once."
  [model k saved-tests]
  (let [{:keys [subject-key can-save?]} (saved-test-spec model)]
    (mi/instances-with-hydrated-data
     saved-tests k
     #(let [writable? (memoize (fn [subject-id]
                                 (and (not (remote-sync-refuses-writes? model))
                                      (some? subject-id)
                                      (can-save? subject-id))))]
        (into {}
              (map (fn [saved-test] [(:id saved-test) (boolean (writable? (subject-key saved-test)))]))
              (remove nil? saved-tests)))
     :id
     {:default false})))

(defmethod mi/can-create? ::saved-test
  [model instance]
  (let [{:keys [subject-key can-save?]} (saved-test-spec model)]
    (can-save? (subject-key instance))))

(defn- unsynced-change-writable?
  "Whether the current user can apply `changes` to `instance`, a saved test of `model`, when they touch no column that
  remote sync exports: a read-only instance refuses only those, under the remote-sync rule of `model`."
  [model instance changes]
  (let [{:keys [subject-key can-save?]} (saved-test-spec model)]
    (and (remote-sync-refuses-writes? model)
         (not (remote-sync/synced-changes? model instance changes))
         (can-save? (subject-key instance)))))

(defmethod mi/can-update? ::saved-test
  [instance changes]
  (let [model                           (t2/model instance)
        {:keys [subject-key can-save?]} (saved-test-spec model)]
    (and (or (mi/can-write? instance)
             (unsynced-change-writable? model instance changes))
         (can-save? (subject-key changes (subject-key instance))))))

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
  [:transform_id :name :description :now :inputs :expectations])

(defn check-revert-available
  "Throw a 402 unless the token has the premium feature that a revert of a saved test needs."
  []
  (premium-features/assert-has-feature :transforms-testing (tru "Transforms Testing")))

(defn- revert-transform-test!
  [id _user-id snapshot]
  (check-revert-available)
  ;; A revision written before tests had `now` has no `:now`; the test then read the real clock.
  (update-transform-test! id (merge {:now nil} (select-keys snapshot revision-columns))))

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defmethod saved-test-spec :model/TransformTest
  [_model]
  {:test-type          :transform
   :subject-key        :transform_id
   :subjects           data-testing.db/transforms
   :can-save?          can-save?
   :remote-sync-guard? true})

(defmethod events/spec :model/TransformTest
  [_model]
  {:create :event/transform-test-create
   :update :event/transform-test-update
   :delete :event/transform-test-delete})

(defmethod app-db-copy/spec :model/TransformTest [_model]
  {:skip? false})

(defmethod serialization/spec :model/TransformTest [_]
  {:schema              ::data-testing.schema/external-transform-test
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
  {:track     revision-columns
   :skip      [:creator_id :entity_id]
   :authorize :snapshot
   :revert!   revert-transform-test!})

(defmethod audit/spec :model/TransformTest [_model]
  {:track          [:transform_id :name :description :now]
   :track-redacted [:creator_id :expectations :inputs]
   :skip           [:entity_id]})
