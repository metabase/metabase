(ns metabase.transform-testing.db
  "Application database queries for the transform-testing module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn transform-tests :- [:sequential ::transform-testing.schema/transform-test]
  "The TransformTests in name order, only those of the Transform with `:transform-id` when it is given."
  [{:keys [transform-id]} :- [:map {:closed true}
                              [:transform-id {:optional true} [:maybe ::lib.schema.id/transform]]]]
  (t2/select :model/TransformTest (cond-> {:order-by [[:name :asc] [:id :asc]]}
                                    transform-id (assoc :where [:= :transform_id transform-id]))))

(mu/defn transform-test :- [:maybe ::transform-testing.schema/transform-test]
  "The TransformTest with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/TransformTest :id id))

(mu/defn insert-transform-test! :- ::transform-testing.schema/transform-test
  "Insert the TransformTest `transform-test` and return the inserted instance."
  [transform-test :- [:merge
                      ::transform-testing.schema/transform-test.create
                      [:map {:closed true}
                       [:creator_id ::lib.schema.id/user]]]]
  (t2/insert-returning-instance! :model/TransformTest transform-test))

(mu/defn update-transform-test!
  "Apply `updates` to the TransformTest with `id`."
  [id :- ms/PositiveInt
   updates :- ::transform-testing.schema/transform-test.update]
  (t2/update! :model/TransformTest id updates))

(mu/defn delete-transform-test!
  "Delete the TransformTest with `id`."
  [id :- ms/PositiveInt]
  (t2/delete! :model/TransformTest :id id))

(mu/defn transform
  "The Transform with `transform-id`, or nil."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select-one :model/Transform :id transform-id))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn transform-test-by-entity-id :- [:maybe ::transform-testing.schema/transform-test]
  "The TransformTest with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one :model/TransformTest :entity_id entity-id))
