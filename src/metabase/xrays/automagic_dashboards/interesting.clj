(ns metabase.xrays.automagic-dashboards.interesting
  "Generate \"interesting\" inputs for the automatic dashboard pipeline.

  In this context, \"interesting\" means \"grounded\" values. In particular, the most interesting values of all are
  metrics. Metrics are intrinsically interesting and can be displayed on their own. Dimensions and filters, while not
  interesting on their own, can be combined with metrics to add more interest to the metric. In MBQL parlance, metrics
  are aggregates, dimensions are breakouts, and filters are filters. However, a user-defined metric may go beyond a
  simple aggregate.

  Our main namespace function, `identify`, takes an object to be analyzed for interestingness and a data structure
  consisting of templates for interesting combinations of metrics, dimensions, and filters. In this stage, we return
  grounded metrics (inherently interesting) along with grounded dimensions and filters that can be combined with our
  grounded metrics downstream for added interest.

  The template arguments are defined in terms of Dimensions, Metrics, and Filters. These are *named* values, such as:
   - Dimension:
     - GenericNumber
     - Timestamp
     - Country
     - Longitude
     - Latitude
     - Income
     - Discount
   - Metric:
     - Count - Dimensionless
     - Sum - A metric over a single field
     - AverageDiscount - A metric defined by the Income and Discount fields (as an example)
   - Filter:
     - Last30Days - A named quantity that is defined by one or more constituent Dimensions

   Template Metrics and Filters are made up of some combination of field references (Dimensions). These are referenced
   using the Dimension names (e.g. Avg of some GenericNumber) despite these constituent fields technically not being
   Dimensions. Metrics and Dimensions should be thought of as orthogonal concerns, but for our matching algorithm, this
   is how constituent fields are selected.

   The \"grounding\" process binds individual fields to named Dimensions as well as constituent elements of Filter and
   Metric definitions.

   Note that the binding process is 1:N, where a single dimension may match to multiple fields.
   A field can only bind to one dimension."
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.walk :as walk]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.xrays.automagic-dashboards.dashboard-templates :as dashboard-templates]
   [metabase.xrays.automagic-dashboards.schema :as ads]
   [metabase.xrays.automagic-dashboards.util :as magic.util]
   [toucan2.core :as t2]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Code for creation of instantiated affinities

