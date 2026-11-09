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

(mu/defn insert-transform-test-run! :- ::data-testing.schema/transform-test-run
  "Insert a started TransformTestRun for `transform-test-id` and return it."
  [transform-test-id :- ms/PositiveInt
   initiated-by      :- [:maybe ::lib.schema.id/user]]
  (t2/insert-returning-instance! :model/TransformTestRun
                                 {:transform_test_id transform-test-id
                                  :initiated_by      initiated-by
                                  :status            :started}))

(def ^:private RunFilters
  [:map {:closed true}
   [:transform-test-id ms/PositiveInt]
   [:statuses          {:optional true} [:maybe [:sequential ::data-testing.schema/run-status]]]
   [:started-at-start  {:optional true} [:maybe ms/TemporalInstant]]
   [:started-at-end    {:optional true} [:maybe ms/TemporalInstant]]
   [:ended-at-start    {:optional true} [:maybe ms/TemporalInstant]]
   [:ended-at-end      {:optional true} [:maybe ms/TemporalInstant]]])

(mu/defn- run-filter-clause :- vector?
  [{:keys [transform-test-id statuses started-at-start started-at-end ended-at-start ended-at-end]} :- RunFilters]
  (cond-> [:and [:= :transform_test_id transform-test-id]]
    (seq statuses)   (conj [:in :status (map name statuses)])
    started-at-start (conj [:>= :start_time started-at-start])
    started-at-end   (conj [:< :start_time started-at-end])
    ended-at-start   (conj [:>= :end_time ended-at-start])
    ended-at-end     (conj [:< :end_time ended-at-end])))

(mu/defn transform-test-runs :- [:sequential ::data-testing.schema/transform-test-run]
  "A page of the TransformTestRuns matching `filters`, newest first."
  [filters :- RunFilters
   limit   :- ms/PositiveInt
   offset  :- ms/IntGreaterThanOrEqualToZero]
  (t2/select :model/TransformTestRun {:where    (run-filter-clause filters)
                                      :order-by [[:start_time :desc] [:id :desc]]
                                      :limit    limit
                                      :offset   offset}))

(mu/defn transform-test-run-count :- :int
  "The number of TransformTestRuns matching `filters`."
  [filters :- RunFilters]
  (t2/count :model/TransformTestRun {:where (run-filter-clause filters)}))

(mu/defn latest-transform-test-runs :- [:sequential ::data-testing.schema/transform-test-run]
  "The newest TransformTestRun of each of the TransformTests with `transform-test-ids`."
  [transform-test-ids :- [:set ms/PositiveInt]]
  (t2/select :model/TransformTestRun
             {:where [:and
                      [:in :transform_test_run.transform_test_id transform-test-ids]
                      [:not [:exists ^:allow-subquery {:select [1]
                                                       :from   [[:transform_test_run :newer]]
                                                       :where  [:and
                                                                [:= :newer.transform_test_id :transform_test_run.transform_test_id]
                                                                [:> :newer.id :transform_test_run.id]]}]]]}))

(mu/defn users-by-id
  "A map of User id to the id, email, and name of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(mu/defn finish-started-transform-test-run!
  "Set `status` and the end time of TransformTestRun `run-id` if it is still started."
  [run-id :- ms/PositiveInt
   status :- ::data-testing.schema/run-status]
  (t2/update! :model/TransformTestRun
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
