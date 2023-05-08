(ns metabase.api.activity
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [compojure.core :refer [GET]]
   [medley.core :as m]
   [metabase.api.common :as api :refer [*current-user-id* define-routes]]
   [metabase.events.view-log :as view-log]
   [metabase.models.activity :refer [Activity]]
   [metabase.models.card :refer [Card]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.interface :as mi]
   [metabase.models.query-execution :refer [QueryExecution]]
   [metabase.models.table :refer [Table]]
   [metabase.models.view-log :refer [ViewLog]]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan.db :as db]
   [toucan.hydrate :refer [hydrate]]
   [toucan2.core :as t2]))

(defn- dashcard-activity? [activity]
  (#{:dashboard-add-cards :dashboard-remove-cards}
   (:topic activity)))

(defn- activities->referenced-objects
  "Get a map of model name to a set of referenced IDs in these `activities`.

     (activities->referenced-objects <some-activities>) -> {\"dashboard\" #{41 42 43}, \"card\" #{100 101}, ...}"
  [activities]
  (apply merge-with set/union (for [{:keys [model model_id], :as activity} activities
                                    :when                                  model]
                                (merge {model #{model_id}}
                                       ;; pull the referenced card IDs out of the dashcards for dashboard activites
                                       ;; that involve adding/removing cards
                                       (when (dashcard-activity? activity)
                                         {"card" (set (for [dashcard (get-in activity [:details :dashcards])]
                                                        (:card_id dashcard)))})))))

(defn- referenced-objects->existing-objects
  "Given a map of existing objects like the one returned by `activities->referenced-objects`, return a similar map of
   models to IDs of objects *that exist*.

     (referenced-objects->existing-objects {\"dashboard\" #{41 42 43}, \"card\" #{100 101}, ...})
     ;; -> {\"dashboard\" #{41 43}, \"card\" #{101}, ...}"
  [referenced-objects]
  (merge
   (when-let [card-ids (get referenced-objects "card")]
     (let [id->dataset?                       (t2/select-pk->fn :dataset Card
                                                                   :id [:in card-ids])
           {dataset-ids true card-ids' false} (group-by (comp boolean id->dataset?)
                                                        ;; only existing ids go back
                                                        (keys id->dataset?))]
       (cond-> {}
         (seq dataset-ids) (assoc "dataset" (set dataset-ids))
         (seq card-ids')   (assoc "card" (set card-ids')))))
   (into {} (for [[model ids] (dissoc referenced-objects "card")
                  :when       (seq ids)]
              [model (case model
                       "dashboard" (t2/select-pks-set 'Dashboard, :id [:in ids])
                       "metric"    (t2/select-pks-set 'Metric,    :id [:in ids], :archived false)
                       "pulse"     (t2/select-pks-set 'Pulse,     :id [:in ids])
                       "segment"   (t2/select-pks-set 'Segment,   :id [:in ids], :archived false)
                       nil)])))) ; don't care about other models

(defn- add-model-exists-info
  "Add `:model_exists` keys to `activities`, and `:exists` keys to nested dashcards where appropriate."
  [activities]
  (let [existing-objects (-> activities activities->referenced-objects referenced-objects->existing-objects)
        model-exists? (fn [model id] (contains? (get existing-objects model) id))
        existing-dataset? (partial model-exists? "dataset")
        existing-card? (partial model-exists? "card")]
    (for [{:keys [model_id], :as activity} activities]
      (let [model (if (and (= (:model activity) "card")
                           (existing-dataset? (:model_id activity)))
                    "dataset"
                    (:model activity))]
        (cond-> (assoc activity
                       :model_exists (model-exists? model model_id)
                       :model model)
          (dashcard-activity? activity)
          (update-in [:details :dashcards]
                     (fn [dashcards]
                       (for [dashcard dashcards]
                         (assoc dashcard :exists
                                (or (existing-dataset? (:card_id dashcard))
                                    (existing-card? (:card_id dashcard))))))))))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/"
  "Get recent activity."
  []
  (filter mi/can-read? (-> (t2/select Activity, {:order-by [[:timestamp :desc]], :limit 40})
                           (hydrate :user :table :database)
                           add-model-exists-info)))

(defn- models-query
  [model ids]
  (t2/select
      (case model
        "card"      [Card
                     :id :name :collection_id :description :display
                     :dataset_query :dataset :archived
                     :collection.authority_level]
        "dashboard" [Dashboard
                     :id :name :collection_id :description
                     :archived
                     :collection.authority_level]
        "table"     [Table
                     :id :name :db_id
                     :display_name :initial_sync_status
                     :visibility_type])
      (let [model-symb (symbol (str/capitalize model))
            self-qualify #(db/qualify model-symb %)]
        (cond-> {:where [:in (self-qualify :id) ids]}
          (not= model "table")
          (merge {:left-join [:collection [:= :collection.id (self-qualify :collection_id)]]})))))

(defn- select-items! [model ids]
  (when (seq ids)
    (for [model (hydrate (models-query model ids) :moderation_reviews)
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
  [views-limit card-runs-limit all-users?]
  (let [dashboard-and-table-views (t2/select [ViewLog
                                              [[:min :view_log.user_id] :user_id]
                                              :model
                                              :model_id
                                              [:%count.* :cnt]
                                              [:%max.timestamp :max_ts]]
                                             {:group-by  [:model :model_id]
                                              :where     [:and
                                                          (when-not all-users? [:= (db/qualify ViewLog :user_id) *current-user-id*])
                                                          [:in :model #{"dashboard" "table"}]
                                                          [:= :bm.id nil]]
                                              :order-by  [[:max_ts :desc] [:model :desc]]
                                              :limit     views-limit
                                              :left-join [[:dashboard_bookmark :bm]
                                                          [:and
                                                           [:= :model "dashboard"]
                                                           [:= :bm.user_id *current-user-id*]
                                                           [:= :model_id :bm.dashboard_id]]]})
        card-runs                 (->> (t2/select [QueryExecution
                                                   [:%min.executor_id :user_id]
                                                   [(db/qualify QueryExecution :card_id) :model_id]
                                                   [:%count.* :cnt]
                                                   [:%max.started_at :max_ts]]
                                                  {:group-by [(db/qualify QueryExecution :card_id) :context]
                                                   :where    [:and
                                                              (when-not all-users? [:= :executor_id *current-user-id*])
                                                              [:= :context (h2x/literal :question)]
                                                              [:= :bm.id nil]]
                                                   :order-by [[:max_ts :desc]]
                                                   :limit    card-runs-limit
                                                   :left-join [[:card_bookmark :bm]
                                                               [:and
                                                                [:= :bm.user_id *current-user-id*]
                                                                [:= (db/qualify QueryExecution :card_id) :bm.card_id]]]})
                                       (map #(dissoc % :row_count))
                                       (map #(assoc % :model "card")))]
    (->> (concat card-runs dashboard-and-table-views)
         (sort-by :max_ts)
         reverse)))

(def ^:private views-limit 8)
(def ^:private card-runs-limit 8)

(api/defendpoint GET "/recent_views"
  "Get a list of 5 things the current user has been viewing most recently."
  []
  (let [views            (view-log/user-recent-views)
        model->id->items (models-for-views views)]
    (->> (for [{:keys [model model_id] :as view-log} views
               :let
               [model-object (-> (get-in model->id->items [model model_id])
                                 (dissoc :dataset_query))]
               :when
               (and model-object
                    (mi/can-read? model-object)
                    ;; hidden tables, archived cards/dashboards
                    (not (or (:archived model-object)
                             (= (:visibility_type model-object) :hidden))))]
           (cond-> (assoc view-log :model_object model-object)
             (:dataset model-object) (assoc :model "dataset")))
         (take 5))))

(api/defendpoint GET "/most_recently_viewed_dashboard"
  "Get the most recently viewed dashboard for the current user. Returns a 204 if the user has not viewed any dashboards
   in the last 24 hours."
  []
  (if-let [dashboard-id (view-log/most-recently-viewed-dashboard)]
    (let [dashboard (t2/select-one Dashboard :id dashboard-id)]
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
      (for [[recency-pos {:keys [cnt model_object] :as item}] (zipmap (range) items)]
        (let [verified-wt 1
              official-wt 1
              recency-wt 2
              views-wt 4
              scores [;; cards and dashboards? can be 'verified' in enterprise
                      (if (verified? model_object) verified-wt 0)
                      ;; items may exist in an 'official' collection in enterprise
                      (if (official? model_object) official-wt 0)
                      ;; most recent item = 1 * recency-wt, least recent item of 10 items = 1/10 * recency-wt
                      (* (/ (- n-items recency-pos) n-items) recency-wt)
                      ;; item with highest count = 1 * views-wt, lowest = item-view-count / max-view-count * views-wt

                      ;; NOTE: the query implementation `views-and-runs` has an order-by clause using most recent timestamp
                      ;; this has an effect on the outcomes. Consider an item with a massively high viewcount but a last view by the user
                      ;; a long time ago. This may not even make it into the firs 10 items from the query, even though it might be worth showing
                      (* (/ cnt max-count) views-wt)]]
          (assoc item :score (double (reduce + scores))))))))

(def ^:private model-precedence ["dashboard" "card" "dataset" "table"])

(defn- order-items
  [items]
  (when (seq items)
      (let [groups (group-by :model items)]
        (mapcat #(get groups %) model-precedence))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/popular_items"
  "Get the list of 5 popular things for the current user. Query takes 8 and limits to 5 so that if it
  finds anything archived, deleted, etc it can hopefully still get 5."
  []
  ;; we can do a weighted score which incorporates:
  ;; total count -> higher = higher score
  ;; recently viewed -> more recent = higher score
  ;; official/verified -> yes = higher score
  (let [views (views-and-runs views-limit card-runs-limit true)
        model->id->items (models-for-views views)
        filtered-views (for [{:keys [model model_id] :as view-log} views
                             :let [model-object (-> (get-in model->id->items [model model_id])
                                                    (dissoc :dataset_query))]
                             :when (and model-object
                                        (mi/can-read? model-object)
                                        ;; hidden tables, archived cards/dashboards
                                        (not (or (:archived model-object)
                                                 (= (:visibility_type model-object) :hidden))))]
                         (cond-> (assoc view-log :model_object model-object)
                           (:dataset model-object) (assoc :model "dataset")))
        scored-views (score-items filtered-views)]
    (->> scored-views
         (sort-by :score)
         reverse
         order-items
         (take 5)
         (map #(dissoc % :score)))))

(define-routes)
