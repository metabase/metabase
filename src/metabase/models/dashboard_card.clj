(ns metabase.models.dashboard-card
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.db :as mdb]
   [metabase.db.query :as mdb.query]
   [metabase.models.dashboard-card-series :refer [DashboardCardSeries]]
   [metabase.models.interface :as mi]
   [metabase.models.pulse-card :refer [PulseCard]]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def DashboardCard
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
   We'll keep this till we replace all the DashboardCard symbol in our codebase."
  :model/DashboardCard)

(methodical/defmethod t2/table-name :model/DashboardCard [_model] :report_dashboardcard)

(doto :model/DashboardCard
  (derive :metabase/model)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(t2/deftransforms :model/DashboardCard
  {:parameter_mappings     mi/transform-parameters-list
   :visualization_settings mi/transform-visualization-settings})

(t2/define-before-insert :model/DashboardCard
 [dashcard]
 (merge {:parameter_mappings     []
         :visualization_settings {}} dashcard))

(declare series)

;;; Return the set of permissions required to `read-or-write` this DashboardCard. If `:card` and `:series` are already
;;; hydrated this method doesn't need to make any DB calls.
(defmethod mi/perms-objects-set :model/DashboardCard
  [dashcard read-or-write]
  (let [card   (or (:card dashcard)
                   (t2/select-one [:model/Card :dataset_query] :id (u/the-id (:card_id dashcard))))
        series (or (:series dashcard)
                   (series dashcard))]
    (apply set/union (mi/perms-objects-set card read-or-write) (for [series-card series]
                                                                 (mi/perms-objects-set series-card read-or-write)))))

(defn from-parsed-json
  "Convert a map with dashboard-card into a Toucan instance assuming it came from parsed JSON and the map keys have
   been keywordized. This is useful if the data from a request body inside a `defendpoint` body, and you need it in the
   same format as if it were selected from the DB with toucan. It doesn't transform the `:created_at` or `:updated_at`
   fields, as the types of timestamp values differ by the application database driver.

   For example:
   ```
   (= dashcard ;; from toucan select, excluding :created_at and :updated_at
      (-> (json/generate-string dashcard)
          (json/parse-string true)
          from-parsed-json))
   =>
   true
   ```"
  [dashboard-card]
  (t2/instance :model/DashboardCard
               (-> dashboard-card
                   (m/update-existing :parameter_mappings mi/normalize-parameters-list)
                   (m/update-existing :visualization_settings mi/normalize-visualization-settings))))

(defmethod serdes/hash-fields :model/DashboardCard
  [_dashboard-card]
  [(serdes/hydrated-hash :card) ; :card is optional, eg. text cards
   (comp serdes/identity-hash
         #(t2/select-one 'Dashboard :id %)
         :dashboard_id)
   :visualization_settings
   :row :col
   :created_at])


;;; --------------------------------------------------- HYDRATION ----------------------------------------------------

(mi/define-batched-hydration-method series
  :series
  "Return the `Cards` associated as additional series on this DashboardCard."
  [dashcards]
  (let [dashcard-ids        (map :id dashcards)
        dashcard-id->series (when (seq dashcard-ids)
                              (as-> (t2/select
                                     [:model/Card :id :name :description :display :dataset_query
                                      :visualization_settings :collection_id :series.dashboardcard_id]
                                     {:left-join [[:dashboardcard_series :series] [:= :report_card.id :series.card_id]]
                                      :where     [:in :series.dashboardcard_id dashcard-ids]
                                      :order-by  [[:series.position :asc]]}) series
                               (group-by :dashboardcard_id series)
                               (update-vals series #(map (fn [card] (dissoc card :dashboardcard_id)) %))))]
    (map (fn [dashcard]
           (assoc dashcard :series (get dashcard-id->series (:id dashcard) [])))
         dashcards)))

;;; ---------------------------------------------------- CRUD FNS ----------------------------------------------------

(mu/defn retrieve-dashboard-card
  "Fetch a single DashboardCard by its ID value."
  [id :- ms/PositiveInt]
  (-> (t2/select-one :model/DashboardCard :id id)
      (t2/hydrate :series)))

(defn dashcard->multi-cards
  "Return the cards which are other cards with respect to this dashboard card
  in multiple series display for dashboard

  Dashboard (and dashboard only) has this thing where you're displaying multiple cards entirely.

  This is actually completely different from the combo display,
  which is a visualization type in visualization option.

  This is also actually completely different from having multiple series display
  from the visualization with same type (line bar or whatever),
  which is a separate option in line area or bar visualization"
  [dashcard]
  (mdb.query/query {:select    [:newcard.*]
                    :from      [[:report_dashboardcard :dashcard]]
                    :left-join [[:dashboardcard_series :dashcardseries]
                                [:= :dashcard.id :dashcardseries.dashboardcard_id]
                                [:report_card :newcard]
                                [:= :dashcardseries.card_id :newcard.id]]
                    :where     [:and
                                [:= :newcard.archived false]
                                [:= :dashcard.id (:id dashcard)]]}))

(defn update-dashboard-cards-series!
  "Batch update the DashboardCardSeries for multiple DashboardCards.
  Each `card-ids` list should be a definitive collection of *all* IDs of cards for the dashboard card in the desired order.

  *  If an ID in `card-ids` has no corresponding existing DashboardCardSeries object, one will be created.
  *  If an existing DashboardCardSeries has no corresponding ID in `card-ids`, it will be deleted.
  *  All cards will be updated with a `position` according to their place in the collection of `card-ids`"
  {:arglists '([dashcard-id->card-ids])}
  [dashcard-id->card-ids]
  (when (seq dashcard-id->card-ids)
    ;; first off, just delete all series on the dashboard card (we add them again below)
    (t2/delete! DashboardCardSeries :dashboardcard_id [:in (keys dashcard-id->card-ids)])
    ;; now just insert all of the series that were given to us
    (when-let [card-series (seq (for [[dashcard-id card-ids] dashcard-id->card-ids
                                      [i card-id]            (map-indexed vector card-ids)]
                                  {:dashboardcard_id dashcard-id, :card_id card-id, :position i}))]
      (t2/insert! DashboardCardSeries card-series))))

(def ^:private DashboardCardUpdates
  [:map
   [:id                                      ms/PositiveInt]
   [:action_id              {:optional true} [:maybe ms/PositiveInt]]
   [:parameter_mappings     {:optional true} [:maybe [:sequential :map]]]
   [:visualization_settings {:optional true} [:maybe :map]]
   ;; series is a sequence of IDs of additional cards after the first to include as "additional serieses"
   [:series                 {:optional true} [:maybe [:sequential ms/PositiveInt]]]])

(defn- shallow-updates
  "Returns the keys in `new` that have different values than the corresponding keys in `old`"
  [new old]
  (into {}
        (filter (fn [[k v]]
                  (not= v (get old k)))
                new)))

(mu/defn update-dashboard-card!
  "Updates an existing DashboardCard including all DashboardCardSeries.
   `old-dashboard-card` is provided to avoid an extra DB call if there are no changes.
   Returns nil."
  [{:keys [id action_id] :as dashboard-card} :- DashboardCardUpdates
   old-dashboard-card                        :- DashboardCardUpdates]
  (t2/with-transaction [_conn]
   (let [update-ks (cond-> [:action_id :row :col :size_x :size_y
                            :parameter_mappings :visualization_settings :dashboard_tab_id]
                    ;; Allow changing card_id for action dashcards, but not for card dashcards.
                    ;; This is to preserve the existing behavior of questions and card_id
                    ;; I don't know why card_id couldn't be changed for cards though.
                     action_id (conj :card_id))
         updates (shallow-updates (select-keys dashboard-card update-ks)
                                  (select-keys old-dashboard-card update-ks))]
     (when (seq updates)
       (t2/update! :model/DashboardCard id updates))
     (when (not= (:series dashboard-card [])
                 (:series old-dashboard-card []))
       (update-dashboard-cards-series! {(:id dashboard-card) (:series dashboard-card)}))
     nil)))

(def ParamMapping
  "Schema for a parameter mapping as it would appear in the DashboardCard `:parameter_mappings` column."
  [:and
   [:map-of :keyword :any]
   [:map
    ;; TODO -- validate `:target` as well... breaks a few tests tho so those will have to be fixed
    [:parameter_id ms/NonBlankString]
    #_[:target       :any]]])

(def ^:private NewDashboardCard
  ;; TODO - make the rest of the options explicit instead of just allowing whatever for other keys
  [:map
   [:dashboard_id                            ms/PositiveInt]
   [:action_id              {:optional true} [:maybe ms/PositiveInt]]
   ;; TODO - use ParamMapping. Breaks too many tests right now tho
   [:parameter_mappings     {:optional true} [:maybe [:sequential map?]]]
   [:visualization_settings {:optional true} [:maybe map?]]
   [:series                 {:optional true} [:maybe [:sequential ms/PositiveInt]]]])

(mu/defn create-dashboard-cards!
  "Create a new DashboardCard by inserting it into the database along with all associated pieces of data such as
  DashboardCardSeries. Returns the newly created DashboardCard or throws an Exception."
  [dashboard-cards :- [:sequential NewDashboardCard]]
  (when (seq dashboard-cards)
    (t2/with-transaction [_conn]
      (let [dashboard-card-ids (t2/insert-returning-pks!
                                DashboardCard
                                (for [dashcard dashboard-cards]
                                  (merge {:parameter_mappings []
                                          :visualization_settings {}}
                                         (dissoc dashcard :id :created_at :updated_at :entity_id :series :card :collection_authority_level))))]
        ;; add series to the DashboardCard
        (update-dashboard-cards-series! (zipmap dashboard-card-ids (map #(get % :series []) dashboard-cards)))
        ;; return the full DashboardCard
        (-> (t2/select DashboardCard :id [:in dashboard-card-ids])
            (t2/hydrate :series))))))

(defn delete-dashboard-cards!
  "Delete DashboardCards of a Dasbhoard."
  [dashboard-card-ids]
  {:pre [(coll? dashboard-card-ids)]}
  (t2/with-transaction [_conn]
    (t2/delete! PulseCard :dashboard_card_id [:in dashboard-card-ids])
    (t2/delete! DashboardCard :id [:in dashboard-card-ids])))

;;; ----------------------------------------------- Link cards ----------------------------------------------------

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

(def ^:private link-card-models
  (set (keys serdes/link-card-model->toucan-model)))

(defn link-card-info-query-for-model
  "Return a honeysql query that is used to fetch info for a linkcard."
  [model id-or-ids]
  {:select (select-clause-for-link-card-model model)
   :from   (t2/table-name (serdes/link-card-model->toucan-model model))
   :where  (if (coll? id-or-ids)
             [:in :id id-or-ids]
             [:= :id id-or-ids])})

(defn- link-card-info-query
  [link-card-model->ids]
  (if (= 1 (count link-card-model->ids))
    (apply link-card-info-query-for-model (first link-card-model->ids))
    {:select   [:*]
     :from     [[{:union-all (map #(apply link-card-info-query-for-model %) link-card-model->ids)}
                 :alias_is_required_by_sql_but_not_needed_here]]}))

(mi/define-batched-hydration-method dashcard-linkcard-info
  :dashcard/linkcard-info
  "Update entity info for link cards.

  Link cards are dashcards that link to internal entities like Database/Dashboard/... or an url.
  The viz-settings only store the model name and id, info like name, description will need to be
  hydrated on fetch to make sure those info are up-to-date."
  [dashcards]
  (let [entity-path   [:visualization_settings :link :entity]
        ;; find all dashcards that are link-cards and get its model, id
        ;; [[:table #{1 2}] [:database #{3 4}]]
        model-and-ids (->> dashcards
                           (map #(get-in % entity-path))
                           (filter #(link-card-models (:model %)))
                           (group-by :model)
                           (map (fn [[k v]] [k (set (map :id v))])))]
    (if (seq model-and-ids)
      (let [;; query all entities in 1 db call
            ;; {[:table 3] {:name ...}}
            model-and-id->info
            (-> (m/index-by (juxt :model :id) (t2/query (link-card-info-query model-and-ids)))
                (update-vals (fn [{model :model :as instance}]
                               (if (mi/can-read? (t2/instance (serdes/link-card-model->toucan-model model) instance))
                                 instance
                                 {:restricted true}))))]
        (map (fn [card]
               (if-let [model-info (->> (get-in card entity-path)
                                        ((juxt :model :id))
                                        (get model-and-id->info))]
                 (assoc-in card entity-path model-info)
                 card))
             dashcards))
      dashcards)))

(defn dashcard-comparator
  "Comparator that determines which of two dashcards comes first in the layout order used for pulses.
  This is the same order used on the frontend for the mobile layout. Orders cards left-to-right, then top-to-bottom"
  [{row-1 :row col-1 :col} {row-2 :row col-2 :col}]
  (if (= row-1 row-2)
    (compare col-1 col-2)
    (compare row-1 row-2)))

;;; ----------------------------------------------- SERIALIZATION ----------------------------------------------------
;; DashboardCards are not serialized as their own, separate entities. They are inlined onto their parent Dashboards.
;; If the parent dashboard has tabs, the dashcards are inlined under each DashboardTab, which are inlined on the Dashboard.
;; However, we can reuse some of the serdes machinery (especially load-one!) by implementing a few serdes methods.
(defmethod serdes/generate-path "DashboardCard" [_ dashcard]
  (remove nil?
          [(serdes/infer-self-path "Dashboard" (t2/select-one 'Dashboard :id (:dashboard_id dashcard)))
           (when (:dashboard_tab_id dashcard)
             (serdes/infer-self-path "DashboardTab" (t2/select-one :model/DashboardTab :id (:dashboard_tab_id dashcard))))
           (serdes/infer-self-path "DashboardCard" dashcard)]))

(defmethod serdes/load-xform "DashboardCard"
  [dashcard]
  (-> dashcard
      (dissoc :serdes/meta)
      (update :card_id                serdes/*import-fk* :model/Card)
      (update :action_id              serdes/*import-fk* :model/Action)
      (update :dashboard_id           serdes/*import-fk* :model/Dashboard)
      (update :dashboard_tab_id       serdes/*import-fk* :model/DashboardTab)
      (update :created_at             #(if (string? %) (u.date/parse %) %))
      (update :parameter_mappings     serdes/import-parameter-mappings)
      (update :visualization_settings serdes/import-visualization-settings)))
