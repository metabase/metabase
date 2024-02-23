(ns metabase.automagic-dashboards.core
  "Automatically generate questions and dashboards based on predefined heuristics.

  There are two key inputs to this algorithm:
  - An entity to generate the dashboard for. The primary data needed from this entity is:
    - The entity type itself
    - The field information, especially the metadata about these fields
  - A set of potential dashboard templates from which a dashboard can be realized based on the entity and field data

  The first step in the base `automagic-dashboard` is to select dashboard templates that match the entity type of
  the entity to be x-rayed. A simple entity might match only to a GenericTable template while a more complicated
  entity might match to a TransactionTable or EventTable template.

  Once potential templates are selected, the following process is attempted for each template in order of most
  specialized template to least:
  - Determine which entity fields map to dimensions and metrics described in the template.
  - Match these selected dimensions and metrics to required dimensions and metrics for cards specified in the template.
  - If any cards match, we successfully return a dashboard generated with the created cards.

  The following example is provided to better illustrate the template process and how dimensions and metrics work.

  This is a notional dashboard template:

                              Card 1: You have N Items!

              Card 2:                      Card 3:                       Card 4:
        Avg Income over Time        Total Income per Category            X vs. Y
                   ___
      Avg  |    __/                  Total | #     #                 | *    *      *
    Income | __/                    Income | #  #  #               X |    ***
           |/                              | #  #  #  #              |      ***   *  *
           +----------                     +-----------              +-----------------
              Time                           Category                        Y

  Key things to note:
  - Each dimension _in a card_ is specified by *name*.
  - There are 5 dimensions across all cards:
    - Income
    - Time
    - Category
    - X
    - Y
  - There are 3 metrics:
    - Count (N Items)
    - Avg Income
    - Total Income
  - Each metric is a _computed value_ based on 0 or more dimensions, also specified by *name*.
    - Count is dimensionless
    - Avg and Total require the Income dimensions
    - Not shown, but a card such as \"Sales by Location\" could require 3 dimensions:
      - Total of the Sales dimension
      - Longitude and Latitude dimensions
    - A metric can also have multiple dimensions with its calculated value, such as the quotient of 2 dimensions.
  - Not described here are filters, which have the same nominal syntax for referencing dimensions as cards and metrics.

   Dimensions are the key Lego™ brick for all of the above and are specified as a named element with specialization
   based on entity and field semantic types as well as a score.

   For example, Income could have the following potential matches to underlying fields:
   - A field from a Sales table with semantic type `:type/Income` and score of 100
   - A field from an unspecified table with semantic type `:type/Income` and score of 90
   - A field from a Sales table with semantic type `:type/Number` and score of 50

   When matched with actual fields from an x-rayed entity, the highest matching field is selected to be \"bound\" to
   the Income dimensions. Suppose you have an entity of type SalesTable and fields of INCOME (semantic type Income),
   TAX (type Float), and TOTAL (Float). In this case, the INCOME field would match best (score 100) and be bound to the
   Income dimension.

   The other specified dimensions will have similar matching rules. Note that X & Y are, like all other dimensions,
   *named* dimensions. In our above example the Income dimension matched to the INCOME field of type `:type/Income`.
   This happens to be well-aligned data. X and Y might look like:
   - X is a field from the Sales table of type `:type/Decimal`
   - Y is a field from the Sales table of type `:type/Decimal`
   So long as two fields match the above criteria (decimal types (including descendants) and from a Sales table), they
   can be bound to the X and Y dimensions. They could be, for example, TAX and TOTAL.

   The above example, starting from the dashboard template, works backwards from the actual x-ray generation algorithm
   but should provide clarity as to the terminology and how everything fits together.

   In practice, we gather the entity data (including fields), the dashboard templates, attempt to bind dimensions to
   fields specified in the template, then build metrics, filters, and finally cards based on the bound dimensions.
  "
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [kixi.stats.core :as stats]
   [kixi.stats.math :as math]
   [medley.core :as m]
   [metabase.automagic-dashboards.combination :as combination]
   [metabase.automagic-dashboards.dashboard-templates :as dashboard-templates]
   [metabase.automagic-dashboards.filters :as filters]
   [metabase.automagic-dashboards.interesting :as interesting]
   [metabase.automagic-dashboards.names :as names]
   [metabase.automagic-dashboards.populate :as populate]
   [metabase.automagic-dashboards.util :as magic.util]
   [metabase.db.query :as mdb.query]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.models.card :refer [Card]]
   [metabase.models.database :refer [Database]]
   [metabase.models.field :as field :refer [Field]]
   [metabase.models.interface :as mi]
   [metabase.models.metric :refer [Metric]]
   [metabase.models.query :refer [Query]]
   [metabase.models.segment :refer [Segment]]
   [metabase.models.table :refer [Table]]
   [metabase.query-processor.util :as qp.util]
   [metabase.related :as related]
   [metabase.sync.analyze.classify :as classify]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [tru trun]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [schema.core :as s]
   [toucan2.core :as t2]))