(defn- optimal-temporal-resolution
  [field]
  (let [[earliest latest] (some->> field
                                   :fingerprint
                                   :type
                                   :type/DateTime
                                   ((juxt :earliest :latest))
                                   (map u.date/parse))
        can-use?  #(lib.schema.ref/valid-temporal-unit-for-base-type? (:base_type field) %)]
    (if (and earliest latest)
      (let [duration   (u.date/period-duration earliest latest)
            less-than? #(u.date/greater-than-period-duration? % duration)]
        (cond
         ;; e.g. if [duration between earliest and latest] < 3 hours then use `:minute` resolution
          (and (less-than? (t/hours 3))  (can-use? :minute)) :minute
          (and (less-than? (t/days 7))   (can-use? :hour))   :hour
          (and (less-than? (t/months 6)) (can-use? :day))    :day
          (and (less-than? (t/years 10)) (can-use? :month))  :month
          (can-use? :year) :year
          (can-use? :hour) :hour))
      (if (can-use? :day) :day :hour))))

(mu/defn transform-metric-aggregate :- ::ads/grounded-metric.aggregation
  "Map a metric aggregate definition from nominal types to semantic types."
  [m dimension-name->col]
  (let [[operator & args] (walk/prewalk
                           (fn [v]
                             (if (vector? v)
                               (let [[d n] v]
                                 (if (= "dimension" d)
                                   (dimension-name->col n)
                                   v))
                               v))
                           m)]
    {:lib/type :lib/external-op
     :operator (keyword operator)
     :args     args}))

(mu/defn ground-metric :- [:sequential ::ads/grounded-metric]
  "Generate \"grounded\" metrics from the mapped dimensions (dimension name -> field matches).
   Since there may be multiple matches to a dimension, this will produce a sequence of potential matches."
  [{metric-name       :metric-name
    metric-score      :score
    metric-definition :metric} :- ::ads/normalized-metric-template
   ground-dimensions :- ads/dim-name->matching-fields]
  (let [named-dimensions (dashboard-templates/collect-dimensions metric-definition)]
    (->> (map (comp :matches ground-dimensions) named-dimensions)
         (apply math.combo/cartesian-product)
         (map (partial zipmap named-dimensions))
         (map (fn [nm->field]
                (let [dimension-name->col (update-vals nm->field #(lib-be/instance->metadata % :metadata/column))]
                  {:metric-name           metric-name
                   :metric-title          metric-name
                   :metric-score          metric-score
                   :xrays/aggregation     (transform-metric-aggregate metric-definition dimension-name->col)
                   ;; Required for title interpolation in grounded-metrics->dashcards
                   :dimension-name->field dimension-name->col}))))))

(mu/defn grounded-metrics :- [:sequential ::ads/grounded-metric]
  "Given a set of metric definitions and grounded (assigned) dimensions, produce a sequence of grounded metrics."
  [metric-templates :- [:sequential ::ads/normalized-metric-template]
   ground-dimensions :- ads/dim-name->matching-fields]
  (mapcat #(ground-metric % ground-dimensions) metric-templates))

(defn normalize-seq-of-maps
  "Utility function to convert a seq of maps of one string key to another map into a simpler seq of maps."
  [typename items]
  (let [kw (keyword (format "%s-name" (name typename)))]
    (->> items
         (map first)
         (map (fn [[name value]]
                (assoc value kw name))))))

;;; dimensions

(mu/defn- fieldspec-matcher :- [:=> [:cat ::ads/column] :any]
  "Generate a predicate of the form (f field) -> truthy value based on a fieldspec."
  [fieldspec :- [:or ::lib.schema.common/base-type ::lib.schema.common/semantic-or-relation-type]]
  (mu/fn [{:keys [semantic-type target] :as field} :- ::ads/column]
    (cond
      ;; This case is mostly relevant for native queries
      (#{:type/PK :type/FK} fieldspec) (isa? semantic-type fieldspec)
      target (recur target)
      :else (and (not (magic.util/key-col? field)) (magic.util/field-isa? field fieldspec)))))

(defn- name-regex-matcher
  "Generate a truthy predicate of the form (f field) -> truthy value based on a regex applied to the field name."
  [name-pattern]
  (comp (->> name-pattern
             u/lower-case-en
             re-pattern
             (partial re-find))
        u/lower-case-en
        :name))

(defn- max-cardinality-matcher
  "Generate a predicate of the form (f field) -> true | false based on the provided cardinality.
  Returns true if the distinct count of fingerprint values is less than or equal to the cardinality."
  [cardinality]
  (fn [field]
    (some-> field
            (get-in [:fingerprint :global :distinct-count])
            (<= cardinality))))

(def ^:private field-filters
  {:fieldspec       fieldspec-matcher
   :named           name-regex-matcher
   :max-cardinality max-cardinality-matcher})

(mu/defn- filter-fields :- [:sequential ::ads/column]
  "Find all fields belonging to table `table` for which all predicates in
   `preds` are true. `preds` is a map with keys :fieldspec, :named, and :max-cardinality."
  [preds  :- [:map
              [:fieldspec       :any]
              [:named           :any]
              [:max-cardinality :any]]
   fields :- [:sequential ::ads/column]]
  (filter (->> preds
               (keep (fn [[k v]]
                       (when-let [pred (field-filters k)]
                         (some-> v pred))))
               (apply every-pred))
          fields))

(mu/defn- matching-fields
  "Given a context and a dimension definition, find all fields from the context
   that match the definition of this dimension."
  [{{:keys [fields]} :source :keys [tables] :as context} :- ::ads/context
   {:keys [field_type links_to named max_cardinality] :as constraints}]
  (if links_to
    (filter (comp (->> (magic.util/filter-tables links_to tables)
                       (keep :link)
                       set)
                  u/the-id)
            (matching-fields context (dissoc constraints :links_to)))
    (let [[tablespec fieldspec] field_type]
      (if fieldspec
        (mapcat (fn [table]
                  (some->> table
                           :fields
                           (filter-fields {:fieldspec       fieldspec
                                           :named           named
                                           :max-cardinality max_cardinality})
                           (map #(assoc % :link (:link table)))))
                (magic.util/filter-tables tablespec tables))
        (filter-fields {:fieldspec       tablespec
                        :named           named
                        :max-cardinality max_cardinality}
                       fields)))))

;; util candidate
(def ^:private ^{:arglists '([field])} id-or-name
  (some-fn :id :name))

(mu/defn- candidate-bindings
  "For every field in a given context determine all potential dimensions each field may map to.
  This will return a map of field id (or name) to collection of potential matching dimensions."
  [context :- ::ads/context
   dimension-specs]
  ;; TODO - Fix this so that the intermediate representations aren't so crazy.
  ;; all-bindings a map of binding dim identifier to binding def which contains
  ;; field matches which are all the same field except they are merged with the binding.
  ;; What we want instead is just a map of field to potential bindings.
  ;; Just rack and stack the bindings then return that with the field or something.
  (let [all-bindings (for [dimension      dimension-specs
                           :let           [[identifier definition] (first dimension)]
                           matching-field (matching-fields context definition)]
                       {(name identifier)
                        (assoc definition :matches [(merge matching-field (lib.schema.common/normalize-map definition))])})]
    (group-by (comp id-or-name first :matches val first) all-bindings)))

(defn- score-bindings
  "Assign a value to each potential binding.
  Takes a seq of potential bindings and returns a seq of vectors in the shape
  of [score binding], where score is a 3 element vector. This is computed as:
     1) Number of ancestors `field_type` has (if field_type has a table prefix,
        ancestors for both table and field are counted);
     2) Number of fields in the definition, which would include additional filters
        (`named`, `max_cardinality`, `links_to`, ...) etc.;
     3) The manually assigned score for the binding definition"
  [candidate-binding-values]
  (letfn [(score [a]
            (let [[_ definition] a]
              [(reduce + (map (comp count ancestors) (:field_type definition)))
               (count definition)
               (:score definition)]))]
    (map (juxt (comp score first) identity) candidate-binding-values)))

(defn- most-specific-matched-dimension
  "Return the most specific dimension from one or more dimensions that all
   match the same field. Specificity is determined based on:
   1) how many ancestors `field_type` has (if field_type has a table prefix,
      ancestors for both table and field are counted);
   2) if there is a tie, how many additional filters (`named`, `max_cardinality`,
      `links_to`, ...) are used;
   3) if there is still a tie, `score`.

   candidate-binding-values is a sequence of maps. Each map is a has a key
   of dimension spec name to potential dimension binding spec along with a
   collection of matches, all of which are merges of this spec with the same
   column.

   Note that it would make a lot more sense to refactor this to return a
   map of column to potential binding dimensions. This return value is kind of
   the opposite of what makes sense.

   Here's an example input with :matches updated as just the names of the
   columns in the matches. IRL, matches are the entire field n times, with
   each field a merge of the spec with the field.

   ({\"Timestamp\" {:field_type [:type/DateTime],
                    :score 60,
                    :matches [\"CREATED_AT\"]}}
    {\"CreateTimestamp\" {:field_type [:type/CreationTimestamp],
                          :score 80
                          :matches [\"CREATED_AT\"]}})"
  [candidate-binding-values]
  (let [scored-bindings (score-bindings candidate-binding-values)]
    (second (last (sort-by first scored-bindings)))))

(mu/defn find-dimensions :- ads/dim-name->dim-defs+matches
  "Bind fields to dimensions from the dashboard template and resolve overloaded cases in which multiple fields match the
  dimension specification.

   Each field will be bound to only one dimension. If multiple dimension definitions match a single field, the field
  is bound to the most specific definition used
   (see `most-specific-definition` for details).

  The context is passed in, but it only needs tables and fields in `candidate-bindings`. It is not extensively used."
  [context dimension-specs :- [:maybe [:sequential ::ads/dimension-template]]]
  (->> (candidate-bindings context dimension-specs)
       (map (comp most-specific-matched-dimension val))
       (apply merge-with (fn [a b]
                           (case (compare (:score a) (:score b))
                             1 a
                             0 (update a :matches concat (:matches b))
                             -1 b))
              {})))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; TODO - Deduplicate from core
(mu/defn- source->db :- (ms/InstanceOf :model/Database)
  [source :- (ms/InstanceOf #{:model/Table :model/Card})]
  (t2/select-one :model/Database :id ((some-fn :db_id :database_id) source)))

(defn- enriched-field-with-sources [{:keys [tables source]} field]
  (assoc field
         :link (m/find-first (comp :link #{(:table_id field)} u/the-id) tables)
         :db (source->db source)))

(mu/defn- add-field-links-to-definitions [dimensions field :- ::ads/column]
  (->> dimensions
       (keep (fn [[identifier definition]]
               (when-let [matches (->> definition
                                       :matches
                                       (remove (comp #{(id-or-name field)} id-or-name))
                                       not-empty)]
                 [identifier (assoc definition :matches matches)])))
       (concat [["this" {:matches    [field]
                         :name       (:display-name field)
                         :score      dashboard-templates/max-score
                         :card-score dashboard-templates/max-score}]])
       (into {})))

(defn- add-field-self-reference [{{:keys [entity]} :root :as context} dimensions]
  (cond-> dimensions
    (= :model/Field (mi/model entity))
    (add-field-links-to-definitions (enriched-field-with-sources context entity))))
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(mu/defn grounded-filters :- ::ads/grounded-filters
  "Take filter templates (as from a dashboard template's :filters) and ground dimensions and produce a map of the
  filter name to grounded versions of the filter."
  [filter-templates ground-dimensions :- ::ads/dim-name->dim-def]
  (->> filter-templates
       (keep (fn [fltr]
               (let [[fname {:keys [filter] :as v}] (first fltr)
                     dims (dashboard-templates/collect-dimensions v)
                     opts (->> (map (comp
                                     :matches
                                     ground-dimensions) dims)
                               (apply math.combo/cartesian-product)
                               (map (partial zipmap dims)))]
                 (seq (for [opt  opts
                            :let [[op & args] (walk/prewalk
                                               (fn [x]
                                                 (cond
                                                   (vector? x)
                                                   (let [[ds dim-name] x]
                                                     (if (and (= "dimension" ds)
                                                              (string? dim-name))
                                                       (opt dim-name)
                                                       x))

                                                   ;; NOCOMMIT HACK FIXME
                                                   (= x "day")
                                                   :day

                                                   :else
                                                   x))
                                               filter)]]
                        (assoc v
                               :filter {:lib/type :lib/external-op
                                        :operator (keyword op)
                                        :args     args}
                               :filter-name fname))))))
       flatten))

(mu/defn identify :- ::ads/grounded-values
  "Identify interesting metrics and dimensions of a `thing`. First identifies interesting dimensions, and then
  interesting metrics which are satisfied.
  Metrics from the template are assigned a score of 50; user defined metrics a score of 95"
  [context
   {:keys [dimension-specs
           metric-specs
           filter-specs]} :- [:map
                              [:dimension-specs [:maybe [:sequential ::ads/dimension-template]]]
                              [:metric-specs [:maybe [:sequential ads/metric-template]]]
                              [:filter-specs [:maybe [:sequential ads/filter-template]]]]]
  (let [dims      (->> (find-dimensions context dimension-specs)
                       (add-field-self-reference context))
        metrics   (-> (normalize-seq-of-maps :metric metric-specs)
                      (grounded-metrics dims))
        set-score (fn [score metrics]
                    (map #(assoc % :metric-score score) metrics))]
    {:dimensions dims
     :metrics    (concat (set-score 50 metrics)
                         (let [entity (-> context :root :entity)]
                           ;; metric x-rays talk about "this" in the template
                           (when (mi/instance-of? :xrays/Metric entity)
                             [{:metric-name       "this"
                               :metric-title      (:name entity)
                               :xrays/aggregation entity
                               :metric-score      dashboard-templates/max-score}])))
     :filters (grounded-filters filter-specs dims)}))
