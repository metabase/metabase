(ns metabase.automagic-dashboards.combination
  (:require
    [clojure.math.combinatorics :as math.combo]
    [clojure.string :as str]
    [clojure.walk :as walk]
    [medley.core :as m]
    [metabase.automagic-dashboards.dashboard-templates :as dashboard-templates]
    [metabase.automagic-dashboards.interesting :as interesting]
    [metabase.automagic-dashboards.schema :as ads]
    [metabase.automagic-dashboards.util :as magic.util]
    [metabase.automagic-dashboards.visualization-macros :as visualization]
    [metabase.models.interface :as mi]
    [metabase.query-processor.util :as qp.util]
    [metabase.util :as u]
    [metabase.util.i18n :as i18n]
    [metabase.util.malli :as mu]))

(defn add-breakouts-and-filter
  "Add breakouts and filters to a query based on the breakout fields and filter clauses"
  [query
   breakout-fields
   filter-clauses]
  (cond->
    (assoc query :breakout (mapv (partial interesting/->reference :mbql) breakout-fields))
    (seq filter-clauses)
    (assoc :filter (into [:and] filter-clauses))))

(defn matching-types?
  "Given two seqs of types, return true of the types of the child
  types are satisfied by some permutation of the parent types."
  [parent-types child-types]
  (true?
    (when (= (count parent-types)
             (count child-types))
      (some
        (fn [parent-types-permutation]
          (when (->> (map isa? child-types parent-types-permutation)
                     (every? true?))
            true))
        (math.combo/permutations parent-types)))))

(defn filter-to-matching-types
  "Take a map with keys as sets of types and collection of types and return the map with only
  the type set keys that satisfy the types."
  [types->x types]
  (into {} (filter #(matching-types? (first %) types)) types->x))

(comment
  (filter-to-matching-types
    {#{} :fail
     #{:type/Number} :pass
     #{:type/Integer} :pass
     #{:type/CreationTimestamp} :fail}
    #{:type/Integer})
  )

(defn add-dataset-query
  "Add the `:dataset_query` key to this metric. Requires both the current metric-definition (from the grounded metric)
  and the database and table ids (from the source object)."
  [{:keys [metric-definition] :as ground-metric-with-dimensions}
   {{:keys [database]} :root :keys [source]}]
  (assoc ground-metric-with-dimensions
    :dataset_query {:database database
                    :type     :query
                    :query    (assoc metric-definition
                                :source-table (if (->> source (mi/instance-of? :model/Table))
                                                (-> source u/the-id)
                                                (->> source u/the-id (str "card__"))))}))

(defn- instantiate-visualization
  [[k v] dimensions metrics]
  (let [dimension->name (comp vector :name dimensions)
        metric->name    (comp vector first :metric metrics)]
    [k (-> v
           (m/update-existing :map.latitude_column dimension->name)
           (m/update-existing :map.longitude_column dimension->name)
           (m/update-existing :graph.metrics metric->name)
           (m/update-existing :graph.dimensions dimension->name))]))

(defn capitalize-first
  "Capitalize only the first letter in a given string."
  [s]
  (let [s (str s)]
    (str (u/upper-case-en (subs s 0 1)) (subs s 1))))

(defn- fill-templates
  [template-type {:keys [root tables]} bindings s]
  (let [binding-fn (some-fn (merge {"this" (-> root
                                               :entity
                                               (assoc :full-name (:full-name root)))}
                                   bindings)
                            (comp first #(magic.util/filter-tables % tables) dashboard-templates/->entity)
                            identity)]
    (str/replace s #"\[\[(\w+)(?:\.([\w\-]+))?\]\]"
                 (fn [[_ identifier attribute]]
                   (let [entity    (binding-fn identifier)
                         attribute (some-> attribute qp.util/normalize-token)]
                     (str (or (and (ifn? entity) (entity attribute))
                              (root attribute)
                              (interesting/->reference template-type entity))))))))

(defn- instantiate-metadata
  [x context available-metrics bindings]
  (-> (walk/postwalk
        (fn [form]
          (if (i18n/localized-string? form)
            (let [s     (str form)
                  new-s (fill-templates :string context bindings s)]
              (if (not= new-s s)
                (capitalize-first new-s)
                s))
            form))
        x)
      (m/update-existing :visualization #(instantiate-visualization % bindings available-metrics))))

(defn- combine-dimensions
  "Given grounded dimensions (name->field map) and card-dimensions (the :dimensions key) from a card, combine these
  into a single map. This is needed because the card dimensions may contain specializations such as breakout details
  for card visualization."
  [dimension-name->field card-dimensions]
  (reduce (fn [acc [d v]]
            (cond-> acc
              (acc d)
              (update d into v)))
          dimension-name->field
          (map first card-dimensions)))

(mu/defn grounded-metrics->dashcards :- [:sequential ads/combined-metric]
  "Generate dashcards from ground dimensions, using the base context, ground dimensions,
  card templates, and grounded metrics as input."
  [base-context
   ground-dimensions :- ads/dim-name->matching-fields
   ground-filters
   card-templates
   grounded-metrics :- [:sequential ads/grounded-metric]]
  (let [metric-name->metric (zipmap
                              (map :metric-name grounded-metrics)
                              (map-indexed
                                (fn [idx grounded-metric] (assoc grounded-metric :position idx))
                                grounded-metrics))
        simple-grounded-filters (update-vals
                                  (group-by :filter-name ground-filters)
                                  (fn [vs] (apply max-key :score vs)))]
    (for [{card-name       :card-name
           card-metrics    :metrics
           card-score      :card-score
           card-dimensions :dimensions
           card-filters    :filters :as card-template} card-templates
          :let [dim-names (map ffirst card-dimensions)]
          :when (every? ground-dimensions dim-names)
          :let [dim-score (map (comp :score ground-dimensions) dim-names)]
          dimension-name->field (->> (map (comp :matches ground-dimensions) dim-names)
                                     (apply math.combo/cartesian-product)
                                     (map (partial zipmap dim-names)))
          :let [merged-dims (combine-dimensions dimension-name->field card-dimensions)]
          card-metric-name      card-metrics
          :let [grounded-metric (metric-name->metric card-metric-name)]
          :when grounded-metric
          :let [card             (-> card-template
                                     (visualization/expand-visualization
                                       (vals dimension-name->field)
                                       nil)
                                     (instantiate-metadata base-context {} dimension-name->field))
                score-components (list* (:card-score card)
                                        (:metric-score grounded-metric)
                                        dim-score)]]
      (merge
        card
        (-> grounded-metric
            (assoc
              :id (gensym)
              :affinity-name card-name
              :card-score card-score
              :total-score (long (/ (apply + score-components) (count score-components)))
              :score-components score-components)
            (update :metric-definition add-breakouts-and-filter
                    (vals merged-dims)
                    (mapv (comp :filter simple-grounded-filters) card-filters))
            (add-dataset-query base-context))))))

(defn items->str
  "Convert a seq of items to a string. If more than two items are present, they are separated by commas, including the
  oxford comma on the final pairing."
  [[f s :as items]]
  (condp = (count items)
    0 ""
    1 (str f)
    2 (format "%s and %s" f s)
    (format "%s, and %s" (str/join ", " (butlast items)) (last items))))

(def dim-name
  "Name of the dimension. Trying for `:display_name` and falling back to `:name`"
  (some-fn :display_name :name))
