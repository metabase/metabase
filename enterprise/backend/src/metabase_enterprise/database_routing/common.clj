(ns metabase-enterprise.database-routing.common
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.config.core :as config]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.api :as api.database]
   [toucan2.core :as t2]))


;;; crud
;; add a database
(mu/defn- route-database*
  [parent-id :- ms/PositiveInt
   destinations :- [:sequential [:map [:name ms/NonBlankString] [:details ms/Map]]]
   {:keys [check-connection-details?] :as _options}]
  (api/check-400 (t2/exists? :model/DatabaseRouter :database_id parent-id))
  (api/check-400 (not (t2/exists? :model/Database :router_database_id parent-id :name [:in (map :name destinations)]))
                 "A destination database with that name already exists.")
  ;; todo: is it important that the details include :destination-database true? i don't think it is? but the FE sends
  ;; it. The backend never looks at it, and the e2e test succeeds without it. I think the link is :router_database_id
  ;; poitning at the parent.
  (let [{:keys [engine auto_run_queries is_on_demand] :as router-db} (t2/select-one :model/Database :id parent-id)]
    (if-let [invalid-destinations (and check-connection-details?
                                       (->> destinations
                                            (keep (fn [{details :details n :name}]
                                                    (let [details-or-error (api.database/test-connection-details (name engine) details)
                                                          valid?           (not= (:valid details-or-error) false)]
                                                      (when-not valid?
                                                        [n (dissoc details-or-error :valid)]))))
                                            seq))]
      {:status 400
       :body   (into {} invalid-destinations)}
      (u/prog1 (t2/insert-returning-instances!
                :model/Database
                (map (fn [{:keys [name details]}]
                       {:name               name
                        :engine             engine
                        :details            details
                        :auto_run_queries   auto_run_queries
                        :is_full_sync       false
                        :is_on_demand       is_on_demand
                        :cache_ttl          nil
                        :router_database_id parent-id
                        :creator_id         api/*current-user-id*})
                     destinations))
        (doseq [database <>]
          (events/publish-event! :event/database-create {:object  database
                                                         :user-id api/*current-user-id*
                                                         :details {:slug            name
                                                                   :primary_db_name (:name router-db)
                                                                   :primary_db_id   (:id router-db)}}))))))

(defenterprise route-database
  "OSS version throws an error. Enterprise version hooks them up."
  :feature :database-routing
  [parent-id destinations options]
  (route-database* parent-id destinations options))

(mu/defn- validate-routing-info
  [{:keys [user-attribute workspace-id] :as routing-info} :- [:or
                                                               [:map [:user-attribute string?]]
                                                               [:map [:workspace-id int?]]]]
  (when (or (and (str/blank? user-attribute) (nil? workspace-id))
            (and user-attribute workspace-id))
    (throw (ex-info "Must set user attribute or workspace id exclusively, not both" routing-info))))


;; make a database a router
(mu/defn- create-or-update-router!
  [db-id :- ms/PositiveInt {:keys [user-attribute workspace-id] :as routing-info} :- [:or
                                                                                      [:map [:user-attribute string?]]
                                                                                      [:map [:workspace-id int?]]]]
  (validate-routing-info routing-info)
  (let [db (t2/select-one :model/Database db-id)]
    (when-not (driver.u/supports? (:engine db) :database-routing db)
      (throw (ex-info "This database does not support DB routing" {:status-code 400})))

    (events/publish-event! :event/database-update {:object db
                                                   :previous-object db
                                                   :user-id api/*current-user-id*
                                                   :details {:db_routing :enabled
                                                             :routing_attribute routing-info}})
    (if user-attribute ;; upsert on the one row with a user_attribute value
      (cluster-lock/with-cluster-lock ::database-router-lock
        (if (t2/select-one :model/DatabaseRouter {:where [:and [:not= :user_attribute nil] [:= :database_id 1]]})
          (t2/update! :model/DatabaseRouter :database_id db-id {:user_attribute user-attribute})
          (t2/insert! :model/DatabaseRouter {:database_id db-id :user_attribute user-attribute})))

      (cluster-lock/with-cluster-lock ::database-router-lock
        (when-not (t2/exists? :model/DatabaseRouter {:where [:and [:= :workspace_id workspace-id] [:= :database_id 1]]})
          (t2/insert! :model/DatabaseRouter {:database_id db-id :workspace_id workspace-id}))))))

(mu/defn- router-enabled?*
  "Is there already a db_router entry for this database and this routing info (user attribute or workspace id)."
  [db-id route-info]
  (validate-routing-info route-info)
  (if (:user-attribute route-info)
    (t2/exists? :model/DatabaseRouter {:where [:and [:= :database_id db-id] [:= :user_attribute (:user-attribute route-info)]]})
    (t2/exists? :model/DatabaseRouter {:where [:and [:= :database_id db-id] [:= :workspace_id (:workspace-id route-info)]]})))


(defenterprise router-enabled?
  "Is routing already enabled for this database and this route-info? (user attribute or workspace id?). There's a
  create or update which works fine for the single routing in the regular app. But in workspaces it's not a single
  instance so we want a predicate."
  :feature :database-routing
  [db-id route-info]
  (router-enabled?* db-id route-info))

(defenterprise create-or-update-router
  "OSS version, errors"
  :feature :database-routing
  [db-id route-info]
  (create-or-update-router! db-id route-info))

(mu/defn- delete-router!
  [db-id {:keys [workspace-id user-attribute] :as routing-info}]
  (validate-routing-info routing-info)
  (let [db (t2/select-one :model/Database db-id)]
    (events/publish-event! :event/database-update {:object db
                                                   :previous-object db
                                                   :user-id api/*current-user-id*
                                                   :details {:db_routing :disabled}})
    (if workspace-id
      (t2/delete! :model/DatabaseRouter {:where [:and [:= :database_id db-id] [:== :workspace_id workspace-id]]})
      (t2/delete! :model/DatabaseRouter {:where [:and [:= :database_id db-id] [:== :user_attribute user-attribute]]}))))

(defenterprise delete-associated-database-router!
  "Deletes the Database Router associated with this router database."
  :feature :database-routing
  [db-id routing-info]
  (delete-router! db-id routing-info))

(defn- user-attribute
  "Which user attribute should we use for this RouterDB?"
  [db-or-id]
  (t2/select-one-fn :user_attribute :model/DatabaseRouter :database_id (u/the-id db-or-id)))

(def ^:dynamic ^:private *database-routing-on* :unset)

(defn router-db-or-id->destination-db-id
  "Given a user and a database (or id), returns the ID of the destination database that the user's query should ultimately be
  routed to. If the database is not a Router Database, returns `nil`. If the database is a Router Database but no
  current user exists, an exception will be thrown."
  [db-or-id]
  (when-let [attr-name (user-attribute db-or-id)]
    (let [database-name (get (api/current-user-attributes) attr-name)]
      (cond
         ;; if database routing is EXPLICITLY off, e.g. in `POST /api/database/:id/sync_schema`, don't do any routing.
        (= :off *database-routing-on*)
        nil

        (nil? @api/*current-user*)
        (throw (ex-info (tru "Anonymous users cannot access a database with routing enabled.") {:status-code 400}))

        (= database-name "__METABASE_ROUTER__")
        nil

         ;; superusers default to the Router Database
        (and (nil? database-name)
             api/*is-superuser?*)
        nil

         ;; non-superusers get an error
        (nil? database-name)
        (throw (ex-info (tru "Required user attribute is missing. Cannot route to a Destination Database.")
                        {:database-name database-name
                         :router-database-id (u/the-id db-or-id)
                         :status-code 400}))

        :else
        (or (t2/select-one-pk :model/Database
                              :router_database_id (u/the-id db-or-id)
                              :name database-name)
            (throw (ex-info (tru "Database Routing error: No Destination Database with slug `{0}` found."
                                 database-name)
                            {:database-name database-name
                             :router-database-id (u/the-id db-or-id)
                             :status-code 400})))))))

;; We want, at all times, a guarantee that we are not hitting a router *or* destination database without being
;; intentional about it. It would be bad to EITHER:
;;
;; - (a) accidentally hit a router database because we didn't include the middleware necessary to turn on Database
;; Routing, OR
;;
;; (b) accidentally hit a destination database when doing so is nonsensical, e.g. for database sync processes that should
;; only use router databases. In these cases we don't want database routing, we just want to ensure we're not hitting
;; a Destination Database
;;
;; The former looks like:
;; - I am looking at a Router Database,
;; - `router-db-or-id->destination-db-id` returns a *different* database ID, and
;; - `*database-routing-on*` is `:on` or `:unset`
;;
;; The latter looks like:
;; - I am looking at a destination Database,
;; - `*database-routing-on*` is `:off` or `:unset`

(defenterprise with-database-routing-on-fn
  "Enterprise version. Calls the function with Database Routing allowed."
  :feature :database-routing
  [f]
  (binding [*database-routing-on* :on]
    (f)))

(defenterprise with-database-routing-off-fn
  "Enterprise version. Calls the function with Database Routing prohibited."
  :feature :database-routing
  [f]
  (binding [*database-routing-on* :off]
    (f)))

(defn- is-disallowed-router-db-access?
  [db-or-id]
  (and (some-> (router-db-or-id->destination-db-id db-or-id)
               (not= db-or-id))
       (not= *database-routing-on* :off)))

(defn- is-disallowed-destination-db-access?
  [db-or-id]
  (and (t2/exists? :model/Database :id db-or-id :router_database_id [:not= nil])
       (not= *database-routing-on* :on)))

(defenterprise check-allowed-access!
  "This is intended as a safety harness. In dev/testing, if any access to a router or destination database is detected
  outside those circumstances where we've explicitly declared it okay, throw an exception.

  In production, skip this (fairly expensive) check.

  The idea here is that at all times we should be aware of whether:

  - we're explicitly accessing a router database (e.g. sync) and DO NOT want to reroute to a destination database, or

  - we're explicitly using the Database Routing feature (e.g. a query) and DO NOT want to access the router
  database (unless that was the user's intent, i.e. the user's attribute was `__METABASE_ROUTER__`) "
  :feature :database-routing
  [db-or-id-or-spec]
  (when-let [db-id (and (not config/is-prod?)
                        (u/id db-or-id-or-spec))]
    (when (is-disallowed-router-db-access? db-id)
      (throw (ex-info "Forbidden access to Router Database without `with-database-routing-off`" {})))
    (when (is-disallowed-destination-db-access? db-id)
      (throw (ex-info "Forbidden access to Destination Database without `with-database-routing-on`" {})))))
