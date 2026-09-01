(ns metabase.metabot.tools.field-stats
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.parameters.field-values :as params.field-values]
   [metabase.request.core :as request]
   [metabase.sync.core :as sync]
   [toucan2.core :as t2]))

(defn- build-field-statistics [fvs fp limit]
  (merge
   (when fp
     {:statistics (-> (or (:global fp) {})
                      (set/rename-keys {:nil% :percent-null})
                      (into (vals (:type fp))))})
   (when-let [fvs (-> fvs :values not-empty)]
     {:field_values (into [] (if limit (take limit) identity) fvs)})))

(defn- get-or-create-fingerprint! [{:keys [id fingerprint] :as field}]
  (or fingerprint
      ;; Run with admin perms to match behavior during normal sync.
      (and (pos? (:updated-fingerprints (request/as-admin (sync/refingerprint-field! field))))
           (t2/select-one-fn :fingerprint :model/Field 'id id))))

(defn- field-statistics
  "Fingerprint statistics are global (computed across every row of the table), so they're withheld
  for a user whose actual row access is narrowed by sandboxing, connection impersonation, or
  database routing -- and a missing fingerprint is never computed on demand for such a user either,
  since that would run an unrestricted warehouse sample and persist its result to the shared
  `Field` row. The restriction check uses the persisted Field's owning table rather than the
  caller's column metadata, since saved Card result metadata can be stale or user-edited."
  [{:keys [id fingerprint]} limit]
  (if id
    (let [field (t2/select-one :model/Field 'id id)
          table-id (:table_id field)
          fvs (params.field-values/get-or-create-field-values! field)
          restricted? (or (not (int? table-id))
                          (contains? (metabot.perms/row-restricted-table-ids #{table-id}) table-id))
          fp (when-not restricted?
               (or fingerprint (get-or-create-fingerprint! field)))]
      (build-field-statistics fvs fp limit))
    (build-field-statistics nil fingerprint limit)))

(defn- field-metadata-output
  "Build the `:field-metadata` tool result for `col` of `query`. Surfaces the column's portable
  FK + join label (via `->result-column`) so a drilled-into field/dimension detail tells the LLM
  exactly how to reference the column."
  [query col field-id limit]
  {:structured-output (merge {:result-type    :field-metadata
                              :field_id       field-id
                              :value_metadata (field-statistics col limit)}
                             (select-keys (metabot.tools.u/->result-column query col)
                                          [:portable_fk :table_reference]))})

(defn- check-column-table-perms!
  [col]
  (let [field-id (:id col)
        ;; A saved Card's result metadata can override :table-id while retaining a real Field ID.
        ;; Always authorize physical Fields against their persisted owner; only virtual columns may
        ;; fall back to the table carried by Lib metadata.
        table-id (if (pos-int? field-id)
                   (or (get (metabot.perms/field-id->table-id #{field-id}) field-id)
                       (throw (ex-info (str "No field found with ID " field-id)
                                       {:agent-error? true :status-code 404})))
                   (:table-id col))]
    (when (int? table-id)
      (api/check-403
       (contains? (if (= :source/implicitly-joinable (:lib/source col))
                    (metabot.perms/queryable-table-ids #{table-id})
                    (metabot.perms/data-accessible-table-ids #{table-id}))
                  table-id))
      (when-let [allowed (get (metabot.perms/sandbox-restricted-fields #{table-id}) table-id)]
        (api/check-403 (contains? allowed field-id))))))

(defn- table-field-stats
  [table-id field-id limit]
  (try
    (let [query        (or (metabot.tools.u/table-query table-id)
                           (throw (ex-info (str "No table found with ID " table-id)
                                           {:agent-error? true :status-code 404})))
          visible-cols (lib/visible-columns query)
          col          (metabot.tools.u/find-column-by-field-id field-id visible-cols)]
      (check-column-table-perms! col)
      (field-metadata-output query col field-id limit))
    (catch Exception ex
      (metabot.tools.u/handle-agent-error ex))))

(defn- card-field-stats
  [card-id field-id limit card-type]
  (try
    (let [query        (or (metabot.tools.u/card-query card-id)
                           (throw (ex-info (str "No " card-type " found with ID " card-id)
                                           {:agent-error? true :status-code 404})))
          visible-cols (lib/visible-columns query)
          col          (metabot.tools.u/find-column-by-field-id field-id visible-cols)]
      (check-column-table-perms! col)
      (field-metadata-output query col field-id limit))
    (catch Exception ex
      (metabot.tools.u/handle-agent-error ex))))

(defn- metric-field-stats
  [metric-id field-id limit]
  (try
    (let [query           (or (metabot.tools.u/metric-query metric-id)
                              (throw (ex-info (str "No metric found with ID " metric-id)
                                              {:agent-error? true :status-code 404})))
          filterable-cols (lib/filterable-columns query)
          col             (metabot.tools.u/find-column-by-field-id field-id filterable-cols)]
      (check-column-table-perms! col)
      (field-metadata-output query col field-id limit))
    (catch Exception ex
      (metabot.tools.u/handle-agent-error ex))))

(defn field-values
  "Return statistics and/or values for a given field of a given entity."
  [{:keys [entity-type entity-id field-id limit]}]
  (case entity-type
    "metric"                      (metric-field-stats entity-id field-id limit)
    ("model" "report" "question") (card-field-stats entity-id field-id limit entity-type)
    "table"                       (table-field-stats entity-id field-id limit)
    {:output (str "Unknown data source type: " entity-type)}))
