(ns metabase.related
  "Related entities recommendations."
  (:require [clojure.set :as set]
            [clojure.string :as str]
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
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private ^Integer max-best-matches        3)
(def ^:private ^Integer max-serendipity-matches 2)
(def ^:private ^Integer max-matches             (+ max-best-matches
                                                   max-serendipity-matches))

(def ^:private ContextBearingForm
  [(s/one (s/constrained (s/either s/Str s/Keyword)
                         (comp #{"field-id" "metric" "segment"}
                               str/lower-case
                               name))
          "head")
   s/Any])

(defn- collect-context-bearing-forms
  [form]
  (into #{}
    (remove (s/checker ContextBearingForm))
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

(defn- metrics-for-table
  [table]
  (filter mi/can-read? (db/select Metric :table_id (:id table))))

(defn- segments-for-table
  [table]
  (filter mi/can-read? (db/select Segment :table_id (:id table))))

(defn- linking-to
  [table]
  (->> (db/select-field :fk_target_field_id Field
         :table_id (:id table)
         :fk_target_field_id [:not= nil])
       (map (comp Table :table_id Field))
       distinct
       (filter mi/can-read?)
       (take max-matches)))

(defn- linked-from
  [table]
  (let [fields (db/select-field :id Field :table_id (:id table))]
    (->> (db/select-field :table_id Field
           :fk_target_field_id [:in fields])
         (map Table)
         (filter mi/can-read?)
         (take max-matches))))

(defn- cards-sharing-dashboard
  [card]
  (when-let [dashboards (not-empty (db/select-field :dashboard_id DashboardCard
                                     :card_id (:id card)))]
    (->> (db/select-field :card_id DashboardCard
           :dashboard_id [:in dashboards]
           :card_id [:not= (:id card)])
         (map Card)
         (filter mi/can-read?)
         (take max-matches))))

(defn- similar-questions
  [card]
  (->> (db/select Card :table_id (:table_id card))
       (filter mi/can-read?)
       (rank-by-similarity card)
       (filter (comp pos? :similarity))))

(defn- canonical-metric
  [card]
  (->> (db/select Metric :table_id (:table_id card))
       (filter (every-pred mi/can-read?
                           (comp #{(-> card
                                       :dataset_query
                                       :query
                                       :aggregation)}
                                 :aggregation :definition)))
       first))

(defn- recently-modified-dashboards
  []
  (->> (db/select-field :model_id 'Revision
         :model   "Dashboard"
         :user_id api/*current-user-id*
         {:order-by [[:timestamp :desc]]})
       (take max-serendipity-matches)))

(defn- recommended-dashboards
  [cards]
  (let [recent           (recently-modified-dashboards)
        card->dashboards (apply db/select-field->field :card_id :dashboard_id
                                DashboardCard
                                (cond-> []
                                  (not-empty cards)
                                  (concat [:card_id [:in (map :id cards)]])

                                  (not-empty recent)
                                  (concat [:dashboard_id [:not-in recent]])))
        best             (->> cards
                              (mapcat (comp card->dashboards :id))
                              (map :dashboard_id)
                              distinct
                              (take max-best-matches))]
    (map Dashboard (concat best recent))))

(defn- recommended-collections
  [cards]
  (->> cards
       (m/distinct-by :collection_id)
       interesting-mix
       (map (comp Collection :collection_id))))

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
  {:segments    (segments-for-table table)
   :metrics     (metrics-for-table table)
   :linking-to  (linking-to table)
   :linked-from (linked-from table)})

(defmethod related (type Dashboard)
  [dashboard]
  (let [cards (map Card (db/select-field :card_id DashboardCard
                          :dashboard_id (:id dashboard)))]
    {:cards (->> cards
                 (mapcat (comp (partial take max-best-matches) similar-questions))
                 (remove (set cards))
                 distinct)}))
