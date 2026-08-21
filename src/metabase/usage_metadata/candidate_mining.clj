(ns metabase.usage-metadata.candidate-mining
  "Shared normalization and internal data contracts used by deterministic candidate miners."
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [java-time.api :as t]
   [metabase.collections.models.collection]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.usage-metadata.query-utils :as query-utils]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
(def ^:private candidate-aggregation-operators
  #{:count :sum :avg :min :max :distinct :median :stddev :var :percentile})
(def ^:private categorical-filter-operators
  #{:= :!= :in :not-in :is-null :not-null :is-empty :not-empty})

(def ^:private candidate-card-columns
  [:model/Card :id :name :description :type :database_id :dataset_query :card_schema :collection_id :view_count])

(def ^:private candidate-qualification-columns
  [:model/Card :id :collection_id :view_count])

(def ^:private candidate-query-batch-size 200)
(def ^:private max-composite-predicate-atoms
  "Upper bound on how many atomic predicates a mined composite Segment predicate may combine.
  Keeps segment-subsets's exhaustive subset enumeration small."
  5)

(defn- mapcat-id-batches
  [f ids]
  (into [] (mapcat f) (partition-all candidate-query-batch-size ids)))

(defn- select-candidate-cards-by-id
  [columns card-ids]
  (mapcat-id-batches
   #(t2/select columns
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
  [card-ids columns]
  (exclude-personal-collection-cards
   (if card-ids
     (select-candidate-cards-by-id columns card-ids)
     (t2/select columns
                :archived false
                :type [:in [:question :model]]))))

(defn- add-card-evidence
  [{:keys [min-view-count view-count-window-days recent-view-counts verified-ids official-ids]}
   {:keys [id collection_id view_count] :as card}]
  (let [view-count (if view-count-window-days
                     (get recent-view-counts id 0)
                     (long (or view_count 0)))]
    (assoc card
           :verified?            (contains? verified-ids id)
           :official-collection? (contains? official-ids collection_id)
           :popular?             (>= view-count min-view-count)
           :view-count           view-count)))

(defn- candidate-card-population
  [{:keys [card-columns card-ids min-view-count view-count-window-days]}]
  (let [min-view-count     (or min-view-count candidate-default-min-view-count)
        cards              (select-candidate-source-cards card-ids card-columns)
        selected-card-ids  (into #{} (map :id) cards)
        collection-ids     (into #{} (keep :collection_id) cards)
        recent-view-counts (when view-count-window-days
                             (recent-card-view-counts selected-card-ids view-count-window-days))
        verified-ids       (verified-card-ids selected-card-ids)
        official-ids       (official-collection-ids collection-ids)
        evidence           {:min-view-count         min-view-count
                            :view-count-window-days view-count-window-days
                            :recent-view-counts     recent-view-counts
                            :verified-ids           verified-ids
                            :official-ids           official-ids}
        cards              (map (partial add-card-evidence evidence) cards)
        ;; With no explicit IDs, preserve the original curated-or-popular default universe.
        ;; Explicit IDs control inclusion; these signals remain evidence used by ranking.
        cards              (if (nil? card-ids)
                             (filter (some-fn :verified? :official-collection? :popular?) cards)
                             cards)]
    (->> cards
         (sort-by :id)
         vec)))

(defn candidate-source-cards
  "Load selected Cards and attach deterministic curation and usage evidence."
  [opts]
  (candidate-card-population (assoc opts :card-columns candidate-card-columns)))

(defn qualified-card-ids
  "Return the default persisted-cleanup population without loading query definitions."
  ([] (qualified-card-ids candidate-default-min-view-count nil))
  ([min-view-count] (qualified-card-ids min-view-count nil))
  ([min-view-count view-count-window-days]
   (mapv :id
         (candidate-card-population {:card-columns           candidate-qualification-columns
                                     :min-view-count         min-view-count
                                     :view-count-window-days view-count-window-days}))))

(defn- legacy-source-card-id
  [source-table]
  (when (and (string? source-table)
             (str/starts-with? source-table "card__"))
    (parse-long (subs source-table 6))))

(defn- card-reference-ids
  [{:keys [source-card source-table]}]
  (filter pos-int? [source-card (legacy-source-card-id source-table)]))

(defn- referenced-card-ids
  [dataset-query]
  (into #{}
        (comp (filter map?) (mapcat card-reference-ids))
        (tree-seq coll? seq dataset-query)))

(defn- referenced-card-ids-in
  [cards]
  (into #{} (mapcat (comp referenced-card-ids :dataset_query)) cards))

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
  (loop [pending (referenced-card-ids-in cards)
         index   {}]
    (if-let [unresolved-ids (not-empty (into #{} (remove #(contains? index %)) pending))]
      (let [cards (select-lineage-cards unresolved-ids allowed-types)]
        (recur (referenced-card-ids-in cards)
               (into index (map (juxt :id identity)) cards)))
      index)))

(defn candidate-lineage-card-index
  "Return Cards referenced by `cards`, indexed by Card ID for lineage traversal."
  [cards]
  (candidate-lineage-index cards #{:question :model}))

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
  (query-utils/ignoring-exceptions
   #(let [columns (vec (distinct (lib/referenced-columns query stage-number clause)))]
      (when (and (seq columns)
                 (every? (fn [column] (and (pos-int? (:id column)) (pos-int? (:table-id column)))) columns))
        columns))
   #(log/debug % "Failed to resolve candidate fields")
   (constantly nil)))

(defn- rewrite-physical-field-ref
  [query stage-number expected-table-id field-ref]
  (let [columns (direct-columns query stage-number field-ref)
        column  (when (= 1 (count columns)) (first columns))]
    (when (and column
               (or (nil? expected-table-id)
                   (= expected-table-id (:table-id column))))
      (-> field-ref
          (update 1 #(apply dissoc % contextual-field-option-keys))
          (assoc 2 (:id column))))))

(defn- rewrite-physical-field-refs
  [query stage-number expected-table-id clause]
  (let [valid?    (volatile! true)
        rewritten (walk/postwalk
                   (fn [node]
                     (if-not (lib/clause-of-type? node :field)
                       node
                       (or (rewrite-physical-field-ref query stage-number expected-table-id node)
                           (do
                             (vreset! valid? false)
                             node))))
                   clause)]
    (when @valid? rewritten)))

(defn- valid-physical-source?
  [clause columns expected-table-id allow-no-fields?]
  (let [table-ids (into #{} (map :table-id) columns)]
    (or (and allow-no-fields?
             (empty? (clauses-of-type :field clause)))
        (and (seq columns)
             (= 1 (count table-ids))
             (or (nil? expected-table-id)
                 (= expected-table-id (first table-ids)))))))

(defn physical-clause
  "Rewrite every Field ref in `clause` to a direct physical Field-id ref.

  Returns the rewritten clause, its resolved columns, and their single owning table. If
  `expected-table-id` is non-nil, that table must be the owner. Clauses with unresolved,
  cross-table, or context-dependent refs are rejected."
  ([query stage-number clause expected-table-id]
   (physical-clause query stage-number clause expected-table-id false))
  ([query stage-number clause expected-table-id allow-no-fields?]
   (let [columns   (direct-columns query stage-number clause)
         rewritten (rewrite-physical-field-refs query stage-number expected-table-id clause)]
     (when (and rewritten
                (valid-physical-source? clause columns expected-table-id allow-no-fields?))
       {:clause   rewritten
        :columns  (or columns [])
        :table-id (or expected-table-id (:table-id (first columns)))}))))

(def ^:private semantic-barrier-collection-keys
  [:joins :expressions :filters :aggregation :breakout :order-by])

(def ^:private semantic-barrier-value-keys
  [:pivot :limit :page])

(defn- semantic-barrier-stage?
  [stage]
  (boolean
   (or (some #(seq (get stage %)) semantic-barrier-collection-keys)
       (some #(some? (get stage %)) semantic-barrier-value-keys))))

(def ^:private contextual-projection-field-option-keys
  [:temporal-unit :binning :source-field :join-alias])

(defn- direct-projection-field?
  [query stage-number table-id field]
  (and (lib/clause-of-type? field :field)
       (not-any? (second field) contextual-projection-field-option-keys)
       (some? (physical-clause query stage-number field table-id))))

(defn- projection-only-stage?
  "Whether a stage preserves physical rows and field identity for a later stage.

  Explicit field selection and renaming are allowed; operations that change population,
  grain, values, or row multiplicity form a lineage barrier."
  [query stage-number table-id]
  (let [stage  (lib/query-stage query stage-number)
        fields (:fields stage)]
    (and (= :mbql.stage/mbql (:lib/type stage))
         (not (semantic-barrier-stage? stage))
         (or (empty? fields)
             (every? #(direct-projection-field? query stage-number table-id %) fields)))))

(defn- transparent-model-query?
  [query table-id]
  (and (= 1 (lib/stage-count query))
       (projection-only-stage? query 0 table-id)))

(defn joined-stage?
  "Whether `stage` contains an explicit or implicit join."
  [stage]
  (or (boolean (seq (:joins stage)))
      (boolean
       (some (fn [[_tag opts _id-or-name]]
               (or (:join-alias opts) (:source-field opts)))
             (mapcat (partial clauses-of-type :field) (vals stage))))))

(defn resolve-transparent-source
  "Follow a projection-only saved-Card chain to its physical source table."
  [database-id source-card-id card-index eligible-card? seen]
  (let [candidate-card (when (and (pos-int? source-card-id)
                                  (not (contains? seen source-card-id)))
                         (card-index source-card-id))
        eligible-card  (when (and candidate-card
                                  (eligible-card? candidate-card)
                                  (= database-id (:database_id candidate-card)))
                         candidate-card)
        card-query     (when eligible-card
                         (query-utils/wrap-query database-id (:dataset_query eligible-card)))
        stage      (when (and card-query (= 1 (lib/stage-count card-query)))
                     (lib/query-stage card-query 0))
        source     (cond
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
      (update source :model-lineage conj (select-keys eligible-card [:id :name])))))

(defn- resolve-model-source
  [database-id source-card-id model-index seen]
  (resolve-transparent-source database-id
                              source-card-id
                              model-index
                              #(= :model (:type %))
                              seen))

(defn- query-root-source
  [database-id query model-index]
  (let [stage (lib/query-stage query 0)]
    (cond
      (pos-int? (:source-table stage))
      {:table-id (:source-table stage)
       :model-lineage []}

      (pos-int? (:source-card stage))
      (resolve-model-source database-id (:source-card stage) model-index #{}))))

(defn- stage-context
  [query source stage-number]
  (let [stage (lib/query-stage query stage-number)]
    (when (= :mbql.stage/mbql (:lib/type stage))
      (assoc source
             :query query
             :stage-number stage-number
             :joined? (joined-stage? stage)
             :expressions? (boolean (seq (:expressions stage)))))))

(defn- traceable-stage-contexts
  [query source]
  (reduce
   (fn [contexts stage-number]
     (if-let [context (stage-context query source stage-number)]
       (let [contexts (conj contexts context)]
         (if (projection-only-stage? query stage-number (:table-id source))
           contexts
           (reduced contexts)))
       (reduced contexts)))
   []
   (range (lib/stage-count query))))

(defn query-stage-contexts
  "Return physically traceable MBQL stages up to the first semantic lineage barrier."
  [database-id dataset-query model-index]
  (let [query  (query-utils/wrap-query database-id dataset-query)
        source (when query (query-root-source database-id query model-index))]
    (when source
      (traceable-stage-contexts query source))))

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

(defn- segment-subsets
  "Return all atom subsets of size 2..n. Callers bound n to max-composite-predicate-atoms, so
  exhaustive enumeration is small."
  [atoms]
  (mapcat #(math.combo/combinations atoms %) (range 2 (inc (count atoms)))))

(defn predicate-candidates
  "Expand ordered atoms into atomic and bounded composite predicate candidates."
  [atoms]
  (let [atoms           (sort-by canonical-atom-sort-key atoms)
        atom-candidates (mapv #(assoc % :predicates [(:predicate %)]) atoms)
        composite-candidates
        (when (<= 2 (count atoms) max-composite-predicate-atoms)
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

(defn aggregate-candidate-evidence
  "Aggregate de-duplicated source items after `source-item-projector` combines each source's observations."
  [source-items source-item-projector]
  (let [items (->> source-items
                   (group-by :id)
                   vals
                   (map source-item-projector)
                   (sort-by :id)
                   vec)]
    {:source-items          items
     :distinct-source-count (count items)
     :verified-source-count (count (filter :verified? items))
     :official-source-count (count (filter :official-collection? items))
     :popular-source-count  (count (filter :popular? items))
     :total-view-count      (reduce + 0 (map :view-count items))}))

(defn candidate-evidence
  "Aggregate source Cards into de-duplicated curation and usage evidence."
  [source-items]
  (aggregate-candidate-evidence source-items source-item-evidence))

(defn semantically-eligible-candidate?
  "Whether a normalized candidate contains enough reusable semantics to be recommended.

  Candidates use the mining shape: `:candidate-type`, `:aggregation`, `:atom-count`, and nested
  `:evidence`. Persistence converts database rows to this shape once before calling this function."
  [{:keys [candidate-type aggregation atom-count evidence]}]
  (case candidate-type
    :measure
    (and (not (and (= :count (:type aggregation))
                   (nil? (:field aggregation))))
         (or (not (contains? conditional-aggregation-operators (:type aggregation)))
             (pos? (:verified-source-count evidence))
             (pos? (:official-source-count evidence))
             (>= (:distinct-source-count evidence) 2)))

    :segment
    (or (= atom-count 1)
        (pos? (:verified-source-count evidence))
        (pos? (:official-source-count evidence))
        (>= (:distinct-source-count evidence) 2))

    (:table :metric)
    true

    (throw (ex-info "Unrecognized candidate-type" {:candidate-type candidate-type}))))

(defn candidate-sort-key
  "Return the deterministic priority key for a normalized candidate observation."
  [{:keys [atom-count aggregation evidence signature] namespaced-signature ::signature}]
  [(if (pos? (:verified-source-count evidence)) 0 1)
   (if (pos? (:official-source-count evidence)) 0 1)
   (- (:distinct-source-count evidence))
   (or atom-count (:condition-atom-count aggregation) 0)
   (- (:total-view-count evidence))
   (or signature namespaced-signature)])
