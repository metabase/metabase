(ns metabase.lib.query
  (:refer-clojure :exclude [remove])
  (:require
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util :as mbql.u]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(defmethod lib.normalize/normalize :mbql/query
  [query]
  (lib.normalize/normalize-map
   query
   keyword
   {:type   keyword
    :stages (partial mapv lib.normalize/normalize)}))

(defmethod lib.metadata.calculation/metadata-method :mbql/query
  [_query _stage-number _query]
  ;; not i18n'ed because this shouldn't be developer-facing.
  (throw (ex-info "You can't calculate a metadata map for a query! Use lib.metadata.calculation/returned-columns-method instead."
                  {})))

(defmethod lib.metadata.calculation/returned-columns-method :mbql/query
  [query stage-number a-query options]
  (lib.metadata.calculation/returned-columns query stage-number (lib.util/query-stage a-query stage-number) options))

(defmethod lib.metadata.calculation/display-name-method :mbql/query
  [query stage-number x style]
  (lib.metadata.calculation/display-name query stage-number (lib.util/query-stage x stage-number) style))

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

(mu/defn query-with-stage
  "Create a query from a specific stage."
  ([metadata-providerable stage]
   (query-with-stages metadata-providerable [stage]))

  ([database-id           :- ::lib.schema.id/database
    metadata-providerable :- lib.metadata/MetadataProviderable
    stage]
   (query-with-stages database-id metadata-providerable [stage])))

(mu/defn ^:private query-from-existing :- ::lib.schema/query
  [metadata-providerable :- lib.metadata/MetadataProviderable
   query                 :- lib.util/LegacyOrPMBQLQuery]
  (let [query (lib.convert/->pMBQL query)]
    (query-with-stages metadata-providerable (:stages query))))

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
                     (mbql.u/replace stage
                       [:field
                        (opts :guard (complement (some-fn :base-type :effective-type)))
                        (field-id :guard (every-pred number? pos?))]
                       (let [found-ref (-> (lib.metadata/field metadata-provider field-id)
                                           (select-keys [:base-type :effective-type]))]
                         ;; Fallback if metadata is missing
                         [:field (merge found-ref opts) field-id])
                       [:expression
                        (opts :guard (complement (some-fn :base-type :effective-type)))
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

(mu/defn with-different-table :- ::lib.schema/query
  "Changes an existing query to use a different source table or card.
   Can be passed an integer table id or a legacy `card__<id>` string."
  [original-query :- ::lib.schema/query
   table-id :- [:or ::lib.schema.id/table :string]]
  (let [metadata-provider (lib.metadata/->metadata-provider original-query)]
   (query metadata-provider (lib.metadata/table-or-card metadata-provider table-id))))
