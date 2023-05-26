(ns metabase.models.dashboard-card
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.db :as mdb]
   [metabase.db.query :as mdb.query]
   [metabase.db.util :as mdb.u]
   [metabase.events :as events]
   [metabase.models.card :refer [Card]]
   [metabase.models.dashboard-card-series :refer [DashboardCardSeries]]
   [metabase.models.interface :as mi]
   [metabase.models.pulse-card :refer [PulseCard]]
   [metabase.models.serialization.base :as serdes.base]
   [metabase.models.serialization.hash :as serdes.hash]
   [metabase.models.serialization.util :as serdes.util]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.db :as db]
   [toucan.hydrate :refer [hydrate]]
   [toucan.models :as models]
   [toucan2.core :as t2]))

(models/defmodel DashboardCard :report_dashboardcard)

(doto DashboardCard
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set))

(declare series)

;;; Return the set of permissions required to `read-or-write` this DashboardCard. If `:card` and `:series` are already
;;; hydrated this method doesn't need to make any DB calls.
(defmethod mi/perms-objects-set DashboardCard
  [dashcard read-or-write]
  (let [card   (or (:card dashcard)
                   (db/select-one [Card :dataset_query] :id (u/the-id (:card_id dashcard))))
        series (or (:series dashcard)
                   (series dashcard))]
    (apply set/union (mi/perms-objects-set card read-or-write) (for [series-card series]
                                                                 (mi/perms-objects-set series-card read-or-write)))))

(defn- pre-insert [dashcard]
  (let [defaults {:parameter_mappings     []
                  :visualization_settings {}}]
    (merge defaults dashcard)))

(mi/define-methods
 DashboardCard
 {:properties (constantly {::mi/timestamped? true
                           ::mi/entity-id    true})
  :types      (constantly {:parameter_mappings     :parameters-list
                           :visualization_settings :visualization-settings})
  :pre-insert pre-insert})

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
  (t2/instance DashboardCard
               (-> dashboard-card
                   (m/update-existing :parameter_mappings mi/normalize-parameters-list)
                   (m/update-existing :visualization_settings mi/normalize-visualization-settings))))

(defmethod serdes.hash/identity-hash-fields DashboardCard
  [_dashboard-card]
  [(serdes.hash/hydrated-hash :card "<none>") ; :card is optional, eg. text cards
   (comp serdes.hash/identity-hash
         #(db/select-one 'Dashboard :id %)
         :dashboard_id)
   :visualization_settings
   :row :col
   :created_at])


;;; --------------------------------------------------- HYDRATION ----------------------------------------------------

