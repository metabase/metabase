(ns metabase.automagic-dashboards.core
  "Automatically generate questions and dashboards based on predefined
   heuristics."
  (:require [clojure.math.combinatorics :as combo]
            [clojure.tools.logging :as log]
            [clojure.string :as str]
            [clojure.walk :as walk]
            [kixi.stats.core :as stats]
            [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards
             [populate :as populate]
             [rules :as rules]]
            [metabase.models
             [card :as card]
             [field :refer [Field]]
             [permissions :as perms]
             [table :refer [Table]]]
            [metabase.util :as u]
            [toucan
             [db :as db]]))

(defmulti
  ^{:doc "Get a reference for a given model to be injected into a template
          (either MBQL, native query, or string)."
    :arglists '([template-type model])
    :private true}
  ->reference (fn [template-type model]
                [template-type (type model)]))

(defmethod ->reference [:mbql (type Field)]
  [_ {:keys [fk_target_field_id id link]}]
  (cond
    link               [:fk-> link id]
    fk_target_field_id [:fk-> id fk_target_field_id]
    :else              [:field-id id]))

(defmethod ->reference [:string (type Field)]
  [_ {:keys [display_name]}]
  display_name)

(defmethod ->reference [:string (type Table)]
  [_ {:keys [display_name]}]
  display_name)

(defmethod ->reference [:native (type Field)]
  [_ {:keys [name table_id]}]
  (format "%s.%s" (-> table_id Table :name) name))

(defmethod ->reference [:native (type Table)]
  [_ {:keys [name]}]
  name)

(defmethod ->reference :default
  [_ form]
  form)

