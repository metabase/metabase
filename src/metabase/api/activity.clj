(ns metabase.api.activity
  (:require
   [clojure.string :as str]
   [compojure.core :refer [GET]]
   [medley.core :as m]
   [metabase.api.common :as api :refer [*current-user-id*]]
   [metabase.db.query :as mdb.query]
   [metabase.models.card :refer [Card]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.interface :as mi]
   [metabase.models.query-execution :refer [QueryExecution]]
   [metabase.models.recent-views :as recent-views]
   [metabase.models.table :refer [Table]]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn- models-query
  [model ids]
  (t2/select
   (case model
     "card"      [Card
                  :id :name :collection_id :description :display
                  :dataset_query :type :archived
                  :collection.authority_level [:collection.name :collection_name]]
     "dashboard" [Dashboard
                  :id :name :collection_id :description
                  :archived
                  :collection.authority_level [:collection.name :collection_name]]
     "table"     [Table
                  :id :name :db_id :active
                  :display_name [:metabase_database.initial_sync_status :initial-sync-status]
                  :visibility_type [:metabase_database.name :database-name]])
   (let [model-symb (symbol (str/capitalize model))
         self-qualify #(mdb.query/qualify model-symb %)]
     (cond-> {:where [:in (self-qualify :id) ids]}
       (not= model "table")
       (merge {:left-join [:collection [:= :collection.id (self-qualify :collection_id)]]})
       (= model "table")
       (merge {:left-join [:metabase_database [:= :metabase_database.id (self-qualify :db_id)]]})))))

(defn- select-items! [model ids]
  (when (seq ids)
    (for [model (t2/hydrate (models-query model ids) :moderation_reviews)
          :let [reviews (:moderation_reviews model)
                status  (->> reviews
                             (filter :most_recent)
                             first
                             :status)]]
      (assoc model :moderated_status status))))

(defn- models-for-views
  "Returns a map of {model {id instance}} for activity views suitable for looking up by model and id to get a model."
  [views]
  (into {} (map (fn [[model models]]
                  [model (->> models
                              (map :model_id)
                              (select-items! model)
                              (m/index-by :id))]))
        (group-by :model views)))

(defn- views-and-runs
  "Query implementation for `popular_items`. Tables and Dashboards have a query limit of `views-limit`.
  Cards have a query limit of `card-runs-limit`.

  The expected output of the query is a single row per unique model viewed by the current user including a `:max_ts` which
  has the most recent view timestamp of the item and `:cnt` which has total views. We order the results by most recently
  viewed then hydrate the basic details of the model. Bookmarked cards and dashboards are *not* included in the result.

  Viewing a Dashboard will add entries to the view log for all cards on that dashboard so all card views are instead derived
  from the query_execution table. The query context is always a `:question`. The results are normalized and concatenated to the
  query results for dashboard and table views."
  [views-limit card-runs-limit]
  (let [dashboard-and-table-views (t2/select [:model/RecentViews
                                              [[:min :recent_views.user_id] :user_id]
                                              :model
                                              :model_id
                                              [[:max [:coalesce :d.view_count :t.view_count]] :cnt]
                                              [:%max.timestamp :max_ts]]
                                             {:group-by  [:model :model_id]
                                              :where     [:and
                                                          [:in :model #{"dashboard" "table"}]]
                                              :order-by  [[:max_ts :desc] [:model :desc]]
                                              :limit     views-limit
                                              :left-join [[:report_dashboard :d]
                                                          [:and
                                                           [:= :model "dashboard"]
                                                           [:= :d.id :model_id]]
                                                          [:metabase_table :t]
                                                          [:and
                                                           [:= :model "table"]
                                                           [:= :t.id :model_id]]]})
        card-runs                 (->> (t2/select [QueryExecution
                                                   [:%min.executor_id :user_id]
                                                   [(mdb.query/qualify QueryExecution :card_id) :model_id]
                                                   [:%count.* :cnt]
                                                   [:%max.started_at :max_ts]]
                                                  {:group-by [(mdb.query/qualify QueryExecution :card_id) :context]
                                                   :where    [:and
                                                              [:= :context (h2x/literal :question)]]
                                                   :order-by [[:max_ts :desc]]
                                                   :limit    card-runs-limit})
                                       (map #(dissoc % :row_count))
                                       (map #(assoc % :model "card")))]
    (->> (concat card-runs dashboard-and-table-views)
         (sort-by :max_ts)
         reverse)))

(def ^:private views-limit 8)
(def ^:private card-runs-limit 8)

(api/defendpoint GET "/recent_views"
  "Get a list of 100 models (cards, models, tables, dashboards, and collections) that the current user has been viewing most
  recently. Return a maximum of 20 model of each, if they've looked at at least 20."
  []
  {:recent_views (recent-views/get-list *current-user-id*)})

(api/defendpoint GET "/most_recently_viewed_dashboard"
  "Get the most recently viewed dashboard for the current user. Returns a 204 if the user has not viewed any dashboards
   in the last 24 hours."
  []
  (if-let [dashboard-id (recent-views/most-recently-viewed-dashboard-id api/*current-user-id*)]
    (let [dashboard (-> (t2/select-one Dashboard :id dashboard-id)
                        api/check-404
                        (t2/hydrate [:collection :is_personal]))]
      (if (mi/can-read? dashboard)
        dashboard
        api/generic-204-no-content))
    api/generic-204-no-content))

(defn- official?
  "Returns true if the item belongs to an official collection. False otherwise. Assumes that `:authority_level` exists
  if the item can be placed in a collection."
  [{:keys [authority_level]}]
  (boolean
   (when authority_level
     (#{"official"} authority_level))))

(defn- verified?
  "Return true if the item is verified, false otherwise. Assumes that `:moderated_status` is hydrated."
  [{:keys [moderated_status]}]
  (= moderated_status "verified"))

(defn- score-items
  [items]
  (when (seq items)
    (let [n-items (count items)
          max-count (apply max (map :cnt items))]
      (map-indexed
       (fn [recency-pos {:keys [cnt model_object] :as item}]
         (let [verified-wt 1
               official-wt 1
               recency-wt 2
               views-wt 4
               scores (remove nil?
                              [;; cards and dashboards? can be 'verified' in enterprise
                               (when (verified? model_object) verified-wt)
                               ;; items may exist in an 'official' collection in enterprise
                               (when (official? model_object) official-wt)
                               ;; most recent item = 1 * recency-wt, least recent item of 10 items = 1/10 * recency-wt
                               (when-not (zero? n-items)
                                 (* (/ (- n-items recency-pos) n-items) recency-wt))
                               ;; item with highest count = 1 * views-wt, lowest = item-view-count / max-view-count * views-wt

                               ;; NOTE: the query implementation `views-and-runs` has an order-by clause using most recent timestamp
                               ;; this has an effect on the outcomes. Consider an item with a massively high viewcount but a last view by the user
                               ;; a long time ago. This may not even make it into the firs 10 items from the query, even though it might be worth showing
                               (when-not (zero? max-count)
                                 (* (/ cnt max-count) views-wt))])]
           (assoc item :score (double (reduce + scores))))) items))))

(def ^:private model->precedence
  {"dashboard"  0
   "card"       1
   "dataset"    2
   "table"      3
   "collection" 4})

(mu/defn get-popular-items-model-and-id
  "Returns the 'popular' items for the current user. This is a list of 5 items that the user has viewed recently.
   The items are sorted by a weighted score that takes into account the total count of views, the recency of the view,
   whether the item is 'official' or 'verified', and more."
  [] :- [:sequential recent-views/Item]
  ;; we do a weighted score which incorporates:
  ;; - total count -> higher = higher score
  ;; - recently viewed -> more recent = higher score
  ;; - official/verified -> yes = higher score
  (let [views            (views-and-runs views-limit card-runs-limit)
        model->id->items (models-for-views views)
        filtered-views   (for [{:keys [model model_id] :as view-log} views
                               :let [model-object (-> (get-in model->id->items [model model_id])
                                                      (dissoc :dataset_query))]
                               :when (and model-object
                                          (mi/can-read? model-object)
                                          ;; hidden tables, archived cards/dashboards
                                          (not (or (:archived model-object)
                                                   (= (:visibility_type model-object) :hidden))))
                               :let [is-dataset? (= (keyword (:type model-object)) :model)]]
                           (cond-> (assoc view-log :model_object model-object)
                             is-dataset? (assoc :model "dataset")))
        scored-views     (score-items filtered-views)]
    (->> scored-views
         (sort-by
          ;; sort by model first, and then score when they are the same model
          (juxt #(-> % :model model->precedence) #(- (% :score))))
         (take 5)
         (map #(-> %
                   (assoc :timestamp (:max_ts % ""))
                   recent-views/fill-recent-view-info)))))

(api/defendpoint GET "/popular_items"
  "Get the list of 5 popular things on the instance. Query takes 8 and limits to 5 so that if it finds anything
  archived, deleted, etc it can usually still get 5. "
  []
  {:popular_items (get-popular-items-model-and-id)})

(api/define-routes)
