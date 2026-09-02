(ns metabase.dashboards.db
  "Application database queries for the dashboards module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one :model/Dashboard :id dashboard-id))

(defn insert-dashboard!
  "Insert the Dashboard `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/Dashboard row))

(defn update-dashboard!
  "Apply `changes` to the Dashboard with `dashboard-id`."
  [dashboard-id changes]
  (t2/update! :model/Dashboard dashboard-id changes))

(defn delete-dashboard-revisions!
  "Delete the Revisions of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/delete! :model/Revision :model "Dashboard" :model_id dashboard-id))

(defn delete-pulses-for-dashboard!
  "Delete the Pulses of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/delete! :model/Pulse :dashboard_id dashboard-id))

(defn dashboard-tabs-for-dashboards
  "The DashboardTabs of the Dashboards with `dashboard-ids`, in dashboard then position order."
  [dashboard-ids]
  (t2/select :model/DashboardTab
             :dashboard_id [:in dashboard-ids]
             {:order-by [[:dashboard_id :asc] [:position :asc] [:id :asc]]}))

(defn dashcards-with-visible-cards-for-dashboards
  "The DashboardCards of the Dashboards with `dashboard-ids` whose Card is visible (unarchived, a dashboard question
  not archived by itself, or absent), with their Card's Collection authority level, in dashboard then creation order."
  [dashboard-ids]
  (t2/select :model/DashboardCard
             {:select    [:dashcard.* [:collection.authority_level :collection_authority_level]]
              :from      [[:report_dashboardcard :dashcard]]
              :left-join [[:report_card :card] [:= :dashcard.card_id :card.id]
                          [:collection :collection] [:= :collection.id :card.collection_id]]
              :where     [:and
                          [:in :dashcard.dashboard_id dashboard-ids]
                          [:or
                           ;; show it if:
                           ;; - the card isn't archived
                           [:= :card.archived false]
                           ;; - the card is archived BUT it's a dashboard question that wasn't archived by itself
                           [:and
                            [:not= :card.dashboard_id nil]
                            [:= :card.archived_directly false]]
                           [:= :card.archived nil]]] ; e.g. DashCards with no corresponding Card, e.g. text Cards
              :order-by  [[:dashcard.dashboard_id] [:dashcard.created_at :asc]]}))

(defn internal-dashboard-question-ids
  "The ids of the Cards internal to the Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-pks-set :model/Card :dashboard_id dashboard-id))

(defn set-cards-archived!
  "Set the archived flags of the Cards with `card-ids`."
  [card-ids archived?]
  (t2/update! :model/Card :id [:in card-ids] {:archived archived? :archived_directly archived?}))

(defn archive-dashboard-questions!
  "Archive the unarchived Cards internal to the Dashboard with `dashboard-id`, not directly."
  [dashboard-id]
  (t2/update! :model/Card :dashboard_id dashboard-id :archived false {:archived true :archived_directly false}))

(defn unarchive-dashboard-questions!
  "Unarchive the Cards internal to the Dashboard with `dashboard-id` that were not archived directly."
  [dashboard-id]
  (t2/update! :model/Card :dashboard_id dashboard-id :archived true :archived_directly false {:archived false}))

(defn move-dashboard-questions!
  "Move the Cards internal to the Dashboard with `dashboard-id` to the Collection with `collection-id`."
  [dashboard-id collection-id]
  (t2/update! :model/Card :dashboard_id dashboard-id {:collection_id collection-id}))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn card-query-columns
  "The query and schema of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one [:model/Card :dataset_query :card_schema] :id card-id))

(defn card-queries
  "A map of Card id to query for the Cards with `card-ids`."
  [card-ids]
  (t2/select-pk->fn :dataset_query :model/Card :id [:in card-ids]))

(defn document-cards-among
  "The Cards among `card-ids` that belong to a Document."
  [card-ids]
  (t2/select :model/Card :id [:in card-ids] :document_id [:<> nil]))

(defn insert-card!
  "Insert the Card `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/Card row))

(defn hydrate-card
  "Hydrate `:card` onto `dashcards`."
  [dashcards]
  (t2/hydrate dashcards :card))

(defn hydrate-card-details
  "Hydrate the creator, dashboard count, write flag, and Collection onto `card`."
  [card]
  (t2/hydrate card :creator :dashboard_count :can_write :collection))

(defn hydrate-dashcards
  "Hydrate `:dashcards` onto `dashboard`."
  [dashboard]
  (t2/hydrate dashboard :dashcards))

(defn hydrate-dashcards-with-cards
  "Hydrate `:dashcards` with their `:card` onto `dashboard`."
  [dashboard]
  (t2/hydrate dashboard [:dashcards :card]))

(defn hydrate-dashcards-cards-and-series
  "Hydrate `:dashcards` with their `:card` and `:series` onto `dashboards`."
  [dashboards]
  (t2/hydrate dashboards [:dashcards :card :series]))

(defn hydrate-series
  "Hydrate `:series` onto `dashcards`."
  [dashcards]
  (t2/hydrate dashcards :series))

(defn dashcard-serdes-columns
  "The id, Card, Action, parameter mappings, and visualization settings of the DashboardCards of the Dashboard with
  `dashboard-id`."
  [dashboard-id]
  (t2/select [:model/DashboardCard :id :card_id :action_id :parameter_mappings :visualization_settings]
             :dashboard_id dashboard-id))

(defn dashcard-series-columns
  "The id, Card id, and DashboardCard id of the DashboardCardSeries of the DashboardCards with `dashcard-ids`."
  [dashcard-ids]
  (t2/select [:model/DashboardCardSeries :id :card_id :dashboardcard_id] :dashboardcard_id [:in dashcard-ids]))

(defn series-cards-for-dashcards
  "The series Cards of the DashboardCards with `dashcard-ids`, each with its `:dashboardcard_id`, in series order."
  [dashcard-ids]
  (t2/select [:model/Card :id :name :description :display :dataset_query :type :database_id
              :visualization_settings :collection_id :card_schema :series.dashboardcard_id]
             {:left-join [[:dashboardcard_series :series] [:= :report_card.id :series.card_id]]
              :where     [:in :series.dashboardcard_id dashcard-ids]
              :order-by  [[:series.position :asc]]}))

(defn dashcard
  "The DashboardCard with `dashcard-id`, or nil."
  [dashcard-id]
  (t2/select-one :model/DashboardCard :id dashcard-id))

(defn dashcards-by-ids
  "The DashboardCards with `dashcard-ids`."
  [dashcard-ids]
  (t2/select :model/DashboardCard :id [:in dashcard-ids]))

(defn dashcards-in-tabs
  "The DashboardCards of the Dashboard with `dashboard-id` on the DashboardTabs with `tab-ids`."
  [dashboard-id tab-ids]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id :dashboard_tab_id [:in tab-ids]))

(defn insert-dashcards!
  "Insert the DashboardCard `rows` and return their ids."
  [rows]
  (t2/insert-returning-pks! :model/DashboardCard rows))

(defn update-dashcard!
  "Apply `changes` to the DashboardCard with `dashcard-id`."
  [dashcard-id changes]
  (t2/update! :model/DashboardCard dashcard-id changes))

(defn delete-dashcards!
  "Delete the DashboardCards with `dashcard-ids`."
  [dashcard-ids]
  (t2/delete! :model/DashboardCard :id [:in dashcard-ids]))

(defn delete-pulse-cards-for-dashcards!
  "Delete the PulseCards of the DashboardCards with `dashcard-ids`."
  [dashcard-ids]
  (t2/delete! :model/PulseCard :dashboard_card_id [:in dashcard-ids]))

(defn delete-series-for-dashcards!
  "Delete the DashboardCardSeries of the DashboardCards with `dashcard-ids`."
  [dashcard-ids]
  (t2/delete! :model/DashboardCardSeries :dashboardcard_id [:in dashcard-ids]))

(defn insert-dashcard-series!
  "Insert the DashboardCardSeries `rows`."
  [rows]
  (t2/insert! :model/DashboardCardSeries rows))

(defn rows
  "The rows returned by the Honey SQL `query`."
  [query]
  (t2/query query))

(defn dashboard-tab
  "The DashboardTab with `tab-id`, or nil."
  [tab-id]
  (t2/select-one :model/DashboardTab :id tab-id))

(defn insert-dashboard-tabs!
  "Insert the DashboardTab `rows` and return their ids."
  [rows]
  (t2/insert-returning-pks! :model/DashboardTab rows))

(defn update-dashboard-tab!
  "Apply `changes` to the DashboardTab with `tab-id`."
  [tab-id changes]
  (t2/update! :model/DashboardTab tab-id changes))

(defn delete-dashboard-tabs!
  "Delete the DashboardTabs with `tab-ids`."
  [tab-ids]
  (t2/delete! :model/DashboardTab :id [:in tab-ids]))
