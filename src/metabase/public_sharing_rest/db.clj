(ns metabase.public-sharing-rest.db
  "Application database queries for the public sharing REST module. Every function here is a direct Toucan 2 call with
  no additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ------------------------------------------------------ Cards -------------------------------------------------------

(mu/defn public-card
  "The non-archived Card with `card-id`, restricted to the columns safe to expose publicly, or nil. With
  `:enable-embedding? true`, additionally requires embedding to be enabled."
  [card-id :- [:maybe ::lib.schema.id/card]
   & {:keys [enable-embedding?]} :- [:maybe [:map {:closed true} [:enable-embedding? {:optional true} [:maybe :boolean]]]]]
  (when-not (or (nil? card-id) (pos-int? card-id))
    (throw (ex-info "card-id must be a positive integer" {:card-id card-id})))
  (t2/select-one [:model/Card :id :dataset_query :description :display :name :parameters :visualization_settings
                  :card_schema :type :entity_id :result_metadata :dimensions :dimension_mappings]
                 {:where [:and
                          [:= :id card-id]
                          [:= :archived false]
                          (when enable-embedding? [:= :enable_embedding true])]}))

(mu/defn active-card
  "The non-archived Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (when-not (pos-int? card-id)
    (throw (ex-info "card-id must be a positive integer" {:card-id card-id})))
  (t2/select-one :model/Card :id card-id :archived false))

(mu/defn active-card-in-document
  "The non-archived Card with `card-id` that belongs to the Document with `document-id`, or nil."
  [card-id     :- ::lib.schema.id/card
   document-id :- ms/PositiveInt]
  (when-not (pos-int? card-id)
    (throw (ex-info "card-id must be a positive integer" {:card-id card-id})))
  (when-not (pos-int? document-id)
    (throw (ex-info "document-id must be a positive integer" {:document-id document-id})))
  (t2/select-one :model/Card :id card-id :document_id document-id :archived false))

;;; ---------------------------------------------------- Dashboards ----------------------------------------------------

(mu/defn public-dashboard
  "The non-archived Dashboard with `dashboard-id`, restricted to the columns safe to expose publicly, or nil. With
  `:enable-embedding? true`, additionally requires embedding to be enabled."
  [dashboard-id :- [:maybe ::lib.schema.id/dashboard]
   & {:keys [enable-embedding?]} :- [:maybe [:map {:closed true} [:enable-embedding? {:optional true} [:maybe :boolean]]]]]
  (when-not (or (nil? dashboard-id) (pos-int? dashboard-id))
    (throw (ex-info "dashboard-id must be a positive integer" {:dashboard-id dashboard-id})))
  (t2/select-one [:model/Dashboard :name :description :id :parameters :auto_apply_filters :width]
                 {:where [:and
                          [:= :id dashboard-id]
                          [:= :archived false]
                          (when enable-embedding? [:= :enable_embedding true])]}))

(mu/defn dashcard
  "The DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ::lib.schema.id/dashcard]
  (when-not (pos-int? dashcard-id)
    (throw (ex-info "dashcard-id must be a positive integer" {:dashcard-id dashcard-id})))
  (t2/select-one :model/DashboardCard :id dashcard-id))

(mu/defn dashcard-id-in-dashboard
  "`dashcard-id` if that DashboardCard belongs to the Dashboard with `dashboard-id`, otherwise nil."
  [dashcard-id  :- ::lib.schema.id/dashcard
   dashboard-id :- ::lib.schema.id/dashboard]
  (when-not (pos-int? dashcard-id)
    (throw (ex-info "dashcard-id must be a positive integer" {:dashcard-id dashcard-id})))
  (when-not (pos-int? dashboard-id)
    (throw (ex-info "dashboard-id must be a positive integer" {:dashboard-id dashboard-id})))
  (t2/select-one-pk :model/DashboardCard :id dashcard-id :dashboard_id dashboard-id))

;;; ----------------------------------------------------- Documents ----------------------------------------------------

(mu/defn public-document
  "The non-archived Document with `document-id`, restricted to the columns safe to expose publicly."
  [document-id :- [:maybe ms/PositiveInt]]
  (when-not (or (nil? document-id) (pos-int? document-id))
    (throw (ex-info "document-id must be a positive integer" {:document-id document-id})))
  (t2/select-one [:model/Document :id :name :document :content_type :created_at :updated_at]
                 :id document-id, :archived false))

(mu/defn document-content
  "The id, content, and content type of the Document with `document-id`, or nil."
  [document-id :- [:maybe ms/PositiveInt]]
  (when-not (or (nil? document-id) (pos-int? document-id))
    (throw (ex-info "document-id must be a positive integer" {:document-id document-id})))
  (t2/select-one [:model/Document :id :document :content_type] :id document-id))

(mu/defn archivable-entity
  "The id and archived flag of the Card, Dashboard or Document with `id`, or nil."
  [model :- [:enum :model/Card :model/Dashboard :model/Document]
   id    :- ms/PositiveInt]
  (t2/select-one [model :id :archived] :id id))

;;; ----------------------------------------------------- Timelines ----------------------------------------------------

(mu/defn active-timeline-ids
  "The ids of the non-archived Timelines among `timeline-ids`."
  [timeline-ids :- [:set ms/PositiveInt]]
  (mdb/select-batched-set #(t2/select-pks-set :model/Timeline :id [:in %] :archived false) timeline-ids))

(mu/defn active-timeline-events
  "The non-archived TimelineEvents of the Timelines with `timeline-ids`, restricted to the columns safe to expose
  publicly, in timestamp order."
  [timeline-ids :- [:set ms/PositiveInt]]
  (vec (sort-by (juxt :timestamp :id)
                (mdb/select-batched #(t2/select [:model/TimelineEvent :id :timeline_id :name :description :icon :timestamp :timezone :time_matters
                                                 :archived :created_at]
                                                :timeline_id [:in %]
                                                :archived false
                                                {:order-by [[:timestamp :asc] [:id :asc]]})
                                    timeline-ids))))
