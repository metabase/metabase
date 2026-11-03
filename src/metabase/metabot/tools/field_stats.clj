(ns metabase.metabot.tools.field-stats
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.parameters.field-values :as params.field-values]
   [metabase.permissions.core :as perms]
   [metabase.query-processor.interface :as qp.i]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.request.core :as request]
   [metabase.sync.core :as sync]
   [metabase.sync.util :as sync-util]
   [metabase.util.log :as log]))

(defn- build-field-statistics [fvs fp limit]
  (merge
   (cond
     (= ::unavailable fp) {:statistics_unavailable true}
     fp                   {:statistics (-> (or (:global fp) {})
                                           (set/rename-keys {:nil% :percent-null})
                                           (into (vals (:type fp))))})
   (when-let [values (-> fvs :values not-empty)]
     {:field_values       (into [] (if limit (take limit) identity) values)
      :field_values_total (count values)
      :has_more_values    (:has_more_values fvs)})))

(defn- get-or-create-fingerprint!
  "Return the fingerprint of `field`, computing it if needed.

  Return nil if sampling saves no fingerprint, or `::unavailable` if the database can't be sampled."
  [{:keys [id fingerprint] :as field}]
  (or fingerprint
      (let [result (try
                     ;; Run with admin perms to match behavior during normal sync.
                     (request/as-admin (sync/refingerprint-field! field))
                     (catch Exception e
                       (if (sync-util/transient-exception? e)
                         (do
                           (log/warnf e "Could not fingerprint field %d" id)
                           nil)
                         (throw e))))]
        ;; Sync returns `:sync/no-connection` or a Throwable when it can't sample the database
        (cond
          (not (map? result))                   ::unavailable
          (pos? (:updated-fingerprints result)) (metabot.db/field-fingerprint id)))))

