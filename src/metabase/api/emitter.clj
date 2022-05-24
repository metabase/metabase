(ns metabase.api.emitter
  (:require [metabase.actions :as actions]
            [metabase.api.common :as api]
            [metabase.models :refer [CardEmitter DashboardEmitter Emitter]]
            [metabase.util.i18n :refer [tru]]
            [toucan.db :as db]))

(api/defendpoint POST "/"
  "Endpoint to create an emitter."
  [:as {emitter :body}]
  (cond
    (:dashboard_id emitter)
    (db/insert! DashboardEmitter emitter)

    (:card_id emitter)
    (db/insert! CardEmitter emitter)

    :else
    (throw (ex-info (tru "Unknown emitter type") emitter))))

(api/defendpoint PUT "/:emitter-id"
  "Endpoint to update an emitter."
  [emitter-id :as {emitter :body}]
  {}
  (db/update! Emitter emitter-id emitter)
  api/generic-204-no-content)

(api/defendpoint DELETE "/:emitter-id"
  "Endpoint to delete an emitter."
  [emitter-id]
  (db/delete! Emitter :id emitter-id)
  api/generic-204-no-content)

(api/define-routes actions/+check-actions-enabled)
