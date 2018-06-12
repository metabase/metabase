(ns metabase.related
  "Related entities recommendations."
  (:require [clojure.set :as set]
            [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [field :refer [Field]]
             [interface :as mi]
             [metric :refer [Metric]]
             [query :refer [Query]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.query-processor.util :as qp.util]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private ^Long max-best-matches        3)
(def ^:private ^Long max-serendipity-matches 2)
(def ^:private ^Long max-matches             (+ max-best-matches
                                                max-serendipity-matches))

(def ^:private ContextBearingForm
  [(s/one (s/constrained (s/cond-pre s/Str s/Keyword)
                         (comp #{:field-id :metric :segment :fk->}
                               qp.util/normalize-token))
          "head")
   s/Any])

(defn- collect-context-bearing-forms
  [form]
  (into #{}
        (comp (remove (s/checker ContextBearingForm))
              (map #(update % 0 qp.util/normalize-token)))
    (tree-seq sequential? identity form)))

(defmulti
  ^{:doc "Return the relevant parts of a given entity's definition.
          Relevant parts are those that carry semantic meaning, and especially
          context-bearing forms."
    :arglists '([entity])}
  definition type)

(defmethod definition (type Card)
  [card]
  (-> card
      :dataset_query
      :query
      ((juxt :breakout :aggregation :expressions :fields))))

(defmethod definition (type Metric)
  [metric]
  (-> metric :definition ((juxt :aggregation :filter))))

(defmethod definition (type Segment)
  [segment]
  (-> segment :definition :filter))

(defmethod definition (type Field)
  [field]
  [[:field-id (:id field)]])

(defn similarity
  "How similar are entities `a` and `b` based on a structural comparison of their
   definition (MBQL).
   For the purposes of finding related entites we are only interested in
   context-bearing subforms (field, segment, and metric references). We also
   don't care about generalizations (less context-bearing forms) and refinements
   (more context-bearing forms), so we just check if the less specifc form is a
   subset of the more specific one."
  [a b]
  (let [context-a (-> a definition collect-context-bearing-forms)
        context-b (-> b definition collect-context-bearing-forms)]
    (/ (count (set/intersection context-a context-b))
       (max (min (count context-a) (count context-b)) 1))))

(defn- rank-by-similarity
  [reference entities]
  (->> entities
       (remove #{reference})
       (map #(assoc % :similarity (similarity reference %)))
       (sort-by :similarity >)))

(defn- interesting-mix
  "Create an interesting mix of matches. The idea is to have a balanced mix
   between close (best) matches and more diverse matches to cover a wider field
   of intents."
  [matches]
  (let [[best rest] (split-at max-best-matches matches)]
    (concat best (->> rest shuffle (take max-serendipity-matches)))))

(def ^:private ^{:arglists '([entities])} filter-visible
  (partial filter (fn [{:keys [archived visibility_type] :as entity}]
                    (and (or (nil? visibility_type)
                             (= (name visibility_type) "normal"))
                         (not archived)
                         (mi/can-read? entity)))))

(defn- metrics-for-table
  [table]
  (filter-visible (db/select Metric
                    :table_id  (:id table)
                    :archived false)))

(defn- segments-for-table
  [table]
  (filter-visible (db/select Segment
                    :table_id  (:id table)
                    :archived false)))

(defn- linking-to
  [table]
  (->> (db/select-field :fk_target_field_id Field
         :table_id (:id table)
         :fk_target_field_id [:not= nil])
       (map (comp Table :table_id Field))
       distinct
       filter-visible
       (take max-matches)))

(defn- linked-from
  [table]
  (if-let [fields (not-empty (db/select-field :id Field :table_id (:id table)))]
    (->> (db/select-field :table_id Field
           :fk_target_field_id [:in fields])
         (map Table)
         filter-visible
         (take max-matches))
    []))

(defn- cards-sharing-dashboard
  [card]
  (if-let [dashboards (not-empty (db/select-field :dashboard_id DashboardCard
                                     :card_id (:id card)))]
    (->> (db/select-field :card_id DashboardCard
           :dashboard_id [:in dashboards]
           :card_id [:not= (:id card)])
         (map Card)
         filter-visible
         (take max-matches))
    []))

(defn- similar-questions
  [card]
  (->> (db/select Card
         :table_id (:table_id card)
         :archived false)
       filter-visible
       (rank-by-similarity card)
       (filter (comp pos? :similarity))))

(defn- canonical-metric
  [card]
  (->> (db/select Metric
         :table_id (:table_id card)
         :archived false)
       filter-visible
       (m/find-first (comp #{(-> card :dataset_query :query :aggregation)}
                           :aggregation
                           :definition))))

(defn- recently-modified-dashboards
  []
  (->> (db/select-field :model_id 'Revision
         :model   "Dashboard"
         :user_id api/*current-user-id*
         {:order-by [[:timestamp :desc]]})
       (map Dashboard)
       filter-visible
       (take max-serendipity-matches)))

(defn- recommended-dashboards
  [cards]
  (let [recent           (recently-modified-dashboards)
        card->dashboards (->> (apply db/select [DashboardCard :card_id :dashboard_id]
                                     (cond-> {}
                                       (not-empty cards)
                                       (assoc :card_id [:in (map :id cards)])

                                       (not-empty recent)
                                       (assoc :dashboard_id [:not-in recent])))
                              (group-by :card_id))
        best             (->> cards
                              (mapcat (comp card->dashboards :id))
                              distinct
                              (map Dashboard)
                              filter-visible
                              (take max-best-matches))]
    (concat best recent)))

(defn- recommended-collections
  [cards]
  (->> cards
       (m/distinct-by :collection_id)
       interesting-mix
       (keep (comp Collection :collection_id))
       filter-visible))

(defmulti
  ^{:doc "Return related entities."
    :arglists '([entity])}
  related type)

(defmethod related (type Card)
  [card]
  (let [table             (Table (:table_id card))
        similar-questions (similar-questions card)]
    {:table             table
     :metrics           (->> table
                             metrics-for-table
                             (rank-by-similarity card)
                             interesting-mix)
     :segments          (->> table
                             segments-for-table
                             (rank-by-similarity card)
                             interesting-mix)
     :dashboard-mates   (cards-sharing-dashboard card)
     :similar-questions (interesting-mix similar-questions)
     :canonical-metric  (canonical-metric card)
     :dashboards        (recommended-dashboards similar-questions)
     :collections       (recommended-collections similar-questions)}))

(defmethod related (type Query)
  [query]
  (related (with-meta query {:type (type Card)})))

(defmethod related (type Metric)
  [metric]
  (let [table (Table (:table_id metric))]
    {:table    table
     :metrics  (->> table
                    metrics-for-table
                    (rank-by-similarity metric)
                    interesting-mix)
     :segments (->> table
                    segments-for-table
                    (rank-by-similarity metric)
                    interesting-mix)}))

(defmethod related (type Segment)
  [segment]
  (let [table (Table (:table_id segment))]
    {:table       table
     :metrics     (->> table
                       metrics-for-table
                       (rank-by-similarity segment)
                       interesting-mix)
     :segments    (->> table
                       segments-for-table
                       (rank-by-similarity segment)
                       interesting-mix)
     :linked-from (linked-from table)}))

(defmethod related (type Table)
  [table]
  (let [linking-to  (linking-to table)
        linked-from (linked-from table)]
    {:segments    (segments-for-table table)
     :metrics     (metrics-for-table table)
     :linking-to  linking-to
     :linked-from linked-from
     :tables      (->> (db/select Table
                         :db_id           (:db_id table)
                         :schema          (:schema table)
                         :id              [:not= (:id table)]
                         :visibility_type nil)
                       (remove (set (concat linking-to linked-from)))
                       filter-visible
                       interesting-mix)}))

(defmethod related (type Field)
  [field]
  (let [table (Table (:table_id field))]
    {:table    table
     :segments (->> table
                    segments-for-table
                    (rank-by-similarity field)
                    interesting-mix)
     :metrics  (->> table
                    metrics-for-table
                    (rank-by-similarity field)
                    (filter (comp pos? :similarity))
                    interesting-mix)
     :fields   (->> (db/select Field
                      :table_id        (:id table)
                      :id              [:not= (:id field)]
                      :visibility_type "normal")
                    filter-visible
                    interesting-mix)}))

(defmethod related (type Dashboard)
  [dashboard]
  (let [cards (map Card (db/select-field :card_id DashboardCard
                          :dashboard_id (:id dashboard)))]
    {:cards (->> cards
                 (mapcat (comp similar-questions))
                 (remove (set cards))
                 distinct
                 filter-visible
                 interesting-mix)}))
