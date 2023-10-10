(ns metabase.automagic-dashboards.combination
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.automagic-dashboards.dashboard-templates :as dashboard-templates]
   [metabase.automagic-dashboards.interesting :as interesting]
   [metabase.automagic-dashboards.util :as magic.util]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]))

(defn make-affinity-set->cards
  "Construct a map of affinity sets to card templates. The affinitie sets are a set of semantic types and the card
  templates are as they are in the yaml templates, but with the `:dimensions` updated from string dimension keys to
  semantic type keys."
  [ground-dimensions template-cards affinities]
  (let [card-name->cards (->> template-cards
                              (map
                                (comp
                                  (fn [[card-name card-template]]
                                    (assoc card-template :card-name card-name))
                                  first))
                              (group-by :card-name))]
    (update-vals
      (group-by :affinity-set affinities)
      (fn [affinities]
        (->>
          (for [affinity-name (map :affinity-name affinities)
                {:keys [dimensions] :as card} (card-name->cards affinity-name)
                :let [semantic-dims (reduce
                                      (fn [acc [dim attrs]]
                                        (if-some [k (-> dim ground-dimensions :field_type peek)]
                                          (assoc acc k attrs)
                                          (reduced nil)))
                                      {}
                                      (map first dimensions))]
                :when semantic-dims]
            (assoc card :semantic-dimensions semantic-dims))
          distinct
          vec)))))

(defn add-breakouts
  "Add breakouts to a query based on the breakout fields"
  [query breakout-fields]
  (assoc query
         :breakout (mapv (partial interesting/->reference :mbql) breakout-fields)))

(def ^:private field-type (some-fn :semantic_type :effective_type))

(defn make-metric-combinations
  "From a grounded metric, produce additional metrics that have potential dimensions
   mixed in based on the provided ground dimensions and semantic affinity sets."
  [ground-dimensions
   semantic-affinity-sets
   {grounded-metric-fields :grounded-metric-fields :as metric}]
  (let [grounded-field-ids   (set (map :id grounded-metric-fields))
        ;; We won't add dimensions to a metric where the dimension is already
        ;; contributing to the fields already grounded in the metric definition itself.
        {grounded   true
         avaialable false}   (->> ground-dimensions
                                  (mapcat (fn [[dim-name {:keys [matches] :as dim+matches}]]
                                            (let [dim (-> dim+matches
                                                          (dissoc :matches)
                                                          (assoc :dimension-name dim-name))]
                                              (map
                                               (fn [matching-field]
                                                 (assoc matching-field :dimension dim))
                                               matches))))
                                  (group-by (comp boolean grounded-field-ids :id)))
        groundable-fields    (->> avaialable
                                  (remove (comp grounded-field-ids :id))
                                  (group-by field-type))
        grounded-field-types (map field-type grounded)]
    (distinct
     (for [affinity-set            semantic-affinity-sets
           dimset                  (math.combo/permutations affinity-set)
           :when                   (and
                                    (>= (count dimset)
                                        (count grounded))
                                    (->> (map
                                          (fn [a b] (isa? a b))
                                          grounded-field-types dimset)
                                         (every? true?)))
           :let                    [unsatisfied-semantic-dims (vec (drop (count grounded-field-types) dimset))]
           ground-dimension-fields (->> (map groundable-fields unsatisfied-semantic-dims)
                                        (apply math.combo/cartesian-product)
                                        (map (partial zipmap unsatisfied-semantic-dims)))]
       (-> metric
           (assoc
            :grounded-metric-fields grounded
            :grounded-dimensions ground-dimension-fields
            :nominal-dimensions->fields (into
                                         (zipmap
                                          (map (comp :dimension-name :dimension) grounded)
                                          grounded)
                                         (zipmap
                                          (map (comp :dimension-name :dimension) (vals ground-dimension-fields))
                                          (vals ground-dimension-fields)))
            :affinity-set affinity-set)
           (update :metric-definition add-breakouts (vals ground-dimension-fields)))))))

(defn interesting-combinations
  "Expand simple ground metrics in to ground metrics with dimensions
   mixed in based on potential semantic affinity sets."
  [ground-dimensions semantic-affinity-sets grounded-metrics]
  (mapcat (partial make-metric-combinations ground-dimensions semantic-affinity-sets)
          grounded-metrics))

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

(defn add-dataset-query
  "Add the `:dataset_query` key to this metric. Requires both the current metric-definition (from the grounded metric)
  and the database and table ids (from the source object)."
  [{:keys [metric-definition] :as ground-metric-with-dimensions}
   {:keys [db_id id]}]
  (assoc ground-metric-with-dimensions
    :dataset_query {:database db_id
                    :type     :query
                    :query    (assoc metric-definition
                                :source-table id)}))

(defn items->str
  "Convert a seq of items to a string. If more than two items are present, they are separated by commas, including the
  oxford comma on the final pairing."
  [[f s :as items]]
  (condp = (count items)
    0 ""
    1 (str f)
    2 (format "%s and %s" f s)
    (format "%s, and %s" (str/join ", " (butlast items)) (last items))))

(defn ground-metric->card
  "Convert a grounded metric to a card. This includes adding any special breakout aggregations specified in the card
  definitions then removing most of the metric fields that aren't relevant to cards."
  [{{:keys [source]} :root
    :as              base-context}
   {:keys [grounded-dimensions metric-name nominal-dimensions->fields] :as grounded-metric}
   {:keys [semantic-dimensions dimensions query title] :as card}]
  ;; This updates the query to contain the specializations contained in the card template (basically the aggregate definitions)
  (let [dims (merge-with into grounded-dimensions semantic-dimensions)]
    (-> grounded-metric
        (update :metric-definition add-breakouts (vals dims))
        (add-dataset-query source)
        ;; This cleans up the metric datastructure and primarily leaves just the card elements.
        (into card)
        (assoc
          :name (if (pos? (count grounded-dimensions))
                  (format "%s by %s" metric-name (items->str (map :name (vals grounded-dimensions))))
                  metric-name)
          :id (gensym))
        ;; The empty maps for available-metrics and bindings can be filled in if
        ;; needed by adding the nominal dimensions to the :grounded-metric-fields
        ;; and :grounded-dimensions in the grounded metric. This would allow a
        ;; group by on either semantic type (which is where we are leaning) or
        ;; nominal type (the old way). I wonder if there's value at some point in
        ;; adding a smarter datastructure to this (e.g. a tiny datascript db for
        ;; each metric) to make it easier to navigate an individual metric. So far,
        ;; this seems harmless to just leave as empty maps, though.
        (instantiate-metadata base-context {} nominal-dimensions->fields)
        (dissoc :grounded-dimensions
                :metric-definition
                :grounded-metric-fields
                :affinity-set
                ;:card-name
                ;:metric-name
                :metrics
                ;:visualization
                ;:score
                ;:title
                ))))


(defn ground-metric->cards
  "Convert a single ground metric to a seq of cards. Each potential card is defined in the templates contained within
  the affinity-set->cards map."
  [base-context affinity-set->cards {:keys [affinity-set] :as grounded-metric}]
  (->> affinity-set
       affinity-set->cards
       (map-indexed (fn [i card]
                      (assoc
                       (ground-metric->card base-context grounded-metric card)
                       :position i)))))

(defn combinations->cards
  "Convert a seq of metrics to a seq of cards. Each metric contains an affinity set, which is matched to a seq of card
  templates. This pairing is expanded to create a card seq."
  [base-context affinity-set->cards ground-metrics]
  (mapcat (partial ground-metric->cards base-context affinity-set->cards)
          ground-metrics))
