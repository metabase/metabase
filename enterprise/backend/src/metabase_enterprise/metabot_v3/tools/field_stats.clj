(ns metabase-enterprise.metabot-v3.tools.field-stats
  (:require
   [clojure.set :as set]
   [metabase-enterprise.metabot-v3.metadata-perms :as metabot-v3.perms]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
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
     {:values (into [] (if limit (take limit) identity) fvs)})))

(defn- get-or-create-fingerprint! [{:keys [id fingerprint] :as field}]
  (or fingerprint
      ;; Run with admin perms to match behavior during normal sync.
      (and (pos? (:updated-fingerprints (request/as-admin (sync/refingerprint-field! field))))
           (t2/select-one-fn :fingerprint :model/Field :id id))))

(defn- field-statistics
  [{:keys [id fingerprint]} limit]
  (if id
    (let [field (t2/select-one :model/Field :id id)
          fvs (params.field-values/get-or-create-field-values! field)
          fp (or fingerprint (get-or-create-fingerprint! field))]
      (build-field-statistics fvs fp limit))
    (build-field-statistics nil fingerprint limit)))

(defn- check-column-table-perms!
  "Re-check permissions on the table a drilled-into column actually belongs to.

  `visible-columns`/`filterable-columns` resolve through the permission-blind metadata provider and
  surface columns from tables the caller never named: reached by an FK, brought in by an explicit join,
  carried up from a previous stage, or inherited through a source card. Keying this gate on
  `:lib/source` misses shapes — a join in a nested stage arrives as `:source/previous-stage`, a model's
  join as `:source/card` — so it keys on the column's own `:table-id` instead.

  Three bars, each matching what the query processor would demand to produce the same value:

  - An implicit FK join is an ad-hoc join the caller would have to build themselves, so it takes query
    permission on the joined table.
  - Every other table takes data access — including the one the caller named. The entry check that
    reached this tool is `api/read-check`, and `mi/can-read? :model/Table` passes on a bare
    `manage-table-metadata` grant with `view-data` still `:blocked`, so exempting the named table would
    hand that user the fingerprint statistics and cached values of a table they cannot query.
  - Every table takes the column-level sandbox check. Reading a table says nothing about which of its
    columns a sandbox exposes, so the read check the entity already passed does not cover this."
  [col]
  (let [table-id (:table-id col)
        field-id (:id col)]
    (when (int? table-id)
      (api/check-403
       (contains? (if (= :source/implicitly-joinable (:lib/source col))
                    (metabot-v3.perms/queryable-table-ids #{table-id})
                    (metabot-v3.perms/data-accessible-table-ids #{table-id}))
                  table-id))
      (when-let [allowed (get (metabot-v3.perms/sandbox-restricted-fields #{table-id}) table-id)]
        (api/check-403 (contains? allowed field-id))))))

(defn- table-field-stats
  [table-id agent-field-id limit]
  (try
    (let [query (metabot-v3.tools.u/table-query table-id)]
      (if query
        (let [field-id-prefix (metabot-v3.tools.u/table-field-id-prefix table-id)
              visible-cols (lib/visible-columns query)
              col (:column (metabot-v3.tools.u/resolve-column {:field-id agent-field-id} field-id-prefix visible-cols))]
          (check-column-table-perms! col)
          {:structured-output (field-statistics col limit)})
        {:output (str "No table found with ID " table-id)}))
    (catch Exception ex
      (metabot-v3.tools.u/handle-agent-error ex))))

(defn- card-field-stats
  [card-id agent-field-id limit card-type]
  (try
    (let [query (metabot-v3.tools.u/card-query card-id)]
      (if query
        (let [field-id-prefix (metabot-v3.tools.u/card-field-id-prefix card-id)
              visible-cols (lib/visible-columns query)
              col (:column (metabot-v3.tools.u/resolve-column {:field-id agent-field-id} field-id-prefix visible-cols))]
          (check-column-table-perms! col)
          {:structured-output (field-statistics col limit)})
        {:output (str "No " card-type " found with ID " card-id)}))
    (catch Exception ex
      (metabot-v3.tools.u/handle-agent-error ex))))

(defn- metric-field-stats
  [metric-id agent-field-id limit]
  (try
    (let [query (metabot-v3.tools.u/metric-query metric-id)]
      (if query
        (let [field-id-prefix (metabot-v3.tools.u/card-field-id-prefix metric-id)
              filterable-cols (lib/filterable-columns query)
              col (:column (metabot-v3.tools.u/resolve-column {:field-id agent-field-id} field-id-prefix filterable-cols))]
          (check-column-table-perms! col)
          {:structured-output (field-statistics col limit)})
        {:output (str "No metric found with ID " metric-id)}))
    (catch Exception ex
      (metabot-v3.tools.u/handle-agent-error ex))))

(comment
  (t2/select-pk->fn :field_id :model/FieldValues)
  (sort-by key (t2/select-pk->fn :name :model/Table))
  (sort-by first (t2/select-fn-vec (juxt :position :name) :model/Field :table_id 8))
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user-id* 2
            api/*is-superuser?* true]
    (let [table-id 25]
      (-> (for [col-pos (range 15)]
            [col-pos (table-field-stats table-id (str (metabot-v3.tools.u/table-field-id-prefix table-id) col-pos) 15)])
          vec)))
  -)

(defn field-values
  "Return statistics and/or values for a given field of a given entity."
  [{:keys [entity-type entity-id field-id limit]}]
  (case entity-type
    "metric"           (metric-field-stats entity-id field-id limit)
    ("model" "report") (card-field-stats entity-id field-id limit entity-type)
    "table"            (table-field-stats entity-id field-id limit)))
