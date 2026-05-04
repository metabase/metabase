(ns metabase.warehouses-rest.metadata-file-import.processors
  "Pure batch processors for the metadata file importer.

  Each `process-*!` function takes a batch of `[line-num row]` tuples (plus
  loader-pre-resolved id mappings where relevant), validates every row up
  front, runs the bulk SQL once per batch, and returns an `eduction` that
  emits one result map per input row in input order.

  The eduction shape lets callers compose with `reduce` / `transduce` without
  ever materializing a full per-batch result vector. The eager work (validation,
  SELECT, INSERT, UPDATE, DELETE) runs at call time so re-iteration is safe and
  validation errors surface immediately rather than at consumption time.

  No HTTP coupling; no NDJSON; no `ArrayList` buffer. Errors propagate as
  `ex-info` with `:kind`, `:line`, and `:source-id` attribution so the loader
  can produce useful boot-time error messages.

  All SQL is generated through toucan2 / HoneySQL plus a single hand-rolled
  `VALUES`-table UPDATE in [[finalize-batch-sql+params]]. The latter pattern
  is portable across Postgres, H2, and MySQL 8+ — see [[process-fields-fk-finalize!]]."
  (:require
   [clojure.string :as str]
   [malli.error :as me]
   [metabase.models.humanization :as humanization]
   [metabase.models.interface :as mi]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouses-rest.metadata-file-import.schemas :as schemas]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(def import-batch-size
  "Row batch size shared by all processors. An 8-column field row at 2000 rows/batch is 16k
  prepared-statement parameters — safely under Postgres' 65535 cap and MySQL's default
  `max_allowed_packet`. (Dropped `:const` to allow REPL experimentation across batch sizes
  during 20A perf work — restore `:const` once a value is settled.)"
  500)

;;; ============================== Error utilities ==============================

(defn- unique-violation?
  "True if `e` or any cause is a SQL unique-constraint violation. Handles Postgres and H2 via
  SQLState `\"23505\"` (SQL:2003 standard) and MySQL/MariaDB via SQLState `\"23000\"` + vendor
  error code 1062."
  [^Throwable e]
  (loop [^Throwable cause e]
    (cond
      (nil? cause) false
      (instance? SQLException cause)
      (let [sql-ex ^SQLException cause]
        (or (case (.getSQLState sql-ex)
              "23505" true
              "23000" (= 1062 (.getErrorCode sql-ex))
              false)
            (recur (.getCause cause))))
      :else (recur (.getCause cause)))))

(defn- validate-line!
  "Validate `line` against the registered Malli `schema-ref`. Succeeds silently when valid
  (cached validator — fast path); on failure throws an `ex-info` with `:kind :invalid_input`,
  `:line`, a humanized `:detail`, and `extras` merged into the ex-data for echo-key attribution."
  [schema-ref line-num line extras]
  (when-not (mr/validate schema-ref line)
    (let [humanized (me/humanize (mr/explain schema-ref line))]
      (throw (ex-info (format "invalid_input: %s" (name schema-ref))
                      (merge extras
                             {:kind   :invalid_input
                              :line   line-num
                              :detail (pr-str humanized)}))))))

(defn- wrap-row-error
  "Tag an exception from a per-row processor with `:line` and `echo-extras` so the caller can
  attribute the failure to a specific row. An already-classified `ExceptionInfo` (one whose
  ex-data carries `:kind`) passes through unchanged — it carries its own attribution from the
  throw site. Unrecognized exceptions get classified as `:unique_violation` (SQLState match) or
  `:server_error`."
  [^Throwable e line-num echo-extras]
  (let [data (when (instance? ExceptionInfo e) (ex-data e))]
    (if (:kind data)
      e
      (ex-info (.getMessage e)
               (merge echo-extras
                      {:kind   (if (unique-violation? e) :unique_violation :server_error)
                       :line   line-num
                       :detail (.getMessage e)})
               e))))

;;; ============================== databases (batch) ==============================

(defn- engine-name
  "Normalize `engine` (string or keyword) to a string for natural-key comparison.
  Toucan2's `:model/Database` reads `:engine` as a keyword via `define-after-select`,
  but file-imported rows always carry strings. Normalize both sides to string."
  [engine]
  (when engine (name engine)))

(defn- match-databases-batch
  "Look up every existing target Database matching any source row in the batch. Returns
  a `{[name engine-string] → existing-id}` map. Over-includes by `(name IN ..., engine IN ...)`
  then intersects against the actual source pairs in Clojure — keeps the SQL portable across
  Postgres / H2 / MySQL (no `(col, col) IN ((?, ?), ...)` tuple form)."
  [lines]
  (let [pairs   (into #{}
                      (map (fn [{:keys [name engine]}] [name (engine-name engine)]))
                      lines)
        names   (into #{} (map first) pairs)
        engines (into #{} (map second) pairs)]
    (if (or (empty? names) (empty? engines))
      {}
      (let [rows (t2/select [:model/Database :id :name :engine]
                            {:where [:and
                                     [:in :name names]
                                     [:in :engine engines]]})]
        (into {}
              (comp (map (fn [{:keys [id name engine]}]
                           [[name (engine-name engine)] id]))
                    (filter (fn [[pair _]] (contains? pairs pair))))
              rows)))))

(defn process-databases!
  "Validate every row, look up each by `(name, engine)` against `:model/Database`, and emit
  one result map per input row in input order. Returns an eduction.

  Result shapes:
    `{:source-id <db-name> :target-id M :status :matched}`
    `{:source-id <db-name> :status :no-match :line L :detail S}`

  `:source-id` carries the row's **portable database id** — its `:name`. Under the
  portable-id wire format the database-info row no longer carries an integer `:id`;
  the natural-key identity is the database name.

  Phase 1 is **non-fatal**: unmatched databases produce `:no-match` results that the loader
  logs as WARN and uses to skip dependent tables/fields. Validation failures throw."
  [batch]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/database-info ln line {:source-id (:name line)}))
  (let [match-idx (match-databases-batch (mapv second batch))]
    (eduction
     (map (fn [[ln {:keys [name engine]}]]
            (if-let [target (match-idx [name (engine-name engine)])]
              {:source-id name :target-id target :status :matched}
              {:source-id name
               :status    :no-match
               :line      ln
               :detail    (format "No database with name=%s engine=%s"
                                  (pr-str name) (pr-str (engine-name engine)))})))
     batch)))

;;; ============================== tables (batch) ==============================

(defn- resolve-db-ids-batch
  "Resolve each portable `:db_id` (database name, a string) in `lines` to a target
  integer database id. Returns `{db-name → target-int-id}`, omitting names with no
  matching target row. One batched SELECT per call."
  [lines]
  (let [names (into #{} (keep :db_id) lines)]
    (if (empty? names)
      {}
      (into {}
            (map (fn [{:keys [id name]}] [name id]))
            (t2/select [:model/Database :id :name]
                       {:where [:in :name names]})))))

(defn- match-tables-batch
  "Look up every existing target Table matching any of the (target-db-id, schema, name)
  triples in `lines`, scoped to `active=true AND is_defective_duplicate=false`. Returns
  `{[db-id schema name] → existing-id}`. Over-includes by `(db_id IN ..., name IN ...)`
  in SQL then intersects in Clojure — keeps nil schemas correct without per-DBMS
  IS-NULL gymnastics."
  [lines]
  (let [triples (into #{} (map (juxt :db_id :schema :name)) lines)
        db-ids  (into #{} (keep :db_id) lines)
        names   (into #{} (keep :name) lines)]
    (if (or (empty? db-ids) (empty? names))
      {}
      (let [rows (t2/select [:model/Table :id :db_id :schema :name]
                            {:where [:and
                                     [:= :active true]
                                     [:= :is_defective_duplicate false]
                                     [:in :db_id db-ids]
                                     [:in :name names]]})]
        (into {}
              (comp (map (fn [{:keys [id db_id schema name]}] [[db_id schema name] id]))
                    (filter (fn [[triple _]] (contains? triples triple))))
              rows)))))

(defn- new-table-row
  "Row for inserting into `:metabase_table` via the raw table keyword, deliberately
  bypassing `:model/Table`'s `define-after-insert` hook → `set-new-table-permissions!`.
  That hook acquires `with-db-scoped-permissions-lock` per table; on a bulk insert of
  ~1700+ tables in one transaction it exhausts Postgres' `max_locks_per_transaction`.

  This is **safe on a fresh appdb** whose Database row carries default DB-level
  permissions, but **not safe** against an appdb where any group has gone
  table-granular on the target Database — those tables would silently lack their
  per-table permission rows. The batched-grant fix is tracked as item 6 in
  METADATA_FILE_IMPORT_PLAN.md.

  Replicates the non-permission defaults `:model/Table`'s `define-before-insert`
  applies (`display_name`, `data_layer`). `field_order` falls back to the column
  default `'database'`."
  [{:keys [db_id name schema description]}]
  (let [now (mi/now)]
    (cond-> {:db_id               db_id
             :name                name
             :schema              schema
             :display_name        (humanization/name->human-readable-name name)
             :data_layer          "internal"
             :active              true
             :initial_sync_status "complete"
             :created_at          now
             :updated_at          now}
      (some? description) (assoc :description description))))

(defn- patch-matched-tables!
  "Patch-on-match policy (§10c): when a matched target table exists and the source
  carries a non-nil `:description`, update the target's description. Remove the
  body of this fn to flip to no-patch."
  [target-lines match-idx]
  (doseq [{:keys [db_id schema name description]} target-lines
          :when (and (contains? match-idx [db_id schema name])
                     (some? description))]
    (t2/update! :model/Table (get match-idx [db_id schema name])
                {:description description})))

(defn- bulk-insert-unmatched-tables!
  "Bulk-insert every `target-line` whose `(db_id, schema, name)` triple is absent
  from `match-idx`. Returns `{[db-id schema name] → new-id}` for the inserted rows
  so callers can resolve target ids in input order."
  [target-lines match-idx]
  (let [unmatched   (filterv (fn [{:keys [db_id schema name]}]
                               (not (contains? match-idx [db_id schema name])))
                             target-lines)
        insert-rows (mapv new-table-row unmatched)
        new-ids     (when (seq insert-rows)
                      (t2/insert-returning-pks! :metabase_table insert-rows))]
    (zipmap (map (juxt :db_id :schema :name) unmatched) new-ids)))

(defn- portable-table-id
  "The portable id for a row in `process-tables!` — `[db-name schema-or-nil name]`.
  Used as `:source-id` in result maps and as the natural-key identity for attribution."
  [{:keys [db_id schema name]}]
  [db_id schema name])

(defn process-tables!
  "Validate every row, self-resolve each row's portable `:db_id` (a string = database
  name) to a target integer database id via one batched SELECT, match-or-insert by
  `(target-db-id, schema, name)`, and emit one result map per input row in input
  order. Returns an eduction.

  Result shapes:
    `{:source-id [db-name schema name] :target-id M :status :matched}`
    `{:source-id [db-name schema name] :target-id M :status :inserted}`
    `{:source-id [db-name schema name] :status :no-target-db :line L :detail S}`

  `:source-id` carries the row's **portable table id** — its `[db_id schema name]`
  triple. The integer source-instance id is gone under the portable-id wire format.

  Patch-on-match policy: see [[patch-matched-tables!]] (§10c). Removing that call
  flips this processor to no-patch."
  [batch]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/table-info ln line {:source-id (portable-table-id line)}))
  (let [db-id-map    (resolve-db-ids-batch (mapv second batch))
        target-lines (into []
                           (keep (fn [[_ln {src-db :db_id :as line}]]
                                   (when-let [tgt (get db-id-map src-db)]
                                     (assoc line :db_id tgt))))
                           batch)
        match-idx    (match-tables-batch target-lines)]
    (patch-matched-tables! target-lines match-idx)
    (let [id-by-nat (bulk-insert-unmatched-tables! target-lines match-idx)]
      (eduction
       (map (fn [[ln {src-db :db_id :keys [schema name] :as line}]]
              (let [src-id (portable-table-id line)]
                (if-let [tgt-db (get db-id-map src-db)]
                  (if-let [existing (get match-idx [tgt-db schema name])]
                    {:source-id src-id :target-id existing :status :matched}
                    {:source-id src-id :target-id (get id-by-nat [tgt-db schema name])
                     :status :inserted})
                  {:source-id src-id :status :no-target-db :line ln
                   :detail   (format "No target database with name=%s"
                                     (pr-str src-db))}))))
       batch))))

;;; ==================== fields (batch) — phase-3 single-pass with stubs ====================

(def ^:private stub-base-type
  "Sentinel `:base_type` for stub field rows (§11c). Distinguishes import-inserted
  placeholders from real rows when scanning for unfilled stubs at end-of-import."
  "type/*")

(def ^:private stub-database-type
  "Sentinel `:database_type` for stub field rows (§11c)."
  "__stub__")

(defn stub-row?
  "True if `row` is one of the importer's placeholder stub rows (§11c) — identified
  by the `:database_type` sentinel `\"__stub__\"`. (We also write `base_type=\"type/*\"`
  on stubs as extra confidence, but `:database_type` alone is sufficient to
  identify a stub: it's reserved, sync-emitted database_types are real warehouse
  type names. `:base_type` further suffers from the model's keyword transform on
  read.) The loader's post-phase-3 scan calls this to find never-filled stubs."
  [{:keys [database_type]}]
  (= stub-database-type database_type))

(defn- portable-field-id-vec
  "Compute a row's portable field id as a Clojure vector — matches the export's
  `format-field-id` formula. Branches per the wire's storage convention:

    - **Convention A** (`:parent_id` set): `parent-vec ++ [name]` — the leaf
      hangs off its parent's portable id.
    - **Convention B** (`:nfc_path` set, no `:parent_id`): `table-vec ++ nfc_path
      ++ [name]` — full storage path with the arrow-display name appended.
    - **Flat root** (neither): `table-vec ++ [name]`.

  Always returns a Clojure vector. PersistentHashMap rejects ArrayList keys past
  the array-map size threshold (different `hasheq`), so callers normalize
  defensively."
  [{:keys [table_id parent_id nfc_path name]}]
  (cond
    parent_id (conj (vec parent_id) name)
    nfc_path  (-> (vec table_id) (into nfc_path) (conj name))
    :else     (conj (vec table_id) name)))

(defn- decompose-portable-field-id
  "Split a portable field id `[db schema table & path]` into the column components
  used by `metabase_field` joins: `:db-name`, `:schema`, `:table-name`,
  `:leaf-name`, `:anc-path` (vec, nil if depth-1)."
  [field-vec]
  (let [v       (vec field-vec)
        db      (get v 0)
        schema  (get v 1)
        tbl     (get v 2)
        path    (subvec v 3)
        leaf    (peek path)
        anc     (not-empty (pop path))]
    {:db-name db :schema schema :table-name tbl :leaf-name leaf :anc-path anc}))

(defn- resolve-table-ids-batch
  "Resolve each distinct portable `:table_id` triple in `lines` to a target
  integer table id. One batched SELECT joining `metabase_database` and
  `metabase_table`. Returns `{[db-name schema-or-nil table-name] → target-id}`
  with vector keys (Clojure vectors, not ArrayList — required by downstream
  cache lookups)."
  [lines]
  (let [triples   (into #{} (keep (fn [{:keys [table_id]}] (some-> table_id vec))) lines)
        db-names  (into #{} (map #(get % 0)) triples)
        tbl-names (into #{} (map #(get % 2)) triples)]
    (if (empty? triples)
      {}
      (let [rows (t2/query {:select [[:t.id :id] [:t.schema :schema]
                                     [:t.name :tbl-name] [:d.name :db-name]]
                            :from   [[:metabase_table :t]]
                            :join   [[:metabase_database :d] [:= :t.db_id :d.id]]
                            :where  [:and
                                     [:= :t.active true]
                                     [:= :t.is_defective_duplicate false]
                                     [:in :d.name db-names]
                                     [:in :t.name tbl-names]]})]
        (into {}
              (comp (map (fn [{:keys [id schema tbl-name db-name]}]
                           [[db-name schema tbl-name] id]))
                    (filter (fn [[triple _]] (contains? triples triple))))
              rows)))))

(defn- decode-nfc-path
  "Decode `metabase_field.nfc_path` (JSON-encoded string or NULL) to a Clojure
  vector or nil."
  [s]
  (some-> s json/decode vec))

(defn- encode-nfc-path
  "Encode a parent-ancestry path vector for storage in `metabase_field.nfc_path`.
  Returns the JSON-encoded string for non-empty paths, nil for empty/nil — root
  fields and depth-1 stubs have NULL `nfc_path`."
  [anc-path]
  (when (seq anc-path)
    (json/encode anc-path)))

(defn- resolve-parent-ids-batch
  "Resolve each portable parent id in `parent-vecs` to a target integer field id
  via one batched SELECT joining `metabase_field` / `metabase_table` /
  `metabase_database`. Returns `{parent-vec → target-int-id}` (vector keys),
  omitting parents not found on the target.

  Match scope drops `[:= :active true]` (so this also resolves stubs left over
  from a prior batch — see §7 audit reminder) but keeps
  `[:= :is_defective_duplicate false]`."
  [parent-vecs]
  (let [parents     (into #{} (map vec) parent-vecs)
        decomposed  (mapv decompose-portable-field-id parents)
        db-names    (into #{} (map :db-name) decomposed)
        tbl-names   (into #{} (map :table-name) decomposed)
        leaf-names  (into #{} (map :leaf-name) decomposed)]
    (if (empty? parents)
      {}
      (let [rows (t2/query {:select [[:f.id :id] [:f.name :leaf-name] [:f.nfc_path :nfc-path]
                                     [:t.schema :schema] [:t.name :tbl-name] [:d.name :db-name]]
                            :from   [[:metabase_field :f]]
                            :join   [[:metabase_table :t]    [:= :f.table_id :t.id]
                                     [:metabase_database :d] [:= :t.db_id :d.id]]
                            :where  [:and
                                     [:= :f.is_defective_duplicate false]
                                     [:= :t.active true]
                                     [:= :t.is_defective_duplicate false]
                                     [:in :d.name db-names]
                                     [:in :t.name tbl-names]
                                     [:in :f.name leaf-names]]})]
        (into {}
              (keep (fn [{:keys [id db-name schema tbl-name leaf-name nfc-path]}]
                      (let [anc (decode-nfc-path nfc-path)
                            pv  (-> [db-name schema tbl-name]
                                    (into (or anc []))
                                    (conj leaf-name))]
                        (when (contains? parents pv)
                          [pv id]))))
              rows)))))

(defn- new-stub-field-row
  "Row map for inserting a placeholder stub field (§11c). Carries the parent
  ancestry chain in `nfc_path`, the leaf name in `name`, the marker
  `database_type=\"__stub__\"`+`base_type=\"type/*\"`, and `active=false`. When
  the real row arrives the match-and-clobber path UPDATEs the stub in place."
  [target-table-id parent-vec resolved-parent-id]
  (let [{:keys [leaf-name anc-path]} (decompose-portable-field-id parent-vec)
        now (mi/now)]
    {:table_id               target-table-id
     :name                   leaf-name
     :nfc_path               (encode-nfc-path anc-path)
     :parent_id              resolved-parent-id
     :base_type              stub-base-type
     :database_type          stub-database-type
     :active                 false
     :is_defective_duplicate false
     :fk_target_field_id     nil
     :created_at             now
     :updated_at             now}))

(defn- ensure-ancestors!
  "Walk up the parent chain from `parent-vec` until hitting an existing ancestor
  (in `cache!` or via natural-key SELECT) or reaching the table root. Insert
  placeholder stub rows depth-first for every missing ancestor on the way back
  down. Returns the int id of the immediate parent (real or just-inserted stub).
  `cache!` is a `volatile!` `{portable-vec → int}` updated in place.

  Implements §11c's recursive ancestor-stub algorithm. Stubs are inserted one at
  a time (depth-first sequencing — child needs parent's returned int id). For
  realistic schemas (depth ≤ 4) this is small per call. **Future optimization**
  (item 20A): collect all needed stubs from the batch up front and bulk-insert
  per depth level — see plan §11c."
  [parent-vec target-table-id cache!]
  (letfn [(reduce-down [parent-int-id missing]
            ;; missing was built leaf-side-first; reverse for root-first inserts
            (reduce (fn [pid stub-pid]
                      (let [stub-row (new-stub-field-row target-table-id stub-pid pid)
                            stub-id  (first (t2/insert-returning-pks! :model/Field [stub-row]))]
                        (vswap! cache! assoc stub-pid stub-id)
                        stub-id))
                    parent-int-id
                    (rseq missing)))]
    (loop [pid (vec parent-vec), missing []]
      (if-let [hit (get @cache! pid)]
        (reduce-down hit missing)
        (let [resolved (resolve-parent-ids-batch [pid])]
          (if-let [hit (get resolved pid)]
            (do (vswap! cache! assoc pid hit)
                (reduce-down hit missing))
            (if (= 4 (count pid))
              ;; root-level stub — no further ancestor exists
              (let [stub-row (new-stub-field-row target-table-id pid nil)
                    stub-id  (first (t2/insert-returning-pks! :model/Field [stub-row]))]
                (vswap! cache! assoc pid stub-id)
                (reduce-down stub-id missing))
              ;; recurse on the parent of pid
              (recur (vec (butlast pid)) (conj missing pid)))))))))

(defn- match-fields-batch-loose-in
  "PARKED — original implementation kept for A/B comparison during 20A perf work.

  Uses the loose-IN-plus-Clojure-intersect pattern: SELECT all rows where
  `(table_id IN tbl-ids AND name IN names)` (the Cartesian over-include), then
  filter client-side by exact `(table_id, name, parent_id)` triple. Portable
  across Postgres / H2 / MySQL because no composite-key SQL is required.

  Pathology at scale: when names overlap heavily across tables (every table
  has `id`, `col_0`, `col_1`, …), the SELECT returns the full
  `|tbl-ids| × |names|` cross-product intersected with whatever's already in
  `metabase_field`. Client-side filter then drops the over-includes. Phase-3
  per-batch cost grows super-linearly in batch size — observed 424ms/batch at
  size 2000, 145ms at 1000, 53ms at 500. See `match-fields-batch` for the
  replacement using a `VALUES`-table inner join."
  [lines]
  (let [triples (into #{} (map (juxt :table_id :name :parent_id)) lines)
        tbl-ids (into #{} (keep :table_id) lines)
        names   (into #{} (keep :name) lines)]
    (if (or (empty? tbl-ids) (empty? names))
      {}
      (let [rows (t2/select [:model/Field :id :table_id :name :parent_id]
                            {:where [:and
                                     [:= :is_defective_duplicate false]
                                     [:in :table_id tbl-ids]
                                     [:in :name names]]})]
        (into {}
              (comp (map (fn [{:keys [id table_id name parent_id]}]
                           [[table_id name parent_id] id]))
                    (filter (fn [[triple _]] (contains? triples triple))))
              rows)))))

(defn- match-fields-batch-values-join
  "PARKED — VALUES-JOIN implementation kept for A/B comparison during 20A
  perf work. Replaced by [[match-fields-batch]] which probes
  `unique_field_helper` directly to take advantage of `idx_unique_field`.

  Builds an `INNER JOIN` against an inline `VALUES` table containing the
  requested triples explicitly. Same pattern phase-4 uses for the FK update
  SQL (see [[finalize-batch-sql+params]]). Eliminates the cross-product
  over-include of [[match-fields-batch-loose-in]] — the planner sees exact
  triples and result rows are matches with no client-side filter.

  Pathology this implementation has: the `parent_id` NULL-equality predicate
  `(f.parent_id = v.parent_id) OR (f.parent_id IS NULL AND v.parent_id IS NULL)`
  is semantically equivalent to `COALESCE(f.parent_id, 0) = COALESCE(v.parent_id, 0)`,
  but the Postgres planner doesn't rewrite OR-of-IS-NULL into a helper-column
  equality. So this implementation can't probe `idx_unique_field` (which is
  keyed on `unique_field_helper = COALESCE(parent_id, 0)`) cleanly — the
  planner falls back to a less-selective access pattern for the `parent_id`
  third column."
  [lines]
  (let [triples (vec (into #{} (map (juxt :table_id :name :parent_id)) lines))]
    (if (empty? triples)
      {}
      (let [n            (count triples)
            tuple-sql    (fn [idx]
                           (if (zero? idx)
                             "(CAST(? AS INTEGER), ?, CAST(? AS INTEGER))"
                             "(?, ?, ?)"))
            values-sql   (str/join ", " (map tuple-sql (range n)))
            params       (into [] cat triples)
            sql          (str "SELECT f.id AS id, f.table_id AS table_id, "
                              "       f.name AS name, f.parent_id AS parent_id "
                              "FROM metabase_field f "
                              "INNER JOIN (VALUES " values-sql ") AS "
                              "  v(table_id, name, parent_id) "
                              "  ON f.table_id = v.table_id "
                              "  AND f.name = v.name "
                              "  AND ((f.parent_id = v.parent_id) "
                              "       OR (f.parent_id IS NULL AND v.parent_id IS NULL)) "
                              "WHERE f.is_defective_duplicate = false")
            rows         (t2/query (into [sql] params))]
        (into {}
              (map (fn [{:keys [id table_id name parent_id]}]
                     [[table_id name parent_id] id]))
              rows)))))

(defn- match-fields-batch
  "Look up every existing target Field matching any (target-table-id, name,
  target-parent-id) triple in `lines`. Scoped to `is_defective_duplicate=false`
  but **not** `active=true` — stubs (active=false) must match a later real-row
  arrival so phase 3 can fill them via UPDATE (§7 audit reminder, §11c). Returns
  `{[table-id name parent-id] → existing-id}`.

  Probes `idx_unique_field` directly. The unique index is over
  `(name, table_id, unique_field_helper)` where `unique_field_helper` is a
  STORED GENERATED column equal to `COALESCE(parent_id, 0)` for non-defective
  rows (NULL for defective rows). We compute `helper = (or parent_id 0)`
  client-side and JOIN against the index's three columns directly:

    - `f.name = v.name`
    - `f.table_id = v.table_id`
    - `f.unique_field_helper = v.helper`

  All three predicates are non-NULL integer/text equalities aligned with the
  index's column order, so the planner does a single index probe per batch
  row with no heap recheck. No `IS NOT DISTINCT FROM`, no
  `OR (both NULL)` — sidesteps the planner's blind spot in
  [[match-fields-batch-values-join]] and the over-include in
  [[match-fields-batch-loose-in]].

  Defective rows (`is_defective_duplicate=true`) have `helper = NULL`, which
  never equals any probe value, so they're naturally excluded — no explicit
  WHERE clause needed.

  Portability: `VALUES (...)` is standard SQL across Postgres / H2 / MySQL
  8+. `unique_field_helper` is defined in the migration with separate DDL
  for each DBMS (`STORED` for Postgres/MySQL, plain GENERATED ALWAYS for
  H2). The column is queryable identically from all three.

  See `MATCH_FIELDS_BATCH_OPTIMIZATION_ANALYSIS.md` §2-§4 for the derivation."
  [lines]
  (let [;; B' is the deduplicated set of probe quads:
        ;;   [table_id name parent_id helper]
        ;; helper = (or parent_id 0); we keep parent_id to reconstruct the
        ;; result-map key in the original triple shape.
        quads (into #{}
                    (map (fn [{:keys [table_id name parent_id]}]
                           [table_id name parent_id (or parent_id 0)]))
                    lines)]
    (if (empty? quads)
      {}
      (let [quads-v    (vec quads)
            n          (count quads-v)
            tuple-sql  (fn [idx]
                         (if (zero? idx)
                           "(CAST(? AS INTEGER), ?, CAST(? AS INTEGER))"
                           "(?, ?, ?)"))
            values-sql (str/join ", " (map tuple-sql (range n)))
            ;; Send (table_id, name, helper) per row. parent_id is local-only.
            params     (into []
                             (mapcat (fn [[t nm _p h]] [t nm h]))
                             quads-v)
            sql        (str "SELECT f.id AS id, "
                            "       f.table_id AS table_id, "
                            "       f.name AS name, "
                            "       f.parent_id AS parent_id "
                            "FROM metabase_field f "
                            "INNER JOIN (VALUES " values-sql ") AS "
                            "  v(table_id, name, helper) "
                            "  ON f.name = v.name "
                            "  AND f.table_id = v.table_id "
                            "  AND f.unique_field_helper = v.helper")
            rows       (t2/query (into [sql] params))]
        (into {}
              (map (fn [{:keys [id table_id name parent_id]}]
                     [[table_id name parent_id] id]))
              rows)))))

(defn- field-clobber
  "Clobber-on-match payload for fields (§11b). Writes everything sync would
  compute from the warehouse: `base_type`, `database_type`, `description`,
  `semantic_type`, `effective_type`, `coercion_strategy`. Always sets `active=true`
  (flips a stub's false to true; no-op for already-active rows). Excludes
  `parent_id` (natural-key match already proves the matched row has the right
  parent) and `fk_target_field_id` (phase 4 owns it)."
  [{:keys [base_type database_type description semantic_type effective_type coercion_strategy]}]
  (cond-> {:active true}
    (some? base_type)         (assoc :base_type base_type)
    (some? database_type)     (assoc :database_type database_type)
    (some? description)       (assoc :description description)
    (some? semantic_type)     (assoc :semantic_type semantic_type)
    (some? effective_type)    (assoc :effective_type effective_type)
    (some? coercion_strategy) (assoc :coercion_strategy coercion_strategy)))

(defn- new-field-row
  "Row for inserting a real field during phase 3. `resolved-parent-id` is the
  resolved target int (or nil for root / Convention-B leaves); `store-nfc-path`
  is the storage `nfc_path` to write (a vector or nil). `is_defective_duplicate`
  is always FALSE per §11a. `fk_target_field_id` starts NULL — phase 4 fills it
  in.

  The caller (`classify-fields-batch`) computes `store-nfc-path` per the
  storage convention: derived from `:parent_id` for Convention A, taken
  verbatim from `:nfc_path` for Convention B, nil for flat root."
  [{:keys [name base_type database_type description effective_type
           semantic_type coercion_strategy]}
   target-table-id
   resolved-parent-id
   store-nfc-path]
  (cond-> {:table_id               target-table-id
           :name                   name
           :base_type              base_type
           :nfc_path               (encode-nfc-path store-nfc-path)
           :parent_id              resolved-parent-id
           :fk_target_field_id     nil
           :is_defective_duplicate false
           :active                 true}
    (some? database_type)     (assoc :database_type database_type)
    (some? description)       (assoc :description description)
    (some? effective_type)    (assoc :effective_type effective_type)
    (some? semantic_type)     (assoc :semantic_type semantic_type)
    (some? coercion_strategy) (assoc :coercion_strategy coercion_strategy)))

(defn- field-match-key
  [{:keys [target-table-id resolved-parent row]}]
  [target-table-id (:name row) resolved-parent])

(defn- classify-fields-batch
  "Resolve `:target-table-id`, `:resolved-parent`, and `:store-nfc-path` for
  each row. Branches on the wire's storage convention:

    - `:parent_id` present (Convention A) — resolve via the per-batch parent
      cache (with stubs for missing ancestors per §11c). `:store-nfc-path` is
      the parent's path stripped of the table prefix.
    - `:nfc_path` present and `:parent_id` absent (Convention B) — flat-leaf
      from JSON unfolding. `:resolved-parent` is nil (no parent row exists in
      the source); `:store-nfc-path` is the wire `:nfc_path` verbatim.
    - Both absent (flat root) — both nil.

  Returns `[{:line :row :target-table-id :resolved-parent :store-nfc-path}]`,
  preserving input order. Drops rows whose `:table_id` doesn't resolve — the
  caller emits `:no-target-table` for those by re-scanning the original batch."
  [batch table-id-map parent-cache!]
  (into []
        (keep (fn [[ln line]]
                (when-let [tgt-tbl (get table-id-map (vec (:table_id line)))]
                  (let [parent-vec      (some-> (:parent_id line) vec)
                        wire-nfc-path   (some-> (:nfc_path line) vec)
                        resolved-parent (when parent-vec
                                          (or (get @parent-cache! parent-vec)
                                              (ensure-ancestors! parent-vec tgt-tbl parent-cache!)))
                        store-nfc-path  (cond
                                          parent-vec    (vec (drop 3 parent-vec))
                                          wire-nfc-path wire-nfc-path
                                          :else         nil)]
                    {:line             ln
                     :row              line
                     :target-table-id  tgt-tbl
                     :resolved-parent  resolved-parent
                     :store-nfc-path   store-nfc-path}))))
        batch))

(defn- clobber-matched-fields!
  "Clobber-on-match (§11b): for every classified row that matches an existing
  target field (real or stub), issue an UPDATE writing the full `field-clobber`
  payload. The same UPDATE handles both real-row matches (re-import) and stub
  fills (real row arriving after a child stubbed it)."
  [in-rows match-idx]
  (doseq [{:as in-row :keys [row]} in-rows
          :let [match-key (field-match-key in-row)
                payload   (field-clobber row)]
          :when (contains? match-idx match-key)]
    (t2/update! :model/Field (get match-idx match-key) payload)))

(defn- bulk-insert-unmatched-fields!
  "Bulk-INSERT every classified row that doesn't match an existing target field.
  Returns `{[target-table-id name resolved-parent] → new-id}`."
  [in-rows match-idx]
  (let [unmatched   (filterv (fn [in-row] (not (contains? match-idx (field-match-key in-row))))
                             in-rows)
        insert-rows (mapv (fn [{:keys [target-table-id resolved-parent store-nfc-path row]}]
                            (new-field-row row target-table-id resolved-parent store-nfc-path))
                          unmatched)
        new-ids     (when (seq insert-rows)
                      (t2/insert-returning-pks! :model/Field insert-rows))]
    (zipmap (map field-match-key unmatched) new-ids)))

(defn process-fields!
  "Phase-3 batch processor for fields — single-pass with stubs (§11c). Validates
  every row, self-resolves the portable `:table_id` and `:parent_id` references
  via batched natural-key SELECTs, inserts placeholder stubs for any missing
  parents (depth-first, per §11c's `ensure-ancestors!`), match-or-inserts each
  real row, and clobbers metadata on match (§11b). Returns an eduction.

  Tuple shape: `[line-num row]`. The loader passes batches straight through
  without pre-resolution.

  Result shapes:
    `{:source-id <portable-field-id> :target-id M :status :matched}`
    `{:source-id <portable-field-id> :target-id M :status :inserted}`
    `{:source-id <portable-field-id> :status :no-target-table :line L :detail S}`

  `:source-id` is the row's portable field id (a vector ending with the
  field's leaf name)."
  [batch]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/field-info ln line {:source-id (portable-field-id-vec line)}))
  (let [lines         (mapv second batch)
        table-id-map  (resolve-table-ids-batch lines)
        parent-vecs   (into #{}
                            (keep (fn [line] (some-> (:parent_id line) vec)))
                            lines)
        parent-cache! (volatile! (resolve-parent-ids-batch parent-vecs))
        in-rows       (classify-fields-batch batch table-id-map parent-cache!)
        match-idx     (match-fields-batch
                       (mapv (fn [{:keys [target-table-id resolved-parent row]}]
                               {:table_id  target-table-id
                                :name      (:name row)
                                :parent_id resolved-parent})
                             in-rows))]
    (clobber-matched-fields! in-rows match-idx)
    (let [id-by-key (bulk-insert-unmatched-fields! in-rows match-idx)
          ;; Lookup-by-line for results — classified rows are filtered, so build
          ;; an index from line-number to its classified record.
          by-line   (into {} (map (juxt :line identity)) in-rows)]
      (eduction
       (map (fn [[ln line]]
              (let [src-id (portable-field-id-vec line)]
                (if-let [classified (get by-line ln)]
                  (let [match-key (field-match-key classified)]
                    (if-let [existing (get match-idx match-key)]
                      {:source-id src-id :target-id existing :status :matched}
                      {:source-id src-id :target-id (get id-by-key match-key)
                       :status :inserted}))
                  {:source-id src-id :status :no-target-table :line ln
                   :detail   (format "No target table with portable id=%s"
                                     (pr-str (vec (:table_id line))))}))))
       batch))))

;;; ==================== fields (batch) — phase-4 fk resolve ====================

(defn- finalize-batch-sql+params
  "Build a single `UPDATE metabase_field` statement that sets `fk_target_field_id` for
  every `[target-id resolved-fk-target-id]` pair in `tuples`. Uses scalar subqueries
  over a `VALUES` table — portable across Postgres, H2, and MySQL 8+. The first
  VALUES row casts to INTEGER so later all-null columns can't be inferred as text."
  [tuples]
  (let [n               (count tuples)
        tuple-sql       (fn [idx]
                          (if (zero? idx)
                            "(CAST(? AS INTEGER), CAST(? AS INTEGER))"
                            "(?, ?)"))
        values-sql      (str/join ", " (map tuple-sql (range n)))
        in-placeholders (str/join ", " (repeat n "?"))
        values-params   (into [] cat tuples)
        id-params       (mapv first tuples)
        sql (str "UPDATE metabase_field SET "
                 "fk_target_field_id = (SELECT v.fk_target_field_id "
                 "FROM (VALUES " values-sql ") AS v(id, fk_target_field_id) "
                 "WHERE v.id = metabase_field.id) "
                 "WHERE id IN (" in-placeholders ")")]
    (into [sql] (concat values-params id-params))))

(defn process-fields-fk-resolve!
  "Phase-4 batch processor that resolves and writes `:fk_target_field_id`.

  For every row with a non-nil `:fk_target_field_id` (a portable field id):
  resolve both the row's own target int id and the FK target's target int id
  via one batched natural-key SELECT (`resolve-parent-ids-batch` over the union
  of own-vecs and fk-vecs), then issue ONE UPDATE per batch via the VALUES-table
  pattern (§5 phase 4). The SQL writes ONLY `fk_target_field_id`.

  By end of phase 3, every field referenced anywhere in the file (own row OR
  any fk target) exists in target appdb as either a real or stub row. Misses
  on either resolve hard-fail per §10 (corrupt file).

  Tuple shape: `[line-num row]`. Bare batches.

  Result shapes:
    `{:source-id <portable-field-id> :target-id M :status :updated}` (rows with fk-target)
    `{:source-id <portable-field-id> :status :no-fk}`                 (rows without)"
  [batch]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/field-info ln line {:source-id (portable-field-id-vec line)}))
  (let [fk-rows (filterv (fn [[_ line]] (some? (:fk_target_field_id line))) batch)]
    (if (empty? fk-rows)
      (eduction
       (map (fn [[_ln line]] {:source-id (portable-field-id-vec line) :status :no-fk}))
       batch)
      (let [own-vecs  (mapv (fn [[_ line]] (portable-field-id-vec line)) fk-rows)
            fk-vecs   (mapv (fn [[_ line]] (vec (:fk_target_field_id line))) fk-rows)
            all-vecs  (into #{} (concat own-vecs fk-vecs))
            id-by-vec (resolve-parent-ids-batch all-vecs)
            tuples
            (mapv (fn [[ln _line] own-vec fk-vec]
                    (let [own-id (get id-by-vec own-vec)
                          fk-id  (get id-by-vec fk-vec)]
                      (when-not own-id
                        (throw (ex-info "phase 4: row's own portable id not found in target"
                                        {:kind :not_found :line ln :source-id own-vec
                                         :detail (format "Row not found in target appdb: %s"
                                                         (pr-str own-vec))})))
                      (when-not fk-id
                        (throw (ex-info "phase 4: fk_target_field_id portable id not found in target"
                                        {:kind :not_found :line ln :source-id own-vec
                                         :detail (format "FK target not found in target appdb: %s"
                                                         (pr-str fk-vec))})))
                      [own-id fk-id]))
                  fk-rows
                  own-vecs
                  fk-vecs)
            affected (try (first (t2/query (finalize-batch-sql+params tuples)))
                          (catch Throwable e
                            (throw (wrap-row-error e nil nil))))]
        (when (not= affected (count fk-rows))
          (throw (ex-info "phase 4 UPDATE affected fewer rows than the fk-row batch"
                          {:kind   :server_error
                           :detail (format "updated=%d fk-rows=%d" affected (count fk-rows))})))
        (let [own-by-line (zipmap (mapv first fk-rows) (mapv first tuples))]
          (eduction
           (map (fn [[ln line]]
                  (let [src-id (portable-field-id-vec line)]
                    (if-let [own-id (get own-by-line ln)]
                      {:source-id src-id :target-id own-id :status :updated}
                      {:source-id src-id :status :no-fk}))))
           batch))))))

;;; ============================ field values (batch) ============================

(def ^:private ^:const field-values-advanced-types
  "Non-`'full'` FieldValues types. Kept in sync with `field-values/advanced-field-values-types`."
  ["sandbox" "linked-filter"])

(defn- find-existing-full-field-values
  "Look up every existing 'full' FieldValues row for any of `target-field-ids`. Returns
  `{field-id → fieldvalues-id}`."
  [target-field-ids]
  (if (empty? target-field-ids)
    {}
    (into {}
          (map (juxt :field_id :id))
          (t2/query
           (into [(str "SELECT id, field_id FROM metabase_fieldvalues "
                       "WHERE type = 'full' AND hash_key IS NULL AND field_id IN ("
                       (str/join ", " (repeat (count target-field-ids) "?")) ")")]
                 target-field-ids)))))

(defn- delete-advanced-field-values!
  "Bulk DELETE pre-existing `'sandbox'` / `'linked-filter'` FieldValues for `field-ids`,
  mirroring `:model/FieldValues`'s `define-before-insert` at batch granularity."
  [field-ids]
  (when (seq field-ids)
    (t2/query
     (into [(str "DELETE FROM metabase_fieldvalues "
                 "WHERE type IN ('" (str/join "', '" field-values-advanced-types) "') "
                 "AND field_id IN ("
                 (str/join ", " (repeat (count field-ids) "?")) ")")]
           field-ids))))

(defn- bulk-insert-full-field-values!
  "Bulk-INSERT new 'full' FieldValues rows for every entry in `to-insert`. Bypasses
  `:model/FieldValues`'s `define-before-insert` because we DELETE the same advanced
  types ourselves in [[delete-advanced-field-values!]] — going through the model
  would N-multiply that work."
  [to-insert]
  (when (seq to-insert)
    (t2/insert! :metabase_fieldvalues
                (mapv (fn [{:keys [target-field-id line-data]}]
                        (let [{:keys [values has_more_values human_readable_values]} line-data
                              now (mi/now)]
                          (cond-> {:field_id        target-field-id
                                   :type            "full"
                                   :hash_key        nil
                                   :values          (mi/json-in (or values []))
                                   :has_more_values has_more_values
                                   :created_at      now
                                   :updated_at      now}
                            (some? human_readable_values)
                            (assoc :human_readable_values (mi/json-in human_readable_values)))))
                      to-insert))))

(defn- update-existing-full-field-values!
  "Per-row UPDATE for FieldValues rows that already had a 'full' entry. Goes through
  `:model/FieldValues` so the model's JSON encoding hooks fire on the payload."
  [to-update existing-by-field]
  (doseq [{:keys [target-field-id line-data]} to-update
          :let [{:keys [values has_more_values human_readable_values]} line-data]]
    (t2/update! :model/FieldValues (get existing-by-field target-field-id)
                (cond-> {:values          (or values [])
                         :has_more_values has_more_values}
                  (some? human_readable_values)
                  (assoc :human_readable_values human_readable_values)))))

(defn- classify-field-values-batch
  "Project resolvable rows into the shape downstream helpers expect: each entry carries
  the line number, the original row data, and the loader-resolved target field id.
  Drops rows whose source `field_id` has no target."
  [batch resolve-field-id-fn]
  (into []
        (keep (fn [[ln line]]
                (when-let [tgt (resolve-field-id-fn (:field_id line))]
                  (when (pos? tgt)
                    {:line ln :line-data line :target-field-id tgt}))))
        batch))

(defn process-field-values!
  "Phase-5 batch processor for field values. Each input row is upserted into
  `metabase_fieldvalues` with `type='full'` and `hash_key=NULL`.

  `resolve-field-id-fn` is a Clojure-callable (function or map) that maps a source
  `:field_id` to a target field id (or returns nil/-1 for a miss). The loader
  typically passes a thin wrapper around the disk-spooled IdMap.

  Per batch: one batch SELECT for existing 'full' rows, one bulk DELETE of advanced
  ('sandbox' / 'linked-filter') FieldValues for fields about to receive a new
  'full' row (mirrors `:model/FieldValues`'s `define-before-insert` at batch
  granularity), one bulk INSERT for new 'full' rows, and per-row UPDATE for
  existing ones.

  Returns an eduction.

  Result shapes:
    `{:source-field-id S :target-field-id T :status :inserted}`
    `{:source-field-id S :target-field-id T :status :updated}`
    `{:source-field-id S :status :no-target-field :line L :detail D}`"
  [batch resolve-field-id-fn]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/field-values-info ln line
                    {:source-field-id (:field_id line)}))
  (let [in-rows           (classify-field-values-batch batch resolve-field-id-fn)
        target-field-ids  (mapv :target-field-id in-rows)
        existing-by-field (find-existing-full-field-values target-field-ids)
        {:keys [to-insert to-update]} (group-by (fn [{:keys [target-field-id]}]
                                                  (if (contains? existing-by-field target-field-id)
                                                    :to-update :to-insert))
                                                in-rows)]
    (delete-advanced-field-values! (mapv :target-field-id to-insert))
    (bulk-insert-full-field-values! to-insert)
    (update-existing-full-field-values! to-update existing-by-field)
    (eduction
     (map (fn [[ln {:keys [field_id]}]]
            (let [tgt (resolve-field-id-fn field_id)]
              (if (and tgt (pos? tgt))
                (if (contains? existing-by-field tgt)
                  {:source-field-id field_id :target-field-id tgt :status :updated}
                  {:source-field-id field_id :target-field-id tgt :status :inserted})
                {:source-field-id field_id :status :no-target-field :line ln
                 :detail (format "Source field_id=%s has no target mapping"
                                 (pr-str field_id))}))))
     batch)))