(defn- database-unrestricted?
  [db-id]
  (and (= :unrestricted (perms/full-database-permission-for-user api/*current-user-id* :perms/view-data db-id))
       (not (perms/sandboxed-user-for-db? db-id))
       (let [{:keys [impersonation routing]} (perms/data-access-token {:database-id db-id :table-ids #{}})]
         (not (or impersonation routing)))))

(defn- query-statistics-restricted?
  [query]
  (try
    (if (database-unrestricted? (:database query))
      false
      (let [query (binding [qp.i/*skip-middleware-because-app-db-access* true]
                    (request/as-admin (qp.preprocess/preprocess query)))
            table-ids (set (lib/all-source-table-ids query))]
        (or (lib/any-native-stage? query)
            (not= table-ids (metabot.perms/data-accessible-table-ids table-ids))
            (boolean (seq (metabot.perms/row-restricted-table-ids table-ids))))))
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
  Virtual column fingerprints require unrestricted access to every source table. Queries containing
  native SQL require unrestricted database access without sandboxing, impersonation or routing.
  Unrestricted database users keep fingerprints even when source tables cannot be determined."
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
    (build-field-statistics nil (when (and fingerprint (not (query-statistics-restricted? query))) fingerprint) limit)))

(defn- field-metadata-output
  "Build the `:field-metadata` tool result for `col`, one of `columns` of `query`. `all-columns` are the columns
  before the permission filter. Surfaces the column's portable FK + join label, or its `:reference`, as its
  [[metabot.tools.u/metric-dimension]] row does, so a drilled-into field/dimension detail tells the LLM exactly
  how to reference the column.

  A column without a portable FK, like the renamed copy `NAME_2` or a computed column, carries its emitted string
  `field_id` as `:reference_name`. The reference always comes from the column, never from the requested
  `field-id`. A request for the numeric string `\"48\"` (the field ID of VENUES.NAME) still renders the
  portable FK of VENUES.NAME, not `\"48\"`.

  `columns` are the columns after the permission filter and before the dedup to one column per field ID; they give
  the label of the column's own FK route. `all-columns` are the same columns before the permission filter; they
  decide whether a card reaches the column's table through two FK columns, so that the column gets the `:reference`
  of its own route."
  [query columns all-columns col field-id limit]
  (let [;; `field-id` is the field ID, maybe as a string, or a column alias. A column with a field ID that is found by
        ;; its alias is a later column of one field, see `column-field-ids`.
        column-id  (if (= (str field-id) (str (:id col)))
                     (:id col)
                     field-id)
        result-col (metabot.tools.u/metric-dimension query columns all-columns col column-id)]
    {:structured-output (merge {:result-type    :field-metadata
                                :field_id       field-id
                                :value_metadata (field-statistics query col limit)}
                               (select-keys result-col [:portable_fk :table_reference :reference])
                               (when (and (nil? (:portable_fk result-col))
                                          (string? (:field_id result-col)))
                                 {:reference_name (:field_id result-col)}))}))

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

(defn- usable-columns
  "Keep the columns of `columns`, a list of columns a query can use, that the current user can see, and of these the
  first column of each field ID. Two columns of such a list with one field ID are paths to one field, not two result
  columns, so a later one gets no alias ID.

  The permission filter runs first, because it decides per FK path: the first path to a field can be hidden while a
  later path is visible."
  [columns]
  (m/distinct-by metabot.tools.u/column-field-id (entity-details/permission-filter-columns columns)))

(defn- field-column
  "Return the column of the permission-filtered `columns` of `query` that `field-id` names, or throw
  [[unknown-field!]]."
  [query entity-type entity-id field-id columns]
  (or (metabot.tools.u/find-column-by-field-id query field-id columns)
      (let [available-ids (into [] (distinct) (metabot.tools.u/column-field-ids columns))]
        (unknown-field! {:field-id field-id :entity-type entity-type :entity-id entity-id
                         :available-ids (vec (take max-suggested-field-ids available-ids))
                         :remaining-count (max 0 (- (count available-ids) max-suggested-field-ids))}))))

(defn- check-curated-field-owner!
  "Under [[shared/curated-only?]], require that the Field behind `col`, a result column of the card `card-id`, belongs
  to a Table the card's definition reads or one FK hop from it. A card's result metadata can map a column to any
  Field, so without this a curated model could serve, and fingerprint, a column of a table it never reads."
  [card-id col]
  (when (shared/curated-only?)
    (let [field-id (:id col)
          owner    (when (pos-int? field-id)
                     (get (metabot.perms/field-id->table-id #{field-id}) field-id))]
      (when (and owner (not (contains? (metabot.tools.u/card-definition-table-ids card-id) owner)))
        (recoverable.common/not-curated! {:label (str "field " field-id)})))))

(defn- table-field-stats
  [table-id field-id limit]
  (let [query       (metabot.tools.u/table-query table-id)
        all-columns (lib/visible-columns query)
        columns     (usable-columns all-columns)
        col         (field-column query "table" table-id field-id columns)]
    ;; A table query is not over a card, so it has no multi-FK Reference, and the deduplicated columns are enough.
    (field-metadata-output query columns all-columns col field-id limit)))

(defn- card-field-stats
  [entity-type card-id field-id limit]
  (let [;; A curated-only read may see what a curated card exposes, its result columns and their FK neighbours,
        ;; which is what `construct_notebook_query` lets a curated card cover (see
        ;; `metabase.metabot.curation`). The definition of a question reads more: a verified `count` over a raw
        ;; table would otherwise serve every column of that table.
        query        (if (shared/curated-only?)
                       (metabot.tools.u/card-results-query card-id (keyword entity-type))
                       (metabot.tools.u/card-query card-id (keyword entity-type)))
        all-returned (lib/returned-columns query)
        all-visible  (when-not (= entity-type "question")
                       (lib/visible-columns query))
        returned     (entity-details/permission-filter-columns all-returned)
        visible      (when all-visible
                       (entity-details/permission-filter-columns all-visible))
        ;; Result columns keep their own field IDs, see `column-field-ids`. A visible column adds a field ID only
        ;; when no result column has it, and only its first FK route does, as in `usable-columns`.
        columns      (if (= entity-type "question")
                       returned
                       (let [returned-ids (set (metabot.tools.u/column-field-ids returned))]
                         (concat returned
                                 (->> (m/distinct-by metabot.tools.u/column-field-id visible)
                                      (remove (comp returned-ids metabot.tools.u/column-field-id))))))
        col          (field-column query entity-type card-id field-id columns)]
    (check-curated-field-owner! card-id col)
    ;; Every FK route, the visible ones for the label and all of them for the count, so that a multi-FK column gets
    ;; the Reference of its own route.
    (field-metadata-output query (concat returned visible) (concat all-returned all-visible) col field-id limit)))

(defn- metric-field-stats
  [metric-id field-id limit]
  (let [query       (metabot.tools.u/metric-query metric-id)
        ;; Every FK route that the user can see, so that a multi-FK column gets the Reference of its own route.
        routes      (entity-details/metric-dimension-columns query metric-id)
        ;; The routes before the permission filter, for the count of FK routes. The explicitly joined columns that
        ;; `metric-dimension-columns` adds have no FK column, so they do not change the count.
        all-columns (lib/filterable-columns query)
        ;; Keep the first FK path to each field. A renamed copy on a card stage, like `NAME_2` of `NAME`, has the
        ;; field ID of its field but is its own column, so its output name keeps it.
        columns     (m/distinct-by (juxt metabot.tools.u/column-field-id :name) routes)
        col         (field-column query "metric" metric-id field-id columns)]
    (check-curated-field-owner! metric-id col)
    (field-metadata-output query routes all-columns col field-id limit)))

(defn field-values
  "Return statistics and/or values for a given field of a given entity."
  [{:keys [entity-type entity-id field-id limit]}]
  (case entity-type
    "metric"                      (metric-field-stats entity-id field-id limit)
    ("model" "report" "question") (card-field-stats (if (= entity-type "report") "question" entity-type)
                                                    entity-id field-id limit)
    "table"                       (table-field-stats entity-id field-id limit)))
