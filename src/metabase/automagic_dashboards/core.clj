(ns metabase.automagic-dashboards.core
  "Automatically generate questions and dashboards based on predefined
   heuristics."
  (:require [buddy.core.codecs :as codecs]
            [cheshire.core :as json]
            [clojure
             [string :as str]
             [walk :as walk]]
            [clojure.math.combinatorics :as combo]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [kixi.stats
             [core :as stats]
             [math :as math]]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [related :as related]
             [util :as u]]
            [metabase.automagic-dashboards
             [filters :as filters]
             [populate :as populate]
             [rules :as rules]
             [visualization-macros :as visualization]]
            [metabase.mbql
             [normalize :as normalize]
             [util :as mbql.u]]
            [metabase.models
             [card :as card :refer [Card]]
             [database :refer [Database]]
             [field :as field :refer [Field]]
             [interface :as mi]
             [metric :as metric :refer [Metric]]
             [query :refer [Query]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.query-processor.util :as qp.util]
            [metabase.sync.analyze.classify :as classify]
            [metabase.util
             [date-2 :as u.date]
             [i18n :as ui18n :refer [deferred-tru trs tru]]]
            [ring.util.codec :as codec]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private public-endpoint "/auto/dashboard/")

(def ^:private ^{:arglists '([field])} id-or-name
  (some-fn :id :name))

(defn ->field
  "Return `Field` instance for a given ID or name in the context of root."
  [root id-or-name]
  (let [id-or-name (if (sequential? id-or-name)
                     (filters/field-reference->id id-or-name)
                     id-or-name)]
    (if (->> root :source (instance? (type Table)))
      (Field id-or-name)
      (when-let [field (->> root
                            :source
                            :result_metadata
                            (m/find-first (comp #{id-or-name} :name)))]
        (-> field
            (update :base_type keyword)
            (update :special_type keyword)
            field/map->FieldInstance
            (classify/run-classifiers {}))))))

(def ^{:arglists '([root])} source-name
  "Return the (display) name of the soruce of a given root object."
  (comp (some-fn :display_name :name) :source))

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
    (saved-metric? metric)                (-> args first Metric :name)
    :else                                 (second args)))

(defn metric-op
  "Return the name op of the metric"
  [[op & args :as metric]]
  (if (saved-metric? metric)
    (-> args first Metric (get-in [:definition :aggregation 0 0]))
    op))

(defn- join-enumeration
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
  ^{:doc ""
    :arglists '([entity])}
  ->root type)

(defmethod ->root (type Table)
  [table]
  {:entity       table
   :full-name    (if (ga-table? table)
                   (:display_name table)
                   (tru "{0} table" (:display_name table)))
   :short-name   (:display_name table)
   :source       table
   :database     (:db_id table)
   :url          (format "%stable/%s" public-endpoint (u/get-id table))
   :rules-prefix ["table"]})

(defmethod ->root (type Segment)
  [segment]
  (let [table (-> segment :table_id Table)]
    {:entity          segment
     :full-name       (tru "{0} in the {1} segment" (:display_name table) (:name segment))
     :short-name      (:display_name table)
     :comparison-name (tru "{0} segment" (:name segment))
     :source          table
     :database        (:db_id table)
     :query-filter    [:segment (u/get-id segment)]
     :url             (format "%ssegment/%s" public-endpoint (u/get-id segment))
     :rules-prefix    ["table"]}))

(defmethod ->root (type Metric)
  [metric]
  (let [table (-> metric :table_id Table)]
    {:entity       metric
     :full-name    (if (:id metric)
                     (tru "{0} metric" (:name metric))
                     (:name metric))
     :short-name   (:name metric)
     :source       table
     :database     (:db_id table)
     ;; We use :id here as it might not be a concrete field but rather one from a nested query which
     ;; does not have an ID.
     :url          (format "%smetric/%s" public-endpoint (:id metric))
     :rules-prefix ["metric"]}))

(defmethod ->root (type Field)
  [field]
  (let [table (field/table field)]
    {:entity       field
     :full-name    (tru "{0} field" (:display_name field))
     :short-name   (:display_name field)
     :source       table
     :database     (:db_id table)
     ;; We use :id here as it might not be a concrete metric but rather one from a nested query
     ;; which does not have an ID.
     :url          (format "%sfield/%s" public-endpoint (:id field))
     :rules-prefix ["field"]}))

(def ^:private ^{:arglists '([card-or-question])} nested-query?
  (comp qp.util/query->source-card-id :dataset_query))

(def ^:private ^{:arglists '([card-or-question])} native-query?
  (comp #{:native} qp.util/normalize-token #(get-in % [:dataset_query :type])))

(def ^:private ^{:arglists '([card-or-question])} source-question
  (comp Card qp.util/query->source-card-id :dataset_query))

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
    (nested-query? card) (-> card
                             source-question
                             (assoc :entity_type :entity/GenericTable))
    (native-query? card) (-> card (assoc :entity_type :entity/GenericTable))
    :else                (-> card table-id Table)))

(defmethod ->root (type Card)
  [card]
  (let [source (source card)]
    {:entity       card
     :source       source
     :database     (:database_id card)
     :query-filter (get-in card [:dataset_query :query :filter])
     :full-name    (tru "\"{0}\" question" (:name card))
     :short-name   (source-name {:source source})
     :url          (format "%squestion/%s" public-endpoint (u/get-id card))
     :rules-prefix [(if (table-like? card)
                      "table"
                      "question")]}))

(defmethod ->root (type Query)
  [query]
  (let [source (source query)]
    {:entity       query
     :source       source
     :database     (:database-id query)
     :query-filter (get-in query [:dataset_query :query :filter])
     :full-name    (cond
                     (native-query? query) (tru "Native query")
                     (table-like? query)   (-> source ->root :full-name)
                     :else                 (question-description {:source source} query))
     :short-name   (source-name {:source source})
     :url          (format "%sadhoc/%s" public-endpoint (encode-base64-json (:dataset_query query)))
     :rules-prefix [(if (table-like? query)
                      "table"
                      "question")]}))

(defmulti
  ^{:doc "Get a reference for a given model to be injected into a template
          (either MBQL, native query, or string)."
    :arglists '([template-type model])
    :private true}
  ->reference (fn [template-type model]
                [template-type (type model)]))

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
        (t/hours 3)  :minute
        (t/days 7)   :hour
        (t/months 6) :day
        (t/years 10) :month
        :year)
      :day)))

(defmethod ->reference [:mbql (type Field)]
  [_ {:keys [fk_target_field_id id link aggregation name base_type] :as field}]
  (let [reference (cond
                    link               [:fk-> link id]
                    fk_target_field_id [:fk-> id fk_target_field_id]
                    id                 [:field-id id]
                    :else              [:field-literal name base_type])]
    (cond
      (isa? base_type :type/Temporal)
      [:datetime-field reference (or aggregation
                                     (optimal-datetime-resolution field))]

      (and aggregation
           (isa? base_type :type/Number))
      [:binning-strategy reference aggregation]

      :else
      reference)))

(defmethod ->reference [:string (type Field)]
  [_ {:keys [display_name full-name link table_id]}]
  (cond
    full-name full-name
    link      (format "%s → %s"
                      (-> link Field :display_name (str/replace #"(?i)\sid$" ""))
                      display_name)
    :else     display_name))

(defmethod ->reference [:string (type Table)]
  [_ {:keys [display_name full-name]}]
  (or full-name display_name))

(defmethod ->reference [:string (type Metric)]
  [_ {:keys [name full-name]}]
  (or full-name name))

(defmethod ->reference [:mbql (type Metric)]
  [_ {:keys [id definition]}]
  (if id
    [:metric id]
    (-> definition :aggregation first)))

(defmethod ->reference [:native (type Field)]
  [_ field]
  (field/qualified-name field))

(defmethod ->reference [:native (type Table)]
  [_ {:keys [name]}]
  name)

(defmethod ->reference :default
  [_ form]
  (or (cond-> form
        (map? form) ((some-fn :full-name :name) form))
      form))

(defn- field-isa?
  [{:keys [base_type special_type]} t]
  (or (isa? (keyword special_type) t)
      (isa? (keyword base_type) t)))

(defn- key-col?
  "Workaround for our leaky type system which conflates types with properties."
  [{:keys [base_type special_type name]}]
  (and (isa? base_type :type/Number)
       (or (#{:type/PK :type/FK} special_type)
           (let [name (str/lower-case name)]
             (or (= name "id")
                 (str/starts-with? name "id_")
                 (str/ends-with? name "_id"))))))

(def ^:private field-filters
  {:fieldspec       (fn [fieldspec]
                      (if (and (string? fieldspec)
                               (rules/ga-dimension? fieldspec))
                        (comp #{fieldspec} :name)
                        (fn [{:keys [special_type target] :as field}]
                          (cond
                            ;; This case is mostly relevant for native queries
                            (#{:type/PK :type/FK} fieldspec)
                            (isa? special_type fieldspec)

                            target
                            (recur target)

                            :else
                            (and (not (key-col? field))
                                 (field-isa? field fieldspec))))))
   :named           (fn [name-pattern]
                      (comp (->> name-pattern
                                 str/lower-case
                                 re-pattern
                                 (partial re-find))
                            str/lower-case
                            :name))
   :max-cardinality (fn [cardinality]
                      (fn [field]
                        (some-> field
                                (get-in [:fingerprint :global :distinct-count])
                                (<= cardinality))))})

(defn- filter-fields
  "Find all fields belonging to table `table` for which all predicates in
   `preds` are true."
  [preds fields]
  (filter (->> preds
               (keep (fn [[k v]]
                       (when-let [pred (field-filters k)]
                         (some-> v pred))))
               (apply every-pred))
          fields))

(defn- filter-tables
  [tablespec tables]
  (filter #(-> % :entity_type (isa? tablespec)) tables))

(defn- fill-templates
  [template-type {:keys [root tables]} bindings s]
  (let [bindings (some-fn (merge {"this" (-> root
                                             :entity
                                             (assoc :full-name (:full-name root)))}
                                 bindings)
                          (comp first #(filter-tables % tables) rules/->entity)
                          identity)]
    (str/replace s #"\[\[(\w+)(?:\.([\w\-]+))?\]\]"
                 (fn [[_ identifier attribute]]
                   (let [entity    (bindings identifier)
                         attribute (some-> attribute qp.util/normalize-token)]
                     (str (or (and (ifn? entity) (entity attribute))
                              (root attribute)
                              (->reference template-type entity))))))))

(defn- field-candidates
  [context {:keys [field_type links_to named max_cardinality] :as constraints}]
  (if links_to
    (filter (comp (->> (filter-tables links_to (:tables context))
                       (keep :link)
                       set)
                  u/get-id)
            (field-candidates context (dissoc constraints :links_to)))
    (let [[tablespec fieldspec] field_type]
      (if fieldspec
        (mapcat (fn [table]
                  (some->> table
                           :fields
                           (filter-fields {:fieldspec       fieldspec
                                           :named           named
                                           :max-cardinality max_cardinality})
                           (map #(assoc % :link (:link table)))))
                (filter-tables tablespec (:tables context)))
        (filter-fields {:fieldspec       tablespec
                        :named           named
                        :max-cardinality max_cardinality}
                       (-> context :source :fields))))))

(defn- make-binding
  [context [identifier definition]]
  (->> definition
       (field-candidates context)
       (map #(->> (merge % definition)
                  vector ; we wrap these in a vector to make merging easier (see `bind-dimensions`)
                  (assoc definition :matches)
                  (hash-map (name identifier))))))

(def ^:private ^{:arglists '([definitions])} most-specific-definition
  "Return the most specific defintion among `definitions`.
   Specificity is determined based on:
   1) how many ancestors `field_type` has (if field_type has a table prefix,
      ancestors for both table and field are counted);
   2) if there is a tie, how many additional filters (`named`, `max_cardinality`,
      `links_to`, ...) are used;
   3) if there is still a tie, `score`."
  (comp last (partial sort-by (comp (fn [[_ definition]]
                                      [(transduce (map (comp count ancestors))
                                                  +
                                                  (:field_type definition))
                                       (count definition)
                                       (:score definition)])
                                    first))))

(defn- bind-dimensions
  "Bind fields to dimensions and resolve overloading.
   Each field will be bound to only one dimension. If multiple dimension definitions
   match a single field, the field is bound to the most specific definition used
   (see `most-specific-defintion` for details)."
  [context dimensions]
  (->> dimensions
       (mapcat (comp (partial make-binding context) first))
       (group-by (comp id-or-name first :matches val first))
       (map (comp most-specific-definition val))
       (apply merge-with (fn [a b]
                           (case (compare (:score a) (:score b))
                             1  a
                             0  (update a :matches concat (:matches b))
                             -1 b))
              {})))

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

(defn- build-query
  ([context bindings filters metrics dimensions limit order_by]
   (walk/postwalk
    (fn [subform]
      (if (rules/dimension-form? subform)
        (let [[_ identifier opts] subform]
          (->reference :mbql (-> identifier bindings (merge opts))))
        subform))
    {:type     :query
     :database (-> context :root :database)
     :query    (cond-> {:source-table (if (->> context :source (instance? (type Table)))
                                        (-> context :source u/get-id)
                                        (->> context :source u/get-id (str "card__")))}
                 (seq filters)
                 (assoc :filter (apply
                                 vector
                                 :and
                                 (map (comp (partial normalize/normalize-fragment [:query :filter])
                                            :filter)
                                      filters)))

                 (seq dimensions)
                 (assoc :breakout dimensions)

                 (seq metrics)
                 (assoc :aggregation (map :metric metrics))

                 limit
                 (assoc :limit limit)

                 (seq order_by)
                 (assoc :order-by order_by))}))
  ([context bindings query]
   {:type     :native
    :native   {:query (fill-templates :native context bindings query)}
    :database (-> context :root :database)}))

(defn- has-matches?
  [dimensions definition]
  (->> definition
       rules/collect-dimensions
       (every? (partial get dimensions))))

(defn- resolve-overloading
  "Find the overloaded definition with the highest `score` for which all referenced dimensions have at least one
  matching field."
  [{:keys [dimensions]} definitions]
  (apply merge-with (fn [a b]
                      (case (map (partial has-matches? dimensions) [a b])
                        [true false] a
                        [false true] b
                        (max-key :score a b)))
         definitions))

(defn- instantate-visualization
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
    (str (str/upper-case (subs s 0 1)) (subs s 1))))

(defn- instantiate-metadata
  [x context bindings]
  (-> (walk/postwalk
       (fn [form]
         (if (ui18n/localized-string? form)
           (let [s     (str form)
                 new-s (fill-templates :string context bindings s)]
             (if (not= new-s s)
               (capitalize-first new-s)
               s))
           form))
       x)
      (m/update-existing :visualization #(instantate-visualization % bindings (:metrics context)))))

(defn- valid-breakout-dimension?
  [{:keys [base_type engine fingerprint aggregation]}]
  (or (nil? aggregation)
      (not (isa? base_type :type/Number))
      (and (driver/supports? engine :binning)
           (-> fingerprint :type :type/Number :min))))

(defn- singular-cell-dimensions
  [root]
  (letfn [(collect-dimensions [[op & args]]
            (case (some-> op qp.util/normalize-token)
              :and (mapcat collect-dimensions args)
              :=   (filters/collect-field-references args)
              nil))]
    (->> root
         :cell-query
         collect-dimensions
         (map filters/field-reference->id)
         set)))

(defn- card-candidates
  "Generate all potential cards given a card definition and bindings for
   dimensions, metrics, and filters."
  [context {:keys [metrics filters dimensions score limit query] :as card}]
  (let [metrics         (map (partial get (:metrics context)) metrics)
        filters         (cond-> (map (partial get (:filters context)) filters)
                          (:query-filter context) (conj {:filter (:query-filter context)}))
        score           (if query
                          score
                          (* (or (->> dimensions
                                      (map (partial get (:dimensions context)))
                                      (concat filters metrics)
                                      (transduce (keep :score) stats/mean))
                                 rules/max-score)
                             (/ score rules/max-score)))
        dimensions      (map (comp (partial into [:dimension]) first) dimensions)
        used-dimensions (rules/collect-dimensions [dimensions metrics filters query])
        cell-dimension? (->> context :root singular-cell-dimensions)]
    (->> used-dimensions
         (map (some-fn #(get-in (:dimensions context) [% :matches])
                       (comp #(filter-tables % (:tables context)) rules/->entity)))
         (apply combo/cartesian-product)
         (map (partial zipmap used-dimensions))
         (filter (fn [bindings]
                   (->> dimensions
                        (map (fn [[_ identifier opts]]
                               (merge (bindings identifier) opts)))
                        (every? (every-pred valid-breakout-dimension?
                                            (complement (comp cell-dimension? id-or-name)))))))
         (map (fn [bindings]
                (let [metrics (for [metric metrics]
                                {:name   ((some-fn :name (comp metric-name :metric)) metric)
                                 :metric (:metric metric)
                                 :op     (-> metric :metric metric-op)})
                      card    (visualization/expand-visualization
                               card
                               (map (comp bindings second) dimensions)
                               metrics)
                      query   (if query
                                (build-query context bindings query)
                                (build-query context bindings
                                             filters
                                             metrics
                                             dimensions
                                             limit
                                             (build-order-by card)))]
                  (-> card
                      (instantiate-metadata context (->> metrics
                                                         (map :name)
                                                         (zipmap (:metrics card))
                                                         (merge bindings)))
                      (assoc :dataset_query query
                             :metrics       metrics
                             :dimensions    (map (comp :name bindings second) dimensions)
                             :score         score))))))))

(defn- matching-rules
  "Return matching rules orderd by specificity.
   Most specific is defined as entity type specification the longest ancestor
   chain."
  [rules {:keys [source entity]}]
  (let [table-type (or (:entity_type source) :entity/GenericTable)]
    (->> rules
         (filter (fn [{:keys [applies_to]}]
                   (let [[entity-type field-type] applies_to]
                     (and (isa? table-type entity-type)
                          (or (nil? field-type)
                              (field-isa? entity field-type))))))
         (sort-by :specificity >))))

(defn- linked-tables
  "Return all tables accessable from a given table with the paths to get there.
   If there are multiple FKs pointing to the same table, multiple entries will
   be returned."
  [table]
  (for [{:keys [id target]} (field/with-targets
                              (db/select Field
                                :table_id           (u/get-id table)
                                :fk_target_field_id [:not= nil]
                                :active             true))
        :when (some-> target mi/can-read?)]
    (-> target field/table (assoc :link id))))

(def ^:private ^{:arglists '([source])} source->engine
  (comp :engine Database (some-fn :db_id :database_id)))

(defmulti
  ^{:private  true
    :arglists '([context entity])}
  inject-root (fn [_ entity] (type entity)))

(defmethod inject-root (type Field)
  [context field]
  (let [field (assoc field
                :link   (->> context
                             :tables
                             (m/find-first (comp #{(:table_id field)} u/get-id))
                             :link)
                :engine (-> context :source source->engine))]
    (update context :dimensions
            (fn [dimensions]
              (->> dimensions
                   (keep (fn [[identifier definition]]
                           (when-let [matches (->> definition
                                                   :matches
                                                   (remove (comp #{(id-or-name field)} id-or-name))
                                                   not-empty)]
                             [identifier (assoc definition :matches matches)])))
                   (concat [["this" {:matches [field]
                                     :name    (:display_name field)
                                     :score   rules/max-score}]])
                   (into {}))))))

(defmethod inject-root (type Metric)
  [context metric]
  (update context :metrics assoc "this" {:metric (->reference :mbql metric)
                                         :name   (:name metric)
                                         :score  rules/max-score}))

(defmethod inject-root :default
  [context _]
  context)

(s/defn ^:private make-context
  [root, rule :- rules/Rule]
  {:pre [(:source root)]}
  (let [source        (:source root)
        tables        (concat [source] (when (instance? (type Table) source)
                                         (linked-tables source)))
        engine        (source->engine source)
        table->fields (if (instance? (type Table) source)
                        (comp (->> (db/select Field
                                     :table_id        [:in (map u/get-id tables)]
                                     :visibility_type "normal"
                                     :preview_display true
                                     :active          true)
                                   field/with-targets
                                   (map #(assoc % :engine engine))
                                   (group-by :table_id))
                              u/get-id)
                        (->> source
                             :result_metadata
                             (map (fn [field]
                                    (-> field
                                        (update :base_type keyword)
                                        (update :special_type keyword)
                                        field/map->FieldInstance
                                        (classify/run-classifiers {})
                                        (assoc :engine engine))))
                             constantly))]
    (as-> {:source       (assoc source :fields (table->fields source))
           :root         root
           :tables       (map #(assoc % :fields (table->fields %)) tables)
           :query-filter (filters/inject-refinement (:query-filter root)
                                                    (:cell-query root))} context
      (assoc context :dimensions (bind-dimensions context (:dimensions rule)))
      (assoc context :metrics (resolve-overloading context (:metrics rule)))
      (assoc context :filters (resolve-overloading context (:filters rule)))
      (inject-root context (:entity root)))))

(defn- make-cards
  [context {:keys [cards]}]
  (some->> cards
           (map first)
           (map-indexed (fn [position [identifier card]]
                          (some->> (assoc card :position position)
                                   (card-candidates context)
                                   not-empty
                                   (hash-map (name identifier)))))
           (apply merge-with (partial max-key (comp :score first)) {})
           vals
           (apply concat)))

(defn- make-dashboard
  ([root rule]
   (make-dashboard root rule {:tables [(:source root)]
                              :root   root}))
  ([root rule context]
   (-> rule
       (select-keys [:title :description :transient_title :groups])
       (cond->
         (:comparison? root)
         (update :groups (partial m/map-vals (fn [{:keys [title comparison_title] :as group}]
                                               (assoc group :title (or comparison_title title))))))
       (instantiate-metadata context {}))))

(s/defn ^:private apply-rule
  [root, rule :- rules/Rule]
  (let [context   (make-context root rule)
        dashboard (make-dashboard root rule context)
        filters   (->> rule
                       :dashboard_filters
                       (mapcat (comp :matches (:dimensions context)))
                       (remove (comp (singular-cell-dimensions root) id-or-name)))
        cards     (make-cards context rule)]
    (when (or (not-empty cards)
              (-> rule :cards nil?))
      [(assoc dashboard
         :filters filters
         :cards   cards)
       rule
       context])))

(def ^:private ^:const ^Long max-related 8)
(def ^:private ^:const ^Long max-cards 15)

(defn ->related-entity
  "Turn `entity` into an entry in `:related.`"
  [entity]
  (let [root      (->root entity)
        rule      (->> root
                       (matching-rules (rules/get-rules (:rules-prefix root)))
                       first)
        dashboard (make-dashboard root rule)]
    {:url         (:url root)
     :title       (:full-name root)
     :description (:description dashboard)}))

(defn- related-entities
  [root]
  (-> root
      :entity
      related/related
      (update :fields (partial remove key-col?))
      (->> (m/map-vals (comp (partial map ->related-entity) u/one-or-many)))))

(s/defn ^:private indepth
  [root, rule :- (s/maybe rules/Rule)]
  (->> (rules/get-rules (concat (:rules-prefix root) [(:rule rule)]))
       (keep (fn [indepth]
               (when-let [[dashboard _ _] (apply-rule root indepth)]
                 {:title       ((some-fn :short-title :title) dashboard)
                  :description (:description dashboard)
                  :url         (format "%s/rule/%s/%s" (:url root) (:rule rule) (:rule indepth))})))
       (hash-map :indepth)))

(defn- drilldown-fields
  [context]
  (when (and (->> context :root :source (instance? (type Table)))
             (-> context :root :entity ga-table? not))
    (->> context
         :dimensions
         vals
         (mapcat :matches)
         filters/interesting-fields
         (map ->related-entity)
         (hash-map :drilldown-fields))))

(defn- comparisons
  [root]
  {:compare (concat
             (for [segment (->> root :entity related/related :segments (map ->root))]
               {:url         (str (:url root) "/compare/segment/" (-> segment :entity u/get-id))
                :title       (tru "Compare with {0}" (:comparison-name segment))
                :description ""})
             (when ((some-fn :query-filter :cell-query) root)
               [{:url         (if (->> root :source (instance? (type Table)))
                                (str (:url root) "/compare/table/" (-> root :source u/get-id))
                                (str (:url root) "/compare/adhoc/"
                                     (encode-base64-json
                                      {:database (:database root)
                                       :type     :query
                                       :query    {:source-table (->> root
                                                                     :source
                                                                     u/get-id
                                                                     (str "card__" ))}})))
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
  {(type Table)   (let [down     [[:indepth] [:segments :metrics] [:drilldown-fields]]
                        sideways [[:linking-to :linked-from] [:tables]]
                        compare  [[:compare]]]
                    {:zoom-in [down down down down]
                     :related [sideways sideways]
                     :compare [compare compare]})
   (type Segment) (let [down     [[:indepth] [:segments :metrics] [:drilldown-fields]]
                        sideways [[:linking-to] [:tables]]
                        up       [[:table]]
                        compare  [[:compare]]]
                    {:zoom-in  [down down down]
                     :zoom-out [up]
                     :related  [sideways sideways]
                     :compare  [compare compare]})
   (type Metric)  (let [down     [[:drilldown-fields]]
                        sideways [[:metrics :segments]]
                        up       [[:table]]
                        compare  [[:compare]]]
                    {:zoom-in  [down down]
                     :zoom-out [up]
                     :related  [sideways sideways sideways]
                     :compare  [compare compare]})
   (type Field)   (let [sideways [[:fields]]
                        up       [[:table] [:metrics :segments]]
                        compare  [[:compare]]]
                    {:zoom-out [up]
                     :related  [sideways sideways]
                     :compare  [compare]})
   (type Card)    (let [down     [[:drilldown-fields]]
                        sideways [[:metrics] [:similar-questions :dashboard-mates]]
                        up       [[:table]]
                        compare  [[:compare]]]
                    {:zoom-in  [down down]
                     :zoom-out [up]
                     :related  [sideways sideways sideways]
                     :compare  [compare compare]})
   (type Query)   (let [down     [[:drilldown-fields]]
                        sideways [[:metrics] [:similar-questions]]
                        up       [[:table]]
                        compare  [[:compare]]]
                    {:zoom-in  [down down]
                     :zoom-out [up]
                     :related  [sideways sideways sideways]
                     :compare  [compare compare]})})

(s/defn ^:private related
  "Build a balanced list of related X-rays. General composition of the list is determined for each
   root type individually via `related-selectors`. That recepie is then filled round-robin style."
  [{:keys [root] :as context}, rule :- (s/maybe rules/Rule)]
  (->> (merge (indepth root rule)
              (drilldown-fields context)
              (related-entities root)
              (comparisons root))
       (fill-related max-related (related-selectors (-> root :entity type)))))

(defn- filter-referenced-fields
  "Return a map of fields referenced in filter cluase."
  [root filter-clause]
  (->> filter-clause
       filters/collect-field-references
       (mapcat (fn [[_ & ids]]
                 (for [id ids]
                   [id (->field root id)])))
       (remove (comp nil? second))
       (into {})))

(defn- automagic-dashboard
  "Create dashboards for table `root` using the best matching heuristics."
  [{:keys [rule show rules-prefix full-name] :as root}]
  (if-let [[dashboard rule context] (if rule
                                      (apply-rule root (rules/get-rule rule))
                                      (->> root
                                           (matching-rules (rules/get-rules rules-prefix))
                                           (keep (partial apply-rule root))
                                           ;; `matching-rules` returns an `ArraySeq` (via `sort-by`)
                                           ;; so `first` realises one element at a time
                                           ;; (no chunking).
                                           first))]
    (let [show (or show max-cards)]
      (log/info (trs "Applying heuristic {0} to {1}." (:rule rule) full-name))
      (log/info (trs "Dimensions bindings:\n{0}"
                      (->> context
                           :dimensions
                           (m/map-vals #(update % :matches (partial map :name)))
                           u/pprint-to-str)))
      (log/info (trs "Using definitions:\nMetrics:\n{0}\nFilters:\n{1}"
                     (->> context :metrics (m/map-vals :metric) u/pprint-to-str)
                     (-> context :filters u/pprint-to-str)))
      (-> dashboard
          (populate/create-dashboard show)
          (assoc :related           (related context rule)
                 :more              (when (and (not= show :all)
                                               (-> dashboard :cards count (> show)))
                                      (format "%s#show=all" (:url root)))
                 :transient_filters (:query-filter context)
                 :param_fields      (->> context :query-filter (filter-referenced-fields root)))))
    (throw (ex-info (trs "Can''t create dashboard for {0}" full-name)
             {:root            root
              :available-rules (map :rule (or (some-> rule rules/get-rule vector)
                                              (rules/get-rules rules-prefix)))}))))

(defmulti
  ^{:doc "Create a transient dashboard analyzing given entity."
    :arglists '([entity opts])}
  automagic-analysis (fn [entity _]
                       (type entity)))

(defmethod automagic-analysis (type Table)
  [table opts]
  (automagic-dashboard (merge (->root table) opts)))

(defmethod automagic-analysis (type Segment)
  [segment opts]
  (automagic-dashboard (merge (->root segment) opts)))

(defmethod automagic-analysis (type Metric)
  [metric opts]
  (automagic-dashboard (merge (->root metric) opts)))

(defn- collect-metrics
  [root question]
  (map (fn [aggregation-clause]
         (if (-> aggregation-clause
                 first
                 qp.util/normalize-token
                 (= :metric))
           (-> aggregation-clause second Metric)
           (let [table-id (table-id question)]
             (metric/map->MetricInstance {:definition {:aggregation  [aggregation-clause]
                                                       :source-table table-id}
                                          :name       (metric->description root aggregation-clause)
                                          :table_id   table-id}))))
       (get-in question [:dataset_query :query :aggregation])))

(defn- collect-breakout-fields
  [root question]
  (map (comp (partial ->field root)
             first
             filters/collect-field-references)
       (get-in question [:dataset_query :query :breakout])))

(defn- decompose-question
  [root question opts]
  (map #(automagic-analysis % (assoc opts
                                :source       (:source root)
                                :query-filter (:query-filter root)
                                :database     (:database root)))
       (concat (collect-metrics root question)
               (collect-breakout-fields root question))))

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
  (cond-> (->> field-reference
               filters/collect-field-references
               first
               (->field root))
    (-> field-reference first qp.util/normalize-token (= :datetime-field))
    (assoc :unit (-> field-reference last qp.util/normalize-token))))

(defmulti
  ^{:private true
    :arglists '([fieldset [op & args]])}
  humanize-filter-value (fn [_ [op & args]]
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
  ([{:keys [display_name unit] :as field}]
   (cond->> display_name
     (some-> unit u.date/extract-units) (tru "{0} of {1}" (unit-name unit)))))

(defmethod humanize-filter-value :=
  [root [_ field-reference value]]
  (let [field      (field-reference->field root field-reference)
        field-name (field-name field)]
    (if (or (isa? (:base_type field) :type/Temporal)
            (field/unix-timestamp? field))
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

(defmethod automagic-analysis (type Card)
  [card {:keys [cell-query] :as opts}]
  (let [root     (->root card)
        cell-url (format "%squestion/%s/cell/%s" public-endpoint
                         (u/get-id card)
                         (encode-base64-json cell-query))]
    (if (table-like? card)
      (automagic-dashboard
       (merge (cond-> root
                cell-query (merge {:url          cell-url
                                   :entity       (:source root)
                                   :rules-prefix ["table"]}))
              opts))
      (let [opts (assoc opts :show :all)]
        (cond-> (reduce populate/merge-dashboards
                        (automagic-dashboard (merge (cond-> root
                                                      cell-query (assoc :url cell-url))
                                                    opts))
                        (decompose-question root card opts))
          cell-query (merge (let [title (tru "A closer look at {0}" (cell-title root cell-query))]
                              {:transient_name  title
                               :name            title})))))))

(defmethod automagic-analysis (type Query)
  [query {:keys [cell-query] :as opts}]
  (let [root     (->root query)
        cell-url (format "%sadhoc/%s/cell/%s" public-endpoint
                         (encode-base64-json (:dataset_query query))
                         (encode-base64-json cell-query))]
    (if (table-like? query)
      (automagic-dashboard
       (merge (cond-> root
                cell-query (merge {:url          cell-url
                                   :entity       (:source root)
                                   :rules-prefix ["table"]}))
              opts))
      (let [opts (assoc opts :show :all)]
        (cond-> (reduce populate/merge-dashboards
                        (automagic-dashboard (merge (cond-> root
                                                      cell-query (assoc :url cell-url))
                                                    opts))
                       (decompose-question root query opts))
          cell-query (merge (let [title (tru "A closer look at the {0}" (cell-title root cell-query))]
                              {:transient_name  title
                               :name            title})))))))

(defmethod automagic-analysis (type Field)
  [field opts]
  (automagic-dashboard (merge (->root field) opts)))

(defn- enhance-table-stats
  [tables]
  (when (not-empty tables)
    (let [field-count (->> (db/query {:select   [:table_id [:%count.* "count"]]
                                      :from     [Field]
                                      :where    [:and [:in :table_id (map u/get-id tables)]
                                                 [:= :active true]]
                                      :group-by [:table_id]})
                           (into {} (map (juxt :table_id :count))))
          list-like?  (->> (when-let [candidates (->> field-count
                                                      (filter (comp (partial >= 2) val))
                                                      (map key)
                                                      not-empty)]
                             (db/query {:select   [:table_id]
                                        :from     [Field]
                                        :where    [:and [:in :table_id candidates]
                                                   [:= :active true]
                                                   [:or [:not= :special_type "type/PK"]
                                                    [:= :special_type nil]]]
                                        :group-by [:table_id]
                                        :having   [:= :%count.* 1]}))
                           (into #{} (map :table_id)))
          ;; Table comprised entierly of join keys
          link-table? (when (seq field-count)
                        (->> (db/query {:select   [:table_id [:%count.* "count"]]
                                        :from     [Field]
                                        :where    [:and [:in :table_id (keys field-count)]
                                                   [:= :active true]
                                                   [:in :special_type ["type/PK" "type/FK"]]]
                                        :group-by [:table_id]})
                             (filter (fn [{:keys [table_id count]}]
                                       (= count (field-count table_id))))
                             (into #{} (map :table_id))))]
      (for [table tables]
        (let [table-id (u/get-id table)]
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

   Tables are ranked based on how specific rule has been used, and the number of
   fields.
   Schemes are ranked based on the number of distinct entity types and the
   interestingness of tables they contain (see above)."
  ([database] (candidate-tables database nil))
  ([database schema]
   (let [rules (rules/get-rules ["table"])]
     (->> (apply db/select [Table :id :schema :display_name :entity_type :db_id]
                 (cond-> [:db_id           (u/get-id database)
                          :visibility_type nil
                          :active          true]
                   schema (concat [:schema schema])))
          (filter mi/can-read?)
          enhance-table-stats
          (remove (comp (some-fn :link-table? (comp zero? :num-fields)) :stats))
          (map (fn [table]
                 (let [root      (->root table)
                       rule      (->> root
                                      (matching-rules rules)
                                      first)
                       dashboard (make-dashboard root rule)]
                   {:url         (format "%stable/%s" public-endpoint (u/get-id table))
                    :title       (:full-name root)
                    :score       (+ (math/sq (:specificity rule))
                                    (math/log (-> table :stats :num-fields))
                                    (if (-> table :stats :list-like?)
                                      -10
                                      0))
                    :description (:description dashboard)
                    :table       table
                    :rule        (:rule rule)})))
          (group-by (comp :schema :table))
          (map (fn [[schema tables]]
                 (let [tables (->> tables
                                   (sort-by :score >)
                                   (take max-candidate-tables))]
                   {:tables tables
                    :schema schema
                    :score  (+ (math/sq (transduce (m/distinct-by :rule)
                                                   stats/count
                                                   tables))
                               (math/sqrt (transduce (map (comp math/sq :score))
                                                     stats/mean
                                                     tables)))})))
          (sort-by :score >)))))
