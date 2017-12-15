(ns metabase.feature-extraction.automagic-dashboards
  "Automatically generate questions and dashboards based on predefined
   heuristics."
  (:require [clojure
             [string :as s]
             [walk :as walk]]
            [medley.core :as m]
            [metabase.api
             [common :as api]
             [card :as card.api]]
            [metabase.events :as events]
            [metabase.feature-extraction.core :as fe]
            [metabase.models
             [card :as card :refer [Card]]
             [dashboard :as dashboard :refer [Dashboard]]
             [database :refer [virtual-id]]
             [field :refer [Field]]
             [metric :as metric :refer [Metric]]
             [permissions :as perms]
             [table :refer [Table]]]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [yaml.core :as yaml]))

(defmulti
  ^{:doc "Get a MBQL reference for a given model."
    :arglists '([query-type model])
    :private true}
  ->reference (fn [query-type model]
                [query-type (type model)]))

(defmethod ->reference [:mbql (type Table)]
  [_ table]
  (:id table))

(defmethod ->reference [:mbql (type Card)]
  [_ card]
  (format "card__%s" (:id card)))

(defmethod ->reference [:mbql (type Metric)]
  [_ metric]
  ["METRIC" (:id metric)])

(defmethod ->reference [:mbql (type Field)]
  [_ {:keys [fk_target_field_id id]}]
  (if fk_target_field_id
    [:fk-> id fk_target_field_id]
    [:field-id id]))

(defmulti
  ^{:doc ""
    :arglists '([context [op & args]])
    :private true}
  op (fn [_ [op & _]]
       (if (keyword? op)
         op
         (keyword op))))

(defmethod op :field-type
  [context [_ type :as form]]
  (let [type (if (keyword? type)
               type
               (keyword "type" type))]
    {:fields {form (filter
                    (fn [{:keys [base_type special_type]}]
                      (or (isa? base_type type)
                          (isa? special_type type)))
                    (db/select Field
                      :table_id [:in (->> context :tableset (map :id))]))}}))

(defmethod op :metric
  [context [_ metric-name :as form]]
  {:metrics {form (-> context :metrics (get metric-name))}})

(defmethod op :card-source
  [context [_ card-name :as form]]
  {:card-sources {form (-> context :source-cards (get card-name))}})

(defmethod op :default
  [_ _]
  nil)

(defn- op?
  [form]
  (and (sequential? form)
       ((some-fn keyword? string?) (first form))))

(defn bindings-candidates
  [context form]
  (->> form
       (tree-seq (some-fn map? vector?) identity)
       (filter op?)
       (keep (partial op context))
       (apply merge-with merge)))

(defn- linked-tables
  "Return all tables accessable from a given table and the paths to get there."
  [table]
  (map (fn [{:keys [id fk_target_field_id]}]
         {:table (-> fk_target_field_id Field :table_id Table)
          :path  [id fk_target_field_id]})
       (db/select [Field :id :fk_target_field_id]
         :table_id (:id table)
         :fk_target_field_id [:not= nil])))

(defn- linked-table?
  [context from to]
  (-> context :table-links (get from) (contains? to)))

(defn- denormalize
  [context table-bindings]
  (into {}
    (for [[root bindings] table-bindings]
      [root (->> table-bindings
                 (filter (comp (partial linked-table? context root) key))
                 (reduce  (fn [acc [_ bindings]]
                            (merge-with (partial merge-with into) acc bindings))
                          bindings))])))

(defn- complete-match?
  [fields table-bindings]
  (= (count fields) (count table-bindings)))

(defn- best-table-match
  [candidates]
  (first candidates))

(defn- best-field-match
  [candidates]
  (first candidates))

(defn- unify-fields
  [context fields]
  (let [[root fields] (->> fields
                           (map (fn [[form candidates]]
                                  (->> candidates
                                       (group-by :table_id)
                                       (m/map-vals (fn [candidates]
                                                     {form candidates})))))
                           (apply merge-with merge)
                           (denormalize context)
                           (filter (comp (partial complete-match? fields) val))
                           best-table-match)]
    {:fields     (m/map-vals best-field-match fields)
     :root-table root}))

(defn- build-bindings
  [context form]
  (let [candidates (bindings-candidates context form)]
    (merge candidates (unify-fields context (:fields candidates)))))

(def ^:private table-links
  (partial into {}
           (map (fn [table]
                  [table (set (map :table (linked-tables table)))]))))

(defn- bindings->references
  [query-type bindings]
  (->> [:fields :cards :metrics]
       (map bindings)
       (apply merge)
       (m/map-vals (partial ->reference query-type))))

(def ^:private ^Integer grid-width 18)
(def ^:private ^Integer card-width 6)
(def ^:private ^Integer card-height 4)

