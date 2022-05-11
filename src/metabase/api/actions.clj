(ns metabase.api.actions
  "`/api/actions/` endpoints."
  (:require
   [compojure.core :as compojure :refer [POST]]
   [metabase.actions :as actions]
   [metabase.api.common :as api]
   [metabase.models.database :refer [Database]]
   [metabase.models.setting :as setting]
   [metabase.models.table :refer [Table]]
   [metabase.util.i18n :as i18n]
   [metabase.util.schema :as su]
   [toucan.db :as db]))

(defn- do-action-for-table [table-id thunk]
  {:pre [(integer? table-id)]}
  (let [database-id (api/check-404 (db/select-one-field :db_id Table :id table-id))
        db-settings (db/select-one-field :settings Database :id database-id)]
    (binding [setting/*database-local-values* db-settings]
      ;; make sure Actions are enabled for this Database
      (when-not (actions/database-enable-actions)
        (throw (ex-info (i18n/tru "Actions are not enabled for Database {0}." database-id)
                        {:status-code 400})))
      ;; TODO -- need to check permissions once the perms code is in place.
      (thunk))))

(api/defendpoint POST "/table/:action"
  "Generic API endpoint for doing an action against a specific Table."
  [action :as {{:keys [table-id], :as body} :body}]
  {table-id su/IntGreaterThanZero}
  (do-action-for-table
   table-id
   (fn []
     (actions/table-action! (keyword action) (assoc body :table-id table-id)))))

(api/defendpoint POST "/row/:action"
  "Generic API endpoint for doing an action against a specific row."
  [action :as {{:keys [table-id pk], :as body} :body}]
  {table-id su/IntGreaterThanZero
   pk       su/Map}
  (do-action-for-table
   table-id
   (fn []
     (actions/row-action! (keyword action) (assoc body :table-id table-id)))))

(defn- +check-actions-enabled
  "Ring middleware that checks that the [[metabase.actions/experimental-enable-actions]] feature flag is enabled, and
  returns a 403 Unauthorized response "
  [handler]
  (fn [request respond raise]
    (if (actions/experimental-enable-actions)
      (handler request respond raise)
      (raise (ex-info (i18n/tru "Actions are not enabled.")
                      {:status-code 400})))))

(api/define-routes +check-actions-enabled)
