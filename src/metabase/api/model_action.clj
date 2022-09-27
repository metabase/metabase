(ns metabase.api.model-action
  (:require
    [honeysql.core :as hsql]
    [metabase.api.common :as api]
    [metabase.models :refer [Action Card HTTPAction ModelAction QueryAction]]
    [metabase.util.schema :as su]
    [schema.core :as s]
    [toucan.db :as db]))

(api/defendpoint GET "/"
  "Endpoint to fetch actions for a model, must filter with card-id="
  [card-id]
  {card-id su/IntGreaterThanZero}
  (db/query {:select [:model_action.*
                      [(hsql/call :coalesce :report_card.name :http_action.name) :name]]
             :from [ModelAction]
             :left-join [QueryAction [:= :model_action.action_id :query_action.action_id]
                         Card [:= :report_card.id :query_action.card_id]
                         HTTPAction [:= :model_action.action_id :http_action.action_id]]
             :where [:= :model_action.card_id card-id]
             :order-by [:model_action.id]}))

(api/defendpoint POST "/"
  "Endpoint to associate an action with a model"
  [:as {{:keys [card_id action_id slug requires_pk parameter_mappings visualization_settings] :as body} :body}]
  {card_id su/IntGreaterThanZero
   action_id (s/maybe su/IntGreaterThanZero)
   slug su/NonBlankString
   requires_pk s/Bool
   parameter_mappings (s/maybe [su/ParameterMapping])
   visualization_settings (s/maybe su/Map)}
  (db/insert! ModelAction body))

(api/defendpoint PUT "/:model-action-id"
  "Endpoint to associate an action with a model"
  [model-action-id :as {{:keys [action_id slug requires_pk parameter_mappings visualization_settings] :as body} :body}]
  {action_id (s/maybe su/IntGreaterThanZero)
   slug (s/maybe su/NonBlankString)
   requires_pk (s/maybe s/Bool)
   parameter_mappings (s/maybe [su/ParameterMapping])
   visualization_settings (s/maybe su/Map)}
  (db/update! ModelAction model-action-id (dissoc body :card_id))
  api/generic-204-no-content)

(api/defendpoint DELETE "/:model-action-id"
  "Endpoint to delete an action"
  [model-action-id]
  (let [action_id (db/select-field :action_id ModelAction :id model-action-id)]
    ;; Let cascade delete handle this
    (db/delete! Action :id action_id)
    api/generic-204-no-content))

(api/define-routes)