(defn- filter-fields
  "Find all fields of type `fieldspec` belonging to table `table`."
  [fieldspec table]
  (filter (if (and (string? fieldspec)
                   (rules/ga-dimension? fieldspec))
            (comp #{fieldspec} :name)
            (fn [{:keys [base_type special_type]}]
              (or (isa? base_type fieldspec)
                  (isa? special_type fieldspec))))
          (db/select Field :table_id (:id table))))

(defn- filter-tables
  [tablespec context]
  (filter #(-> % :entity_type (isa? tablespec)) (:tables context)))

(defn- fill-template
  [template-type context bindings template]
  (str/replace template #"\[\[(\w+)\]\]"
               (fn [[_ identifier]]
                 (->reference template-type (or (bindings identifier)
                                                (-> identifier
                                                    rules/->type
                                                    (filter-tables context)
                                                    first)
                                                identifier)))))

(defn- field-candidates
  [context {:keys [field_type links_to] :as constraints}]
  (if links_to
    (filter (comp (->> (filter-tables links_to context)
                       (keep :link)
                       set)
                  :id)
            (field-candidates context (dissoc constraints :links_to)))
    (let [[tablespec fieldspec] field_type]
      (if fieldspec
        (let [[table] (filter-tables tablespec context)]
          (some->> table
                   (filter-fields fieldspec)
                   (map #(assoc % :link (:link table)))))
        (filter-fields tablespec (:root-table context))))))

(defn- make-binding
  [context [identifier {:keys [field_type score] :as definition}]]
  {(name identifier) {:matches    (field-candidates context definition)
                      :field_type field_type
                      :score      score}})

(defn- bind-dimensions
  [context dimensions]
  (->> dimensions
       (map (comp (partial make-binding context) first))
       (apply merge-with (fn [a b]
                           (cond
                             (and (empty? (:matches a))
                                  (not-empty (:matches b))) b
                             (and (empty? (:matches b))
                                  (not-empty (:matches a))) a
                             (> (:score a) (:score b))      a
                             :else                          b)))))

(defn- index-of
  [pred coll]
  (first (keep-indexed (fn [idx x]
                         (when (pred x)
                           idx))
                       coll)))

(defn- build-order-by
  [dimensions metrics order-by]
  (let [dimensions (set dimensions)]
    (for [[identifier ordering] (map first order-by)]
      [(if (= ordering "ascending")
         :asc
         :desc)
       (if (dimensions identifier)
         [:dimension identifier]
         [:aggregate-field (index-of #{identifier} metrics)])])))

(defn- have-permissions?
  [query]
  (perms/set-has-full-permissions-for-set? @api/*current-user-permissions-set*
                                           (card/query-perms-set query :write)))

(defn- build-query
  ([context bindings filters metrics dimensions limit order_by]
   (walk/postwalk
    (fn [subform]
      (if (rules/dimension-form? subform)
        (->> subform second bindings (->reference :mbql))
        subform))
    {:type     :query
     :database (:database context)
     :query    (cond-> {:source_table (-> context :root-table :id)}
                 (not-empty filters)
                 (assoc :filter (cond->> (map :filter filters)
                                  (> (count filters) 1) (apply vector :and)))

                 (not-empty dimensions)
                 (assoc :breakout dimensions)

                 (not-empty metrics)
                 (assoc :aggregation (map :metric metrics))

                 limit
                 (assoc :limit limit)

                 (not-empty order_by)
                 (assoc :order_by order_by))}))
  ([context bindings query]
   {:type     :native
    :native   {:query (fill-template :native context bindings query)}
    :database (:database context)}))

(defn- resolve-overloading
  "Find the overloaded definition with the highest `score` for which all
   referenced dimensions have at least one matching field."
  [{:keys [dimensions]} definitions]
  (->> definitions
       (filter (comp (fn [[_ definition]]
                       (->> definition
                            rules/collect-dimensions
                            (every? (comp not-empty :matches dimensions))))
                     first))
       (apply merge-with (partial max-key :score))))

(defn- instantiate-metadata
  [context bindings x]
  (let [fill-template (partial fill-template :string context bindings)]
    (-> x
        (update :title fill-template)
        (u/update-when :description fill-template))))

(defn- card-candidates
  "Generate all potential cards given a card definition and bindings for
   dimensions, metrics, and filters."
  [context {:keys [metrics filters dimensions score limit order_by query] :as card}]
  (let [order_by        (build-order-by dimensions metrics order_by)
        metrics         (map (partial get (:metrics context)) metrics)
        filters         (map (partial get (:filters context)) filters)
        score           (if query
                          score
                          (->> dimensions
                               (map (partial get (:dimensions context)))
                               (concat filters metrics)
                               (transduce (keep :score) stats/mean)
                               (* (/ score rules/max-score))))
        dimensions      (map (partial vector :dimension) dimensions)
        used-dimensions (rules/collect-dimensions [dimensions metrics filters query])]
    (->> used-dimensions
         (map (some-fn (comp :matches (partial get (:dimensions context)))
                       (comp #(filter-tables % context) rules/->type)))
         (apply combo/cartesian-product)
         (keep (fn [instantiations]
                 (let [bindings (zipmap used-dimensions instantiations)
                       query    (if query
                                  (build-query context bindings query)
                                  (build-query context bindings
                                               filters
                                               metrics
                                               dimensions
                                               limit
                                               order_by))]
                   (when (have-permissions? query)
                     (-> (instantiate-metadata context bindings card)
                         (assoc :score score
                                :query query)))))))))

(defn- best-matching-rule
  "Pick the most specific among applicable rules.
   Most specific is defined as entity type specification the longest ancestor
   chain."
  [rules table]
  (let [entity-type (or (:entity_type table) :type/GenericTable)]
    (some->> rules
             (filter #(isa? entity-type (:table_type %)))
             not-empty
             (apply max-key (comp count ancestors :table_type)))))

(defn- linked-tables
  "Return all tables accessable from a given table with the paths to get there."
  [table]
  (map (fn [{:keys [id fk_target_field_id]}]
         (-> fk_target_field_id Field :table_id Table (assoc :link id)))
       (db/select [Field :id :fk_target_field_id]
         :table_id (:id table)
         :fk_target_field_id [:not= nil])))

(defn automagic-dashboard
  "Create a dashboard for table `root` using the best matching heuristic."
  [root]
  (let [rule    (best-matching-rule (rules/load-rules) root)
        context (as-> {:root-table root
                       :rule       (:table_type rule)
                       :tables     (concat [root] (linked-tables root))
                       :database   (:db_id root)} <>
                  (assoc <> :dimensions (bind-dimensions <> (:dimensions rule)))
                  (assoc <> :metrics (resolve-overloading <> (:metrics rule)))
                  (assoc <> :filters (resolve-overloading <> (:filters rule))))
        rule    (instantiate-metadata context {} rule)]
    (log/info (format "Applying heuristic %s to table %s."
                      (:table_type rule)
                      (:name root)))
    (log/info (format "Dimensions bindings:\n%s"
                      (->> context
                           :dimensions
                           (m/map-vals #(update % :matches (partial map :name)))
                           u/pprint-to-str)))
    (log/info (format "Using definitions:\nMetrics:\n%s\nFilters:\n%s"
                      (-> context :metrics u/pprint-to-str)
                      (-> context :filters u/pprint-to-str)))
    (some->> rule
             :cards
             (keep (comp (fn [[identifier card]]
                           (some->> card
                                    (card-candidates context)
                                    not-empty
                                    (hash-map (name identifier))))
                         first))
             (apply merge-with (partial max-key (comp :score first)))
             vals
             (apply concat)
             (populate/create-dashboard! (:title rule) (:description rule))
             :id)))
