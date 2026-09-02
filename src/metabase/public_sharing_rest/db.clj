(ns metabase.public-sharing-rest.db
  "Application database queries for the public sharing REST module. Every function here is a direct Toucan 2 call with
  no additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

;;; ------------------------------------------------------ Cards -------------------------------------------------------

(defn public-card
  "The non-archived Card with `card-id`, restricted to the columns safe to expose publicly, or nil."
  [card-id]
  (t2/select-one [:model/Card :id :dataset_query :description :display :name :parameters :visualization_settings
                  :card_schema]
                 :id card-id :archived false))

(defn hydrate-card-param-fields
  "Hydrate `:param_fields` onto `card`."
  [card]
  (t2/hydrate card :param_fields))

(defn active-card
  "The non-archived Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id :archived false))

(defn active-card-in-document
  "The non-archived Card with `card-id` that belongs to the Document with `document-id`, or nil."
  [card-id document-id]
  (t2/select-one :model/Card :id card-id :document_id document-id :archived false))

;;; ---------------------------------------------------- Dashboards ----------------------------------------------------

(defn public-dashboard
  "The non-archived Dashboard with `dashboard-id`, restricted to the columns safe to expose publicly, or nil."
  [dashboard-id]
  (t2/select-one [:model/Dashboard :name :description :id :parameters :auto_apply_filters :width]
                 :id dashboard-id :archived false))

(defn hydrate-public-dashboard
  "Hydrate the dashcards (with their cards, series, and actions), tabs, and `:param_fields` onto `dashboard`."
  [dashboard]
  (t2/hydrate dashboard [:dashcards :card :series :dashcard/action] :tabs :param_fields))

(defn dashcard
  "The DashboardCard with `dashcard-id`, or nil."
  [dashcard-id]
  (t2/select-one :model/DashboardCard :id dashcard-id))

(defn dashcard-id-in-dashboard
  "`dashcard-id` if that DashboardCard belongs to the Dashboard with `dashboard-id`, otherwise nil."
  [dashcard-id dashboard-id]
  (t2/select-one-pk :model/DashboardCard :id dashcard-id :dashboard_id dashboard-id))

;;; ----------------------------------------------------- Documents ----------------------------------------------------

(defn public-document
  "The non-archived Document with `document-id`, restricted to the columns safe to expose publicly."
  [document-id]
  (t2/select-one [:model/Document :id :name :document :content_type :created_at :updated_at]
                 :id document-id, :archived false))

(defn hydrate-document-cards
  "Hydrate `:cards` onto `document`."
  [document]
  (t2/hydrate document :cards))

(defn document-content
  "The id, content, and content type of the Document with `document-id`, or nil."
  [document-id]
  (t2/select-one [:model/Document :id :document :content_type] :id document-id))
