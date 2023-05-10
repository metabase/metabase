(ns metabase.lib.query
  (:refer-clojure :exclude [remove])
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defmethod lib.normalize/normalize :mbql/query
  [query]
  (lib.normalize/normalize-map
   query
   keyword
   {:type   keyword
    :stages (partial mapv lib.normalize/normalize)}))

(defmethod lib.metadata.calculation/metadata-method :mbql/query
  [query stage-number x]
  (lib.metadata.calculation/metadata query stage-number (lib.util/query-stage x stage-number)))

(defmethod lib.metadata.calculation/display-name-method :mbql/query
  [query stage-number x style]
  (lib.metadata.calculation/display-name query stage-number (lib.util/query-stage x stage-number) style))

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
  (let [query (lib.util/pipeline query)]
    (query-with-stages metadata-providerable (:stages query))))

(defmulti ^:private ->query
  "Implementation for [[query]]."
  {:arglists '([metadata-providerable x])}
  (fn [_metadata-providerable x]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod ->query :dispatch-type/map
  [metadata-providerable query]
  (query-from-existing metadata-providerable query))

;;; this should already be a query in the shape we want, but let's make sure it has the database metadata that was
;;; passed in
(defmethod ->query :mbql/query
  [metadata-providerable query]
  (assoc query :lib/metadata (lib.metadata/->metadata-provider metadata-providerable)))

(defmethod ->query :metadata/table
  [metadata-providerable table-metadata]
  (query-with-stages metadata-providerable
                     [{:lib/type     :mbql.stage/mbql
                       :source-table (:id table-metadata)}]))

(mu/defn query :- ::lib.schema/query
  "Create a new MBQL query from anything that could conceptually be an MBQL query, like a Database or Table or an
  existing MBQL query or saved question or whatever. If the thing in question does not already include metadata, pass
  it in separately -- metadata is needed for most query manipulation operations."
  [metadata-providerable :- lib.metadata/MetadataProviderable
   x]
  (->query metadata-providerable x))

;;; TODO -- the stuff below will probably change in the near future, please don't read too much in to it.
(mu/defn native-query :- ::lib.schema/query
  "Create a new native query.

  Native in this sense means a pMBQL query with a first stage that is a native query."
  ([metadata-providerable :- lib.metadata/MetadataProviderable
    inner-query]
   (native-query metadata-providerable nil inner-query))

  ;; TODO not sure if `results-metadata` should be StageMetadata (i.e., a map roughly matching the shape you get from
  ;; the QP) or a sequence of ColumnMetadatas, like what would be saved in Card `result_metadata`.
  ([metadata-providerable :- lib.metadata/MetadataProviderable
    results-metadata      :- lib.metadata/StageMetadata
    inner-query]
   (query-with-stages metadata-providerable
                      [(-> {:lib/type           :mbql.stage/native
                            :lib/stage-metadata results-metadata
                            :native             inner-query}
                           lib.options/ensure-uuid)])))

(mu/defn saved-question-query :- ::lib.schema/query
  "Convenience for creating a query from a Saved Question (i.e., a Card)."
  [metadata-providerable :- lib.metadata/MetadataProviderable
   {mbql-query :dataset-query, metadata :result-metadata, :as saved-question}]
  (assert mbql-query (i18n/tru "Saved Question is missing query"))
  (when-not metadata
    (log/warn (i18n/trs "Saved Question {0} {1} is missing result metadata"
                        (:id saved-question)
                        (pr-str (:name saved-question-query)))))
  (let [mbql-query (cond-> (assoc (lib.convert/->pMBQL mbql-query)
                                  :lib/metadata (lib.metadata/->metadata-provider metadata-providerable))
                     metadata
                     (lib.util/update-query-stage -1 assoc :lib/stage-metadata (lib.util/->stage-metadata metadata)))]
    (query metadata-providerable mbql-query)))

(mu/defn query-from-legacy-inner-query :- ::lib.schema/query
  "Create a pMBQL query from a legacy inner query."
  [metadata-providerable :- lib.metadata/MetadataProviderable
   database-id           :- ::lib.schema.id/database
   inner-query           :- :map]
  (->> (lib.convert/legacy-query-from-inner-query database-id inner-query)
       lib.convert/->pMBQL
       (query metadata-providerable)))
