(ns metabase.transforms.test-run.assertions
  "Assertion evaluation for transform test runs.

  An assertion is a SQL query that passes iff it returns zero rows. The SQL
  references real table names (the target's output table + input tables) and/or
  the synthetic `test_output` relation; the harness remaps every real reference
  to scratch and binds `test_output` to the target's output.

  Callers depend only on the data interface of [[run-assertions!]]. Execution
  splits into four stages — `prepare` (rewrite+verify, shared), an OutputBinding
  (how `test_output` is satisfied), an ExecutionStrategy (how prepared assertions
  are run), and `interpret` (counts→results, shared). Strategy and binding are
  selectable via the options map; the defaults are `:batched` and `:cte`.

  ## Invariants

  1. Callers depend only on `run-assertions!`'s data interface. They never name a
     strategy, a binding, or any SQL.
  2. The combined-SQL builder, strategy planning, and binding are pure
     `data → data/string`; only the execute step does I/O. Strategies are
     therefore unit-testable without a warehouse.
  3. `run-assertions!` selects strategy + binding from an options map (defaults
     `:batched` / `:cte`). Changing a default is a one-line change; overriding
     per-call is supported.
  4. Adding in-band JSON samples, a new binding, or a new strategy must not touch
     `prepare`, `interpret`, or any caller. A change that forces an edit outside
     the relevant seam means the factoring is wrong."
  (:require
   [clojure.string :as str]
   [metabase.query-processor.core :as qp]
   [metabase.transforms.test-run.resolve :as resolve]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Constants
;;; ---------------------------------------------------------------------------

(def ^:private sample-cap
  "Maximum number of sample failing rows fetched per assertion.
  Matches diff/mismatch-cap (= 50) so the caps cannot drift."
  50)

;;; ---------------------------------------------------------------------------
;;; Pure SQL helpers
;;; ---------------------------------------------------------------------------

(defn- sql-quote-literal
  "Escape a SQL string literal (single-quote delimiter, escape by doubling).
  Returns the literal wrapped in single quotes."
  ^String [^String s]
  (str "'" (str/replace s "'" "''") "'"))

(defn- strip-trailing-semicolon
  "Remove a trailing semicolon and surrounding whitespace from `sql`.
  Embedding `; foo` inside a subquery produces a syntax error; user-supplied
  SQL often has a trailing semicolon."
  ^String [^String sql]
  (str/trimr (str/replace sql #";\s*$" "")))

;;; ---------------------------------------------------------------------------
;;; OutputBinding — seam 1
;;; ---------------------------------------------------------------------------

(defn build-output-binding
  "Return the OutputBinding for `test_output` for this target type (seam 1).

  `target-kind` — `:transform` or `:card`.
  For `:transform`: `opts` must contain `:scratch-spec` ({:schema :table :db}).
  For `:card`: `opts` must contain one of:
    - `:card-sql` (string) — compiled + scratch-remapped card SQL (CTE default).
    - `:scratch-spec` ({:schema :table :db}) — materialize escape binding.

  Default is always `:cte`. Returns `{:kind :cte :sql \"...\"}` or
  `{:kind :table :spec <scratch-spec>}`."
  [target-kind opts]
  (case target-kind
    :transform
    (let [spec   (:scratch-spec opts)
          schema (:schema spec)
          table  (:table spec)]
      {:kind :cte
       :sql  (str "SELECT * FROM "
                  (if schema
                    (str "\"" schema "\".\"" table "\"")
                    (str "\"" table "\"")))})

    :card
    (cond
      (:card-sql opts)
      {:kind :cte
       :sql  (:card-sql opts)}

      (:scratch-spec opts)
      {:kind  :table
       :spec  (:scratch-spec opts)}

      :else
      (throw (ex-info "build-output-binding for :card requires :card-sql or :scratch-spec"
                      {:target-kind target-kind :opts opts})))))

;;; ---------------------------------------------------------------------------
;;; Pure SQL builder (data → string, warehouse-free)
;;; ---------------------------------------------------------------------------

(defn build-combined-assertion-sql
  "Build the batched combined assertion statement (pure, no I/O).

  For a `:cte` binding, wraps output with `WITH test_output AS (<sql>)` and
  emits one `SELECT '<name>' AS __assertion, COUNT(*) AS __failing FROM (<sql>) __a`
  per runnable assertion, joined with `UNION ALL`.

  For a `:table` binding, `test_output` is already a scratch table in the
  mapping, so no `WITH` clause is needed — the rewrite already resolved
  `test_output` references.

  `binding`  — `{:kind :cte :sql \"...\"}` or `{:kind :table}`.
  `runnable` — seq of PreparedAssertions (no `:error` key).

  Returns a SQL string."
  [binding runnable]
  (let [union-parts (mapv (fn [{:keys [name rewritten-sql]}]
                            (let [clean (strip-trailing-semicolon rewritten-sql)]
                              (str "SELECT " (sql-quote-literal name)
                                   " AS __assertion, COUNT(*) AS __failing"
                                   " FROM (" clean ") __a")))
                          runnable)
        union-sql   (str/join "\nUNION ALL\n" union-parts)]
    (case (:kind binding)
      :cte
      (str "WITH test_output AS (" (:sql binding) ")\n" union-sql)

      :table
      union-sql)))

;;; ---------------------------------------------------------------------------
;;; Stage 1 — prepare (shared, fault-isolation here)
;;; ---------------------------------------------------------------------------

(defn- prepare-one
  "Prepare a single assertion: rewrite its SQL and run verify. Returns a
  PreparedAssertion map:
  - On success: `{:name :severity :rewritten-sql}`.
  - On rewrite/verify failure: `{:name :severity :error <message>}` — terminal,
    excluded from the combined statement but attributed in the result.

  Fault isolation lives here: a malformed assertion is captured and named before
  any execution begins, so the batch can never lose attribution for a bad entry."
  [drv backend mapping {:keys [name sql severity]}]
  (try
    (let [rewritten (resolve/rewrite-native-sql drv sql mapping backend)]
      ;; verify: no real-table refs survive. test_output is whitelisted — it is
      ;; bound by the combined-assertion CTE wrapper, not a real warehouse table.
      (resolve/verify drv mapping rewritten #{"test_output"})
      {:name          name
       :severity      (or severity :error)
       :rewritten-sql rewritten})
    (catch clojure.lang.ExceptionInfo e
      {:name     name
       :severity (or severity :error)
       :error    (ex-message e)})
    (catch Throwable e
      {:name     name
       :severity (or severity :error)
       :error    (str "Unexpected error preparing assertion: " (ex-message e))})))

(defn- prepare
  "Stage 1 (shared): rewrite + verify every assertion SQL. Returns a vector of
  PreparedAssertion maps, one per input assertion, preserving order.

  Each assertion is independently fault-isolated: a rewrite/verify failure
  becomes a terminal `:error` entry for that assertion, not a run-level throw."
  [drv backend mapping assertions]
  (mapv #(prepare-one drv backend mapping %) assertions))

;;; ---------------------------------------------------------------------------
;;; Execution helpers
;;; ---------------------------------------------------------------------------

(defn- execute-counts!
  "Execute the combined assertion SQL and return a map of assertion-name →
  failing-row-count. Makes one QP round-trip.

  Returns `{<name-str> <count-long> ...}`."
  [db-id sql]
  (log/debug "Executing combined assertion statement" {:db-id db-id})
  (let [result (qp/process-query {:database db-id
                                  :type     :native
                                  :native   {:query sql}})]
    (when (not= :completed (:status result))
      (throw (ex-info
              (str "Combined assertion query failed: QP returned " (pr-str (:status result)))
              {:error-type ::assertion-execution-failed
               :qp-status  (:status result)})))
    ;; Result rows: [assertion-name failing-count]
    (into {}
          (map (fn [[assertion-name failing-count]]
                 [assertion-name (long (or failing-count 0))]))
          (get-in result [:data :rows]))))

(defn- build-sample-sql
  "Build the SQL that fetches a capped sample of failing rows for one assertion."
  [binding clean-sql]
  (str (case (:kind binding)
         :cte  (str "WITH test_output AS (" (:sql binding) ")\n")
         :table "")
       "SELECT * FROM (" clean-sql ") __sample LIMIT " sample-cap))

(defn- fetch-sample!
  "Fetch a capped sample of failing rows for a single assertion.
  Returns `{:rows [[...] ...] :columns [<string> ...]}` or nil on QP error."
  [db-id binding {:keys [rewritten-sql]}]
  (try
    (let [clean-sql  (strip-trailing-semicolon rewritten-sql)
          sample-sql (build-sample-sql binding clean-sql)
          result     (qp/process-query {:database db-id
                                        :type     :native
                                        :native   {:query sample-sql}})]
      (when (= :completed (:status result))
        {:rows    (get-in result [:data :rows])
         :columns (mapv :name (get-in result [:data :cols]))}))
    (catch Throwable e
      (log/warn e "Failed to fetch failing-row sample for assertion")
      nil)))

(defn- build-count-sql
  "Build the SQL that counts failing rows for one assertion (used by
  `:per-assertion` strategy)."
  [binding clean-sql]
  (str (case (:kind binding)
         :cte  (str "WITH test_output AS (" (:sql binding) ")\n")
         :table "")
       "SELECT COUNT(*) FROM (" clean-sql ") __a"))

(defn- run-one-assertion!
  "Run a single prepared assertion. Returns a raw result map
  `{:name :failing-count :sample?}`. Captures QP errors as an `:error` entry."
  [db-id binding {:keys [name rewritten-sql] :as pa}]
  (try
    (let [clean-sql  (strip-trailing-semicolon rewritten-sql)
          count-sql  (build-count-sql binding clean-sql)
          result     (qp/process-query {:database db-id
                                        :type     :native
                                        :native   {:query count-sql}})]
      (if (= :completed (:status result))
        (let [fail-count (long (or (ffirst (get-in result [:data :rows])) 0))]
          {:name name
           :failing-count fail-count
           :sample (when (pos? fail-count) (fetch-sample! db-id binding pa))})
        {:name name :failing-count 0 :error (str "QP returned " (pr-str (:status result)))}))
    (catch Throwable e
      {:name name :failing-count 0 :error (ex-message e)})))

(defn- failing-assertions
  "Return the subset of `runnable` PreparedAssertions with a positive count in
  `counts-map`."
  [runnable counts-map]
  (filter #(pos? (get counts-map (:name %) 0)) runnable))

(defn- raw-results-from-counts
  "Combine counts + samples into a seq of raw result maps for `interpret`."
  [runnable counts-map samples-map]
  (mapv (fn [{:keys [name]}]
          (let [cnt (get counts-map name 0)]
            {:name          name
             :failing-count cnt
             :sample        (when (pos? cnt) (get samples-map name))}))
        runnable))

;;; ---------------------------------------------------------------------------
;;; Seam 2 — ExecutionStrategy multimethod
;;; ---------------------------------------------------------------------------

(defmulti ^:private run-strategy
  "Execute prepared runnable assertions and return a seq of raw result maps
  `{:name :failing-count :sample?}`.

  Dispatch on the strategy keyword (:batched or :per-assertion).
  Error entries from `prepare` are NOT passed — `interpret` handles them."
  (fn [strategy & _] strategy))

(defmethod run-strategy :batched
  [_ db-id _drv _mapping binding prepared opts]
  (let [runnable (remove :error prepared)]
    (if (empty? runnable)
      []
      (let [sql (build-combined-assertion-sql binding runnable)]
        (try
          (let [counts-map  (execute-counts! db-id sql)
                failing     (failing-assertions runnable counts-map)
                samples-map (when (and (:samples? opts true) (seq failing))
                              (into {}
                                    (map (fn [pa] [(:name pa) (fetch-sample! db-id binding pa)]))
                                    failing))]
            (raw-results-from-counts runnable counts-map (or samples-map {})))
          (catch Throwable e
            ;; Batched query failed — fall back to attribute the culprit.
            (log/warn e "Batched assertion query failed; falling back to :per-assertion strategy")
            (run-strategy :per-assertion db-id _drv _mapping binding prepared opts)))))))

(defmethod run-strategy :per-assertion
  [_ db-id _drv _mapping binding prepared _opts]
  (let [runnable (remove :error prepared)]
    (mapv #(run-one-assertion! db-id binding %) runnable)))

;;; ---------------------------------------------------------------------------
;;; Stage 4 — interpret (shared)
;;; ---------------------------------------------------------------------------

(defn- interpret-one
  "Convert one PreparedAssertion + raw result → an assertion-result map.

  PreparedAssertions with `:error` (rewrite/verify failures) →
  `{:status :failed :error_message <str>}`.

  For executed assertions:
  - count = 0  → `:passed` regardless of severity.
  - count > 0, severity `:warn` → `:warn` (does not fail the overall run).
  - count > 0, severity `:error` (default) → `:failed`."
  [pa raw-result]
  (cond
    ;; Terminal: rewrite/verify failed in prepare stage.
    (:error pa)
    {:name              (:name pa)
     :status            :failed
     :failing_row_count 0
     :sample_rows       nil
     :columns           []
     :error_message     (:error pa)}

    ;; Executed assertion.
    :else
    (let [{:keys [name failing-count sample error]} raw-result
          severity (:severity pa)
          status   (cond
                     (some? error)          :failed
                     (zero? failing-count)  :passed
                     (= :warn severity)     :warn
                     :else                  :failed)]
      {:name              (or name (:name pa))
       :status            status
       :failing_row_count (long (or failing-count 0))
       :sample_rows       (when (and sample (not= :passed status))
                            (:rows sample))
       :columns           (if (and sample (not= :passed status))
                            (or (:columns sample) [])
                            [])
       :error_message     error})))

(defn- interpret
  "Stage 4 (shared): PreparedAssertions + raw strategy results → assertion-result maps.

  `prepared`    — vector of all PreparedAssertions from `prepare` (includes `:error` entries).
  `raw-results` — vector of raw result maps from `run-strategy` (runnable-only, same order
                  as `(remove :error prepared)`).

  Returns a vector of assertion-result maps in input-assertion order."
  [prepared raw-results]
  (let [;; Index raw results by name for lookup (runnable only, in order).
        runnable-results (zipmap (map :name (remove :error prepared))
                                 raw-results)]
    (mapv (fn [pa]
            (if (:error pa)
              (interpret-one pa nil)
              (interpret-one pa (get runnable-results (:name pa)))))
          prepared)))

;;; ---------------------------------------------------------------------------
;;; Materialize-card-result! — :table escape binding (off the default path)
;;; ---------------------------------------------------------------------------

(defn materialize-card-result!
  "Escape binding: write a card QP result into a fresh scratch table and return
  its `{:schema :table :db}` spec. The caller adds it to the cleanup set.

  Off the default path. The default for card targets is `build-output-binding`
  with `:card-sql` (CTE). Use this only when a compute-heavy card makes the
  inline-CTE plan re-evaluate the card per reference."
  [_db-id _db _drv _qp-result _schema _nonce]
  (throw (ex-info "materialize-card-result! is not yet implemented (escape path only)"
                  {:error-type ::materialize-not-implemented})))

;;; ---------------------------------------------------------------------------
;;; Overall-status helper
;;; ---------------------------------------------------------------------------

(defn overall-status
  "Compute the overall run status combining the expected-CSV diff status and
  assertion results.

  `:passed` iff `diff-status` is nil or `:passed` AND no assertion has
  `:status :failed`. A `:warn`-status assertion never flips top-level to `:failed`."
  [diff-status assertion-results]
  (if (or (= :failed diff-status)
          (some #(= :failed (:status %)) assertion-results))
    :failed
    :passed))

;;; ---------------------------------------------------------------------------
;;; Public entry point — run-assertions!
;;; ---------------------------------------------------------------------------

(defn run-assertions!
  "Evaluate assertions against the current scratch state.

  Arguments:
  - `db-id`          — integer database id.
  - `drv`            — driver keyword.
  - `backend`        — parser backend keyword (from `sql-tools/parser-backend`).
  - `mapping`        — fully-populated `{real-spec → scratch-spec}` (leaves + node
                       outputs), as returned by `scratch/seed!` + `run-slice-inner!`.
  - `output-binding` — `{:kind :cte :sql \"...\"}` | `{:kind :table :spec <spec>}`.
                       Build with [[build-output-binding]].
  - `assertions`     — seq of `{:name <str> :sql <str> :severity :error|:warn}`.
  - `opts`           — optional map:
    - `:strategy`  — `:batched` (default) or `:per-assertion`.
    - `:samples?`  — `true` (default) fetches failing-row samples lazily.

  Returns a vector of assertion-result maps (one per assertion):
  `[{:name :status :failing_row_count :sample_rows :columns} ...]`

  Never throws — per-assertion failures are captured as result entries.
  All-pass executes ONE combined SQL statement (one warehouse round-trip)."
  ([db-id drv backend mapping output-binding assertions]
   (run-assertions! db-id drv backend mapping output-binding assertions {}))
  ([db-id drv backend mapping output-binding assertions opts]
   (when (seq assertions)
     (let [strategy (get opts :strategy :batched)
           prepared (prepare drv backend mapping assertions)
           raw      (run-strategy strategy db-id drv mapping output-binding prepared opts)]
       (interpret prepared raw)))))
