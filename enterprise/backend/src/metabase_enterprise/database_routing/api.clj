(ns metabase-enterprise.database-routing.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.database-routing.core :as database-routing]
   [metabase.settings.core :as setting]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api.macros/defendpoint :post "/destination-database"
  "Create new Destination Databases.

  Note that unlike the normal `POST /api/database` endpoint, does NOT check the details before adding the Database.

  This is OK, it's not an invariant that all database details are always valid, but it's something to note."
  [_route-params
   {:keys [check_connection_details]} :- [:map
                                          [:check_connection_details {:optional true} ms/MaybeBooleanValue]]
   {:keys [router_database_id destinations]} :- [:map
                                                 [:router_database_id ms/PositiveInt]
                                                 [:destinations
                                                  [:sequential
                                                   [:map
                                                    [:name               ms/NonBlankString]
                                                    [:details            ms/Map]]]]]]
  (database-routing/route-database router_database_id destinations {:check-connection-details? true}))

(api.macros/defendpoint :put "/router-database/:id"
  "Updates an existing Database with the `user_attribute` to route on. Will either:
  - turn an existing Database into a Router database
  - change the `user_attribute` used to route for an existing Router database, or
  - turn a Router database into a regular Database
  depending on the value of `user_attribute`"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [user_attribute]} :- [:map [:user_attribute {:optional true} [:maybe ms/NonBlankString]]]]
  (let [db (t2/select-one :model/Database :id id)]
    (api/check-404 db)
    (api/check-400 (not (:router_database_id db)) "Cannot make a destination database a router database")
    (api/check-400 (not (:uploads_enabled db)) "Cannot enable database routing for a database with uploads enabled")
    (setting/with-database-local-values (:settings db)
      (api/check-400 (not (setting/get :persist-models-enabled)) "Cannot enable database routing for a database with model persistence enabled")
      (api/check-400 (not (setting/get :database-enable-actions)) "Cannot enable database routing for a database with actions enabled")))
  (if (nil? user_attribute)
    ;; delete the DatabaseRouter
    (let [db-router (t2/select-one :model/DatabaseRouter {:where [:and
                                                                  [:= :database_id id]
                                                                  [:not= :user_attribute nil]]})]
      (database-routing/delete-associated-database-router! id {:user-attribute (:user_attribute db-router)}))
    (database-routing/create-or-update-router id {:user-attribute user_attribute})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/database-routing` routes"
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
