(ns metabase-enterprise.database-routing.api
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.database :as api.database]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver :as driver]
   [metabase.events :as events]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api.macros/defendpoint :post "/"
  "Create new Mirror Databases."
  [_route-params
   _query-params
   {:keys [router_database_id mirrors]} :- [:map
                                            [:router_database_id ms/PositiveInt]
                                            [:mirrors
                                             [:sequential
                                              [:map
                                               [:name               ms/NonBlankString]
                                               [:details            ms/Map]]]]]]
  (api/check-superuser)
  (api/check-400 (t2/exists? :model/DatabaseRouter :database_id router_database_id))
  (let [{:keys [engine auto_run_queries is_on_demand]} (t2/select-one :model/Database :id router_database_id)
        details-or-errors                              (map (fn [{:keys [details] n :name}]
                                                              {:details-or-error (api.database/test-connection-details (name engine) details)
                                                               :name             n})
                                                            mirrors)
        is-valid?                                      #(not= (:valid (:details-or-error %)) false)]
    (if (every? is-valid? details-or-errors)
      (u/prog1 (t2/insert-returning-instances!
                :model/Database
                (map (fn [{:keys [name details-or-error]}]
                       {:name               name
                        :engine             engine
                        :details            details-or-error
                        :auto_run_queries   auto_run_queries
                        :is_full_sync       false
                        :is_on_demand       is_on_demand
                        :cache_ttl          nil
                        :router_database_id router_database_id
                        :creator_id         api/*current-user-id*})
                     details-or-errors))
        (doseq [database <>]
          (events/publish-event! :event/database-create {:object database :user-id api/*current-user-id*})
          (analytics/track-event! :snowplow/database
                                  {:event        :database-connection-successful
                                   :database     engine
                                   :database-id  (u/the-id database)
                                   :source       :admin
                                   :dbms-version (:version (driver/dbms-version (keyword engine) database))})))
      (do
        (analytics/track-event! :snowplow/database
                                {:event    :database-connection-failed
                                 :database engine
                                 :source   :admin})
        {:status 400
         :body   (->> details-or-errors
                      (remove is-valid?)
                      (map (fn [{:keys [details-or-error name]}]
                             (-> details-or-error
                                 (dissoc :valid)
                                 (merge {:name name})))))}))))

(api.macros/defendpoint :put "/database/:id"
  "Mark a database as a router database"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [user_attribute]} :- [:map
                                [:user_attribute ms/NonBlankString]]]
  (api/check-404 (t2/exists? :model/Database :id id))
  (api/check-400 (not (t2/exists? :model/DatabaseRouter :database_id id)))
  (t2/insert-returning-instance! :model/DatabaseRouter :user_attribute user_attribute :database_id id))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/database-routing` routes"
  (api.macros/ns-handler *ns* +auth))
