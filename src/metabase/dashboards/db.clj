(ns metabase.dashboards.db
  "Application database queries for the dashboards module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.app-db.core :as mdb]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.serialization :as serdes]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn dashboard :- [:maybe ::dashboards.schema/dashboard]
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn insert-dashboard! :- (mut/optional-keys ::dashboards.schema/dashboard)
  "Insert the Dashboard `row` and return the inserted instance."
  [row :- ::dashboards.schema/dashboard.update]
  (t2/insert-returning-instance! :model/Dashboard row))

(mu/defn update-dashboard! :- :int
  "Apply `changes` to the Dashboard with `dashboard-id`, returning the number updated."
  [dashboard-id :- ::lib.schema.id/dashboard
   changes      :- (mut/select-keys ::dashboards.schema/dashboard.update [:parameters])]
  (t2/update! :model/Dashboard dashboard-id changes))

(mu/defn delete-dashboard-revisions! :- :int
  "Delete the Revisions of the Dashboard with `dashboard-id`, returning the number deleted."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/delete! :model/Revision :model "Dashboard" :model_id dashboard-id))

(mu/defn delete-pulses-for-dashboard! :- :int
  "Delete the Pulses of the Dashboard with `dashboard-id`, returning the number deleted."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/delete! :model/Pulse :dashboard_id dashboard-id))

(mu/defn dashboard-tabs-for-dashboards :- [:sequential ::dashboards.schema/dashboard-tab]
  "The DashboardTabs of the Dashboards with `dashboard-ids`, in dashboard then position order."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (t2/select :model/DashboardTab
             :dashboard_id [:in dashboard-ids]
             {:order-by [[:dashboard_id :asc] [:position :asc] [:id :asc]]}))

(def ^:private DashboardCollectionAuthorityLevel
  "Rows returned by [[dashboard-collection-authority-levels]]."
  [:map {:closed true}
   [:id ms/PositiveInt]
   [:authority_level [:maybe [:or :keyword :string]]]])

(mu/defn dashboard-collection-authority-levels :- [:sequential
                                                   DashboardCollectionAuthorityLevel]
  "The id and Collection `authority_level` of the Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:set ::lib.schema.id/dashboard]]
  (mdb/query {:select    [:dashboard.id :collection.authority_level]
              :from      [[:report_dashboard :dashboard]]
              :left-join [[:collection :collection] [:= :collection.id :dashboard.collection_id]]
              :where     [:in :dashboard.id dashboard-ids]}))

(mu/defn dashcards-with-visible-cards-for-dashboards :- [:sequential (mut/optional-keys (mut/open-schema (mr/schema ::dashboards.schema/dashboard-card)))]
  "The DashboardCards of the Dashboards with `dashboard-ids` whose Card is visible (unarchived, a dashboard question
  not archived by itself, or absent), with their Card's Collection authority level, in dashboard then creation order."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
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

