(ns metabase-enterprise.transform-optimizer.verify
  "Equivalence verification for a proposal vs the original transform.

  Materialises both queries into scratch tables in a dedicated schema, then
  compares with `EXCEPT ALL` in both directions — exactly the form the
  Phase-0 harness uses, generalised to live transforms.

  This is Postgres-only for the same reason the rest of the optimizer is:
  the SQL we feed in is the compiled source of a native Postgres transform.
  We can extend to other dialects later by parameterising the scratch-schema
  / EXCEPT-ALL form."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection ResultSet)))

(set! *warn-on-reflection* true)

(def ^:private scratch-schema "transform_optimizer_verify")
(def ^:private sample-limit 10)

;; A "table-ref" in this namespace is `{:schema "..." :table "..."}`. The
;; slow side may be either a fresh scratch materialisation (when the
;; transform hasn't run yet, or has been edited since) or the live target
;; table (when we can reuse the last run's output). The fast side is
;; always materialised in scratch.

(def ^:private scratch-slow-ref {:schema scratch-schema :table "slow"})
(def ^:private scratch-fast-ref {:schema scratch-schema :table "fast"})

(defn- safe-ident? [s]
  (boolean (and s (re-matches #"[A-Za-z0-9_]+" s))))

(defn- safe-table-spec? [{:keys [schema table]}]
  (and (safe-ident? schema) (safe-ident? table)))

(defn- table-ref ^String [{:keys [schema table]}]
  (str schema "." table))

;; ---------------------------------------------------------------------------
;; Connection / SQL helpers

(defn- exec! [^Connection conn sql]
  (with-open [stmt (.createStatement conn)]
    (.execute stmt sql)))

(defn- scalar [^Connection conn sql]
  (with-open [stmt (.createStatement conn)
              ^ResultSet rs (.executeQuery stmt sql)]
    (when (.next rs) (.getObject rs 1))))

(defn- materialize!
  "Drop+create the table referenced by `ref` as the result of `select-sql`,
  timing the wall clock around the CREATE TABLE. Returns `{:ms :row-count}`."
  [^Connection conn ref select-sql]
  (let [tref (table-ref ref)]
    (exec! conn (str "DROP TABLE IF EXISTS " tref))
    (let [t0    (System/nanoTime)
          ddl   (str "CREATE TABLE " tref " AS " select-sql)
          _     (exec! conn ddl)
          ms    (/ (- (System/nanoTime) t0) 1e6)
          rows  (scalar conn (str "SELECT count(*) FROM " tref))]
      {:ms ms :row-count rows})))

(defn- count-rows [^Connection conn ref]
  (scalar conn (str "SELECT count(*) FROM " (table-ref ref))))

;; ---------------------------------------------------------------------------
;; Column / schema compatibility

(defn- column-info
  "Return `[[col-name pg-type-name] …]` for `ref` in ordinal order, used for
  schema compatibility checks before the row comparison."
  [^Connection conn {:keys [schema table]}]
  (let [sql (str "SELECT column_name, data_type "
                 "FROM information_schema.columns "
                 "WHERE table_schema = '" schema "' "
                 "  AND table_name   = '" table "' "
                 "ORDER BY ordinal_position")]
    (with-open [stmt (.createStatement conn)
                ^ResultSet rs (.executeQuery stmt sql)]
      (loop [out []]
        (if (.next rs)
          (recur (conj out [(.getString rs 1) (.getString rs 2)]))
          out)))))

(defn- schema-match
  "Compare the two column lists. Returns `nil` when compatible, otherwise a
  `{:error … :detail …}` map ready to surface as a 422."
  [slow-cols fast-cols]
  (cond
    (not= (count slow-cols) (count fast-cols))
    {:error  "schema_mismatch"
     :detail (format "slow has %d columns, fast has %d"
                     (count slow-cols) (count fast-cols))}

    ;; We don't require matching column names — `EXCEPT ALL` matches by
    ;; position. Type compatibility is checked by Postgres at EXCEPT time;
    ;; we surface that as a more readable error below.
    :else nil))

;; ---------------------------------------------------------------------------
;; Diff

(def ^:private diff-sql-template
  "SELECT count(*) AS c FROM (
     (SELECT * FROM %s EXCEPT ALL SELECT * FROM %s)
     UNION ALL
     (SELECT * FROM %s EXCEPT ALL SELECT * FROM %s)
   ) d")

(defn- diff-count [^Connection conn slow-ref fast-ref]
  (let [slow (table-ref slow-ref)
        fast (table-ref fast-ref)]
    (long (scalar conn (format diff-sql-template slow fast fast slow)))))

(defn- row->vec [^ResultSet rs col-count]
  (loop [i 1, out []]
    (if (> i col-count)
      out
      (recur (inc i) (conj out (.getObject rs i))))))

(defn- diff-sample
  "When the row counts differ, fetch a small sample from each direction so
  the UI can show a 'rows that are in slow but not fast / vice versa' diff.
  Capped at `sample-limit` rows per direction."
  [^Connection conn slow-ref fast-ref]
  (with-open [stmt (.createStatement conn)]
    (let [slow (table-ref slow-ref)
          fast (table-ref fast-ref)
          sql-only-in-slow (format "(SELECT * FROM %s EXCEPT ALL SELECT * FROM %s) LIMIT %d"
                                   slow fast sample-limit)
          sql-only-in-fast (format "(SELECT * FROM %s EXCEPT ALL SELECT * FROM %s) LIMIT %d"
                                   fast slow sample-limit)
          collect (fn [sql]
                    (with-open [^ResultSet rs (.executeQuery stmt sql)]
                      (let [md       (.getMetaData rs)
                            n        (.getColumnCount md)
                            col-names (mapv #(.getColumnName md %) (range 1 (inc n)))]
                        {:columns col-names
                         :rows    (loop [out []]
                                    (if (.next rs)
                                      (recur (conj out (row->vec rs n)))
                                      out))})))]
      {:only_in_slow (collect sql-only-in-slow)
       :only_in_fast (collect sql-only-in-fast)})))

;; ---------------------------------------------------------------------------
;; Static (parser-only) preflight
;;
;; Cheap sanity check we run before materialising anything: same set of
;; referenced tables, same returned column names in the same order. Catches
;; the common LLM failure mode where a rewrite's FROM clause references a
;; table that doesn't exist in the original (name drift, hallucinated
;; precompute targets, typos) without paying the cost of executing both
;; queries against the source DB.
;;
;; Tolerant of parse failures: if macaw can't analyse one side, we return
;; nil and let the materialise step surface a real Postgres error instead
;; of a parser one.

(defn- lower [s] (some-> s u/lower-case-en))

(defn- normalize-table-spec [{:keys [schema table]}]
  [(lower schema) (lower table)])

(defn- referenced-tables [driver sql]
  (try
    (into #{} (map normalize-table-spec) (sql-tools/referenced-tables-raw driver sql))
    (catch Exception _ nil)))

(defn- returned-column-names [driver sql]
  (try
    (let [{:keys [returned-fields errors]} (sql-tools/field-references driver sql)]
      (when (empty? errors)
        (mapv (fn [{:keys [alias column]}] (lower (or alias column)))
              returned-fields)))
    (catch Exception _ nil)))

(defn- static-check
  "Parser-only equivalence preflight. Returns `{:error … :detail …}` on a
  known mismatch, otherwise nil. Skips the table-set check when the
  proposal depends on another proposal — a dependent rewrite legitimately
  references the precompute's target table."
  [driver original-sql proposal-sql {:keys [depends_on]}]
  (let [orig-tables (referenced-tables driver original-sql)
        prop-tables (referenced-tables driver proposal-sql)
        orig-cols   (returned-column-names driver original-sql)
        prop-cols   (returned-column-names driver proposal-sql)]
    (cond
      (and (empty? depends_on)
           orig-tables prop-tables
           (not= orig-tables prop-tables))
      (let [missing (set/difference orig-tables prop-tables)
            extra   (set/difference prop-tables orig-tables)]
        {:error  "table_set_mismatch"
         :detail (str "Proposal references a different set of tables than the original."
                      (when (seq missing) (str " Original-only: " (pr-str (vec missing)) "."))
                      (when (seq extra)   (str " Proposal-only: "  (pr-str (vec extra))  ".")))})

      (and orig-cols prop-cols
           (not= orig-cols prop-cols))
      {:error  "returned_columns_mismatch"
       :detail (str "Returned column names differ. "
                    "Original: " (pr-str orig-cols) ". "
                    "Proposal: " (pr-str prop-cols) ".")}

      :else nil)))

;; ---------------------------------------------------------------------------
;; Reusing the live target table as the "slow" side
;;
;; If the transform has already run successfully and hasn't been edited
;; since that run started, the live target table is byte-identical to what
;; rerunning `slow-sql` would produce — modulo source-data drift, which we
;; can't detect cheaply and accept as a known limitation. Reusing it saves
;; the full slow-SQL execution, which for many transforms is the dominant
;; cost of verify. We also surface the original run's wall-clock as
;; `slow_duration_ms` so the speedup number is meaningful.

(defn- last-successful-run [transform-id]
  (t2/select-one :model/TransformRun
                 :transform_id transform-id
                 :status :succeeded
                 {:order-by [[:start_time :desc]]}))

(defn- run-duration-ms [{:keys [start_time end_time]}]
  (when (and start_time end_time)
    (let [s (transforms-base.u/->instant start_time)
          e (transforms-base.u/->instant end_time)]
      (.toMillis (java.time.Duration/between s e)))))

(defn- transform-unchanged-since-run? [transform run]
  (let [tu (some-> transform :updated_at transforms-base.u/->instant)
        rs (some-> run :start_time transforms-base.u/->instant)]
    (boolean (and tu rs (not (.isAfter tu rs))))))

(defn- target-ref [transform]
  (let [{:keys [schema name]} (:target transform)]
    {:schema schema :table name}))

(defn- reusable-target-ref
  "Returns the target table-ref to reuse as the slow side, or nil. Only
  reused when (a) the transform has a successful last run, (b) it hasn't
  been edited since that run started, and (c) the identifiers are safe."
  [transform]
  (when-let [run (last-successful-run (:id transform))]
    (when (transform-unchanged-since-run? transform run)
      (let [ref (target-ref transform)]
        (when (safe-table-spec? ref)
          {:ref ref :run run})))))

;; ---------------------------------------------------------------------------
;; Public API

(defn- ensure-scratch-schema! [^Connection conn]
  (exec! conn (str "CREATE SCHEMA IF NOT EXISTS " scratch-schema)))

(defn- cleanup! [^Connection conn]
  ;; Only drop the scratch tables — never the live target, even if we
  ;; pointed `slow-ref` at it.
  (try
    (exec! conn (str "DROP TABLE IF EXISTS " (table-ref scratch-slow-ref)))
    (exec! conn (str "DROP TABLE IF EXISTS " (table-ref scratch-fast-ref)))
    (catch Exception e
      (log/warn e "transform-optimizer verify: scratch cleanup failed"))))

(defn- proposal-final-sql
  "For a single-transform proposal the `body` is the comparison query.
  For precompute (DAG) proposals we'd need to materialise the precompute
  tables first; that's deferred — return a clear error."
  [proposal]
  (cond
    (= "precompute" (some-> (:kind proposal) name))
    (throw (ex-info "verify for precompute (DAG) proposals is not yet implemented"
                    {:status-code 422 :error "unsupported_kind"}))

    (str/blank? (:body proposal))
    (throw (ex-info "proposal has no SQL body to verify"
                    {:status-code 422 :error "missing_body"}))

    :else
    (:body proposal)))

(defn verify
  "Compare `transform` against `proposal`. Returns the response payload
  documented in SUMMARY.md.

  Throws an `ex-info` with `:status-code 422` for known failure modes
  (precompute proposals, missing body, schema mismatch). Other exceptions
  bubble up — callers should map them to 500."
  [transform proposal]
  (let [db-id    (transforms-base.u/transform-source-database transform)
        driver-kw (t2/select-one-fn (comp keyword :engine) :model/Database :id db-id)
        slow-sql  (-> (transforms-base.u/compile-source transform nil) :query)
        fast-sql  (proposal-final-sql proposal)]
    (when-not (= :postgres driver-kw)
      (throw (ex-info "verify is Postgres-only in this branch"
                      {:status-code 422 :error "unsupported_driver"})))
    (when (str/blank? slow-sql)
      (throw (ex-info "could not compile original transform"
                      {:status-code 422 :error "compile_failed"})))

    (when-let [{:keys [error detail]} (static-check driver-kw slow-sql fast-sql proposal)]
      (throw (ex-info detail {:status-code 422 :error error})))

    (let [reuse (reusable-target-ref transform)]
      (sql-jdbc.execute/do-with-connection-with-options
       driver-kw db-id nil
       (fn [^Connection conn]
         (try
           (ensure-scratch-schema! conn)
           (let [slow-ref   (if reuse (:ref reuse) scratch-slow-ref)
                 slow-stats (if reuse
                              {:ms        (run-duration-ms (:run reuse))
                               :row-count (count-rows conn slow-ref)}
                              (materialize! conn scratch-slow-ref slow-sql))
                 fast-stats (materialize! conn scratch-fast-ref fast-sql)
                 slow-cols  (column-info conn slow-ref)
                 fast-cols  (column-info conn scratch-fast-ref)
                 mismatch   (schema-match slow-cols fast-cols)]
             (if mismatch
               (throw (ex-info (:detail mismatch) (assoc mismatch :status-code 422)))
               (let [diff-rows   (diff-count conn slow-ref scratch-fast-ref)
                     equivalent? (zero? diff-rows)
                     slow-ms     (some-> (:ms slow-stats) long)
                     fast-ms     (long (:ms fast-stats))
                     speedup     (when (and slow-ms (pos? fast-ms))
                                   (double (/ slow-ms fast-ms)))]
                 (cond-> {:equivalent       equivalent?
                          :slow_duration_ms slow-ms
                          :fast_duration_ms fast-ms
                          :speedup          speedup
                          :diff_rows        diff-rows
                          :slow_source      (if reuse "transform_run" "materialized")
                          :sample_diff      (when-not equivalent?
                                              (diff-sample conn slow-ref scratch-fast-ref))}
                   reuse
                   (assoc :slow_run_id (:id (:run reuse)))))))
           (finally
             (cleanup! conn))))))))
