(ns metabase.automagic-dashboards.core
  "Automatically generate questions and dashboards based on predefined
   heuristics."
  (:require [buddy.core.codecs :as codecs]
            [cheshire.core :as json]
            [clj-time
             [core :as t]
             [format :as t.format]]
            [clojure.math.combinatorics :as combo]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [kixi.stats
             [core :as stats]
             [math :as math]]
            [medley.core :as m]
            [metabase.automagic-dashboards
             [filters :as filters]
             [populate :as populate]
             [rules :as rules]]
            [metabase.models
             [card :as card :refer [Card]]
             [database :refer [Database]]
             [field :refer [Field] :as field]
             [interface :as mi]
             [metric :refer [Metric] :as metric]
             [query :refer [Query]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.query-processor.middleware.expand-macros :refer [merge-filter-clauses]]
            [metabase.query-processor.util :as qp.util]
            [metabase.related :as related]
            [metabase.sync.analyze.classify :as classify]
            [metabase.util :as u]
            [puppetlabs.i18n.core :as i18n :refer [tru trs]]
            [ring.util.codec :as codec]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private public-endpoint "/auto/dashboard/")

(def ^:private ^{:arglists '([field])} id-or-name
  (some-fn :id :name))

(defn- ->field
  [root id-or-name]
  (if (->> root :source (instance? (type Table)))
    (Field id-or-name)
    (let [field (->> root
                     :source
                     :result_metadata
                     (some (comp #{id-or-name} :name)))]
      (-> field
          (update :base_type keyword)
          (update :special_type keyword)
          field/map->FieldInstance
          (classify/run-classifiers {})))))

(def ^:private ^{:arglists '([root])} source-name
  (comp (some-fn :display_name :name) :source))

(def ^:private op->name
  {:sum       (tru "sum")
   :avg       (tru "average")
   :min       (tru "minumum")
   :max       (tru "maximum")
   :count     (tru "count")
   :distinct  (tru "distinct count")
   :stddev    (tru "standard deviation")
   :cum-count (tru "cumulative count")
   :cum-sum   (tru "cumulative sum")})

(defn- metric-name
  [[op arg]]
  (let [op (qp.util/normalize-token op)]
    (if (= op :metric)
      (-> arg Metric :name)
      (op->name op))))

(defn- metric->description
  [root metric]
  (tru "{0} of {1}" (metric-name metric) (or (some->> metric
                                                      second
                                                      filters/field-reference->id
                                                      (->field root)
                                                      :display_name)
                                             (source-name root))))

(defn- join-enumeration
  [xs]
  (if (next xs)
    (tru "{0} and {1}" (str/join ", " (butlast xs)) (last xs))
    (first xs)))

(defn- question-description
  [root question]
  (let [aggregations (->> (qp.util/get-in-normalized question [:dataset_query :query :aggregation])
                          (map (partial metric->description root))
                          join-enumeration)
        dimensions   (->> (qp.util/get-in-normalized question [:dataset_query :query :breakout])
                          (mapcat filters/collect-field-references)
                          (map (comp :display_name
                                     (partial ->field root)
                                     filters/field-reference->id))
                          join-enumeration)]
    (tru "{0} by {1}" aggregations dimensions)))

(def ^:private ^{:arglists '([x])} encode-base64-json
  (comp codec/base64-encode codecs/str->bytes json/encode))

(defmulti
  ^{:private  true
    :arglists '([entity])}
  ->root type)

(defmethod ->root (type Table)
  [table]
  {:entity       table
   :full-name    (if (isa? (:entity_type table) :entity/GoogleAnalyticsTable)
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
    {:entity       segment
     :full-name    (tru "{0} in {1} segment" (:display_name table) (:name segment))
     :short-name   (:display_name table)
     :source       table
     :database     (:db_id table)
     :query-filter (-> segment :definition :filter)
     :url          (format "%ssegment/%s" public-endpoint (u/get-id segment))
     :rules-prefix ["table"]}))

(defmethod ->root (type Metric)
  [metric]
  (let [table (-> metric :table_id Table)]
    {:entity       metric
     :full-name    (tru "{0} metric" (:name metric))
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
  (comp #{:native} qp.util/normalize-token #(qp.util/get-in-normalized % [:dataset_query :type])))

(def ^:private ^{:arglists '([card-or-question])} source-question
  (comp Card qp.util/query->source-card-id :dataset_query))

(defn- table-like?
  [card-or-question]
  (let [[aggregation & _] (qp.util/get-in-normalized card-or-question [:dataset_query :query :aggregation])]
    (or (nil? aggregation)
        (and (or (string? aggregation)
                 (keyword? aggregation))
             (= (qp.util/normalize-token aggregation) :rows)))))

(defn- source
  [card]
  (cond
    (nested-query? card) (-> card
                             source-question
                             (assoc :entity_type :entity/GenericTable))
    (native-query? card) (-> card (assoc :entity_type :entity/GenericTable))
    :else                (-> card ((some-fn :table_id :table-id)) Table)))

(defmethod ->root (type Card)
  [card]
  (let [source (source card)]
    {:entity       card
     :source       source
     :database     (:database_id card)
     :query-filter (qp.util/get-in-normalized card [:dataset_query :query :filter])
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
     :query-filter (qp.util/get-in-normalized query [:dataset_query :query :filter])
     :full-name    (cond
                     (native-query? query) (tru "Native query")
                     (table-like? query)   (-> source ->root :full-name)
                     :else                 (question-description {:source source} query))
     :short-name   (source-name {:source source})
     :url          (format "%sadhoc/%s" public-endpoint (encode-base64-json query))
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
  (if-let [[earliest latest] (some->> field
                                      :fingerprint
                                      :type
                                      :type/DateTime
                                      ((juxt :earliest :latest))
                                      (map t.format/parse))]
    (condp > (t/in-hours (t/interval earliest latest))
      3               :minute
      (* 24 7)        :hour
      (* 24 30 6)     :day
      (* 24 30 12 10) :month
      :year)
    :day))

(defmethod ->reference [:mbql (type Field)]
  [_ {:keys [fk_target_field_id id link aggregation fingerprint name base_type] :as field}]
  (let [reference (cond
                    link               [:fk-> link id]
                    fk_target_field_id [:fk-> id fk_target_field_id]
                    id                 [:field-id id]
                    :else              [:field-literal name base_type])]
    (cond
      (isa? base_type :type/DateTime)
      [:datetime-field reference (or aggregation
                                     (optimal-datetime-resolution field))]

      (and aggregation
           ; We don't handle binning on non-analyzed fields gracefully
           (-> fingerprint :type :type/Number :min))
      [:binning-strategy reference aggregation]

      :else
      reference)))

(defmethod ->reference [:string (type Field)]
  [_ {:keys [display_name full-name]}]
  (or full-name display_name))

(defmethod ->reference [:string (type Table)]
  [_ {:keys [display_name full-name]}]
  (or full-name display_name))

(defmethod ->reference [:string (type Metric)]
  [_ {:keys [name full-name]}]
  (or full-name name))

(defmethod ->reference [:mbql (type Metric)]
  [_ {:keys [id definition]}]
  (if id
    ["METRIC" id]
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
                     (or (and (ifn? entity) (entity attribute))
                         (root attribute)
                         (->reference template-type entity)))))))

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
  [dimensions metrics order-by]
  (let [dimensions (set dimensions)]
    (for [[identifier ordering] (map first order-by)]
      [(if (dimensions identifier)
          [:dimension identifier]
          [:aggregation (u/index-of #{identifier} metrics)])
        (if (= ordering "ascending")
          :ascending
          :descending)])))

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
     :query    (cond-> {:source_table (if (->> context :source (instance? (type Table)))
                                        (-> context :source u/get-id)
                                        (->> context :source u/get-id (str "card__")))}
                 (not-empty filters)
                 (assoc :filter (transduce (map :filter)
                                           merge-filter-clauses
                                           filters))

                 (not-empty dimensions)
                 (assoc :breakout dimensions)

                 (not-empty metrics)
                 (assoc :aggregation (map :metric metrics))

                 limit
                 (assoc :limit limit)

                 (not-empty order_by)
                 (assoc :order_by order_by))}))
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
  "Find the overloaded definition with the highest `score` for which all
   referenced dimensions have at least one matching field."
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
           (u/update-when :map.latitude_column dimension->name)
           (u/update-when :map.longitude_column dimension->name)
           (u/update-when :graph.metrics metric->name)
           (u/update-when :graph.dimensions dimension->name))]))

(defn- capitalize-first
  [s]
  (str (str/upper-case (subs s 0 1)) (subs s 1)))

(defn- instantiate-metadata
  [x context bindings]
  (-> (walk/postwalk
       (fn [form]
         (if (string? form)
           (let [new-form (fill-templates :string context bindings form)]
             (if (not= new-form form)
               (capitalize-first new-form)
               new-form))
           form))
       x)
      (u/update-when :visualization #(instantate-visualization % bindings (:metrics context)))))

(defn- valid-breakout-dimension?
  [{:keys [base_type engine]}]
  (not (and (isa? base_type :type/Number)
            (= engine :druid))))

(defn- card-candidates
  "Generate all potential cards given a card definition and bindings for
   dimensions, metrics, and filters."
  [context {:keys [metrics filters dimensions score limit order_by query] :as card}]
  (let [order_by        (build-order-by dimensions metrics order_by)
        metrics         (map (partial get (:metrics context)) metrics)
        filters         (cond-> (map (partial get (:filters context)) filters)
                          (:query-filter context)
                          (conj {:filter (:query-filter context)}))
        score           (if query
                          score
                          (* (or (->> dimensions
                                      (map (partial get (:dimensions context)))
                                      (concat filters metrics)
                                      (transduce (keep :score) stats/mean))
                                 rules/max-score)
                             (/ score rules/max-score)))
        dimensions      (map (comp (partial into [:dimension]) first) dimensions)
        used-dimensions (rules/collect-dimensions [dimensions metrics filters query])]
    (->> used-dimensions
         (map (some-fn #(get-in (:dimensions context) [% :matches])
                       (comp #(filter-tables % (:tables context)) rules/->entity)))
         (apply combo/cartesian-product)
         (filter (fn [instantiations]
                   (->> dimensions
                        (map (comp (zipmap used-dimensions instantiations) second))
                        (every? valid-breakout-dimension?))))
         (map (fn [instantiations]
                (let [bindings (zipmap used-dimensions instantiations)
                      query    (if query
                                 (build-query context bindings query)
                                 (build-query context bindings
                                              filters
                                              metrics
                                              dimensions
                                              limit
                                              order_by))]
                  (-> card
                      (instantiate-metadata context (->> metrics
                                                         (map :name)
                                                         (zipmap (:metrics card))
                                                         (merge bindings)))
                      (assoc :dataset_query query
                             :metrics       (map (some-fn :name (comp metric-name :metric)) metrics)
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
                                         :fk_target_field_id [:not= nil]))
        :when (some-> target mi/can-read?)]
    (-> target field/table (assoc :link id))))

(defmulti
  ^{:private  true
    :arglists '([context entity])}
  inject-root (fn [_ entity] (type entity)))

(defmethod inject-root (type Field)
  [context field]
  (let [field (assoc field :link (->> context
                                      :tables
                                      (m/find-first (comp #{(:table_id field)} u/get-id))
                                      :link))]
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
        engine        (-> source ((some-fn :db_id :database_id)) Database :engine)
        table->fields (if (instance? (type Table) source)
                        (comp (->> (db/select Field
                                              :table_id        [:in (map u/get-id tables)]
                                              :visibility_type "normal")
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
                                        (map #(assoc % :engine engine)))))
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
       (instantiate-metadata context {})
       (assoc :refinements (filters/inject-refinement (:query-filter root) (:cell-query root))))))

(s/defn ^:private apply-rule
  [root, rule :- rules/Rule]
  (let [context   (make-context root rule)
        dashboard (make-dashboard root rule context)
        filters   (->> rule
                       :dashboard_filters
                       (mapcat (comp :matches (:dimensions context))))
        cards     (make-cards context rule)]
    (when (or (not-empty cards)
              (-> rule :cards nil?))
      [(assoc dashboard
         :filters  filters
         :cards    cards)
       rule
       context])))

(def ^:private ^:const ^Long max-related 6)
(def ^:private ^:const ^Long max-cards 15)

(defn- ->related-entity
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
  ([root] (related-entities max-related root))
  ([n root]
   (let [recommendations     (-> root :entity related/related)
         fields-selector     (comp (partial remove key-col?) :fields)
         ;; Not everything `related/related` returns is relevent for us. Also note that the order
         ;; influences which entities get shown when results are trimmed.
         relevant-dimensions [:table :segments :metrics :linking-to :dashboard-mates
                              :similar-questions :linked-from :tables fields-selector]]
     (->> relevant-dimensions
          (reduce (fn [acc selector]
                    (concat acc (-> recommendations selector rules/ensure-seq)))
                  [])
          (take n)
          (map ->related-entity)))))

(s/defn ^:private indepth
  [root, rule :- (s/maybe rules/Rule)]
  (->> (rules/get-rules (concat (:rules-prefix root) [(:rule rule)]))
       (keep (fn [indepth]
               (when-let [[dashboard _ _] (apply-rule root indepth)]
                 {:title       ((some-fn :short-title :title) dashboard)
                  :description (:description dashboard)
                  :url         (format "%s/rule/%s/%s" (:url root) (:rule rule) (:rule indepth))})))
       (take max-related)))

(defn- drilldown-fields
  [context]
  (->> context
       :dimensions
       vals
       (mapcat :matches)
       filters/interesting-fields
       (map ->related-entity)))

(s/defn ^:private related
  [context, rule :- (s/maybe rules/Rule)]
  (let [root    (:root context)
        indepth (indepth root rule)]
    (if (not-empty indepth)
      {:indepth indepth
       :related (related-entities (- max-related (count indepth)) root)}
      (let [drilldown-fields   (drilldown-fields context)
            n-related-entities (max (math/floor (* (/ 2 3) max-related))
                                    (- max-related (count drilldown-fields)))]
        {:related          (related-entities n-related-entities root)
         :drilldown-fields (take (- max-related n-related-entities) drilldown-fields)}))))

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
    (do
      (log/infof (trs "Applying heuristic %s to %s.") (:rule rule) full-name)
      (log/infof (trs "Dimensions bindings:\n%s")
                 (->> context
                      :dimensions
                      (m/map-vals #(update % :matches (partial map :name)))
                      u/pprint-to-str))
      (log/infof (trs "Using definitions:\nMetrics:\n%s\nFilters:\n%s")
                 (-> context :metrics u/pprint-to-str)
                 (-> context :filters u/pprint-to-str))
      (-> dashboard
          (populate/create-dashboard (or show max-cards))
          (assoc :related (related context rule)
                 :more    (when (and (-> dashboard :cards count (> max-cards))
                                     (not= show :all))
                            (format "%s#show=all" (:url root))))))
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
           (let [metric (metric/map->MetricInstance
                         {:definition {:aggregation  [aggregation-clause]
                                       :source_table (:table_id question)}
                          :table_id   (:table_id question)})]
             (assoc metric :name (metric->description root aggregation-clause)))))
       (qp.util/get-in-normalized question [:dataset_query :query :aggregation])))

(defn- collect-breakout-fields
  [root question]
  (map (comp (partial ->field root)
             filters/field-reference->id
             first
             filters/collect-field-references)
       (qp.util/get-in-normalized question [:dataset_query :query :breakout])))

(defn- decompose-question
  [root question opts]
  (map #(automagic-analysis % (assoc opts
                                :source   (:source root)
                                :database (:database root)))
       (concat (collect-metrics root question)
               (collect-breakout-fields root question))))

(def ^:private date-formatter (t.format/formatter "MMMM d, YYYY"))
(def ^:private datetime-formatter (t.format/formatter "EEEE, MMMM d, YYYY h:mm a"))

(defn- humanize-datetime
  [dt]
  (t.format/unparse (if (str/index-of dt "T")
                      datetime-formatter
                      date-formatter)
                    (t.format/parse dt)))

(defn- field-reference->field
  [root field-reference]
  (cond-> (->> field-reference
               filters/collect-field-references
               first
               filters/field-reference->id
               (->field root))
    (-> field-reference first qp.util/normalize-token (= :datetime-field))
    (assoc :unit (-> field-reference last qp.util/normalize-token))))

(defmulti
  ^{:private true
    :arglists '([fieldset [op & args]])}
  humanize-filter-value (fn [_ [op & args]]
                          (qp.util/normalize-token op)))

(def ^:private unit-name (comp {:minute-of-hour  "minute of hour"
                                :hour-of-day     "hour of day"
                                :day-of-week     "day of week"
                                :day-of-month    "day of month"
                                :week-of-year    "week of year"
                                :month-of-year   "month of year"
                                :quarter-of-year "quarter of year"}
                               qp.util/normalize-token))

(defn- field-name
  ([root field-reference]
   (->> field-reference (field-reference->field root) field-name))
  ([{:keys [display_name unit] :as field}]
   (cond->> display_name
     (and (filters/periodic-datetime? field) unit) (format "%s of %s" (unit-name unit)))))

(defmethod humanize-filter-value :=
  [root [_ field-reference value]]
  (let [field      (field-reference->field root field-reference)
        field-name (field-name field)]
    (if (filters/datetime? field)
      (tru "{0} is on {1}" field-name (humanize-datetime value))
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

(defn- cell-title
  [root cell-query]
  (str/join " " [(->> (qp.util/get-in-normalized (-> root :entity) [:dataset_query :query :aggregation])
                      (map (partial metric->description root))
                      join-enumeration)
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
        (cond-> (apply populate/merge-dashboards
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
                                   :query-filter (qp.util/get-in-normalized query [:dataset_query :query :filter])
                                   :rules-prefix ["table"]}))
              opts))
      (let [opts (assoc opts :show :all)]
        (cond-> (apply populate/merge-dashboards
                       (automagic-dashboard (merge (cond-> root
                                                     cell-query (assoc :url cell-url))
                                                   opts))
                       (decompose-question root query opts))
          cell-query (merge (let [title (tru "A closer look at {0}" (cell-title root cell-query))]
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
                                      :where    [:in :table_id (map u/get-id tables)]
                                      :group-by [:table_id]})
                           (into {} (map (juxt :table_id count))))
          list-like?  (->> (when-let [candidates (->> field-count
                                                      (filter (comp (partial >= 2) val))
                                                      (map key)
                                                      not-empty)]
                             (db/query {:select   [:table_id]
                                        :from     [Field]
                                        :where    [:and [:in :table_id candidates]
                                                   [:or [:not= :special_type "type/PK"]
                                                    [:= :special_type nil]]]
                                        :group-by [:table_id]
                                        :having   [:= :%count.* 1]}))
                           (into #{} (map :table_id)))
          link-table? (->> (db/query {:select   [:table_id [:%count.* "count"]]
                                      :from     [Field]
                                      :where    [:and [:in :table_id (keys field-count)]
                                                 [:in :special_type ["type/PK" "type/FK"]]]
                                      :group-by [:table_id]})
                           (filter (fn [{:keys [table_id count]}]
                                     (= count (field-count table_id))))
                           (into #{} (map :table_id)))]
      (for [table tables]
        (let [table-id (u/get-id table)]
          (assoc table :stats {:num-fields  (field-count table-id 0)
                               :list-like?  (boolean (list-like? table-id))
                               :link-table? (boolean (link-table? table-id))}))))))

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
                          :visibility_type nil]
                   schema (concat [:schema schema])))
          (filter mi/can-read?)
          enhance-table-stats
          (remove (comp (some-fn :link-table? :list-like? (comp zero? :num-fields)) :stats))
          (map (fn [table]
                 (let [root      (->root table)
                       rule      (->> root
                                      (matching-rules rules)
                                      first)
                       dashboard (make-dashboard root rule)]
                   {:url         (format "%stable/%s" public-endpoint (u/get-id table))
                    :title       (:full-name root)
                    :score       (+ (math/sq (:specificity rule))
                                    (math/log (-> table :stats :num-fields)))
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
