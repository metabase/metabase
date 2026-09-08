(ns metabase.secrets.db
  "Application database queries for the secrets module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn latest-secret :- [:maybe (ms/InstanceOf :model/Secret)]
  "The highest-version Secret with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Secret :id id {:order-by [[:version :desc]]}))

(mu/defn insert-secret! :- (ms/InstanceOf :model/Secret)
  "Insert the Secret `row` and return the inserted instance."
  [row :- [:map {:closed true}
           [:id         {:optional true} ms/PositiveInt]
           [:version    {:optional true} :any]
           [:name       {:optional true} :any]
           [:kind       {:optional true} :any]
           [:source     {:optional true} :any]
           [:value      {:optional true} :any]
           [:creator_id {:optional true} :any]]]
  (t2/insert-returning-instance! :model/Secret row))

(mu/defn secret-version :- [:maybe (ms/InstanceOf :model/Secret)]
  "The Secret with `id` and `version`, or nil."
  [id      :- ms/PositiveInt
   version :- ms/PositiveInt]
  (t2/select-one :model/Secret :id id :version version))

(mu/defn delete-secret! :- :int
  "Delete every version of the Secret with `id`, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/Secret :id id))
