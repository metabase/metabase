(ns metabase.automagic-dashboards.interesting
  (:refer-clojure :exclude [find])
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [java-time :as t]
   [metabase.automagic-dashboards.dashboard-templates :as dashboard-templates]
   [metabase.automagic-dashboards.foo-dashboard-generator :as dash-gen]
   [metabase.automagic-dashboards.populate :as populate]
   [metabase.automagic-dashboards.schema :as ads]
   [metabase.automagic-dashboards.util :as magic.util]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.field :as field :refer [Field]]
   [metabase.models.interface :as mi]
   [metabase.models.metric :refer [Metric]]
   [metabase.models.table :refer [Table]]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Global affinity definitions

(defn affinity-set-interestingness [affinity-set]
  (reduce + (map (fn [a] (count (ancestors a))) affinity-set)))

(def affinity-specs
  (mapv
    (fn [{:keys [affinity-set] :as m}]
      (assoc m :affinity-interestingness (affinity-set-interestingness affinity-set)))
    [{:affinity-set #{:type/Longitude :type/Latitude} :charts [:map :binned-map]}
     {:affinity-set #{:type/Country} :charts [:map]}
     ;; How does this look?
     {:affinity-set #{:type/State} :charts [:map]}
     ;{:affinity-set #{:type/ZipCode} :charts [:map]}
     {:affinity-set #{:type/Source} :charts [:bar]}
     {:affinity-set #{:type/Category} :charts [:bar]}
     {:affinity-set #{:type/CreationTimestamp} :charts [:line]}
     {:affinity-set #{:type/Quantity} :charts [:line]}
     {:affinity-set #{:type/Discount} :charts [:line]}]))

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
  "From a :model/Metric, construct a mapping of semantic types of linked fields to
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

(defn instantiate-affinities
  "For a given metric, determine adjacent fields and return a map of them by
  semantic type grouping."
  [metric]
  (let [semantic-groups (semantic-groups metric)]
    (for [{:keys [affinity-set] :as affinity-spec} affinity-specs
          :when (every? semantic-groups affinity-set)
          :let [bindings (map semantic-groups affinity-set)]
          dimensions (apply math.combo/cartesian-product bindings)]
      (assoc affinity-spec
        :metric metric
        :dimensions dimensions))))


(comment

  (let [{table-id :id :as table} (t2/select-one :model/Table :name "ORDERS")]
    (map (juxt :id :name :semantic_type) (t2/select :model/Field :table_id table-id)))

  (map (juxt :name :id) (t2/select :model/Metric))
  ;(["Churn" 785] ["gmail" 909] ["Weird Thing" 910] ["Multitable Metric" 920])
  (->> (t2/select :model/Metric)
       (map (fn [{:keys [name id] :as metric}]
              [name id (keys (semantic-groups metric))])))

  (semantic-groups
    (t2/select-one :model/Metric :name "Churn"))

  (let [{metric-name :name :as metric} (t2/select-one :model/Metric :name "Churn")]
    (->> metric
         instantiate-affinities
         (dash-gen/create-dashboard {:dashboard-name metric-name})))

  (->> (t2/select-one :model/Metric :name "Churn")
       instantiate-affinities
       (mapv (fn [affinity]
               (-> affinity
                   (update :dimensions #(mapv :name %))
                   (update :metric :name)))))

  (->> (t2/select-one :model/Metric :name "Weird Thing")
       instantiate-affinities)
  )

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

(defn ground-metric
  "Generate \"grounded\" metrics from the mapped dimensions (dimension name -> field matches).
   Since there may be multiple matches to a dimension, this will produce a sequence of potential matches."
  [{metric-name :metric-name metric-definition :metric} ground-dimensions]
  (let [named-dimensions (dashboard-templates/collect-dimensions metric-definition)]
    (->> (map (comp :matches ground-dimensions) named-dimensions)
         (apply math.combo/cartesian-product)
         (map (partial zipmap named-dimensions))
         (map (fn [nm->field]
                (let [xform (update-vals nm->field (fn [{field-id :id}]
                                                     [:field field-id nil]))]
                  {:metric-name            metric-name
                   :metric-title           metric-name
                   :metric-definition      {:aggregation
                                            (transform-metric-aggregate metric-definition xform)}
                   :grounded-metric-fields (vals nm->field)}))))))

(defn grounded-metrics
  "Given a set of metric definitions and grounded (assigned) dimensions, produce a sequence of grounded metrics."
  [metric-templates ground-dimensions]
  (mapcat #(ground-metric % ground-dimensions) metric-templates))

(defn normalize-metrics
  "Utility function to convert a dashboard template into a sequence of metric templates that are easier to work with."
  [metrics]
  (->> metrics
       (map first)
       (map (fn [[metric-name metric-definition]]
              (assoc metric-definition :metric-name metric-name)))))

;;; dimensions

(defn- fieldspec-matcher
  "Generate a predicate of the form (f field) -> truthy value based on a fieldspec."
  [fieldspec]
  (if (and (string? fieldspec)
           (dashboard-templates/ga-dimension? fieldspec))
    (comp #{fieldspec} :name)
    (fn [{:keys [semantic_type target] :as field}]
      (cond
        ;; This case is mostly relevant for native queries
        (#{:type/PK :type/FK} fieldspec) (isa? semantic_type fieldspec)
        target (recur target)
        :else (and (not (magic.util/key-col? field)) (magic.util/field-isa? field fieldspec))))))

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

(mu/defn find-dimensions
  "Bind fields to dimensions from the dashboard template and resolve overloaded cases in which multiple fields match the
  dimension specification.

   Each field will be bound to only one dimension. If multiple dimension definitions match a single field, the field
  is bound to the most specific definition used
   (see `most-specific-definition` for details).

  The context is passed in, but it only needs tables and fields in `candidate-bindings`. It is not extensively used."
  [context dimension-specs :- [:sequential ads/dimension-template]]
  (->> (candidate-bindings context dimension-specs)
       (map (comp most-specific-matched-dimension val))
       (apply merge-with (fn [a b]
                           (case (compare (:score a) (:score b))
                             1 a
                             0 (update a :matches concat (:matches b))
                             -1 b))
              {})))

(defmulti
  ^{:doc      "Get a reference for a given model to be injected into a template
          (either MBQL, native query, or string)."
    :arglists '([template-type model])}
  ->reference (fn [template-type model]
                [template-type (mi/model model)]))

(defn- optimal-datetime-resolution
  [field]
  (let [[earliest latest] (some->> field
                                   :fingerprint
                                   :type
                                   :type/DateTime
                                   ((juxt :earliest :latest))
                                   (map u.date/parse))]
    (if (and earliest latest)
      ;; e.g. if 3 hours > [duration between earliest and latest] then use `:minute` resolution
      (condp u.date/greater-than-period-duration? (u.date/period-duration earliest latest)
        (t/hours 3) :minute
        (t/days 7) :hour
        (t/months 6) :day
        (t/years 10) :month
        :year)
      :day)))

(defmethod ->reference [:mbql Field]
  [_ {:keys [fk_target_field_id id link aggregation name base_type] :as field}]
  (let [reference (mbql.normalize/normalize
                    (cond
                      link [:field id {:source-field link}]
                      fk_target_field_id [:field fk_target_field_id {:source-field id}]
                      ;; This is a hack for some bad queries with boolean base types
                      id [:field id {:base-type base_type}]
                      :else [:field name {:base-type base_type}]))]
    (cond
      (isa? base_type :type/Temporal)
      (mbql.u/with-temporal-unit reference (keyword (or aggregation
                                                        (optimal-datetime-resolution field))))

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

(defmethod ->reference [:string Metric]
  [_ {:keys [name full-name]}]
  (or full-name name))

(defmethod ->reference [:mbql Metric]
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

(mu/defn find
  "Idnetify interesting metrics and dimensions of a `thing`. First identifies interesting dimensions, and then
  interesting metrics which are satisfied."
  [{{:keys [linked-metrics]} :root :as context}
   {:keys [dimension-specs
           metric-specs]} :- [:map
                              [:dimension-specs [:sequential ads/dimension-template]]
                              [:metric-specs    [:sequential ads/metric-template]]]]
  (let [dims    (find-dimensions context dimension-specs)
        metrics (-> (normalize-metrics metric-specs)
                    (grounded-metrics dims))]
    {:dimensions dims
     :metrics (concat metrics linked-metrics)}))



(defn card->dashcard
  "Convert a card to a dashboard card."
  [{:keys [width height] :as card}]
  {:id                     (gensym)
   :size_x                 width
   :size_y                 height
   :dashboard_tab_id       nil
   :card                   (dissoc card :width :height)
   :visualization_settings {}})

;{
; "size_x": 18,
; "dashboard_tab_id": null,
; "creator_id": 1,
; "card": null,
; "col": 0,
; "id": "G__178075",
; "visualization_settings": {
;                            "text": "# Overview",
;                            "virtual_card": {
;                                             "name": null,
;                                             "display": "text",
;                                             "dataset_query": {},
;                                             "visualization_settings": {}
;                                             },
;                            "dashcard.background": false,
;                            "text.align_vertical": "bottom"
;                            },
; "size_y": 2,
; "row": 0
; }

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

(defn dashboard-ify
  "Create a dashboard from the given params and cards."
  [{:keys [dashboard-template-name]} cards]
  {:description        (format "An exploration of your metric %s" dashboard-template-name)
   :name               (format "A look at %s" dashboard-template-name)
   ;:creator_id         1
   :transient_name     (format "Here's the %s dashboard" dashboard-template-name)
   :param_fields       {}
   :auto_apply_filters true
   :ordered_cards      cards})

(comment
  (let [entity       (t2/select-one :model/Table :name "ACCOUNTS")
        base-context (-> entity
                         magic/->root
                         (#'magic/make-base-context))
        {template-dimensions :dimensions} (dashboard-templates/get-dashboard-template ["table" "GenericTable"])]
    (find-dimensions base-context template-dimensions))

  (require '[metabase.automagic-dashboards.core :as magic])

  (let [{{:keys [source linked-metrics]} :root
         :as                             base-context} (-> (t2/select-one :model/Table :name "ACCOUNTS")
                                                           magic/->root
                                                           (#'magic/make-base-context))
        {template-dimensions :dimensions
         template-metrics    :metrics
         template-cards      :cards
         :as                 template} (dashboard-templates/get-dashboard-template ["table" "GenericTable"])]
    (let [ground-dimensions   (find-dimensions base-context template-dimensions)
          affinities          (#'magic/dash-template->affinities template ground-dimensions)
          affinity-set->cards (make-affinity-set->cards ground-dimensions template-cards affinities)
          metric-templates    (normalize-metrics template-metrics)
          grounded-metrics    (concat
                               (grounded-metrics metric-templates ground-dimensions)
                               linked-metrics)
          dashcards           (->> grounded-metrics
                                   (make-combinations ground-dimensions (map :affinity-set affinities))
                                   (ground-metrics->cards base-context affinity-set->cards)
                                        ;(map card->dashcard)
                                   )]
                                        ;(#'populate/shown-cards 3 dashcards)
                                        ;dashcards
                                        ;(map :position (take 5 dashcards))
                                        ;(#'populate/shown-cards 5 dashcards)
      (:ordered_cards
       (populate/create-dashboard {:title          "AAAA"
                                   :transient_name "TN"
                                   :description    "DESC"
                                   :cards          (take 3 dashcards)
                                   :groups         (group-by :group dashcards)} :all))
                                        ;(take 3 dashcards)
                                        ;dashcards
      ))

  ;; This doesn't have the right sourcing (see generate-dashboard signature)
  (generate-dashboard
   (t2/select-one :model/Metric :name "Churn")
   (dashboard-templates/get-dashboard-template ["table" "GenericTable"]))

  (:groups (dashboard-templates/get-dashboard-template ["table" "GenericTable"]))
  )

(comment
  (require '[metabase.automagic-dashboards.core :as magic])
  (let [template-name     "GenericTable"
        entity            (t2/select-one :model/Metric :name "Churn")
        {template-dimensions :dimensions
         template-metrics    :metrics} (dashboard-templates/get-dashboard-template ["table" template-name])
        base-context      (#'magic/make-base-context (magic/->root entity))
        ground-dimensions (find-dimensions base-context template-dimensions)
        metric-templates  (normalize-metrics template-metrics)]
    (concat
      (grounded-metrics metric-templates ground-dimensions)
      (linked-metrics entity)))

  (let [template-name     "GenericTable"
        entity            (t2/select-one :model/Table :name "ACCOUNTS")
        template          (dashboard-templates/get-dashboard-template ["table" template-name])
        {template-dimensions :dimensions
         template-metrics    :metrics} template
        base-context      (#'magic/make-base-context (magic/->root entity))
        ground-dimensions (find-dimensions base-context template-dimensions)
        affinities        (#'magic/dash-template->affinities template ground-dimensions)
        affinity-sets     (map :affinity-set affinities)
        metric-templates  (normalize-metrics template-metrics)
        grounded-metrics  (concat
                            (grounded-metrics metric-templates ground-dimensions)
                            (linked-metrics entity))]
    (->> grounded-metrics
         (make-combinations ground-dimensions affinity-sets)
         (mapv (fn [ground-metric-with-dimensions]
                 (-> ground-metric-with-dimensions
                     (update :grounded-metric-fields (partial map (juxt :id :name)))
                     (update :grounded-dimensions #(update-vals % (juxt :id :name))))))))

  (require '[metabase.query-processor :as qp])
  (let [template-name     "GenericTable"
        {:keys [id db_id] :as entity} (t2/select-one :model/Table :name "ACCOUNTS")
        template          (dashboard-templates/get-dashboard-template ["table" template-name])
        {template-dimensions :dimensions
         template-metrics    :metrics} template
        base-context      (#'magic/make-base-context (magic/->root entity))
        ground-dimensions (find-dimensions base-context template-dimensions)
        affinities        (->> (#'magic/dash-template->affinities template ground-dimensions)
                               (map :affinity-set))
        metric-templates  (normalize-metrics template-metrics)
        grounded-metrics  (concat
                            (grounded-metrics metric-templates ground-dimensions)
                            (linked-metrics entity))]
    (->> grounded-metrics
         (make-combinations ground-dimensions affinities)
         (mapv (fn [ground-metric-with-dimensions]
                 (-> ground-metric-with-dimensions
                     (update :grounded-metric-fields (partial map (juxt :id :name)))
                     (update :grounded-dimensions #(update-vals % (juxt :id :name))))))
         ;; Stop above here to see the produced grounded metrics
         ;; Below is just showing we can make queries
         (mapv (fn [{:keys [metric-definition] :as metric}]
                 (assoc metric
                   :dataset_query {:database db_id
                                   :type     :query
                                   :query    (assoc metric-definition
                                               :source-table id)})))
         (mapv :dataset_query)
         ;(take 2)
         ;(map (juxt :metric-name (comp :rows :data qp/process-query :query)))
         ))
  )
