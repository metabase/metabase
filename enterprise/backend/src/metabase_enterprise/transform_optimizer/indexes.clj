(ns metabase-enterprise.transform-optimizer.indexes
  "List + drop the optimizer-managed indices on a transform's target
  table. Backs the `/api/ee/transform-optimizer/:id/indexes` endpoints.

  We only consider indices on the transform's *target* table (the one
  the transform materialises). Source-DB indices are owned by the user's
  DBA team — we don't list or drop those here, even if we created them
  at accept time.

  Each result distinguishes between:
    :managed_by_optimizer true  — the index appears in
                                  `transform.target.post_run_ddl` so the
                                  optimizer's replay will recreate it on
                                  every transform run. Dropping it
                                  requires also clearing the
                                  `post_run_ddl` entry; we do that
                                  atomically.
    :managed_by_optimizer false — pre-existing or hand-rolled index. We
                                  show it for context but don't volunteer
                                  to manage it."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transform-optimizer.ddl.execute :as ddl.execute]
   [metabase-enterprise.transform-optimizer.ddl.parse :as ddl.parse]
   [metabase-enterprise.transform-optimizer.index-introspection :as iix]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
  "List every index on `transform`'s target table. Returns a vector of
  maps shaped:
    {:name :access_method :is_unique :is_primary :is_valid
     :key_columns :include_columns :partial_predicate :definition
     :managed_by_optimizer}"
  [transform]
  (let [{:keys [schema name]} (:target transform)
        db-id     (:source_database_id transform)
        database  (when db-id (t2/select-one :model/Database :id db-id))
        driver-kw (some-> database :engine keyword)]
    (cond
      (not (and schema name))
      []

      (nil? database)
      (do (log/warnf "list-indexes: no source database for transform %s" (:id transform))
          [])

      :else
      (let [rows           (or (iix/fetch-indexes driver-kw database [[schema name]]) [])
            allowed        #{[schema name]}
            managed-names  (managed-index-names transform allowed)]
        (mapv (fn [row]
                (-> row
                    (assoc :managed_by_optimizer (boolean (managed-names (:name row))))))
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
  "Drop the named index on `transform`'s target table. Returns:
    {:status :dropped}
    {:status :failed   :error_message <msg>}
    {:status :skipped  :reason :index-not-on-target | :unsafe-name | :not-postgres | :no-database}"
  [transform index-name]
  (let [{:keys [schema name]} (:target transform)
        db-id                 (:source_database_id transform)
        database              (when db-id (t2/select-one :model/Database :id db-id))
        driver-kw             (some-> database :engine keyword)
        allowed               #{[schema name]}]
    (cond
      (not (safe-identifier? index-name))
      {:status :skipped :reason :unsafe-name}

      (nil? database)
      {:status :skipped :reason :no-database}

      :else
      (let [;; Pre-flight: confirm the index actually exists on this table.
            on-this-table? (some #(= index-name (:name %))
                                 (or (iix/fetch-indexes driver-kw database [[schema name]]) []))]
        (if-not on-this-table?
          {:status :skipped :reason :index-not-on-target}
          (let [stmt        (format "DROP INDEX CONCURRENTLY IF EXISTS %s.%s"
                                    (str schema) (str index-name))
                exec-result (ddl.execute/execute! driver-kw database stmt)
                result      (case (:status exec-result)
                              :executed {:status :dropped}
                              :failed   {:status :failed
                                         :error_message (:error-message exec-result)}
                              :skipped  {:status :skipped :reason :not-postgres})]
            (when (= :dropped (:status result))
              (try
                (remove-from-post-run-ddl! (:id transform) index-name allowed)
                (catch Exception e
                  (log/warnf e "drop-index!: failed to scrub post_run_ddl for %s on transform %s"
                             index-name (:id transform)))))
            result))))))
