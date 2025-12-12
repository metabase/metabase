(ns metabase.model-persistence.api
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.util :as driver.u]
   [metabase.model-persistence.models.persisted-info :as persisted-info]
   [metabase.model-persistence.settings :as model-persistence.settings]
   [metabase.model-persistence.task.persist-refresh :as task.persist-refresh]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.queries.core :as queries]
   [metabase.request.core :as request]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- fetch-persisted-info
  "Returns a list of persisted info, annotated with database_name, card_name, and schema_name."
  [{:keys [persisted-info-id card-id db-ids]} limit offset]
  (let [site-uuid-str    (system/site-uuid)
        db-id->fire-time (task.persist-refresh/job-info-by-db-id)
        query            (cond-> {:select    [:p.id :p.database_id :p.definition
                                              :p.active :p.state :p.error
                                              :p.refresh_begin :p.refresh_end
                                              :p.table_name :p.creator_id
                                              :p.card_id [:c.name :card_name]
                                              [:c.archived :card_archived]
                                              [:c.type :card_type]
                                              [:db.name :database_name]
                                              [:col.id :collection_id] [:col.name :collection_name]
                                              [:col.authority_level :collection_authority_level]]
                                  :from      [[:persisted_info :p]]
                                  :left-join [[:metabase_database :db] [:= :db.id :p.database_id]
                                              [:report_card :c]        [:= :c.id :p.card_id]
                                              [:collection :col]       [:= :c.collection_id :col.id]]
                                  :where     [:and
                                              [:= :c.type "model"]
                                              [:= :c.archived false]]
                                  :order-by  [[:p.refresh_begin :desc]]}
                           persisted-info-id (sql.helpers/where [:= :p.id persisted-info-id])
                           (seq db-ids)      (sql.helpers/where [:in :p.database_id db-ids])
                           card-id           (sql.helpers/where [:= :p.card_id card-id])
                           limit             (sql.helpers/limit limit)
                           offset            (sql.helpers/offset offset))]
    (as-> (t2/select :model/PersistedInfo query) results
      (t2/hydrate results :creator)
      (map (fn [{:keys [database_id] :as pi}]
             (assoc pi
                    :schema_name (ddl.i/schema-name {:id database_id} site-uuid-str)
                    :next-fire-time (get-in db-id->fire-time [database_id :next-fire-time])))
           results))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "List the entries of [[PersistedInfo]] in order to show a status page."
  []
  (perms/check-has-application-permission :monitoring)
  (let [db-ids (t2/select-fn-set :database_id :model/PersistedInfo)
        writable-db-ids (when (seq db-ids)
                          (->> (t2/select :model/Database :id [:in db-ids])
                               (filter mi/can-write?)
                               (map :id)
                               set))
        persisted-infos (fetch-persisted-info {:db-ids writable-db-ids} (request/limit) (request/offset))]
    {:data   persisted-infos
     :total  (if (seq writable-db-ids)
               (t2/count :model/PersistedInfo {:from [[:persisted_info :p]]
                                               :join [[:report_card :c] [:= :c.id :p.card_id]]
                                               :where [:and
                                                       [:in :p.database_id writable-db-ids]
                                                       [:= :c.type "model"]
                                                       [:not :c.archived]]})
               0)
     :limit  (request/limit)
     :offset (request/offset)}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:persisted-info-id"
  "Fetch a particular [[PersistedInfo]] by id."
  [{:keys [persisted-info-id]} :- [:map
                                   [:persisted-info-id ms/PositiveInt]]]
  (api/let-404 [persisted-info (first (fetch-persisted-info {:persisted-info-id persisted-info-id} nil nil))]
    (api/write-check (t2/select-one :model/Database :id (:database_id persisted-info)))
    persisted-info))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/card/:card-id"
  "Fetch a particular [[PersistedInfo]] by card-id."
  [{:keys [card-id]} :- [:map
                         [:card-id ms/PositiveInt]]]
  (api/let-404 [persisted-info (first (fetch-persisted-info {:card-id card-id} nil nil))]
    (api/read-check (t2/select-one :model/Database :id (:database_id persisted-info)))
    persisted-info))

