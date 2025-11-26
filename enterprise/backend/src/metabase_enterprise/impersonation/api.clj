(ns metabase-enterprise.impersonation.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Fetch a list of all Impersonation policies currently in effect, or a single policy if both `group_id` and `db_id`
  are provided."
  [_route-params
   {:keys [group_id db_id]} :- [:map
                                [:group_id {:optional true} [:maybe ms/PositiveInt]]
                                [:db_id    {:optional true} [:maybe ms/PositiveInt]]]]
  (api/check-superuser)
  (if (and group_id db_id)
    (t2/select-one :model/ConnectionImpersonation :group_id group_id :db_id db_id)
    (t2/select :model/ConnectionImpersonation {:order-by [[:id :asc]]})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete a Connection Impersonation entry."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/ConnectionImpersonation :id id))
  (t2/delete! :model/ConnectionImpersonation :id id)
  api/generic-204-no-content)
