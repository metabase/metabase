(ns metabase.xrays.automagic-dashboards.combination
  "Generate \"interesting\" combinations of metrics, dimensions, and filters.

  In the `metabase.xrays.automagic-dashboards.interesting` namespace, we create \"grounded\" metrics, which are both realized
  (field references have been added to their aggregate clauses) and interesting (because metrics are always
  interesting), as well as grounded dimensions and filters. This ns combines these dimensions (as breakouts) and filters
  (as filters) into the ground metrics based on the affinities defined in provided card-templates.

  Card templates provided the following key relationships:
  - dimension to dimension affinities - The groups of dimensions the might appear on the x-axis of a chart (breakouts).
    These generally a single dimension (e.g. time or category) but can be multiple (e.g. longitude and latitude)
  - dimension to metric affinities - Combinations of dimensions and metrics (e.g. profit metric over time dimension).
    This functionally adds breakouts to a metric.
  - metric to metric affinities - Combinations of metrics that belong together (e.g. Sum, Avg, Max, and Min of a field).

  The primary function in this ns, `grounded-metrics->dashcards` takes the base context , above grounded values, and
  card definitions and creates a set of dashcards with the above combinations of metrics, dimensions, and filters."
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.interface :as mi]
   [metabase.queries.core :as queries]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.xrays.automagic-dashboards.dashboard-templates :as dashboard-templates]
   [metabase.xrays.automagic-dashboards.interesting :as interesting]
   [metabase.xrays.automagic-dashboards.schema :as ads]
   [metabase.xrays.automagic-dashboards.util :as magic.util]
   [metabase.xrays.automagic-dashboards.visualization-macros :as visualization]))

(mu/defn add-breakouts-and-filters :- ::ads/grounded-metric.definition
  "Add breakouts and filters to a query based on the breakout fields and filter clauses"
  [metric-def     :- ::ads/grounded-metric.definition
   breakouts      :- [:maybe [:sequential ::lib.schema.metadata/column]]
   filter-clauses :- [:maybe [:sequential ::ads/external-op]]]
  (assoc metric-def
         :xrays/breakouts breakouts
         :xrays/filters   filter-clauses))

(mu/defn- add-aggregations :- ::ads/grounded-metric.definition
  "Add aggregations to a query."
  [metric-def   :- ::ads/grounded-metric.definition
   aggregations :- [:sequential ::ads/aggregation]]
  (assoc metric-def :xrays/aggregations aggregations))

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
   #{:type/Integer}))

(mu/defn- add-dataset-query :- [:map
                                [:dataset_query ::ads/query]]
  "Add the `:dataset_query` key to this metric. Requires both the current metric-definition (from the grounded metric)
  and the database and table ids (from the source object)."
  [{:keys [metric-definition] :as ground-metric-with-dimensions} :- ::ads/grounded-metric
   {{:keys [database]} :root :keys [source query-filter]} :- ::ads/context]
  (let [model? (and (mi/instance-of? :model/Card source)
                    (queries/model? source))
        mp     (lib-be/application-database-metadata-provider database)
        query  (as-> (lib/query mp (cond
                                     (mi/instance-of? :model/Table source) (lib.metadata/table mp (u/the-id source))
                                     (mi/instance-of? :model/Card source)  (lib.metadata/card mp (u/the-id source)))) $query
                 (reduce lib/aggregate $query (:xrays/aggregations metric-definition))
                 (reduce lib/breakout  $query (:xrays/breakouts metric-definition))
                 (reduce lib/filter    $query (:xrays/filters metric-definition))
                 (reduce lib/filter    $query (when (not model?) query-filter)))]
    (assoc ground-metric-with-dimensions :dataset_query query)))

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
                         attribute (some-> attribute u/->kebab-case-en keyword)]
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

(defn- valid-breakout-dimension?
  [{:keys [base_type db fingerprint aggregation]}]
  (or (nil? aggregation)
      (not (isa? base_type :type/Number))
      (and (driver.u/supports? (:engine db) :binning db)
           (-> fingerprint :type :type/Number :min)
           (not= (-> fingerprint :type :type/Number :min)
                 (-> fingerprint :type :type/Number :max)))))

(defn- valid-bindings? [satisfied-dimensions bindings]
  (->> satisfied-dimensions
       (map first)
       (map (fn [[identifier opts]]
              (merge (bindings identifier) opts)))
       (every? valid-breakout-dimension?)))

(mu/defn grounded-metrics->dashcards :- [:sequential
                                         [:merge
                                          ::ads/combined-metric
                                          [:map
                                           [:dataset_query ::ads/query]]]]
  "Generate dashcards from ground dimensions, using the base context, ground dimensions,
  card templates, and grounded metrics as input."
  [base-context      :- ::ads/context
   card-templates
   ground-dimensions :- ::ads/dim-name->matching-fields
   ground-filters   :- [:sequential ::ads/grounded-filter]
   grounded-metrics :- [:sequential ::ads/grounded-metric]]
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
          :when (and (every? ground-dimensions dim-names)
                     (every? simple-grounded-filters card-filters))
          :let [dim-score (map (comp :score ground-dimensions) dim-names)]
          dimension-name->field (->> (map (comp :matches ground-dimensions) dim-names)
                                     (apply math.combo/cartesian-product)
                                     (map (partial zipmap dim-names)))
          :let [merged-dims (combine-dimensions dimension-name->field card-dimensions)]
          :when (and (valid-bindings? card-dimensions dimension-name->field)
                     (every? metric-name->metric card-metrics))
          :let [[grounded-metric :as all-satisfied-metrics] (map metric-name->metric card-metrics)
                final-aggregate                    (into []
                                                         (mapcat (comp :xrays/aggregations :metric-definition))
                                                         all-satisfied-metrics)
                bound-metric-dimension-name->field (apply merge (map :dimension-name->field all-satisfied-metrics))
                all-names->field (into dimension-name->field bound-metric-dimension-name->field)
                card             (-> card-template
                                     (visualization/expand-visualization
                                      (vals dimension-name->field)
                                      nil)
                                     (instantiate-metadata base-context
                                                           {}
                                                           all-names->field))
                score-components (list* (:card-score card)
                                        (:metric-score grounded-metric)
                                        dim-score)]]
      (merge
       card
       (-> grounded-metric
           (assoc
            :id            (gensym)
            :affinity-name card-name
            :card-score    card-score
            :total-score   (long (/ (apply + score-components) (count score-components)))
            ;; Update dimension-name->field to include named contributions from both metrics and dimensions
            :dimension-name->field all-names->field
            :score-components      score-components)
           (update :metric-definition (fn [metric-definition]
                                        (-> metric-definition
                                            (add-aggregations final-aggregate)
                                            (add-breakouts-and-filters (for [field (vals merged-dims)]
                                                                         (interesting/field->metadata field))
                                                                       (mapv (comp :filter simple-grounded-filters)
                                                                             card-filters)))))
           (add-dataset-query base-context))))))
