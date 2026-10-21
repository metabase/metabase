(ns metabase.metabot.tools.field-stats
  (:require
   [clojure.set :as set]
   [metabase.lib.core :as lib]
   [metabase.lib.walk :as lib.walk]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.metabot.query-analyzer :as query-analyzer]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.parameters.field-values :as params.field-values]
   [metabase.query-processor.interface :as qp.i]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.request.core :as request]
   [metabase.sync.core :as sync]
   [metabase.util.log :as log]))

(defn- build-field-statistics [fvs fp limit]
  (merge
   (when fp
     {:statistics (-> (or (:global fp) {})
                      (set/rename-keys {:nil% :percent-null})
                      (into (vals (:type fp))))})
   (when-let [values (-> fvs :values not-empty)]
     {:field_values       (into [] (if limit (take limit) identity) values)
      :field_values_total (count values)
      :has_more_values    (:has_more_values fvs)})))

(defn- get-or-create-fingerprint! [{:keys [id fingerprint] :as field}]
  (or fingerprint
      ;; Run with admin perms to match behavior during normal sync.
      (and (pos? (:updated-fingerprints (request/as-admin (sync/refingerprint-field! field))))
           (metabot.db/field-fingerprint id))))

(defn- query-row-restricted?
  [query]
  (try
    (let [query (binding [qp.i/*skip-middleware-because-app-db-access* true]
                  (request/as-admin (qp.preprocess/preprocess query)))
          table-ids (volatile! (set (lib/all-source-table-ids query)))]
      (lib.walk/walk-stages
       query
       (fn [query _path stage]
         (when (= (:lib/type stage) :mbql.stage/native)
           (let [{:keys [tables error]} (query-analyzer/tables-for-native (lib/query query stage))]
             (vswap! table-ids
                     (fn [ids]
                       (when (and ids (not error) (coll? tables) (every? (comp int? :table-id) tables))
                         (into ids (map :table-id) tables))))))
         nil))
      (or (nil? @table-ids)
          (boolean (seq (metabot.perms/row-restricted-table-ids @table-ids)))))
    (catch Exception e
      (log/debug e "Could not determine source tables for virtual column statistics")
      true)))

(defn- field-statistics
  "Fingerprint statistics are global (computed across every row of the table), so they're withheld
  for a user whose actual row access is narrowed by sandboxing, connection impersonation, or
  database routing -- and a missing fingerprint is never computed on demand for such a user either,
  since that would run an unrestricted warehouse sample and persist its result to the shared
  `Field` row. The restriction check uses the persisted Field's owning table rather than the
  caller's column metadata, since saved Card result metadata can be stale or user-edited.
  Virtual-column fingerprints are withheld if any table read by the query is restricted, or the
  query's source tables cannot be determined."
  [query {:keys [id fingerprint]} limit]
  (if id
    (let [field (metabot.db/field id)
          table-id (:table_id field)
          fvs (params.field-values/get-or-create-field-values! field)
          restricted? (or (not (int? table-id))
                          (contains? (metabot.perms/row-restricted-table-ids #{table-id}) table-id))
          fp (when-not restricted?
               (or fingerprint (get-or-create-fingerprint! field)))]
      (build-field-statistics fvs fp limit))
    (build-field-statistics nil (when (and fingerprint (not (query-row-restricted? query))) fingerprint) limit)))

(defn- field-metadata-output
  "Build the `:field-metadata` tool result for `col` of `query`. Surfaces the column's portable
  FK + join label (via `->result-column`) so a drilled-into field/dimension detail tells the LLM
  exactly how to reference the column."
  [query col field-id limit]
  {:structured-output (merge {:result-type    :field-metadata
                              :field_id       field-id
                              :value_metadata (field-statistics query col limit)}
                             (select-keys (metabot.tools.u/->result-column query col)
                                          [:portable_fk :table_reference]))})

(def ^:private max-suggested-field-ids 100)

(tools/defrecoverable unknown-field!
  "The field ID does not identify an accessible column of this data source."
  {:payload [:map {:closed true}
             [:field-id [:or :int :string]]
             [:entity-type [:enum "table" "model" "metric" "question"]]
             [:entity-id :int]
             [:available-ids [:sequential {:max 100} [:or :int :string]]]
             [:remaining-count :int]]}
  [{:keys [field-id entity-type entity-id available-ids remaining-count]}]
  {:message (str "Field " field-id " was not found in " entity-type " " entity-id
                 (if (seq available-ids)
                   (str ". Valid field IDs: " (pr-str available-ids)
                        (when (pos? remaining-count) (str " and " remaining-count " more")) ".")
                   ". No accessible field IDs are available for this data source."))
   :recovery [{:text (if (seq available-ids)
                       "Retry with one of these field IDs."
                       "Choose another data source.")
               :uses #{}}]})

(defn- field-column
  [entity-type entity-id field-id columns]
  (let [columns (entity-details/permission-filter-columns columns)]
    (or (metabot.tools.u/find-column-by-field-id field-id columns)
        (let [available-ids (into [] (comp (map metabot.tools.u/column-field-id) (distinct)) columns)]
          (unknown-field! {:field-id field-id :entity-type entity-type :entity-id entity-id
                           :available-ids (vec (take max-suggested-field-ids available-ids))
                           :remaining-count (max 0 (- (count available-ids) max-suggested-field-ids))})))))

(defn- table-field-stats
  [table-id field-id limit]
  (let [query (metabot.tools.u/table-query table-id)
        col (field-column "table" table-id field-id (lib/visible-columns query))]
    (field-metadata-output query col field-id limit)))

(defn- card-field-stats
  [entity-type card-id field-id limit]
  (let [query (metabot.tools.u/card-query card-id (keyword entity-type))
        columns (if (= entity-type "question")
                  (lib/returned-columns query)
                  (distinct (concat (lib/returned-columns query) (lib/visible-columns query))))
        col (field-column entity-type card-id field-id columns)]
    (field-metadata-output query col field-id limit)))

(defn- metric-field-stats
  [metric-id field-id limit]
  (let [query (metabot.tools.u/metric-query metric-id)
        col (field-column "metric" metric-id field-id (lib/filterable-columns query))]
    (field-metadata-output query col field-id limit)))

(defn field-values
  "Return statistics and/or values for a given field of a given entity."
  [{:keys [entity-type entity-id field-id limit]}]
  (case entity-type
    "metric"                      (metric-field-stats entity-id field-id limit)
    ("model" "report" "question") (card-field-stats (if (= entity-type "report") "question" entity-type)
                                                    entity-id field-id limit)
    "table"                       (table-field-stats entity-id field-id limit)))