(mu/defn internal-dashboard-question-ids :- [:maybe [:set ::lib.schema.id/card]]
  "The ids of the Cards internal to the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-pks-set :model/Card :dashboard_id dashboard-id))

(mu/defn set-cards-archived! :- :int
  "Set the archived flags of the Cards with `card-ids`, returning the number updated."
  [card-ids  :- [:sequential ::lib.schema.id/card]
   archived? :- :boolean]
  (t2/update! :model/Card :id [:in card-ids] {:archived archived? :archived_directly archived?}))

(mu/defn archive-dashboard-questions! :- :int
  "Archive the unarchived Cards internal to the Dashboard with `dashboard-id`, not directly, returning the number
  updated."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/update! :model/Card :dashboard_id dashboard-id :archived false {:archived true :archived_directly false}))

(mu/defn unarchive-dashboard-questions! :- :int
  "Unarchive the Cards internal to the Dashboard with `dashboard-id` that were not archived directly, returning the
  number updated."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/update! :model/Card :dashboard_id dashboard-id :archived true :archived_directly false {:archived false}))

(mu/defn move-dashboard-questions! :- :int
  "Move the Cards internal to the Dashboard with `dashboard-id` to the Collection with `collection-id`, returning
  the number updated."
  [dashboard-id  :- ::lib.schema.id/dashboard
   collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/update! :model/Card :dashboard_id dashboard-id {:collection_id collection-id}))

(mu/defn card :- [:maybe ::queries.schema/card]
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn card-query-columns :- [:maybe (mut/select-keys ::queries.schema/card [:dataset_query :card_schema])]
  "The query and schema of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :dataset_query :card_schema] :id card-id))

(mu/defn card-queries :- [:map-of ::lib.schema.id/card [:maybe ::lib-be.schema/maybe-legacy-or-empty-query]]
  "A map of Card id to query for the Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (t2/select-pk->fn :dataset_query :model/Card :id [:in card-ids]))

(mu/defn document-cards-among :- [:sequential ::queries.schema/card]
  "The Cards among `card-ids` that belong to a Document."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select :model/Card :id [:in card-ids] :document_id [:<> nil]))

(mu/defn insert-card! :- (mut/optional-keys ::queries.schema/card)
  "Insert the Card `row` and return the inserted instance."
  [row :- ::queries.schema/card.update]
  (t2/insert-returning-instance! :model/Card row))

(mu/defn dashcard-serdes-columns :- [:sequential (mut/select-keys ::dashboards.schema/dashboard-card [:id :card_id :action_id :parameter_mappings :visualization_settings])]
  "The id, Card, Action, parameter mappings, and visualization settings of the DashboardCards of the Dashboard with
  `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select [:model/DashboardCard :id :card_id :action_id :parameter_mappings :visualization_settings]
             :dashboard_id dashboard-id))

(mu/defn dashcard-series-columns :- [:sequential (mut/select-keys ::dashboards.schema/dashboard-card-series [:id :card_id :dashboardcard_id])]
  "The id, Card id, and DashboardCard id of the DashboardCardSeries of the DashboardCards with `dashcard-ids`."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (t2/select [:model/DashboardCardSeries :id :card_id :dashboardcard_id] :dashboardcard_id [:in dashcard-ids]))

(mu/defn series-cards-for-dashcards :- [:sequential (mut/optional-keys (mut/open-schema (mr/schema ::queries.schema/card)))]
  "The series Cards of the DashboardCards with `dashcard-ids`, each with its `:dashboardcard_id`, in series order."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (t2/select [:model/Card :id :name :description :display :dataset_query :type :database_id
              :visualization_settings :collection_id :card_schema :series.dashboardcard_id]
             {:left-join [[:dashboardcard_series :series] [:= :report_card.id :series.card_id]]
              :where     [:in :series.dashboardcard_id dashcard-ids]
              :order-by  [[:series.position :asc]]}))

(mu/defn dashcard :- [:maybe ::dashboards.schema/dashboard-card]
  "The DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ::lib.schema.id/dashcard]
  (t2/select-one :model/DashboardCard :id dashcard-id))

(mu/defn multi-cards-for-dashcard :- [:sequential :map]
  "The unarchived Cards added to the DashboardCard with `dashcard-id` as series (the 'add series' feature)."
  [dashcard-id :- [:maybe ::lib.schema.id/dashcard]]
  (mdb/query {:select    [:newcard.*]
              :from      [[:report_dashboardcard :dashcard]]
              :left-join [[:dashboardcard_series :dashcardseries]
                          [:= :dashcard.id :dashcardseries.dashboardcard_id]
                          [:report_card :newcard]
                          [:= :dashcardseries.card_id :newcard.id]]
              :where     [:and
                          [:= :newcard.archived false]
                          [:= :dashcard.id dashcard-id]]}))

(mu/defn dashcards-by-ids :- [:sequential ::dashboards.schema/dashboard-card]
  "The DashboardCards with `dashcard-ids`."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (t2/select :model/DashboardCard :id [:in dashcard-ids]))

(mu/defn dashcards-in-tabs :- [:sequential ::dashboards.schema/dashboard-card]
  "The DashboardCards of the Dashboard with `dashboard-id` on the DashboardTabs with `tab-ids`."
  [dashboard-id :- ::lib.schema.id/dashboard
   tab-ids      :- [:sequential ms/PositiveInt]]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id :dashboard_tab_id [:in tab-ids]))

(mu/defn insert-dashcards! :- [:sequential ::lib.schema.id/dashcard]
  "Insert the DashboardCard `rows` and return their ids."
  [rows :- [:sequential
            ::dashboards.schema/dashboard-card.update]]
  (t2/insert-returning-pks! :model/DashboardCard rows))

(mu/defn update-dashcard! :- :int
  "Apply `changes` to the DashboardCard with `dashcard-id`, returning the number updated."
  [dashcard-id :- ::lib.schema.id/dashcard
   changes     :- ::dashboards.schema/dashboard-card.update]
  (t2/update! :model/DashboardCard dashcard-id changes))

(mu/defn delete-dashcards! :- :int
  "Delete the DashboardCards with `dashcard-ids`, returning the number deleted."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (t2/delete! :model/DashboardCard :id [:in dashcard-ids]))

(mu/defn delete-pulse-cards-for-dashcards! :- :int
  "Delete the PulseCards of the DashboardCards with `dashcard-ids`, returning the number deleted."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (t2/delete! :model/PulseCard :dashboard_card_id [:in dashcard-ids]))

(mu/defn delete-series-for-dashcards! :- :int
  "Delete the DashboardCardSeries of the DashboardCards with `dashcard-ids`, returning the number deleted."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (t2/delete! :model/DashboardCardSeries :dashboardcard_id [:in dashcard-ids]))

(mu/defn insert-dashcard-series! :- :int
  "Insert the DashboardCardSeries `rows`, returning the number inserted."
  [rows :- [:sequential
            (mut/select-keys ::dashboards.schema/dashboard-card-series.update [:dashboardcard_id :card_id :position])]]
  (t2/insert! :model/DashboardCardSeries rows))

;;; ----------------------------------------------- Link cards ----------------------------------------------------

(mu/defn ensure-integer-link-card-id :- :int
  "Return `id` if it is an integer, else throw a 400."
  [id :- :some]
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

(defn- link-card-info-query-for-model
  "Return a honeysql query that is used to fetch info for a linkcard."
  [model id-or-ids]
  ^:allow-subquery {:select (select-clause-for-link-card-model model)
                    :from   (t2/table-name (serdes/link-card-model->toucan-model model))
                    :where  (if (coll? id-or-ids)
                              [:in :id (mapv ensure-integer-link-card-id id-or-ids)]
                              [:= :id (ensure-integer-link-card-id id-or-ids)])})

(mu/defn link-card-entity :- [:maybe :map]
  "The instance of the link-card `model` (a string like \"card\" or \"table\") with `id`, projected the same way as
  [[link-card-info-rows]], or nil."
  [model :- :string
   id    :- [:or :int :string]]
  (t2/select-one (serdes/link-card-model->toucan-model model) (link-card-info-query-for-model model id)))

(defn- link-card-info-query
  [link-card-model->ids]
  (if (= 1 (count link-card-model->ids))
    (apply link-card-info-query-for-model (first link-card-model->ids))
    {:select   [:*]
     :from     [[^:allow-subquery {:union-all (map #(apply link-card-info-query-for-model %) link-card-model->ids)}
                 :alias_is_required_by_sql_but_not_needed_here]]}))

(mu/defn link-card-info-rows :- [:sequential :map]
  "The name, description, and related columns of the entities the link cards `link-card-model->ids`
  (`[[model #{ids}] ...]`) point at."
  [link-card-model->ids :- [:sequential [:tuple :string [:sequential [:or :int :string]]]]]
  (t2/query (link-card-info-query link-card-model->ids)))

(mu/defn dashboard-tab :- [:maybe ::dashboards.schema/dashboard-tab]
  "The DashboardTab with `tab-id`, or nil."
  [tab-id :- ms/PositiveInt]
  (t2/select-one :model/DashboardTab :id tab-id))

(mu/defn insert-dashboard-tabs! :- [:sequential ms/PositiveInt]
  "Insert the DashboardTab `rows` and return their ids."
  [rows :- [:sequential
            (mut/select-keys ::dashboards.schema/dashboard-tab.update [:dashboard_id :name :position :entity_id])]]
  (t2/insert-returning-pks! :model/DashboardTab rows))

(mu/defn update-dashboard-tab! :- :int
  "Apply `changes` to the DashboardTab with `tab-id`, returning the number updated."
  [tab-id  :- ms/PositiveInt
   changes :- (mut/select-keys ::dashboards.schema/dashboard-tab.update [:name :position])]
  (t2/update! :model/DashboardTab tab-id changes))

(mu/defn delete-dashboard-tabs! :- :int
  "Delete the DashboardTabs with `tab-ids`, returning the number deleted."
  [tab-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/DashboardTab :id [:in tab-ids]))
