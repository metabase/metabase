(ns metabase.agent-api.db
  "Application database queries for the agent API module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn collection-breadcrumb-columns
  "The id, name, location, owner, namespace, and archival of the Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one [:model/Collection :id :name :location :personal_owner_id :namespace :archived_directly]
                 collection-id))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one :model/Dashboard :id dashboard-id))

(defn dashboard-tab-names
  "The id and name of the DashboardTabs of the Dashboard with `dashboard-id`, in position order."
  [dashboard-id]
  (t2/select [:model/DashboardTab :id :name] :dashboard_id dashboard-id {:order-by [[:position :asc] [:id :asc]]}))

(defn dashboard-tab-ids
  "The ids of the DashboardTabs of the Dashboard with `dashboard-id`, in position order."
  [dashboard-id]
  (t2/select-pks-vec :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc] [:id :asc]]}))

(defn insert-dashboard!
  "Insert the Dashboard `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/Dashboard row))

(defn insert-dashcard!
  "Insert the DashboardCard `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/DashboardCard row))

(defn dashcard-ids-in-layout-order
  "The ids of the DashboardCards of the Dashboard with `dashboard-id`, in row then column order."
  [dashboard-id]
  (t2/select-fn-vec :id :model/DashboardCard :dashboard_id dashboard-id {:order-by [[:row :asc] [:col :asc]]}))

(defn dashcards
  "The DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(defn dashcard-in-dashboard
  "The DashboardCard with `dashcard-id` on the Dashboard with `dashboard-id`, or nil."
  [dashcard-id dashboard-id]
  (t2/select-one :model/DashboardCard :id dashcard-id :dashboard_id dashboard-id))

(defn update-dashcard!
  "Apply `changes` to the DashboardCard with `dashcard-id`."
  [dashcard-id changes]
  (t2/update! :model/DashboardCard dashcard-id changes))

(defn update-dashboard!
  "Apply `changes` to the Dashboard with `dashboard-id`."
  [dashboard-id changes]
  (t2/update! :model/Dashboard dashboard-id changes))

(defn active-user-by-email
  "The active User with `email`, compared case-insensitively, or nil."
  [email]
  (t2/select-one :model/User :%lower.email (u/lower-case-en email) :is_active true))
