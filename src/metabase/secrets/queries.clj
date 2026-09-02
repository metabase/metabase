(ns metabase.secrets.queries
  "Application database queries for the secrets module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn latest-secret
  "The highest-version Secret with `id`, or nil."
  [id]
  (t2/select-one :model/Secret :id id {:order-by [[:version :desc]]}))

(defn insert-secret!
  "Insert the Secret `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/Secret row))

(defn secret-version
  "The Secret with `id` and `version`, or nil."
  [id version]
  (t2/select-one :model/Secret :id id :version version))

(defn delete-secret!
  "Delete every version of the Secret with `id`."
  [id]
  (t2/delete! :model/Secret :id id))
