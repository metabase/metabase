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
   A field can only bind to one dimension.
   "
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.models.field :as field :refer [Field]]
   [metabase.models.interface :as mi]
   [metabase.models.legacy-metric :refer [LegacyMetric]]
   [metabase.models.table :refer [Table]]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.malli :as mu]
   [metabase.xrays.automagic-dashboards.dashboard-templates :as dashboard-templates]
   [metabase.xrays.automagic-dashboards.schema :as ads]
   [metabase.xrays.automagic-dashboards.util :as magic.util]
   [toucan2.core :as t2]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Code for creation of instantiated affinities

(defn find-field-ids
  "A utility function for pulling field definitions from mbql queries and return their IDs.
   Does something like this already exist in our utils? I was unable to find anything like it."
  [m]
  (let [fields (atom #{})]
    (walk/prewalk
      (fn [v]
        (when (vector? v)
          (let [[f id] v]
            (when (and id (= :field f))
              (swap! fields conj id))))
        v)
      m)
    @fields))

(defn semantic-groups
  "From a :model/LegacyMetric, construct a mapping of semantic types of linked fields to
   sets of fields that can satisfy that type. A linked field is one that is in the
   source table for the metric contribute to the metric itself, is not a PK, and
   has a semantic_type (we assume nil semantic_type fields are boring)."
  [{:keys [table_id definition]}]
  (let [field-ids            (find-field-ids definition)
        potential-dimensions (t2/select :model/Field
                               :id [:not-in field-ids]
                               :table_id table_id
                               :semantic_type [:not-in [:type/PK]])]
    (update-vals
      (->> potential-dimensions
           (group-by :semantic_type))
      set)))

(defmulti
  ^{:doc      "Get a reference for a given model to be injected into a template
          (either MBQL, native query, or string)."
    :arglists '([template-type model])}
  ->reference (fn [template-type model]
                [template-type (mi/model model)]))

(defn- optimal-temporal-resolution
  [field]
  (let [[earliest latest] (some->> field
                                   :fingerprint
                                   :type
                                   :type/DateTime
                                   ((juxt :earliest :latest))
                                   (map u.date/parse))
        can-use?  #(mbql.s/valid-temporal-unit-for-base-type? (:base_type field) %)]
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

(defmethod ->reference [:mbql Field]
  [_ {:keys [fk_target_field_id id link aggregation name base_type] :as field}]
  (let [reference (mbql.normalize/normalize
                   (cond
                    link               [:field id {:source-field link}]
                    fk_target_field_id [:field fk_target_field_id {:source-field id}]
                    id                 [:field id {:base-type base_type}]
                    :else              [:field name {:base-type base_type}]))]
    (cond
     (isa? base_type :type/Temporal)
     (mbql.u/with-temporal-unit reference (keyword (or aggregation
                                                       (optimal-temporal-resolution field))))

     (and aggregation
          (isa? base_type :type/Number))
     (mbql.u/update-field-options reference assoc-in [:binning :strategy] (keyword aggregation))

     :else
     reference)))

(defmethod ->reference [:string Field]
  [_ {:keys [display_name full-name link]}]
  (cond
    full-name full-name
    link (format "%s → %s"
                 (-> (t2/select-one Field :id link) :display_name (str/replace #"(?i)\sid$" ""))
                 display_name)
    :else display_name))

(defmethod ->reference [:string Table]
  [_ {:keys [display_name full-name]}]
  (or full-name display_name))

(defmethod ->reference [:string LegacyMetric]
  [_ {:keys [name full-name]}]
  (or full-name name))

(defmethod ->reference [:mbql LegacyMetric]
  [_ {:keys [id definition]}]
  (if id
    [:metric id]
    (-> definition :aggregation first)))

(defmethod ->reference [:native Field]
  [_ field]
  (field/qualified-name field))

(defmethod ->reference [:native Table]
  [_ {:keys [name]}]
  name)

(defmethod ->reference :default
  [_ form]
  (or (cond-> form
        (map? form) ((some-fn :full-name :name) form))
      form))

(defn transform-metric-aggregate
  "Map a metric aggregate definition from nominal types to semantic types."
  [m decoder]
  (walk/prewalk
    (fn [v]
      (if (vector? v)
        (let [[d n] v]
          (if (= "dimension" d)
            (decoder n)
            v))
        v))
    m))

(mu/defn ground-metric :- [:sequential ads/grounded-metric]
  "Generate \"grounded\" metrics from the mapped dimensions (dimension name -> field matches).
   Since there may be multiple matches to a dimension, this will produce a sequence of potential matches."
  [{metric-name       :metric-name
    metric-score      :score
    metric-definition :metric} :- ads/normalized-metric-template
   ground-dimensions :- ads/dim-name->matching-fields]
  (let [named-dimensions (dashboard-templates/collect-dimensions metric-definition)]
    (->> (map (comp :matches ground-dimensions) named-dimensions)
         (apply math.combo/cartesian-product)
         (map (partial zipmap named-dimensions))
         (map (fn [nm->field]
                (let [xform (update-vals nm->field (partial ->reference :mbql))]
                  {:metric-name           metric-name
                   :metric-title          metric-name
                   :metric-score          metric-score
                   :metric-definition     {:aggregation
                                           [(transform-metric-aggregate metric-definition xform)]}
                   ;; Required for title interpolation in grounded-metrics->dashcards
                   :dimension-name->field nm->field}))))))

(mu/defn grounded-metrics :- [:sequential ads/grounded-metric]
  "Given a set of metric definitions and grounded (assigned) dimensions, produce a sequence of grounded metrics."
  [metric-templates :- [:sequential ads/normalized-metric-template]
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

(defn- fieldspec-matcher
  "Generate a predicate of the form (f field) -> truthy value based on a fieldspec."
  [fieldspec]
  (fn [{:keys [semantic_type target] :as field}]
    (cond
      ;; This case is mostly relevant for native queries
      (#{:type/PK :type/FK} fieldspec) (isa? semantic_type fieldspec)
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

(defn- filter-fields
  "Find all fields belonging to table `table` for which all predicates in
   `preds` are true. `preds` is a map with keys :fieldspec, :named, and :max-cardinality."
  [preds fields]
  (filter (->> preds
               (keep (fn [[k v]]
                       (when-let [pred (field-filters k)]
                         (some-> v pred))))
               (apply every-pred))
          fields))

(defn- matching-fields
  "Given a context and a dimension definition, find all fields from the context
   that match the definition of this dimension."
  [{{:keys [fields]} :source :keys [tables] :as context}
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

(defn- candidate-bindings
  "For every field in a given context determine all potential dimensions each field may map to.
  This will return a map of field id (or name) to collection of potential matching dimensions."
  [context dimension-specs]
  ;; TODO - Fix this so that the intermediate representations aren't so crazy.
  ;; all-bindings a map of binding dim identifier to binding def which contains
  ;; field matches which are all the same field except they are merged with the binding.
  ;; What we want instead is just a map of field to potential bindings.
  ;; Just rack and stack the bindings then return that with the field or something.
  (let [all-bindings (for [dimension      dimension-specs
                           :let [[identifier definition] (first dimension)]
                           matching-field (matching-fields context definition)]
                       {(name identifier)
                        (assoc definition :matches [(merge matching-field definition)])})]
    (group-by (comp id-or-name first :matches val first) all-bindings)))

(defn- score-bindings
  "Assign a value to each potential binding.
  Takes a seq of potential bindings and returns a seq of vectors in the shape
  of [score binding], where score is a 3 element vector. This is computed as:
     1) Number of ancestors `field_type` has (if field_type has a table prefix,
        ancestors for both table and field are counted);
     2) Number of fields in the definition, which would include additional filters
        (`named`, `max_cardinality`, `links_to`, ...) etc.;
     3) The manually assigned score for the binding definition
  "
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
                          :matches [\"CREATED_AT\"]}})
   "
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
  [context dimension-specs :- [:maybe [:sequential ads/dimension-template]]]
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
(def ^:private ^{:arglists '([source])} source->db
  (comp (partial t2/select-one :model/Database :id) (some-fn :db_id :database_id)))

(defn- enriched-field-with-sources [{:keys [tables source]} field]
  (assoc field
    :link (m/find-first (comp :link #{(:table_id field)} u/the-id) tables)
    :db (source->db source)))

(defn- add-field-links-to-definitions [dimensions field]
  (->> dimensions
       (keep (fn [[identifier definition]]
               (when-let [matches (->> definition
                                       :matches
                                       (remove (comp #{(id-or-name field)} id-or-name))
                                       not-empty)]
                 [identifier (assoc definition :matches matches)])))
       (concat [["this" {:matches [field]
                         :name    (:display_name field)
                         :score   dashboard-templates/max-score
                         :card-score   dashboard-templates/max-score}]])
       (into {})))

(defn- add-field-self-reference [{{:keys [entity]} :root :as context} dimensions]
  (cond-> dimensions
    (= Field (mi/model entity))
    (add-field-links-to-definitions (enriched-field-with-sources context entity))))
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn grounded-filters
  "Take filter templates (as from a dashboard template's :filters) and ground dimensions and produce a map of the
  filter name to grounded versions of the filter."
  [filter-templates ground-dimensions]
  (->> filter-templates
       (keep (fn [fltr]
               (let [[fname {:keys [filter] :as v}] (first fltr)
                     dims (dashboard-templates/collect-dimensions v)
                     opts (->> (map (comp
                                      (partial map (partial ->reference :mbql))
                                      :matches
                                      ground-dimensions) dims)
                               (apply math.combo/cartesian-product)
                               (map (partial zipmap dims)))]
                 (seq (for [opt opts
                            :let [f
                                  (walk/prewalk
                                    (fn [x]
                                      (if (vector? x)
                                        (let [[ds dim-name] x]
                                          (if (and (= "dimension" ds)
                                                   (string? dim-name))
                                            (opt dim-name)
                                            x))
                                        x))
                                    filter)]]
                        (assoc v :filter f :filter-name fname))))))
       flatten))

(mu/defn identify
  :- [:map
      [:dimensions ads/dim-name->matching-fields]
      [:metrics [:sequential ads/grounded-metric]]]
  "Identify interesting metrics and dimensions of a `thing`. First identifies interesting dimensions, and then
  interesting metrics which are satisfied.
  Metrics from the template are assigned a score of 50; user defined metrics a score of 95"
  [{{:keys [linked-metrics]} :root :as context}
   {:keys [dimension-specs
           metric-specs
           filter-specs]} :- [:map
                               [:dimension-specs [:maybe [:sequential ads/dimension-template]]]
                               [:metric-specs [:maybe [:sequential ads/metric-template]]]
                               [:filter-specs [:maybe [:sequential ads/filter-template]]]]]
  (let [dims      (->> (find-dimensions context dimension-specs)
                       (add-field-self-reference context))
        metrics   (-> (normalize-seq-of-maps :metric metric-specs)
                      (grounded-metrics dims))
        set-score (fn [score metrics]
                    (map #(assoc % :metric-score score) metrics))]
    {:dimensions dims
     :metrics    (concat (set-score 50 metrics) (set-score 95 linked-metrics)
                         (let [entity (-> context :root :entity)]
                           ;; metric x-rays talk about "this" in the template
                           (when (mi/instance-of? :model/LegacyMetric entity)
                             [{:metric-name       "this"
                               :metric-title      (:name entity)
                               :metric-definition {:aggregation [(->reference :mbql entity)]}
                               :metric-score      dashboard-templates/max-score}])))
     :filters (grounded-filters filter-specs dims)}))

(defn card->dashcard
  "Convert a card to a dashboard card."
  [{:keys [width height] :as card}]
  {:id                     (gensym)
   :size_x                 width
   :size_y                 height
   :dashboard_tab_id       nil
   :card                   (dissoc card :width :height)
   :visualization_settings {}})

(defn make-layout
  "Assign `:row` and `:col` values to the provied seq of dashcards."
  [dashcards]
  (loop [[{:keys [size_x size_y] :as dashcard} & dashcards] dashcards
         [xmin ymin xmax ymax] [0 0 0 0]
         final-cards []]
    (if dashcard
      (let [dashcard (assoc dashcard :row ymin :col xmax)
            bounds   (if (> xmax 20)
                       [xmin ymax 0 (+ ymax size_y)]
                       [xmin ymin (+ xmax size_x) (max ymax (+ ymin size_y))])]
        (recur dashcards
               bounds
               (conj final-cards dashcard)))
      final-cards)))
