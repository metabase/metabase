(ns metabase.api.emitter
  (:require
   [compojure.core :refer [DELETE POST PUT]]
   [metabase.actions :as actions]
   [metabase.api.common :as api]
   [metabase.mbql.schema :as mbql.s]
   [metabase.models
    :refer [CardEmitter DashboardEmitter Emitter EmitterAction]]
   [metabase.query-processor.writeback :as qp.writeback]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.db :as db]
   [toucan.hydrate :refer [hydrate]]))

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
  (db/update! Emitter emitter-id emitter)
  api/generic-204-no-content)

(api/defendpoint DELETE "/:emitter-id"
  "Endpoint to delete an emitter."
  [emitter-id]
  (db/delete! Emitter :id emitter-id)
  api/generic-204-no-content)

(defn- emitter
  "Fetch the Emitter with `emitter-id` and extra info from FK-related tables for custom Emitter execution purposes."
  [emitter-id]
  (when-let [emitter (->> (db/query {:select    [:*]
                                     :from      [[Emitter :emitter]]
                                     :left-join [[EmitterAction :emitter_action]
                                                 [:= :emitter_action.emitter_id :emitter.id]
                                                 ;; TODO -- not 100% sure we need CardEmitter and DashboardEmitter, we'd
                                                 ;; only need that if we wanted to hydrate the Card or Dashboard they
                                                 ;; came from.
                                                 [CardEmitter :card_emitter]
                                                 [:= :card_emitter.emitter_id :emitter.id]
                                                 [DashboardEmitter :dashboard_emitter]
                                                 [:= :dashboard_emitter.emitter_id :emitter.id]
                                                 ]
                                     :where     [:= :id emitter-id]})
                          (db/do-post-select Emitter)
                          first)]
    (hydrate emitter [:action :card])))

(def ^:private CustomActionParametersMap
  (-> {s/Keyword {:type     (apply s/enum (map u/qualified-name (keys mbql.s/parameter-types))) ; type will come in as a string.
                  :value    s/Any
                  s/Keyword s/Any}}
      (su/with-api-error-message "map of parameter name or ID -> map of parameter `:value` and `:type` of the value")))

(api/defendpoint POST "/:id/execute"
  "Execute a custom emitter."
  [id :as {{:keys [parameters]} :body}]
  {parameters (s/maybe CustomActionParametersMap)}
  (let [emitter (api/check-404 (emitter id))]
    (or (get-in emitter [:action :card])
        (throw (ex-info (tru "No Query Action found for Emitter {0}. Only Query Actions are supported at this point in time."
                             id)
                        {:status-code 400, :emitter emitter})))
    (qp.writeback/execute-query-emitter! emitter parameters)))

(api/define-routes actions/+check-actions-enabled api/+check-superuser)
