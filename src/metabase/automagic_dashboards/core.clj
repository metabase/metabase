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
    [buddy.core.codecs :as codecs]
    [cheshire.core :as json]
    [clojure.math.combinatorics :as math.combo]
    [clojure.set :as set]
    [clojure.string :as str]
    [clojure.walk :as walk]
    [clojure.zip :as zip]
    [flatland.ordered.map :refer [ordered-map]]
    #_{:clj-kondo/ignore [:deprecated-namespace]}
    [java-time :as t]
    [kixi.stats.core :as stats]
    [kixi.stats.math :as math]
    [medley.core :as m]
    [metabase.automagic-dashboards.combination :as combination]
    [metabase.automagic-dashboards.dashboard-templates :as dashboard-templates]
    [metabase.automagic-dashboards.filters :as filters]
    [metabase.automagic-dashboards.interesting :as interesting]
    [metabase.automagic-dashboards.populate :as populate]
    [metabase.automagic-dashboards.schema :as ads]
    [metabase.automagic-dashboards.util :as magic.util]
    [metabase.automagic-dashboards.visualization-macros :as visualization]
    [metabase.db.query :as mdb.query]
    [metabase.driver :as driver]
    [metabase.mbql.normalize :as mbql.normalize]
    [metabase.mbql.predicates :as mbql.preds]
    [metabase.mbql.util :as mbql.u]
    [metabase.models.card :as card :refer [Card]]
    [metabase.models.database :refer [Database]]
    [metabase.models.field :as field :refer [Field]]
    [metabase.models.interface :as mi]
    [metabase.models.metric :as metric :refer [Metric]]
    [metabase.models.query :refer [Query]]
    [metabase.models.segment :refer [Segment]]
    [metabase.models.table :refer [Table]]
    [metabase.query-processor.util :as qp.util]
    [metabase.related :as related]
    [metabase.sync.analyze.classify :as classify]
    [metabase.util :as u]
    [metabase.util.date-2 :as u.date]
    [metabase.util.i18n :as i18n :refer [deferred-tru trs tru trun]]
    [metabase.util.log :as log]
    [metabase.util.malli :as mu]
    #_{:clj-kondo/ignore [:deprecated-namespace]}
    [metabase.util.malli.schema :as ms]
    [metabase.util.schema :as su]
    [potemkin :as p]
    [ring.util.codec :as codec]
    [schema.core :as s]
    [toucan2.core :as t2]))

(def ^:private public-endpoint "/auto/dashboard/")