(defn dashboard
  "Return the Dashboard associated with the DashboardCard."
  [{:keys [dashboard_id]}]
  {:pre [(integer? dashboard_id)]}
  (db/select-one 'Dashboard, :id dashboard_id))

(mi/define-simple-hydration-method series
  :series
  "Return the `Cards` associated as additional series on this DashboardCard."
  [{:keys [id]}]
  (db/select [Card :id :name :description :display :dataset_query :visualization_settings :collection_id]
    (mdb.u/join [Card :id] [DashboardCardSeries :card_id])
    (db/qualify DashboardCardSeries :dashboardcard_id) id
    {:order-by [[(db/qualify DashboardCardSeries :position) :asc]]}))


;;; ---------------------------------------------------- CRUD FNS ----------------------------------------------------

(s/defn retrieve-dashboard-card
  "Fetch a single DashboardCard by its ID value."
  [id :- su/IntGreaterThanZero]
  (-> (db/select-one DashboardCard :id id)
      (hydrate :series)))

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

(s/defn update-dashboard-card-series!
  "Update the DashboardCardSeries for a given DashboardCard.
   `card-ids` should be a definitive collection of *all* IDs of cards for the dashboard card in the desired order.

   *  If an ID in `card-ids` has no corresponding existing DashboardCardSeries object, one will be created.
   *  If an existing DashboardCardSeries has no corresponding ID in `card-ids`, it will be deleted.
   *  All cards will be updated with a `position` according to their place in the collection of `card-ids`"
  {:arglists '([dashboard-card card-ids])}
  [{:keys [id]} :- {:id su/IntGreaterThanZero, s/Keyword s/Any}
   card-ids     :- [su/IntGreaterThanZero]]
  ;; first off, just delete all series on the dashboard card (we add them again below)
  (db/delete! DashboardCardSeries :dashboardcard_id id)
  ;; now just insert all of the series that were given to us
  (when (seq card-ids)
    (let [cards (map-indexed (fn [i card-id]
                               {:dashboardcard_id id, :card_id card-id, :position i})
                             card-ids)]
      (db/insert-many! DashboardCardSeries cards))))

(def ^:private DashboardCardUpdates
  {:id                                      su/IntGreaterThanZero
   (s/optional-key :action_id)              (s/maybe su/IntGreaterThanZero)
   (s/optional-key :parameter_mappings)     (s/maybe [su/Map])
   (s/optional-key :visualization_settings) (s/maybe su/Map)
   ;; series is a sequence of IDs of additional cards after the first to include as "additional serieses"
   (s/optional-key :series)                 (s/maybe [su/IntGreaterThanZero])
   s/Keyword                                s/Any})

(defn- shallow-updates
  "Returns the keys in `new` that have different values than the corresponding keys in `old`"
  [new old]
  (into {}
        (filter (fn [[k v]]
                  (not= v (get old k)))
                new)))

(s/defn update-dashboard-card!
  "Updates an existing DashboardCard including all DashboardCardSeries.
   `old-dashboard-card` is provided to avoid an extra DB call if there are no changes.
   Returns nil."
  [{:keys [id action_id] :as dashboard-card} :- DashboardCardUpdates
   old-dashboard-card                        :- DashboardCardUpdates]
  (db/transaction
   (let [update-ks (cond-> [:action_id :row :col :size_x :size_y
                            :parameter_mappings :visualization_settings]
                    ;; Allow changing card_id for action dashcards, but not for card dashcards.
                    ;; This is to preserve the existing behavior of questions and card_id
                    ;; I don't know why card_id couldn't be changed for cards though.
                     action_id (conj :card_id))
         updates (shallow-updates (select-keys dashboard-card update-ks)
                                  (select-keys old-dashboard-card update-ks))]
     (when (seq updates)
       (db/update! DashboardCard id updates))
     (when (not= (:series dashboard-card [])
                 (:series old-dashboard-card []))
       (update-dashboard-card-series! dashboard-card (:series dashboard-card)))
     nil)))

(def ParamMapping
  "Schema for a parameter mapping as it would appear in the DashboardCard `:parameter_mappings` column."
  {:parameter_id su/NonBlankString
   ;; TODO -- validate `:target` as well... breaks a few tests tho so those will have to be fixed
   #_:target       #_s/Any
   s/Keyword     s/Any})

(def ^:private NewDashboardCard
  {:dashboard_id                            su/IntGreaterThanZero
   (s/optional-key :card_id)                (s/maybe su/IntGreaterThanZero)
   (s/optional-key :action_id)              (s/maybe su/IntGreaterThanZero)
   ;; TODO - use ParamMapping. Breaks too many tests right now tho
   (s/optional-key :parameter_mappings)     (s/maybe [#_ParamMapping su/Map])
   (s/optional-key :visualization_settings) (s/maybe su/Map)
   ;; TODO - make the rest of the options explicit instead of just allowing whatever for other keys
   s/Keyword                                s/Any})

(s/defn create-dashboard-card!
  "Create a new DashboardCard by inserting it into the database along with all associated pieces of data such as
   DashboardCardSeries. Returns the newly created DashboardCard or throws an Exception."
  [dashboard-card :- NewDashboardCard]
  (let [{:keys [dashboard_id card_id action_id parameter_mappings visualization_settings size_x size_y row col series]
         :or   {series []}} dashboard-card]
    (db/transaction
     (let [dashboard-card (db/insert! DashboardCard
                                      :dashboard_id           dashboard_id
                                      :card_id                card_id
                                      :action_id              action_id
                                      :size_x                 size_x
                                      :size_y                 size_y
                                      :row                    row
                                      :col                    col
                                      :parameter_mappings     (or parameter_mappings [])
                                      :visualization_settings (or visualization_settings {}))]
       ;; add series to the DashboardCard
       (update-dashboard-card-series! dashboard-card series)
       ;; return the full DashboardCard
       (retrieve-dashboard-card (:id dashboard-card))))))

(defn delete-dashboard-card!
  "Delete a DashboardCard."
  [dashboard-card-id]
  {:pre [(integer? dashboard-card-id)]}
  (db/transaction
    (db/delete! PulseCard :dashboard_card_id dashboard-card-id)
    (db/delete! DashboardCard :id dashboard-card-id)))

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
  (set (keys serdes.util/link-card-model->toucan-model)))

(defn- link-card-info-query-for-model
  [[model ids]]
  {:select (select-clause-for-link-card-model model)
   :from   (t2/table-name (serdes.util/link-card-model->toucan-model model))
   :where  [:in :id ids]})

(defn- link-card-info-query
  [link-card-model->ids]
  (if (= 1 (count link-card-model->ids))
    (link-card-info-query-for-model (first link-card-model->ids))
    {:select   [:*]
     :from     [[{:union-all (map link-card-info-query-for-model link-card-model->ids)}
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
                               (if (mi/can-read? (t2/instance (serdes.util/link-card-model->toucan-model model) instance))
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

;;; ----------------------------------------------- SERIALIZATION ----------------------------------------------------
;; DashboardCards are not serialized as their own, separate entities. They are inlined onto their parent Dashboards.
;; However, we can reuse some of the serdes machinery (especially load-one!) by implementing a few serdes methods.
(defmethod serdes.base/serdes-generate-path "DashboardCard" [_ dashcard]
  [(serdes.base/infer-self-path "Dashboard" (db/select-one 'Dashboard :id (:dashboard_id dashcard)))
   (serdes.base/infer-self-path "DashboardCard" dashcard)])

(defmethod serdes.base/load-xform "DashboardCard"
  [dashcard]
  (-> dashcard
      (dissoc :serdes/meta)
      (update :card_id                serdes.util/import-fk 'Card)
      (update :action_id              serdes.util/import-fk 'Action)
      (update :dashboard_id           serdes.util/import-fk 'Dashboard)
      (update :created_at             #(if (string? %) (u.date/parse %) %))
      (update :parameter_mappings     serdes.util/import-parameter-mappings)
      (update :visualization_settings serdes.util/import-visualization-settings)))
