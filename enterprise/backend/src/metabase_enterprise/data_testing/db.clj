(ns metabase-enterprise.data-testing.db
  "Application database queries for the data-testing module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [malli.util :as mut]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.test-type :as data-testing.test-type]
   [metabase.app-db.core :as app-db]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.run-tracking.core :as rt]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn synced-transform-tests-clause :- [:fn vector?]
  "The clause over the TransformTest table aliased `alias` selecting the tests of the transforms remote sync syncs."
  [alias :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  (remote-sync/synced-fk-clause alias :transform_id :model/Transform opts))

(mu/defn synced-card-tests-clause :- [:fn vector?]
  "The clause over the CardTest table aliased `alias` selecting the tests of the cards remote sync syncs."
  [alias :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  (remote-sync/synced-fk-clause alias :card_id :model/Card opts))

(mu/defn synced-segment-tests-clause :- [:fn vector?]
  "The clause over the SegmentTest table aliased `alias` selecting the tests of the segments remote sync syncs."
  [alias :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  (remote-sync/synced-fk-clause alias :segment_id :model/Segment opts))

(mu/defn transform-tests :- [:sequential ::data-testing.schema/transform-test]
  "The TransformTests in name order, only those of the Transform with `:transform-id` when it is given."
  [{:keys [transform-id]} :- [:map {:closed true}
                              [:transform-id {:optional true} [:maybe ::lib.schema.id/transform]]]]
  (t2/select :model/TransformTest (cond-> {:order-by [[:name :asc] [:id :asc]]}
                                    transform-id (assoc :where [:= :transform_id transform-id]))))

(mu/defn saved-tests :- [:sequential ::data-testing.schema/saved-test]
  "Every saved test of `model`."
  [model :- :keyword]
  (t2/select model))

(mu/defn saved-tests-where :- [:sequential ::data-testing.schema/saved-test]
  "The saved tests of `model` whose `column` is one of `values`."
  [model  :- :keyword
   column :- [:enum :id :entity_id]
   values :- [:sequential [:or ms/PositiveInt :string]]]
  (app-db/select-batched #(t2/select model column [:in %]) values))

(mu/defn test-suites :- [:sequential ::data-testing.schema/test-suite]
  "Every TestSuite, in name order."
  []
  (t2/select :model/TestSuite {:order-by [[:name :asc] [:id :asc]]}))

(mu/defn test-suite :- [:maybe ::data-testing.schema/test-suite]
  "The TestSuite with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/TestSuite :id id))

(mu/defn insert-test-suites! :- [:sequential ::data-testing.schema/test-suite]
  "Insert the TestSuite `suites` and return the inserted instances."
  [suites :- [:sequential {:min 1} ::data-testing.schema/test-suite.create]]
  (app-db/insert-returning-instances! :model/TestSuite suites))

(mu/defn test-suites-by-ids :- [:sequential ::data-testing.schema/test-suite]
  "The TestSuites with `ids`."
  [ids :- [:sequential {:min 1} ms/PositiveInt]]
  (app-db/select-batched #(t2/select :model/TestSuite :id [:in [:auto/param %]]) ids))

(mu/defn test-suites-for-update :- [:sequential ::data-testing.schema/test-suite]
  "The TestSuites with `ids`, their rows locked in the order of their ids until the transaction ends."
  [ids :- [:sequential {:min 1} ms/PositiveInt]]
  (app-db/select-batched #(t2/select :model/TestSuite :id [:in [:auto/param %]]
                                     {:order-by [[:id :asc]] :for :update})
                         (sort (distinct ids))))

(mu/defn update-test-suites!
  "Apply to the TestSuite rows their changes in `updates`, each the `:id` of a row and the columns to change."
  [updates :- [:sequential ::data-testing.schema/test-suite.update]]
  (app-db/update-grouped! :model/TestSuite updates))

(mu/defn touch-test-suites!
  "Set the update time of the TestSuites with `ids` to the database's current time."
  [ids :- [:sequential {:min 1} ms/PositiveInt]]
  (app-db/sum-batched app-db/update-partition-size #(t2/update! :model/TestSuite :id [:in [:auto/param %]] {:updated_at :%now}) ids))

(mu/defn delete-members-of-suites!
  "Delete the members of the TestSuites with `suite-ids`."
  [suite-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (app-db/sum-batched app-db/delete-partition-size #(t2/delete! :model/TestSuiteMember :suite_id [:in [:auto/param %]]) suite-ids))

(mu/defn insert-suite-members! :- [:sequential ::data-testing.schema/test-suite.member]
  "Insert the TestSuiteMember `rows` and return the inserted instances."
  [rows :- [:sequential {:min 1} ::data-testing.schema/test-suite-member.create]]
  (app-db/insert-returning-instances! :model/TestSuiteMember rows))

(mu/defn update-suite-members!
  "Apply `changes` to the TestSuiteMembers with `ids`."
  [ids     :- [:sequential {:min 1} ms/PositiveInt]
   changes :- (mut/dissoc ::data-testing.schema/test-suite-member.update :id)]
  (app-db/sum-batched app-db/update-partition-size #(t2/update! :model/TestSuiteMember :id [:in [:auto/param %]] changes) ids))

(mu/defn delete-suite-members!
  "Delete the TestSuiteMembers with `ids`."
  [ids :- [:sequential {:min 1} ms/PositiveInt]]
  (app-db/sum-batched app-db/delete-partition-size #(t2/delete! :model/TestSuiteMember :id [:in [:auto/param %]]) ids))

(mu/defn suite-members-of-tests :- [:sequential ::data-testing.schema/test-suite.member]
  "The members of the TestSuites that name the `test-type` tests with `entity-ids`."
  [test-type  :- ::data-testing.schema/test-type
   entity-ids :- [:sequential {:min 1} :string]]
  (app-db/select-batched #(t2/select :model/TestSuiteMember
                                     :test_type (name test-type)
                                     :test_entity_id [:in [:auto/param %]])
                         entity-ids))

(mu/defn suite-members :- [:sequential ::data-testing.schema/test-suite.member]
  "The members of the TestSuites with `suite-ids`, by suite and then position."
  [suite-ids :- [:sequential ms/PositiveInt]]
  (vec (sort-by (juxt :suite_id :position)
                (app-db/select-batched #(t2/select :model/TestSuiteMember
                                                   {:where    [:in :suite_id %]
                                                    :order-by [[:suite_id :asc] [:position :asc]]})
                                       suite-ids))))

(mu/defn insert-suite-run! :- ::data-testing.schema/test-suite-run
  "Insert a started TestSuiteRun of the suite `suite-id` and return it."
  [suite-id     :- ms/PositiveInt
   initiated-by :- [:maybe ::lib.schema.id/user]]
  (t2/insert-returning-instance! :model/TestSuiteRun {:suite_id     suite-id
                                                      :initiated_by initiated-by
                                                      :status       :started}))

(mu/defn finish-started-suite-run! :- :int
  "Set `status`, the end time, and `members` of the TestSuiteRun `run-id` if it is still started. Returns the number of
  rows updated."
  [run-id  :- ms/PositiveInt
   status  :- ::data-testing.schema/run-status
   members :- [:maybe ::data-testing.schema/test-suite-run.stored-members]]
  (t2/update! :model/TestSuiteRun
              :id run-id
              :status "started"
              (cond-> {:status status :end_time :%now}
                members (assoc :members members))))

(mu/defn add-members-to-ended-suite-run! :- :int
  "Set the `members` of the TestSuiteRun `run-id` if the run has ended. Returns the number of rows updated. The cluster
  reaper ends a run without its members; this sets them afterward."
  [run-id  :- ms/PositiveInt
   members :- ::data-testing.schema/test-suite-run.stored-members]
  (t2/update! :model/TestSuiteRun
              :id run-id
              :status [:not= "started"]
              {:members members}))

(mu/defn suite-runs :- [:sequential ::data-testing.schema/test-suite-run]
  "A page of the runs of the suite `suite-id`, newest first."
  [suite-id :- ms/PositiveInt
   limit    :- ms/PositiveInt
   offset   :- ms/IntGreaterThanOrEqualToZero]
  (t2/select :model/TestSuiteRun {:where    [:= :suite_id suite-id]
                                  :order-by [[:start_time :desc] [:id :desc]]
                                  :limit    limit
                                  :offset   offset}))

(mu/defn suite-run-count :- :int
  "The number of runs of the suite `suite-id`."
  [suite-id :- ms/PositiveInt]
  (t2/count :model/TestSuiteRun :suite_id suite-id))

(mu/defn transform-test :- [:maybe ::data-testing.schema/transform-test]
  "The TransformTest with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/TransformTest :id id))

(def ^:private saved-test-model
  "The models of the saved tests."
  [:enum :model/TransformTest :model/CardTest :model/SegmentTest])

(mu/defn saved-test-ids-of-subjects :- [:sequential ms/PositiveInt]
  "The ids of the tests of `model` whose `subject-column` holds one of `subject-ids`."
  [model          :- saved-test-model
   subject-column :- :keyword
   subject-ids    :- [:sequential ms/PositiveInt]]
  (app-db/select-batched #(t2/select-pks-vec model subject-column [:in [:auto/param %]]) subject-ids))

(mu/defn delete-suite-members-of-tests! :- :nil
  "Remove the `test-type` tests with `entity-ids` from every TestSuite."
  [test-type  :- ::data-testing.schema/test-type
   entity-ids :- [:sequential {:min 1} :string]]
  (doseq [batch (partition-all app-db/delete-partition-size entity-ids)]
    (t2/delete! :model/TestSuiteMember :test_type (name test-type) :test_entity_id [:in [:auto/param (vec batch)]]))
  nil)

(mu/defn clear-test-ids-of-runs! :- :nil
  "Set the test id of the runs of the `test-type` tests with `test-ids` to nil, so that no run names a test after it is
  deleted."
  [test-type :- ::data-testing.schema/test-type
   test-ids  :- [:sequential {:min 1} ms/PositiveInt]]
  (doseq [batch (partition-all app-db/update-partition-size test-ids)]
    (t2/update! :model/DataTestRun :test_type (name test-type) :test_id [:in [:auto/param (vec batch)]] {:test_id nil}))
  nil)

(mu/defn insert-test-run! :- ::data-testing.schema/data-test-run
  "Insert a started DataTestRun of the `test-type` test `test-id` and return it."
  [test-type    :- ::data-testing.schema/test-type
   test-id      :- ms/PositiveInt
   initiated-by :- [:maybe ::lib.schema.id/user]]
  (t2/insert-returning-instance! :model/DataTestRun
                                 {:test_type    test-type
                                  :test_id      test-id
                                  :initiated_by initiated-by
                                  :status       :started}))

(mu/defn- runs-of-tests-clause :- vector?
  "A clause that holds for a run of one of the `test-type` tests with `test-ids` that started no earlier than its test
  was created."
  [test-type :- ::data-testing.schema/test-type
   test-ids  :- [:set ms/PositiveInt]]
  (if (empty? test-ids)
    [:= [:inline 1] [:inline 0]]
    [:and
     [:= :data_test_run.test_type (name test-type)]
     [:in :data_test_run.test_id test-ids]
     ;; test_id has no foreign key, so a run can keep the id of a deleted test, and a later test can get the same id.
     ;; The start time tells the runs of the later test from those of the deleted one.
     [:exists ^:allow-subquery {:select [1]
                                :from   [[(t2/table-name (:model (data-testing.test-type/spec test-type))) :the_test]]
                                :where  [:and
                                         [:= :the_test.id :data_test_run.test_id]
                                         [:>= :data_test_run.start_time :the_test.created_at]]}]]))

(def ^:private RunFilters
  [:map {:closed true}
   [:test-type        ::data-testing.schema/test-type]
   [:test-ids         [:set ms/PositiveInt]]
   [:statuses         {:optional true} [:maybe [:sequential ::data-testing.schema/run-status]]]
   [:started-at-start {:optional true} [:maybe ms/TemporalInstant]]
   [:started-at-end   {:optional true} [:maybe ms/TemporalInstant]]
   [:ended-at-start   {:optional true} [:maybe ms/TemporalInstant]]
   [:ended-at-end     {:optional true} [:maybe ms/TemporalInstant]]])

(mu/defn- run-filter-clause :- vector?
  [{:keys [test-type test-ids statuses started-at-start started-at-end ended-at-start ended-at-end]} :- RunFilters]
  (cond-> [:and (runs-of-tests-clause test-type test-ids)]
    (seq statuses)   (conj [:in :status (map name statuses)])
    started-at-start (conj [:>= :start_time started-at-start])
    started-at-end   (conj [:< :start_time started-at-end])
    ended-at-start   (conj [:>= :end_time ended-at-start])
    ended-at-end     (conj [:< :end_time ended-at-end])))

(mu/defn test-runs :- [:sequential ::data-testing.schema/data-test-run]
  "A page of the DataTestRuns matching `filters`, newest first. Only the runs of the tests in `:test-ids` match, and
  only those that started no earlier than their test was created."
  [filters :- RunFilters
   limit   :- ms/PositiveInt
   offset  :- ms/IntGreaterThanOrEqualToZero]
  (->> (app-db/select-batched #(t2/select :model/DataTestRun
                                          {:where    (run-filter-clause (assoc filters :test-ids (set %)))
                                           :order-by [[:start_time :desc] [:id :desc]]
                                           :limit    (+ offset limit)})
                              (:test-ids filters))
       (sort-by (juxt :start_time :id) #(compare %2 %1))
       (drop offset)
       (into [] (take limit))))

(mu/defn test-run-count :- :int
  "The number of DataTestRuns matching `filters`."
  [filters :- RunFilters]
  (transduce (map #(t2/count :model/DataTestRun {:where (run-filter-clause (assoc filters :test-ids (set %)))}))
             +
             0
             (app-db/select-partitions (:test-ids filters))))

(mu/defn latest-test-runs :- [:sequential ::data-testing.schema/data-test-run]
  "The newest DataTestRun, by start time and then id, of each of the `test-type` tests with `test-ids`, among the runs
  that started no earlier than their test was created."
  [test-type :- ::data-testing.schema/test-type
   test-ids  :- [:set ms/PositiveInt]]
  (app-db/select-batched
   #(t2/select :model/DataTestRun
               {:where [:and
                        (runs-of-tests-clause test-type (set %))
                        ;; A newer run starts no earlier than this one, so it passes the start-time guard too.
                        [:not [:exists ^:allow-subquery {:select [1]
                                                         :from   [[:data_test_run :newer]]
                                                         :where  [:and
                                                                  [:= :newer.test_type :data_test_run.test_type]
                                                                  [:= :newer.test_id :data_test_run.test_id]
                                                                  [:or
                                                                   [:> :newer.start_time :data_test_run.start_time]
                                                                   [:and
                                                                    [:= :newer.start_time :data_test_run.start_time]
                                                                    [:> :newer.id :data_test_run.id]]]]}]]]})
   test-ids))

(mu/defn users-by-id
  "A map of User id to the id, email, and name of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (app-db/select-batched-map #(t2/select-pk->fn identity [:model/User :id :email :first_name :last_name]
                                                :id [:in %])
                             user-ids))

(mu/defn finish-started-test-run!
  "Set `status` and the end time of DataTestRun `run-id` if it is still started."
  [run-id :- ms/PositiveInt
   status :- ::data-testing.schema/run-status]
  (t2/update! :model/DataTestRun
              :id run-id
              :status "started"
              {:status status :end_time :%now}))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn cards-by-ids
  "The Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (app-db/select-batched #(t2/select :model/Card :id [:in %]) card-ids))

(mu/defn card-test :- [:maybe ::data-testing.schema/card-test]
  "The CardTest with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/CardTest :id id))

(defn- tests-of-subjects
  "The saved tests of `model` in name order, whose `subject-key` column holds the id of a row of `subject-model`: only
  those of the row `subject-id` when it is given, and those of an archived row only when `include-archived?`."
  [model subject-key subject-model subject-id include-archived?]
  (t2/select model {:where    (cond-> [:and]
                                subject-id
                                (conj [:= subject-key subject-id])

                                (not include-archived?)
                                (conj [:not-in subject-key ^:allow-subquery {:select [:id]
                                                                             :from   [(t2/table-name subject-model)]
                                                                             :where  [:= :archived true]}]))
                    :order-by [[:name :asc] [:id :asc]]}))

(mu/defn card-tests :- [:sequential ::data-testing.schema/card-test]
  "The CardTests in name order: only those of the Card with `:card-id` when it is given, and those of archived Cards
  only when `:include-archived?`."
  [{:keys [card-id include-archived?]} :- [:map {:closed true}
                                           [:card-id           {:optional true} [:maybe ::lib.schema.id/card]]
                                           [:include-archived? {:optional true} [:maybe :boolean]]]]
  (tests-of-subjects :model/CardTest :card_id :model/Card card-id include-archived?))

(mu/defn segment
  "The Segment with `segment-id`, or nil."
  [segment-id :- ::lib.schema.id/segment]
  (t2/select-one :model/Segment :id segment-id))

(mu/defn segments-by-ids
  "The Segments with `segment-ids`."
  [segment-ids :- [:sequential ::lib.schema.id/segment]]
  (app-db/select-batched #(t2/select :model/Segment :id [:in %]) segment-ids))

(mu/defn segment-test :- [:maybe ::data-testing.schema/segment-test]
  "The SegmentTest with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/SegmentTest :id id))

(mu/defn segment-tests :- [:sequential ::data-testing.schema/segment-test]
  "The SegmentTests in name order: only those of the Segment with `:segment-id` when it is given, and those of archived
  Segments only when `:include-archived?`."
  [{:keys [segment-id include-archived?]} :- [:map {:closed true}
                                              [:segment-id        {:optional true} [:maybe ::lib.schema.id/segment]]
                                              [:include-archived? {:optional true} [:maybe :boolean]]]]
  (tests-of-subjects :model/SegmentTest :segment_id :model/Segment segment-id include-archived?))

(mu/defn transform
  "The Transform with `transform-id`, or nil."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select-one :model/Transform :id transform-id))

(mu/defn transforms
  "The Transforms with `transform-ids`."
  [transform-ids :- [:sequential ::lib.schema.id/transform]]
  (app-db/select-batched #(t2/select :model/Transform :id [:in %]) transform-ids))

(mu/defn database-exists?
  "Whether a Database with `database-id` exists."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Database :id database-id))

(mu/defn active-table-exists?
  "Whether a Table with `table-id` exists and is active. Sync marks a Table inactive when its table is dropped."
  [table-id :- ::lib.schema.id/table]
  (t2/exists? :model/Table :id table-id :active true))

(mu/defn transform-test-by-entity-id :- [:maybe ::data-testing.schema/transform-test]
  "The TransformTest with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one :model/TransformTest :entity_id entity-id))

(mu/defn synced-transform-test-items :- [:sequential ::data-testing.schema/transform-test]
  "The TransformTests with `ids`, with their Transform and its Collection and ancestors, as remote sync lists them."
  [ids :- [:sequential pos-int?]]
  (let [root (collection.root/hydrated-root-collection :transforms)]
    (-> (app-db/select-batched #(t2/select [:model/TransformTest :id :name :transform_id] :id [:in %]) ids)
        (t2/hydrate [:transform [:collection :effective_ancestors]])
        (->> (mapv (fn [row] (update row :transform #(some-> % (update :collection (fn [collection] (or collection root)))))))))))

(mu/defn synced-test-suite-items :- [:sequential ::data-testing.schema/test-suite.synced-item]
  "The TestSuites with `ids`, as remote sync lists them."
  [ids :- [:sequential pos-int?]]
  (app-db/select-batched #(t2/select [:model/TestSuite :id :name] :id [:in %]) ids))

(mu/defn synced-card-test-items :- [:sequential ::data-testing.schema/card-test]
  "The CardTests with `ids`, with their Card and its Collection and ancestors, as remote sync lists them."
  [ids :- [:sequential pos-int?]]
  (let [root (collection.root/hydrated-root-collection)]
    (-> (app-db/select-batched #(t2/select [:model/CardTest :id :name :card_id] :id [:in %]) ids)
        (t2/hydrate [:card [:collection :effective_ancestors]])
        (->> (mapv (fn [row] (update row :card #(some-> % (update :collection (fn [collection] (or collection root)))))))))))

(mu/defn synced-segment-test-items :- [:sequential ::data-testing.schema/segment-test]
  "The SegmentTests with `ids`, with their Segment, its Table, and the Table's Collection and ancestors, as remote sync
  lists them."
  [ids :- [:sequential pos-int?]]
  (let [root (collection.root/hydrated-root-collection)]
    (-> (app-db/select-batched #(t2/select [:model/SegmentTest :id :name :segment_id] :id [:in %]) ids)
        (t2/hydrate [:segment [:table [:collection :effective_ancestors]]])
        (->> (mapv (fn [row]
                     (update row :segment
                             (fn [segment]
                               (some-> segment
                                       (update :table #(some-> % (update :collection (fn [collection] (or collection root))))))))))))))

(def ^:private run-model
  "A model of the runs of this module whose rows the run tracking heartbeats and reaps."
  [:enum :model/DataTestRun :model/TestSuiteRun])

(mu/defn heartbeat-started-runs!
  "Set `last_heartbeat` to now on the started `model` runs with `run-ids`, returning the number updated."
  [model   :- run-model
   run-ids :- [:sequential ms/PositiveInt]]
  (t2/query (rt/heartbeat-statement model [:status "started"] :last_heartbeat run-ids)))

(mu/defn set-started-runs-terminal!
  "Apply the `terminal` column values to the started `model` runs with `run-ids`, returning the number updated."
  [model    :- run-model
   run-ids  :- [:sequential ms/PositiveInt]
   terminal :- [:map {:closed true}
                [:status    {:optional true} [:maybe [:or :string :keyword]]]
                [:end_time  {:optional true} [:maybe [:or :string :keyword]]]
                [:ended_at  {:optional true} [:maybe [:or :string :keyword]]]
                [:is_active {:optional true} [:maybe :boolean]]
                [:message   {:optional true} [:maybe :string]]]]
  [(app-db/sum-batched app-db/update-partition-size #(first (t2/query (rt/terminal-statement model [:status "started"] % terminal))) run-ids)])
