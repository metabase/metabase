(ns metabase-enterprise.data-editing-public.api
  (:require
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [toucan2.core :as t2]))

(api.macros/defendpoint :post "/webhook/:token/data"
  "Inserts rows into the table associated with the token. See routes for ee/data-editing/webhook for token CRUD.

  Accepts either a single row or multiple rows in an array.
  Expects all required columns to be provided.

  The provided row JSON must be compatible with the underlying types of the table.
  e.g if you have set up a casting rule for a unix epoch seconds field to present it as a datetime, callers must provide the integer value to this API.

  Callers should expect 400 errors on constraint violation (e.g the primary key already exists) or the schema is not met."
  [{:keys [token]}
   _
   row-or-rows]
  (let [hook (api/check-404 (t2/select-one :table_webhook_token :token token))
        rows (if (map? row-or-rows) [row-or-rows] row-or-rows)]
    (api/check-400 (seq rows) "Please supply at least one row.")
    (api/check-400 (every? seq rows) "Every row should not be empty.")
    (let [user-id  (:creator_id hook)
          scope    {:webhook-id (:id hook)}
          table-id (:table_id hook)
          inputs   (for [r rows]
                     {:table-id table-id, :row r})]
      {:created (count (:outputs (actions/perform-action! :table.row/create scope inputs {:user-id user-id
                                                                                          :policy :data-editing})))})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-editing routes."
  (api.macros/ns-handler *ns*))
