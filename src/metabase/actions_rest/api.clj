(ns metabase.actions-rest.api
  "`/api/action/` endpoints."
  (:require
   [metabase.actions-rest.db :as actions-rest.db]
   [metabase.actions.core :as actions]
   [metabase.actions.schema :as actions.schema]
   [metabase.analytics.core :as analytics]
   [metabase.api-scope.data-app :as api-scope]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.public-sharing.validation :as public-sharing.validation]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :get "/" :- [:sequential ::actions.schema/action]
  "Returns the unarchived actions in collections the current user can read. Pass optional `?model-id=<model-id>` to
  limit to the actions of a particular model, and optional `?type=<type>` to limit to actions of that type."
  {:scope api-scope/data-app}
  [_route-params
   {:keys [model-id]
    action-type :type} :- [:map {:closed true}
                           [:model-id {:optional true} [:maybe ::lib.schema.id/card]]
                           [:type     {:optional true} [:maybe ::actions.schema/type]]]]
  (let [actions (if model-id
                  (let [model (api/read-check :model/Card model-id)]
                    (cond->> (actions/select-actions-for-models [model] [model-id])
                      action-type (filter #(= action-type (keyword (:type %))))))
                  (when-let [action-ids (seq (actions-rest.db/unarchived-action-ids-visible-to-user {:type action-type}))]
                    (actions/select-actions-for-ids nil (vec action-ids))))]
    (t2/hydrate (vec actions) :creator :can_write)))

(api.macros/defendpoint :get "/public" :- [:sequential ::actions.schema/action]
  "Fetch a list of Actions with public UUIDs. These actions are publicly-accessible *if* public sharing is enabled."
  []
  (perms/check-has-application-permission :setting)
  (public-sharing.validation/check-public-sharing-enabled)
  (actions-rest.db/public-actions))

(api.macros/defendpoint :get "/:action-id" :- ::actions.schema/action
  "Fetch an Action."
  {:scope api-scope/data-app}
  [{:keys [action-id]} :- [:map {:closed true}
                           [:action-id ms/PositiveInt]]]
  (-> (actions/select-action :id action-id :archived false)
      (t2/hydrate :creator :can_write)
      api/read-check))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:action-id"
  "Delete an Action."
  [{:keys [action-id]} :- [:map {:closed true}
                           [:action-id ms/PositiveInt]]]
  (let [action (api/write-check :model/Action action-id)]
    (analytics/track-event! :snowplow/action
                            {:event     :action-deleted
                             :type      (:type action)
                             :action_id action-id})
    (actions-rest.db/delete-action! action-id)
    (events/publish-event! :event/action-delete {:object action :user-id api/*current-user-id*}))
  api/generic-204-no-content)

(api.macros/defendpoint :post "/" :- ::actions.schema/action
  "Create a new action."
  [_route-params
   _query-params
   {:keys [parameters database_id]
    action-type :type
    :as action} :- ::actions.schema/action.create-request]
  (when (and (nil? database_id)
             (= action-type :query))
    (throw (ex-info (tru "Must provide a database_id for query actions")
                    {:type        action-type
                     :status-code 400})))
  (api/create-check :model/Action action)
  (actions/check-implicit-actions-supported action)
  (actions/check-action-databases-enabled action)
  (let [action-id (actions/insert! (assoc action :creator_id api/*current-user-id*))]
    (analytics/track-event! :snowplow/action
                            {:event          :action-created
                             :type           action-type
                             :action_id      action-id
                             :num_parameters (count parameters)})
    (u/prog1 (actions/select-action :id action-id)
      (events/publish-event! :event/action-create {:object <> :user-id api/*current-user-id*}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update an Action."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ::actions.schema/id]]
   _query-params
   action :- ::actions.schema/action.update-request]
  (let [existing-action (api/write-check :model/Action id)
        action          (api/updates-with-archived-directly existing-action action)]
    (api/update-check existing-action action)
    (when (some #(contains? action %) [:dataset_query :database_id :type :kind :model_id])
      (actions/check-action-databases-enabled (merge (actions/select-action :id id) action)))
    (actions/update! (assoc action :id id) existing-action))
  (let [{:keys [parameters type] :as action} (actions/select-action :id id)]
    (events/publish-event! :event/action-update {:object action :user-id api/*current-user-id*})
    (analytics/track-event! :snowplow/action
                            {:event          :action-updated
                             :type           type
                             :action_id      id
                             :num_parameters (count parameters)})
    action))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/public_link"
  "Generate publicly-accessible links for this Action. Returns UUID to be used in public links. (If this
  Action has already been shared, it will return the existing public link rather than creating a new one.) Public
  sharing must be enabled."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ::actions.schema/id]]]
  (api/check-superuser)
  (public-sharing.validation/check-public-sharing-enabled)
  (let [action (api/read-check :model/Action id :archived false)]
    (actions/check-actions-enabled action)
    {:uuid (or (:public_uuid action)
               (u/prog1 (str (random-uuid))
                 (actions-rest.db/set-action-public-uuid! id <> api/*current-user-id*)))}))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id/public_link"
  "Delete the publicly-accessible link to this Dashboard."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ::actions.schema/id]]]
  ;; check the /application/setting permission, not superuser because removing a public link is possible from
  ;; /admin/settings
  (perms/check-has-application-permission :setting)
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-exists? :model/Action :id id, :public_uuid [:not= nil], :archived false)
  (actions-rest.db/set-action-public-uuid! id nil nil)
  {:status 204, :body nil})

(api.macros/defendpoint :post "/:action-id/execute/values" :- [:map-of :string :any]
  "Fetches the values for filling in execution parameters. Pass PK parameters and values to select.

  Parameters are sent in the request body rather than the query string so their values stay out of URLs and logs."
  {:scope api-scope/data-app}
  [{:keys [action-id]} :- [:map {:closed true}
                           [:action-id ms/PositiveInt]]
   _query-params
   {:keys [parameters]} :- [:map {:closed true}
                            [:parameters ::actions.schema/prefetch-parameter-values]]]
  (actions/check-actions-enabled action-id)
  (-> (actions/select-action :id action-id :archived false)
      api/read-check
      (actions/fetch-values parameters)))

(defn- remap-parameter-keys
  "Translate incoming `parameters` keys to the destination parameter `:id` the
   downstream executor expects.

   Query-action parameters have UUID `:id`s with human-readable `:slug` aliases;
   the FE typically sends keys by `:slug` (that's what shows up in the typed
   schema export and in the action editor UI). Implicit-action parameters use
   a slug-form value as their `:id`, so the keys already match.

   Resolution order per incoming key:
     1. Already matches a destination `:id` → passed through.
     2. Matches a destination `:slug` → remapped to that parameter's `:id`.
     3. No match → passed through unchanged so the downstream validator still
        reports it as 'no destination parameter found'."
  [{action-params :parameters} parameters]
  (let [valid-ids (into #{} (map :id) action-params)
        slug->id  (into {} (keep (fn [p] (when-let [s (:slug p)] [s (:id p)]))) action-params)]
    (update-keys parameters
                 (fn [k]
                   (cond
                     (contains? valid-ids k) k
                     (contains? slug->id k)  (get slug->id k)
                     :else                   k)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/execute"
  "Execute the Action.

   `parameters` should be the mapped dashboard parameters with values."
  {:scope api-scope/data-app}
  [{:keys [id]} :- [:map {:closed true}
                    [:id [:or ::actions.schema/id ms/NanoIdString]]]
   _query-params
   {:keys [parameters], :as _body} :- [:maybe [:map {:closed true}
                                               [:parameters {:optional true} [:maybe ::actions.schema/execute-parameter-values]]]]]
  (let [resolved-id (eid-translation/->id-or-404 :action id)
        {:keys [type] :as action} (api/read-check (actions/select-action :id resolved-id :archived false))]
    (analytics/track-event! :snowplow/action
                            {:event     :action-executed
                             :source    :model_detail
                             :type      type
                             :action_id resolved-id})
    (actions/execute-action! action
                             (remap-parameter-keys action
                                                   (update-keys parameters name)))))
