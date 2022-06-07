(ns metabase.api.actions
  "`/api/actions/` endpoints."
  (:require [cheshire.core :as json]
            [compojure.core :as compojure :refer [POST]]
            [medley.core :as m]
            [metabase.actions :as actions]
            [metabase.api.common :as api]
            [metabase.driver :as driver]
            [metabase.mbql.normalize :as mbql.normalize]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models.database :refer [Database]]
            [metabase.models.setting :as setting]
            [metabase.util :as u]
            [metabase.util.i18n :as i18n]
            [schema.core :as s]
            [toucan.db :as db]))

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


(api/defendpoint GET "/"
  "Returns cards that can be used for QueryActions"
  [database]
  {database (s/maybe s/Int)}
  (when database
    (do-check-actions-enabled database nil))
  (api/check-superuser)
  (let [cards+actions (db/query {:select    [:card.*
                                             [:db.settings :db_settings]
                                             [:a.id :a_id]
                                             [:a.type :a_type]
                                             [:a.created_at :a_created_at]
                                             [:a.updated_at :a_updated_at]]
                                 :from      [[:report_card :card]]
                                 :left-join [[:metabase_database :db] [:= :card.database_id :db.id]
                                             [:query_action :qa] [:= :card.id :qa.card_id]
                                             [:action :a] [:= :qa.action_id :a.id]]
                                 :where     [:and
                                             [:= :card.is_write true]
                                             [:= :card.archived false]
                                             (when database
                                               [:= :card.database_id database])]
                                 :order-by  [[:updated_at :desc]]})]
    (keep (fn [{:keys [a_id a_type a_created_at a_updated_at db_settings] :as card+action}]
            ;; n.b. must check db settings in memory, since db.settings can be encrypted
            (when (-> db_settings (json/decode true) :database-enable-actions boolean)
              {:id a_id
               :type a_type
               :created-at a_created_at
               :updated-at a_updated_at
               :card (-> card+action
                         (dissoc :a_id :a_type :a_created_at :a_updated_at :db_settings)
                         (m/update-existing :dataset_query json/parse-string))}))
          cards+actions)))

(api/defendpoint POST "/table/:action"
  "Generic API endpoint for doing an action against a specific Table."
  [action :as {{:keys [database], :as query} :body}]
  {database s/Int}
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
