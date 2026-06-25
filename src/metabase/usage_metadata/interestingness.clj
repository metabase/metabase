(ns metabase.usage-metadata.interestingness
  "Refresh persisted dimension-interestingness scores using accumulated breakout usage.

   `metabase_field.dimension_interestingness` is otherwise computed only when a field is
   re-fingerprinted during sync analyze, so in steady state it is effectively frozen. This
   step runs after the daily usage-metadata batch, injecting each field's real-world breakout
   usage into the scorer so the usage signal stays current independent of the sync cadence."
  (:require
   [metabase.interestingness.core :as interestingness]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn breakout-counts-by-field :- [:map-of :int :int]
  "Total breakout executions per field across all sources, summed from `source_dimension_daily`
   rollups (direct + projected ownership), instance-wide. Returns `{field-id total-count}` for every
   field with usage."
  []
  (into {}
        ;; SUM of an int column comes back as a Long on H2/Postgres but a BigDecimal on
        ;; MySQL/MariaDB — coerce to long so the `:int` return schema holds across app DBs.
        (map (juxt :field_id (comp long :total_count)))
        (t2/select [:model/SourceDimensionDaily :field_id [[:sum :count] :total_count]]
                   {:where    [:and
                               [:in :ownership_mode ["direct" "projected"]]
                               [:not= :field_id nil]]
                    :group-by [:field_id]})))

(defn- percentile
  "Nearest-rank percentile `p` (0..1) of a collection of numbers. Returns nil for an empty coll.
   Computed in-process for app-DB portability — `PERCENTILE_CONT` isn't supported uniformly
   across H2/Postgres/MySQL, and the set of distinct breakout fields is small enough to sort."
  [p coll]
  (when-let [sorted (seq (sort coll))]
    (let [v   (vec sorted)
          k   (count v)
          idx (-> (Math/ceil (* p k)) long (max 1) (min k) dec)]
      (nth v idx))))

(defn- baseline-of
  "The scaling baseline for a `{field-id count}` map: the 95th-percentile of the counts as a
   long, or 0 when there's no usage. p95 (rather than the raw max) keeps one runaway dashboard
   from compressing every other dimension's score."
  [counts]
  (long (or (percentile 0.95 (vals counts)) 0)))

(defn- compute-breakout-usage
  "Run the instance-wide breakout-usage scan: `{:counts {field-id total} :baseline <p95>}`."
  []
  (let [counts (breakout-counts-by-field)]
    {:counts counts, :baseline (baseline-of counts)}))

(def ^:dynamic *breakout-usage*
  "Sync-scoped cache of [[compute-breakout-usage]] so the instance-wide aggregate and its
   p95 are computed once per sync instead of once per table.
   nil means there's no active sync scope, so [[breakout-usage]] scans on demand."
  nil)

(mu/defn breakout-usage :- [:map [:counts [:map-of :int :int]] [:baseline :int]]
  "Instance-wide breakout usage as `{:counts {field-id total} :baseline <p95>}`. `:baseline` is the
   value the usage interestingness signal is scored against (0 when there's no usage yet). Reuses the
   sync-scoped [[*breakout-usage*]] cache when bound, otherwise runs the scan now.

   The scan ([[breakout-counts-by-field]]) is a full-instance aggregate, so callers that touch many
   tables (sync) must run under [[with-breakout-usage]] to avoid an O(tables) read."
  []
  (if-let [cached *breakout-usage*]
    @cached
    (compute-breakout-usage)))

(defn do-with-breakout-usage
  "Functional impl of [[with-breakout-usage]]."
  [thunk]
  (if *breakout-usage*
    (thunk)                                            ; reuse an enclosing scope — nesting is safe
    (binding [*breakout-usage* (delay (compute-breakout-usage))]
      (thunk))))

(defmacro with-breakout-usage
  "Run `body` with a sync-scoped breakout-usage cache so per-table scoring shares a single
   instance-wide scan instead of re-running it per table. The scan is lazy (nothing runs until the
   first [[breakout-usage]] call) and nesting reuses the outer cache."
  [& body]
  `(do-with-breakout-usage (^:once fn* [] ~@body)))

(def ^:dynamic *update-partition-size*
  "Max number of fields persisted per `t2/update!` call when rescoring. Dynamic for testing."
  1000)

(defn- persist-scores!
  "Persist a `{field-id score}` map of new `dimension_interestingness` scores in chunked,
   CASE-based bulk updates — one `t2/update!` per partition rather than one per field. Within a
   chunk, field ids are grouped by score so the CASE emits one branch per distinct score value."
  [score-by-id]
  (doseq [chunk (partition-all *update-partition-size* score-by-id)]
    (let [ids-by-score (u/group-by second first chunk)
          case-expr    (into [:case]
                             (mapcat (fn [[score ids]] [[:in :id ids] score]))
                             ids-by-score)]
      (t2/update! :model/Field {:id [:in (map key chunk)]}
                  {:dimension_interestingness case-expr}))))

(mu/defn rescore-dimension-interestingness! :- :int
  "Recompute and persist `metabase_field.dimension_interestingness` for every field that currently
   has breakout usage (boosting it via `[:usage :breakout-count]`), plus every field in
   `pruned-field-ids` whose usage just dropped to zero — those get a breakout-count of 0, resetting
   them to their usage-less score. Without `pruned-field-ids`, only currently-used fields are
   touched. Returns the number of fields rescored.

   `pruned-field-ids` are dimension fields whose rollup rows were just pruned by the retention
   sweep (see `delete-expired-rollups!`); those with no surviving usage are the \"falling edge\" and
   must be reset, otherwise a stale boost would freeze until the next sync re-fingerprint."
  ([] (rescore-dimension-interestingness! nil))
  ([pruned-field-ids :- [:maybe [:set :int]]]
   (let [{:keys [counts baseline]} (breakout-usage)
         field-ids                 (into (set (keys counts)) pruned-field-ids)]
     (when (seq field-ids)
       (let [score-by-id (into {}
                               (map (fn [field]
                                      (let [n (get counts (:id field) 0)]
                                        [(:id field)
                                         (interestingness/dimension-interestingness
                                          (assoc field :usage {:breakout-count          n
                                                               :baseline-breakout-count baseline}))])))
                               (t2/reducible-select [:model/Field :id :fingerprint :semantic_type :base_type]
                                                    :id [:in field-ids]))]
         (persist-scores! score-by-id)))
     (count field-ids))))
