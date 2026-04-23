(ns metabase.agent-lib.representations.repair
  "Repair pass for LLM-authored representations queries.

  Works on the **string-keyed, portable** representations form -- i.e. the output of
  `metabase.agent-lib.representations/parse-yaml` *before* it has been handed to the resolver.
  This is where we gently patch up the sort of shape drift that LLMs routinely produce:

    * missing `{}` options on clauses (LLMs forget to emit empty maps);
    * missing `\"lib/type\"` marker on stages and on the top-level query;
    * (structurally prepared, but Phase-2 feature) resolved-UUID generation for aggregation refs.

  **Key invariant: idempotency.** Repair must be a fixed point under repeated application: for
  any repr `q`, `(repair q)` must equal `(repair (repair q))`. This is enforced by property test
  and by construction -- every pass is written as `when-something-is-missing, add it`, never as
  `rewrite what's there`.

  Phase 1 scope: the three basic passes above. More complex repairs -- placeholder UUID expansion
  for `@agg-N` references (Phase 2 step 10), implicit-join `source-field` inference (Phase 1
  step 6) -- live in follow-up passes that will be composed here once implemented.

  The repair pass does **not** do FK resolution (that's the resolver's job) and does **not**
  validate (that's `representations/validate-query`'s job). It runs *between* parse and
  validate-and-resolve -- i.e. we parse the LLM YAML, repair obvious issues, then validate, then
  resolve.

  ## Implicit joins

  In addition to the shape passes above, `repair` also runs an **implicit-join pass** that uses
  the caller's `MetadataProvider` to auto-wire `source-field` options on field clauses that
  reference a table other than the stage's `source-table`. That pass is the only reason `repair`
  takes an `mp` argument — the shape passes themselves don't need it."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.models.serialization.resolve.mp :as resolve.mp]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; Pass 1 -- ensure every clause vector has an options map at position 2
;;; ============================================================

(defn- non-blank-string? [x]
  (and (string? x) (not= "" x)))

(defn- looks-like-fk-path?
  "An FK path is a vector of strings (possibly with `nil` for schema-less DBs) of length >= 3
  (`[db schema table]`) or >= 4 (`[db schema table col …]`). We use length >= 3 as the cutoff
  here to keep things safe -- shorter vectors of strings are probably not FK paths, they're more
  likely bare clauses like `[\"count\"]` that the LLM forgot to annotate."
  [v]
  (and (>= (count v) 3)
       (every? #(or (string? %) (nil? %)) v)))

(defn- clause-like?
  "Heuristic: a real clause vector (not a map entry, not an FK path) whose head is a non-blank
  operator string. We skip:

    * `map-entry?` values (postwalk descends into map entries; their shape is [k v] and our
      heuristic would otherwise misidentify them as bare clauses);
    * FK-paths of length >= 3 consisting entirely of strings and `nil`s (see
      [[looks-like-fk-path?]])."
  [v]
  (and (vector? v)
       (not (map-entry? v))
       (pos? (count v))
       (non-blank-string? (first v))
       (not (looks-like-fk-path? v))))

(defn- needs-options-map?
  "True if `v` is a clause-like vector whose position 2 is either missing or `nil`.

  IMPORTANT: we do NOT treat a non-nil non-map at position 2 as \"missing options\". That would be
  ambiguous -- position 2 might be a nested clause (`[\"=\", [\"field\", ...], 10]` where the LLM
  forgot the options on `=`), and replacing that nested clause with `{}` would silently drop
  data. Instead we only repair the two unambiguous cases:

    * clause too short (no position 2 at all): `[\"count\"]` -> `[\"count\" {}]`;
    * explicit nil at position 2: `[\"count\", nil]` -> `[\"count\" {}]`.

  For a clause like `[\"=\", [\"field\", ...], 10]` where the options slot holds another clause,
  we **insert** `{}` before the existing element (see [[insert-options-map]])."
  [v]
  (and (clause-like? v)
       (or (< (count v) 2)
           (nil? (nth v 1))
           ;; position 2 is present but not a map -- means the LLM skipped the options slot
           ;; entirely and the arg at position 1 is actually a term (nested clause or FK-path
           ;; vector or a scalar). In that case we need to insert, not replace.
           (not (map? (nth v 1))))))

(defn- insert-options-map
  "Given a clause-like vector missing its options map at position 2, produce a vector with `{}`
  there. Three cases:

    * `[op]` -> `[op {}]`
    * `[op nil …args]` -> `[op {} …args]`  (replace the nil placeholder)
    * `[op <non-nil-non-map> …args]` -> `[op {} <non-nil-non-map> …args]`  (insert, don't replace)"
  [v]
  (cond
    (< (count v) 2)           (conj v {})
    (nil? (nth v 1))          (assoc v 1 {})
    (not (map? (nth v 1)))    (into [(first v) {}] (subvec v 1))
    :else                     v))

(defn- ensure-clause-options*
  [form]
  (walk/postwalk
   (fn [node]
     (if (and (vector? node) (not (map-entry? node)) (needs-options-map? node))
       (insert-options-map node)
       node))
   form))

;;; ============================================================
;;; Pass 2 -- fill in missing `lib/type` markers
;;; ============================================================

(defn- top-level-query-map?
  [m]
  (and (map? m)
       (contains? m "database")
       (contains? m "stages")))

(defn- stage-like-map?
  "A map that looks like an MBQL stage: has `\"source-table\"`, `\"source-card\"`, or any of the
  stage-body keys (`filters`, `aggregation`, `breakout`, `order-by`, `fields`, `joins`,
  `expressions`, `limit`). Not a top-level query."
  [m]
  (and (map? m)
       (not (top-level-query-map? m))
       (boolean
        (some #(contains? m %)
              ["source-table" "source-card" "filters" "aggregation"
               "breakout" "order-by" "fields" "joins" "expressions" "limit"]))))

(defn- infer-query-lib-type [m]
  (if (and (top-level-query-map? m) (not (contains? m "lib/type")))
    (assoc m "lib/type" "mbql/query")
    m))

(defn- infer-stage-lib-type [m]
  (if (and (stage-like-map? m) (not (contains? m "lib/type")))
    (assoc m "lib/type" "mbql.stage/mbql")
    m))

(defn- ensure-lib-types* [form]
  (walk/postwalk
   (fn [node]
     (if (map? node)
       (-> node infer-query-lib-type infer-stage-lib-type)
       node))
   form))

;;; ============================================================
;;; Pass 2.5 -- rewrite the database name to match the metadata provider
;;;
;;; Background: our prompt examples consistently use `Sample` as the database name (see
;;; `resources/metabot/prompts/tools/construct_notebook_query.md`), so the LLM tends to write
;;; `database: Sample` and `source-table: [Sample, PUBLIC, ORDERS]` literally — even when the
;;; real application database is `Sample Database`. The downstream resolver requires exact
;;; string equality on the DB name, which causes a hard `:unknown-database` failure for the
;;; canonical demo flow.
;;;
;;; Per `repr-plan.md` step 13, `source_entity` (and thus the metadata provider) is the
;;; ground truth for which database the query targets — the `database:` field and the DB
;;; component of every portable FK in the YAML are redundant w.r.t. the MP. So we simply
;;; overwrite them with the MP's actual DB name before validation/resolution.
;;;
;;; This is a permissive fix: any DB name the LLM writes (including the prompt's `Sample`,
;;; the real `Sample Database`, or a hallucinated `MyDB`) gets normalised to the MP's name.
;;; Cross-database queries are not supported by this tool anyway, so the MP unambiguously
;;; identifies the only legal DB.
;;; ============================================================

(defn- rewrite-fk-db-name
  "If `v` is a portable-FK-shaped vector, return it with its first slot replaced by `db-name`.
  Otherwise return `v` unchanged.

  Note we only rewrite when the existing first slot is a string — never when it's already nil
  or some other shape — so we don't accidentally clobber non-FK vectors that happen to look
  FK-ish under a future schema change."
  [v db-name]
  (if (and (vector? v)
           (not (map-entry? v))
           (looks-like-fk-path? v)
           (string? (first v)))
    (assoc v 0 db-name)
    v))

(defn- rewrite-database-name*
  "Rewrite the top-level `\"database\"` field and the DB component of every portable FK in
  `query` to `db-name`. No-op when `db-name` is nil."
  [query db-name]
  (if-not db-name
    query
    (let [walked (walk/postwalk
                  (fn [node] (rewrite-fk-db-name node db-name))
                  query)]
      (cond-> walked
        (and (map? walked) (contains? walked "database"))
        (assoc "database" db-name)))))

;;; ============================================================
;;; Pass 3 -- auto-wire `source-field` for implicit joins
;;;
;;; When a field clause references a field on a table *other* than the stage's
;;; `source-table`, and there is exactly one foreign key from the source table to that target
;;; table, fill in the `source-field` option with the portable FK of the FK column. The QP
;;; interprets this as an implicit join (the same machinery users get from the notebook UI).
;;;
;;; The pass walks stage[0] only, skips descent into the `\"joins\"` subtree (field clauses
;;; inside a join live in a join context), and is a no-op on clauses that already carry
;;; `source-field` or `join-alias`.
;;; ============================================================

(defn- field-clause?
  "A repaired field clause of shape `[\"field\" <opts-map> <portable-fk-vector>]`. We require the
  opts map to be a real map and the portable FK to be a vector of >= 4 elements (DB, SCHEMA,
  TABLE, FIELD, …)."
  [v]
  (and (vector? v)
       (not (map-entry? v))
       (>= (count v) 3)
       (= "field" (nth v 0))
       (map? (nth v 1))
       (let [fk (nth v 2)]
         (and (vector? fk) (>= (count fk) 4)))))

(defn- try-resolve-source-table-id
  "Resolve the stage's `source-table` portable FK to a numeric id. Returns nil on any failure
  (unknown DB, unknown table, nil source-table, wrong shape, etc.) — implicit-join repair is
  best-effort and should never mask an error that the downstream validate/resolve passes will
  surface with a better message."
  [import-resolver source-table-fk]
  (try
    (when (and import-resolver (vector? source-table-fk) (= 3 (count source-table-fk)))
      (resolve/import-table-fk import-resolver source-table-fk))
    (catch Exception _ nil)))

(defn- try-resolve-field-target-table-id
  "Resolve the target-table-id of a portable field FK, by looking up the field and following its
  `:table-id`. Walks JSON-unfolded parent chains via the resolver's `import-field-fk`. Returns
  nil on failure."
  [mp import-resolver field-fk]
  (try
    (when-let [fid (resolve/import-field-fk import-resolver field-fk)]
      (:table-id (lib.metadata.protocols/field mp fid)))
    (catch Exception _ nil)))

(defn- export-source-field-portable
  "Convert a numeric FK column id into its portable `[db schema table field …]` path, via the
  MP-backed export resolver. Returns nil on failure."
  [export-resolver source-field-id]
  (try
    (resolve/export-field-fk export-resolver source-field-id)
    (catch Exception _ nil)))

(defn- display-source-table [mp source-table-id]
  (try
    (let [t (lib.metadata.protocols/table mp source-table-id)]
      (or (:name t) (str source-table-id)))
    (catch Exception _ (str source-table-id))))

(defn- display-portable [fk]
  (pr-str fk))

(defn- maybe-fill-source-field
  "Given a field-clause vector (already known to be a field clause), the stage's source-table-id,
  and the precomputed outbound-FK map, return either the original clause or a clause with
  `\"source-field\"` populated. Throws `:no-fk-path` or `:ambiguous-fk` on hard errors."
  [clause mp import-resolver export-resolver source-table-id outbound-fks-by-target]
  (let [opts (nth clause 1)
        fk   (nth clause 2)]
    (cond
      ;; already has source-field or join-alias: leave it alone.
      (contains? opts "source-field")
      clause

      (contains? opts "join-alias")
      clause

      :else
      (let [target-table-id (try-resolve-field-target-table-id mp import-resolver fk)]
        (cond
          ;; Couldn't resolve target table: skip (validate/resolve will surface the real error).
          (nil? target-table-id)
          clause

          ;; Field is on the source table itself: nothing to do.
          (= target-table-id source-table-id)
          clause

          :else
          (let [candidates (get outbound-fks-by-target target-table-id)]
            (case (count candidates)
              0 (let [src-name (display-source-table mp source-table-id)
                      tbl-name (nth fk 2)]
                  (throw (ex-info (tru "Field {0} is on table {1} but there is no foreign key from the source table {2} to {3}. Either add an explicit joins: entry, or use a field from the source table."
                                       (display-portable fk)
                                       (pr-str tbl-name)
                                       (pr-str src-name)
                                       (pr-str tbl-name))
                                  {:status-code  400
                                   :error        :no-fk-path
                                   :agent-error? true
                                   :field        fk
                                   :source-table source-table-id
                                   :target-table target-table-id})))
              1 (let [{:keys [source-field-id]} (first candidates)
                      src-fk (export-source-field-portable export-resolver source-field-id)]
                  (if src-fk
                    (assoc clause 1 (assoc opts "source-field" src-fk))
                    clause))
              (let [src-name      (display-source-table mp source-table-id)
                    candidate-fks (mapv (fn [{:keys [source-field-id]}]
                                          (export-source-field-portable export-resolver source-field-id))
                                        candidates)]
                (throw (ex-info (tru "Field {0} can be reached from {1} via {2} foreign keys. Specify :source-field explicitly in the clause options. Candidates: {3}"
                                     (display-portable fk)
                                     (pr-str src-name)
                                     (count candidates)
                                     (str/join ", " (map display-portable candidate-fks)))
                                {:status-code  400
                                 :error        :ambiguous-fk
                                 :agent-error? true
                                 :field        fk
                                 :source-table source-table-id
                                 :target-table target-table-id
                                 :candidates   candidate-fks}))))))))))

(defn- resolve-implicit-joins-in-stage
  "Apply implicit-join repair to a single stage map (string-keyed). Returns an updated stage.

  Skips descent into the `\"joins\"` subtree by plucking it out before the postwalk and
  restoring it afterwards — field clauses inside explicit joins are expected to carry a
  `join-alias` already."
  [stage mp import-resolver export-resolver]
  (let [source-table-fk (get stage "source-table")
        source-table-id (try-resolve-source-table-id import-resolver source-table-fk)]
    (if-not source-table-id
      ;; Can't resolve source-table: skip the pass and let validate/resolve surface the error.
      stage
      (let [outbound  (resolve.mp/outbound-fks-from-table mp source-table-id)
            by-target (group-by :target-table-id outbound)
            joins     (get stage "joins")
            stage'    (cond-> stage (contains? stage "joins") (dissoc "joins"))
            walked    (walk/postwalk
                       (fn [node]
                         (if (field-clause? node)
                           (maybe-fill-source-field node mp import-resolver export-resolver
                                                    source-table-id by-target)
                           node))
                       stage')]
        (cond-> walked
          (contains? stage "joins") (assoc "joins" joins))))))

(defn- resolve-implicit-joins*
  "Top-level implicit-join pass. Phase 1 handles `stages[0]` only."
  [query mp]
  (if-not (and mp (map? query) (vector? (get query "stages")) (seq (get query "stages")))
    query
    (let [import-resolver (resolve.mp/import-resolver mp)
          export-resolver (resolve.mp/export-resolver mp)]
      (update-in query ["stages" 0] resolve-implicit-joins-in-stage
                 mp import-resolver export-resolver))))

;;; ============================================================
;;; Top-level entry point
;;; ============================================================

(defn- normalize-shape*
  "Pure-shape passes that don't require a metadata provider."
  [parsed]
  (-> parsed
      ensure-clause-options*
      ensure-lib-types*))

(defn repair
  "Run the repair pipeline on a parsed (string-keyed, portable) representations query.

  Phase 1 passes:
    1. ensure every clause vector has an options map at position 2;
    2. fill in missing `\"lib/type\"` markers on the query and stages;
    3. rewrite the top-level `\"database\"` field and the DB component of every portable FK
       in the query to match the metadata provider's actual database name. This decouples the
       LLM-authored DB name (which often follows the prompt examples literally) from the real
       DB the query will run against — the MP is the source of truth.
    4. auto-wire `source-field` on field clauses that reference a foreign table via a single
       unambiguous FK on the source table (implicit-join resolution).

  Passes 3 and 4 require `mp` (a `MetadataProvider`). They are best-effort no-ops when `mp`
  can't resolve the relevant pieces (so the subsequent validate/resolve stages can surface the
  real error with their own, better messages). Hard FK errors (`:no-fk-path`, `:ambiguous-fk`)
  are raised as `:agent-error?` ex-info so the tool wrapper can relay them to the LLM.

  Guaranteed to be **idempotent**: `(= (repair mp q) (repair mp (repair mp q)))`."
  [mp parsed]
  (let [db-name (when mp (:name (lib.metadata/database mp)))]
    (-> parsed
        normalize-shape*
        (rewrite-database-name* db-name)
        (resolve-implicit-joins* mp))))
