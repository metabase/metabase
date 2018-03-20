(ns metabase.automagic-dashboards.core
  "Automatically generate questions and dashboards based on predefined
   heuristics."
  (:require [cheshire.core :as json]
            [clojure.math.combinatorics :as combo]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [kixi.stats.core :as stats]
            [medley.core :as m]
            [metabase.automagic-dashboards
             [populate :as populate]
             [rules :as rules]]
            [metabase.models
             [card :as card :refer [Card]]
             [database :refer [Database]]
             [field :refer [Field] :as field]
             [metric :refer [Metric]]
             [query :refer [Query]]
             [table :refer [Table]]]
            [metabase.util :as u]
            [ring.util.codec :as codec]
            [toucan.db :as db]))

(def ^:private public-endpoint "/auto/dashboard/")

(defprotocol IRootEntity
  "Unified access to all entity types."
  (table [this] "(Primary) table this draws from.")
  (database [this] "Database this belongs to.")
  (query-filter [this] "Filter expression to narrow results just to this.")
  (full-name [this] "Name with time prefix.")
  (url [this] "Public automagic dashboard endpoint for this."))

(extend-protocol IRootEntity
  metabase.models.table.TableInstance
  (table [table] table)
  (database [table] (-> table :db_id Database))
  (query-filter [table] nil)
  (full-name [table] (str "table " (:display_name table)))
  (url [table] (format "%stable/%s" public-endpoint (:id table)))

  metabase.models.segment.SegmentInstance
  (table [segment] (-> segment :table_id Table))
  (database [segment] (-> segment table database))
  (query-filter [segment] (-> segment :definition :filter))
  (full-name [segment] (str "segment " (:name segment)))
  (url [segment] (format "%ssegment/%s" public-endpoint (:id segment)))

  metabase.models.metric.MetricInstance
  (table [metric] (-> metric :table_id Table))
  (database [metric] (-> metric table database))
  (query-filter [metric] nil)
  (full-name [metric] (str "metric " (:name metric)))
  (url [metric] (format "%smetric/%s" public-endpoint (:id metric)))

  metabase.models.field.FieldInstance
  (table [field] (field/table field))
  (database [field] (-> field table database))
  (query-filter [field] nil)
  (full-name [field] (str "field " (:display_name field)))
  (url [field] (format "%field/%s" public-endpoint (:id field)))

  metabase.models.query.QueryInstance
  (table [query] (-> query :table_id Table))
  (database [query] (-> query :database_id Database))
  (query-filter [query] (-> query :dataset_query :query :filter))
  (full-name [query] (str "ad-hoc question " (:name query)))
  (url [query] (format "%sadhoc/%s" public-endpoint (-> query
                                                        json/encode
                                                        codec/base64-encode)))

  metabase.models.card.CardInstance
  (table [card] (-> card :table_id Table))
  (database [card] (-> card :database_id Database))
  (query-filter [card] (-> card :dataset_query :query :filter))
  (full-name [card] (str "question " (:name card)))
  (url [card] (format "%squestion/%s" public-endpoint (:id card))))

(defmulti
  ^{:doc "Get a reference for a given model to be injected into a template
          (either MBQL, native query, or string)."
    :arglists '([template-type model])
    :private true}
  ->reference (fn [template-type model]
                [template-type (type model)]))

(defmethod ->reference [:mbql (type Field)]
  [_ {:keys [fk_target_field_id id link aggregation base_type fingerprint]}]
  (let [reference (cond
                    link               [:fk-> link id]
                    fk_target_field_id [:fk-> id fk_target_field_id]
                    :else              [:field-id id])]
    (cond
      (isa? base_type :type/DateTime)
      [:datetime-field reference (or aggregation :day)]

      (and aggregation
           ; We don't handle binning on non-analyzed fields gracefully
           (or (not (isa? base_type :type/Number))
               (-> fingerprint :type :type/Number :min)))
      [:binning-strategy reference aggregation]

      :else
      reference)))

