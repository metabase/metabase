(ns metabase.lib.query
  (:refer-clojure :exclude [remove])
  (:require
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(defmethod lib.metadata.calculation/metadata-method :mbql/query
  [_query _stage-number _likely-the-same-query]
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
  (and (mc/validate ::lib.schema/query query)
       (boolean (can-run-method query))))

(defmulti can-save-method
  "Returns whether the query can be saved based on first stage :lib/type."
  (fn [query _card-type]
    (:lib/type (lib.util/query-stage query 0))))

(defmethod can-save-method :default
  [_query _card-type]
  true)

(defmethod can-save-method :mbql.stage/mbql
  [query card-type]
  (or (not= card-type :metric)
      (let [last-stage (lib.util/query-stage query -1)]
        (= (-> last-stage :aggregation count) 1))))

(mu/defn can-save :- :boolean
  "Returns whether `query` for a card of `card-type` can be saved."
  [query :- ::lib.schema/query
   card-type :- ::lib.schema.metadata/card.type]
  (and (lib.metadata/editable? query)
       (can-run query)
       (boolean (can-save-method query card-type))))

(mu/defn query-with-stages :- ::lib.schema/query
  "Create a query from a sequence of stages."
  ([metadata-providerable stages]
   (query-with-stages (:id (lib.metadata/database metadata-providerable)) metadata-providerable stages))

  ([database-id           :- ::lib.schema.id/database
    metadata-providerable :- lib.metadata/MetadataProviderable
    stages]
   {:lib/type     :mbql/query
    :lib/metadata (lib.metadata/->metadata-provider metadata-providerable)
    :database     database-id
    :stages       stages}))

(defn- query-from-legacy-query
  [metadata-providerable legacy-query]
  (try
    (let [pmbql-query (lib.convert/->pMBQL (mbql.normalize/normalize-or-throw legacy-query))]
      (merge
       pmbql-query
       (query-with-stages metadata-providerable (:stages pmbql-query))))
    (catch #?(:clj Throwable :cljs :default) e
      (throw (ex-info (i18n/tru "Error creating query from legacy query: {0}" (ex-message e))
                      {:legacy-query legacy-query}
                      e)))))

(defn- query-from-unknown-query [metadata-providerable query]
  (assoc (lib.convert/->pMBQL query)
         :lib/type     :mbql/query
         :lib/metadata (lib.metadata/->metadata-provider metadata-providerable)))

(mu/defn ^:private query-from-existing :- ::lib.schema/query
  "Create a pMBQL query from either an existing pMBQL query (attaching metadata provider as needed), or from a legacy MBQL
  query (converting it to pMBQL)."
  [metadata-providerable :- lib.metadata/MetadataProviderable
   query                 :- :map]
  (let [f (if (some #(get query %) [:type "type"])
            query-from-legacy-query
            query-from-unknown-query)]
    (f metadata-providerable query)))

(defmulti ^:private query-method
  "Implementation for [[query]]."
  {:arglists '([metadata-providerable x])}
  (fn [_metadata-providerable x]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod query-method :dispatch-type/map
  [metadata-providerable query]
  (query-from-existing metadata-providerable query))

;;; this should already be a query in the shape we want but:
;; - let's make sure it has the database metadata that was passed in
;; - fill in field refs with metadata (#33680)
;; - fill in top expression refs with metadata
(defmethod query-method :mbql/query
  [metadata-providerable {converted? :lib.convert/converted? :as query}]
  (let [metadata-provider (lib.metadata/->metadata-provider metadata-providerable)
        query (-> query
                  (assoc :lib/metadata metadata-provider)
                  (dissoc :lib.convert/converted?))
        stages (:stages query)]
    (cond-> query
      converted?
      (assoc
        :stages
        (into []
              (map (fn [[stage-number stage]]
                     (lib.util.match/replace stage
                       [:field
                        (opts :guard (every-pred map? (complement (some-fn :base-type :effective-type))))
                        (field-id :guard (every-pred number? pos?))]
                       (let [found-ref (-> (lib.metadata/field metadata-provider field-id)
                                           (select-keys [:base-type :effective-type]))]
                         ;; Fallback if metadata is missing
                         [:field (merge found-ref opts) field-id])
                       [:expression
                        (opts :guard (every-pred map? (complement (some-fn :base-type :effective-type))))
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

(declare query)

(defmethod query-method :metadata/card
  [metadata-providerable card-metadata]
  (let [card-id (u/the-id card-metadata)
        base-query (query-with-stages metadata-providerable
                                      [{:lib/type :mbql.stage/mbql
                                        :source-card card-id}])]
    (if (= (:type card-metadata) :metric)
      (let [metric-query (query metadata-providerable (:dataset-query card-metadata))
            metric-breakouts (:breakout (lib.util/query-stage metric-query -1))
            base-query (reduce
                         #(lib.util/add-summary-clause %1 0 :breakout %2)
                         base-query
                         metric-breakouts)]
        (-> base-query
            (lib.util/add-summary-clause
              0 :aggregation
              (lib.options/ensure-uuid [:metric {} card-id]))))
      base-query)))

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
  [metadata-providerable :- lib.metadata/MetadataProviderable
   x]
  (query-method metadata-providerable x))

(mu/defn query-from-legacy-inner-query :- ::lib.schema/query
  "Create a pMBQL query from a legacy inner query."
  [metadata-providerable :- lib.metadata/MetadataProviderable
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
  "Tests whether `a-query` uses metric with ID `metric-id`.
  `metric-id` can be a regular metric ID or a string. The latter is to support
  some strange use-cases (see [[metabase.lib.metric-test/ga-metric-metadata-test]])."
  [a-query :- ::lib.schema/query
   metric-id :- [:or ::lib.schema.id/metric :string]]
  (occurs-in-stage-clause? a-query :aggregation #(occurs-in-expression? % :metric metric-id)))
