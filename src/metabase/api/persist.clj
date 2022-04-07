(ns metabase.api.persist
  (:require [clojurewerkz.quartzite.conversion :as qc]
            [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.driver.ddl.interface :as ddl.i]
            [metabase.models.card :refer [Card]]
            [metabase.models.database :refer [Database]]
            [metabase.models.persisted-info :as persisted-info :refer [PersistedInfo]]
            [metabase.public-settings :as public-settings]
            [metabase.task :as task]
            [metabase.task.persist-refresh :as task.persist-refresh]
            [metabase.util :as u]
            [metabase.util.i18n :refer [deferred-tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(defn- fetch-persisted-info
  "Returns a list of persisted info, annotated with database_name, card_name, and schema_name."
  []
  (let [instance-id-str  (public-settings/site-uuid)
        db-id->fire-time (some->> (resolve 'metabase.task.persist-refresh/persistence-job-key)
                                  deref
                                  task/job-info
                                  :triggers
                                  (u/key-by (comp #(get % "db-id") qc/from-job-data :data))
                                  (m/map-vals :next-fire-time))]
    (->> (db/query {:select    [:p.id :p.database_id :p.columns :p.card_id
                                :p.active :p.state :p.error
                                :p.refresh_begin :p.refresh_end
                                :p.table_name
                                [:db.name :database_name] [:c.name :card_name]]
                    :from      [[PersistedInfo :p]]
                    :left-join [[Database :db] [:= :db.id :p.database_id]
                                [Card :c] [:= :c.id :p.card_id]]
                    :order-by  [[:p.refresh_begin :asc]]})
         (db/do-post-select PersistedInfo)
         (map (fn [{:keys [database_id] :as pi}]
                (assoc pi
                       :schema_name (ddl.i/schema-name {:id database_id} instance-id-str)
                       :next-fire-time (get db-id->fire-time database_id)))))))

(api/defendpoint GET "/"
  "List the entries of [[PersistedInfo]] in order to show a status page."
  []
  (api/check-superuser)
  (fetch-persisted-info))

(def ^:private HoursInterval
  "Schema representing valid interval hours for refreshing persisted models."
  (su/with-api-error-message
    (s/constrained s/Int #(<= 1 % 23)
                   (deferred-tru "Integer greater than or equal to one and less than twenty-four"))
    (deferred-tru "Value must be an integer representing hours greater than or equal to one and less than twenty-four")))

(api/defendpoint POST "/set-interval"
  "Set the interval (in hours) to refresh persisted models. Shape should be JSON like {hours: 4}."
  [:as {{:keys [hours], :as _body} :body}]
  {hours HoursInterval}
  (public-settings/persisted-model-refresh-interval-hours hours)
  (task.persist-refresh/reschedule-refresh)
  api/generic-204-no-content)

(api/define-routes)
