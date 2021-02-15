(ns metabase-enterprise.sandbox.api.gtap
  "`/api/mt/gtap` endpoints, for CRUD operations and the like on GTAPs (Group Table Access Policies)."
  (:require [compojure.core :refer [DELETE GET POST PUT]]
            [metabase-enterprise.sandbox.models.group-table-access-policy :refer [GroupTableAccessPolicy]]
            [metabase.api.common :as api]
            [metabase.public-settings.metastore :as metastore]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(api/defendpoint GET "/"
  "Fetch a list of all the GTAPs currently in use."
  []
  ;; TODO - do we need to hydrate anything here?
  (db/select GroupTableAccessPolicy))

(api/defendpoint GET "/:id"
  "Fetch GTAP by `id`"
  [id]
  (api/check-404 (GroupTableAccessPolicy id)))

;; TODO - not sure what other endpoints we might need, e.g. for fetching the list above but for a given group or Table

#_(def ^:private AttributeRemappings
  (su/with-api-error-message (s/maybe {su/NonBlankString su/NonBlankString})
    "value must be a valid attribute remappings map (attribute name -> remapped name)"))

(api/defendpoint POST "/"
  "Create a new GTAP."
  [:as {{:keys [table_id card_id group_id attribute_remappings]} :body}]
  {table_id             su/IntGreaterThanZero
   card_id              (s/maybe su/IntGreaterThanZero)
   group_id             su/IntGreaterThanZero
   #_attribute_remappings #_AttributeRemappings} ; TODO -  fix me
  (db/insert! GroupTableAccessPolicy
    {:table_id             table_id
     :card_id              card_id
     :group_id             group_id
     :attribute_remappings attribute_remappings}))

(api/defendpoint PUT "/:id"
  "Update a GTAP entry. The only things you're allowed to update for a GTAP are the Card being used (`card_id`) or the
  paramter mappings; changing `table_id` or `group_id` would effectively be deleting this entry and creating a new
  one. If that's what you want to do, do so explicity with appropriate calls to the `DELETE` and `POST` endpoints."
  [id :as {{:keys [card_id attribute_remappings], :as body} :body}]
  {card_id              (s/maybe su/IntGreaterThanZero)
   #_attribute_remappings #_AttributeRemappings} ; TODO -  fix me
  (api/check-404 (GroupTableAccessPolicy id))
  ;; Only update `card_id` and/or `attribute_remappings` if the values are present in the body of the request.
  ;; This allows existing values to be "cleared" by being set to nil
  (when (some #(contains? body %) [:card_id :attribute_remappings])
    (db/update! GroupTableAccessPolicy id
      (u/select-keys-when body
        :present #{:card_id :attribute_remappings})))
  (GroupTableAccessPolicy id))

(api/defendpoint DELETE "/:id"
  "Delete a GTAP entry."
  [id]
  (api/check-404 (GroupTableAccessPolicy id))
  (db/delete! GroupTableAccessPolicy :id id)
  api/generic-204-no-content)

(defn- +check-sandboxes-enabled
  "Wrap the Ring handler to make sure sandboxes are enabled before allowing access to the API endpoints."
  [handler]
  (fn [request respond raise]
    (if-not (metastore/enable-sandboxes?)
      (raise (ex-info (str (tru "Error: sandboxing is not enabled for this instance.")
                           " "
                           (tru "Please check you have set a valid Enterprise token and try again."))
               {:status-code 403}))
      (handler request respond raise))))

;; All endpoints in this namespace require superuser perms to view
;;
;; TODO - does it make sense to have this middleware
;; here? Or should we just wrap `routes` in the `metabase-enterprise.sandbox.api.routes/routes` table like we do for everything else?
;;
;; TODO - defining the `check-superuser` check *here* means the API documentation function won't pick up on the "this
;; requires a superuser" stuff since it parses the `defendpoint` body to look for a call to `check-superuser`. I
;; suppose this doesn't matter (much) since this is an enterprise endpoint and won't go in the dox anyway.
(api/define-routes api/+check-superuser +check-sandboxes-enabled)
