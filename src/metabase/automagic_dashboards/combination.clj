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

(defn add-breakouts
  "Add breakouts to a query based on the breakout fields"
  [query breakout-fields]
  (assoc query
    :breakout (mapv (partial interesting/->reference :mbql) breakout-fields)))

(defn matching-types?
  "Given two seqs of types, return true of the types of the child
  types are satisfied by some permutation of the parent types."
  [parent-types child-types]
  (true?
    (when (= (count parent-types)
             (count child-types))
      (some
        (fn [parent-types-permutation]
          (when (->> (map
                       (fn [child-type parent-type]
                         (isa? child-type parent-type))
                       child-types
                       parent-types-permutation)
                     (every? true?))
            true))
        (math.combo/permutations parent-types)))))

(comment
  (true? (matching-types? #{:type/Number} #{:type/Integer}))
  (false? (matching-types? #{} #{:type/Integer}))
  )

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

(mu/defn add-breakout-combinations :- [:sequential ads/combined-metric]
  "From a grounded metric, produce additional metrics that have potential dimensions
   mixed in based on the provided ground dimensions and semantic affinity sets."
  [ground-dimensions :- ads/dim-name->matching-fields
   {default-affinities :default :as semantic-affinity-sets} :- ads/metric-types->dimset->cards
   {metric-field-types     :metric-field-types
    grounded-metric-fields :grounded-metric-fields :as grounded-metric} :- ads/grounded-metric]
  (let [grounded-field-ids       (set (map :id grounded-metric-fields))
        ;; We won't add dimensions to a metric where the dimension is already
        ;; contributing to the fields already grounded in the metric definition itself.
        ;; Note that one potential issue here is rate metrics. Churn rate will need to
        ;; compute churn over time and may use one of its own dimensions as the breakout
        ;; axis. IDK that our current system handles this either.
        {grounded  true
         available false} (->> ground-dimensions
                               (mapcat (fn [[dim-name {:keys [matches] :as dim+matches}]]
                                         (let [dim (-> dim+matches
                                                       (dissoc :matches)
                                                       (assoc :dimension-name dim-name))]
                                           (map
                                             (fn [matching-field]
                                               (assoc matching-field :dimension dim))
                                             matches))))
                               (group-by (comp boolean grounded-field-ids :id)))
        groundable-fields        (group-by magic.util/field-type available)
        potential-dimension-sets (or (->> metric-field-types
                                          (filter-to-matching-types (dissoc semantic-affinity-sets :default))
                                          vals
                                          (mapcat keys)
                                          seq)
                                     (keys default-affinities))]
    (->> potential-dimension-sets
         (mapcat (fn [dimensions-set]
                   (->> (map groundable-fields dimensions-set)
                        (apply math.combo/cartesian-product)
                        (map (partial zipmap dimensions-set)))))
         (map (fn [ground-dimension-fields]
                (-> grounded-metric
                    (assoc
                      :grounded-metric-fields (vec grounded)
                      :dimension-type->field ground-dimension-fields
                      :dimension-name->field (into
                                               (zipmap
                                                 (map (comp :dimension-name :dimension) grounded)
                                                 grounded)
                                               (zipmap
                                                 (map (comp :dimension-name :dimension) (vals ground-dimension-fields))
                                                 (vals ground-dimension-fields)))
                      :dimension-field-types (set (keys ground-dimension-fields)))
                    (update :metric-definition add-breakouts (vals ground-dimension-fields))))))))

(mu/defn interesting-combinations :- [:sequential ads/combined-metric]
  "Expand simple ground metrics in to ground metrics with dimensions
   mixed in based on potential semantic affinity sets."
  [ground-dimensions :- ads/dim-name->matching-fields
   semantic-affinity-sets :- ads/metric-types->dimset->cards
   grounded-metrics :- [:sequential ads/grounded-metric]]
  (mapcat (partial add-breakout-combinations ground-dimensions semantic-affinity-sets)
          grounded-metrics))

(mu/defn combinations-from-template
  [template-cards
   grounded-metrics :- [:sequential ads/grounded-metric]
   dimension-names->matches :- ads/dim-name->matching-fields]
  (let [available-dimensions (set (keys dimension-names->matches))
        available-metrics    (into #{} (map :metric-name grounded-metrics))
        card-def             (fn [card-map]
                               (-> card-map first val))
        satisfied-cards      (filter
                               (every-pred
                                 (comp (partial every? available-metrics) :metrics card-def)
                                 (comp (partial every? (comp available-dimensions ffirst)) :dimensions card-def))
                               template-cards)]
    (reduce (fn [acc [metrics dim->bodies]]
              (update acc metrics #(merge-with into % dim->bodies)))
            {}
            (for [card satisfied-cards
                  :let [[_card-name body] (first card)
                        metrics    (:metrics body)
                        dimensions (map ffirst (:dimensions body))]]
              [(set metrics) {(set dimensions) [body]}]))))

(mu/defn combinations-from-user-metrics
  [user-metrics :- [:sequential ads/grounded-metric]
   ground-dimensions :- ads/dim-name->matching-fields]
  (into {}
        (for [metric user-metrics]
          (let [all-dimensions (into {}
                                     (for [dim (keys ground-dimensions)]
                                       [#{dim} [{:type       :xray/make-card
                                                 :metrics    [(:metric-name metric)]
                                                 :dimensions [{dim {}}]}]]))]
            [#{(:metric-name metric)} all-dimensions]))))

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

(mu/defn metrics+breakouts :- [:sequential ads/combined-metric]
  [base-context
   ground-dimensions :- ads/dim-name->matching-fields
   card-templates
   grounded-metrics :- [:sequential ads/grounded-metric]]
  (let [metric-name->metric (zipmap
                              (map :metric-name grounded-metrics)
                              (map-indexed
                                (fn [idx grounded-metric] (assoc grounded-metric :position idx))
                                grounded-metrics))]
    (for [{card-name       :card-name
           card-metrics    :metrics
           card-score      :card-score
           card-dimensions :dimensions :as card-template} card-templates
          :let [dim-names (map ffirst card-dimensions)]
          :when (every? ground-dimensions dim-names)
          :let [dim-score (map (comp :score ground-dimensions) dim-names)]
          dimension-name->field (->> (map (comp :matches ground-dimensions) dim-names)
                                     (apply math.combo/cartesian-product)
                                     (map (partial zipmap dim-names)))
          :let [merged-dims
                (reduce (fn [acc [d v]]
                          (cond-> acc
                            (acc d)
                            (update d into v)))
                        dimension-name->field
                        (map first card-dimensions))]
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
            (update :metric-definition add-breakouts (vals merged-dims))
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

(defn ground-metric->card
  "Convert a grounded metric to a card. This includes adding any special breakout aggregations specified in the card
  definitions then removing most of the metric fields that aren't relevant to cards."
  [base-context
   {:keys [dimension-type->field metric-name dimension-name->field] :as grounded-metric}
   {:keys [semantic-dimensions] :as card}]
  ;; This updates the query to contain the specializations contained in the card template (basically the aggregate definitions)
  (when (= (count dimension-type->field)
           (count semantic-dimensions))
    (let [dims (merge-with into dimension-type->field semantic-dimensions)
          card (visualization/expand-visualization
                card
                (vals dimension-name->field)
                nil)
          score-components (list* (:card-score card)
                                  (:metric-score grounded-metric)
                                  (map (comp :score :dimension) (vals dims)))]
      (-> grounded-metric
          (update :metric-definition add-breakouts (vals dims))
          (add-dataset-query base-context)
          (into card)
          (instantiate-metadata base-context {} dimension-name->field)
          (assoc
           :id (gensym)
           :title (if (pos? (count dimension-type->field))
                    (format "%s by %s"
                            metric-name
                            (items->str (map dim-name (vals dimension-type->field))))
                    metric-name)
           :total-score (long (/ (apply + score-components) (count score-components)))
           :score-components score-components)
          (dissoc
           :dimension-type->field
           :metric-definition
           :grounded-metric-fields
           :dimension-name->field
           :dimensions
           ;;:nominal-dimensions
           :semantic-dimensions
           :card-name
           :metric-name
           :metric-title
           :metrics
           ;;:visualization
           ;;:score
           ;;:title
           )))))

(mu/defn ground-metric->cards
  "Convert a single ground metric to a seq of cards. Each potential card is defined in the templates contained within
  the affinity-set->cards map."
  [base-context affinity-set->cards {:keys [metric-field-types dimension-field-types] :as grounded-metric}]
  (->> (or
         (get-in affinity-set->cards [metric-field-types dimension-field-types :cards])
         (get-in affinity-set->cards [:default dimension-field-types :cards]))
       (map (partial ground-metric->card base-context grounded-metric))
       (filter identity)))

(mu/defn combinations->cards :- ads/dashcards
  "Convert a seq of metrics to a seq of cards. Each metric contains an affinity set, which is matched to a seq of card
  templates. This pairing is expanded to create a card seq."
  [base-context
   affinity-set->cards :- ads/metric-types->dimset->cards
   ground-metrics :- [:sequential ads/combined-metric]]
  (->> (mapcat (partial ground-metric->cards base-context affinity-set->cards)
               ground-metrics)
       (map-indexed (fn [i card] (assoc card :position i)))
       ;; The next 3 lines deduplicate some cards. Specifically, a card
       ;; group for a particular dimension may have a default no-dimension
       ;; view. If multiple of these groups exist, you'll get multiple of
       ;; these default cards.
       (group-by (juxt :title :x_label :dataset_query :visualization))
       vals
       (map first)
       ;; This restores the sort order so the card layout doesn't go all weird.
       (sort-by :position)))
