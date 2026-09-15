(ns metabase.transform-testing.db
  "Application database queries for the transform-testing module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn test-suites :- [:sequential ::transform-testing.schema/transform-test-suite]
  "The TransformTestSuites in name order, only those of the Transform with `:transform-id` when it is given."
  [{:keys [transform-id]} :- [:map {:closed true}
                              [:transform-id {:optional true} [:maybe ::lib.schema.id/transform]]]]
  (t2/select :model/TransformTestSuite (cond-> {:order-by [[:name :asc] [:id :asc]]}
                                         transform-id (assoc :where [:= :transform_id transform-id]))))

(mu/defn test-suite :- [:maybe ::transform-testing.schema/transform-test-suite]
  "The TransformTestSuite with `suite-id`, or nil."
  [suite-id :- ms/PositiveInt]
  (t2/select-one :model/TransformTestSuite :id suite-id))

(mu/defn insert-test-suite! :- ::transform-testing.schema/transform-test-suite
  "Insert the TransformTestSuite `suite` and return the inserted instance."
  [suite :- [:merge
             ::transform-testing.schema/transform-test-suite.create
             [:map {:closed true}
              [:creator_id ::lib.schema.id/user]]]]
  (t2/insert-returning-instance! :model/TransformTestSuite suite))

(mu/defn update-test-suite!
  "Apply `updates` to the TransformTestSuite with `suite-id`."
  [suite-id :- ms/PositiveInt
   updates  :- ::transform-testing.schema/transform-test-suite.update]
  (t2/update! :model/TransformTestSuite suite-id updates))

(mu/defn delete-test-suite!
  "Delete the TransformTestSuite with `suite-id`."
  [suite-id :- ms/PositiveInt]
  (t2/delete! :model/TransformTestSuite :id suite-id))

(mu/defn transform
  "The Transform with `transform-id`, or nil."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select-one :model/Transform :id transform-id))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))
