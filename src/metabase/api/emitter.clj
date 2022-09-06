(ns metabase.api.emitter
  (:require [compojure.core :refer [DELETE POST PUT]]
            [metabase.actions :as actions]
            [metabase.actions.http-action :as http-action]
            [metabase.api.common :as api]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models :refer [CardEmitter DashboardEmitter Emitter]]
            [metabase.query-processor.writeback :as qp.writeback]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

(defn- emitter
  "Fetch the Emitter with `emitter-id` and extra info from FK-related tables for custom Emitter execution purposes."
  [emitter-id]
  (when-let [emitter (->> (db/query {:select    [:*]
                                     :from      [[Emitter :emitter]]
                                     :left-join [;; TODO -- not 100% sure we need CardEmitter and DashboardEmitter, we'd
                                                 ;; only need that if we wanted to hydrate the Card or Dashboard they
                                                 ;; came from.
                                                 [CardEmitter :card_emitter]
                                                 [:= :card_emitter.emitter_id :emitter.id]
                                                 [DashboardEmitter :dashboard_emitter]
                                                 [:= :dashboard_emitter.emitter_id :emitter.id]]
                                     :where     [:= :emitter.id emitter-id]})
                          (db/do-post-select Emitter)
                          first)]
    (hydrate emitter [:action :card])))

(api/defendpoint POST "/"
  "Endpoint to create an emitter."
  [:as {{:keys [action_id card_id dashboard_id options parameter_mappings], :as body} :body}]
  {action_id          su/IntGreaterThanZero
   card_id            (s/maybe su/IntGreaterThanOrEqualToZero)
   dashboard_id       (s/maybe su/IntGreaterThanOrEqualToZero)
   options            (s/maybe su/Map)
   parameter_mappings (s/maybe su/Map)}
  ;; Create stuff the hard way by hand because H2 doesn't return the Emitter ID if you have Toucan `pre-insert` create
  ;; them for you because of some issue with INSERT RETURNING ROWS or something like that. See
  ;; [[metabase.models.emitter/pre-insert]] for more discussion.
  (let [emitter-id (u/the-id (db/insert! Emitter {:options options,
                                                  :parameter_mappings parameter_mappings
                                                  :action_id action_id}))]
    (cond
      dashboard_id
      (db/insert! DashboardEmitter {:emitter_id emitter-id, :dashboard_id dashboard_id})

      card_id
      (db/insert! CardEmitter {:emitter_id emitter-id, :card_id card_id})

      :else
      (throw (ex-info (tru "Unknown emitter type") body)))
    (emitter emitter-id)))

(api/defendpoint PUT "/:emitter-id"
  "Endpoint to update an emitter."
  [emitter-id :as {emitter :body}]
  (api/check-404 (db/select-one Emitter :id emitter-id))
  (db/update! Emitter emitter-id emitter)
  api/generic-204-no-content)

(api/defendpoint DELETE "/:emitter-id"
  "Endpoint to delete an emitter."
  [emitter-id]
  (api/check-404 (db/select-one Emitter :id emitter-id))
  (db/delete! Emitter :id emitter-id)
  api/generic-204-no-content)

(def ^:private CustomActionParametersMap
  (-> {s/Keyword {:type     (apply s/enum (map u/qualified-name (keys mbql.s/parameter-types))) ; type will come in as a string.
                  :value    s/Any
                  s/Keyword s/Any}}
      (su/with-api-error-message "map of parameter name or ID -> map of parameter `:value` and `:type` of the value")))

(defn- execute-http-emitter!
  [emitter parameters]
  ;; TODO check the types match
  (let [mapped-params (->> emitter
                           :parameter_mappings
                           (map (fn [[k [param-type param-spec]]]
                                  (if (= "variable" (name param-type))
                                    [k (second param-spec)]
                                    (throw (ex-info "Unimplemented"
                                                    {:parameters parameters
                                                     :parameter_mappings (:parameter_mappings emitter)})))))
                           (into {}))
        params->value (->> parameters
                           (map (juxt (comp mapped-params key) (comp #(get % :value) val)))
                           (into {}))]
    (http-action/execute-http-action! (:action emitter) params->value)))

(api/defendpoint POST "/:id/execute"
  "Execute a custom emitter."
  [id :as {{:keys [parameters]} :body}]
  {parameters (s/maybe CustomActionParametersMap)}
  (let [emitter (api/check-404 (emitter id))
        action-type (get-in emitter [:action :type])]
    (case action-type
      :query
      (do
        (or (get-in emitter [:action :card])
            (throw (ex-info (tru "No Query Action found for Emitter {0}. Only Query Actions are supported at this point in time."
                                 id)
                            {:status-code 400, :emitter emitter})))
        (qp.writeback/execute-query-emitter! emitter parameters))

      :http
      (execute-http-emitter! emitter parameters)

      ;; TODO We changed what is in action.type Could be the old "row" type, might not need to handle
      (throw (ex-info (tru "Unknown action type {0}." (name action-type)) emitter)))))

(api/define-routes actions/+check-actions-enabled api/+check-superuser)
