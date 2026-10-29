(ns metabase.dashboards.db
  "Application database queries for the dashboards module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.app-db.core :as mdb]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.queries.db :as queries.db]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn dashboard :- [:maybe ::dashboards.schema/dashboard]
  "The ::dashboards.schema/dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard :id [:auto/param dashboard-id]))

(mu/defn insert-dashboard!
  "Insert the Dashboard `row` and return the inserted instance."
  [row :- ::dashboards.schema/dashboard.update]
  (t2/insert-returning-instance! :model/Dashboard row))

(mu/defn update-dashboard!
  "Apply `changes` to the Dashboard with `dashboard-id`, returning the number updated.

  Takes the whole `::dashboard.update` — \"what an update (or insert) of a Dashboard accepts\" — the same
  schema [[insert-dashboard!]] takes. It was narrowed to `[:parameters]` when the only caller wrote nothing
  else; `metabase.dashboards.write/update-dashboard!` writes the full attribute set (`:name`, `:description`,
  `:archived`, `:collection_id`, `:cache_ttl`, ...), and a narrowed schema refuses every one of them."
  [dashboard-id :- ::lib.schema.id/dashboard
   changes      :- ::dashboards.schema/dashboard.update]
  (t2/update! :model/Dashboard dashboard-id changes))

(mu/defn delete-dashboard-revisions!
  "Delete the Revisions of the Dashboard with `dashboard-id`, returning the number deleted."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/delete! :model/Revision :model "Dashboard" :model_id dashboard-id))

(mu/defn delete-pulses-for-dashboard!
  "Delete the Pulses of the Dashboard with `dashboard-id`, returning the number deleted."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/delete! :model/Pulse :dashboard_id dashboard-id))

(mu/defn dashboard-tabs-for-dashboards
  "The DashboardTabs of the Dashboards with `dashboard-ids`, in dashboard then position order."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (t2/select :model/DashboardTab
             :dashboard_id [:in dashboard-ids]
             {:order-by [[:dashboard_id :asc] [:position :asc] [:id :asc]]}))

(mu/defn dashboard-collection-authority-levels
  "The id and Collection `authority_level` of the Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:set ::lib.schema.id/dashboard]]
  (mdb/query {:select    [:dashboard.id :collection.authority_level]
              :from      [[:report_dashboard :dashboard]]
              :left-join [[:collection :collection] [:= :collection.id :dashboard.collection_id]]
              :where     [:in :dashboard.id dashboard-ids]}))

