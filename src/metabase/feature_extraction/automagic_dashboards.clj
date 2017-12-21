(ns metabase.feature-extraction.automagic-dashboards
  "Automatically generate questions and dashboards based on predefined
   heuristics."
  (:require [clojure
             [string :as str]
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

(def ^:private ^Integer max-score 100)

(defn- linked-tables
  "Return all tables accessable from a given table and the paths to get there."
  [table]
  (map (fn [{:keys [id fk_target_field_id]}]
         {:table (-> fk_target_field_id Field :table_id Table)
          :fk    id})
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
  [_ {:keys [fk_target_field_id id link]}]
  (cond
    link               [:fk-> link id]
    fk_target_field_id [:fk-> id fk_target_field_id]
    :else              [:field-id id]))

(defmethod ->reference :default
  [_ form]
  form)

(defn- ->type
  [x]
  (if (keyword? x)
    x
    (keyword "type" x)))

(defn- filter-fields
  [fieldspec table]
  (let [fieldspec (->type fieldspec)]
    (filter (fn [{:keys [base_type special_type]}]
              (or (isa? base_type fieldspec)
                  (isa? special_type fieldspec)))
            (db/select Field :table_id (:id table)))))

(defn- find-linked-table
  [tablespec context]
  (let [tablespec (->type tablespec)]
    (->> context
         :linked-tables
         (filter #(-> % :table :entity_type (isa? tablespec))))))

(defn- field-candidates
  ([context fieldspec]
   (filter-fields fieldspec (:root-table context)))
  ([context tablespec fieldspec]
   (let [[{:keys [table fk]}] (find-linked-table tablespec context)]
     (some->> table
              (filter-fields fieldspec)
              (map #(assoc % :link fk))))))

(defn- op?
  [form]
  (and (sequential? form)
       ((some-fn keyword? string?) (first form))))

(defmulti
  ^{:doc ""
    :arglists '([context [op & args]])
    :private true}
  op (fn [_ [op & _]]
       (if (keyword? op)
         op
         (keyword (str/lower-case op)))))

(defmethod op :field-type
  [context [_ & typespec :as form]]
  {form (apply field-candidates context typespec)})

(defmethod op :dimension
  [context [_ dimension :as form]]
  {form (-> context :dimensions (get dimension) :matches)})

(defmethod op :default
  [_ _]
  nil)

(defn- matches
  [context pattern]
  (let [pattern    (if (string? pattern)
                     (apply vector :field-type (str/split pattern #"\."))
                     pattern)
        candidates (->> pattern
                        (tree-seq (some-fn map? vector?) identity)
                        (filter op?)
                        (keep (partial op context))
                        (apply merge))
        holes      (keys candidates)]
    (->> candidates
         vals
         (apply combo/cartesian-product)
         (map (fn [candidate-set]
                (walk/postwalk-replace (zipmap holes candidate-set) pattern))))))

(defn- make-binding
  [context [binding-name {:keys [metric filter field_type score]}]]
  {(name binding-name) {:matches (matches context (or metric filter field_type))
                        :score   (or score max-score)}})

(defn- make-bindings
  [context bindings]
  (->> bindings
       (map (comp (partial make-binding context) first))
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

(defn- create-collection!
  [name color description]
  (when api/*is-superuser?*
    (db/insert! 'Collection
      :name        name
      :color       color
      :description description)))

(def automagic-collection (delay
                           (or (db/select-one 'Collection
                                 :name "Automagic dashboards cards")
                               (create-collection! "Automagic dashboards cards"
                                                   "#000000"
                                                   "All the cards we have automatically created for you."))))

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
               :collection_id          (-> automagic-collection deref :id))]
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
  [database table-id filters metrics dimensions limit order_by]
  (let [query (walk/postwalk
               (partial ->reference :mbql)
               {:type     :query
                :database database
                :query    (cond-> {:source_table table-id}
                            (not-empty filters)
                            (assoc :filter (apply vector :and filters))

                            (not-empty dimensions)
                            (assoc :breakout dimensions)

                            metrics
                            (assoc :aggregation metrics)

                            limit
                            (assoc :limit limit))})]
    (when (perms/set-has-full-permissions-for-set?
           @api/*current-user-permissions-set*
           (card/query-perms-set query :write))
      query)))

(defn- card-candidates
  [context {:keys [metrics filters dimensions score limit order_by query] :as card}]
  (let [filters    (some->> filters
                            ensure-seq
                            (map (partial get (:filters context))))
        dimensions (some->> dimensions
                            ensure-seq
                            (map (partial get (:dimensions context))))
        metrics    (some->> metrics
                            ensure-seq
                            (map (partial get (:metrics context))))
        bindings   (concat filters dimensions metrics)]
    (when (every? some? bindings)
      (let [score (* (or score max-score)
                     (/ (transduce (map :score) + bindings)
                        max-score
                        (count bindings)))]
        (->> (combo/cartesian-product
              (apply combo/cartesian-product (map :matches filters))
              (apply combo/cartesian-product (map :matches dimensions))
              (apply combo/cartesian-product (map :matches metrics)))
             (keep (fn [[filters dimensions metrics]]
                     (when-let [query (build-query (:database context)
                                                   (-> context :root-table :id)
                                                   filters
                                                   metrics
                                                   dimensions
                                                   limit
                                                   order_by)]
                       (assoc card
                         :query query
                         :score score)))))))))

(def ^:private rules-dir "resources/automagic_dashboards")

(defn- load-rules
  []
  (->> rules-dir
       clojure.java.io/file
       file-seq
       (filter (memfn ^java.io.File isFile))
       (map (fn [f]
              (-> f
                  slurp
                  yaml/parse-string
                  (update :table_type #(-> %
                                           (or (->> f
                                                    .getName
                                                    (re-find #".+(?=\.yaml)")))
                                           ->type)))))))

(defn- best-matching-rule
  "Pick the most specific among applicable rules.
   Most specific is defined as entity type specification the longest ancestor
   chain."
  [rules table]
  (some->> rules
           (filter #(isa? (:entity_type table :type/GenericTable) (:table_type %)))
           not-empty
           (apply max-key (comp count ancestors :table_type))))

(def ^:private ^Integer max-cards 9)

(defn populate-dashboards
  "Applying heuristics in `rules-dir` to the models in database `database`,
   generate cards and dashboards for all the matching rules.
   If a dashboard with the same name already exists, append to it."
  [root]
  (when-let [rule (best-matching-rule (load-rules) root)]
    (let [context (reduce-kv
                   (fn [context k bindings]
                     (assoc context k (make-bindings context bindings)))
                   {:root-table    root
                    :rule          (:table_type rule)
                    :linked-tables (linked-tables root)
                    :database      (:db_id root)}
                   (select-keys rule [:dimensions :metrics :filters]))
          cards   (->> rule
                       :cards
                       (map (comp (fn [[id card]]
                                    {(name id) (card-candidates context card)})
                                  first))
                       (remove (comp empty? val first))
                       (apply merge-with (partial max-key (comp :score first)))
                       vals
                       (apply concat))]
      (when (not-empty cards)
        (let [dashboard (create-dashboard! (:title rule) (:description rule))]
          (doseq [card (->> cards
                            (sort-by :score >)
                            (take max-cards))]
            (add-to-dashboard! dashboard card))
          (:id dashboard))))))
