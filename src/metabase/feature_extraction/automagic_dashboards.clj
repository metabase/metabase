(ns metabase.feature-extraction.automagic-dashboards
  "Automatically generate questions and dashboards based on predefined
   heuristics."
  (:require [clojure
             [string :as s]
             [walk :as walk]]
            [clojure.math.combinatorics :as combo]
            [metabase.api
             [common :as api]
             [card :as card.api]]
            [metabase.events :as events]
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

(defn- linked-tables
  "Return all tables accessable from a given table and the paths to get there."
  [table]
  (map (fn [{:keys [id fk_target_field_id]}]
         {:table (-> fk_target_field_id Field :table_id Table)
          :path  [id fk_target_field_id]})
       (db/select [Field :id :fk_target_field_id]
         :table_id (:id table)
         :fk_target_field_id [:not= nil])))

(defmulti
  ^{:doc "Get a MBQL reference for a given model."
    :arglists '([query-type model])
    :private true}
  ->reference (fn [query-type model]
                [query-type (type model)]))

(defmethod ->reference [:mbql (type Field)]
  [_ {:keys [fk_target_field_id id]}]
  (if fk_target_field_id
    [:fk-> id fk_target_field_id]
    [:field-id id]))

(defn- ->type
  [x]
  (if (keyword? x)
    x
    (keyword "type" x)))

(defn- field-candidates
  ([tableset fieldspec]
   (let [fieldspec (->type fieldspec)]
     (filter (fn [{:keys [base_type special_type]}]
               (or (isa? base_type fieldspec)
                   (isa? special_type fieldspec)))
             (db/select Field
               :table_id [:in (map :id tableset)]))))
  ([tableset tablespec fieldspec]
   (let [tablespec (->type tablespec)]
     (field-candidates (filter (comp #(isa? % tablespec) :entity_type) tableset)
                       fieldspec))))

(defn- field-type-op?
  [form]
  (and (sequential? form)
       (= "FIELD-TYPE" (-> form first name s/upper-case))))

(defn- bind-field-type
  [context [_ & typespec :as form]]
  {form (apply field-candidates (:tableset context) typespec)})

(defn- bindings-candidates
  [context form]
  (->> form
       (tree-seq (some-fn map? vector?) identity)
       (filter field-type-op?)
       (map (partial bind-field-type context))
       (apply merge)))

(defn- form-candidates
  [context form]
  (let [form       (if (string? form)
                     (apply vector :field-type (s/split form #"\."))
                     form)
        candidates (bindings-candidates context form)
        subforms   (keys candidates)]
    (->> candidates
         vals
         (apply combo/cartesian-product)
         (mapv (fn [candidates]
                 (walk/postwalk-replace
                  (zipmap subforms (map (partial ->reference :mbql) candidates))
                  form))))))

(defn- bind-entity
  [context [entity {:keys [metric filter field_type score]}]]
  {(name entity) {:score   (or score 100)
                  :matches (form-candidates context (or metric
                                                        filter
                                                        field_type))}})

(defn- bind-entities
  [context entities]
  (->> entities
       (map (comp (partial bind-entity context) first))
       (remove (comp empty? :matches val first))
       (apply merge-with (fn [a b]
                           (if (> (:score a) (:score b))
                             a
                             b)))))

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

(defn- create-dashboard!
  [title description]
  (let [dashboard (db/insert! Dashboard
                    :name        title
                    :description description
                    :creator_id  api/*current-user-id*
                    :parameters  [])]
    (events/publish-event! :dashboard-create dashboard)
    dashboard))

(defn- create-card!
  [{:keys [visualization title description query]}]
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
    card))

(defn- add-to-dashboard!
  [dashboard card]
  (dashboard/add-dashcard! dashboard (create-card! card)
    (merge (next-card-position dashboard)
           {:sizeX card-width
            :sizeY card-height})))

(defn- ensure-seq
  [x]
  (if (sequential? x)
    x
    [x]))

(defn- build-query
  [database table-id filters metric dimensions]
  (let [query {:type     :query
               :database database
               :query    (cond-> {:source_table table-id}
                           (not-empty filters)
                           (assoc :filter (apply vector :and filters))

                           (not-empty dimensions)
                           (assoc :breakout dimensions)

                           metric
                           (assoc :aggregation metric))}]
    (when (perms/set-has-full-permissions-for-set?
           @api/*current-user-permissions-set*
           (card/query-perms-set query :write))
      query)))

(defn- card-candidates
  [context {:keys [metric filters dimensions score] :as card}]
  (let [filters    (some->> filters
                            ensure-seq
                            (map (partial get (:filters context))))
        dimensions (some->> dimensions
                            ensure-seq
                            (map (partial get (:dimensions context))))
        metric     (get (:metrics context) metric)]
    (when (and (every? some? filters)
               (every? some? dimensions)
               metric)
      (let [dimensions-combos (apply combo/cartesian-product
                                     (map :matches dimensions))
            filters-combos    (apply combo/cartesian-product
                                     (map :matches filters))
            score             (* (or score 100)
                                 (/ (transduce (map :score)
                                               +
                                               (concat filters
                                                       dimensions
                                                       [metric]))
                                    100 (+ (count filters)
                                           (count dimensions)
                                           (if metric 1 0))))]
        (for [[filters dimensions metric] (combo/cartesian-product
                                           filters-combos
                                           dimensions-combos
                                           (:matches metric))]
          (when-let [query (build-query (:database context)
                                        (-> context :tableset first :id)
                                        filters
                                        metric
                                        dimensions)]
            (assoc card
              :query query
              :score score)))))))

(def ^:private rules-dir "resources/automagic_dashboards")

(defn- load-rules
  []
  (->> rules-dir
       clojure.java.io/file
       file-seq
       (filter (memfn ^java.io.File isFile))
       ;; Workaround for https://github.com/owainlewis/yaml/issues/11
       (map (comp yaml/parse-string slurp))))

(def ^:private ^Integer max-cards 9)

(defn populate-dashboards
  "Applying heuristics in `rules-dir` to the models in database `database`,
   generate cards and dashboards for all the matching rules.
   If a dashboard with the same name already exists, append to it."
  [root]
  (let [context {:tableset    [root]
                 :database    (:db_id root)}]
    (keep (fn [{:keys [cards metrics dimensions filters table title
                       description]}]
            (when (or (nil? table)
                      (isa? (:entity_type root) table))
              (let [context (assoc context
                              :metrics    (bind-entities context metrics)
                              :filters    (bind-entities context filters)
                              :dimensions (bind-entities context dimensions))
                    cards   (mapcat (partial card-candidates context) cards)]
                (when (not-empty cards)
                  (let [dashboard (create-dashboard! title description)]
                    (doseq [card (->> cards
                                      (sort-by :score >)
                                      (take max-cards))]
                      (add-to-dashboard! dashboard card))
                    (:id dashboard))))))
          (load-rules))))