(mu/defn dashcards-with-visible-cards-for-dashboards
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

(mu/defn set-cards-archived!
  "Set the archived flags of the Cards with `card-ids`, returning the number updated."
  [card-ids  :- [:sequential ::lib.schema.id/card]
   archived? :- :boolean]
  (t2/update! :model/Card :id [:in card-ids] {:archived archived? :archived_directly archived?}))

(mu/defn archive-dashboard-questions!
  "Archive the unarchived Cards internal to the Dashboard with `dashboard-id`, not directly, returning the number
  updated."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/update! :model/Card :dashboard_id dashboard-id :archived false {:archived true :archived_directly false}))

(mu/defn unarchive-dashboard-questions!
  "Unarchive the Cards internal to the Dashboard with `dashboard-id` that were not archived directly, returning the
  number updated."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/update! :model/Card :dashboard_id dashboard-id :archived true :archived_directly false {:archived false}))

(mu/defn move-dashboard-questions!
  "Move the Cards internal to the Dashboard with `dashboard-id` to the Collection with `collection-id`, returning
  the number updated."
  [dashboard-id  :- ::lib.schema.id/dashboard
   collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/update! :model/Card :dashboard_id dashboard-id {:collection_id collection-id}))

(mu/defn card-query-columns
  "The query-relevant columns of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (queries.db/card-query-info card-id))

(mu/defn insert-card!
  "Insert the Card `row` and return the inserted instance."
  [row :- ::queries.schema/card.update]
  (t2/insert-returning-instance! :model/Card row))

(mu/defn dashcard-serdes-columns
  "The id, Card, Action, parameter mappings, and visualization settings of the DashboardCards of the Dashboard with
  `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select [:model/DashboardCard :id :card_id :action_id :parameter_mappings :visualization_settings]
             :dashboard_id dashboard-id))

(mu/defn dashcard-series-columns
  "The id, Card id, and DashboardCard id of the DashboardCardSeries of the DashboardCards with `dashcard-ids`."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (t2/select [:model/DashboardCardSeries :id :card_id :dashboardcard_id] :dashboardcard_id [:in dashcard-ids]))

(mu/defn dashboard-card :- [:maybe ::dashboards.schema/dashboard-card]
  "The ::dashboards.schema/dashboard-card with `dashcard-id`, or nil."
  [dashcard-id :- ::lib.schema.id/dashcard]
  (t2/select-one :model/DashboardCard :id [:auto/param dashcard-id]))

(mu/defn multi-cards-for-dashcard
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

(mu/defn dashcards-by-ids
  "The DashboardCards with `dashcard-ids`."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (t2/select :model/DashboardCard :id [:in dashcard-ids]))

(mu/defn dashcards-in-tabs
  "The DashboardCards of the Dashboard with `dashboard-id` on the DashboardTabs with `tab-ids`."
  [dashboard-id :- ::lib.schema.id/dashboard
   tab-ids      :- [:sequential ms/PositiveInt]]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id :dashboard_tab_id [:in tab-ids]))

(mu/defn insert-dashcards!
  "Insert the DashboardCard `rows` and return their ids."
  [rows :- [:sequential
            ::dashboards.schema/dashboard-card.update]]
  (t2/insert-returning-pks! :model/DashboardCard rows))

(mu/defn update-dashcard!
  "Apply `changes` to the DashboardCard with `dashcard-id`, returning the number updated."
  [dashcard-id :- ::lib.schema.id/dashcard
   changes     :- ::dashboards.schema/dashboard-card.update]
  (t2/update! :model/DashboardCard dashcard-id changes))

(mu/defn delete-dashcards!
  "Delete the DashboardCards with `dashcard-ids`, returning the number deleted."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (t2/delete! :model/DashboardCard :id [:in dashcard-ids]))

(mu/defn delete-pulse-cards-for-dashcards!
  "Delete the PulseCards of the DashboardCards with `dashcard-ids`, returning the number deleted."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (t2/delete! :model/PulseCard :dashboard_card_id [:in dashcard-ids]))

(mu/defn delete-series-for-dashcards!
  "Delete the DashboardCardSeries of the DashboardCards with `dashcard-ids`, returning the number deleted."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (t2/delete! :model/DashboardCardSeries :dashboardcard_id [:in dashcard-ids]))

(mu/defn insert-dashcard-series!
  "Insert the DashboardCardSeries `rows`, returning the number inserted."
  [rows :- [:sequential
            (mut/select-keys ::dashboards.schema/dashboard-card-series.update [:dashboardcard_id :card_id :position])]]
  (t2/insert! :model/DashboardCardSeries rows))

(defn dashcard-card-ids
  "The Card ids of the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select-fn-vec :card_id :model/DashboardCard :dashboard_id dashboard-id))

(defn dashcard-series-card-ids
  "The Card ids of the DashboardCardSeries of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select-fn-vec :card_id :model/DashboardCardSeries
                    {:where [:in :dashboardcard_id
                             ^:allow-subquery {:select [:id]
                                               :from   [(t2/table-name :model/DashboardCard)]
                                               :where  [:= :dashboard_id dashboard-id]}]}))

(defn dashcard-action-ids
  "The Action ids of the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select-fn-vec :action_id :model/DashboardCard :dashboard_id dashboard-id))

(defn dashcard-parameter-mappings
  "A map of DashboardCard id to parameter mappings for the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select-pk->fn :parameter_mappings :model/DashboardCard :dashboard_id dashboard-id))

(defn dashcard-card-ids-by-dashcard-id
  "A map of DashboardCard id to Card id for the DashboardCards with `dashcard-ids` on the Dashboard with
  `dashboard-id`."
  [dashboard-id dashcard-ids]
  (t2/select-pk->fn :card_id :model/DashboardCard
                    :dashboard_id dashboard-id
                    :id           [:in dashcard-ids]))

;;; ----------------------------------------------- Link cards ----------------------------------------------------

(mu/defn ensure-integer-link-card-id
  "Return `id` if it is an integer, else throw a 400."
  [id :- ms/VisualizationSettingsValue]
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

(mu/defn link-card-entity
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

(mu/defn link-card-info-rows
  "The name, description, and related columns of the entities the link cards `link-card-model->ids`
  (`[[model #{ids}] ...]`) point at."
  [link-card-model->ids :- [:sequential [:tuple :string [:or [:set [:or :int :string]] [:sequential [:or :int :string]]]]]]
  (t2/query (link-card-info-query link-card-model->ids)))

(mu/defn dashboard-tab :- [:maybe ::dashboards.schema/dashboard-tab]
  "The ::dashboards.schema/dashboard-tab with `tab-id`, or nil."
  [tab-id :- ms/PositiveInt]
  (t2/select-one :model/DashboardTab :id [:auto/param tab-id]))

(mu/defn insert-dashboard-tabs!
  "Insert the DashboardTab `rows` and return their ids."
  [rows :- [:sequential
            (mut/select-keys ::dashboards.schema/dashboard-tab.update [:dashboard_id :name :position :entity_id])]]
  (t2/insert-returning-pks! :model/DashboardTab rows))

(mu/defn update-dashboard-tab!
  "Apply `changes` to the DashboardTab with `tab-id`, returning the number updated."
  [tab-id  :- ms/PositiveInt
   changes :- (mut/select-keys ::dashboards.schema/dashboard-tab.update [:name :position])]
  (t2/update! :model/DashboardTab tab-id changes))

(mu/defn delete-dashboard-tabs!
  "Delete the DashboardTabs with `tab-ids`, returning the number deleted."
  [tab-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/DashboardTab :id [:in tab-ids]))

(mu/defn dashboard-tabs
  "The DashboardTabs of the Dashboard with `dashboard-id`, in position order."
  [{:keys [dashboard-id]} :- [:map {:closed true}
                              [:dashboard-id ::lib.schema.id/dashboard]]]
  (t2/select :model/DashboardTab
             :dashboard_id [:auto/param dashboard-id]
             {:order-by [[:position :asc] [:id :asc]]}))

(mu/defn dashboard-tab-count
  "The number of DashboardTabs on the Dashboard with `dashboard-id`."
  [{:keys [dashboard-id]} :- [:map {:closed true}
                              [:dashboard-id ::lib.schema.id/dashboard]]]
  (t2/count :model/DashboardTab :dashboard_id [:auto/param dashboard-id]))

(mu/defn dashcards
  "The DashboardCards of the Dashboard with `dashboard-id`, in row then column order when `layout-order?`."
  [{:keys [dashboard-id layout-order?]} :- [:map {:closed true}
                                            [:dashboard-id  ::lib.schema.id/dashboard]
                                            [:layout-order? {:optional true} [:maybe :boolean]]]]
  (apply t2/select :model/DashboardCard
         :dashboard_id [:auto/param dashboard-id]
         (when layout-order? [{:order-by [[:row :asc] [:col :asc]]}])))

(mu/defn dashcard-ids-in-layout-order
  "The ids of the DashboardCards of the Dashboard with `dashboard-id`, in row then column order."
  [{:keys [dashboard-id]} :- [:map {:closed true}
                              [:dashboard-id ::lib.schema.id/dashboard]]]
  (t2/select-fn-vec :id :model/DashboardCard
                    :dashboard_id [:auto/param dashboard-id]
                    {:order-by [[:row :asc] [:col :asc]]}))

(mu/defn dashcards-for-card
  "The DashboardCards showing the Card with `card-id`."
  [{:keys [card-id]} :- [:map {:closed true}
                         [:card-id ::lib.schema.id/card]]]
  (t2/select :model/DashboardCard :card_id [:auto/param card-id]))

(mu/defn dashboard-ids-for-card
  "The ids of the Dashboards with a DashboardCard showing the Card with `card-id`."
  [{:keys [card-id]} :- [:map {:closed true}
                         [:card-id ::lib.schema.id/card]]]
  (t2/select-fn-set :dashboard_id :model/DashboardCard :card_id [:auto/param card-id]))

(mu/defn dashcard-card-ids-in-dashboards
  "The Card ids of the DashboardCards of the Dashboards with `dashboard-ids` (nil for DashboardCards without a Card),
  leaving out those of the Card with `except-card-id` when given."
  [{:keys [dashboard-ids except-card-id]} :- [:map {:closed true}
                                              [:dashboard-ids  ::dashboards.schema/dashboard-ids]
                                              [:except-card-id {:optional true} ::lib.schema.id/card]]]
  (apply t2/select-fn-vec :card_id [:model/DashboardCard :card_id]
         (cond-> [:dashboard_id [:in dashboard-ids]]
           except-card-id (conj :card_id [:not= [:auto/param except-card-id]]))))

(mu/defn dashcard-ids-by-card
  "A map of Card id to DashboardCard id for the DashboardCards of the Dashboard with `dashboard-id` showing one of
  `card-ids`."
  [{:keys [dashboard-id card-ids]} :- [:map {:closed true}
                                       [:dashboard-id ::lib.schema.id/dashboard]
                                       [:card-ids     [:set ::lib.schema.id/card]]]]
  (t2/select-fn->pk :card_id :model/DashboardCard
                    :dashboard_id [:auto/param dashboard-id]
                    :card_id [:in card-ids]))

(mu/defn dashcard-in-dashboard
  "The DashboardCard with `dashcard-id` on the Dashboard with `dashboard-id`, or nil."
  [{:keys [dashcard-id dashboard-id]} :- [:map {:closed true}
                                          [:dashcard-id  ::lib.schema.id/dashcard]
                                          [:dashboard-id ::lib.schema.id/dashboard]]]
  (t2/select-one :model/DashboardCard
                 :id [:auto/param dashcard-id]
                 :dashboard_id [:auto/param dashboard-id]))

(mu/defn dashcard-series-exists?
  "Whether the Card with `card-id` is a series of the DashboardCard with `dashcard-id`."
  [{:keys [card-id dashcard-id]} :- [:map {:closed true}
                                     [:card-id     [:maybe ::lib.schema.id/card]]
                                     [:dashcard-id [:maybe ::lib.schema.id/dashcard]]]]
  (t2/exists? :model/DashboardCardSeries :card_id card-id :dashboardcard_id dashcard-id))

(mu/defn dashboards-by-ids
  "The Dashboards with `dashboard-ids`."
  [{:keys [dashboard-ids]} :- [:map {:closed true}
                               [:dashboard-ids ::dashboards.schema/dashboard-ids]]]
  (t2/select :model/Dashboard :id [:in dashboard-ids]))

(mu/defn dashboard-by-entity-id
  "The Dashboard with `entity-id`, or nil."
  [{:keys [entity-id]} :- [:map {:closed true}
                           [:entity-id :string]]]
  (t2/select-one :model/Dashboard :entity_id [:auto/param entity-id]))

(mu/defn dashboard-names-by-id
  "A map of id to name for the Dashboards with `dashboard-ids`."
  [{:keys [dashboard-ids]} :- [:map {:closed true}
                               [:dashboard-ids ::dashboards.schema/dashboard-ids]]]
  (t2/select-pk->fn :name :model/Dashboard :id [:in dashboard-ids]))

(mu/defn dashboard-collection-ids
  "The id and Collection id of the Dashboards with `dashboard-ids`."
  [{:keys [dashboard-ids]} :- [:map {:closed true}
                               [:dashboard-ids ::dashboards.schema/dashboard-ids]]]
  (t2/select [:model/Dashboard :id :collection_id] :id [:in dashboard-ids]))

(mu/defn unarchived-dashboards-in-collection
  "The id, name, description, and Collection id of the unarchived Dashboards in the Collection with `collection-id` (nil
  for the root Collection), ordered by lowercase name."
  [{:keys [collection-id]} :- [:map {:closed true}
                               [:collection-id [:maybe ::lib.schema.id/collection]]]]
  (t2/select [:model/Dashboard :id :name :description :collection_id]
             :collection_id collection-id
             :archived false
             {:order-by [[:%lower.name :asc]]}))

(mu/defn dashboard-ids-in-collection
  "The ids of the Dashboards in the Collection with `collection-id` (nil for the root Collection), excluding archived
  ones when `skip-archived?`."
  [{:keys [collection-id skip-archived?]} :- [:map {:closed true}
                                              [:collection-id   [:maybe ::lib.schema.id/collection]]
                                              [:skip-archived?  {:optional true} [:maybe :boolean]]]]
  (t2/select-pks-set :model/Dashboard
                     {:where [:and [:= :collection_id collection-id] (when skip-archived? [:not :archived])]}))

(mu/defn unarchived-dashboard-ids-in-collections-reducible
  "Reducible `:id` rows of the unarchived Dashboards in the Collections with `collection-ids`."
  [{:keys [collection-ids]} :- [:map {:closed true}
                                [:collection-ids [:sequential ::lib.schema.id/collection]]]]
  (t2/reducible-select [:model/Dashboard :id]
                       {:where [:and [:= :archived false]
                                [:in :collection_id collection-ids]]}))

(mu/defn unarchived-dashboard-ids-and-public-uuids-by-prefix
  "The `:id` and `:public_uuid` of the unarchived Dashboards whose public uuid prefix is `prefix`."
  [{:keys [prefix]} :- [:map {:closed true}
                        [:prefix :string]]]
  (t2/select [:model/Dashboard :id :public_uuid] :public_uuid_prefix [:auto/param prefix] :archived false))

(mu/defn unarchived-dashboards-by-public-uuid-prefix
  "The unarchived Dashboards whose public uuid prefix is `prefix`."
  [{:keys [prefix]} :- [:map {:closed true}
                        [:prefix :string]]]
  (t2/select :model/Dashboard :public_uuid_prefix [:auto/param prefix] :archived false))

(mu/defn dashboard-exists?
  "Whether a Dashboard exists, matching `dashboard-id`, `archived?`, and whether it is `embedded?` or `public?` when
  given."
  [{:keys [dashboard-id archived? embedded? public?]} :- [:map {:closed true}
                                                          [:dashboard-id {:optional true} ::lib.schema.id/dashboard]
                                                          [:archived?    {:optional true} [:maybe :boolean]]
                                                          [:embedded?    {:optional true} [:maybe :boolean]]
                                                          [:public?      {:optional true} [:maybe :boolean]]]]
  (apply t2/exists? :model/Dashboard
         (cond-> []
           dashboard-id        (conj :id [:auto/param dashboard-id])
           (some? archived?)   (conj :archived [:auto/param archived?])
           embedded?           (conj :enable_embedding true)
           public?             (conj :public_uuid [:not= nil]))))

(mu/defn dashboard-exists-in-collections?
  "Whether a Dashboard, archived or unarchived as `archived?` says when given, exists in the Collections with
  `collection-ids`."
  [{:keys [collection-ids archived?]} :- [:map {:closed true}
                                          [:collection-ids [:sequential ::lib.schema.id/collection]]
                                          [:archived?      {:optional true} [:maybe :boolean]]]]
  (apply t2/exists? :model/Dashboard
         (cond-> [:collection_id [:in collection-ids]]
           (some? archived?) (conj :archived [:auto/param archived?]))))

(mu/defn dashboard-count
  "The number of Dashboards, counting only unarchived or archived ones when `archived?` is given, only those with
  embedding enabled when `embedded?`, and only those created at or after `created-since` when given."
  [{:keys [archived? embedded? created-since]} :- [:map {:closed true}
                                                   [:archived?     {:optional true} [:maybe :boolean]]
                                                   [:embedded?     {:optional true} [:maybe :boolean]]
                                                   [:created-since {:optional true} [:maybe ms/TemporalInstant]]]]
  (apply t2/count :model/Dashboard
         (cond-> []
           (some? archived?) (conj :archived [:auto/param archived?])
           embedded?         (conj :enable_embedding true)
           created-since     (conj :created_at [:>= [:auto/param created-since]]))))

(mu/defn dashboard-stats-columns
  "The creator, public uuid, parameters, and embedding columns of the non-internal Dashboards."
  []
  (t2/select [:model/Dashboard :creator_id :public_uuid :parameters :enable_embedding :embedding_params]
             {:where (mi/exclude-internal-content-hsql :model/Dashboard)}))

(mu/defn dashboards-with-listing-columns
  "The listing columns of the Dashboards with `dashboard-ids`."
  [{:keys [dashboard-ids]} :- [:map {:closed true}
                               [:dashboard-ids ::dashboards.schema/dashboard-ids]]]
  (t2/select [:model/Dashboard
              :id
              :description
              :collection_id
              :name
              :entity_id
              :archived
              :collection_position
              [:last_viewed_at :last_used_at]
              ["dashboard" :model]
              [nil :dashboard_id]
              [nil :location]
              [nil :database_id]]
             :id [:in dashboard-ids]))

(mu/defn recent-dashboards
  "The recently viewed Dashboards with `dashboard-ids`, with their Collection names."
  [{:keys [dashboard-ids]} :- [:map {:closed true}
                               [:dashboard-ids [:sequential ms/PositiveInt]]]]
  (t2/select [:model/Dashboard
              :id :name :collection_id :description
              :archived
              :collection.authority_level [:collection.name :collection_name]]
             {:where     [:in :report_dashboard.id dashboard-ids]
              :left-join [:collection [:= :collection.id :report_dashboard.collection_id]]}))

(mu/defn dashboards-for-recent-views
  "The Dashboards with `dashboard-ids` with their Collection and moderation status."
  [{:keys [dashboard-ids]} :- [:map {:closed true}
                               [:dashboard-ids [:sequential ::lib.schema.id/dashboard]]]]
  (t2/select :model/Dashboard
             {:select [:dash.id
                       :dash.name
                       :dash.description
                       :dash.archived
                       [:dash.collection_id :entity-coll-id]
                       [:c.id :collection_id]
                       [:c.name :collection_name]
                       [:c.authority_level :collection_authority_level]
                       [:mr.status :moderated-status]]
              :from [[:report_dashboard :dash]]
              :where [:in :dash.id dashboard-ids]
              :left-join [[:moderation_review :mr]
                          [:and
                           [:= :mr.moderated_item_id :dash.id]
                           [:= :mr.moderated_item_type "dashboard"]
                           [:= :mr.most_recent true]]
                          [:collection :c]
                          [:and
                           [:= :c.id :dash.collection_id]
                           [:= :c.archived false]]]}))
