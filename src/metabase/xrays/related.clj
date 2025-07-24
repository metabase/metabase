(ns metabase.xrays.related
  "Related entities recommendations."
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.models.interface :as mi]
   [metabase.query-processor.util :as qp.util]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(def ^:private ^Long max-best-matches        3)
(def ^:private ^Long max-serendipity-matches 2)
(def ^:private ^Long max-matches             (+ max-best-matches
                                                max-serendipity-matches))

(def ^:private ContextBearingForm
  [:cat
   [:and
    [:or :string :keyword]
    [:fn
     {:error/message "field, metric, or segment"}
     (comp #{:field :metric :segment}
           qp.util/normalize-token)]]
   [:* :any]])

(defn- collect-context-bearing-forms
  [form]
  (let [form (mbql.normalize/normalize-fragment [:query :filter] form)]
    (into #{}
          (comp (filter (mr/validator ContextBearingForm))
                (map #(update % 0 qp.util/normalize-token)))
          (tree-seq sequential? identity form))))

(defmulti definition
  "Return the relevant parts of a given entity's definition. Relevant parts are those that carry semantic meaning, and
  especially context-bearing forms."
  {:arglists '([instance])}
  mi/model)

(defmethod definition :xrays/Metric
  [metric]
  (-> metric :definition ((juxt :aggregation :filter))))

(defmethod definition :model/Card
  [card]
  (-> card
      :dataset_query
      :query
      ((juxt :breakout :aggregation :expressions :fields))))

(defmethod definition :model/Segment
  [segment]
  (-> segment :definition :filter))

(defmethod definition :model/Field
  [field]
  [[:field-id (:id field)]])

(defn- similarity
  "How similar are entities `a` and `b` based on a structural comparison of their
   definition (MBQL).
   For the purposes of finding related entites we are only interested in
   context-bearing subforms (field, segment, and metric references). We also
   don't care about generalizations (less context-bearing forms) and refinements
   (more context-bearing forms), so we just check if the less specifc form is a
   subset of the more specific one."
  [a b]
  (let [context-a (-> a definition collect-context-bearing-forms)
        context-b (-> b definition collect-context-bearing-forms)
        overlap (set/intersection context-a context-b)
        min-overlap (min (count context-a) (count context-b))]
    (/ (count overlap)
       (max min-overlap 1))))

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

(def ^:private ^{:arglists '([instances])} filter-visible
  (partial filter (fn [{:keys [archived visibility_type active] :as instance}]
                    (and (some? instance)
                         (or (nil? visibility_type)
                             (= (qp.util/normalize-token visibility_type) :normal))
                         (not archived)
                         (not= active false)
                         (mi/can-read? instance)))))

(defn- metrics-for-table
  [table]
  (filter-visible (t2/select :model/Card
                             :table_id (:id table)
                             :type :metric
                             :archived false)))

(defn- segments-for-table
  [table]
  (filter-visible (t2/select :model/Segment
                             :table_id (:id table)
                             :archived false)))

(defn- linking-to
  [table]
  (->> (t2/select-fn-set :fk_target_field_id :model/Field
                         :table_id           (:id table)
                         :fk_target_field_id [:not= nil]
                         :active             true)
       (map (comp (partial t2/select-one :model/Table :id)
                  :table_id
                  (partial t2/select-one :model/Field :id)))
       distinct
       filter-visible
       (take max-matches)))

(defn- linked-from
  [table]
  (if-let [fields (not-empty (t2/select-fn-set :id :model/Field
                                               :table_id (:id table)
                                               :active   true))]
    (->> (t2/select-fn-set :table_id :model/Field
                           :fk_target_field_id [:in fields]
                           :active             true)
         (map (partial t2/select-one :model/Table :id))
         filter-visible
         (take max-matches))
    []))

(defn- cards-sharing-dashboard
  [card]
  (if-let [dashboards (not-empty (t2/select-fn-set :dashboard_id :model/DashboardCard
                                                   :card_id (:id card)))]
    (->> (t2/select-fn-set :card_id :model/DashboardCard
                           :dashboard_id [:in dashboards]
                           :card_id      [:not= (:id card)])
         (map (partial t2/select-one :model/Card :id))
         filter-visible
         (take max-matches))
    []))

(defn- similar-questions
  [card]
  (->> (t2/select :model/Card
                  :table_id (:table_id card)
                  :type [:in [:model :question]]
                  :archived false)
       filter-visible
       (rank-by-similarity card)
       (filter (comp pos? :similarity))))

(defn- similar-metrics
  [card]
  (->> (t2/select :model/Card
                  :table_id (:table_id card)
                  :type :metric
                  :archived false)
       filter-visible
       (rank-by-similarity card)
       (filter (comp pos? :similarity))))

(defn- recently-modified-dashboards
  []
  (when-let [dashboard-ids (not-empty (t2/select-fn-set :model_id :model/Revision
                                                        :model     "Dashboard"
                                                        :user_id   api/*current-user-id*
                                                        {:order-by [[:timestamp :desc]]}))]
    (->> (t2/select :model/Dashboard :id [:in dashboard-ids])
         filter-visible
         (take max-serendipity-matches))))

(defn- recommended-dashboards
  [cards]
  (let [recent                   (recently-modified-dashboards)
        card-id->dashboard-cards (->> (apply t2/select [:model/DashboardCard :card_id :dashboard_id]
                                             (cond-> []
                                               (seq cards)
                                               (concat [:card_id [:in (map :id cards)]])

                                               (seq recent)
                                               (concat [:dashboard_id [:not-in (map :id recent)]])))
                                      (group-by :card_id))
        dashboard-ids (->> (map :id cards)
                           (mapcat card-id->dashboard-cards)
                           (map :dashboard_id)
                           distinct)
        best          (when (seq dashboard-ids)
                        (->> (t2/select :model/Dashboard :id [:in dashboard-ids])
                             filter-visible
                             (take max-best-matches)))]
    (concat best recent)))

(defn- recommended-collections
  [cards]
  (->> cards
       (m/distinct-by :collection_id)
       interesting-mix
       (keep (comp (partial t2/select-one :model/Collection :id) :collection_id))
       filter-visible))

(defmulti related
  "Return related entities."
  {:arglists '([entity])}
  mi/model)

(defmethod related :model/Card
  [card]
  (let [table             (t2/select-one :model/Table :id (:table_id card))
        similar-questions (similar-questions card)
        similar-metrics   (similar-metrics card)]
    {:table             table
     :metrics           (interesting-mix similar-metrics)
     :segments          (->> table
                             segments-for-table
                             (rank-by-similarity card)
                             interesting-mix)
     :dashboard-mates   (cards-sharing-dashboard card)
     :dashboards        (recommended-dashboards similar-questions)
     :collections       (recommended-collections similar-questions)}))

(defmethod related :model/Query
  [query]
  (related (mi/instance :model/Card query)))

(defmethod related :xrays/Metric
  [metric]
  (let [table (t2/select-one :model/Table :id (:table_id metric))]
    {:table    table
     :segments (->> table
                    segments-for-table
                    (rank-by-similarity metric)
                    interesting-mix)}))

(defmethod related :model/Segment
  [segment]
  (let [table (t2/select-one :model/Table :id (:table_id segment))]
    {:table       table
     :metrics     (metrics-for-table table)
     :segments    (->> table
                       segments-for-table
                       (rank-by-similarity segment)
                       interesting-mix)
     :linked-from (linked-from table)}))

(defmethod related :model/Table
  [table]
  (let [linking-to  (linking-to table)
        linked-from (linked-from table)]
    {:segments    (segments-for-table table)
     :metrics     (metrics-for-table table)
     :linking-to  linking-to
     :linked-from linked-from
     :tables      (->> (t2/select :model/Table
                                  :db_id           (:db_id table)
                                  :schema          (:schema table)
                                  :id              [:not= (:id table)]
                                  :visibility_type nil
                                  :active          true)
                       (remove (set (concat linking-to linked-from)))
                       filter-visible
                       interesting-mix)}))

(defmethod related :model/Field
  [field]
  (let [table (t2/select-one :model/Table :id (:table_id field))]
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
     :fields   (->> (t2/select :model/Field
                               :table_id        (:id table)
                               :id              [:not= (:id field)]
                               :visibility_type "normal"
                               :active          true)
                    filter-visible
                    interesting-mix)}))

(defmethod related :model/Dashboard
  [dashboard]
  (let [cards (map (partial t2/select-one :model/Card :id) (t2/select-fn-set :card_id :model/DashboardCard
                                                                             :dashboard_id (:id dashboard)))]
    {:cards (->> cards
                 (mapcat similar-questions)
                 (remove (set cards))
                 distinct
                 filter-visible
                 interesting-mix)}))
