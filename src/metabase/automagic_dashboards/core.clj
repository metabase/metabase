(ns metabase.automagic-dashboards.core
  "Automatically generate questions and dashboards based on predefined
   heuristics."
  (:require [clojure.math.combinatorics :as combo]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [kixi.stats.core :as stats]
            [medley.core :as m]
            [metabase.automagic-dashboards
             [populate :as populate]
             [rules :as rules]]
            [metabase.models
             [card :as card]
             [database :refer [Database]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [table :refer [Table]]]
            [metabase.util :as u]
            [toucan.db :as db]))

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

(defmethod ->reference [:native (type Field)]
  [_ {:keys [name table_id]}]
  (format "%s.%s" (-> table_id Table :name) name))

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
                            ; This case is mostly relevant for native queries
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
  [preds table]
  (filter (->> preds
               (keep (fn [[k v]]
                       (when-let [pred (field-filters k)]
                         (some-> v pred))))
               (apply every-pred))
          (db/select Field :table_id (:id table))))

(defn- filter-tables
  [tablespec context]
  (filter #(-> % :entity_type (isa? tablespec)) (:tables context)))

(defn- fill-template
  [template-type context bindings template]
  (str/replace template #"\[\[(\w+)\]\]"
               (fn [[_ identifier]]
                 (->reference template-type (or (bindings identifier)
                                                (-> identifier
                                                    rules/->entity
                                                    (filter-tables context)
                                                    first)
                                                identifier)))))

(defn- field-candidates
  [context {:keys [field_type links_to named max_cardinality] :as constraints}]
  (if links_to
    (filter (comp (->> (filter-tables links_to context)
                       (keep :link)
                       set)
                  :id)
            (field-candidates context (dissoc constraints :links_to)))
    (let [[tablespec fieldspec] field_type]
      (if fieldspec
        (let [[table] (filter-tables tablespec context)]
          (mapcat (fn [table]
                    (some->> table
                             (filter-fields {:fieldspec       fieldspec
                                             :named           named
                                             :max-cardinality max_cardinality})
                             (map #(assoc % :link (:link table)))))
                  (filter-tables tablespec context)))
        (filter-fields {:fieldspec       tablespec
                        :named           named
                        :max-cardinality max_cardinality}
                       (:root-table context))))))

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
                                      [(->> definition
                                            :field_type
                                            (map (comp count ancestors))
                                            (reduce + ))
                                       (count definition)
                                       (:score definition)])
                                    first))))

(defn- bind-dimensions
  "Bind fields to dimensions and resolve overloading.
   Each field x aggregation pair will be bound to only one dimension. If multiple
   dimension definitions match a single field, the field is bound to the specific
   definition is used (see `most-specific-defintion` for details)."
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

(defn- index-of
  [pred coll]
  (first (keep-indexed (fn [idx x]
                         (when (pred x)
                           idx))
                       coll)))

(defn- build-order-by
  [dimensions metrics order-by]
  (let [dimensions (set dimensions)]
    (for [[identifier ordering] (map first order-by)]
      [(if (= ordering "ascending")
         :asc
         :desc)
       (if (dimensions identifier)
         [:dimension identifier]
         [:aggregate-field (index-of #{identifier} metrics)])])))

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
                                  (> (count filters) 1) (apply vector :and)))

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
                       (comp #(filter-tables % context) rules/->entity)))
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
                      (assoc :score score
                             :query query))))))))

(def ^:private ^{:arglists '([ruke])} rule-specificity
  (comp count ancestors :table_type))

(defn- matching-rules
  "Return matching rules orderd by specificity.
   Most specific is defined as entity type specification the longest ancestor
   chain."
  [rules table]
  (->> rules
       (filter (comp (partial isa? (:entity_type table)) :table_type))
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
  (empty? (db/select Field
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
  (let [context (as-> {:root-table root
                       :rule       (:table_type rule)
                       :tables     (concat [root] (linked-tables root))
                       :database   (:db_id root)} <>
                  (assoc <> :dimensions (bind-dimensions <> (:dimensions rule)))
                  (assoc <> :metrics (resolve-overloading <> (:metrics rule)))
                  (assoc <> :filters (resolve-overloading <> (:filters rule))))]
    (log/info (format "Dimensions bindings:\n%s"
                      (->> context
                           :dimensions
                           (m/map-vals #(update % :matches (partial map :name)))
                           u/pprint-to-str)))
    (log/info (format "Using definitions:\nMetrics:\n%s\nFilters:\n%s"
                      (-> context :metrics u/pprint-to-str)
                      (-> context :filters u/pprint-to-str)))
    context))

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

(defn- apply-rule
  [root rule]
  (let [context   (make-context root rule)
        dashboard (->> (select-keys rule [:title :description :groups])
                                    (instantiate-metadata context {}))
        filters   (->> rule
                       :dashboard_filters
                       (mapcat (comp :matches (:dimensions context))))
        cards     (make-cards context rule)]
    (when cards
      (log/info (format "Applying heuristic %s to table %s."
                        (:table_type rule)
                        (:name root)))
      (-> dashboard
          (populate/create-dashboard filters cards)
          (assoc :rule (:rule rule))))))

(def ^:private public-endpoint "/xray/")

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
                                 (keep (fn [rule]
                                         (some-> (apply-rule table rule)
                                                 (vector rule))))
                                 first)]
                   {:url         (str public-endpoint "table/" (:id table))
                    :title       (:name dashboard)
                    :score       (rule-specificity rule)
                    :description (:description dashboard)
                    :table       table})))
         (sort-by :score >))))

(defn automagic-dashboard
  "Create dashboards for table `root` using the best matching heuristics."
  [root]
  (if-let [dashboard (->> root
                          (matching-rules (rules/load-rules))
                          (keep (partial apply-rule root))
                          first)]
    (assoc dashboard :related
           {:tables  (->> root
                          :db_id
                          Database
                          candidate-tables
                          (remove (comp #{root} :table)))
            :indepth (->> dashboard
                          :rule
                          rules/indepth
                          (keep (fn [rule]
                                  (when-let [dashboard (apply-rule root rule)]
                                    {:title       (:name dashboard)
                                     :description (:description dashboard)
                                     :table       root
                                     :url         (format "%stable/%s/%s"
                                                          public-endpoint
                                                          (:id root)
                                                          (:rule rule))}))))})
    (log/info (format "Skipping %s: no cards fully match the topology."
                      (:name root)))))

(defn automagic-analysis
  "Create a transient dashboard analyzing metric `metric`."
  [metric]
  (let [rule      (-> "/special/metric.yaml"
                      rules/load-rule
                      (update :metrics conj {"Metric" {:metric ["METRIC" (:id metric)]
                                                       :score  100}}))
        context   (make-context (Table (:table_id metric)) rule)
        cards     (make-cards context rule)
        filters   (->> rule
                       :dashboard_filters
                       (mapcat (comp :matches (:dimensions context))))
        dashboard {:title  (format "Analysis of %s" (:name metric))
                   :groups (:groups rule)}]
    (some->> cards (populate/create-dashboard dashboard (count cards) filters))))
