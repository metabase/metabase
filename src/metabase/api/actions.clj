(ns metabase.api.actions
  "`/api/actions/` endpoints."
  (:require [clojure.walk :as walk]
            [compojure.core :as compojure :refer [POST]]
            [metabase.actions :as actions]
            [metabase.api.common :as api]
            [metabase.driver.util :as driver.u]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models.database :refer [Database]]
            [metabase.models.setting :as setting]
            [metabase.util.i18n :as i18n]
            [schema.core :as s]
            [toucan.db :as db]))

(defn- do-check-actions-enabled [database-id f]
  {:pre [(integer? database-id)]}
  (let [db-settings (db/select-one-field :settings Database :id database-id)
        driver      (driver.u/database->driver database-id)]
    (binding [setting/*database-local-values* db-settings]
      ;; make sure Actions are enabled for this Database
      (when-not (actions/database-enable-actions)
        (throw (ex-info (i18n/tru "Actions are not enabled for Database {0}." database-id)
                        {:status-code 400})))
      ;; TODO -- need to check permissions once the perms code is in place.
      (f driver))))

(api/defendpoint POST "/table/:action"
  "Generic API endpoint for doing an action against a specific Table."
  [action :as {{:keys [database], :as query} :body}]
  (do-check-actions-enabled
   database
   (fn [_driver]
     (actions/table-action! (keyword action) query))))

(defn- kwdize-filter [strings-to-kw query]
  (-> query
      (update :type keyword)
      (update-in [:query :filter]
                 #(walk/postwalk
                   (fn [x] (if (and (string? x) (contains? strings-to-kw x)) (keyword x) x))
                   %))))

(api/defendpoint POST "/row/:action"
  "Generic API endpoint for doing an action against a specific row."
  [action :as {{:keys [database] :as query} :body}]
  {database s/Int}
  (let [query (kwdize-filter
               ;; the mbql-query's filter clause needs to have forms like:
               ;; [:= [:field ...]]
               ;; but we recieve forms like
               ;; ["=" ["field" ...]]
               #{"=" "<" ">" "field" "and"}
               query)]
    (try
      (s/validate mbql.s/Query query)
      (catch Exception e
        (throw (ex-info
                (ex-message e)
                {:exception-data (ex-data e)
                 :status-code 400}))))
    (do-check-actions-enabled
     database
     (fn [driver]
       (actions/row-action! (keyword action) driver query)))))

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
