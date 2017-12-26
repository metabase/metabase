(ns metabase.automagic-dashboards.core
  "Automatically generate questions and dashboards based on predefined
   heuristics."
  (:require [clojure.math.combinatorics :as combo]
            [clojure.walk :as walk]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards
             [populate :as populate]
             [rules :as rules]]
            [metabase.models
             [field :refer [Field]]
             [permissions :as perms]
             [table :refer [Table]]]
            [toucan
             [db :as db]]))

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

(defn- filter-fields
  [fieldspec table]
  (filter (if (and (string? fieldspec)
                   (rules/ga-dimension? fieldspec))
            (comp #{fieldspec} :name)
            (fn [{:keys [base_type special_type]}]
              (or (isa? base_type fieldspec)
                  (isa? special_type fieldspec))))
          (db/select Field :table_id (:id table))))

(defn- find-linked-table
  [tablespec context]
  (->> context
       :linked-tables
       (filter #(-> % :table :entity_type (isa? tablespec)))))

(defn- field-candidates
  [context fieldspec]
  (if (= (count fieldspec) 2)
    (let [[{:keys [table fk]}] (find-linked-table (first fieldspec) context)]
      (some->> table
               (filter-fields (second fieldspec))
               (map #(assoc % :link fk))))
    (filter-fields (first fieldspec) (:root-table context))))

(defn- make-binding
  [context [binding-name {:keys [field_type score]}]]
  {(name binding-name) {:matches (field-candidates context field_type)
                        :score   score}})

(def ^:private ^{:arglists '([definitions])} resolve-overloading
  (partial apply merge-with (fn [a b]
                              (cond
                                (and (empty? (:matches a))
                                     (:matches b))         b
                                (and (empty? (:matches b))
                                     (:matches a))         a
                                (> (:score a) (:score b))  a
                                :else                      b))))

(defn- make-bindings
  [context bindings]
  (->> bindings
       (map (comp (partial make-binding context) first))
       resolve-overloading))

(defn- dimension-form?
  [form]
  (and (sequential? form)
       (#{:dimension "dimension" "DIMENSION"} (first form))))

(defn- build-query
  [bindings database table-id filters metrics dimensions limit order_by]
  (let [query (walk/postwalk
               (fn [subform]
                 (->reference :mbql (if (dimension-form? subform)
                                      (->> subform second bindings)
                                      subform)))
               {:type     :query
                :database database
                :query    (cond-> {:source_table table-id}
                            (not-empty filters)
                            (assoc :filter (->> filters
                                                (map :filter)
                                                (apply vector :and)))

                            (not-empty dimensions)
                            (assoc :breakout dimensions)

                            metrics
                            (assoc :aggregation (map :metric metrics))

                            limit
                            (assoc :limit limit))})]
    (when (perms/set-has-full-permissions-for-set?
           @api/*current-user-permissions-set*
           (card/query-perms-set query :write))
      query)))

(defn- collect-dimensions
  [form]
  (->> form
       (tree-seq (some-fn map? sequential?) identity)
       (filter dimension-form?)
       (map second)
       distinct))

(defn- instantiate
  [{:keys [dimensions]} definitions]
  (->> definitions
       (filter (comp (fn [[_ definition]]
                       (->> definition
                            collect-dimensions
                            (every? (comp not-empty :matches dimensions))))
                     first))
       resolve-overloading))

(defn- card-candidates
  [context {:keys [metrics filters dimensions score limit order_by] :as card}]
  (let [metrics         (map (partial get (:metrics context)) metrics)
        filters         (map (partial get (:filters context)) filters)
        bindings        (->> dimensions
                             (map (partial get (:dimensions context)))
                             (concat filters metrics))
        score           (* score
                           (/ (transduce (map :score) + bindings)
                              rules/max-score
                              (count bindings)))
        dimensions      (map (partial vector :dimension) dimensions)
        used-dimensions (collect-dimensions [dimensions metrics filters])]
    (->> used-dimensions
         (map (comp :matches (partial get (:dimensions context))))
         (apply combo/cartesian-product)
         (keep (fn [instantiations]
                 (some->> (build-query (zipmap used-dimensions instantiations)
                                       (:database context)
                                       (-> context :root-table :id)
                                       filters
                                       metrics
                                       dimensions
                                       limit
                                       order_by)
                          (assoc card
                            :score score
                            :query)))))))

(defn- best-matching-rule
  "Pick the most specific among applicable rules.
   Most specific is defined as entity type specification the longest ancestor
   chain."
  [rules table]
  (some->> rules
           (filter #(isa? (:entity_type table :type/GenericTable) (:table_type %)))
           not-empty
           (apply max-key (comp count ancestors :table_type))))

(defn- linked-tables
  "Return all tables accessable from a given table and the paths to get there."
  [table]
  (map (fn [{:keys [id fk_target_field_id]}]
         {:table (-> fk_target_field_id Field :table_id Table)
          :fk    id})
       (db/select [Field :id :fk_target_field_id]
         :table_id (:id table)
         :fk_target_field_id [:not= nil])))

(def ^:private ^Integer max-cards 9)

(defn populate-dashboards
  ""
  [root]
  (when-let [rule (best-matching-rule (rules/load-rules) root)]
    (let [context (as-> {:root-table    root
                         :rule          (:table_type rule)
                         :linked-tables (linked-tables root)
                         :database      (:db_id root)} <>
                    (assoc <> :dimensions (make-bindings <> (:dimensions rule)))
                    (assoc <> :metrics (instantiate <> (:metrics rule)))
                    (assoc <> :filters (instantiate <> (:filters rule))))
          cards   (->> rule
                       :cards
                       (keep (comp (fn [[identifier card]]
                                     (some->> card
                                              (card-candidates context)
                                              (hash-map (name identifier))))
                                   first))
                       (apply merge-with (partial max-key (comp :score first)))
                       vals
                       (apply concat))]
      (when (not-empty cards)
        (let [dashboard (populate/create-dashboard! (:title rule)
                                                    (:description rule))]
          (doseq [card (->> cards
                            (sort-by :score >)
                            (take max-cards))]
            (populate/add-to-dashboard! dashboard card))
          (:id dashboard))))))