(defn- next-card-position
  "Return `:row` x `:col` coordinates for the next card to be placed on
   dashboard `dashboard`.
   Assumes a grid `grid-width` cells wide with cards sized
   `card-width` x `card-height`."
  [dashboard]
  (let [num-cards (db/count 'DashboardCard :dashboard_id (:id dashboard))]
    {:row (int (* (Math/floor (/ (* card-width num-cards)
                                 grid-width))
                  card-height))
     :col (int (* (Math/floor (/ (mod (* card-width num-cards) grid-width)
                                 card-width))
                  card-width))}))

(defn- create-dashboards!
  [dashboards]
  (into {}
    (for [{:keys [title as descriptioin]} dashboards]
      [as (delay (let [dashboard (db/insert! Dashboard
                                   :name        title
                                   :description descriptioin
                                   :creator_id  api/*current-user-id*
                                   :parameters  [])]
                   (events/publish-event! :dashboard-create dashboard)
                   dashboard))])))

(defn- add-to-dashboard!
  [dashboard card]
  (dashboard/add-dashcard! dashboard card (merge (next-card-position dashboard)
                                                 {:sizeX card-width
                                                  :sizeY card-height}))
  dashboard)

(def ^:private complete-bindings?
  (comp (partial every? (fn [bindings]
                          (cond
                            (nil? bindings) false
                            (map? bindings) (every? some? (vals bindings))
                            :else           true)))
        vals))

(defn- build-query
  [context query]
  (let [bindings (build-bindings context query)]
    (when (complete-bindings? bindings)
      (let [query         (walk/postwalk-replace
                           (bindings->references :mbql bindings)
                           query)
            dataset_query (if (map? query)
                            {:type     :query
                             :query    (update query :source_table
                                               #(or % (:root-table bindings)))
                             :database (if ((every-pred
                                             string?
                                             #(s/starts-with? % "card__"))
                                            (:source_table query))
                                         virtual-id
                                         (:database context))}
                            {:type     :native
                             :native   {:query query}
                             :database (:database context)})]
        (when (perms/set-has-full-permissions-for-set?
               @api/*current-user-permissions-set*
               (card/query-perms-set dataset_query :write))
          dataset_query)))))

(defn- create-card!
  [context {:keys [visualization title description query] :as card}]
  (when-let [query (build-query context query)]
    (let [[visualization visualization-settings] (if (sequential? visualization)
                                                   visualization
                                                   [visualization {}])
          card (db/insert! Card
                 :creator_id             api/*current-user-id*
                 :dataset_query          query
                 :description            description
                 :display                (or visualization :table)
                 :name                   title
                 :visualization_settings visualization-settings

                 :result_metadata        (card.api/result-metadata-for-query query)
                 :collection_id          nil)]
      (events/publish-event! :card-create card)
      (hydrate card :creator :dashboard_count :labels :can_write :collection)
      card)))

(defn- create-metrics!
  [context metrics]
  (when api/*is-superuser?*
    (into {}
      (for [{:keys [description title metadata as query] :as metric} metrics]
        [as (when-let [query (:query (build-query context query))]
              (metric/create-metric! (:source_table query)
                                     title
                                     (format "[Autogenerated] %s"
                                             (or description ""))
                                     api/*current-user-id*
                                     query))]))))

(def ^:private rules-dir "resources/automagic_dashboards")

(defn- load-rules
  []
  (->> rules-dir
       clojure.java.io/file
       file-seq
       (filter (memfn ^java.io.File isFile))
       ;; Workaround for https://github.com/owainlewis/yaml/issues/11
       (map (comp yaml/parse-string slurp))))

(defn populate-dashboards
  "Applying heuristics in `rules-dir` to the models in database `database`,
   generate cards and dashboards for all the matching rules.
   If a dashboard with the same name already exists, append to it."
  [tableset]
  (let [table-links (table-links tableset)
        context     {:tableset    (concat (keys table-links)
                                          (mapcat val table-links))
                     :table-links table-links
                     :database    (-> tableset first :db_id)}]
    (->> (load-rules)
         (mapcat (fn [{:keys [cards dashboards metrics]}]
                   (let [dashboards      (create-dashboards! dashboards)
                         metrics         (create-metrics! context metrics)
                         source-cards    (into {}
                                           (for [card cards :when (:as card)]
                                             [(:as card) (create-card! context
                                                                       card)]))
                         context         (assoc context
                                           :metrics      metrics
                                           :dashboards   dashboards
                                           :source-cards source-cards)]
                     (doseq [card cards :when (nil? (:as card))]
                       (let [dashboard (some->> card
                                                :dashboard
                                                (get dashboards))
                             card      (create-card! context card)]
                         (when (and card dashboard)
                           (add-to-dashboard! @dashboard card))))
                     (->> dashboards
                          vals
                          (filter realized?)
                          (map (comp :id deref))))))
         distinct)))