(def ^:private CronSchedule
  "Schema representing valid cron schedule for refreshing persisted models."
  (mu/with-api-error-message
   [:and
    ms/NonBlankString
    [:fn {:error/message (deferred-tru "String representing a cron schedule")} #(= 7 (count (str/split % #" ")))]]
   (deferred-tru "Value must be a string representing a cron schedule of format <seconds> <minutes> <hours> <day of month> <month> <day of week> <year>")))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/set-refresh-schedule"
  "Set the cron schedule to refresh persisted models.
   Shape should be JSON like {cron: \"0 30 1/8 * * ? *\"}."
  [_route-params
   _query-params
   {:keys [cron], :as _body} :- [:map
                                 [:cron CronSchedule]]]
  (perms/check-has-application-permission :setting)
  (when cron
    (when-not (and (string? cron)
                   (org.quartz.CronExpression/isValidExpression cron)
                   (str/ends-with? cron "*"))
      (throw (ex-info (tru "Must be a valid cron string not specifying a year")
                      {:status-code 400})))
    (model-persistence.settings/persisted-model-refresh-cron-schedule! cron))
  (task.persist-refresh/reschedule-refresh!)
  api/generic-204-no-content)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/enable"
  "Enable global setting to allow databases to persist models."
  []
  (perms/check-has-application-permission :setting)
  (log/info "Enabling model persistence")
  (model-persistence.settings/persisted-models-enabled! true)
  (task.persist-refresh/enable-persisting!)
  api/generic-204-no-content)

(defn- disable-persisting
  "Disables persistence.
  - update all [[PersistedInfo]] rows to be inactive and deletable
  - remove `:persist-models-enabled` from relevant [[Database]] settings
  - schedule a task to [[metabase.driver.ddl.interface/unpersist]] each table"
  []
  (let [id->db      (m/index-by :id (t2/select :model/Database))
        enabled-dbs (filter (comp :persist-models-enabled :settings) (vals id->db))]
    (log/info "Disabling model persistence")
    (doseq [db enabled-dbs]
      (t2/update! :model/Database (u/the-id db)
                  {:settings (not-empty (dissoc (:settings db) :persist-models-enabled))}))
    (task.persist-refresh/disable-persisting!)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/disable"
  "Disable global setting to allow databases to persist models. This will remove all tasks to refresh tables, remove
  that option from databases which might have it enabled, and delete all cached tables."
  []
  (perms/check-has-application-permission :setting)
  (when (model-persistence.settings/persisted-models-enabled)
    (try (model-persistence.settings/persisted-models-enabled! false)
         (disable-persisting)
         (catch Exception e
           ;; re-enable so can continue to attempt to clean up
           (model-persistence.settings/persisted-models-enabled! true)
           (throw e))))
  api/generic-204-no-content)

;;;
;;; Card endpoints
;;;

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/card/:card-id/persist"
  "Mark the model (card) as persisted. Runs the query and saves it to the database backing the card and hot swaps this
  query in place of the model's query."
  [{:keys [card-id]} :- [:map
                         [:card-id ms/PositiveInt]]]
  (premium-features/assert-has-feature :cache-granular-controls (tru "Granular cache controls"))
  (api/let-404 [{:keys [database_id] :as card} (t2/select-one :model/Card :id card-id)]
    (let [database (t2/select-one :model/Database :id database_id)]
      (api/write-check database)
      (when-not (driver.u/supports? (:engine database) :persist-models database)
        (throw (ex-info (tru "Database does not support persisting")
                        {:status-code 400
                         :database    (:name database)})))
      (when-not (driver.u/supports? (:engine database) :persist-models-enabled database)
        (throw (ex-info (tru "Persisting models not enabled for database")
                        {:status-code 400
                         :database    (:name database)})))
      (when-not (queries/model? card)
        (throw (ex-info (tru "Card is not a model") {:status-code 400})))
      (when-let [persisted-info (persisted-info/turn-on-model! api/*current-user-id* card)]
        (task.persist-refresh/schedule-refresh-for-individual! persisted-info))
      api/generic-204-no-content)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/card/:card-id/refresh"
  "Refresh the persisted model caching `card-id`."
  [{:keys [card-id]} :- [:map
                         [:card-id ms/PositiveInt]]]
  (api/let-404 [card           (t2/select-one :model/Card :id card-id)
                persisted-info (t2/select-one :model/PersistedInfo :card_id card-id)]
    (when (not (queries/model? card))
      (throw (ex-info (trs "Cannot refresh a non-model question") {:status-code 400})))
    (when (:archived card)
      (throw (ex-info (trs "Cannot refresh an archived model") {:status-code 400})))
    (api/write-check (t2/select-one :model/Database :id (:database_id persisted-info)))
    (task.persist-refresh/schedule-refresh-for-individual! persisted-info)
    api/generic-204-no-content))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/card/:card-id/unpersist"
  "Unpersist this model. Deletes the persisted table backing the model and all queries after this will use the card's
  query rather than the saved version of the query."
  [{:keys [card-id]} :- [:map
                         [:card-id ms/PositiveInt]]]
  (premium-features/assert-has-feature :cache-granular-controls (tru "Granular cache controls"))
  (api/let-404 [_card (t2/select-one :model/Card :id card-id)]
    (when-let [persisted-info (t2/select-one :model/PersistedInfo :card_id card-id)]
      (api/write-check (t2/select-one :model/Database :id (:database_id persisted-info)))
      (persisted-info/mark-for-pruning! {:id (:id persisted-info)} "off"))
    api/generic-204-no-content))

;;;
;;; Database endpoints
;;;

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/database/:id/persist"
  "Attempt to enable model persistence for a database. If already enabled returns a generic 204."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check (model-persistence.settings/persisted-models-enabled)
             400
             (tru "Persisting models is not enabled."))
  (api/let-404 [database (t2/select-one :model/Database :id id)]
    (api/write-check database)
    (if (-> database :settings :persist-models-enabled)
      ;; todo: some other response if already persisted?
      api/generic-204-no-content
      (let [[success? error] (ddl.i/check-can-persist database)
            schema           (ddl.i/schema-name database (system/site-uuid))]
        (if success?
          ;; do secrets require special handling to not clobber them or mess up encryption?
          (do (t2/update! :model/Database id {:settings (assoc (:settings database) :persist-models-enabled true)})
              (task.persist-refresh/schedule-persistence-for-database!
               database
               (model-persistence.settings/persisted-model-refresh-cron-schedule))
              api/generic-204-no-content)
          (throw (ex-info (ddl.i/error->message error schema)
                          {:error error
                           :database (:name database)})))))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/database/:id/unpersist"
  "Attempt to disable model persistence for a database. If already not enabled, just returns a generic 204."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/let-404 [database (t2/select-one :model/Database :id id)]
    (api/write-check database)
    (if (-> database :settings :persist-models-enabled)
      (do (t2/update! :model/Database id {:settings (dissoc (:settings database) :persist-models-enabled)})
          (persisted-info/mark-for-pruning! {:database_id id})
          (task.persist-refresh/unschedule-persistence-for-database! database)
          api/generic-204-no-content)
      ;; todo: a response saying this was a no-op? an error? same on the post to persist
      api/generic-204-no-content)))
