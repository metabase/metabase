(ns metabase.api.actions
  "`/api/actions/` endpoints."
  (:require [compojure.core :as compojure :refer [POST]]
            [metabase.actions :as actions]
            [metabase.api.common :as api]
            [metabase.driver :as driver]
            [metabase.mbql.normalize :as mbql.normalize]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models.database :refer [Database]]
            [metabase.models.setting :as setting]
            [metabase.util :as u]
            [metabase.util.i18n :as i18n]
            [schema.core :as s]))

(defn do-check-actions-enabled
  "Check whether Actions are enabled and allowed for the [[metabase.models.database]] with `database-id`, or return a
  400 status code. `f` may be `nil`. If `f` is passed, calls

    (f driver)

  if the check passes."
  [database-id f]
  {:pre [(integer? database-id)]}
  (let [{db-settings :settings, driver :engine, :as db} (Database database-id)]
    ;; make sure the Driver supports Actions.
    (when-not (driver/database-supports? driver :actions db)
      (throw (ex-info (i18n/tru "{0} Database {1} does not support actions."
                                (u/qualified-name driver)
                                (format "%d %s" (:id db) (pr-str (:name db))))
                      {:status-code 400, :database-id (:id db)})))
    (binding [setting/*database-local-values* db-settings]
      ;; make sure Actions are enabled for this Database
      (when-not (actions/database-enable-actions)
        (throw (ex-info (i18n/tru "Actions are not enabled for Database {0}." database-id)
                        {:status-code 400})))
      ;; TODO -- need to check permissions once the perms code is in place.
      (when f
        (f driver)))))

(api/defendpoint POST "/table/:action"
  "Generic API endpoint for doing an action against a specific Table."
  [action :as {{:keys [database], :as query} :body}]
  {database s/Int
   ;; Note -- this isn't going to work because filter isn't normalized yet, e.g. the API is going to get
   ;;
   ;;    ["=" ["field" ...] ...]
   ;;
   ;; instead of
   ;;
   ;;    [:= [:field ...] ...]
   ;;
   ;; So I disabled it for not since it broke my new test. -- Cam
   query    {(s/optional-key :filter) mbql.s/Filter
             s/Keyword                s/Any}}
  (do-check-actions-enabled
   database
   (fn [_driver]
     (actions/table-action! (keyword action) query))))

(api/defendpoint POST "/row/:action"
  "Generic API endpoint for doing an action against a single, specific row."
  [action :as {{:keys [database] :as query} :body}]
  {database s/Int}
  (let [query (mbql.normalize/normalize query)]
    (try
      (s/validate mbql.s/Query query)
      (catch Exception e
        (throw (ex-info
                (ex-message e)
                {:exception-data (ex-data e)
                 :status-code 400}))))
    (case (keyword action)
      :update (s/validate {:update-row {s/Keyword s/Any} s/Keyword s/Any} query)
      :create (s/validate {:create-row {s/Keyword s/Any} s/Keyword s/Any} query)
      nil) ;; nothing else to check
    (do-check-actions-enabled
     database
     (fn [driver]
       (actions/row-action! (keyword action) driver query)))))

(api/define-routes actions/+check-actions-enabled)
