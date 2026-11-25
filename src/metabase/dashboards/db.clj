(ns metabase.dashboards.db
  "Application database queries for the dashboards module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [java-time.api :as t]
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.app-db.core :as mdb]
   [metabase.collections.listing :as collections.listing]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.collections.schema :as collections.schema]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.embedding.settings :as embed.settings]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.queries.core :as queries]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.revisions.sql :as revisions.sql]
   [metabase.serialization.core :as serialization]
   [metabase.settings.core :as setting]
   [metabase.staleness.core :as staleness]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn synced-dashboard-tabs-clause :- [:fn vector?]
  "The clause over the DashboardTab table aliased `alias` selecting the tabs of the Dashboards remote sync syncs."
  [alias :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  (remote-sync/synced-fk-clause alias :dashboard_id :model/Dashboard opts))

(mu/defn synced-dashcards-clause :- [:fn vector?]
  "The clause over the DashboardCard table aliased `alias` selecting the cards of the Dashboards remote sync syncs."
  [alias :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  (remote-sync/synced-fk-clause alias :dashboard_id :model/Dashboard opts))

(mu/defn synced-dashboards-clause :- [:fn vector?]
  "The clause over the Dashboard table aliased `alias` selecting the Dashboards remote sync syncs."
  [alias :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  [:and
   (when-not (:include-archived? opts)
     [:= (u/qualified-key alias :archived) false])
   (remote-sync/synced-fk-clause alias :collection_id :model/Collection opts)])

(mu/defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn dashcards
  "The DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn dashcards-of-dashboards
  "The DashboardCards of the Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (mdb/select-batched #(t2/select :model/DashboardCard :dashboard_id [:in %]) dashboard-ids))

(mu/defn hydrate-snapshot-parts
  "The `dashboards` with their `:tabs` and their `:dashcards`, each of which with its `:series`, as a Revision records a
  Dashboard."
  [dashboards :- [:sequential ::dashboards.schema/dashboard]]
  (t2/hydrate dashboards :tabs [:dashcards :series]))

(mu/defn hydrate-series
  "The DashboardCards `dashcards` with their `:series`."
  [dashcards :- [:sequential ::dashboards.schema/dashboard-card]]
  (t2/hydrate dashcards :series))

(mu/defn active-card-ids-for-dashboard
  "The ids among `card-ids` of unarchived Cards that belong to the Dashboard with `dashboard-id` or to no Dashboard."
  [card-ids     :- [:sequential ::lib.schema.id/card]
   dashboard-id :- ::lib.schema.id/dashboard]
  (mdb/select-batched-set #(t2/select-pks-set :model/Card
                                              {:where [:and
                                                       [:in :id %]
                                                       [:= :archived false]
                                                       [:or
                                                        [:= :dashboard_id dashboard-id]
                                                        [:= :dashboard_id nil]]]}) card-ids))

(mu/defn active-card-ids
  "The ids among `card-ids` of unarchived Cards."
  [card-ids :- [:set ::lib.schema.id/card]]
  (mdb/select-batched-set #(t2/select-pks-set :model/Card {:where [:and [:in :id %] [:= :archived false]]}) card-ids))

(mu/defn dashboard-collection-rows
  "The Dashboards with `dashboard-ids` narrowed to `:id` and `:collection_id`, the columns their permission hydrations
  read."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (mdb/select-batched #(t2/select [:model/Dashboard :id :collection_id] :id [:in %]) dashboard-ids))

(mu/defn dashboards
  "The Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (mdb/select-batched #(t2/select :model/Dashboard :id [:in %]) dashboard-ids))

(mu/defn insert-dashboards!
  "Insert the Dashboard `rows` and return the inserted instances, in the order of the rows."
  [rows :- [:sequential ::dashboards.schema/dashboard.create]]
  (mdb/insert-returning-instances! :model/Dashboard rows))

(mu/defn update-dashboards!
  "Apply `changes` to the Dashboards with `dashboard-ids`, returning the number updated."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]
   changes       :- (mut/dissoc ::dashboards.schema/dashboard.update :id)]
  (mdb/sum-batched mdb/update-partition-size #(t2/update! :model/Dashboard :id [:in %] changes) dashboard-ids))

(mu/defn dashboards-by-ids
  "The Dashboards with `dashboard-ids`, by id."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (mdb/select-batched-map #(t2/select-pk->fn identity :model/Dashboard :id [:in %]) dashboard-ids))

(mu/defn update-dashboards-by-changes! :- :nil
  "Apply each of `updates`, the `:id` of a Dashboard and the columns to change, with one statement for each set of columns
  that rows have in common."
  [updates :- [:sequential :map]]
  (mdb/update-grouped! :model/Dashboard updates)
  nil)

(mu/defn pulse-ids-for-dashboards
  "The ids of the Pulses of the Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (mdb/select-batched #(t2/select-pks-vec :model/Pulse :dashboard_id [:in %]) dashboard-ids))

(mu/defn dashboard-tabs-for-dashboards
  "The DashboardTabs of the Dashboards with `dashboard-ids`, in dashboard then position order."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (vec (sort-by :dashboard_id
                (mdb/select-batched #(t2/select :model/DashboardTab
                                                :dashboard_id [:in %]
                                                {:order-by [[:dashboard_id :asc] [:position :asc] [:id :asc]]})
                                    dashboard-ids))))

(mu/defn dashboard-collection-authority-levels
  "The id and Collection `authority_level` of the Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:set ::lib.schema.id/dashboard]]
  (mdb/select-batched #(mdb/query {:select    [:dashboard.id :collection.authority_level]
                                   :from      [[(t2/table-name :model/Dashboard) :dashboard]]
                                   :left-join [[(t2/table-name :model/Collection) :collection] [:= :collection.id :dashboard.collection_id]]
                                   :where     [:in :dashboard.id %]})
                      dashboard-ids))

(mu/defn dashcards-with-visible-cards-for-dashboards
  "The DashboardCards of the Dashboards with `dashboard-ids` whose Card is visible (unarchived, a dashboard question
  not archived by itself, or absent), with their Card's Collection authority level, in dashboard then creation order."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (vec (sort-by :dashboard_id
                (mdb/select-batched
                 #(t2/select :model/DashboardCard
                             {:select    [:dashcard.* [:collection.authority_level :collection_authority_level]]
                              :from      [[(t2/table-name :model/DashboardCard) :dashcard]]
                              :left-join [[(t2/table-name :model/Card) :card] [:= :dashcard.card_id :card.id]
                                          [(t2/table-name :model/Collection) :collection] [:= :collection.id :card.collection_id]]
                              :where     [:and
                                          [:in :dashcard.dashboard_id %]
                                          [:or
                                           ;; show it if:
                                           ;; - the card isn't archived
                                           [:= :card.archived false]
                                           ;; - the card is archived BUT it's a dashboard question that wasn't archived by itself
                                           [:and
                                            [:not= :card.dashboard_id nil]
                                            [:= :card.archived_directly false]]
                                           [:= :card.archived nil]]] ; e.g. DashCards with no corresponding Card, e.g. text Cards
                              :order-by  [[:dashcard.dashboard_id] [:dashcard.created_at :asc] [:dashcard.id :asc]]})
                 dashboard-ids))))

(mu/defn internal-dashboard-question-ids
  "The ids of the Cards internal to the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-pks-set :model/Card :dashboard_id dashboard-id))

(mu/defn cards-to-set-archived
  "The Cards with `card-ids` whose `archived` flag differs from `archived?`, which setting it changes."
  [card-ids  :- [:sequential ::lib.schema.id/card]
   archived? :- :boolean]
  (mdb/select-batched #(t2/select :model/Card :id [:in %] :archived (not archived?)) card-ids))

(mu/defn questions-archived-with-dashboards
  "The unarchived Cards internal to the Dashboards with `dashboard-ids`, which archiving them archives along with them."
  [dashboard-ids :- [:sequential {:min 1} ::lib.schema.id/dashboard]]
  (mdb/select-batched #(t2/select :model/Card :dashboard_id [:in [:auto/param %]] :archived false) dashboard-ids))

(mu/defn questions-restored-with-dashboards
  "The Cards internal to the Dashboards with `dashboard-ids` that were archived along with them, which restoring them
  restores."
  [dashboard-ids :- [:sequential {:min 1} ::lib.schema.id/dashboard]]
  (mdb/select-batched #(t2/select :model/Card :dashboard_id [:in [:auto/param %]] :archived true :archived_directly false)
                      dashboard-ids))

(mu/defn question-ids-archived-with-dashboards
  "The IDs of the unarchived Cards internal to the Dashboards with `dashboard-ids`, which archiving them archives along
  with them."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (not-empty (mdb/select-batched #(t2/select-pks-vec :model/Card :dashboard_id [:in %] :archived false) dashboard-ids)))

(mu/defn question-ids-restored-with-dashboards
  "The IDs of the Cards internal to the Dashboards with `dashboard-ids` that were archived along with them, which
  restoring them restores."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (not-empty (mdb/select-batched #(t2/select-pks-vec :model/Card :dashboard_id [:in %] :archived true :archived_directly false)
                                 dashboard-ids)))

(mu/defn question-ids-of-dashboards
  "The IDs of the Cards internal to the Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (not-empty (mdb/select-batched #(t2/select-pks-vec :model/Card :dashboard_id [:in %]) dashboard-ids)))

(mu/defn cards-by-ids
  "The Cards with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select :model/Card :id [:in %]) ids))

(mu/defn actions-by-ids
  "The Actions with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select :model/Action :id [:in %]) ids))

(mu/defn card-query-columns
  "The query-relevant columns of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (queries/card-query-info card-id))

(mu/defn card-collection-ids :- [:map-of ::lib.schema.id/card [:maybe ::lib.schema.id/collection]]
  "A map of Card id to the id of its Collection, nil for the root, for the Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (mdb/select-batched-map #(t2/select-pk->fn :collection_id :model/Card :id [:in %]) card-ids))

(mu/defn card-queries
  "A map of Card id to query for the Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (mdb/select-batched-map #(t2/select-pk->fn :dataset_query :model/Card :id [:in %]) card-ids))

(defn dashboard-question-exists?
  "Does the Dashboard with `dashboard-id` hold an unarchived Card saved inside it?"
  [dashboard-id]
  (t2/exists? :model/Card :dashboard_id dashboard-id :archived false))

(defn card-internal-to-other-dashboard?
  "Is any Card among `card-ids` saved inside a dashboard other than the one with `dashboard-id`?"
  [dashboard-id card-ids]
  (boolean (some #(t2/exists? :model/Card
                              {:where [:and
                                       [:not= :dashboard_id dashboard-id]
                                       [:not= :dashboard_id nil]
                                       [:in :id %]]})
                 (mdb/select-partitions card-ids))))

(mu/defn action-entity-ids-in
  "The entity ids among `entity-ids` that name an existing Action."
  [entity-ids :- [:set :string]]
  (mdb/select-batched-set #(t2/select-fn-set :entity_id [:model/Action :entity_id] :entity_id [:in %]) entity-ids))

(mu/defn dashcard-series-columns
  "The id, Card id, and DashboardCard id of the DashboardCardSeries of the DashboardCards with `dashcard-ids`."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (mdb/select-batched #(t2/select [:model/DashboardCardSeries :id :card_id :dashboardcard_id] :dashboardcard_id [:in %])
                      dashcard-ids))

(mu/defn series-cards-for-dashcards
  "The series Cards of the DashboardCards with `dashcard-ids`, each with its `:dashboardcard_id`, in series order."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (mdb/select-batched #(t2/select [:model/Card :id :name :description :display :dataset_query :type :database_id
                                   :visualization_settings :collection_id :card_schema :entity_id :result_metadata
                                   :dimensions :dimension_mappings :series.dashboardcard_id]
                                  {:left-join [[(t2/table-name :model/DashboardCardSeries) :series] [:= (u/qualified-key (t2/table-name :model/Card) :id) :series.card_id]]
                                   :where     [:in :series.dashboardcard_id %]
                                   :order-by  [[:series.position :asc]]})
                      dashcard-ids))

(mu/defn dashcard-cards-for-dashboards
  "The `:dashboard_id` and `:card_id` of every DashboardCard of the Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (t2/select [:model/DashboardCard :dashboard_id :card_id] :dashboard_id [:in dashboard-ids]))

(mu/defn dashcard-series-cards-for-dashboards
  "The owning Dashboard id and the series `:card_id` of every DashboardCardSeries on a DashboardCard of the Dashboards
  with `dashboard-ids`."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (mdb/query {:select [[:dashcard.dashboard_id :dashboard_id] [:series.card_id :card_id]]
              :from   [[(t2/table-name :model/DashboardCardSeries) :series]]
              :join   [[(t2/table-name :model/DashboardCard) :dashcard] [:= :dashcard.id :series.dashboardcard_id]]
              :where  [:in :dashcard.dashboard_id dashboard-ids]}))

(mu/defn parameters-for-dashboards
  "The id, `:parameters`, and `:embedding_params` of the Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (t2/select [:model/Dashboard :id :parameters :embedding_params] :id [:in dashboard-ids]))

(mu/defn dashcard
  "The DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ::lib.schema.id/dashcard]
  (t2/select-one :model/DashboardCard :id dashcard-id))

(mu/defn multi-cards-for-dashcard
  "The unarchived Cards added to the DashboardCard with `dashcard-id` as series (the 'add series' feature)."
  [dashcard-id :- [:maybe ::lib.schema.id/dashcard]]
  (mdb/query {:select    [:newcard.*]
              :from      [[(t2/table-name :model/DashboardCard) :dashcard]]
              :left-join [[(t2/table-name :model/DashboardCardSeries) :dashcardseries]
                          [:= :dashcard.id :dashcardseries.dashboardcard_id]
                          [(t2/table-name :model/Card) :newcard]
                          [:= :dashcardseries.card_id :newcard.id]]
              :where     [:and
                          [:= :newcard.archived false]
                          [:= :dashcard.id dashcard-id]]}))

(mu/defn dashcards-by-ids
  "The DashboardCards with `dashcard-ids`."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (mdb/select-batched #(t2/select :model/DashboardCard :id [:in %]) dashcard-ids))

(mu/defn id->dashcard
  "The DashboardCards with `dashcard-ids`, by id."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (mdb/select-batched-map #(t2/select-pk->fn identity :model/DashboardCard :id [:in %]) dashcard-ids))

(mu/defn dashcards-in-tabs
  "The DashboardCards of the Dashboard with `dashboard-id` on the DashboardTabs with `tab-ids`."
  [dashboard-id :- ::lib.schema.id/dashboard
   tab-ids      :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select :model/DashboardCard :dashboard_id dashboard-id :dashboard_tab_id [:in %]) tab-ids))

(mu/defn insert-dashcards!
  "Insert the DashboardCard `rows` and return the inserted instances, in the order of the rows."
  [rows :- [:sequential (mut/dissoc ::dashboards.schema/dashboard-card.update :id)]]
  (mdb/insert-returning-instances! :model/DashboardCard rows))

(mu/defn update-dashcards! :- :nil
  "Apply each of `updates`, the `:id` of a DashboardCard and the columns to change, with one statement for each set of columns
  that rows have in common."
  [updates :- [:sequential :map]]
  (mdb/update-grouped! :model/DashboardCard updates)
  nil)

(mu/defn delete-dashcards!
  "Delete the DashboardCards with `dashcard-ids`, returning the number deleted."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (mdb/sum-batched mdb/delete-partition-size #(t2/delete! :model/DashboardCard :id [:in %]) dashcard-ids))

(mu/defn dashcard-series-for-dashcards
  "The DashboardCardSeries of the DashboardCards with `dashcard-ids`."
  [dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
  (mdb/select-batched #(t2/select :model/DashboardCardSeries :dashboardcard_id [:in %]) dashcard-ids))

(mu/defn dashcard-series-by-ids
  "The DashboardCardSeries with `series-ids`."
  [series-ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select :model/DashboardCardSeries :id [:in %]) series-ids))

(defn parameter-card-card-ids
  "The Card ids referenced by the ParameterCards of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select-fn-vec :card_id :model/ParameterCard
                    :parameterized_object_type "dashboard"
                    :parameterized_object_id   dashboard-id))

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
  (mdb/select-batched-map #(t2/select-pk->fn :card_id :model/DashboardCard
                                             :dashboard_id dashboard-id
                                             :id           [:in %])
                          dashcard-ids))

;;; ----------------------------------------------- Link cards ----------------------------------------------------

(defn ensure-integer-link-card-id
  "Return `id`, a value the client sent as the id of a link card's entity, if it is an integer, else throw a 400."
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
   "document"   [:id :name :collection_id]
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
                    :from   (t2/table-name (serialization/link-card-model->toucan-model model))
                    :where  (if (coll? id-or-ids)
                              [:in :id (mapv ensure-integer-link-card-id id-or-ids)]
                              [:= :id (ensure-integer-link-card-id id-or-ids)])})

(mu/defn link-card-entity
  "The instance of the link-card `model` (a string like \"card\" or \"table\") with `id`, projected the same way as
  [[link-card-info-rows]], or nil."
  [model :- :string
   id    :- [:or :int :string]]
  (if (= model "collection")
    (some-> (t2/select-one [:model/Collection :id :name :description :type :namespace]
                           :id (ensure-integer-link-card-id id))
            (assoc :model model))
    (t2/select-one (serialization/link-card-model->toucan-model model)
                   (h2x/assert-map-or-nil! (link-card-info-query-for-model model id)))))

(mu/defn link-card-entities
  "The instances of the link-card `model` (a string like \"card\" or \"table\") with integer `ids`, projected like
  [[link-card-entity]]; none for an unknown model."
  [model :- :string
   ids   :- [:sequential :int]]
  (cond
    (empty? ids)
    []

    (= model "collection")
    (mapv #(assoc % :model model)
          (mdb/select-batched #(t2/select [:model/Collection :id :name :description :type :namespace] :id [:in %]) ids))

    (contains? serialization/link-card-model->toucan-model model)
    (mdb/select-batched #(t2/select (serialization/link-card-model->toucan-model model)
                                    (h2x/assert-map-or-nil! (link-card-info-query-for-model model %)))
                        ids)

    :else
    []))

(defn- link-card-info-query
  [link-card-model->ids]
  (if (= 1 (count link-card-model->ids))
    (apply link-card-info-query-for-model (first link-card-model->ids))
    {:select   [:*]
     :from     [[^:allow-subquery {:union-all (map #(apply link-card-info-query-for-model %) link-card-model->ids)}
                 :alias_is_required_by_sql_but_not_needed_here]]}))

(mu/defn link-card-collection-read-columns :- [:map-of ms/PositiveInt :map]
  "The `:type` and `:namespace` of the Collections with `collection-ids`, the columns their read check reads that
  [[link-card-info-rows]] does not carry, keyed by id."
  [collection-ids :- [:sequential [:or :int :string]]]
  (into {}
        (map (juxt :id #(select-keys % [:type :namespace])))
        (mdb/select-batched #(t2/select [:model/Collection :id :type :namespace]
                                        :id [:in (mapv ensure-integer-link-card-id %)])
                            collection-ids)))

(mu/defn link-card-info-rows
  "The name, description, and related columns of the entities the link cards `link-card-model->ids`
  (`[[model #{ids}] ...]`) point at."
  [link-card-model->ids :- [:sequential [:tuple :string [:or [:set [:or :int :string]] [:sequential [:or :int :string]]]]]]
  (mdb/select-batched #(t2/query (link-card-info-query (map (fn [[model model-pairs]] [model (mapv second model-pairs)])
                                                            (group-by first %))))
                      (for [[model ids] link-card-model->ids
                            id          ids]
                        [model id])))

(mu/defn dashcard-reference-problems :- [:map {:closed true}
                                         [:document-card-ids [:sequential ms/PositiveInt]]
                                         [:tab-dashboard-ids [:map-of ms/PositiveInt ms/PositiveInt]]]
  "What the checks of the DashboardCards that are about to be written read: the ids among `card-ids` of Cards that belong
  to a Document, and a map from each of `tab-ids` to the Dashboard it belongs to, each read once, nil for none."
  [tab-ids  :- [:maybe [:sequential ms/PositiveInt]]
   card-ids :- [:maybe [:sequential ms/PositiveInt]]]
  {:document-card-ids (mdb/select-batched #(t2/select-pks-vec :model/Card :id [:in %] :document_id [:<> nil]) card-ids)
   :tab-dashboard-ids (mdb/select-batched-map #(t2/select-pk->fn :dashboard_id :model/DashboardTab :id [:in %]) tab-ids)})

(mu/defn pulse-cards-in-tabs
  "The PulseCards of the DashboardCards on the DashboardTabs with `tab-ids`, which the delete of the tabs deletes with
  them."
  [tab-ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select :model/PulseCard
                                  :dashboard_card_id [:in ^:allow-subquery {:select [:id]
                                                                            :from   [(t2/table-name :model/DashboardCard)]
                                                                            :where  [:in :dashboard_tab_id %]}])
                      tab-ids))

(mu/defn delete-dashboard-tabs!
  "Delete the DashboardTabs with `tab-ids`, returning the number deleted."
  [tab-ids :- [:sequential ms/PositiveInt]]
  (mdb/sum-batched mdb/delete-partition-size #(t2/delete! :model/DashboardTab :id [:in %]) tab-ids))

(mu/defn dashcards-serdes-columns
  "The id, Dashboard id, Card, Action, parameter mappings, and visualization settings of the DashboardCards of the
  Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (mdb/select-batched #(t2/select [:model/DashboardCard :id :dashboard_id :card_id :action_id :parameter_mappings :visualization_settings]
                                  :dashboard_id [:in [:auto/param %]])
                      dashboard-ids))

(mu/defn synced-dashboard-items :- [:sequential ::dashboards.schema/dashboard]
  "The Dashboards with `ids`, with their Collection and its ancestors, as remote sync lists them."
  [ids :- [:sequential pos-int?]]
  (let [root (collection.root/hydrated-root-collection)]
    (-> (mdb/select-batched #(t2/select [:model/Dashboard :id :name :collection_id] :id [:in %]) ids)
        (t2/hydrate [:collection :effective_ancestors])
        (->> (mapv #(collection.root/hydrate-root-collection % root))))))

(mu/defn stale-dashboard-candidates :- ::staleness/query
  "The query of the Dashboards that are stale for `opts`, `{:collection-ids (:all | #{int|nil}), :cutoff-date local-date}`."
  [opts :- ::staleness/candidates-options]
  ^:allow-subquery {:select [:dashboard.id
                             [(h2x/literal "Dashboard") :model]
                             [:dashboard.name :name]
                             [:last_viewed_at :last_used_at]
                             :dashboard.collection_id]
                    :from [[(t2/table-name :model/Dashboard) :dashboard]]
                    :left-join [[(t2/table-name :model/Pulse) :pulse] [:and
                                                                       [:= :pulse.archived false]
                                                                       [:= :pulse.dashboard_id :dashboard.id]]
                                [(t2/table-name :model/Collection) :collection] [:= :collection.id :dashboard.collection_id]
                                [(t2/table-name :model/ModerationReview) :mr] [:and
                                                                               [:= :mr.moderated_item_id :dashboard.id]
                                                                               [:= :mr.moderated_item_type (h2x/literal "dashboard")]
                                                                               [:= :mr.most_recent true]
                                                                               [:= :mr.status (h2x/literal "verified")]]]
                    :where [:and
                            [:= :pulse.id nil]
                            [:= :mr.id nil]
                            [:= :dashboard.archived false]
                            [:<= :dashboard.last_viewed_at (:cutoff-date opts)]
                            [:= :collection.type nil]
                            (when (embed.settings/some-embedding-enabled?)
                              [:= :dashboard.enable_embedding false])
                            (when (setting/get :enable-public-sharing)
                              [:= :dashboard.public_uuid nil])
                            (staleness/collection-filter :dashboard.collection_id opts)]})

(mu/defn stale-dashboard-items
  "The listing columns of the Dashboards with `dashboard-ids`, with the hydrations the stale content page shows."
  [dashboard-ids :- [:set ::lib.schema.id/dashboard]]
  (-> (mdb/select-batched
       (fn [dashboard-ids]
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
       dashboard-ids)
      (t2/hydrate :can_write :can_delete :can_restore [:collection :effective_location])))

(mu/defn dependency-dashboard-items :- :map
  "The query of the Dashboards the dependencies lists hold for `opts`, as `entity_id`, `name` and `location`: in the
  collections the user reads, without the internal ones unless `:include-internal?` and those in personal collections
  unless `:include-personal-collections?`, located by their collection."
  [{:keys [include-archived include-personal-collections? include-internal?] :as opts}
   :- :metabase.dependencies.items/items-opts]
  (let [location (collections.listing/collection-location :collection nil)]
    {:select    [[:dashboard.id :entity_id] [:dashboard.name :name] [location :location]]
     :from      [[(t2/table-name :model/Dashboard) :dashboard]]
     :left-join [[(t2/table-name :model/Collection) :collection] [:= :dashboard.collection_id :collection.id]]
     :where     (into [:and]
                      (remove nil?)
                      [(collections.listing/visible-in-collections-clause :dashboard opts include-archived nil)
                       (collections.listing/archived-clause :dashboard include-archived)
                       (when-not include-internal?
                         (mi/non-internal-filter-clause :model/Dashboard :dashboard))
                       (when-not include-personal-collections?
                         (collections.listing/outside-personal-collections-clause :dashboard :collection))])}))

(mu/defn collection-dashboard-items :- :map
  "The query of the Dashboards in `collection` that the collection items listing of `opts` holds."
  [collection :- :map
   {:keys [archived? pinned-state created-by-id]} :- :map]
  {:select    [:d.id :d.name :d.description :d.entity_id :d.collection_position
               [:last_viewed_at :last_used_at]
               :d.collection_id
               :d.archived_directly
               [(h2x/literal "dashboard") :model]
               [:u.id :last_edit_user]
               :d.archived
               [:u.email :last_edit_email]
               [:u.first_name :last_edit_first_name]
               [:u.last_name :last_edit_last_name]
               [:r.timestamp :last_edit_timestamp]
               [:mr.status :moderated_status]]
   :from      [[(t2/table-name :model/Dashboard) :d]]
   :left-join [[(t2/table-name :model/ModerationReview) :mr] [:and
                                                              [:= :mr.moderated_item_id :d.id]
                                                              [:= :mr.most_recent true]
                                                              [:= :mr.moderated_item_type (h2x/literal "dashboard")]]
               [(t2/table-name :model/Revision) :r] [:and
                                                     [:= :r.model_id :d.id]
                                                     [:= :r.model (h2x/literal "Dashboard")]
                                                     (revisions.sql/newest-revision-clause :r "Dashboard" :d.id)]
               [(t2/table-name :model/User) :u] [:= :u.id :r.user_id]]
   :where     [:and
               (collections.listing/visible-items-clause :d.collection_id archived? {:root-namespace nil})
               (if (collection/is-trash? collection)
                 [:= :d.archived_directly true]
                 [:and
                  [:= :d.collection_id (:id collection)]
                  [:not= :d.archived_directly true]])
               (when created-by-id
                 [:= :d.creator_id created-by-id])
               [:= :d.archived (boolean archived?)]
               (collections.listing/pinned-state->clause pinned-state)]})

(mu/defn recent-view-dashboards
  "The Dashboards with `dashboard-ids` with their Collection and moderation status."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (t2/hydrate
   (mdb/select-batched
    (fn [dashboard-ids]
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
                  :from [[(t2/table-name :model/Dashboard) :dash]]
                  :where [:in :dash.id dashboard-ids]
                  :left-join [[(t2/table-name :model/ModerationReview) :mr]
                              [:and
                               [:= :mr.moderated_item_id :dash.id]
                               [:= :mr.moderated_item_type "dashboard"]
                               [:= :mr.most_recent true]]
                              [(t2/table-name :model/Collection) :c]
                              [:and
                               [:= :c.id :dash.collection_id]
                               [:= :c.archived false]]]}))
    dashboard-ids)
   :can_read :can_write))

(mu/defn update-dashboards-last-viewed-at!
  "Move `last_viewed_at` of each Dashboard in `dashboard-id->timestamp` forward to its timestamp, without touching
  `updated_at`, via a raw update that publishes no lifecycle event, so the search index is not re-fed (it tolerates
  staleness on this field until the next re-index or edit)."
  [dashboard-id->timestamp :- [:map-of ms/PositiveInt ms/TemporalInstant]]
  #_{:clj-kondo/ignore [:metabase/change-log-raw-write]} ; the change log leaves out usage stats
  (run! (fn [entries]
          (t2/query {:update (t2/table-name :model/Dashboard)
                     :set    {:last_viewed_at (into [:case]
                                                    (mapcat (fn [[id timestamp]]
                                                              [[:= :id id] [:greatest [:coalesce :last_viewed_at (t/offset-date-time 0)] timestamp]])
                                                            entries))
                              :updated_at :updated_at}
                     :where  [:in :id (map first entries)]}))
        (partition-all mdb/update-partition-size dashboard-id->timestamp)))

(mu/defn set-dashboard-last-viewed-at!
  "Set `last_viewed_at` of the Dashboard with `dashboard-id`, returning the number updated."
  [dashboard-id   :- ::lib.schema.id/dashboard
   last-viewed-at :- ms/TemporalInstant]
  (t2/update! :model/Dashboard :id dashboard-id {:last_viewed_at last-viewed-at}))

(mu/defn shift-dashboard-positions! :- :int
  "Add or subtract one from the `collection_position` of the Dashboards in the Collection with `collection-id` whose position is
  in `positions`, `{:from n :to m}` with either bound left out, as `direction` says, returning the number updated."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   positions     :- ::collections.schema/positions
   direction     :- ::collections.schema/position-direction]
  (t2/update! :model/Dashboard {:collection_id       collection-id
                                :collection_position (collection/position-clause positions)}
              {:collection_position [direction :collection_position 1]}))

(mu/defn positioned-dashboards-in-collections :- [:sequential [:map {:closed true}
                                                               [:id                  ms/PositiveInt]
                                                               [:collection_id       [:maybe ms/PositiveInt]]
                                                               [:collection_position ms/PositiveInt]]]
  "The `:id`, `:collection_id` and `:collection_position` of the Dashboards that have a position in the Collections with
  `collection-ids`, nil for the root."
  [collection-ids :- [:sequential [:maybe ::lib.schema.id/collection]]]
  (let [select-positioned #(t2/select [:model/Dashboard :id :collection_id :collection_position]
                                      {:where [:and [:not= :collection_position nil] (collection/collection-ids-clause %)]})]
    (if (seq collection-ids)
      (mdb/select-batched select-positioned collection-ids)
      (select-positioned []))))

(mu/defn dashcards-of-actions
  "The DashboardCards of the Actions with `action-ids`."
  [action-ids :- [:sequential ::lib.schema.id/action]]
  (mdb/select-batched #(t2/select :model/DashboardCard :action_id [:in %]) action-ids))
