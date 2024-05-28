(ns metabase-enterprise.advanced-permissions.api.impersonation
  (:require
   [compojure.core :refer [GET]]
   [metabase.api.common :as api]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api/defendpoint GET "/"
  "Fetch a list of all Impersonation policies currently in effect, or a single policy if both `group_id` and `db_id`
  are provided."
  [group_id db_id]
  {group_id [:maybe ms/PositiveInt]
   db_id    [:maybe ms/PositiveInt]}
  (api/check-superuser)
  (if (and group_id db_id)
    (t2/select-one :model/ConnectionImpersonation :group_id group_id :db_id db_id)
    (t2/select :model/ConnectionImpersonation {:order-by [[:id :asc]]})))

(api/defendpoint DELETE "/:id"
  "Delete a Connection Impersonation entry."
  [id]
  {id ms/PositiveInt}
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/ConnectionImpersonation :id id))
  (t2/delete! :model/ConnectionImpersonation :id id)
  api/generic-204-no-content)

(api/define-routes)
