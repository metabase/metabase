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
  [{:keys [source]} id-or-name]
  (if (->> source (instance? (type Table)))
    (Field id-or-name)
    (let [field (->> source
                     :result_metadata
                     (m/find-first (comp #{id-or-name} :name)))]
      (-> field
          (update :base_type keyword)
          (update :special_type keyword)
          field/map->FieldInstance
          (classify/run-classifiers {})))))

(defn- metric->description
  [root metric]
  (let [aggregation-clause (-> metric :definition :aggregation first)
        field              (some->> aggregation-clause
                                    second
                                    filters/field-reference->id
                                    (->field root))]
    (if field
      (tru "{0} of {1}" (-> aggregation-clause first name str/capitalize) (:display_name field))
      (-> aggregation-clause first name str/capitalize))))

(defn- join-enumeration
  [[x & more :as xs]]
  (if more
    (tru "{0} and {1}" (str/join ", " (butlast xs)) (last xs))
    x))

(defn- question-description
  [root question]
  (let [aggregations (->> (qp.util/get-in-normalized question [:dataset_query :query :aggregation])
                          (map (fn [[op arg]]
                                 (cond
                                   (-> op qp.util/normalize-token (= :metric))
                                   (-> arg Metric :name)

                                   arg
                                   (tru "{0} of {1}"
                                        (str/capitalize (name op))
                                        (->> arg
                                             filters/field-reference->id
                                             (->field root)
                                             :display_name))

                                   :else
                                   (name op))))
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
   :source       table
   :database     (:db_id table)
   :url          (format "%stable/%s" public-endpoint (u/get-id table))
   :rules-prefix ["table"]})

(defmethod ->root (type Segment)
  [segment]
  (let [table (-> segment :table_id Table)]
    {:entity       segment
     :full-name    (tru "{0} segment" (:name segment))
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
     :source       table
     :database     (:db_id table)
     ;; We use :id here as it might not be a concrete metric but rather one from a nested query
     ;; which does not have an ID.
     :url          (format "%sfield/%s" public-endpoint (:id field))
     :rules-prefix ["field"]}))

(def ^:private ^{:arglists '([card-or-question])} nested-query?
  (comp (every-pred string? #(str/starts-with? % "card__"))
        #(qp.util/get-in-normalized % [:dataset_query :query :source_table])))

(def ^:private ^{:arglists '([card-or-question])} native-query?
  (comp #{:native} qp.util/normalize-token #(qp.util/get-in-normalized % [:dataset_query :type])))

(def ^:private ^{:arglists '([card-or-question])} source-question
  (comp Card qp.util/query->source-card-id :dataset_query))

(def ^:private ^{:arglists '([card])} table-like?
  (comp empty? #(qp.util/get-in-normalized % [:dataset_query :query :aggregation])))

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
  {:entity       card
   :source       (source card)
   :database     (:database_id card)
   :query-filter (qp.util/get-in-normalized card [:dataset_query :query :filter])
   :full-name    (tru "{0} question" (:name card))
   :url          (format "%squestion/%s" public-endpoint (u/get-id card))
   :rules-prefix [(if (table-like? card)
                    "table"
                    "question")]})

(defmethod ->root (type Query)
  [query]
  (let [source   (source query)]
    {:entity       query
     :source       source
     :database     (:database-id query)
     :full-name    (cond
                     (native-query? query) (tru "Native query")
                     (table-like? query)   (-> source ->root :full-name)
                     :else                 (question-description {:source source} query))
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
               (apply every-pred related/visible?))
          fields))

(defn- filter-tables
  [tablespec tables]
  (filter (every-pred related/visible?
                      #(-> % :entity_type (isa? tablespec)))
          tables))

(defn- fill-templates
  [template-type {:keys [root tables]} bindings s]
  (let [bindings (some-fn (merge {"this" (-> root
                                             :entity
                                             (assoc :full-name (:full-name root)))}
                                 bindings)
                          (comp first #(filter-tables % tables) rules/->entity)
                          identity)]
    (str/replace s #"\[\[(\w+)\]\]" (fn [[_ identifier]]
                                     (->reference template-type (bindings identifier))))))

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
  (let [dimension? (into #{}
                         (map :identifier)
                         dimensions)]
    (for [[identifier ordering] (map first order-by)]
      [(if (dimension? identifier)
         [:dimension identifier]
         [:aggregation (u/index-of (comp #{identifier} :identifier) metrics)])
       (if (= ordering "ascending")
         :ascending
         :descending)])))

(defn- build-query
  ([context bindings filters metrics dimensions limit order-by]
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
                 (assoc :breakout (for [{:keys [identifier opts]} dimensions]
                                    [:dimension identifier opts]))

                 (not-empty metrics)
                 (assoc :aggregation metrics)

                 limit
                 (assoc :limit limit)

                 (not-empty order-by)
                 (assoc :order_by order-by))}))
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

(defn- instantiate-visualization
  [[k v] dimensions metrics]
  (let [dimension->name (comp vector :name dimensions)
        metric->name    (comp vector first :metric metrics)]
    [k (-> v
           (u/update-when :map.latitude_column dimension->name)
           (u/update-when :map.longitude_column dimension->name)
           (u/update-when :graph.metrics metric->name)
           (u/update-when :graph.dimensions dimension->name))]))

(defn- instantiate-metadata
  [x context bindings]
  (-> (walk/postwalk
       (fn [form]
         (if (string? form)
           (fill-templates :string context bindings form)
           form))
       x)
      (u/update-when :visualization #(instantiate-visualization % bindings (:metrics context)))))

(defn- used-dimensions
  [context dimensions]
  (->> dimensions
       (map (some-fn #(get-in (:dimensions context) [% :matches])
                     (comp #(filter-tables % (:tables context)) rules/->entity)))
       (apply combo/cartesian-product)
       (map (partial zipmap dimensions))))

(defn- metrics-sets
  [metrics]
  (->> metrics
       (map :matches)
       (apply combo/cartesian-product)))

(defn- card-score
  [{:keys [metrics filters dimensions query score]}]
  (if query
    score
    (* (or (transduce (keep :score) stats/mean (concat dimensions filters metrics))
           rules/max-score)
       (/ score
          rules/max-score))))

(defn- card-candidates
  "Generate all potential cards given a card definition and bindings for
   dimensions, metrics, and filters."
  [context {:keys [metrics filters dimensions score limit order_by query] :as card}]
  (let [filters  (cond-> filters
                   (:query-filter context) (conj {:filter (:query-filter context)}))
        score    (card-score card)
        order-by (build-order-by dimensions metrics order_by)]
    (->> (combo/cartesian-product
          (used-dimensions context (concat (map :identifier dimensions)
                                           (rules/collect-dimensions [metrics filters query])))
          (metrics-sets metrics))
         (map (fn [[bindings metrics-set]]
                (let [query         (if query
                                      (build-query context bindings query)
                                      (build-query context bindings filters metrics-set dimensions
                                                   limit order-by))
                      metrics-names (map (fn [definition metric]
                                           (or (:name definition)
                                               (let [[op & args] metric]
                                                 (if (-> op qp.util/normalize-token (= :metric))
                                                   (-> args first Metric :name)
                                                   (-> op name str/capitalize)))))
                                         metrics
                                         metrics-set)]
                  (-> card
                      (instantiate-metadata context (merge bindings
                                                           (zipmap (map :identifier metrics)
                                                                   metrics-names)))
                      (assoc :score         score
                             :metrics       metrics-names
                             :dataset_query query))))))))

(s/defn ^:private rule-specificity
  [rule :- rules/Rule]
  (transduce (map (comp count ancestors)) + (:applies_to rule)))

(s/defn ^:private matching-rules
  "Return matching rules orderd by specificity.
   Most specific is defined as entity type specification the longest ancestor
   chain."
  [rules :- [rules/Rule], {:keys [source entity]}]
  (let [table-type (or (:entity_type source) :entity/GenericTable)]
    (->> rules
         (filter (fn [{:keys [applies_to]}]
                   (let [[entity-type field-type] applies_to]
                     (and (isa? table-type entity-type)
                          (or (nil? field-type)
                              (field-isa? entity field-type))))))
         (sort-by rule-specificity >))))

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
                 (into {})))))

(defmethod inject-root (type Metric)
  [context metric]
  (update context :metrics assoc "this" {:matches [(->reference :mbql metric)]
                                         :name    (:name metric)
                                         :score   rules/max-score}))

(defmethod inject-root :default
  [context _]
  context)

(defn- user-defined-metrics
  [source]
  {:matches    (->> (db/select Metric :table_id (:id source))
                    (filter related/visible?)
                    (map (comp (partial vector :metric) u/get-id)))
   :score      rules/max-score})

(defn- bind-metrics
  [context metrics]
  (let [metrics (for [[identifier metric] (map first metrics)]
                  {identifier (assoc metric :matches [(:metric metric)])})]
    (-> context
        (resolve-overloading metrics)
        (assoc "UserDefinedMetric" (user-defined-metrics (:source context))))))

(s/defn ^:private make-context
  [root, rule :- rules/Rule]
  {:pre [(:source root)]}
  (let [source        (:source root)
        tables        (concat [source] (when (instance? (type Table) source)
                                         (linked-tables source)))
        table->fields (if (instance? (type Table) source)
                        (comp (->> (db/select Field
                                              :table_id        [:in (map u/get-id tables)]
                                              :visibility_type "normal")
                                   field/with-targets
                                   (group-by :table_id))
                              u/get-id)
                        (->> source
                             :result_metadata
                             (map (fn [field]
                                    (-> field
                                        (update :base_type keyword)
                                        (update :special_type keyword)
                                        field/map->FieldInstance
                                        (classify/run-classifiers {}))))
                             constantly))]
    (as-> {:source       (assoc source :fields (table->fields source))
           :root         root
           :tables       (map #(assoc % :fields (table->fields %)) tables)
           :query-filter (filters/inject-refinement (:query-filter root)
                                                    (:cell-query root))} context
      (assoc context :dimensions (bind-dimensions context (:dimensions rule)))
      (assoc context :metrics (bind-metrics context (:metrics rule)))
      (assoc context :filters (resolve-overloading context (:filters rule)))
      (inject-root context (:entity root)))))

(defn- instantiate-card
  [{:keys [metrics filters dimensions]} card]
  (-> card
      (update :metrics (partial map (fn [identifier]
                                      (-> metrics
                                          (get identifier)
                                          (assoc :identifier identifier)))))
      (update :filters (partial map (partial get filters)))
      (update :dimensions (partial map (comp (fn [[identifier opts]]
                                               (-> dimensions
                                                   (get identifier)
                                                   (assoc :identifier identifier
                                                          :opts       opts)))
                                             first)))))

(defn- make-cards
  [context {:keys [cards]}]
  (some->> cards
           (map first)
           (map-indexed (fn [position [identifier card]]
                          (some->> (assoc card :position position)
                                   (instantiate-card context)
                                   (card-candidates context)
                                   not-empty
                                   (hash-map (name identifier)))))
           (apply merge-with (partial max-key (comp :score first)) {})
           vals
           (apply concat)))

(s/defn ^:private make-dashboard
  ([root, rule :- rules/Rule]
   (make-dashboard root rule {:tables [(:source root)]
                              :root   root}))
  ([root, rule :- rules/Rule, context]
   (-> rule
       (select-keys [:title :description :transient_title :groups])
       (instantiate-metadata context {})
       (assoc :refinements (:cell-query root)))))

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
         :cards    cards
         :context  context
         :fieldset (->> context
                        :tables
                        (mapcat :fields)
                        (map (fn [field]
                               [(id-or-name field) field]))
                        (into {})))
       rule])))

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
         ;; Not everything `related/related` returns is relevent for us. Also note that the order
         ;; influences which entities get shown when results are trimmed.
         relevant-dimensions [:table :segments :metrics :linking-to :dashboard-mates
                              :similar-questions :linked-from :tables :fields]]
     (->> relevant-dimensions
          (reduce (fn [acc selector]
                    (concat acc (-> selector recommendations rules/ensure-seq)))
                  [])
          (take n)
          (map ->related-entity)))))

(s/defn ^:private indepth
  [root, rule :- (s/maybe rules/Rule)]
  (->> (rules/get-rules (concat (:rules-prefix root) [(:rule rule)]))
       (keep (fn [indepth]
               (when-let [[dashboard _] (apply-rule root indepth)]
                 {:title       ((some-fn :short-title :title) dashboard)
                  :description (:description dashboard)
                  :url         (format "%s/rule/%s/%s" (:url root) (:rule rule) (:rule indepth))})))
       (take max-related)))

(defn- drilldown-fields
  [dashboard]
  (->> dashboard
       :context
       :dimensions
       vals
       (mapcat :matches)
       filters/interesting-fields
       (map ->related-entity)))

(s/defn ^:private related
  [dashboard, rule :- (s/maybe rules/Rule)]
  (let [root    (-> dashboard :context :root)
        indepth (indepth root rule)]
    (if (not-empty indepth)
      {:indepth indepth
       :related (related-entities (- max-related (count indepth)) root)}
      (let [drilldown-fields   (drilldown-fields dashboard)
            n-related-entities (max (math/floor (* (/ 2 3) max-related))
                                    (- max-related (count drilldown-fields)))]
        {:related          (related-entities n-related-entities root)
         :drilldown-fields (take (- max-related n-related-entities) drilldown-fields)}))))

(defn- automagic-dashboard
  "Create dashboards for table `root` using the best matching heuristics."
  [{:keys [rule show rules-prefix query-filter cell-query full-name] :as root}]
  (if-let [[dashboard rule] (if rule
                              (apply-rule root (rules/get-rule rule))
                              (->> root
                                   (matching-rules (rules/get-rules rules-prefix))
                                   (keep (partial apply-rule root))
                                   ;; `matching-rules` returns an `ArraySeq` (via `sort-by`) so
                                   ;; `first` realises one element at a time (no chunking).
                                   first))]
    (do
      (log/infof (trs "Applying heuristic %s to %s.") (:rule rule) full-name)
      (log/infof (trs "Dimensions bindings:\n%s")
                 (->> dashboard
                      :context
                      :dimensions
                      (m/map-vals #(update % :matches (partial map :name)))
                      u/pprint-to-str))
      (log/infof (trs "Using definitions:\nMetrics:\n%s\nFilters:\n%s")
                 (-> dashboard :context :metrics u/pprint-to-str)
                 (-> dashboard :context :filters u/pprint-to-str))
      (-> (cond-> dashboard
            (or query-filter cell-query)
            (assoc :title (tru "A closer look at {0}" full-name)))
          (populate/create-dashboard (or show max-cards))
          (assoc :related (related dashboard rule))
          (assoc :more (when (and (-> dashboard :cards count (> max-cards))
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
             (assoc metric :name (metric->description root metric)))))
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

(defmethod automagic-analysis (type Card)
  [card {:keys [cell-query] :as opts}]
  (let [root (->root card)]
    (if (or (table-like? card)
            cell-query)
      (automagic-dashboard
       (merge (cond-> root
                cell-query (merge {:url          (format "%squestion/%s/cell/%s" public-endpoint
                                                         (u/get-id card)
                                                         (encode-base64-json cell-query))
                                   :entity       (:source root)
                                   :rules-prefix ["table"]}))
              opts))
      (let [opts (assoc opts :show :all)]
        (->> (decompose-question root card opts)
             (apply populate/merge-dashboards (automagic-dashboard root))
             (merge {:related (related {:context {:root {:entity card}}} nil)}))))))

(defmethod automagic-analysis (type Query)
  [query {:keys [cell-query] :as opts}]
  (let [root (->root query)]
    (if (or (table-like? query)
            (:cell-query opts))
      (automagic-dashboard
       (merge (cond-> root
                cell-query (merge {:url          (format "%sadhoc/%s/cell/%s" public-endpoint
                                                         (encode-base64-json (:dataset_query query))
                                                         (encode-base64-json cell-query))
                                   :entity       (:source root)
                                   :rules-prefix ["table"]}))
              (update opts :cell-query
                      (partial filters/inject-refinement
                               (qp.util/get-in-normalized query [:dataset_query :query :filter])))))
      (let [opts (assoc opts :show :all)]
        (->> (decompose-question root query opts)
             (apply populate/merge-dashboards (automagic-dashboard root))
             (merge {:related (related {:context {:root {:entity query}}} nil)}))))))

(defmethod automagic-analysis (type Field)
  [field opts]
  (automagic-dashboard (merge (->root field) opts)))

(defn- enhanced-table-stats
  [table]
  (let [field-types (->> (db/select [Field :special_type] :table_id (u/get-id table))
                         (map :special_type))]
    (assoc table :stats {:num-fields  (count field-types)
                         :list-like?  (= (count (remove #{:type/PK} field-types)) 1)
                         :link-table? (every? #{:type/FK :type/PK} field-types)})))

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
     (->> (apply db/select Table
                 (cond-> [:db_id           (u/get-id database)
                          :visibility_type nil]
                   schema (concat [:schema schema])))
          (filter mi/can-read?)
          (map enhanced-table-stats)
          (remove (comp (some-fn :link-table? :list-like?) :stats))
          (map (fn [table]
                 (let [root      (->root table)
                       rule      (->> root
                                      (matching-rules rules)
                                      first)
                       dashboard (make-dashboard root rule)]
                   {:url         (format "%stable/%s" public-endpoint (u/get-id table))
                    :title       (:full-name root)
                    :score       (+ (math/sq (rule-specificity rule))
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
