(ns metabase.secrets.db
  "Application database queries for the secrets module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn latest-secret
  "The highest-version Secret with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Secret :id id {:order-by [[:version :desc]]}))

(mu/defn insert-secret!
  "Insert the Secret `row` and return the inserted instance."
  [row :- [:map {:closed true}
           [:id         {:optional true} ms/PositiveInt]
           [:version    {:optional true} [:maybe :int]]
           [:name       {:optional true} [:maybe :string]]
           [:kind       {:optional true} [:maybe [:or :keyword :string]]]
           [:source     {:optional true} [:maybe [:or :keyword :string]]]
           [:value      {:optional true} [:maybe [:or bytes? :string]]]
           [:creator_id {:optional true} [:maybe ::lib.schema.id/user]]]]
  (t2/insert-returning-instance! :model/Secret row))

(mu/defn secret-version
  "The Secret with `id` and `version`, or nil."
  [id      :- ms/PositiveInt
   version :- ms/PositiveInt]
  (t2/select-one :model/Secret :id id :version version))

(mu/defn delete-secret!
  "Delete every version of the Secret with `id`, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/Secret :id id))
