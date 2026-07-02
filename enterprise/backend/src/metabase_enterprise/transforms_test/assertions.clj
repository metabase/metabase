(ns metabase-enterprise.transforms-test.assertions
  "Evaluate assertions for a transform test run.

  An assertion is a SQL query that passes iff it returns zero rows. Its SQL
  may read the run's input tables and `test_output` (the target's output);
  both are rewritten to the run's scratch tables before it executes.

  Entry point: [[run-assertions!]]."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms-test.diff :as diff]
   [metabase-enterprise.transforms-test.errors :as errors]
   [metabase-enterprise.transforms-test.resolve :as resolve]
   [metabase.driver.sql.util :as sql.u]
   [metabase.query-processor.core :as qp]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Constants
;;; ---------------------------------------------------------------------------

(def ^:private sample-cap
  "Maximum failing rows sampled per assertion."
  diff/mismatch-cap)

;;; ---------------------------------------------------------------------------
;;; SQL helpers
;;; ---------------------------------------------------------------------------

(defn- strip-trailing-semicolon
  "Remove a trailing semicolon and surrounding whitespace from `sql`.
  Embedding `; foo` inside a subquery produces a syntax error; user-supplied
  SQL often has a trailing semicolon."
  ^String [^String sql]
  (str/trimr (str/replace sql #";\s*$" "")))

;;; ---------------------------------------------------------------------------
;;; Output binding
;;; ---------------------------------------------------------------------------

(defn build-output-binding
  "Return the `test_output` binding for `target-kind` (`:transform` or `:card`).

  `:transform` → `opts` has `:scratch-spec` `{:schema :table :db}`.
  `:card`      → `opts` has `:card-sql` (a SQL string) or `:scratch-spec`.

  Returns `{:kind :cte :sql ...}` or `{:kind :table :spec ...}`."
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
;;; Combined-SQL builder
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
                              (str "SELECT " (sql.u/quote-literal name)
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
;;; Prepare
;;; ---------------------------------------------------------------------------

(defn- prepare-one
  "Rewrite and verify one assertion's SQL. Returns
  `{:name :severity :rewritten-sql}`, or `{:name :severity :error <message>}`
  when rewrite/verify fails (excluded from execution, still reported)."
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
  "Rewrite and verify every assertion via [[prepare-one]], preserving order.
  A failure in one becomes that entry's `:error`; never throws."
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
              {:error-type ::errors/assertion-execution-failed
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
;;; Execution strategy
;;; ---------------------------------------------------------------------------

(defmulti ^:private run-strategy
  "Run the prepared (non-error) assertions; return raw result maps
  `{:name :failing-count :sample}`. Dispatches on strategy
  (`:batched` or `:per-assertion`)."
  {:arglists '([strategy db-id drv mapping binding prepared opts])}
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
;;; Interpret
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
  "PreparedAssertions + raw strategy results → assertion-result maps.

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
;;; Materialize card result (escape path)
;;; ---------------------------------------------------------------------------

(defn materialize-card-result!
  "Write a card's query result into a fresh scratch table; return its
  `{:schema :table :db}` spec for the caller to clean up. Not yet implemented."
  [_db-id _db _drv _qp-result _schema _nonce]
  (throw (ex-info "materialize-card-result! is not yet implemented (escape path only)"
                  {:error-type ::errors/materialize-not-implemented})))

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

  - `db-id`          — database id.
  - `drv`            — driver keyword.
  - `backend`        — parser backend keyword.
  - `mapping`        — the `{real-spec → scratch-spec}` map (leaves + node outputs).
  - `output-binding` — from [[build-output-binding]].
  - `assertions`     — seq of `{:name <str> :sql <str> :severity :error|:warn}`.
  - `opts`           — optional: `:strategy` `:batched` (default) or `:per-assertion`;
                       `:samples?` fetch failing-row samples (default true).

  Returns one result map per assertion:
  `[{:name :status :failing_row_count :sample_rows :columns} ...]`

  Never throws; per-assertion failures are captured as result entries. All-pass
  runs as one combined query."
  ([db-id drv backend mapping output-binding assertions]
   (run-assertions! db-id drv backend mapping output-binding assertions {}))
  ([db-id drv backend mapping output-binding assertions opts]
   (when (seq assertions)
     (let [strategy (get opts :strategy :batched)
           prepared (prepare drv backend mapping assertions)
           raw      (run-strategy strategy db-id drv mapping output-binding prepared opts)]
       (interpret prepared raw)))))
