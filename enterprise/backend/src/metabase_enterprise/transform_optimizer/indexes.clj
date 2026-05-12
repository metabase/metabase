(ns metabase-enterprise.transform-optimizer.indexes
  "List + drop indices on the tables a transform touches.

  \"Touches\" = the **target** table (the one the transform materialises)
  plus every **source** table the transform reads from. Both matter to
  the optimizer:
    - Indices on source tables back the rewrite proposals (e.g.
      `idx_orders_customer_id` for a GROUP BY rollup).
    - Indices on the target table speed up downstream consumers and are
      what the optimizer's post-run replay machinery keeps alive.

  Each result distinguishes between:
    :managed_by_optimizer true  — the index appears in
                                  `transform.target.post_run_ddl` so the
                                  optimizer's replay will recreate it on
                                  every transform run. Only target-table
                                  indices can be managed this way today —
                                  source-table indices live in
                                  user-controlled tables.
    :managed_by_optimizer false — pre-existing, hand-rolled, or a
                                  source-DB index the optimizer ran at
                                  accept time but doesn't replay."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transform-optimizer.ddl.execute :as ddl.execute]
   [metabase-enterprise.transform-optimizer.ddl.parse :as ddl.parse]
   [metabase-enterprise.transform-optimizer.index-introspection :as iix]
   [metabase.driver :as driver]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Resolving which tables to list

(defn- target-pair
  "[schema name] of the transform's target table, or nil if not set yet."
  [transform]
  (let [{:keys [schema name]} (:target transform)]
    (when (and schema name) [schema name])))

(defn- source-pairs
  "[[schema table] …] for every source table the transform reads from.
  Resolved via `driver/native-query-deps` so we cover native queries
  uniformly (MBQL transforms wouldn't be in the optimizer's scope anyway
  in this branch)."
  [transform]
  (try
    (let [query    (-> transform :source :query)
          db-id    (:source_database_id transform)
          driver-kw (when db-id
                      (t2/select-one-fn (comp keyword :engine)
                                        :model/Database :id db-id))]
      (when (and driver-kw query)
        (let [preprocessed (-> query
                               transforms-base.u/massage-sql-query
                               qp.preprocess/preprocess)
              deps         (driver/native-query-deps driver-kw preprocessed)
              table-ids    (into [] (keep :table) deps)
              tables       (when (seq table-ids)
                             (t2/select [:model/Table :id :schema :name]
                                        :id [:in table-ids]))]
          (vec (for [t tables
                     :when (and (:schema t) (:name t))]
                 [(:schema t) (:name t)])))))
    (catch Exception e
      (log/warnf e "list-indexes: failed to extract source tables for transform %s"
                 (:id transform))
      [])))

(defn- referenced-table-pairs
  "Union of target + source tables. Preserves order (target first, sources
  in resolution order) and deduplicates."
  [transform]
  (let [target  (target-pair transform)
        sources (source-pairs transform)
        seen    (volatile! #{})
        keep!   (fn [pair]
                  (when pair
                    (let [key [(some-> (first pair) str/lower-case)
                               (some-> (second pair) str/lower-case)]]
                      (when-not (@seen key)
                        (vswap! seen conj key)
                        pair))))]
    (into [] (keep keep!) (cons target sources))))

;; ---------------------------------------------------------------------------
;; Listing

(defn- ddl-statement->index-name
  "Extract the index name from a `CREATE INDEX … <name> ON …` statement
  by reusing the validator (which already parses the name out)."
  [statement allowed-tables]
  (let [r (ddl.parse/parse statement allowed-tables)]
    (when (:ok? r) (:name r))))

(defn- managed-index-names
  "Names of indices the optimizer registered for replay on this transform's
  target. Filtered to those that parse cleanly as CREATE INDEX (a sanity
  guard — anything stored in `post_run_ddl` should already have passed
  the validator at accept time)."
  [transform allowed-tables]
  (->> (get-in transform [:target :post_run_ddl])
       (keep #(ddl-statement->index-name (:statement %) allowed-tables))
       set))

(defn list-indexes
  "List every index on the union of `transform`'s target table and source
  tables. Returns a vector shaped:

    {:schema :table :name :access_method :is_unique :is_primary
     :is_valid :key_columns :include_columns :partial_predicate
     :definition :managed_by_optimizer :is_target_table}

  Each row carries `:schema`/`:table` so callers can group results per
  table. `:is_target_table` lets the UI visually distinguish the
  output-side table from input tables. `:managed_by_optimizer` is only
  ever `true` for indices on the target table (source-table indices
  aren't replayed)."
  [transform]
  (let [pairs     (referenced-table-pairs transform)
        target    (target-pair transform)
        db-id     (:source_database_id transform)
        database  (when db-id (t2/select-one :model/Database :id db-id))
        driver-kw (some-> database :engine keyword)]
    (cond
      (empty? pairs)
      []

      (nil? database)
      (do (log/warnf "list-indexes: no source database for transform %s" (:id transform))
          [])

      :else
      (let [rows          (or (iix/fetch-indexes driver-kw database pairs) [])
            allowed       (into #{} pairs)
            managed-names (when target (managed-index-names transform #{target}))
            target-schema (some-> target first  str/lower-case)
            target-table  (some-> target second str/lower-case)
            on-target? (fn [row]
                          (and (some-> (:schema row) str/lower-case (= target-schema))
                               (some-> (:table  row) str/lower-case (= target-table))))]
        (mapv (fn [row]
                (let [target-side? (on-target? row)]
                  (-> row
                      (assoc :is_target_table      target-side?
                             :managed_by_optimizer (boolean (and target-side?
                                                                 managed-names
                                                                 (managed-names (:name row))))))))
              rows)))))

;; ---------------------------------------------------------------------------
;; Dropping

(defn- safe-identifier?
  "Pre-flight check: index / schema / table names that round-trip cleanly
  through bare unquoted Postgres identifier syntax. We refuse to drop
  anything with shell-y characters — the names we list come from
  `pg_class.relname` so legitimate ones always pass."
  [s]
  (and (string? s)
       (boolean (re-matches #"[A-Za-z_][A-Za-z0-9_]*" s))))

(defn- remove-from-post-run-ddl!
  "Atomically strip any post_run_ddl entry that produces `index-name` so
  the next transform run doesn't re-create what we just dropped."
  [transform-id index-name allowed-tables]
  (t2/with-transaction [_]
    (when-let [transform (t2/select-one [:model/Transform :id :target] :id transform-id)]
      (let [ddls   (get-in transform [:target :post_run_ddl])
            kept   (vec (remove (fn [{:keys [statement]}]
                                  (= index-name (ddl-statement->index-name statement allowed-tables)))
                                ddls))]
        (when-not (= (count ddls) (count kept))
          (let [target' (if (seq kept)
                          (assoc (:target transform) :post_run_ddl kept)
                          (dissoc (:target transform) :post_run_ddl))]
            (t2/update! :model/Transform transform-id {:target target'})))))))

(defn drop-index!
  "Drop the named index on any of `transform`'s referenced tables
  (target + sources). Validates that the index actually exists on one of
  those tables before issuing the DROP — we won't drop arbitrary indices
  elsewhere in the source DB. Returns:
    {:status :dropped}
    {:status :failed   :error_message <msg>}
    {:status :skipped  :reason :index-not-on-referenced-table
                              | :unsafe-name | :not-postgres | :no-database}"
  [transform index-name]
  (let [pairs     (referenced-table-pairs transform)
        target    (target-pair transform)
        db-id     (:source_database_id transform)
        database  (when db-id (t2/select-one :model/Database :id db-id))
        driver-kw (some-> database :engine keyword)]
    (cond
      (not (safe-identifier? index-name))
      {:status :skipped :reason :unsafe-name}

      (nil? database)
      {:status :skipped :reason :no-database}

      (empty? pairs)
      {:status :skipped :reason :index-not-on-referenced-table}

      :else
      (let [;; Pre-flight: confirm the index actually exists on one of the
            ;; referenced tables (target or source). Capture which one so we
            ;; can issue `DROP INDEX schema.name` against the right schema.
            existing-row (some (fn [row]
                                 (when (= index-name (:name row)) row))
                               (or (iix/fetch-indexes driver-kw database pairs) []))]
        (if-not existing-row
          {:status :skipped :reason :index-not-on-referenced-table}
          (let [schema      (:schema existing-row)
                stmt        (format "DROP INDEX CONCURRENTLY IF EXISTS %s.%s"
                                    (str schema) (str index-name))
                exec-result (ddl.execute/execute! driver-kw database stmt)
                result      (case (:status exec-result)
                              :executed {:status :dropped}
                              :failed   {:status :failed
                                         :error_message (:error-message exec-result)}
                              :skipped  {:status :skipped :reason :not-postgres})]
            (when (and (= :dropped (:status result))
                       target
                       (= (some-> (:schema existing-row) str/lower-case)
                          (some-> (first target)         str/lower-case))
                       (= (some-> (:table existing-row)  str/lower-case)
                          (some-> (second target)        str/lower-case)))
              ;; Only scrub `post_run_ddl` when we dropped an index *on the
              ;; target table*. Source-table indices were never tracked
              ;; there in the first place.
              (try
                (remove-from-post-run-ddl! (:id transform) index-name #{target})
                (catch Exception e
                  (log/warnf e "drop-index!: failed to scrub post_run_ddl for %s on transform %s"
                             index-name (:id transform)))))
            result))))))