(def ^:private ^{:arglists '([field])} id-or-name
  (some-fn :id :name))

(mu/defn ->field :- [:maybe (ms/InstanceOf Field)]
  "Return `Field` instance for a given ID or name in the context of root."
  [{{result-metadata :result_metadata} :source, :as root}
   field-id-or-name-or-clause :- [:or ms/PositiveInt ms/NonBlankString [:fn mbql.preds/Field?]]]
  (let [id-or-name (if (sequential? field-id-or-name-or-clause)
                     (filters/field-reference->id field-id-or-name-or-clause)
                     field-id-or-name-or-clause)]
    (or
      ;; Handle integer Field IDs.
      (when (integer? id-or-name)
        (t2/select-one Field :id id-or-name))
      ;; handle field string names. Only if we have result metadata. (Not sure why)
      (when (string? id-or-name)
        (when-not result-metadata
          (log/warn (trs "Warning: Automagic analysis context is missing result metadata. Unable to resolve Fields by name.")))
        (when-let [field (m/find-first #(= (:name %) id-or-name)
                                       result-metadata)]
          (as-> field field
                (update field :base_type keyword)
                (update field :semantic_type keyword)
                (mi/instance Field field)
                (classify/run-classifiers field {}))))
      ;; otherwise this isn't returning something, and that's probably an error. Log it.
      (log/warn (str (trs "Cannot resolve Field {0} in automagic analysis context" field-id-or-name-or-clause)
                     \newline
                     (u/pprint-to-str root))))))

(def ^{:arglists '([root])} source-name
  "Return the (display) name of the source of a given root object."
  (comp (some-fn :display_name :name) :source))

;; TODO - rename "minumum" to "minimum". Note that there are internationalization string implications
;; here so make sure to do a *thorough* find and replace on this.
(def ^:private op->name
  {:sum       (deferred-tru "sum")
   :avg       (deferred-tru "average")
   :min       (deferred-tru "minumum")
   :max       (deferred-tru "maximum")
   :count     (deferred-tru "number")
   :distinct  (deferred-tru "distinct count")
   :stddev    (deferred-tru "standard deviation")
   :cum-count (deferred-tru "cumulative count")
   :cum-sum   (deferred-tru "cumulative sum")})

(def ^:private ^{:arglists '([metric])} saved-metric?
  (every-pred (partial mbql.u/is-clause? :metric)
              (complement mbql.u/ga-metric-or-segment?)))

(def ^:private ^{:arglists '([metric])} custom-expression?
  (partial mbql.u/is-clause? :aggregation-options))

(def ^:private ^{:arglists '([metric])} adhoc-metric?
  (complement (some-fn saved-metric? custom-expression?)))

(defn metric-name
  "Return the name of the metric or name by describing it."
  [[op & args :as metric]]
  (cond
    (mbql.u/ga-metric-or-segment? metric) (-> args first str (subs 3) str/capitalize)
    (adhoc-metric? metric)                (-> op qp.util/normalize-token op->name)
    (saved-metric? metric)                (->> args first (t2/select-one Metric :id) :name)
    :else                                 (second args)))

(defn metric-op
  "Return the name op of the metric"
  [[op & args :as metric]]
  (if (saved-metric? metric)
    (get-in (t2/select-one Metric :id (first args)) [:definition :aggregation 0 0])
    op))

(defn- join-enumeration
  "Join a sequence as [1 2 3 4] to \"1, 2, 3 and 4\""
  [xs]
  (if (next xs)
    (tru "{0} and {1}" (str/join ", " (butlast xs)) (last xs))
    (first xs)))

(defn- metric->description
  [root aggregation-clause]
  (join-enumeration
   (for [metric (if (sequential? (first aggregation-clause))
                  aggregation-clause
                  [aggregation-clause])]
     (if (adhoc-metric? metric)
       (tru "{0} of {1}" (metric-name metric) (or (some->> metric
                                                           second
                                                           (->field root)
                                                           :display_name)
                                                  (source-name root)))
       (metric-name metric)))))

(defn- question-description
  [root question]
  (let [aggregations (->> (get-in question [:dataset_query :query :aggregation])
                          (metric->description root))
        dimensions   (->> (get-in question [:dataset_query :query :breakout])
                          (mapcat filters/collect-field-references)
                          (map (comp :display_name
                                     (partial ->field root)))
                          join-enumeration)]
    (if dimensions
      (tru "{0} by {1}" aggregations dimensions)
      aggregations)))

(def ^{:arglists '([x])} encode-base64-json
  "Encode given object as base-64 encoded JSON."
  (comp codec/base64-encode codecs/str->bytes json/encode))

(defn- ga-table?
  [table]
  (isa? (:entity_type table) :entity/GoogleAnalyticsTable))

(defmulti
  ^{:doc      "Get user-defined metrics linked to a given entity."
    :arglists '([entity])}
  linked-metrics mi/model)

(defmethod linked-metrics :model/Metric [{metric-name :name :keys [definition] :as metric}]
  (let [field-ids (set (interesting/find-field-ids definition))]
    [{:metric-name            metric-name
      :metric-title           metric-name
      :metric-definition      definition
      :grounded-metric-fields (t2/select :model/Field :id [:in field-ids])}]))

(defmethod linked-metrics :model/Table [{table-id :id :keys [definition] :as table}]
  (mapcat
    linked-metrics
    (t2/select :model/Metric :table_id table-id)))

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
     :dashboard-templates-prefix ["metric"]
     :linked-metrics             (linked-metrics metric)}))

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
    (:dataset card) (assoc card :entity_type :entity/GenericTable)
    ;; This is a query based on a query. Eventually we will want to change this as it suffers from the same sourcing
    ;; problems as other cards -- The x-ray is not done on the card, but on its source.
    (nested-query? card) (-> card
                             source-question
                             (assoc :entity_type :entity/GenericTable))
    (native-query? card) (-> card (assoc :entity_type :entity/GenericTable))
    :else                (->> card table-id (t2/select-one Table :id))))

(defmethod ->root Card
  [card]
  (let [{:keys [dataset] :as source} (source card)]
    {:entity                     card
     :source                     source
     :database                   (:database_id card)
     :query-filter               (get-in card [:dataset_query :query :filter])
     :full-name                  (tru "\"{0}\"" (:name card))
     :short-name                 (source-name {:source source})
     :url                        (format "%s%s/%s" public-endpoint (if dataset "model" "question") (u/the-id card))
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
                                   :else (question-description {:source source} query))
     :short-name                 (source-name {:source source})
     :url                        (format "%sadhoc/%s" public-endpoint (encode-base64-json (:dataset_query query)))
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

(defn- build-order-by
  [{:keys [dimensions metrics order_by]}]
  (let [dimensions (into #{} (map ffirst) dimensions)]
    (for [[identifier ordering] (map first order_by)]
      [(if (= ordering "ascending")
         :asc
         :desc)
       (if (dimensions identifier)
         [:dimension identifier]
         [:aggregation (u/index-of #{identifier} metrics)])])))

(defn- build-mbql-query [{:keys [root source]} bindings filters metrics dimensions limit order-by]
 (walk/postwalk
   (fn [subform]
     (if (dashboard-templates/dimension-form? subform)
       (let [[_ identifier opts] subform]
         (interesting/->reference :mbql (-> identifier bindings (merge opts))))
       subform))
   {:type     :query
    :database (-> root :database)
    :query    (cond-> {:source-table (if (->> source (mi/instance-of? Table))
                                       (-> source u/the-id)
                                       (->> source u/the-id (str "card__")))}
                (seq filters)
                (assoc :filter (apply
                                 vector
                                 :and
                                 (map (comp (partial mbql.normalize/normalize-fragment [:query :filter])
                                            :filter)
                                      filters)))

                (seq dimensions)
                (assoc :breakout dimensions)

                (seq metrics)
                (assoc :aggregation (map :metric metrics))

                limit
                (assoc :limit limit)

                (seq order-by)
                (assoc :order-by order-by))}))

(defn- build-native-query [context bindings query]
  {:type     :native
   :native   {:query (fill-templates :native context bindings query)}
   :database (-> context :root :database)})

(defn- has-matches?
  "Does the dimension match the metric or filter definition?
  The metric or filter definition will have named dimensions (e.g. [\"dimension\" \"Lat\"]) and the dimensions are a map
  of dimension name to dimension data. has-matches? checks that every dimension detected in the definition item is also
  found in the keys of the dimensions map. Note that it also returns true if there are no dimensions in the definition
  as every predicate is considered satisfied on an empty collection."
  [dimensions definition]
  (->> definition
       dashboard-templates/collect-dimensions
       (every? (partial get dimensions))))

(defn- resolve-available-dimensions
  "Merge definitions of the form [{\"Name\" {:score n}}, {...}] into a single map of {\"Name\" {:score n} ...} after
  removing any that are not contained in the given dimensions.

  Conflicts may occur if multiple definitions have the same name. E.g. two definitions named \"Count\".
  When this happens, priority is given to definitions for which all dimensions named in the definition are contained in
  the definitions map. This includes dimensionless definitions, which are always satisfied. If neither or both
  definition names are in the dimension map, priority is given to the definition with the highest score."
  [dimensions definitions]
  (->> definitions
       (filter (partial has-matches? dimensions))
       (apply merge-with (fn [a b]
                           (case (map (partial has-matches? dimensions) [a b])
                             [true false] a
                             [false true] b
                             (max-key :score a b))))))

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

(defn- valid-breakout-dimension?
  [{:keys [base_type db fingerprint aggregation]}]
  (or (nil? aggregation)
      (not (isa? base_type :type/Number))
      (and (driver/database-supports? (:engine db) :binning db)
           (-> fingerprint :type :type/Number :min))))

(defn- singular-cell-dimensions
  [{:keys [cell-query]}]
  (letfn [(collect-dimensions [[op & args]]
            (case (some-> op qp.util/normalize-token)
              :and (mapcat collect-dimensions args)
              :=   (filters/collect-field-references args)
              nil))]
    (->> cell-query
         collect-dimensions
         (map filters/field-reference->id)
         set)))

(defn- build-dashcard
  "Build a dashcard from the given context, card template, common entities, and field bindings.

  As used, multiple candidate dashcards may be built from the same card template if multiple combinations of valid
  bindings are provided. E.g. if X is mapped over Y and multiple fields are candidates for dimension Y, you will end
  up with a dashcard for each potential valid X and Y combination."
  [context
   {card-dimensions :dimensions
    card-query      :query
    card-score      :score
    :keys           [limit]
    :as             card-template}
   {:keys [satisfied-dimensions satisfied-metrics satisfied-filters]}
   bindings]
  (let [score          (if card-query
                         card-score
                         (* (or (->> (concat (vals satisfied-filters)
                                             (vals satisfied-metrics)
                                             (vals satisfied-dimensions))
                                     (transduce (keep :score) stats/mean))
                                dashboard-templates/max-score)
                            (/ card-score dashboard-templates/max-score)))
        metrics        (for [metric (vals satisfied-metrics)]
                         {:name   ((some-fn :name (comp metric-name :metric)) metric)
                          :metric (:metric metric)
                          :op     (-> metric :metric metric-op)})
        dashcard       (visualization/expand-visualization
                         card-template
                         (vals bindings)
                         metrics)
        dashcard-query (if card-query
                         (build-native-query context bindings card-query)
                         (build-mbql-query context
                                           bindings
                                           (vals satisfied-filters)
                                           metrics
                                           (map (comp #(into [:dimension] %) first) card-dimensions)
                                           limit
                                           (build-order-by dashcard)))]
    (-> dashcard
        (instantiate-metadata context satisfied-metrics (->> (map :name metrics)
                                                            (zipmap (:metrics dashcard))
                                                            (merge bindings)))
        (assoc :dataset_query dashcard-query
               :metrics metrics
               :dimensions (map :name (vals bindings))
               :score score))))

(defn- valid-bindings? [{:keys [root]} satisfied-dimensions bindings]
  (let [cell-dimension? (singular-cell-dimensions root)]
    (->> satisfied-dimensions
         (map first)
         (map (fn [[identifier opts]]
                (merge (bindings identifier) opts)))
         (every? (every-pred valid-breakout-dimension?
                             (complement (comp cell-dimension? id-or-name)))))))

(mu/defn card-candidates
  "Generate all potential cards given a card definition and bindings for
   dimensions, metrics, and filters."
  [{:keys [query-filter] :as context} :- ads/context
   satisfied-bindings :- [:map-of ads/dimension-set ads/dimension-maps]
   {:keys [available-dimensions available-metrics available-filters]} :- ads/available-values
   {card-dimensions :dimensions
    card-metrics    :metrics
    card-filters    :filters
    :as                 card-template}]
  (let [satisfied-metrics    (zipmap
                               card-metrics
                               (map available-metrics card-metrics))
        satisfied-filters    (cond-> (zipmap
                                       card-filters
                                       (map available-filters card-filters))
                               query-filter
                               (assoc "query-filter" {:filter query-filter}))
        satisfied-dimensions (zipmap
                               card-dimensions
                               (map
                                 (fn [card-dimension]
                                   (-> card-dimension
                                       ffirst
                                       available-dimensions
                                       (dissoc :matches)))
                                 card-dimensions))
        satisfied-values     {:satisfied-dimensions satisfied-dimensions
                              :satisfied-metrics    satisfied-metrics
                              :satisfied-filters    satisfied-filters}
        dimension-locations  [satisfied-metrics satisfied-filters]
        used-dimensions      (set (into
                                    (map ffirst card-dimensions)
                                    (dashboard-templates/collect-dimensions dimension-locations)))]
    (->> (satisfied-bindings (set used-dimensions))
         (filter (partial valid-bindings? context card-dimensions))
         (map (partial build-dashcard context card-template satisfied-values)))))

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

(p/defprotocol+ AffinitySetProvider
  "For some item, determine the affinity sets of that item. This is a set of sets, each underlying set being a set of
  dimensions that, if satisfied, specify affinity to the item."
  (create-affinity-sets [this item]))

(mu/defn base-dimension-provider :- [:fn #(satisfies? AffinitySetProvider %)]
  "Takes a dashboard template and produces a function that takes a dashcard template and returns a seq of potential
  dimension sets that can satisfy the card."
  [{card-metrics :metrics card-filters :filters} :- ads/dashboard-template]
  (let [dim-groups (fn [items]
                     (-> (->> items
                              (map
                                (fn [item]
                                  [(ffirst item)
                                   (set (dashboard-templates/collect-dimensions item))]))
                              (group-by first))
                         (update-vals (fn [v] (mapv second v)))
                         (update "this" conj #{})))
        m->dims    (dim-groups card-metrics)
        f->dims    (dim-groups card-filters)]
    (reify AffinitySetProvider
      (create-affinity-sets [_ {:keys [dimensions metrics filters]}]
        (let [dimset                (set (map ffirst dimensions))
              underlying-dim-groups (concat (map m->dims metrics) (map f->dims filters))]
          (set
            (map
              (fn [lower-dims] (reduce into dimset lower-dims))
              (apply math.combo/cartesian-product underlying-dim-groups))))))))

(mu/defn dash-template->affinities-old :- ads/affinities-old
  "Takes a dashboard template, pulls the affinities from its cards, adds the name of the card
  as the affinity name, and adds in the set of all required base dimensions to satisfy the card.

  As card, filter, and metric names need not be unique, the number of affinities computed may
  be larger than the number of distinct card names and affinities are a sequence, not a map.

  These can easily be grouped by :affinity-name, :base-dims, etc. to efficiently select
  the appropriate affinities for a given situation.

  eg:
  (dash-template->affinities-map
   (dashboard-templates/get-dashboard-template [\"table\" \"TransactionTable\"]))

   [{:metrics [\"TotalOrders\"]
     :score 100
     :dimensions []
     :affinity-name \"Rowcount\"
      :base-dims #{}}
    {:filters [\"Last30Days\"]
      :metrics [\"TotalOrders\"]
      :score 100
      :dimensions []
      :affinity-name \"RowcountLast30Days\"
      :base-dims #{\"Timestamp\"}}
      ...
   ].
"
  [{card-templates :cards :as dashboard-template} :- ads/dashboard-template]
  ;; todo: cards can specify native queries with dimension template tags. See
  ;; resources/automagic_dashboards/table/example.yaml
  ;; note that they can specify dimension dependencies and ALSO table dependencies:
  ;; - Native:
  ;;    title: Native query
  ;;    # Template interpolation works the same way as in title and description. Field
  ;;    # names are automatically expanded into the full TableName.FieldName form.
  ;;    query: select count(*), [[State]]
  ;;           from [[GenericTable]] join [[UserTable]] on
  ;;           [[UserFK]] = [[UserPK]]
  ;;    visualization: bar
  (let [provider (base-dimension-provider dashboard-template)]
    (letfn [(card-deps [card]
              (-> (select-keys card [:dimensions :filters :metrics :score])
                  (update :dimensions (partial mapv ffirst))))]
      (mapcat
        (fn [card-template]
          (let [[card-name template] (first card-template)]
            (for [base-dims (create-affinity-sets provider template)]
              (assoc (card-deps template)
                :affinity-name card-name
                :base-dims base-dims))))
        card-templates))))

(mu/defn dash-template->affinities :- ads/affinities
  "Takes a dashboard-template and the ground dimensions and produces a sequence of affinities. An affinity is a map
 with a set of semantic/effective types that have an affinity with each other, a name, and an optional score. We mine
 the cards of a dashboard template to find which types have an affinity for each other, but these are easily derivable
 from other sources as well. It requires ground dimensions so we can be concrete on the semantic/effective types which
 have affinities and not deal with permutations of those types (eg different levels of temporal types with count, etc)

  eg:
  (let [template   (dashboard-templates/get-dashboard-template [\"table\" \"TransactionTable\"])
        context    (make-base-context (->root (t2/select-one :model/Table :id 2)))
        dimensions (foo/find-dimensions context (:dimensions template))]
    (dash-template->affinities template dimensions))

  #_ ->
  ({:affinity-name \"Rowcount\", :affinity-set #{}}
   {:affinity-name \"RowcountLast30Days\",
    :affinity-set #{:type/CreationTimestamp}}
   {:affinity-name \"AverageQuantityByMonth\",
    :affinity-set #{:type/Quantity :type/CreationTimestamp}})"
  [{card-templates :cards :as dashboard-template} :- ads/dashboard-template
   dimensions]
  (let [combine-maps (fn [k]
                       (map (fn [m']
                              (let [[m-name m] (first m')]
                                ;; go from vector of maps with a single key to a map with the key and value is
                                ;; either :filter or :metric of the definition
                                [m-name (k m)]))))
        metric-defs (into {} (combine-maps :metric)
                          (:metrics dashboard-template))
        filter-defs (into {} (combine-maps :filter)
                          (:filters dashboard-template))]
    (letfn [(clean-card [card]
              (-> (select-keys card [:dimensions :filters :metrics :score])
                  (update :dimensions (partial mapv ffirst))))
            (expand [defs n]
              (some->> (get defs n)
                       (tree-seq vector? next)
                       (filter (every-pred vector? (comp #{"dimension"} first)))
                       (map second)))
            (card-deps [card]
              (concat (:dimensions card)
                      (->> card :filters (mapcat (partial expand filter-defs)))
                      ;; need to expand metrics to their definition. Some don't have underlying dimension like
                      ;; TotalOrders which is just [count]
                      (->> card :metrics (mapcat (partial expand metric-defs)))))
            (dimension->types [dimension]
              ;; look up in dimensions to get what it matched on eg [:entity/GenericTable :type/Latitude]
              (-> dimension dimensions (get :field_type [::not-found]) last))]
      (into []
            (comp (keep
                   (fn [card-template]
                     (let [[card-name template] (first card-template) ;; {"card name" <template>}
                           cleaned-card         (clean-card template) ;; simplify a bit
                           underlying           (into #{} (keep dimension->types)
                                                      (card-deps cleaned-card))]
                       (when-not (underlying ::not-found)
                         {:affinity-name card-name
                          :affinity-set  underlying}))))
                  (m/distinct-by :affinity-set))
            card-templates))))

(comment
  (let [template   (dashboard-templates/get-dashboard-template ["table" "TransactionTable"])
        context    (make-base-context (->root (t2/select-one :model/Table :id 2)))
        dimensions (interesting/find-dimensions context (:dimensions template))]
    (dash-template->affinities template dimensions))
  )

(mu/defn match-affinities :- ads/affinity-matches
  "Return an ordered map of affinity names to the set of dimensions they depend on."
  [affinities :- ads/affinities-old
   available-dimensions :- [:set [:string {:min 1}]]]
  ;; Since the affinities contain the exploded base-dims, we simply do a set filter on the affinity names as that is
  ;; how we currently match to existing cards.
  (let [met-affinities (filter (fn [{:keys [base-dims] :as _v}]
                                 (set/subset? base-dims available-dimensions))
                               affinities)]
    (reduce (fn [m {:keys [affinity-name base-dims]}]
              (update m affinity-name (fnil conj []) base-dims))
            (ordered-map)
            met-affinities)))

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

(p/defprotocol+ CardTemplateProducer
  "Given an affinity name and corresponding affinity sets, produce a card template whose base dimensions match
  one of the affinity sets. Example:

  Given an affinity-name \"AverageQuantityByMonth\" and affinities [#{\"Quantity\" \"Timestamp\"}], the producer
  should produce a card template for which the base dimensions of the card are #{\"Quantity\" \"Timestamp\"}.
  "
  (create-template [_ affinity-name affinities]))

(mu/defn card-based-layout :- [:fn #(satisfies? CardTemplateProducer %)]
  "Returns an implementation of `CardTemplateProducer`. This is a bit circular right now as we break the idea of cards
  being the driver.  Affinities are sets of dimensions that are interesting together. We mine the card template
  definitions for these. And then when we want to make a layout, we use the set of interesting dimensions and the name
  of that interestingness to find the card that originally defined it. But this gives us the seam to break this
  connection. We can independently come up with a notion of interesting combinations and then independently come up
  with how to put that in a dashcard."
  [{template-cards :cards :as dashboard-template} :- ads/dashboard-template]
  (let [by-name             (update-vals (group-by ffirst template-cards) #(map (comp val first) %))
        resolve-overloading (fn [affinities cards]
                              (let [provider (base-dimension-provider dashboard-template)]
                                (some
                                  (fn [card]
                                    (let [dimsets (create-affinity-sets provider card)]
                                      (when (some dimsets affinities) card)))
                                  cards)))]
    (reify CardTemplateProducer
      (create-template [_ affinity-name affinities]
        (let [possible-cards (by-name affinity-name)]
          (if (= (count possible-cards) 1)
            (first possible-cards)
            (resolve-overloading affinities possible-cards)))))))

(mu/defn make-cards :- ads/dashcards
  "Create cards from the context using the provided template cards.
  Note that card, as destructured here, is a template baked into a dashboard template and is not a db entity Card."
  [context :- ads/context
   available-values :- ads/available-values
   satisfied-affinities :- ads/affinity-matches
   satisfied-bindings :- [:map-of ads/dimension-set ads/dimension-maps]
   layout-producer :- [:fn #(satisfies? CardTemplateProducer %)]]
  (some->> satisfied-affinities
           (map-indexed (fn [position [affinity-name affinities]]
                          (let [card-template (create-template layout-producer affinity-name affinities)]
                            (some->> (assoc card-template :position position)
                                     (card-candidates context satisfied-bindings available-values)
                                     not-empty
                                     (hash-map (name affinity-name))))))
           (apply merge-with (partial max-key (comp :score first)) {})
           vals
           (apply concat)))

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
                         :score   dashboard-templates/max-score}]])
       (into {})))

(defn- add-field-self-reference [{{:keys [entity]} :root :as context} dimensions]
  (cond-> dimensions
    (= Field (mi/model entity))
    (add-field-links-to-definitions (enriched-field-with-sources context entity))))

(defn- add-metric-self-reference [{{:keys [entity]} :root} metrics]
  (cond-> metrics
    (= Metric (mi/model entity))
    (assoc "this" {:metric (interesting/->reference :mbql entity)
                   :name   (:name entity)
                   :score  dashboard-templates/max-score})))

(mu/defn satisified-bindings :- ads/dimension-maps
  "Take an affinity set (a set of dimensions) and a map of dimension to bound items and return all possible realized
  affinity combinations for this affinity set and binding."
  [affinity-set :- ads/dimension-set
   available-dimensions :- ads/dimension-bindings]
  (->> affinity-set
       (map
         (fn [affinity-dimension]
           (let [{:keys [matches]} (available-dimensions affinity-dimension)]
             matches)))
       (apply math.combo/cartesian-product)
       (mapv (fn [combos] (zipmap affinity-set combos)))))

(mu/defn all-satisfied-bindings :- [:map-of ads/dimension-set ads/dimension-maps]
  "Compute all potential combinations of dimensions for each affinity set."
  [distinct-affinity-sets :- [:sequential ads/dimension-set]
   available-dimensions :- ads/dimension-bindings]
  (let [satisfied-combos (map #(satisified-bindings % available-dimensions)
                              distinct-affinity-sets)]
    (zipmap distinct-affinity-sets satisfied-combos)))

(defn generate-dashboard
  "Produce a dashboard from the base context for an item and a dashboad template."
  [{root :root :as base-context}
   {template-dimensions :dimensions
    template-metrics    :metrics
    template-cards      :cards
    :as                 template}]
  (let [{grounded-dimensions :dimensions
         grounded-metrics    :metrics}   (interesting/identify
                                          base-context
                                          {:dimension-specs template-dimensions
                                           :metric-specs    template-metrics})
        affinities          (dash-template->affinities template grounded-dimensions)
        affinity-set->cards (combination/make-affinity-set->cards grounded-dimensions template-cards affinities)
        cards               (->> grounded-metrics
                                 (combination/interesting-combinations grounded-dimensions
                                                                       (map :affinity-set affinities))
                                 (combination/combinations->cards base-context
                                                                  affinity-set->cards)
                                 (map-indexed (fn [i card]
                                                (assoc card :position i))))
        empty-dashboard (make-dashboard root template)]
    (populate/create-dashboard
      (assoc empty-dashboard :cards cards)
      :all)))

(comment
  (let [entity (t2/select-one :model/Table :name "ACCOUNTS")
        context (make-base-context (->root entity))]
    (generate-dashboard
      context
      (dashboard-templates/get-dashboard-template ["table" "GenericTable"])))
  )

(s/defn ^:private apply-dashboard-template
  "Apply a 'dashboard template' (a card template) to the root entity to produce a dashboard
  (including filters and cards).

  Returns nil if no cards are produced."
  [{root :root :as base-context}
   {template-dimensions :dimensions
    template-metrics    :metrics
    template-filters    :filters
    template-cards      :cards
    :keys               [dashboard-template-name dashboard_filters]
    :as                 dashboard-template} :- dashboard-templates/DashboardTemplate]
  (log/debugf "Applying dashboard template '%s'" dashboard-template-name)
  (let [available-dimensions   (->> (interesting/find-dimensions base-context template-dimensions)
                                    (add-field-self-reference base-context))
        ;; Satisfied metrics and filters are those for which there is a dimension that can be bound to them.
        available-metrics      (->> (resolve-available-dimensions available-dimensions template-metrics)
                                    (add-metric-self-reference base-context)
                                    (into {}))
        available-filters      (into {} (resolve-available-dimensions available-dimensions template-filters))
        available-values       {:available-dimensions available-dimensions
                                :available-metrics    available-metrics
                                :available-filters    available-filters}
        ;; for now we construct affinities from cards
        affinities             (dash-template->affinities-old dashboard-template)
        ;; get the suitable matches for them
        satisfied-affinities   (match-affinities affinities (set (keys available-dimensions)))
        distinct-affinity-sets (-> satisfied-affinities vals distinct flatten)
        cards                  (make-cards base-context
                                           available-values
                                           satisfied-affinities
                                           (all-satisfied-bindings distinct-affinity-sets available-dimensions)
                                           (card-based-layout dashboard-template))]
    (when (or (not-empty cards) (nil? template-cards))
      [(assoc (make-dashboard root dashboard-template base-context available-values)
              :filters (->> dashboard_filters
                            (mapcat (comp :matches available-dimensions))
                            (remove (comp (singular-cell-dimensions root) id-or-name)))
              :cards cards)
       dashboard-template
       available-values])))

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
         (keep (fn [{indepth-template-name :dashboard-template-name :as indepth}]
                 (when-let [{:keys [description] :as dashboard} (first (apply-dashboard-template base-context indepth))]
                   {:title       ((some-fn :short-title :title) dashboard)
                    :description description
                    :url         (format "%s/rule/%s/%s" url dashboard-template-name indepth-template-name)})))
         (hash-map :indepth))))

(defn- drilldown-fields
  [root {:keys [available-dimensions]}]
  (when (and (->> root :source (mi/instance-of? Table))
             (-> root :entity ga-table? not))
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
                                     (encode-base64-json
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
   available-values
   dashboard-template :- (s/maybe dashboard-templates/DashboardTemplate)]
  (->> (merge (indepth root dashboard-template)
              (drilldown-fields root available-values)
              (related-entities root)
              (comparisons root))
       (fill-related max-related (get related-selectors (-> root :entity mi/model)))))

(defn- filter-referenced-fields
  "Return a map of fields referenced in filter clause."
  [root filter-clause]
  (->> filter-clause
       filters/collect-field-references
       (map (fn [[_ id-or-name _options]]
              [id-or-name (->field root id-or-name)]))
       (remove (comp nil? second))
       (into {})))

(defn- find-first-match-dashboard-template
  "Given a 'root' context, apply matching dashboard templates in sequence and return the first application of this
   template that generates cards."
  [{:keys [dashboard-template dashboard-templates-prefix full-name] :as root}]
  (let [base-context (make-base-context root)]
    (or (when dashboard-template
          (apply-dashboard-template base-context (dashboard-templates/get-dashboard-template dashboard-template)))
        (some
         (fn [dashboard-template]
           (apply-dashboard-template base-context dashboard-template))
         (matching-dashboard-templates (dashboard-templates/get-dashboard-templates dashboard-templates-prefix) root))
        (throw (ex-info (trs "Can''t create dashboard for {0}" (pr-str full-name))
                        (let [templates (->> (or (some-> dashboard-template dashboard-templates/get-dashboard-template vector)
                                                 (dashboard-templates/get-dashboard-templates dashboard-templates-prefix))
                                             (map :dashboard-template-name))]
                          {:root                          root
                           :available-dashboard-templates templates}))))))

(defn- automagic-dashboard
  "Create dashboards for table `root` using the best matching heuristics."
  [{:keys [show full-name query-filter url] :as root}]
  (let [[dashboard
         {:keys [dashboard-template-name] :as dashboard-template}
         {:keys [available-dimensions
                 available-metrics
                 available-filters]
          :as available-values}] (find-first-match-dashboard-template root)
        show (or show max-cards)]
    (log/debug (trs "Applying heuristic {0} to {1}." dashboard-template-name full-name))
    (log/debug (trs "Dimensions bindings:\n{0}"
                    (->> available-dimensions
                         (m/map-vals #(update % :matches (partial map :name)))
                         u/pprint-to-str)))
    (log/debug (trs "Using definitions:\nMetrics:\n{0}\nFilters:\n{1}"
                    (->> available-metrics (m/map-vals :metric) u/pprint-to-str)
                    (-> available-filters u/pprint-to-str)))
    (-> dashboard
        (populate/create-dashboard show)
        (assoc :related (related root available-values dashboard-template)
               :more (when (and (not= show :all)
                                (-> dashboard :cards count (> show)))
                       (format "%s#show=all" url))
               :transient_filters query-filter
               :param_fields (filter-referenced-fields root query-filter)
               :auto_apply_filters true))))

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

(s/defn ^:private collect-metrics :- (s/maybe [#_{:clj-kondo/ignore [:deprecated-var]} (mi/InstanceOf:Schema Metric)])
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
                                  :name       (metric->description root aggregation-clause)
                                  :table_id   table-id}))))
       (get-in question [:dataset_query :query :aggregation])))

(s/defn ^:private collect-breakout-fields :- (s/maybe [#_{:clj-kondo/ignore [:deprecated-var]} (mi/InstanceOf:Schema Field)])
  [root question]
  (for [breakout     (get-in question [:dataset_query :query :breakout])
        field-clause (take 1 (filters/collect-field-references breakout))
        :let         [field (->field root field-clause)]
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

(defn- pluralize
  [x]
  ;; the `int` cast here is to fix performance warnings if `*warn-on-reflection*` is enabled
  (case (int (mod x 10))
    1 (tru "{0}st" x)
    2 (tru "{0}nd" x)
    3 (tru "{0}rd" x)
    (tru "{0}th" x)))

(defn- humanize-datetime
  [t-str unit]
  (let [dt (u.date/parse t-str)]
    (case unit
      :second          (tru "at {0}" (t/format "h:mm:ss a, MMMM d, YYYY" dt))
      :minute          (tru "at {0}" (t/format "h:mm a, MMMM d, YYYY" dt))
      :hour            (tru "at {0}" (t/format "h a, MMMM d, YYYY" dt))
      :day             (tru "on {0}" (t/format "MMMM d, YYYY" dt))
      :week            (tru "in {0} week - {1}"
                            (pluralize (u.date/extract dt :week-of-year))
                            (str (u.date/extract dt :year)))
      :month           (tru "in {0}" (t/format "MMMM YYYY" dt))
      :quarter         (tru "in Q{0} - {1}"
                            (u.date/extract dt :quarter-of-year)
                            (str (u.date/extract dt :year)))
      :year            (t/format "YYYY" dt)
      :day-of-week     (t/format "EEEE" dt)
      :hour-of-day     (tru "at {0}" (t/format "h a" dt))
      :month-of-year   (t/format "MMMM" dt)
      :quarter-of-year (tru "Q{0}" (u.date/extract dt :quarter-of-year))
      (:minute-of-hour
       :day-of-month
       :day-of-year
       :week-of-year)  (u.date/extract dt unit))))

(defn- field-reference->field
  [root field-reference]
  (let [normalized-field-reference (mbql.normalize/normalize field-reference)
        temporal-unit              (mbql.u/match-one normalized-field-reference
                                     [:field _ (opts :guard :temporal-unit)]
                                     (:temporal-unit opts))]
    (cond-> (->> normalized-field-reference
                 filters/collect-field-references
                 first
                 (->field root))
      temporal-unit
      (assoc :unit temporal-unit))))

(defmulti
  ^{:private true
    :arglists '([fieldset [op & args]])}
  humanize-filter-value (fn [_ [op & _args]]
                          (qp.util/normalize-token op)))

(def ^:private unit-name (comp {:minute-of-hour  (deferred-tru "minute")
                                :hour-of-day     (deferred-tru "hour")
                                :day-of-week     (deferred-tru "day of week")
                                :day-of-month    (deferred-tru "day of month")
                                :day-of-year     (deferred-tru "day of year")
                                :week-of-year    (deferred-tru "week")
                                :month-of-year   (deferred-tru "month")
                                :quarter-of-year (deferred-tru "quarter")}
                               qp.util/normalize-token))

(defn- field-name
  ([root field-reference]
   (->> field-reference (field-reference->field root) field-name))
  ([{:keys [display_name unit] :as _field}]
   (cond->> display_name
     (some-> unit u.date/extract-units) (tru "{0} of {1}" (unit-name unit)))))

(defmethod humanize-filter-value :=
  [root [_ field-reference value]]
  (let [field      (field-reference->field root field-reference)
        field-name (field-name field)]
    (if (isa? ((some-fn :effective_type :base_type) field) :type/Temporal)
      (tru "{0} is {1}" field-name (humanize-datetime value (:unit field)))
      (tru "{0} is {1}" field-name value))))

(defmethod humanize-filter-value :between
  [root [_ field-reference min-value max-value]]
  (tru "{0} is between {1} and {2}" (field-name root field-reference) min-value max-value))

(defmethod humanize-filter-value :inside
  [root [_ lat-reference lon-reference lat-max lon-min lat-min lon-max]]
  (tru "{0} is between {1} and {2}; and {3} is between {4} and {5}"
       (field-name root lon-reference) lon-min lon-max
       (field-name root lat-reference) lat-min lat-max))

(defmethod humanize-filter-value :and
  [root [_ & clauses]]
  (->> clauses
       (map (partial humanize-filter-value root))
       join-enumeration))

(defn cell-title
  "Return a cell title given a root object and a cell query."
  [root cell-query]
  (str/join " " [(if-let [aggregation (get-in root [:entity :dataset_query :query :aggregation])]
                   (metric->description root aggregation)
                   (:full-name root))
                 (tru "where {0}" (humanize-filter-value root cell-query))]))

(defn- key-in?
  "Recursively finds key in coll, returns true or false"
  [coll k]
  (boolean (let [coll-zip (zip/zipper coll? #(if (map? %) (vals %) %) nil coll)]
             (loop [x coll-zip]
               (when-not (zip/end? x)
                 (if (k (zip/node x)) true (recur (zip/next x))))))))

(defn- splice-in
  [join-statement card-member]
  (let [query (get-in card-member [:card :dataset_query :query])]
    (if (key-in? query :join-alias)
      ;; Always in the top level even if the join-alias is found deep in there
      (assoc-in card-member [:card :dataset_query :query :joins] join-statement)
      card-member)))

(defn- maybe-enrich-joins
  "Hack to shove back in joins when they get automagically stripped out by the question decomposition into metrics"
  [entity dashboard]
  (if-let [join-statement (get-in entity [:dataset_query :query :joins])]
    (update dashboard :ordered_cards #(map (partial splice-in join-statement) %))
    dashboard))

(defn- query-based-analysis
  [root opts {:keys [cell-query cell-url]}]
  (letfn [(make-transient [{:keys [entity] :as root}]
            (if (table-like? entity)
              (let [root' (merge root
                                 (when cell-query
                                   {:url          cell-url
                                    :entity       (:source root)
                                    :dashboard-templates-prefix ["table"]})
                                 opts)]
                (automagic-dashboard root'))
              (let [opts (assoc opts :show :all)
                    root' (merge root
                                 (when cell-query
                                   {:url cell-url})
                                 opts)
                    base-dash (automagic-dashboard root')
                    dash      (reduce populate/merge-dashboards
                                      base-dash
                                      (decompose-question root entity opts))]
                (merge dash
                       (when cell-query
                         (let [title (tru "A closer look at {0}" (cell-title root cell-query))]
                           {:transient_name title
                            :name           title}))))))]
    (let [transient-dash (make-transient root)]
      (maybe-enrich-joins (:entity root) transient-dash))))

(defmethod automagic-analysis Card
  [card {:keys [cell-query] :as opts}]
  (let [root     (->root card)
        cell-url (format "%squestion/%s/cell/%s" public-endpoint
                         (u/the-id card)
                         (encode-base64-json cell-query))]
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
                           (encode-base64-json (:dataset_query query))
                           (encode-base64-json cell-query))]
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
