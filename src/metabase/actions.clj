(ns metabase.actions
  "Code related to the new writeback Actions."
  (:require
   [metabase.driver :as driver]
   [metabase.models.setting :as setting]
   [metabase.models.table :refer [Table]]
   [metabase.util.i18n :as i18n]
   [toucan.db :as db]))

(setting/defsetting experimental-enable-actions
  (i18n/deferred-tru "Whether to enable using the new experimental Actions features globally. (Actions must also be enabled for each Database.)")
  :default false
  :type :boolean
  :visibility :public)

(setting/defsetting database-enable-actions
  (i18n/deferred-tru "Whether to enable using the new experimental Actions for a specific Database.")
  :default false
  :type :boolean
  :visibility :public
  :database-local :only)

(defn +check-actions-enabled
  "Ring middleware that checks that the [[metabase.actions/experimental-enable-actions]] feature flag is enabled, and
  returns a 403 Unauthorized response "
  [handler]
  (fn [request respond raise]
    (if (experimental-enable-actions)
      (handler request respond raise)
      (raise (ex-info (i18n/tru "Actions are not enabled.")
                      {:status-code 400})))))

;; TODO -- should these be ASYNC!!!!
(defmulti table-action!
  "Multimethod for doing an action on a Table as a whole, e.g. inserting a new row."
  {:arglists '([action {:keys [table-id], :as arg-map}])}
  (fn [action _arg-map]
    (keyword action)))

(defmethod table-action! :default
  [action _arg-map]
  (throw (ex-info (i18n/tru "Unknown Table action {0}." (pr-str (some-> action name)))
                  {:status-code 404})))

(defmethod table-action! :insert
  [_action {:keys [table-id values]}]
  {:pre [(map? values)]}
  ;; placeholder until we really implement it.
  {:insert-into (db/select-one-field :name Table :id table-id)
   :values      values})

(defmulti row-action!
  "Multimethod for doing an action against a specific row as a whole, e.g. updating or deleting that row."
  {:arglists '([action driver query])}
  (fn [action driver _query]
    [(keyword action)
     (driver/dispatch-on-initialized-driver driver)])
  :hierarchy #'driver/hierarchy)

(defmethod row-action! :default
  [action driver query]
  (throw (ex-info (i18n/tru "Unknown row action {0}." (pr-str (some-> action name)))
                  {:status-code 404, :action action, :driver driver, :query query})))

(defmethod row-action! [:create ::driver/driver]
  [action driver query]
  (throw (ex-info (i18n/tru "Row creation is not supported for {0} databases." (name driver))
                  {:status-code 400, :action action, :driver driver, :query query})))

(defmethod row-action! [:delete ::driver/driver]
  [action driver query]
  (throw (ex-info (i18n/tru "Row deletion is not supported for {0} databases." (name driver))
                  {:status-code 400, :action action, :driver driver, :query query})))

(defmethod row-action! [:update ::driver/driver]
  [action driver query]
  (throw (ex-info (i18n/tru "Row updating is not supported for {0} databases." (name driver))
                  {:status-code 400, :action action, :driver driver, :query query})))
