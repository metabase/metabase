(ns metabase.usage-metadata.candidate-mining
  "Shared normalization and internal data contracts used by deterministic candidate miners."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [java-time.api :as t]
   [metabase.collections.models.collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.usage-metadata.query-source :as query-source]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn build-source-index
  "Bulk-fetch the Tables and Cards identified by `[source-type source-id]` keys."
  [source-keys]
  (let [by-type   (group-by first source-keys)
        table-ids (into #{} (comp (keep second) (filter pos-int?)) (get by-type :table))
        card-ids  (into #{} (comp (keep second) (filter pos-int?)) (get by-type :card))
        tables    (when (seq table-ids)
                    (t2/select [:model/Table :id :name :display_name :db_id :schema]
                               :id [:in table-ids]))
        cards     (when (seq card-ids)
                    (t2/select [:model/Card :id :name] :id [:in card-ids]))]
    (into {}
          cat
          [(map (fn [{:keys [id name display_name db_id schema]}]
                  [[:table id] {:type         :table
                                :id           id
                                :db-id        db_id
                                :schema       schema
                                :name         name
                                :display-name (or display_name name)}])
                tables)
           (map (fn [{:keys [id name]}]
                  [[:card id] {:type         :card
                               :id           id
                               :name         name
                               :display-name name}])
                cards)])))

(defn wrap-query
  "Wrap raw MBQL in a Lib query backed by the application metadata provider."
  [database-id query-map]
  (when (and (pos-int? database-id) (seq query-map))
    (try
      (lib/query (lib-be/application-database-metadata-provider database-id) query-map)
      (catch InterruptedException e
        (.interrupt (Thread/currentThread))
        (throw e))
      (catch Exception e
        (log/debugf "Failed to wrap query for usage-metadata insights: %s" (ex-message e))
        nil))))

(def conditional-aggregation-operators
  "Aggregation operators whose semantics include a filter predicate."
  #{:count-where :distinct-where :sum-where})

(defn- remove-clause-presentation-metadata
  "Remove custom display names from MBQL clauses without touching map-shaped literal values."
  [x]
  (walk/postwalk
   (fn [node]
     (if (and (vector? node)
              (<= 2 (count node))
              (keyword? (first node))
              (map? (second node)))
       (update node 1 dissoc :name :display-name)
       node))
   x))

(defn- remove-physical-field-enrichment-metadata
  "Remove redundant inferred type metadata from physical Field refs.

  Lib may enrich the same physical Field ref differently depending on which query path produced it. These keys help
  Lib reason about the query but do not change the Field or the computation, so they must not split otherwise identical
  candidate signatures. Preserve an effective type that differs from the base type because it represents a coercion,
  along with semantic Field options such as temporal units, binning, join aliases, and source fields."
  [x]
  (walk/postwalk
   (fn [node]
     (if (and (vector? node)
              (= :field (first node))
              (map? (second node))
              (pos-int? (nth node 2 nil)))
       (let [options (second node)]
         (assoc node 1
                (cond-> (dissoc options :lib/transformation-added-base-type)
                  (= (:effective-type options) (:base-type options)) (dissoc :effective-type))))
       node))
   x))

(defn canonical-form
  "Canonical MBQL value used before candidate serialization or comparison."
  [x]
  (-> x
      remove-clause-presentation-metadata
      remove-physical-field-enrichment-metadata
      lib.schema.util/remove-lib-uuids
      (lib.schema.util/sorted-maps lib.schema.common/unfussy-sorted-map)))

(defn canonical-signature
  "Canonical JSON used for deterministic candidate grouping and semantic collision checks.

  Custom aggregation/filter labels are evidence about how people describe a computation, not part of
  the computation itself. Ignoring them prevents aliases such as `Count` and `Total PV` from producing
  separate candidates for the same table and clause."
  [x]
  (json/encode (canonical-form x)))
(def ^:private candidate-default-min-view-count 10)
(def candidate-default-limit
  "Default maximum number of candidates returned by a public miner."
  50)
(def ^:private candidate-aggregation-operators
  #{:count :sum :avg :min :max :distinct :median :stddev :var :percentile})
(def ^:dynamic *candidate-analysis-cache*
  "Optional run-scoped cache for instance-wide inputs shared across candidate batches."
  nil)

(def ^:dynamic *candidate-batch-cache*
  "Optional batch-scoped cache for selected Cards and their saved-Card lineage."
  nil)

(defn- with-candidate-cache
  [cache-var current-cache f]
  (with-bindings {cache-var (or current-cache (atom {}))}
    (f)))

(defn with-candidate-analysis-cache
  "Run `f` with a cache shared by all candidate analyses it invokes."
  [f]
  (with-candidate-cache #'*candidate-analysis-cache* *candidate-analysis-cache* f))

(defn with-candidate-batch-cache
  "Run `f` with reusable selected-Card and lineage inputs for one candidate batch."
  [f]
  (with-candidate-cache #'*candidate-batch-cache* *candidate-batch-cache* f))

(defn- cached-candidate
  [cache cache-key f]
  (if cache
    (if (contains? @cache cache-key)
      (get @cache cache-key)
      (let [value (f)]
        (swap! cache assoc cache-key value)
        value))
    (f)))

(defn cached-candidate-analysis
  "Read or populate an analysis-scoped cache entry."
  [cache-key f]
  (cached-candidate *candidate-analysis-cache* cache-key f))

(defn- cached-candidate-batch-analysis
  [cache-key f]
  (cached-candidate *candidate-batch-cache* cache-key f))
(def ^:private categorical-filter-operators
  #{:= :!= :in :not-in :is-null :not-null :is-empty :not-empty})

(def ^:private candidate-card-columns
  [:model/Card :id :name :description :type :database_id :dataset_query :card_schema :collection_id :view_count])

(def ^:private candidate-query-batch-size 200)

(defn- mapcat-id-batches
  [f ids]
  (into [] (mapcat f) (partition-all candidate-query-batch-size ids)))

(defn- select-candidate-cards-by-id
  [card-ids]
  (mapcat-id-batches
   #(t2/select candidate-card-columns
               :id [:in %]
               :archived false
               :type [:in [:question :model]])
   card-ids))

(defn- verified-card-ids
  [card-ids]
  (into #{}
        (mapcat #(t2/select-fn-set :moderated_item_id :model/ModerationReview
                                   :moderated_item_id [:in %]
                                   :moderated_item_type "card"
                                   :most_recent true
                                   :status "verified"))
        (partition-all candidate-query-batch-size card-ids)))

(defn- official-collection-ids
  [collection-ids]
  (into #{}
        (mapcat #(t2/select-pks-set :model/Collection
                                    :id [:in %]
                                    :authority_level "official"))
        (partition-all candidate-query-batch-size collection-ids)))

(defn- exclude-personal-collection-cards
  [cards]
  (let [collection-ids          (into #{} (keep :collection_id) cards)
        collections             (-> (mapcat-id-batches
                                     #(t2/select [:model/Collection :id :location :personal_owner_id]
                                                 :id [:in %])
                                     collection-ids)
                                    (t2/hydrate :is_personal))
        personal-collection-ids (into #{} (comp (filter :is_personal) (map :id)) collections)]
    (into []
          (remove #(contains? personal-collection-ids (:collection_id %)))
          cards)))

(defn- recent-card-view-counts
  [card-ids days]
  (let [cutoff (t/minus (t/offset-date-time) (t/days days))]
    (into {}
          (comp
           (mapcat #(t2/select [:model/ViewLog :model_id [:%count.* :view_count]]
                               {:where    [:and
                                           [:= :model "card"]
                                           [:>= :timestamp cutoff]
                                           [:in :model_id %]]
                                :group-by [:model_id]}))
           (map (fn [{:keys [model_id view_count]}]
                  [model_id (long view_count)])))
          (partition-all candidate-query-batch-size card-ids))))

(defn- select-candidate-source-cards
  [source]
  (exclude-personal-collection-cards
   (if source
     (let [card-ids (set (query-source/card-ids source))]
       (mu/validate-throw [:set pos-int?] card-ids)
       (select-candidate-cards-by-id card-ids))
     (t2/select candidate-card-columns
                :archived false
                :type [:in [:question :model]]))))

(defn- candidate-source-cards*
  [{:keys [min-view-count query-source view-count-window-days]}]
  (let [min-view-count     (or min-view-count candidate-default-min-view-count)
        cards              (select-candidate-source-cards query-source)
        card-ids           (into #{} (map :id) cards)
        collection-ids     (into #{} (keep :collection_id) cards)
        recent-view-counts (when view-count-window-days
                             (recent-card-view-counts card-ids view-count-window-days))
        verified-ids       (verified-card-ids card-ids)
        official-ids       (official-collection-ids collection-ids)]
    (cond->> cards
      true
      (map (fn [{:keys [id collection_id view_count] :as card}]
             (let [view-count (if view-count-window-days
                                (get recent-view-counts id 0)
                                (long (or view_count 0)))]
               (assoc card
                      :verified?            (contains? verified-ids id)
                      :official-collection? (contains? official-ids collection_id)
                      :popular?             (>= view-count min-view-count)
                      :view-count           view-count))))

      ;; With no explicit source, preserve the original curated-or-popular default universe.
      ;; An explicit source controls inclusion; these signals remain evidence used by ranking.
      (nil? query-source)
      (filter (some-fn :verified? :official-collection? :popular?))

      true
      (sort-by :id)

      true
      vec)))

(defn candidate-source-cards
  "Load selected Cards and attach deterministic curation and usage evidence."
  [{:keys [min-view-count query-source view-count-window-days] :as opts}]
  (cached-candidate-batch-analysis
   [::candidate-source-cards min-view-count query-source view-count-window-days]
   #(candidate-source-cards* opts)))

(defn qualified-card-ids
  "Return the default persisted-cleanup population without loading query definitions."
  ([] (qualified-card-ids candidate-default-min-view-count nil))
  ([min-view-count] (qualified-card-ids min-view-count nil))
  ([min-view-count view-count-window-days]
   (let [cards              (exclude-personal-collection-cards
                             (t2/select [:model/Card :id :collection_id :view_count]
                                        :archived false
                                        :type [:in [:question :model]]))
         card-ids           (into #{} (map :id) cards)
         collection-ids     (into #{} (keep :collection_id) cards)
         recent-view-counts (when view-count-window-days
                              (recent-card-view-counts card-ids view-count-window-days))
         verified-ids       (verified-card-ids card-ids)
         official-ids       (official-collection-ids collection-ids)]
     (->> cards
          (keep (fn [{:keys [id collection_id view_count]}]
                  (let [view-count (if view-count-window-days
                                     (get recent-view-counts id 0)
                                     (long (or view_count 0)))]
                    (when (or (contains? verified-ids id)
                              (contains? official-ids collection_id)
                              (>= view-count min-view-count))
                      id))))
          sort
          vec))))

(defn- referenced-card-ids
  [dataset-query]
  (let [ids (volatile! #{})]
    (walk/postwalk
     (fn [node]
       (when (map? node)
         (when (pos-int? (:source-card node))
           (vswap! ids conj (:source-card node)))
         (when-let [source-table (:source-table node)]
           (when (and (string? source-table)
                      (str/starts-with? source-table "card__"))
             (when-let [id (parse-long (subs source-table 6))]
               (vswap! ids conj id)))))
       node)
     dataset-query)
    @ids))

(defn- select-lineage-cards
  [ids allowed-types]
  (into []
        (mapcat (fn [batch]
                  (t2/select [:model/Card :id :name :type :database_id :dataset_query :card_schema]
                             :id [:in batch]
                             :archived false
                             :type [:in allowed-types])))
        (partition-all candidate-query-batch-size ids)))

(defn- candidate-lineage-index
  [cards allowed-types]
  (loop [pending (into #{} (mapcat (comp referenced-card-ids :dataset_query)) cards)
         index   {}]
    (let [pending (set/difference pending (set (keys index)))]
      (if (empty? pending)
        index
        (let [rows (select-lineage-cards pending allowed-types)]
          (recur (into #{} (mapcat (comp referenced-card-ids :dataset_query)) rows)
                 (into index (map (juxt :id identity)) rows)))))))

(defn- candidate-lineage-card-index
  [cards]
  (cached-candidate-batch-analysis
   [::candidate-lineage-card-index (mapv :id cards)]
   #(candidate-lineage-index cards #{:question :model})))

(defn candidate-model-index
  "Index the saved models reachable from selected Cards."
  [cards]
  (into {}
        (filter (fn [[_id card]] (= :model (:type card))))
        (candidate-lineage-card-index cards)))

(defn- clauses-of-type
  [clause-type x]
  (filter #(lib/clause-of-type? % clause-type)
          (tree-seq sequential? seq x)))

(declare physical-clause)

(def ^:private contextual-field-option-keys
  "Field-ref options that describe how to reach a column from the current query context.

  Once a clause is moved to a definition sourced directly from the owning physical table,
  retaining these options would either make the ref invalid or silently reintroduce a join."
  #{:join-alias :source-field :source-field-name :source-field-join-alias :inherited-temporal-unit})

(defn- direct-columns
  [query stage-number clause]
  (try
    (let [columns (vec (distinct (lib/referenced-columns query stage-number clause)))]
      (when (and (seq columns)
                 (every? #(and (pos-int? (:id %)) (pos-int? (:table-id %))) columns))
        columns))
    (catch InterruptedException e
      (.interrupt (Thread/currentThread))
      (throw e))
    (catch Exception e
      (log/debug e "Failed to resolve candidate fields")
      nil)))

(defn- physical-clause
  "Rewrite every Field ref in `clause` to a direct physical Field-id ref.

  Returns the rewritten clause, its resolved columns, and their single owning table. If
  `expected-table-id` is non-nil, that table must be the owner. Clauses with unresolved,
  cross-table, or context-dependent refs are rejected."
  ([query stage-number clause expected-table-id]
   (physical-clause query stage-number clause expected-table-id false))
  ([query stage-number clause expected-table-id allow-no-fields?]
   (let [columns   (direct-columns query stage-number clause)
         table-ids (into #{} (map :table-id) columns)
         valid?    (atom true)
         rewritten
         (walk/postwalk
          (fn [x]
            (if (lib/clause-of-type? x :field)
              (let [field-columns (direct-columns query stage-number x)]
                (if (= 1 (count field-columns))
                  (let [column (first field-columns)]
                    (if (or (nil? expected-table-id)
                            (= expected-table-id (:table-id column)))
                      (-> x
                          (update 1 #(apply dissoc % contextual-field-option-keys))
                          (assoc 2 (:id column)))
                      (do (reset! valid? false) x)))
                  (do (reset! valid? false) x)))
              x))
          clause)]
     (when (and @valid?
                (or (and allow-no-fields? (empty? (clauses-of-type :field clause)))
                    (and (seq columns)
                         (= 1 (count table-ids))
                         (or (nil? expected-table-id)
                             (= expected-table-id (first table-ids))))))
       {:clause   rewritten
        :columns  (or columns [])
        :table-id (or expected-table-id (first table-ids))}))))

(defn- projection-only-stage?
  "Whether a stage preserves physical rows and field identity for a later stage.

  Explicit field selection and renaming are allowed; operations that change population,
  grain, values, or row multiplicity form a lineage barrier."
  [query stage-number table-id]
  (let [stage  (lib/query-stage query stage-number)
        fields (:fields stage)]
    (and (= :mbql.stage/mbql (:lib/type stage))
         (not (seq (:joins stage)))
         (not (seq (:expressions stage)))
         (not (seq (:filters stage)))
         (not (seq (:aggregation stage)))
         (not (seq (:breakout stage)))
         (not (seq (:order-by stage)))
         (nil? (:pivot stage))
         (nil? (:limit stage))
         (nil? (:page stage))
         (or (not (seq fields))
             (every? (fn [field]
                       (and (lib/clause-of-type? field :field)
                            (not-any? #(get (second field) %)
                                      [:temporal-unit :binning :source-field :join-alias])
                            (some? (physical-clause query stage-number field table-id))))
                     fields)))))

(defn- transparent-model-query?
  [query table-id]
  (and (= 1 (lib/stage-count query))
       (projection-only-stage? query 0 table-id)))

(defn- joined-stage?
  [stage]
  (or (boolean (seq (:joins stage)))
      (boolean
       (some (fn [[_tag opts _id-or-name]]
               (or (:join-alias opts) (:source-field opts)))
             (mapcat (partial clauses-of-type :field) (vals stage))))))

(defn- resolve-transparent-source
  [database-id source-card-id card-index eligible-card? seen]
  (when (and (pos-int? source-card-id)
             (not (contains? seen source-card-id)))
    (when-let [{card-database-id :database_id
                card-query-map   :dataset_query
                :keys            [id name]
                :as              card} (card-index source-card-id)]
      (when (and (eligible-card? card)
                 (= database-id card-database-id))
        (when-let [card-query (wrap-query database-id card-query-map)]
          (let [stage (when (= 1 (lib/stage-count card-query))
                        (lib/query-stage card-query 0))
                source
                (cond
                  (pos-int? (:source-table stage))
                  {:table-id (:source-table stage)
                   :model-lineage []}

                  (pos-int? (:source-card stage))
                  (resolve-transparent-source database-id
                                              (:source-card stage)
                                              card-index
                                              eligible-card?
                                              (conj seen source-card-id)))]
            (when (and source
                       (transparent-model-query? card-query (:table-id source)))
              (update source :model-lineage conj {:id id :name name}))))))))

(defn- resolve-model-source
  [database-id source-card-id model-index seen]
  (resolve-transparent-source database-id
                              source-card-id
                              model-index
                              #(= :model (:type %))
                              seen))

(defn query-stage-contexts
  "Return physically traceable MBQL stages up to the first semantic lineage barrier."
  [database-id dataset-query model-index]
  (when-let [query (wrap-query database-id dataset-query)]
    (let [stage (lib/query-stage query 0)
          source
          (cond
            (pos-int? (:source-table stage))
            {:table-id (:source-table stage)
             :model-lineage []}

            (pos-int? (:source-card stage))
            (resolve-model-source database-id (:source-card stage) model-index #{})

            :else nil)]
      (when source
        (loop [stage-number 0
               contexts    []]
          (if (= stage-number (lib/stage-count query))
            contexts
            (let [stage   (lib/query-stage query stage-number)
                  context (when (= :mbql.stage/mbql (:lib/type stage))
                            (assoc source
                                   :query query
                                   :stage-number stage-number
                                   :joined? (joined-stage? stage)
                                   :expressions? (boolean (seq (:expressions stage)))))
                  contexts (cond-> contexts context (conj context))]
              (if (and context
                       (projection-only-stage? query stage-number (:table-id source)))
                (recur (inc stage-number) contexts)
                contexts))))))))

(defn minimal-definition
  "Build a one-stage physical-table definition containing one clause."
  [query table-id clause-key clause]
  {:lib/type :mbql/query
   :database (:database query)
   :stages   [(assoc {:lib/type     :mbql.stage/mbql
                      :source-table table-id}
                     clause-key [clause])]})

(defn minimal-segment-definition
  "Build a one-stage physical-table Segment definition from ordered predicates."
  [query table-id predicates]
  {:lib/type :mbql/query
   :database (:database query)
   :stages   [{:lib/type     :mbql.stage/mbql
               :source-table table-id
               ;; Multiple top-level filters are implicitly ANDed by MBQL and render as separate filters in Data Studio.
               :filters      (vec predicates)}]})

(defn field-summary
  "Select stable Field identity and display metadata for candidate output."
  [{:keys [id name display-name]}]
  {:id           id
   :name         name
   :display-name (or display-name name)})

(defn simple-aggregation
  "Physicalize a primitive aggregation when it belongs to one table."
  [query stage-number aggregation table-id]
  (let [operator   (first aggregation)
        arg-count  (count aggregation)
        field-arg? (and (<= 3 arg-count)
                        (lib/clause-of-type? (nth aggregation 2 nil) :field))
        valid-shape?
        (case operator
          :count      (or (= arg-count 2) (and (= arg-count 3) field-arg?))
          :percentile (and (= arg-count 4)
                           field-arg?
                           (number? (nth aggregation 3))
                           (<= 0 (nth aggregation 3) 1))
          (and (= arg-count 3) field-arg?))]
    (when (and (contains? candidate-aggregation-operators operator)
               valid-shape?)
      (let [plain-count? (and (= operator :count) (= arg-count 2))]
        (when-let [{:keys [clause columns]}
                   (physical-clause query stage-number aggregation table-id plain-count?)]
          (when (or plain-count? (= 1 (count columns)))
            {:clause clause
             :info   (cond-> {:type  operator
                              :field (some-> (first columns) field-summary)}
                       (= operator :percentile) (assoc :percentile (nth aggregation 3)))}))))))

(defn- categorical-column?
  [column]
  ((some-fn lib.types.isa/category?
            lib.types.isa/boolean?
            lib.types.isa/string?
            lib.types.isa/foreign-key?
            lib.types.isa/primary-key?)
   column))

(defn filter-atoms
  "Extract physicalized atomic filters for one stage."
  [query stage-number table-id categorical-only?]
  (into []
        (keep (fn [predicate]
                (when-let [{rewritten-predicate :clause
                            :keys               [columns table-id]}
                           (physical-clause query stage-number predicate table-id)]
                  (when (or (not categorical-only?)
                            (and (contains? categorical-filter-operators (first predicate))
                                 (= 1 (count columns))
                                 (categorical-column? (first columns))))
                    {:predicate rewritten-predicate
                     :columns   columns
                     :table-id  table-id}))))
        (lib/atomic-filters query stage-number)))

(defn- canonical-atom-sort-key
  [{:keys [predicate]}]
  (canonical-signature predicate))

(defn- combinations
  "Return all `k`-element combinations of `xs`, preserving input order inside each combination."
  [k xs]
  (cond
    (zero? k)        [[]]
    (empty? xs)      []
    (> k (count xs)) []
    :else
    (concat (map #(into [(first xs)] %) (combinations (dec k) (rest xs)))
            (combinations k (rest xs)))))

(defn- segment-subsets
  "Return all atom subsets of size 2..n. Callers bound n to five, so exhaustive enumeration is small."
  [atoms]
  (mapcat #(combinations % atoms) (range 2 (inc (count atoms)))))

(defn predicate-candidates
  "Expand ordered atoms into atomic and bounded composite predicate candidates."
  [atoms]
  (let [atoms           (sort-by canonical-atom-sort-key atoms)
        atom-candidates (mapv #(assoc % :predicates [(:predicate %)]) atoms)
        composite-candidates
        (when (<= 2 (count atoms) 5)
          (for [subset (segment-subsets atoms)]
            {:predicate  (lib/simplify-compound-filter
                          (apply lib/and (map :predicate subset)))
             :predicates (mapv :predicate subset)
             :columns    (vec (distinct (mapcat :columns subset)))}))]
    (into atom-candidates composite-candidates)))

(defn conditional-aggregation
  "Combine an eligible primitive aggregation with a candidate predicate."
  [aggregation aggregation-info {:keys [predicate predicates columns]}]
  (let [operator (:type aggregation-info)
        field    (nth aggregation 2 nil)
        clause   (case operator
                   :count    (when-not (:field aggregation-info)
                               (lib/count-where predicate))
                   :distinct (lib/distinct-where field predicate)
                   :sum      (lib/sum-where field predicate)
                   nil)]
    (when clause
      {:clause clause
       :info   {:type                 (first clause)
                :field                (:field aggregation-info)
                :condition            predicate
                :condition-fields     (mapv field-summary columns)
                :condition-atom-count (count predicates)}})))

(defn segment-signature
  "Return the table-scoped canonical signature for a predicate set."
  [table-id predicates]
  [table-id (vec (sort (map canonical-signature predicates)))])

(defn- source-item-evidence
  [source-items]
  (let [{:keys [id name type verified? official-collection? popular? view-count model-lineage]}
        (first source-items)]
    (cond-> {:id                   id
             :name                 name
             :type                 type
             :verified?            verified?
             :official-collection? official-collection?
             :popular?             popular?
             :view-count           view-count
             :stage-numbers        (->> source-items (map :stage-number) distinct sort vec)
             :joined?              (boolean (some :joined? source-items))}
      (seq model-lineage) (assoc :model-lineage model-lineage))))

(defn candidate-evidence
  "Aggregate source Cards into de-duplicated curation and usage evidence."
  [source-items]
  (let [items (->> source-items
                   (group-by :id)
                   vals
                   (map source-item-evidence)
                   (sort-by :id)
                   vec)]
    {:source-items          items
     :distinct-source-count (count items)
     :verified-source-count (count (filter :verified? items))
     :official-source-count (count (filter :official-collection? items))
     :popular-source-count  (count (filter :popular? items))
     :total-view-count      (reduce + 0 (map :view-count items))}))

(defn candidate-sort-key
  "Return the deterministic priority key shared by Measure and Segment candidates."
  [{:keys [atom-count aggregation evidence], signature ::signature}]
  [(if (pos? (:verified-source-count evidence)) 0 1)
   (if (pos? (:official-source-count evidence)) 0 1)
   (- (:distinct-source-count evidence))
   (or atom-count (:condition-atom-count aggregation) 0)
   (- (:total-view-count evidence))
   signature])