(defmethod ->reference [:string (type Field)]
  [_ {:keys [display_name]}]
  display_name)

(defmethod ->reference [:string (type Table)]
  [_ {:keys [display_name]}]
  display_name)

(defmethod ->reference [:string (type Metric)]
  [_ {:keys [name]}]
  name)

(defmethod ->reference [:native (type Field)]
  [_ field]
  (field/qualified-name field))

(defmethod ->reference [:native (type Table)]
  [_ {:keys [name]}]
  name)

(defmethod ->reference :default
  [_ form]
  form)

(defn- numeric-key?
  "Workaround for our leaky type system which conflates types with properties."
  [{:keys [base_type special_type name]}]
  (and (isa? base_type :type/Number)
       (or (#{:type/PK :type/FK} special_type)
           (-> name str/lower-case (= "id")))))

(def ^:private field-filters
  {:fieldspec       (fn [fieldspec]
                      (if (and (string? fieldspec)
                               (rules/ga-dimension? fieldspec))
                        (comp #{fieldspec} :name)
                        (fn [{:keys [base_type special_type fk_target_field_id]
                              :as field}]
                          (cond
                            ;; This case is mostly relevant for native queries
                            (#{:type/PK :type/FK} fieldspec)
                            (isa? special_type fieldspec)

                            fk_target_field_id
                            (recur (Field fk_target_field_id))

                            :else
                            (and (not (numeric-key? field))
                                 (some #(isa? % fieldspec)
                                       [special_type base_type]))))))
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

(defn- fill-template
  [template-type context bindings template]
  (str/replace template #"\[\[(\w+)\]\]"
               (fn [[_ identifier]]
                 (->reference template-type (or (bindings identifier)
                                                (-> identifier
                                                    rules/->entity
                                                    (filter-tables (:tables context))
                                                    first)
                                                identifier)))))

(defn- field-candidates
  [context {:keys [field_type links_to named max_cardinality] :as constraints}]
  (if links_to
    (filter (comp (->> (filter-tables links_to (:tables context))
                       (keep :link)
                       set)
                  :id)
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
                       (-> context :root-table :fields))))))

(defn- make-binding
  [context [identifier definition]]
  (->> definition
       (field-candidates context)
       (map #(->> (merge % definition)
                  vector
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
   Each field x aggregation pair will be bound to only one dimension. If multiple
   dimension definitions match a single field, the field is bound to the most
   specific definition used (see `most-specific-defintion` for details)."
  [context dimensions]
  (->> dimensions
       (mapcat (comp (partial make-binding context) first))
       (group-by (comp (juxt :id :aggregation) first :matches val first))
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
      [(if (= ordering "ascending")
         :asc
         :desc)
       (if (dimensions identifier)
         [:dimension identifier]
         [:aggregate-field (u/index-of #{identifier} metrics)])])))

(defn- build-query
  ([context bindings filters metrics dimensions limit order_by]
   (walk/postwalk
    (fn [subform]
      (if (rules/dimension-form? subform)
        (->> subform second bindings (->reference :mbql))
        subform))
    {:type     :query
     :database (:database context)
     :query    (cond-> {:source_table (-> context :root-table :id)}
                 (not-empty filters)
                 (assoc :filter (cond->> (map :filter filters)
                                  (> (count filters) 1) (apply vector :and)
                                  :else                 first))

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
    :native   {:query (fill-template :native context bindings query)}
    :database (:database context)}))

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
  [dimensions metrics [k v]]
  (let [dimension->name (comp vector :name dimensions)
        metric->name    (comp vector first :metric metrics)]
    [k (-> v
           (u/update-when :map.latitude_column dimension->name)
           (u/update-when :map.longitude_column dimension->name)
           (u/update-when :graph.metrics metric->name)
           (u/update-when :graph.dimensions dimension->name))]))

(defn- instantiate-metadata
  [context bindings x]
  (let [fill-template (partial fill-template :string context bindings)]
    (-> x
        (update :title fill-template)
        (u/update-when :visualization (partial instantate-visualization bindings
                                               (:metrics context)))
        (u/update-when :description fill-template)
        (u/update-when :text fill-template))))

(defn- card-candidates
  "Generate all potential cards given a card definition and bindings for
   dimensions, metrics, and filters."
  [context {:keys [metrics filters dimensions score limit order_by query] :as card}]
  (let [order_by        (build-order-by dimensions metrics order_by)
        metrics         (map (partial get (:metrics context)) metrics)
        filters         (map (partial get (:filters context)) filters)
        score           (if query
                          score
                          (* (or (->> dimensions
                                      (map (partial get (:dimensions context)))
                                      (concat filters metrics)
                                      (transduce (keep :score) stats/mean))
                                 rules/max-score)
                             (/ score rules/max-score)))
        dimensions      (map (partial vector :dimension) dimensions)
        used-dimensions (rules/collect-dimensions [dimensions metrics filters query])]
    (->> used-dimensions
         (map (some-fn #(get-in (:dimensions context) [% :matches])
                       (comp #(filter-tables % (:tables context)) rules/->entity)))
         (apply combo/cartesian-product)
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
                  (-> (instantiate-metadata context bindings card)
                      (assoc :score         score
                             :dataset_query query))))))))

(def ^:private ^{:arglists '([ruke])} rule-specificity
  (comp count ancestors :table_type))

(defn- matching-rules
  "Return matching rules orderd by specificity.
   Most specific is defined as entity type specification the longest ancestor
   chain."
  [rules root]
  (->> rules
       (filter (comp (partial isa? (-> root table :entity_type)) :table_type))
       (sort-by rule-specificity >)))

(defn- linked-tables
  "Return all tables accessable from a given table with the paths to get there.
   If there are multiple FKs pointing to the same table, multiple entries will
   be returned."
  [table]
  (map (fn [{:keys [id fk_target_field_id]}]
         (-> fk_target_field_id Field :table_id Table (assoc :link id)))
       (db/select [Field :id :fk_target_field_id]
         :table_id (:id table)
         :fk_target_field_id [:not= nil])))

(defn- link-table?
  "Is the table comprised only of foregin keys and maybe a primary key?"
  [table]
  (zero? (db/count Field
           ;; :not-in returns false if field is nil, hence the workaround.
           {:where [:and [:= :table_id (:id table)]
                         [:or [:not-in :special_type ["type/FK" "type/PK"]]
                              [:= :special_type nil]]]})))

(defn- list-like-table?
  "Is the table comprised of only primary key and single field?"
  [table]
  (= 1 (db/count Field
         ;; :not-in returns false if field is nil, hence the workaround.
         {:where [:and [:= :table_id (:id table)]
                  [:not= :special_type "type/PK"]]})))

(defn- make-context
  [root rule]
  (let [root    (table root)
        tables  (concat [root] (linked-tables root))
        fields  (->> (db/select Field :table_id [:in (map :id tables)])
                     (group-by :table_id))]
    (as-> {:root-table (assoc root :fields (fields (:id root)))
           :tables     (map #(assoc % :fields (fields (:id %))) tables)
           :database   (:db_id root)} context
      (assoc context :dimensions (bind-dimensions context (:dimensions rule)))
      (assoc context :metrics (resolve-overloading context (:metrics rule)))
      (assoc context :filters (resolve-overloading context (:filters rule))))))

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

(defn- merge-filters
  [a b]
  (cond
    (empty? a) b
    (empty? b) a
    :else      [:and a b]))

(defn inject-segment
  "Inject filter clause into card."
  [entity card]
  (-> card
      (update-in [:dataset_query :query :filter] merge-filters (query-filter entity))
      (update :series (partial map (partial inject-segment entity)))))

(defn- apply-rule
  [root rule]
  (let [context   (make-context root rule)
        dashboard (->> (select-keys rule [:title :description :groups])
                                    (instantiate-metadata context {"this" root}))
        filters   (->> rule
                       :dashboard_filters
                       (mapcat (comp :matches (:dimensions context))))
        cards     (cond->> (make-cards context rule)
                    (query-filter root) (map (partial inject-segment root)))]
    (when cards
      [(assoc dashboard
         :filters filters
         :cards   cards
         :context context)
       rule])))

(defn candidate-tables
  "Return a list of tables in database with ID `database-id` for which it makes sense
   to generate an automagic dashboard."
  [database]
  (let [rules (rules/load-rules)]
    (->> (db/select Table
           :db_id (:id database)
           :visibility_type nil)
         (remove (some-fn link-table? list-like-table?))
         (keep (fn [table]
                 (when-let [[dashboard rule]
                            (->> table
                                 (matching-rules rules)
                                 (keep (partial apply-rule table))
                                 first)]
                   {:url         (url table)
                    :title       (:title dashboard)
                    :score       (rule-specificity rule)
                    :description (:description dashboard)
                    :table       table})))
         (sort-by :score >))))

(def ^:private ^Long ^:const max-related 6)

(defn automagic-dashboard
  "Create dashboards for table `root` using the best matching heuristics."
  ([root] (automagic-dashboard nil root))
  ([rule root]
   (if-let [[dashboard rule] (if rule
                               (apply-rule root rule)
                               (->> root
                                    (matching-rules (rules/load-rules))
                                    (keep (partial apply-rule root))
                                    ;; matching-rules returns an ArraySeq so first
                                    ;; realises one element at a time (no chunking).
                                    first))]
     (let [indepth (->> rule
                        :rule
                        rules/indepth
                        (keep (fn [indepth]
                                (when-let [[dashboard _] (apply-rule root indepth)]
                                  {:title       (:title dashboard)
                                   :description (:description dashboard)
                                   :table       (table root)
                                   :url         (format "%s/%s/%s"
                                                        (url root)
                                                        (:rule rule)
                                                        (:rule indepth))})))
                        (take max-related))]
       (log/info (format "Applying heuristic %s to %s."
                         (:rule rule)
                         (full-name root)))
       (log/info (format "Dimensions bindings:\n%s"
                         (->> dashboard
                              :context
                              :dimensions
                              (m/map-vals #(update % :matches (partial map :name)))
                              u/pprint-to-str)))
       (log/info (format "Using definitions:\nMetrics:\n%s\nFilters:\n%s"
                         (-> dashboard :context :metrics u/pprint-to-str)
                         (-> dashboard :context :filters u/pprint-to-str)))
       (-> dashboard
           populate/create-dashboard
           (assoc :related
             {:tables  (->> root
                            database
                            candidate-tables
                            (remove (comp #{root} :table))
                            (take (- max-related (count indepth))))
              :indepth indepth})))
     (log/info (format "Skipping %s: no cards fully match bound dimensions."
                       (full-name root))))))

(def ^:private ^{:arglists '([card])} table-like?
  (comp empty? :aggregation :query :dataset_query))

(defmulti
  ^{:doc "Create a transient dashboard analyzing given entity."
   :arglists '([entity])}
  automagic-analysis type)

(defmethod automagic-analysis (type Metric)
  [metric]
  (-> "special/metric.yaml"
      rules/load-rule
      (update :metrics conj {"Metric" {:metric ["METRIC" (:id metric)]
                                       :score  100}})
      (automagic-dashboard metric)))

(defmethod automagic-analysis (type Card)
  [card]
  (if (table-like? card)
    (automagic-dashboard card)
    nil))

(defmethod automagic-analysis (type Query)
  [query]
  (if (table-like? query)
    (automagic-dashboard query)
    nil))

(defmethod automagic-analysis (type Field)
  [field]
  (-> "special/field.yaml"
      rules/load-rule
      (update :dimensions conj
              {"Field"
               {:field_type  [(-> field table :entity_type)
                              ((some-fn :special_type :base_type) field)]
                :named       (:name field)
                :score       100
                :aggregation (cond
                               (isa? (:base_type field) :type/DateTime) :month
                               (isa? (:base_type field) :type/Number)   :default)}})
      (automagic-dashboard field)))
