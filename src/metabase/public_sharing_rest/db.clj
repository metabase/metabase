(ns metabase.public-sharing-rest.db
  "Application database queries for the public sharing REST module. Every function here is a direct Toucan 2 call with
  no additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ------------------------------------------------------ Cards -------------------------------------------------------

(mu/defn public-card :- [:maybe (ms/InstanceOf :model/Card)]
  "The non-archived Card with `card-id`, restricted to the columns safe to expose publicly, or nil. With
  `:enable-embedding? true`, additionally requires embedding to be enabled."
  [card-id :- ms/PositiveInt
   & {:keys [enable-embedding?]} :- [:maybe [:map {:closed true} [:enable-embedding? {:optional true} [:maybe :boolean]]]]]
  (t2/select-one [:model/Card :id :dataset_query :description :display :name :parameters :visualization_settings
                  :card_schema]
                 {:where [:and
                          [:= :id card-id]
                          [:= :archived false]
                          (when enable-embedding? [:= :enable_embedding true])]}))

(mu/defn active-card :- [:maybe (ms/InstanceOf :model/Card)]
  "The non-archived Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/Card :id card-id :archived false))

(mu/defn active-card-in-document :- [:maybe (ms/InstanceOf :model/Card)]
  "The non-archived Card with `card-id` that belongs to the Document with `document-id`, or nil."
  [card-id     :- ms/PositiveInt
   document-id :- ms/PositiveInt]
  (t2/select-one :model/Card :id card-id :document_id document-id :archived false))

;;; ---------------------------------------------------- Dashboards ----------------------------------------------------

(mu/defn public-dashboard :- [:maybe (ms/InstanceOf :model/Dashboard)]
  "The non-archived Dashboard with `dashboard-id`, restricted to the columns safe to expose publicly, or nil. With
  `:enable-embedding? true`, additionally requires embedding to be enabled."
  [dashboard-id :- ms/PositiveInt
   & {:keys [enable-embedding?]} :- [:maybe [:map {:closed true} [:enable-embedding? {:optional true} [:maybe :boolean]]]]]
  (t2/select-one [:model/Dashboard :name :description :id :parameters :auto_apply_filters :width]
                 {:where [:and
                          [:= :id dashboard-id]
                          [:= :archived false]
                          (when enable-embedding? [:= :enable_embedding true])]}))

(mu/defn dashcard :- [:maybe (ms/InstanceOf :model/DashboardCard)]
  "The DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ms/PositiveInt]
  (t2/select-one :model/DashboardCard :id dashcard-id))

(mu/defn dashcard-id-in-dashboard :- [:maybe ms/PositiveInt]
  "`dashcard-id` if that DashboardCard belongs to the Dashboard with `dashboard-id`, otherwise nil."
  [dashcard-id  :- ms/PositiveInt
   dashboard-id :- ms/PositiveInt]
  (t2/select-one-pk :model/DashboardCard :id dashcard-id :dashboard_id dashboard-id))

;;; ----------------------------------------------------- Documents ----------------------------------------------------

(mu/defn public-document :- [:maybe (ms/InstanceOf :model/Document)]
  "The non-archived Document with `document-id`, restricted to the columns safe to expose publicly."
  [document-id :- ms/PositiveInt]
  (t2/select-one [:model/Document :id :name :document :content_type :created_at :updated_at]
                 :id document-id, :archived false))

(mu/defn document-content :- [:maybe (ms/InstanceOf :model/Document)]
  "The id, content, and content type of the Document with `document-id`, or nil."
  [document-id :- ms/PositiveInt]
  (t2/select-one [:model/Document :id :document :content_type] :id document-id))
