(ns metabase.dashboards.db
  "Application database queries for the dashboards module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [medley.core :as m]
   [metabase.app-db.core :as mdb]
   [metabase.models.serialization :as serdes]
   [metabase.util.honey-sql-2 :as h2x]
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

;;; ----------------------------------------------- Link cards ----------------------------------------------------

(defn ensure-integer-link-card-id
  "Return `id` if it is an integer, else throw a 400."
  [id]
  (when-not (integer? id)
    (throw (ex-info "Link card entity id must be an integer"
                    {:status-code 400, :id id})))
  id)

(def ^:private all-card-info-columns
  {:model         :text
   :id            :integer
   :name          :text
   :description   :text

   ;; for cards and datasets
   :collection_id :integer
   :display       :text

   ;; for tables
   :db_id        :integer})

(def ^:private  link-card-columns-for-model
  {"database"   [:id :name :description]
   "table"      [:id [:display_name :name] :description :db_id]
   "dashboard"  [:id :name :description :collection_id]
   "card"       [:id :name :description :collection_id :display]
   "dataset"    [:id :name :description :collection_id :display]
   "collection" [:id :name :description]})

(defn- ->column-alias
  "Returns the column name. If the column is aliased, i.e. [`:original_name` `:aliased_name`], return the aliased
  column name"
  [column-or-aliased]
  (if (sequential? column-or-aliased)
    (second column-or-aliased)
    column-or-aliased))

(defn- select-clause-for-link-card-model
  "The search query uses a `union-all` which requires that there be the same number of columns in each of the segments
  of the query. This function will take the columns for `model` and will inject constant `nil` values for any column
  missing from `entity-columns` but found in `all-card-info-columns`."
  [model]
  (let [model-cols                       (link-card-columns-for-model model)
        model-col-alias->honeysql-clause (m/index-by ->column-alias model-cols)]
    (for [[col col-type] all-card-info-columns
          :let           [maybe-aliased-col (get model-col-alias->honeysql-clause col)]]
      (cond
        (= col :model)
        [(h2x/literal model) :model]

        maybe-aliased-col
        maybe-aliased-col

        ;; This entity is missing the column, project a null for that column value. For Postgres and H2, cast it to the
        ;; correct type, e.g.
        ;;
        ;;    SELECT cast(NULL AS integer)
        ;;
        ;; For MySQL, this is not needed.
        :else
        [(when-not (= (mdb/db-type) :mysql)
           [:cast nil col-type])
         col]))))

(defn link-card-info-query-for-model
  "Return a honeysql query that is used to fetch info for a linkcard."
  [model id-or-ids]
  ^:allow-subquery {:select (select-clause-for-link-card-model model)
                    :from   (t2/table-name (serdes/link-card-model->toucan-model model))
                    :where  (if (coll? id-or-ids)
                              [:in :id (mapv ensure-integer-link-card-id id-or-ids)]
                              [:= :id (ensure-integer-link-card-id id-or-ids)])})

(defn- link-card-info-query
  [link-card-model->ids]
  (if (= 1 (count link-card-model->ids))
    (apply link-card-info-query-for-model (first link-card-model->ids))
    {:select   [:*]
     :from     [[^:allow-subquery {:union-all (map #(apply link-card-info-query-for-model %) link-card-model->ids)}
                 :alias_is_required_by_sql_but_not_needed_here]]}))

(defn link-card-info-rows
  "The name, description, and related columns of the entities the link cards `link-card-model->ids`
  (`[[model #{ids}] ...]`) point at."
  [link-card-model->ids]
  (t2/query (link-card-info-query link-card-model->ids)))

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
