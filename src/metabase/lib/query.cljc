(ns metabase.lib.query
  (:refer-clojure :exclude [remove])
  (:require
   [medley.core :as m]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.cache :as lib.cache]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

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
  (fn [query]
    (:lib/type (lib.util/query-stage query 0))))

(defmethod can-run-method :default
  [_query]
  true)

(mu/defn can-run :- :boolean
  "Returns whether the query is runnable. Manually validate schema for cljs."
  [query :- ::lib.schema/query]
  (and (binding [lib.schema.expression/*suppress-expression-type-check?* true]
         (mr/validate ::lib.schema/query query))
       (boolean (can-run-method query))))

(mu/defn can-save :- :boolean
  "Returns whether the query can be saved."
  [query :- ::lib.schema/query]
  (and (lib.metadata/editable? query)
       (can-run query)))

(mu/defn can-preview :- :boolean
  "Returns whether the query can be previewed.

  See [[metabase.lib.js/can-preview]] for how this differs from [[can-run]]."
  [query :- ::lib.schema/query]
  (and (can-run query)
       ;; Either it contains no expressions with `:offset`, or there is at least one order-by.
       (every? (fn [stage]
                 (boolean
                   (or (seq (:order-by stage))
                       (not (lib.util.match/match-one (:expressions stage) :offset)))))
               (:stages query))))

(defn add-types-to-fields
  "Add `:base-type` and `:effective-type` to options of fields in `x` using `metadata-provider`. Works on pmbql fields.
  `:effective-type` is required for coerced fields to pass schema checks."
  [x metadata-provider]
  (if-let [field-ids (lib.util.match/match x
                       [:field
                        (_options :guard (every-pred map? (complement (every-pred :base-type :effective-type))))
                        (id :guard (every-pred integer? pos?))]
                       (when-not (some #{:mbql/stage-metadata} &parents)
                         id))]
    ;; "pre-warm" the metadata provider
    (do (lib.metadata/bulk-metadata metadata-provider :metadata/column field-ids)
        (lib.util.match/replace
         x
         [:field
          (options :guard (every-pred map? (complement (every-pred :base-type :effective-type))))
          (id :guard (every-pred integer? pos?))]
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
   {:lib/type     :mbql/query
    :lib/metadata (lib.metadata/->metadata-provider metadata-providerable)
    :database     database-id
    :stages       stages}))

(defn- query-from-legacy-query
  [metadata-providerable legacy-query]
  (try
    (let [pmbql-query (-> (binding [lib.schema.expression/*suppress-expression-type-check?* true]
                            (lib.convert/->pMBQL (mbql.normalize/normalize-or-throw legacy-query)))
                          (add-types-to-fields metadata-providerable))]
      (merge
       pmbql-query
       (query-with-stages metadata-providerable (:stages pmbql-query))))
    (catch #?(:clj Throwable :cljs :default) e
      (throw (ex-info (i18n/tru "Error creating query from legacy query: {0}" (ex-message e))
                      {:legacy-query legacy-query}
                      e)))))

(defmulti ^:private query-method
  "Implementation for [[query]]."
  {:arglists '([metadata-providerable x])}
  (fn [_metadata-providerable x]
    (or (lib.util/normalized-query-type x)
        (lib.dispatch/dispatch-value x)))
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
  (let [metadata-provider (lib.metadata/->metadata-provider metadata-providerable)
        query (-> query
                  (assoc :lib/metadata metadata-provider)
                  (dissoc :lib.convert/converted?)
                  lib.normalize/normalize)
        stages (:stages query)]
    (cond-> query
      converted?
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
             (m/indexed stages))))))

(defmethod query-method :metadata/table
  [metadata-providerable table-metadata]
  (query-with-stages metadata-providerable
                     [{:lib/type     :mbql.stage/mbql
                       :source-table (u/the-id table-metadata)}]))

(defmethod query-method :metadata/card
  [metadata-providerable card-metadata]
  (query-with-stages metadata-providerable
                     [{:lib/type     :mbql.stage/mbql
                       :source-card (u/the-id card-metadata)}]))

(defmethod query-method :mbql.stage/mbql
  [metadata-providerable mbql-stage]
  (query-with-stages metadata-providerable [mbql-stage]))

(defmethod query-method :mbql.stage/native
  [metadata-providerable native-stage]
  (query-with-stages metadata-providerable [native-stage]))

(mu/defn query :- ::lib.schema/query
  "Create a new MBQL query from anything that could conceptually be an MBQL query, like a Database or Table or an
  existing MBQL query or saved question or whatever. If the thing in question does not already include metadata, pass
  it in separately -- metadata is needed for most query manipulation operations."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   x]
  (lib.cache/attach-query-cache (query-method metadata-providerable x)))

(mu/defn query-from-legacy-inner-query :- ::lib.schema/query
  "Create a pMBQL query from a legacy inner query."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   database-id           :- ::lib.schema.id/database
   inner-query           :- :map]
  (->> (lib.convert/legacy-query-from-inner-query database-id inner-query)
       lib.convert/->pMBQL
       (query metadata-providerable)))

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
  with [[uses-legacy-metric?]]."
  [a-query :- ::lib.schema/query
   segment-id :- [:or ::lib.schema.id/segment :string]]
  (occurs-in-stage-clause? a-query :filters #(occurs-in-expression? % :segment segment-id)))

(mu/defn uses-legacy-metric? :- :boolean
  "Tests whether `a-query` uses metric with ID `metric-id`.
  `metric-id` can be a regular metric ID or a string. The latter is to support
  some strange use-cases (see [[metabase.lib.legacy-metric-test/ga-metric-metadata-test]])."
  [a-query :- ::lib.schema/query
   metric-id :- [:or ::lib.schema.id/legacy-metric :string]]
  (occurs-in-stage-clause? a-query :aggregation #(occurs-in-expression? % :metric metric-id)))

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