(def ^:private public-endpoint "/auto/dashboard/")

(def ^:private ^{:arglists '([field])} id-or-name
  (some-fn :id :name))

(defmulti
  ^{:doc      "Get user-defined metrics linked to a given entity."
    :arglists '([entity])}
  linked-metrics mi/model)

(defmethod linked-metrics :model/LegacyMetric [{metric-name :name :keys [definition]}]
  [{:metric-name       metric-name
    :metric-title      metric-name
    :metric-definition definition
    :metric-score      100}])

(defmethod linked-metrics :model/Table [{table-id :id}]
  (mapcat
   linked-metrics
   (t2/select :model/LegacyMetric :table_id table-id)))

(defmethod linked-metrics :default [_] [])

(defmulti ->root
  "root is a datatype that is an entity augmented with metadata for the purposes of creating an automatic dashboard with
  respect to that entity. It is called a root because the automated dashboard uses productions to recursively create a
  tree of dashboard cards to fill the dashboards. This multimethod is for turning a given entity into a root."
  {:arglists '([entity])}
  mi/model)

(defmethod ->root Table
  [table]
  {:entity                     table
   :full-name                  (:display_name table)
   :short-name                 (:display_name table)
   :source                     table
   :database                   (:db_id table)
   :url                        (format "%stable/%s" public-endpoint (u/the-id table))
   :dashboard-templates-prefix ["table"]
   :linked-metrics             (linked-metrics table)})

(defmethod ->root Segment
  [segment]
  (let [table (->> segment :table_id (t2/select-one Table :id))]
    {:entity                     segment
     :full-name                  (tru "{0} in the {1} segment" (:display_name table) (:name segment))
     :short-name                 (:display_name table)
     :comparison-name            (tru "{0} segment" (:name segment))
     :source                     table
     :database                   (:db_id table)
     :query-filter               [:segment (u/the-id segment)]
     :url                        (format "%ssegment/%s" public-endpoint (u/the-id segment))
     :dashboard-templates-prefix ["table"]}))

(defmethod ->root Metric
  [metric]
  (let [table (->> metric :table_id (t2/select-one Table :id))]
    {:entity                     metric
     :full-name                  (if (:id metric)
                                   (trun "{0} metric" "{0} metrics" (:name metric))
                                   (:name metric))
     :short-name                 (:name metric)
     :source                     table
     :database                   (:db_id table)
     ;; We use :id here as it might not be a concrete field but rather one from a nested query which
     ;; does not have an ID.
     :url                        (format "%smetric/%s" public-endpoint (:id metric))
     :dashboard-templates-prefix ["metric"]}))

(defmethod ->root Field
  [field]
  (let [table (field/table field)]
    {:entity                     field
     :full-name                  (trun "{0} field" "{0} fields" (:display_name field))
     :short-name                 (:display_name field)
     :source                     table
     :database                   (:db_id table)
     ;; We use :id here as it might not be a concrete metric but rather one from a nested query
     ;; which does not have an ID.
     :url                        (format "%sfield/%s" public-endpoint (:id field))
     :dashboard-templates-prefix ["field"]}))

(def ^:private ^{:arglists '([card-or-question])} nested-query?
  "Is this card or question derived from another model or question?"
  (comp some? qp.util/query->source-card-id :dataset_query))

(def ^:private ^{:arglists '([card-or-question])} native-query?
  "Is this card or question native (SQL)?"
  (comp some? #{:native} qp.util/normalize-token #(get-in % [:dataset_query :type])))

(defn- source-question
  [card-or-question]
  (when-let [source-card-id (qp.util/query->source-card-id (:dataset_query card-or-question))]
    (t2/select-one Card :id source-card-id)))

(defn- table-like?
  [card-or-question]
  (nil? (get-in card-or-question [:dataset_query :query :aggregation])))

(defn- table-id
  "Get the Table ID from `card-or-question`, which can be either a Card from the DB (which has a `:table_id` property)
  or an ad-hoc query (referred to as a 'question' in this namespace) created with the
  `metabase.models.query/adhoc-query` function, which has a `:table-id` property."
  ;; TODO - probably better if we just changed `adhoc-query` to use the same keys as Cards (e.g. `:table_id`) so we
  ;; didn't need this function, seems like something that would be too easy to forget
  [card-or-question]
  (or (:table_id card-or-question)
      (:table-id card-or-question)))

(defn- source
  [card]
  (cond
    ;; This is a model
    (= (:type card) :model) (assoc card :entity_type :entity/GenericTable)
    ;; This is a query based on a query. Eventually we will want to change this as it suffers from the same sourcing
    ;; problems as other cards -- The x-ray is not done on the card, but on its source.
    (nested-query? card)    (-> card
                                source-question
                                (assoc :entity_type :entity/GenericTable))
    (native-query? card)    (-> card (assoc :entity_type :entity/GenericTable))
    :else                   (->> card table-id (t2/select-one Table :id))))

(defmethod ->root Card
  [card]
  (let [source (source card)]
    {:entity                     card
     :source                     source
     :database                   (:database_id card)
     :query-filter               (get-in card [:dataset_query :query :filter])
     :full-name                  (tru "\"{0}\"" (:name card))
     :short-name                 (names/source-name {:source source})
     :url                        (format "%s%s/%s" public-endpoint (name (:type source :question)) (u/the-id card))
     :dashboard-templates-prefix [(if (table-like? card)
                                    "table"
                                    "question")]}))

(defmethod ->root Query
  [query]
  (let [source (source query)]
    {:entity                     query
     :source                     source
     :database                   (:database-id query)
     :query-filter               (get-in query [:dataset_query :query :filter])
     :full-name                  (cond
                                   (native-query? query) (tru "Native query")
                                   (table-like? query) (-> source ->root :full-name)
                                   :else (names/question-description {:source source} query))
     :short-name                 (names/source-name {:source source})
     :url                        (format "%sadhoc/%s" public-endpoint
                                         (magic.util/encode-base64-json (:dataset_query query)))
     :dashboard-templates-prefix [(if (table-like? query)
                                    "table"
                                    "question")]}))

;; NOTE - This has been lifted to foo. Nuke it here as well.
(defn- fill-templates
  [template-type {:keys [root tables]} bindings s]
  (let [bindings (some-fn (merge {"this" (-> root
                                             :entity
                                             (assoc :full-name (:full-name root)))}
                                 bindings)
                          (comp first #(magic.util/filter-tables % tables) dashboard-templates/->entity)
                          identity)]
    (str/replace s #"\[\[(\w+)(?:\.([\w\-]+))?\]\]"
                 (fn [[_ identifier attribute]]
                   (let [entity    (bindings identifier)
                         attribute (some-> attribute qp.util/normalize-token)]
                     (str (or (and (ifn? entity) (entity attribute))
                              (root attribute)
                              (interesting/->reference template-type entity))))))))

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

(defn- singular-cell-dimension-field-ids
  "Return the set of ids referenced in a cell query"
  [{:keys [cell-query]}]
  (letfn [(collect-dimensions [[op & args]]
            (case (some-> op qp.util/normalize-token)
              :and (mapcat collect-dimensions args)
              :=   (magic.util/collect-field-references args)
              nil))]
    (->> cell-query
         collect-dimensions
         (map magic.util/field-reference->id)
         set)))

(defn- matching-dashboard-templates
  "Return matching dashboard templates ordered by specificity.
   Most specific is defined as entity type specification the longest ancestor
   chain."
  [dashboard-templates {:keys [source entity]}]
  ;; Should this be here or lifted to the calling context. It's a magic step.
  (let [table-type (or (:entity_type source) :entity/GenericTable)]
    (->> dashboard-templates
         (filter (fn [{:keys [applies_to]}]
                   (let [[entity-type field-type] applies_to]
                     (and (isa? table-type entity-type)
                          (or (nil? field-type)
                              (magic.util/field-isa? entity field-type))))))
         (sort-by :specificity >))))

(defn- linked-tables
  "Return all tables accessible from a given table with the paths to get there.
   If there are multiple FKs pointing to the same table, multiple entries will
   be returned."
  [table]
  (for [{:keys [id target]} (field/with-targets
                              (t2/select Field
                                         :table_id           (u/the-id table)
                                         :fk_target_field_id [:not= nil]
                                         :active             true))
        :when (some-> target mi/can-read?)]
    (-> target field/table (assoc :link id))))

(def ^:private ^{:arglists '([source])} source->db
  (comp (partial t2/select-one Database :id) (some-fn :db_id :database_id)))

(defn- relevant-fields
  "Source fields from tables that are applicable to the entity being x-rayed."
  [{:keys [source _entity] :as _root} tables]
  (let [db (source->db source)]
    (if (mi/instance-of? Table source)
      (comp (->> (t2/select Field
                            :table_id [:in (map u/the-id tables)]
                            :visibility_type "normal"
                            :preview_display true
                            :active true)
                 field/with-targets
                 (map #(assoc % :db db))
                 (group-by :table_id))
            u/the-id)
      (let [source-fields (->> source
                               :result_metadata
                               (map (fn [field]
                                      (as-> field field
                                        (update field :base_type keyword)
                                        (update field :semantic_type keyword)
                                        (mi/instance Field field)
                                        (classify/run-classifiers field {})
                                        (assoc field :db db)))))]
        (constantly source-fields)))))

(s/defn ^:private make-base-context
  "Create the underlying context to which we will add metrics, dimensions, and filters.

  This is applicable to all dashboard templates."
  [{:keys [source] :as root}]
  {:pre [source]}
  (let [tables        (concat [source] (when (mi/instance-of? Table source)
                                         (linked-tables source)))
        table->fields (relevant-fields root tables)]
    {:source       (assoc source :fields (table->fields source))
     :root         root
     :tables       (map #(assoc % :fields (table->fields %)) tables)
     :query-filter (filters/inject-refinement (:query-filter root)
                                              (:cell-query root))}))

(defn- make-dashboard
  ([root dashboard-template]
   (make-dashboard root dashboard-template {:tables [(:source root)] :root root} nil))
  ([root dashboard-template context {:keys [available-metrics]}]
   (-> dashboard-template
       (select-keys [:title :description :transient_title :groups])
       (cond->
         (:comparison? root)
         (update :groups (partial m/map-vals (fn [{:keys [title comparison_title] :as group}]
                                               (assoc group :title (or comparison_title title))))))
       (instantiate-metadata context available-metrics {}))))

(defn affinities->viz-types
  "Generate a map of satisfiable affinity sets (sets of dimensions that belong together)
  to visualization types that would be appropriate for each affinity set."
  [normalized-card-templates ground-dimensions]
  (reduce (partial merge-with set/union)
          {}
          (for [{:keys [dimensions visualization]} normalized-card-templates
                :let [dim-set (into #{} (map ffirst) dimensions)]
                :when (every? ground-dimensions dim-set)]
            {dim-set #{visualization}})))

(defn user-defined-groups
  "Create a dashboard group for each user-defined metric."
  [linked-metrics]
  (zipmap (map :metric-name linked-metrics)
          (map (fn [{:keys [metric-name]}]
                 {:title (format "Your %s Metric" metric-name)
                  :score 0}) linked-metrics)))

(defn user-defined-metrics->card-templates
  "Produce card templates for user-defined metrics. The basic algorithm is to generate the
  cross product of all user defined metrics to all provided dimension affinities to all
  potential visualization options for these affinities."
  [affinities->viz-types user-defined-metrics]
  (let [found-summary? (volatile! false)
        summary-viz-types #{["scalar" {}] ["smartscalar" {}]}]
    (for [[dimension-affinities viz-types] affinities->viz-types
          viz viz-types
          {:keys [metric-name] :as _user-defined-metric} user-defined-metrics
          :let [metric-title (if (seq dimension-affinities)
                               (format "%s by %s" metric-name
                                       (combination/items->str
                                        (map (fn [s] (format "[[%s]]" s)) (vec dimension-affinities))))
                               metric-name)
                group-name (if (and (not @found-summary?)
                                    (summary-viz-types viz))
                             (do (vreset! found-summary? true)
                                 "Overview")
                             metric-name)]]
      {:card-score    100
       :metrics       [metric-name]
       :dimensions    (mapv (fn [dim] {dim {}}) dimension-affinities)
       :visualization viz
       :width         6
       :title         (i18n/->UserLocalizedString metric-title nil {})
       :height        4
       :group         group-name
       :card-name     (format "Card[%s][%s]" metric-title (first viz))})))

(defn generate-base-dashboard
  "Produce the \"base\" dashboard from the base context for an item and a dashboard template.
  This includes dashcards and global filters, but does not include related items and is not yet populated.
  Repeated calls of this might be generated (e.g. the main dashboard and related) then combined once using
  create dashboard."
  [{{user-defined-metrics :linked-metrics :as root} :root :as base-context}
   {template-cards      :cards
    :keys               [dashboard_filters]
    :as                 dashboard-template}
   {grounded-dimensions :dimensions
    grounded-metrics    :metrics
    grounded-filters    :filters}]
  (let [card-templates                 (interesting/normalize-seq-of-maps :card template-cards)
        user-defined-card-templates    (user-defined-metrics->card-templates
                                        (affinities->viz-types card-templates grounded-dimensions)
                                        user-defined-metrics)
        all-cards                      (into card-templates user-defined-card-templates)
        dashcards                      (combination/grounded-metrics->dashcards
                                        base-context
                                        all-cards
                                        grounded-dimensions
                                        grounded-filters
                                        grounded-metrics)
        template-with-user-groups      (update dashboard-template
                                               :groups into (user-defined-groups user-defined-metrics))
        empty-dashboard                (make-dashboard root template-with-user-groups)]
    (assoc empty-dashboard
           ;; Adds the filters that show at the top of the dashboard
           ;; Why do we need (or do we) the last remove form?
           :filters (->> dashboard_filters
                         (mapcat (comp :matches grounded-dimensions))
                         (remove (comp (singular-cell-dimension-field-ids root) id-or-name)))
           :cards dashcards)))

(def ^:private ^:const ^Long max-related 8)
(def ^:private ^:const ^Long max-cards 15)

(defn ->related-entity
  "Turn `entity` into an entry in `:related.`"
  [entity]
  (let [{:keys [dashboard-templates-prefix] :as root} (->root entity)
        candidate-templates (dashboard-templates/get-dashboard-templates dashboard-templates-prefix)
        dashboard-template  (->> root
                                 (matching-dashboard-templates candidate-templates)
                                 first)
        dashboard           (make-dashboard root dashboard-template)]
    {:url         (:url root)
     :title       (:full-name root)
     :description (:description dashboard)}))

(defn- related-entities
  [root]
  (-> root
      :entity
      related/related
      (update :fields (partial remove magic.util/key-col?))
      (->> (m/map-vals (comp (partial map ->related-entity) u/one-or-many)))))

(s/defn ^:private indepth
  [{:keys [dashboard-templates-prefix url] :as root}
   {:keys [dashboard-template-name]} :- (s/maybe dashboard-templates/DashboardTemplate)]
  (let [base-context (make-base-context root)]
    (->> (dashboard-templates/get-dashboard-templates (concat dashboard-templates-prefix [dashboard-template-name]))
         (keep (fn [{indepth-template-name :dashboard-template-name
                     template-dimensions   :dimensions
                     template-metrics      :metrics
                     template-filters      :filters
                     :as                   indepth}]
                 (let [grounded-values (interesting/identify
                                         base-context
                                         {:dimension-specs template-dimensions
                                          :metric-specs    template-metrics
                                          :filter-specs    template-filters})
                       {:keys [description cards] :as dashboard} (generate-base-dashboard
                                                                   base-context
                                                                   indepth
                                                                   grounded-values)]
                   (when (and description (seq cards))
                     {:title       ((some-fn :short-title :title) dashboard)
                      :description description
                      :url         (format "%s/rule/%s/%s" url dashboard-template-name indepth-template-name)}))))
         (hash-map :indepth))))

(defn- drilldown-fields
  [root available-dimensions]
  (when (and (->> root :source (mi/instance-of? Table))
             (-> root :entity magic.util/ga-table? not))
    (->> available-dimensions
         vals
         (mapcat :matches)
         (filter mi/can-read?)
         filters/interesting-fields
         (map ->related-entity)
         (hash-map :drilldown-fields))))

(defn- comparisons
  [root]
  {:compare (concat
             (for [segment (->> root :entity related/related :segments (map ->root))]
               {:url         (str (:url root) "/compare/segment/" (-> segment :entity u/the-id))
                :title       (tru "Compare with {0}" (:comparison-name segment))
                :description ""})
             (when ((some-fn :query-filter :cell-query) root)
               [{:url         (if (->> root :source (mi/instance-of? Table))
                                (str (:url root) "/compare/table/" (-> root :source u/the-id))
                                (str (:url root) "/compare/adhoc/"
                                     (magic.util/encode-base64-json
                                      {:database (:database root)
                                       :type     :query
                                       :query    {:source-table (->> root
                                                                     :source
                                                                     u/the-id
                                                                     (str "card__"))}})))
                 :title       (tru "Compare with entire dataset")
                 :description ""}]))})

(defn- fill-related
  "We fill available slots round-robin style. Each selector is a list of fns that are tried against
   `related` in sequence until one matches."
  [available-slots selectors related]
  (let [pop-first         (fn [m ks]
                            (loop [[k & ks] ks]
                              (let [item (-> k m first)]
                                (cond
                                  item        [item (update m k rest)]
                                  (empty? ks) [nil m]
                                  :else       (recur ks)))))
        count-leafs        (comp count (partial mapcat val))
        [selected related] (reduce-kv
                            (fn [[selected related] k v]
                              (loop [[selector & remaining-selectors] v
                                     related                          related
                                     selected                         selected]
                                (let [[next related] (pop-first related (mapcat shuffle selector))
                                      num-selected   (count-leafs selected)]
                                  (cond
                                    (= num-selected available-slots)
                                    (reduced [selected related])

                                    next
                                    (recur remaining-selectors related (update selected k conj next))

                                    (empty? remaining-selectors)
                                    [selected related]

                                    :else
                                    (recur remaining-selectors related selected)))))
                            [{} related]
                            selectors)
        num-selected (count-leafs selected)]
    (if (pos? num-selected)
      (merge-with concat
        selected
        (fill-related (- available-slots num-selected) selectors related))
      {})))

(def ^:private related-selectors
  {Table   (let [down     [[:indepth] [:segments :metrics] [:drilldown-fields]]
                 sideways [[:linking-to :linked-from] [:tables]]
                 compare  [[:compare]]]
             {:zoom-in [down down down down]
              :related [sideways sideways]
              :compare [compare compare]})
   Segment (let [down     [[:indepth] [:segments :metrics] [:drilldown-fields]]
                 sideways [[:linking-to] [:tables]]
                 up       [[:table]]
                 compare  [[:compare]]]
             {:zoom-in  [down down down]
              :zoom-out [up]
              :related  [sideways sideways]
              :compare  [compare compare]})
   Metric  (let [down     [[:drilldown-fields]]
                 sideways [[:metrics :segments]]
                 up       [[:table]]
                 compare  [[:compare]]]
             {:zoom-in  [down down]
              :zoom-out [up]
              :related  [sideways sideways sideways]
              :compare  [compare compare]})
   Field   (let [sideways [[:fields]]
                 up       [[:table] [:metrics :segments]]
                 compare  [[:compare]]]
             {:zoom-out [up]
              :related  [sideways sideways]
              :compare  [compare]})
   Card    (let [down     [[:drilldown-fields]]
                 sideways [[:metrics] [:similar-questions :dashboard-mates]]
                 up       [[:table]]
                 compare  [[:compare]]]
             {:zoom-in  [down down]
              :zoom-out [up]
              :related  [sideways sideways sideways]
              :compare  [compare compare]})
   Query   (let [down     [[:drilldown-fields]]
                 sideways [[:metrics] [:similar-questions]]
                 up       [[:table]]
                 compare  [[:compare]]]
             {:zoom-in  [down down]
              :zoom-out [up]
              :related  [sideways sideways sideways]
              :compare  [compare compare]})})

(s/defn ^:private related
  "Build a balanced list of related X-rays. General composition of the list is determined for each
   root type individually via `related-selectors`. That recipe is then filled round-robin style."
  [root
   available-dimensions
   dashboard-template :- (s/maybe dashboard-templates/DashboardTemplate)]
  (->> (merge (indepth root dashboard-template)
              (drilldown-fields root available-dimensions)
              (related-entities root)
              (comparisons root))
       (fill-related max-related (get related-selectors (-> root :entity mi/model)))))

(defn- filter-referenced-fields
  "Return a map of fields referenced in filter clause."
  [root filter-clause]
  (->> filter-clause
       magic.util/collect-field-references
       (map (fn [[_ id-or-name _options]]
              [id-or-name (magic.util/->field root id-or-name)]))
       (remove (comp nil? second))
       (into {})))

(defn generate-dashboard
  "Produce a fully-populated dashboard from the base context for an item and a dashboard template."
  [{{:keys [show url query-filter] :as root} :root :as base-context}
   {:as dashboard-template}
   {grounded-dimensions :dimensions :as grounded-values}]
  (let [show      (or show max-cards)
        dashboard (generate-base-dashboard base-context dashboard-template grounded-values)]
    (-> dashboard
        (populate/create-dashboard show)
        (assoc
          :related (related
                     root grounded-dimensions
                     dashboard-template)
          :more (when (and (not= show :all)
                           (-> dashboard :cards count (> show)))
                  (format "%s#show=all" url))
          :transient_filters query-filter
          :param_fields (filter-referenced-fields root query-filter)
          :auto_apply_filters true
          :width "fixed"))))

(defn- automagic-dashboard
  "Create dashboards for table `root` using the best matching heuristics."
  [{:keys [dashboard-template dashboard-templates-prefix] :as root}]
  (let [base-context    (make-base-context root)
        {template-dimensions :dimensions
         template-metrics    :metrics
         template-filters    :filters
         :as                 template} (if dashboard-template
                                         (dashboard-templates/get-dashboard-template dashboard-template)
                                         (first (matching-dashboard-templates
                                                  (dashboard-templates/get-dashboard-templates dashboard-templates-prefix)
                                                  root)))
        grounded-values (interesting/identify
                          base-context
                          {:dimension-specs template-dimensions
                           :metric-specs    template-metrics
                           :filter-specs    template-filters})]
    (generate-dashboard base-context template grounded-values)))

(defmulti automagic-analysis
  "Create a transient dashboard analyzing given entity."
  {:arglists '([entity opts])}
  (fn [entity _]
    (mi/model entity)))

(defmethod automagic-analysis Table
  [table opts]
  (automagic-dashboard (merge (->root table) opts)))

(defmethod automagic-analysis Segment
  [segment opts]
  (automagic-dashboard (merge (->root segment) opts)))

(defmethod automagic-analysis Metric
  [metric opts]
  (automagic-dashboard (merge (->root metric) opts)))

(mu/defn ^:private collect-metrics :- [:maybe [:sequential (ms/InstanceOf Metric)]]
  [root question]
  (map (fn [aggregation-clause]
         (if (-> aggregation-clause
                 first
                 qp.util/normalize-token
                 (= :metric))
           (->> aggregation-clause second (t2/select-one Metric :id))
           (let [table-id (table-id question)]
             (mi/instance Metric {:definition {:aggregation  [aggregation-clause]
                                               :source-table table-id}
                                  :name       (names/metric->description root aggregation-clause)
                                  :table_id   table-id}))))
       (get-in question [:dataset_query :query :aggregation])))

(mu/defn ^:private collect-breakout-fields :- [:maybe [:sequential (ms/InstanceOf Field)]]
  [root question]
  (for [breakout     (get-in question [:dataset_query :query :breakout])
        field-clause (take 1 (magic.util/collect-field-references breakout))
        :let         [field (magic.util/->field root field-clause)]
        :when        field]
    field))

(defn- decompose-question
  [root question opts]
  (letfn [(analyze [x]
            (try
              (automagic-analysis x (assoc opts
                                           :source       (:source root)
                                           :query-filter (:query-filter root)
                                           :database     (:database root)))
              (catch Throwable e
                (throw (ex-info (tru "Error decomposing question: {0}" (ex-message e))
                                {:root root, :question question, :object x}
                                e)))))]
    (into []
          (comp cat (map analyze))
          [(collect-metrics root question)
           (collect-breakout-fields root question)])))

(defn- preserve-entity-element
  "Ensure that elements of an original dataset query are preserved in dashcard queries."
  [dashboard entity entity-element]
  (if-let [element-value (get-in entity [:dataset_query :query entity-element])]
    (letfn [(splice-element [dashcard]
              (cond-> dashcard
                (get-in dashcard [:card :dataset_query :query])
                (update-in [:card :dataset_query :query entity-element]
                           (fnil into (empty element-value))
                           element-value)))]
      (update dashboard :dashcards (partial map splice-element)))
    dashboard))

(defn- query-based-analysis
  [{:keys [entity] :as root} opts {:keys [cell-query cell-url]}]
  (let [transient-dash (if (table-like? entity)
                         (let [root' (merge root
                                            (when cell-query
                                              {:url                        cell-url
                                               :entity                     (:source root)
                                               :dashboard-templates-prefix ["table"]})
                                            opts)]
                           (automagic-dashboard root'))
                         (let [opts      (assoc opts :show :all)
                               root'     (merge root
                                                (when cell-query
                                                  {:url cell-url})
                                                opts)
                               base-dash (automagic-dashboard root')
                               dash      (reduce populate/merge-dashboards
                                                 base-dash
                                                 (decompose-question root entity opts))]
                           (merge dash
                                  (when cell-query
                                    (let [title (tru "A closer look at {0}" (names/cell-title root cell-query))]
                                      {:transient_name title
                                       :name           title})))))]
    (-> transient-dash
        (preserve-entity-element (:entity root) :joins)
        (preserve-entity-element (:entity root) :expressions))))

(defmethod automagic-analysis Card
  [card {:keys [cell-query] :as opts}]
  (let [root     (->root card)
        cell-url (format "%squestion/%s/cell/%s" public-endpoint
                         (u/the-id card)
                         (magic.util/encode-base64-json cell-query))]
    (query-based-analysis root opts
                          (when cell-query
                            {:cell-query cell-query
                             :cell-url   cell-url}))))

(defmethod automagic-analysis Query
  [query {:keys [cell-query] :as opts}]
  (let [root       (->root query)
        cell-query (when cell-query (mbql.normalize/normalize-fragment [:query :filter] cell-query))
        opts       (cond-> opts
                     cell-query (assoc :cell-query cell-query))
        cell-url   (format "%sadhoc/%s/cell/%s" public-endpoint
                           (magic.util/encode-base64-json (:dataset_query query))
                           (magic.util/encode-base64-json cell-query))]
    (query-based-analysis root opts
                          (when cell-query
                            {:cell-query cell-query
                             :cell-url   cell-url}))))

(defmethod automagic-analysis Field
  [field opts]
  (automagic-dashboard (merge (->root field) opts)))

(defn- enhance-table-stats
  "Add a stats field to each provided table with the following data:
  - num-fields: The number of Fields in each table
  - list-like?: Is this field 'list like'
  - link-table?: Is every Field a foreign key to another table"
  [tables]
  (when (not-empty tables)
    (let [field-count (->> (mdb.query/query {:select   [:table_id [:%count.* "count"]]
                                             :from     [:metabase_field]
                                             :where    [:and [:in :table_id (map u/the-id tables)]
                                                        [:= :active true]]
                                             :group-by [:table_id]})
                           (into {} (map (juxt :table_id :count))))
          list-like?  (->> (when-let [candidates (->> field-count
                                                      (filter (comp (partial >= 2) val))
                                                      (map key)
                                                      not-empty)]
                             (mdb.query/query {:select   [:table_id]
                                               :from     [:metabase_field]
                                               :where    [:and [:in :table_id candidates]
                                                          [:= :active true]
                                                          [:or [:not= :semantic_type "type/PK"]
                                                           [:= :semantic_type nil]]]
                                               :group-by [:table_id]
                                               :having   [:= :%count.* 1]}))
                           (into #{} (map :table_id)))
          ;; Table comprised entierly of join keys
          link-table? (when (seq field-count)
                        (->> (mdb.query/query {:select   [:table_id [:%count.* "count"]]
                                               :from     [:metabase_field]
                                               :where    [:and [:in :table_id (keys field-count)]
                                                          [:= :active true]
                                                          [:in :semantic_type ["type/PK" "type/FK"]]]
                                               :group-by [:table_id]})
                             (filter (fn [{:keys [table_id count]}]
                                       (= count (field-count table_id))))
                             (into #{} (map :table_id))))]
      (for [table tables]
        (let [table-id (u/the-id table)]
          (assoc table :stats {:num-fields  (field-count table-id 0)
                               :list-like?  (boolean (contains? list-like? table-id))
                               :link-table? (boolean (contains? link-table? table-id))}))))))

(def ^:private ^:const ^Long max-candidate-tables
  "Maximal number of tables per schema shown in `candidate-tables`."
  10)

(defn candidate-tables
  "Return a list of tables in database with ID `database-id` for which it makes sense
   to generate an automagic dashboard. Results are grouped by schema and ranked
   acording to interestingness (both schemas and tables within each schema). Each
   schema contains up to `max-candidate-tables` tables.

   Tables are ranked based on how specific dashboard template has been used, and
   the number of fields.
   Schemes are ranked based on the number of distinct entity types and the
   interestingness of tables they contain (see above)."
  ([database] (candidate-tables database nil))
  ([database schema]
   (let [dashboard-templates (dashboard-templates/get-dashboard-templates ["table"])]
     (->> (apply t2/select [Table :id :schema :display_name :entity_type :db_id]
                 (cond-> [:db_id (u/the-id database)
                          :visibility_type nil
                          :active true]
                   schema (concat [:schema schema])))
          (filter mi/can-read?)
          enhance-table-stats
          (remove (comp (some-fn :link-table? (comp zero? :num-fields)) :stats))
          (map (fn [table]
                 (let [root      (->root table)
                       {:keys [dashboard-template-name]
                        :as   dashboard-template} (->> root
                                                       (matching-dashboard-templates dashboard-templates)
                                                       first)
                       dashboard (make-dashboard root dashboard-template)]
                   {:url                     (format "%stable/%s" public-endpoint (u/the-id table))
                    :title                   (:short-name root)
                    :score                   (+ (math/sq (:specificity dashboard-template))
                                                (math/log (-> table :stats :num-fields))
                                                (if (-> table :stats :list-like?)
                                                  -10
                                                  0))
                    :description             (:description dashboard)
                    :table                   table
                    :dashboard-template-name dashboard-template-name})))
          (group-by (comp :schema :table))
          (map (fn [[schema tables]]
                 (let [tables (->> tables
                                   (sort-by :score >)
                                   (take max-candidate-tables))]
                   {:id     (format "%s/%s" (u/the-id database) schema)
                    :tables tables
                    :schema schema
                    :score  (+ (math/sq (transduce (m/distinct-by :dashboard-template-name)
                                                   stats/count
                                                   tables))
                               (math/sqrt (transduce (map (comp math/sq :score))
                                                     stats/mean
                                                     tables)))})))
          (sort-by :score >)))))
