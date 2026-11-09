(ns metabase-enterprise.data-testing.db
  "Application database queries for the data-testing module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn synced-transform-tests-clause :- [:fn vector?]
  "The clause over the TransformTest table aliased `alias` selecting the tests of the transforms remote sync syncs."
  [alias :- :keyword]
  (remote-sync/synced-fk-clause alias :transform_id :model/Transform))

(mu/defn transform-tests :- [:sequential ::data-testing.schema/transform-test]
  "The TransformTests in name order, only those of the Transform with `:transform-id` when it is given."
  [{:keys [transform-id]} :- [:map {:closed true}
                              [:transform-id {:optional true} [:maybe ::lib.schema.id/transform]]]]
  (t2/select :model/TransformTest (cond-> {:order-by [[:name :asc] [:id :asc]]}
                                    transform-id (assoc :where [:= :transform_id transform-id]))))

(mu/defn transform-test :- [:maybe ::data-testing.schema/transform-test]
  "The TransformTest with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/TransformTest :id id))

(mu/defn insert-transform-test! :- ::data-testing.schema/transform-test
  "Insert the TransformTest `transform-test` and return the inserted instance."
  [transform-test :- [:merge
                      ::data-testing.schema/transform-test.create
                      [:map {:closed true}
                       [:creator_id ::lib.schema.id/user]]]]
  (t2/insert-returning-instance! :model/TransformTest transform-test))

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

(def ^:private test-type->table
  {:transform :transform_test
   :card      :card_test})

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
                                :from   [[(test-type->table test-type) :the_test]]
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
  (t2/select :model/DataTestRun {:where    (run-filter-clause filters)
                                 :order-by [[:start_time :desc] [:id :desc]]
                                 :limit    limit
                                 :offset   offset}))

(mu/defn test-run-count :- :int
  "The number of DataTestRuns matching `filters`."
  [filters :- RunFilters]
  (t2/count :model/DataTestRun {:where (run-filter-clause filters)}))

(mu/defn latest-test-runs :- [:sequential ::data-testing.schema/data-test-run]
  "The newest DataTestRun, by start time and then id, of each of the `test-type` tests with `test-ids`, among the runs
  that started no earlier than their test was created."
  [test-type :- ::data-testing.schema/test-type
   test-ids  :- [:set ms/PositiveInt]]
  (t2/select :model/DataTestRun
             {:where [:and
                      (runs-of-tests-clause test-type test-ids)
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
                                                                  [:> :newer.id :data_test_run.id]]]]}]]]}))

(mu/defn clear-test-id-of-runs!
  "Set the test id of the runs of the `test-type` test `test-id` to nil, so that no run names the test after it is
  deleted."
  [test-type :- ::data-testing.schema/test-type
   test-id   :- ms/PositiveInt]
  (t2/update! :model/DataTestRun :test_type (name test-type) :test_id test-id {:test_id nil}))

(mu/defn users-by-id
  "A map of User id to the id, email, and name of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(mu/defn finish-started-test-run!
  "Set `status` and the end time of DataTestRun `run-id` if it is still started."
  [run-id :- ms/PositiveInt
   status :- ::data-testing.schema/run-status]
  (t2/update! :model/DataTestRun
              :id run-id
              :status "started"
              {:status status :end_time :%now}))

(mu/defn update-transform-test!
  "Apply `updates` to the TransformTest with `id`."
  [id :- ms/PositiveInt
   updates :- ::data-testing.schema/transform-test.update]
  (t2/update! :model/TransformTest :id id updates))

(mu/defn delete-transform-test!
  "Delete the TransformTest with `id`."
  [id :- ms/PositiveInt]
  (t2/delete! :model/TransformTest :id id))

(mu/defn delete-transform-tests!
  "Delete the TransformTests of the Transform with `transform-id`."
  [transform-id :- ::lib.schema.id/transform]
  (t2/delete! :model/TransformTest :transform_id transform-id))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn card-test :- [:maybe ::data-testing.schema/card-test]
  "The CardTest with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/CardTest :id id))

(mu/defn card-tests :- [:sequential ::data-testing.schema/card-test]
  "The CardTests in name order, only those of the Card with `:card-id` when it is given."
  [{:keys [card-id]} :- [:map {:closed true}
                         [:card-id {:optional true} [:maybe ::lib.schema.id/card]]]]
  (t2/select :model/CardTest (cond-> {:order-by [[:name :asc] [:id :asc]]}
                               card-id (assoc :where [:= :card_id card-id]))))

(mu/defn insert-card-test! :- ::data-testing.schema/card-test
  "Insert the CardTest `card-test` and return the inserted instance."
  [card-test :- [:merge
                 ::data-testing.schema/card-test.create
                 [:map {:closed true}
                  [:creator_id ::lib.schema.id/user]]]]
  (t2/insert-returning-instance! :model/CardTest card-test))

(mu/defn update-card-test!
  "Apply `updates` to the CardTest with `id`."
  [id      :- ms/PositiveInt
   updates :- ::data-testing.schema/card-test.update]
  (t2/update! :model/CardTest :id id updates))

(mu/defn delete-card-test!
  "Delete the CardTest with `id`."
  [id :- ms/PositiveInt]
  (t2/delete! :model/CardTest :id id))

(mu/defn transform
  "The Transform with `transform-id`, or nil."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select-one :model/Transform :id transform-id))

(mu/defn transforms
  "The Transforms with `transform-ids`."
  [transform-ids :- [:sequential ::lib.schema.id/transform]]
  (if (seq transform-ids)
    (t2/select :model/Transform :id [:in transform-ids])
    []))

(mu/defn database-exists?
  "Whether a Database with `database-id` exists."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Database :id database-id))

(mu/defn transform-test-by-entity-id :- [:maybe ::data-testing.schema/transform-test]
  "The TransformTest with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one :model/TransformTest :entity_id entity-id))

(mu/defn transforms-by-entity-ids
  "The entity id, name, and Collection id of the Transforms with `eids`."
  [eids :- [:sequential :string]]
  (when (seq eids)
    (t2/select [:model/Transform :entity_id :name :collection_id] :entity_id [:in [:auto/param eids]])))
