(ns metabase.actions
  "Code related to the new writeback Actions."
  (:require [metabase.models.setting :as setting]
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
  {:arglists '([action {:keys [table-id pk], :as arg-map}])}
  (fn [action _arg-map]
    (keyword action)))

(defmethod row-action! :default
  [action _arg-map]
  (throw (ex-info (i18n/tru "Unknown row action {0}." (pr-str (some-> action name)))
                  {:status-code 404})))

(defn- pk-where-clause [pk]
  {:pre [(map? pk)]}
  (let [clauses (for [[k v] pk]
                  [:= (keyword k) v])]
    (if (= (count clauses) 1)
      (first clauses)
      (into [:and] clauses))))

(defmethod row-action! :delete
  [_action {:keys [table-id pk]}]
  ;; placeholder until we really implement it.
  {:delete-from (db/select-one-field :name Table :id table-id)
   :where       (pk-where-clause pk)})

(defmethod row-action! :update
  [_action {:keys [table-id pk values]}]
  ;; placeholder until we really implement it.
  {:update (db/select-one-field :name Table :id table-id)
   :set    values
   :where  (pk-where-clause pk)})
