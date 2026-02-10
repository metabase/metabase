(ns metabase.lib.query
  (:refer-clojure :exclude [remove some select-keys mapv empty? #?(:clj for)])
  (:require
   [medley.core :as m]
   ;; allowed since this is needed to convert legacy queries to MBQL 5
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [some select-keys mapv empty? #?(:clj for)]]
   [weavejester.dependency :as dep]))

(defmethod lib.metadata.calculation/metadata-method :mbql/query
  [_query _stage-number _x]
  ;; not i18n'ed because this shouldn't be developer-facing.
  (throw (ex-info "You can't calculate a metadata map for a query! Use lib.metadata.calculation/returned-columns-method instead."
                  {})))

(defmethod lib.metadata.calculation/returned-columns-method :mbql/query
  [query stage-number a-query options]
  (lib.metadata.calculation/returned-columns query stage-number (lib.util/query-stage a-query stage-number) options))

(defmethod lib.metadata.calculation/display-name-method :mbql/query
  [query stage-number x style]
  (lib.metadata.calculation/display-name query stage-number (lib.util/query-stage x stage-number) style))

(mu/defn native? :- :boolean
  "Given a query, return whether it is a native query."
  [query :- ::lib.schema/query]
  (let [stage (lib.util/query-stage query 0)]
    (= (:lib/type stage) :mbql.stage/native)))

(defmethod lib.metadata.calculation/display-info-method :mbql/query
  [_query _stage-number query]
  {:is-native   (native? query)
   :is-editable (lib.metadata/editable? query)})

(mu/defn stage-count :- ::lib.schema.common/int-greater-than-or-equal-to-zero
  "Returns the count of stages in query"
  [query :- ::lib.schema/query]
  (count (:stages query)))

(defmulti can-run-method
  "Returns whether the query is runnable based on first stage :lib/type"
  {:arglists '([query card-type])}
  (fn [query _card-type]
    (:lib/type (lib.util/query-stage query 0))))

(defmethod can-run-method :default
  [_query _card-type]
  true)

(defmethod can-run-method :mbql.stage/mbql
  [query card-type]
  (or (not= card-type :metric)
      (let [stage        (lib.util/query-stage query 0)
            aggregations (:aggregation stage)
            breakouts    (:breakout stage)]
        (and (= (stage-count query) 1)
             (= (count aggregations) 1)
             (or (empty? breakouts)
                 (and (= (count breakouts) 1)
                      (-> (lib.metadata.calculation/metadata query (first breakouts))
                          ;; extraction units change `:effective-type` to `:type/Integer`, so remove temporal bucketing
                          ;; before doing type checks
                          (lib.temporal-bucket/with-temporal-bucket nil)
                          lib.types.isa/date-or-datetime?)))))))

(mu/defn can-run :- :boolean
  "Returns whether the query is runnable. Manually validate schema for cljs."
  [query :- ::lib.schema/query
   card-type :- ::lib.schema.metadata/card.type]
  (and (binding [lib.schema.expression/*suppress-expression-type-check?* true]
         (mr/validate ::lib.schema/query query))
       (:database query)
       (boolean (can-run-method query card-type))))

(defmulti can-save-method
  "Returns whether the query can be saved based on first stage :lib/type."
  {:arglists '([query card-type])}
  (fn [query _card-type]
    (:lib/type (lib.util/query-stage query 0))))

(defmethod can-save-method :default
  [_query _card-type]
  true)

;;; TODO FIXME -- boolean functions should end in `?`
(mu/defn can-save :- :boolean
  "Returns whether `query` for a card of `card-type` can be saved."
  [query :- ::lib.schema/query
   card-type :- ::lib.schema.metadata/card.type]
  (and (lib.metadata/editable? query)
       (can-run query card-type)
       (boolean (can-save-method query card-type))))

(mu/defn can-preview :- :boolean
  "Returns whether the query can be previewed.

  Right now, this is a special case of [[can-run]]."
  [query :- ::lib.schema/query]
  (can-run query "question"))

(mu/defn add-types-to-fields
  "Add `:base-type` and `:effective-type` to options of fields in `x` using `metadata-provider`. Works on pmbql fields.
  `:effective-type` is required for coerced fields to pass schema checks."
  [x metadata-provider :- ::lib.schema.metadata/metadata-provider]
  (if-let [field-ids (lib.util.match/match x
                       [:field
                        (_options :guard (every-pred map? (complement (every-pred :base-type :effective-type))))
                        (id :guard integer? pos?)]
                       (when-not (some #{:mbql/stage-metadata} &parents)
                         id))]
    ;; "pre-warm" the metadata provider
    (do (lib.metadata/bulk-metadata metadata-provider :metadata/column field-ids)
        (lib.util.match/replace
          x
          [:field
           (options :guard (every-pred map? (complement (every-pred :base-type :effective-type))))
           (id :guard pos-int?)]
          (if (some #{:mbql/stage-metadata} &parents)
            &match
            (update &match 1 merge
                   ;; TODO: For brush filters, query with different base type as in metadata is sent from FE. In that
                   ;;       case no change is performed. Find a way how to handle this properly!
                    (when-not (and (some? (:base-type options))
                                   (not= (:base-type options)
                                         (:base-type (lib.metadata/field metadata-provider id))))
                     ;; Following key is used to track which base-types we added during `query` call. It is used in
                     ;; [[metabase.lib.convert/options->legacy-MBQL]] to remove those, so query after conversion
                     ;; as legacy -> pmbql -> legacy looks closer to the original.
                      (merge (when-not (contains? options :base-type)
                               {::transformation-added-base-type true})
                             (-> (lib.metadata/field metadata-provider id)
                                 (select-keys [:base-type :effective-type]))))))))
    x))

(mu/defn query-with-stages :- ::lib.schema/query
  "Create a query from a sequence of stages."
  ([metadata-providerable stages]
   (query-with-stages (:id (lib.metadata/database metadata-providerable)) metadata-providerable stages))

  ([database-id           :- ::lib.schema.id/database
    metadata-providerable :- ::lib.schema.metadata/metadata-providerable
    stages]
   (->> (merge
         {:lib/type     :mbql/query
          :lib/metadata (lib.metadata/->metadata-provider metadata-providerable)
          :stages       stages}
         ;; this can be nil in the FE with empty metadata providers, don't stomp on existing DB IDs that are
         ;; not nil.
         (when database-id
           {:database database-id}))
        (lib.normalize/normalize ::lib.schema/query))))

(defn- query-from-legacy-query
  [metadata-providerable legacy-query]
  (try
    (let [mbql5-query (binding [lib.schema.expression/*suppress-expression-type-check?* true]
                        (lib.convert/->pMBQL (mbql.normalize/normalize-or-throw legacy-query)))
          mp          (lib.metadata/->metadata-provider metadata-providerable (:database mbql5-query))
          mbql5-query (add-types-to-fields mbql5-query mp)]
      (merge
       mbql5-query
       (query-with-stages mp (:stages mbql5-query))))
    (catch #?(:clj Throwable :cljs :default) e
      (throw (ex-info (i18n/tru "Error creating query from legacy query: {0}" (ex-message e))
                      {:legacy-query legacy-query}
                      e)))))

(defmulti ^:private query-method
  "Implementation for [[query]]."
  {:arglists '([metadata-providerable x])}
  (fn [_metadata-providerable x]
    ((some-fn lib.util/normalized-query-type lib.dispatch/dispatch-value) x))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod query-method :query ; legacy MBQL query
  [metadata-providerable legacy-query]
  (query-from-legacy-query metadata-providerable legacy-query))

(defmethod query-method :native ; legacy native query
  [metadata-providerable legacy-query]
  (query-from-legacy-query metadata-providerable legacy-query))

(defmethod query-method :dispatch-type/map
  [metadata-providerable query]
  (query-method metadata-providerable (assoc (lib.convert/->pMBQL query) :lib/type :mbql/query)))

;;; this should already be a query in the shape we want but:
;; - let's make sure it has the database metadata that was passed in
;; - fill in field refs with metadata (#33680)
;; - fill in top expression refs with metadata
(defmethod query-method :mbql/query
  [metadata-providerable {converted? :lib.convert/converted? :as query}]
  (let [database-id       (some #(get query %) [:database "database"])
        metadata-provider (lib.metadata/->metadata-provider metadata-providerable database-id)
        query             (-> query
                              (assoc :lib/metadata metadata-provider)
                              (dissoc :lib.convert/converted?)
                              lib.normalize/normalize)
        stages (:stages query)]
    (-> query
        (cond-> converted?
          (assoc
           :stages
           (mapv (fn [[stage-number stage]]
                   (-> stage
                       (add-types-to-fields metadata-provider)
                       (lib.util.match/replace
                         [:expression
                          (opts :guard (every-pred map? (complement (every-pred :base-type :effective-type))))
                          expression-name]
                         (let [found-ref (try
                                           (m/remove-vals
                                            #(= :type/* %)
                                            (-> (lib.expression/expression-ref query stage-number expression-name)
                                                second
                                                (select-keys [:base-type :effective-type])))
                                           (catch #?(:clj Exception :cljs :default) _
                                             ;; This currently does not find expressions defined in join stages
                                             nil))]
                           ;; Fallback if metadata is missing
                           [:expression (merge found-ref opts) expression-name]))))
                 (m/indexed stages))))
        (->> (lib.normalize/normalize ::lib.schema/query)))))

(defmethod query-method :metadata/table
  [metadata-providerable table-metadata]
  (query-with-stages metadata-providerable
                     [{:lib/type     :mbql.stage/mbql
                       :source-table (u/the-id table-metadata)}]))

(declare query)

(defn- metric-query
  [metadata-providerable card-metadata]
  (let [card-id (u/the-id card-metadata)
        metric-first-stage (-> (query metadata-providerable (:dataset-query card-metadata))
                               (lib.util/query-stage 0))
        base-query (query-with-stages metadata-providerable
                                      [(select-keys metric-first-stage [:lib/type :source-card :source-table])])
        base-query (reduce
                    #(lib.util/add-summary-clause %1 0 :breakout %2)
                    base-query
                    (:breakout metric-first-stage))]
    (-> base-query
        (lib.util/add-summary-clause
         0 :aggregation
         (lib.options/ensure-uuid [:metric {} card-id])))))

(defmethod query-method :metadata/card
  [metadata-providerable card-metadata]
  (if (or (= (:type card-metadata) :metric)
          (= (:lib/type card-metadata) :metadata/metric))
    (metric-query metadata-providerable card-metadata)
    (query-with-stages metadata-providerable
                       [{:lib/type :mbql.stage/mbql
                         :source-card (u/the-id card-metadata)}])))

(defmethod query-method :metadata/metric
  [metadata-providerable card-metadata]
  (metric-query metadata-providerable card-metadata))

(defmethod query-method :mbql.stage/mbql
  [metadata-providerable mbql-stage]
  (query-with-stages metadata-providerable [mbql-stage]))

(defmethod query-method :mbql.stage/native
  [metadata-providerable native-stage]
  (query-with-stages metadata-providerable [native-stage]))

(defn- ensure-cached-metadata-provider
  "Ensure `a-query` has a cached metadata provider (needed so we can use the general `cached-value` and `cache-value!`
  facilities; wrap the current metadata in one that adds caching if needed."
  [a-query]
  (let [mp         (:lib/metadata a-query)
        cached-mp? (lib.metadata.protocols/cached-metadata-provider-with-cache? mp)]
    (cond-> a-query
      (and mp (not cached-mp?)) (update :lib/metadata lib.metadata.cached-provider/cached-metadata-provider))))

(mu/defn query :- ::lib.schema/query
  "Create a new MBQL query from anything that could conceptually be an MBQL query, like a Database or Table or an
  existing MBQL query or saved question or whatever. If the thing in question does not already include metadata, pass
  it in separately -- metadata is needed for most query manipulation operations."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   x :- some?]
  (ensure-cached-metadata-provider (query-method metadata-providerable x)))

(mu/defn ->query :- ::lib.schema/query
  "[[->]] friendly form of [[query]].

  Create a new MBQL query from anything that could conceptually be an MBQL query, like a Database or Table or an
  existing MBQL query or saved question or whatever. If the thing in question does not already include metadata, pass
  it in separately -- metadata is needed for most query manipulation operations."
  [x
   metadata-providerable :- ::lib.schema.metadata/metadata-providerable]
  (query metadata-providerable x))

(mu/defn query-from-legacy-inner-query :- ::lib.schema/query
  "Create a pMBQL query from a legacy inner query."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   database-id           :- ::lib.schema.id/database
   inner-query           :- :map]
  (->> (lib.convert/legacy-query-from-inner-query database-id inner-query)
       lib.convert/->pMBQL
       (query metadata-providerable)))

(defn ->legacy-MBQL
  "Convert the pMBQL `a-query` into a legacy MBQL query."
  [a-query]
  (-> a-query lib.convert/->legacy-MBQL))

(mu/defn with-different-table :- ::lib.schema/query
  "Changes an existing query to use a different source table or card.
   Can be passed an integer table id or a legacy `card__<id>` string."
  [original-query :- ::lib.schema/query
   table-id :- [:or ::lib.schema.id/table :string]]
  (let [metadata-provider (lib.metadata/->metadata-provider original-query)]
    (query metadata-provider (lib.metadata/table-or-card metadata-provider table-id))))

(defn- occurs-in-expression?
  [expression-clause clause-type expression-body]
  (or (and (lib.util/clause-of-type? expression-clause clause-type)
           (= (nth expression-clause 2) expression-body))
      (and (sequential? expression-clause)
           (boolean
            (some #(occurs-in-expression? % clause-type expression-body)
                  (nnext expression-clause))))))

(defn- occurs-in-stage-clause?
  "Tests whether predicate `pred` is true for an element of clause `clause` of `query-or-join`.
  The test is transitive over joins."
  [query-or-join clause pred]
  (boolean
   (some (fn [stage]
           (or (some pred (clause stage))
               (some #(occurs-in-stage-clause? % clause pred) (:joins stage))))
         (:stages query-or-join))))

(mu/defn uses-segment? :- :boolean
  "Tests whether `a-query` uses segment with ID `segment-id`.
  `segment-id` can be a regular segment ID or a string. The latter is for symmetry
  with [[uses-metric?]]."
  [a-query :- ::lib.schema/query
   segment-id :- [:or ::lib.schema.id/segment :string]]
  (occurs-in-stage-clause? a-query :filters #(occurs-in-expression? % :segment segment-id)))

(mu/defn uses-metric? :- :boolean
  "Tests whether `a-query` uses metric with Card ID `card-id`."
  [a-query :- ::lib.schema/query
   card-id :- ::lib.schema.id/card]
  (occurs-in-stage-clause? a-query :aggregation #(occurs-in-expression? % :metric card-id)))

(def ^:private clause-types-order
  ;; When previewing some clause type `:x`, we drop the prefix of this list up to but excluding `:x`.
  ;; So if previewing `:aggregation`, we drop `:limit` and `:order-by`;
  ;; if previewing `:filters` we drop `:limit`, `:order-by`, `:aggregation` and `:breakout`.
  ;; (In practice `:breakout` is never previewed separately, but the order is important to get the behavior above.
  ;; There are tests for this.)
  [:limit :order-by :aggregation :breakout :filters :expressions :joins :data])

(defn- preview-stage [stage clause-type clause-index]
  (let [to-drop (take-while #(not= % clause-type) clause-types-order)]
    (cond-> (reduce dissoc stage to-drop)
      clause-index (update clause-type #(vec (take (inc clause-index) %))))))

(mu/defn preview-query :- [:maybe ::lib.schema/query]
  "*Truncates* a query for use in the Notebook editor's \"preview\" system.

  Takes `query` and `stage-index` as usual.

  - Stages later than `stage-index` are dropped.
  - `clause-type` is an enum (see below); all clauses of *later* types are dropped.
  - `clause-index` is optional: if not provided then all clauses are kept; if it's a number than clauses
    `[0, clause-index]` are kept. (To keep no clauses, specify the earlier `clause-type`.)

  The `clause-type` enum represents the steps of the notebook editor, in the order they appear in the notebook:

  - `:data` - just the source data for the stage
  - `:joins`
  - `:expressions`
  - `:filters`
  - `:breakout`
  - `:aggregation`
  - `:order-by`
  - `:limit`"
  [a-query      :- ::lib.schema/query
   stage-number :- :int
   clause-type  :- [:enum :data :joins :expressions :filters :aggregation :breakout :order-by :limit]
   clause-index :- [:maybe :int]]
  (when (native? a-query)
    (throw (ex-info "preview-query cannot be called on native queries" {:query a-query})))
  (let [stage-number (lib.util/canonical-stage-index a-query stage-number)]
    (-> a-query
        (update :stages #(vec (take (inc stage-number) %)))
        (update-in [:stages stage-number] preview-stage clause-type clause-index))))

(mu/defn wrap-native-query-with-mbql :- [:map
                                         [:query ::lib.schema/query]
                                         [:stage-number :int]]
  "Given a query and stage number, return a possibly-updated query and stage number which is guaranteed to be MBQL and
  so to support drill-thru and similar logic. Such a query must be saved, hence the `card-id`.

  If the provided query is already MBQL, this is transparent.

  Returns `{:query query', :stage-number stage-number'}`.

  You might find it more convenient to call [[with-wrapped-native-query]]."
  [a-query      :- ::lib.schema/query
   stage-number :- :int
   card-id      :- [:maybe ::lib.schema.id/card]]
  (or (and (lib.util/native-stage? a-query stage-number)
           card-id
           (if-let [card (lib.metadata/card a-query card-id)]
             {:query        (query a-query card)
              :stage-number -1}
             (do
               (log/warn "Failed to wrap native query with MBQL; card not found" {:query   a-query
                                                                                  :card-id card-id})
               nil)))
      {:query        a-query
       :stage-number stage-number}))

(defn with-wrapped-native-query
  "Calls [[wrap-native-query-with-mbql]] on the given `a-query`, `stage-number` and `card-id`, then calls
  `(f a-query' stage-number' args...)` using the query and stage number for the wrapper."
  [a-query stage-number card-id f & args]
  (let [{q :query, n :stage-number} (wrap-native-query-with-mbql a-query stage-number card-id)]
    (apply f q n args)))

(defn- template-tag-stages
  [template-tags]
  (for [{:keys [card-id snippet-id] tag-type :type} (vals template-tags)
        :when (#{:card :snippet} tag-type)]
    (case tag-type
      :card {:source-card card-id}
      :snippet {:source-snippet-id snippet-id})))

(defn- stage-seq* [query-fragment]
  (cond
    (vector? query-fragment)
    (case (first query-fragment)
      :metric
      [{:source-card (get query-fragment 2)}]

      (mapcat stage-seq* query-fragment))

    (map? query-fragment)
    (if (= (:lib/type query-fragment) :mbql.stage/native)
      (-> query-fragment :template-tags template-tag-stages)
      (concat (:stages query-fragment) (mapcat stage-seq* (vals query-fragment))))

    :else
    []))

(defn- stage-seq [from-entity a-query]
  ;; from-entity is [entity-type entity-id] like [:card 123] or [:snippet 456]
  (map #(assoc % ::from-entity from-entity) (stage-seq* a-query)))

(defn- snippet-seq [from-entity snippet]
  (map #(assoc % ::from-entity from-entity) (template-tag-stages (:template-tags snippet))))

(defn- expand-stage [metadata-provider stage]
  (let [{card-id    :source-card
         snippet-id :source-snippet-id} stage]
    (cond
      card-id
      (let [expanded-query (some->> card-id
                                    (lib.metadata/card metadata-provider)
                                    :dataset-query
                                    (query metadata-provider))]
        (stage-seq [:card card-id] expanded-query))

      snippet-id
      (when-let [snippet (lib.metadata/native-query-snippet metadata-provider snippet-id)]
        (snippet-seq [:snippet snippet-id] snippet))

      :else [])))

(defn- add-stage-dep [graph stage]
  (let [{card-id :source-card
         snippet-id :source-snippet-id
         table-id :source-table
         from-entity ::from-entity} stage]
    (try
      (cond-> graph
        card-id (dep/depend from-entity [:card card-id])
        snippet-id (dep/depend from-entity [:snippet snippet-id])
        table-id (dep/depend from-entity [:table table-id]))
      (catch #?(:clj Exception :cljs :default) e
        (throw (ex-info (i18n/tru "Cannot save card with cycles.") {} e))))))

(defn- build-card-snippet-graph [source-entity metadata-provider a-query]
  (loop [graph (dep/graph)
         stages-visited 0
         stages (stage-seq source-entity a-query)]
    (cond
      (empty? stages)
      graph

      (> stages-visited 1000)
      (throw (ex-info (i18n/tru "There are too many stages (>1000) to save card.") {}))

      :else
      (let [[stage & stages] stages]
        (recur (add-stage-dep graph stage)
               (inc stages-visited)
               (concat stages (expand-stage metadata-provider stage)))))))

(defn check-card-overwrite
  "Returns nil if the card with given `card-id` can be overwritten with `query`.
  Throws `ExceptionInfo` with a user-facing message otherwise.

  Currently checks for cycles (self-referencing queries)."
  [card-id new-query]
  (build-card-snippet-graph [:card card-id] new-query new-query)
  ;; return nil if nothing throws
  nil)

(defn disable-max-results
  "Sets the `disable-max-results?` middleware option on `query`, which disables the `absolute-max-results` limit on
  query results. Used by transforms to allow unlimited result rows."
  [q]
  (assoc-in q [:middleware :disable-max-results?] true))
