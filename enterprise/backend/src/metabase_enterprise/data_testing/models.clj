(ns metabase-enterprise.data-testing.models
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.audit-app.core :as audit-app]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.query-permissions.core :as query-perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.models.revision :as revision]
   [metabase.serialization.core :as serialization]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TransformTest [_model] :transform_test)

;; `::saved-test` is the parent of every saved test model, for the methods they share.
(doto :model/TransformTest
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?)
  (derive ::saved-test))

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

(defmethod audit-app/model-details :model/TransformTest
  [transform-test _event-type]
  (select-keys transform-test [:transform_id :name :description]))

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
   [:subject
    {:description "A function from a subject id to the subject, or nil when no subject has that id."}
    ifn?]
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
  "The `::saved-test-spec` of the saved-test `model`. The methods that every saved-test model shares (hydration,
  permissions, revisions, hooks) read it."
  {:arglists '([model])}
  keyword)

(defn- event-topic
  "The topic of the `action` (\"create\", \"update\" or \"delete\") event of a test of `test-type`."
  [test-type action]
  (keyword "event" (str (name test-type) "-test-" action)))

(methodical/defmethod t2/batched-hydrate [::saved-test :last_run]
  "Add the newest run, or nil, to each saved test."
  [model _k saved-tests]
  (with-last-runs (:test-type (saved-test-spec model)) saved-tests))

(methodical/defmethod t2/simple-hydrate [::saved-test :can_read]
  [model k instance]
  (let [{:keys [subject subject-key]} (saved-test-spec model)]
    (vary-meta instance assoc k (boolean (some-> (subject (subject-key instance)) (t2/hydrate :can_read) mi/can-read?)))))

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

(defmethod mi/can-update? ::saved-test
  [instance changes]
  (let [model                         (t2/model instance)
        {:keys [subject-key can-save?]} (saved-test-spec model)]
    (and (can-save? (subject-key instance))
         (can-save? (subject-key changes (subject-key instance)))
         (or (not (remote-sync-refuses-writes? model))
             (not (remote-sync/synced-changes? model instance changes))))))

(defmethod revision/revisions-readable? ::saved-test
  [model objects]
  ;; An older revision can name a subject that has since been deleted; nobody may read a revision about it.
  (let [{:keys [subjects subject-key]} (saved-test-spec model)
        readable-ids (into #{}
                           (comp (filter mi/can-read?) (map :id))
                           (t2/hydrate (subjects (into [] (comp (keep subject-key) (distinct)) objects)) :can_read))]
    (mapv #(contains? readable-ids (subject-key %)) objects)))

(t2/define-after-insert ::saved-test [saved-test]
  (when-not mi/*deserializing?*
    (let [model (t2/model saved-test)]
      (events/publish-event! (event-topic (:test-type (saved-test-spec model)) "create")
                             {:object  (t2/instance model saved-test)
                              :user-id (:creator_id saved-test)})))
  saved-test)

(t2/define-after-update ::saved-test [saved-test]
  (when-not mi/*deserializing?*
    (let [model (t2/model saved-test)]
      (events/publish-event! (event-topic (:test-type (saved-test-spec model)) "update")
                             {:object (t2/instance model saved-test)})))
  saved-test)

(t2/define-before-delete ::saved-test [saved-test]
  ;; No foreign key keeps a run's test id valid, so the hook sets the test id of the test's runs to null, in the
  ;; delete's transaction. Toucan 2 has no after-delete hook. A delete that skips this hook leaves the runs' test id
  ;; naming no test: a test that goes by database cascade, with a Dashboard or Document and its cards, or a Table and
  ;; its segments, or a Database delete, which deletes cards by raw SQL. Such runs are never listed or shown as
  ;; `last_run`.
  (let [test-type (:test-type (saved-test-spec (t2/model saved-test)))]
    (data-testing.db/clear-test-id-of-runs! test-type (:id saved-test))
    (when-not mi/*deserializing?*
      (events/publish-event! (event-topic test-type "delete") {:object saved-test})))
  saved-test)

(defmethod saved-test-spec :model/TransformTest
  [_model]
  {:test-type          :transform
   :subject-key        :transform_id
   :subject            data-testing.db/transform
   :subjects           data-testing.db/transforms
   :can-save?          can-save?
   :remote-sync-guard? true})

;;; -------------------------------------------------- Revisions ---------------------------------------------------

(def ^:private revision-columns
  [:transform_id :name :description :inputs :expectations])

(defmethod revision/serialize-instance :model/TransformTest
  [_model _id transform-test]
  (select-keys transform-test revision-columns))

(defmethod revision/check-revert-available ::saved-test
  [_model]
  (premium-features/assert-has-feature :transforms-testing (tru "Transforms Testing")))

(defmethod revision/revert-to-revision! :model/TransformTest
  [_model id _user-id serialized-instance]
  (data-testing.db/update-transform-test! id (select-keys serialized-instance revision-columns)))

;;; ---------------------------------------------------- Events ----------------------------------------------------

(defenterprise delete-transform-tests!
  "Enterprise implementation: delete the tests of the transform `transform-id`, each through its own hook. Runs
  whatever the token says, since the rows outlive the feature. See the OSS declaration in
  `metabase.transforms.models.transform`."
  :feature :none
  [transform-id]
  (data-testing.db/delete-transform-tests! transform-id))

;;; ------------------------------------------------- Serialization ------------------------------------------------

(defmethod serialization/spec :model/TransformTest [_]
  {:schema    ::data-testing.schema/external-transform-test
   :copy      [:entity_id :name :description :inputs :expectations]
   :transform {:transform_id (serialization/fk-transform :model/Transform)
               :creator_id   serialization/user-transform}})

(defn subject-storage-paths
  "The storage path of each of `tests`, saved tests whose `subject-key` holds the entity id of a row of
  `subject-model`: the path of the subject's file, as a directory, then the test's name. `fk-models` maps each column of
  the subject that the subject's storage path reads to the model the column references."
  [tests subject-model subject-key fk-models]
  (let [rows     (vals (serialization/rows-by-refs subject-model
                                                   (into #{} (keep subject-key) tests)
                                                   (into [:entity_id :name] (keys fk-models))))
        fk-refs  (into {}
                       (map (fn [[k model]]
                              [k (zipmap (map :entity_id rows)
                                         (serialization/column-refs serialization/app-db-store model (map k rows)))]))
                       fk-models)
        subjects (into {}
                       (map (fn [{eid :entity_id subject-name :name}]
                              [eid (into {:serdes/meta [{:model (name subject-model)}]
                                          :name        subject-name
                                          :entity_id   eid}
                                         (map (fn [[k refs]] [k (get refs eid)]))
                                         fk-refs)]))
                       rows)
        paths    (serialization/batch-storage-paths (mapv #(get subjects (subject-key %)) tests))]
    (mapv (fn [saved-test path]
            (conj path {:label (:name saved-test) :key (:entity_id saved-test)}))
          tests paths)))

(defmethod serialization/storage-paths :model/TransformTest [_ entities _ctx]
  (subject-storage-paths entities :model/Transform :transform_id {:collection_id :model/Collection}))

(defmethod serialization/import-dependencies :model/TransformTest [_ entities]
  (mapv (fn [{:keys [transform_id]}]
          #{[:model/Transform transform_id]})
        entities))

(defmethod remote-sync/spec :model/TransformTest
  [_model]
  {:synced-items         data-testing.db/synced-transform-test-items
   :synced-filter-clause data-testing.db/synced-transform-tests-clause})
