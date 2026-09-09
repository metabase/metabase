(ns metabase.public-sharing-rest.db
  "Application database queries for the public sharing REST module. Every function here is a direct Toucan 2 call with
  no additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [malli.util :as mut]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.documents.schema :as documents.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ------------------------------------------------------ Cards -------------------------------------------------------

(def ^:private PublicCard
  "Rows returned by [[public-card]]."
  (mut/select-keys ::queries.schema/card.row
                   [:id :dataset_query :description :display :name :parameters :visualization_settings :card_schema]))

(mu/defn public-card :- [:maybe PublicCard]
  "The non-archived Card with `card-id`, restricted to the columns safe to expose publicly, or nil. With
  `:enable-embedding? true`, additionally requires embedding to be enabled."
  [card-id :- ::lib.schema.id/card
   & {:keys [enable-embedding?]} :- [:maybe [:map {:closed true} [:enable-embedding? {:optional true} [:maybe :boolean]]]]]
  (t2/select-one [:model/Card :id :dataset_query :description :display :name :parameters :visualization_settings
                  :card_schema]
                 {:where [:and
                          [:= :id card-id]
                          [:= :archived false]
                          (when enable-embedding? [:= :enable_embedding true])]}))

(mu/defn active-card :- [:maybe ::queries.schema/card.row]
  "The non-archived Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id :archived false))

(mu/defn active-card-in-document :- [:maybe ::queries.schema/card.row]
  "The non-archived Card with `card-id` that belongs to the Document with `document-id`, or nil."
  [card-id     :- ::lib.schema.id/card
   document-id :- ms/PositiveInt]
  (t2/select-one :model/Card :id card-id :document_id document-id :archived false))

;;; ---------------------------------------------------- Dashboards ----------------------------------------------------

(def ^:private PublicDashboard
  "Rows returned by [[public-dashboard]]."
  (mut/select-keys ::dashboards.schema/dashboard.row
                   [:name :description :id :parameters :auto_apply_filters :width]))

(mu/defn public-dashboard :- [:maybe PublicDashboard]
  "The non-archived Dashboard with `dashboard-id`, restricted to the columns safe to expose publicly, or nil. With
  `:enable-embedding? true`, additionally requires embedding to be enabled."
  [dashboard-id :- ::lib.schema.id/dashboard
   & {:keys [enable-embedding?]} :- [:maybe [:map {:closed true} [:enable-embedding? {:optional true} [:maybe :boolean]]]]]
  (t2/select-one [:model/Dashboard :name :description :id :parameters :auto_apply_filters :width]
                 {:where [:and
                          [:= :id dashboard-id]
                          [:= :archived false]
                          (when enable-embedding? [:= :enable_embedding true])]}))

(mu/defn dashcard :- [:maybe ::dashboards.schema/dashboard-card]
  "The DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ::lib.schema.id/dashcard]
  (t2/select-one :model/DashboardCard :id dashcard-id))

(mu/defn dashcard-id-in-dashboard :- [:maybe ::lib.schema.id/dashcard]
  "`dashcard-id` if that DashboardCard belongs to the Dashboard with `dashboard-id`, otherwise nil."
  [dashcard-id  :- ::lib.schema.id/dashcard
   dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-pk :model/DashboardCard :id dashcard-id :dashboard_id dashboard-id))

;;; ----------------------------------------------------- Documents ----------------------------------------------------

(def ^:private PublicDocument
  "Rows returned by [[public-document]]."
  (mut/select-keys ::documents.schema/document.row
                   [:id :name :document :content_type :created_at :updated_at]))

(mu/defn public-document :- [:maybe PublicDocument]
  "The non-archived Document with `document-id`, restricted to the columns safe to expose publicly."
  [document-id :- ms/PositiveInt]
  (t2/select-one [:model/Document :id :name :document :content_type :created_at :updated_at]
                 :id document-id, :archived false))

(def ^:private DocumentContent
  "Rows returned by [[document-content]]."
  (mut/select-keys ::documents.schema/document.row [:id :document :content_type]))

(mu/defn document-content :- [:maybe DocumentContent]
  "The id, content, and content type of the Document with `document-id`, or nil."
  [document-id :- ms/PositiveInt]
  (t2/select-one [:model/Document :id :document :content_type] :id document-id))
