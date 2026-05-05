(ns dev.metadata-import-perf
  "Perf-fixture generator + runner for the metadata-file-import pipeline.

  ONE-OFF perf-smoke-test harness — not for CI. Generates four synthetic
  JSON fixture files matching scenario specs, loads each through
  `metabase-enterprise.serialization.metadata-file-import/import-metadata-file!`,
  captures timing + heap, prints a comparison table.

  Public API:

    (generate-perf-fixture! scenario-spec)
    ;; → {:db-id <int> :file-path <string>
    ;;    :stats {:tables N :fields N :conv-a N :conv-b N :flat N :fks N}}

    (cleanup-perf-fixture! db-id)
    ;; → :ok

    (run-all-scenarios!)
    ;; → drives all four scenarios sequentially, prints results

  See METADATA_FILE_IMPORT_PLAN.md §16 for the wire format. Three field shapes:
    - Convention A — has :parent_id (a portable field id vector), no :nfc_path.
    - Convention B — has :nfc_path (a vector of strings), no :parent_id.
    - Flat root    — neither.

  Top-level shape: {:databases [...] :tables [...] :fields [...]}.
  See `metabase-enterprise.serialization.metadata-file-import.schemas` for the exact
  Malli schemas. The generator MUST validate every line against those schemas
  before writing — catches bugs early."
  (:require
   [cheshire.core :as cheshire]
   [clojure.string :as str]
   [metabase-enterprise.serialization.metadata-file-import :as mfi]
   [metabase-enterprise.serialization.metadata-file-import.processors :as processors]
   [metabase-enterprise.serialization.metadata-file-import.schemas :as schemas]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (java.io BufferedWriter File FileOutputStream OutputStreamWriter)
   (java.nio.charset StandardCharsets)
   (java.util Random)))

(set! *warn-on-reflection* true)

;;; ============================== Scenario specs ==============================

(def scenarios
  [{:name "1-happy-path"     :conv-a-pct 0.05 :max-depth 1 :conv-b-pct 0.05 :wire-order :parents-first}
   {:name "2-moderately-bad" :conv-a-pct 0.10 :max-depth 2 :conv-b-pct 0.05 :wire-order :random}
   {:name "3-worst-case"     :conv-a-pct 0.25 :max-depth 3 :conv-b-pct 0.05 :wire-order :deepest-first}
   {:name "4-width-control"  :conv-a-pct 0.25 :max-depth 1 :conv-b-pct 0.05 :wire-order :parents-first}])

(def table-buckets
  "Per-table field-count distribution. Sum: 1000 tables, ~1,000,025 fields."
  [{:tables 5    :fields-per-table 100000}    ; INSANE EAV / analytics-events tables
   {:tables 50   :fields-per-table 5000}      ; wide fact tables
   {:tables 200  :fields-per-table 1000}      ; typical fact/dim tables
   {:tables 745  :fields-per-table 67}])      ; normal narrow tables

(def ^:private schema-name "public")
(def ^:private fk-rate 0.05)
(def ^:private conv-a-branch-factor 5)

;;; ============================== Helpers ==============================

(defn- db-name [scenario-name]
  (str "mfi-perf-" scenario-name))

(defn- nested-name
  "Convention-A nested field name (just the leaf token)."
  [tree-idx depth-idx node-idx]
  (str "n" tree-idx "_d" depth-idx "_" node-idx))

(defn- conv-b-display-name
  "Convention-B display name uses the full path joined with ' → ' (the storage
  synthesis convention from `field-types->fields`)."
  [path]
  (str/join " → " path))

(defn- validate!
  "Validate `row` against `schema-ref`. Throws ex-info on failure with the row
  attached for triage."
  [schema-ref row]
  (when-not (mr/validate schema-ref row)
    (throw (ex-info (format "perf-fixture validate failed: %s" (name schema-ref))
                    {:kind :perf-fixture-invalid
                     :schema schema-ref
                     :explain (mr/explain schema-ref row)
                     :row row}))))

;;; ============================== Per-table field generator ==============================

(defn- portable-field-id
  "Build the portable id vector for a field. `path` is the full nfc-path-plus-name
  sequence: nfc-path followed by the field's own name."
  [db-name* table-name path]
  (into [db-name* schema-name table-name] path))

(defn- conv-a-tree-rows
  "Produce a sequence of {:depth d :path p :is-root? boolean} maps representing
  one Convention-A tree of depth `max-depth` with branching factor
  `conv-a-branch-factor`. Root is at depth 0; a non-root is Convention A.
  Returns the rows sorted by depth ascending."
  [tree-idx max-depth]
  (let [root {:depth 0 :path [(nested-name tree-idx 0 0)] :is-root? true}]
    (loop [acc [root]
           prev-level [root]
           depth 1]
      (if (> depth max-depth)
        acc
        (let [next-level (vec
                          (for [parent prev-level
                                k (range conv-a-branch-factor)
                                :let [nname (nested-name tree-idx depth k)]]
                            {:depth depth
                             :path (conj (:path parent) nname)
                             :is-root? false}))]
          (recur (into acc next-level) next-level (inc depth)))))))

(defn- count-conv-a-non-root-nodes
  "Total non-root nodes in one tree of depth `max-depth` with branching factor
  `conv-a-branch-factor`."
  [max-depth]
  (reduce + (for [d (range 1 (inc max-depth))]
              (long (Math/pow conv-a-branch-factor d)))))

(defn- gen-table-fields
  "Generate field rows for a single table.

  Returns a vector of maps each with:
    :wire-row  — the JSON-wire row map (validated)
    :portable  — portable field id vector (for FK target picking later)
    :depth     — for wire-ordering (0 for flat / Conv-B)

  The `:wire-row` is the cheshire-encodable map. `:portable` is what
  `format-field-id` would produce for that row in a real export — used as the
  FK target id when another field points at this one."
  [{:keys [db-name* table-name n-fields conv-a-pct conv-b-pct max-depth ^Random rng]}]
  (let [conv-a-target (long (Math/round (double (* n-fields conv-a-pct))))
        conv-b-count  (long (Math/round (double (* n-fields conv-b-pct))))
        nodes-per-tree (count-conv-a-non-root-nodes max-depth)
        n-trees       (if (zero? nodes-per-tree)
                        0
                        (max 0 (long (Math/round (double (/ conv-a-target nodes-per-tree))))))
        ;; Conv-A tree roots count as flat-root rows (depth 0 in the tree but
        ;; emitted on the wire as flat fields with neither :parent_id nor :nfc_path).
        tree-rows     (vec (mapcat #(conv-a-tree-rows % max-depth) (range n-trees)))
        actual-conv-a (count (filter #(not (:is-root? %)) tree-rows))
        n-tree-roots  (count (filter :is-root? tree-rows))
        ;; flat-count budget already includes the conv-A tree roots
        flat-budget   (- n-fields actual-conv-a conv-b-count)
        extra-flat    (max 0 (- flat-budget n-tree-roots))
        table-id      [db-name* schema-name table-name]

        ;; ----- Convention A rows (tree roots emitted as flat; non-roots as Conv-A) -----
        conv-a-rows
        (mapv (fn [{:keys [depth path is-root?]}]
                (let [field-name (last path)
                      portable   (portable-field-id db-name* table-name path)
                      nfc-path   (vec (butlast path))
                      base       {:table_id table-id
                                  :name field-name
                                  :base_type (if is-root? "type/Structured" "type/Text")
                                  :database_type (if is-root? "json" "text")}
                      wire-row   (if is-root?
                                   ;; root: flat field, no parent_id, no nfc_path
                                   base
                                   ;; nested: Convention A — :parent_id only
                                   (assoc base :parent_id (into [db-name* schema-name table-name] nfc-path)))]
                  {:wire-row wire-row :portable portable :depth depth}))
              tree-rows)

        ;; ----- Convention B leaves -----
        conv-b-rows
        (vec
         (for [i (range conv-b-count)
               :let [path-len (+ 2 (.nextInt rng 3)) ; length 2-4
                     ;; synthesize a path that's stable per (table, i)
                     path (vec (for [k (range path-len)]
                                 (str "b" i "_" k)))
                     display (conv-b-display-name (cons (str "col_" i) path))
                     portable (portable-field-id db-name* table-name (conj path display))
                     wire-row {:table_id table-id
                               :name display
                               :base_type "type/Text"
                               :database_type "text"
                               :nfc_path path}]]
           {:wire-row wire-row :portable portable :depth 0}))

        ;; ----- Flat-root rows (vary base_type a little for realism) -----
        flat-rows
        (vec
         (for [i (range extra-flat)
               :let [field-name (str "col_" i)
                     bt (case (mod i 4)
                          0 ["type/Integer" "integer"]
                          1 ["type/Text"    "text"]
                          2 ["type/Float"   "double precision"]
                          3 ["type/Boolean" "boolean"])
                     portable (portable-field-id db-name* table-name [field-name])
                     wire-row {:table_id table-id
                               :name field-name
                               :base_type (first bt)
                               :database_type (second bt)}]]
           {:wire-row wire-row :portable portable :depth 0}))]
    (into [] (concat conv-a-rows conv-b-rows flat-rows))))

;;; ============================== Whole-fixture generation ==============================

(defn- enumerate-tables
  "Flatten `table-buckets` into a vector of {:table-name :n-fields} entries
  totalling 1000 tables."
  []
  (let [pairs (mapcat (fn [{:keys [tables fields-per-table]}]
                        (repeat tables fields-per-table))
                      table-buckets)]
    (vec
     (map-indexed (fn [i fpt]
                    {:table-name (str "tbl_" (format "%04d" i))
                     :n-fields fpt})
                  pairs))))

(defn- order-fields
  "Reorder `fields` (each {:wire-row :portable :depth}) according to `wire-order`.
  Convention-B and flat rows have :depth 0 (they sprinkle naturally). Random
  uses the supplied Random for determinism."
  [fields wire-order ^Random rng]
  (case wire-order
    :parents-first  (vec (sort-by :depth fields))
    :deepest-first  (vec (sort-by (comp - :depth) fields))
    :random         (let [n (count fields)
                          arr (object-array fields)]
                      (dotimes [i (dec n)]
                        (let [j (+ i (.nextInt rng (- n i)))
                              tmp (aget arr i)]
                          (aset arr i (aget arr j))
                          (aset arr j tmp)))
                      (vec arr))))

(defn- pick-fk-targets!
  "Mutates the supplied vec of field rows by stamping `:fk_target_field_id` on
  ~`fk-rate` of them, pointing at a randomly-picked field in a *different*
  table. Returns [updated-fields fk-count]."
  [fields ^Random rng]
  (let [n (count fields)
        targets (mapv (juxt #(get-in % [:wire-row :table_id]) :portable) fields)
        ;; index → fk-target index map
        chosen (loop [acc {} attempts 0]
                 (if (or (>= (count acc) (long (* n fk-rate)))
                         (>= attempts (* n 3)))
                   acc
                   (let [src (.nextInt rng n)
                         tgt (.nextInt rng n)
                         [src-tbl _]   (nth targets src)
                         [tgt-tbl tgt-portable] (nth targets tgt)]
                     (if (and (not= src-tbl tgt-tbl)
                              (not (contains? acc src)))
                       (recur (assoc acc src tgt-portable) (inc attempts))
                       (recur acc (inc attempts))))))
        updated (mapv (fn [i row]
                        (if-let [tgt (get chosen i)]
                          (update row :wire-row assoc :fk_target_field_id tgt)
                          row))
                      (range n) fields)]
    [updated (count chosen)]))

(defn- pick-fk-assignments
  "Variant of `pick-fk-targets!` for the streaming generator. Takes a vec of
  `[table-id portable-id]` tuples (one per field) and returns a map
  `{src-global-idx → target-portable-id}` covering ~`fk-rate` of fields. The
  caller looks up by global field index during pass 2 of the stream-write to
  decide whether to stamp `:fk_target_field_id` on each emitted row."
  [field-keys ^Random rng]
  (let [n (count field-keys)]
    (loop [acc {} attempts 0]
      (if (or (>= (count acc) (long (* n fk-rate)))
              (>= attempts (* n 3)))
        acc
        (let [src (.nextInt rng n)
              tgt (.nextInt rng n)
              [src-tbl _]            (nth field-keys src)
              [tgt-tbl tgt-portable] (nth field-keys tgt)]
          (if (and (not= src-tbl tgt-tbl)
                   (not (contains? acc src)))
            (recur (assoc acc src tgt-portable) (inc attempts))
            (recur acc (inc attempts))))))))

;;; ============================== JSON streaming write ==============================

(defn- write-array-streaming!
  "Write `(into [] xs)` as a JSON array via cheshire to `writer`, one element
  at a time. Validates each element against `schema-ref` first."
  [^BufferedWriter writer xs schema-ref]
  (.write writer "[")
  (let [first? (volatile! true)]
    (doseq [x xs]
      (validate! schema-ref x)
      (if @first?
        (vreset! first? false)
        (.write writer ","))
      (cheshire/generate-stream x writer)))
  (.write writer "]"))

(defn- write-fixture-file!
  "Generate the JSON fixture and stream it to `out-file`. Two-pass streaming:
  pass 1 collects field portable-ids only (so FK assignments can be picked);
  pass 2 regenerates wire rows per-table and streams them to disk. Per-table
  RNG is seeded by `(hash [scen-name table-name])` so both passes produce
  identical fields without holding all wire-rows in memory at once. Returns
  stats."
  [^File out-file {:keys [name conv-a-pct conv-b-pct max-depth wire-order]}]
  (let [scen-name name
        dbn       (db-name scen-name)
        tables    (enumerate-tables)
        gen-args  (fn [{:keys [table-name n-fields]}]
                    {:db-name* dbn
                     :table-name table-name
                     :n-fields n-fields
                     :conv-a-pct conv-a-pct
                     :conv-b-pct conv-b-pct
                     :max-depth max-depth
                     :rng (Random. (hash [scen-name table-name]))})

        ;; --- Pass 1 + FK pick (scoped so the field-keys vec is GC'd before pass 2) ---
        _ (println (format "  pass 1: generating portable ids for %d tables…" (count tables)))
        chosen
        (let [field-keys
              (vec
               (mapcat (fn [tbl]
                         (mapv (juxt #(get-in % [:wire-row :table_id]) :portable)
                               (gen-table-fields (gen-args tbl))))
                       tables))]
          (println (format "  pass 1 done: %d portable ids collected; picking FK assignments…"
                           (count field-keys)))
          (pick-fk-assignments field-keys (Random. (hash scen-name))))
        fk-count (count chosen)
        _ (println (format "  picked %d FK target assignments." fk-count))

        ;; --- Pass 2: stream wire rows per-table ---
        idx       (volatile! -1)
        n-conv-a  (volatile! 0)
        n-conv-b  (volatile! 0)
        n-flat    (volatile! 0)

        db-rows    [{:name dbn :engine "postgres"}]
        table-rows (mapv (fn [{:keys [table-name]}]
                           {:db_id dbn :schema schema-name :name table-name})
                         tables)]
    (println (format "  pass 2: streaming wire rows…"))
    (with-open [os  (FileOutputStream. out-file)
                osw (OutputStreamWriter. os StandardCharsets/UTF_8)
                bw  (BufferedWriter. osw 65536)]
      (.write bw "{\"databases\":")
      (write-array-streaming! bw db-rows ::schemas/database-info)
      (.write bw ",\"tables\":")
      (write-array-streaming! bw table-rows ::schemas/table-info)
      (.write bw ",\"fields\":[")
      (let [first? (volatile! true)]
        (doseq [tbl tables
                :let [fields  (gen-table-fields (gen-args tbl))
                      ordered (order-fields fields wire-order
                                            (Random. (hash [scen-name (:table-name tbl) "order"])))]
                {:keys [wire-row]} ordered]
          (vswap! idx inc)
          (let [global-idx @idx
                fk-tgt     (get chosen global-idx)
                row        (cond-> wire-row
                             fk-tgt (assoc :fk_target_field_id fk-tgt))]
            (cond
              (:parent_id row) (vswap! n-conv-a inc)
              (:nfc_path row)  (vswap! n-conv-b inc)
              :else            (vswap! n-flat inc))
            (validate! ::schemas/field-info row)
            (if @first? (vreset! first? false) (.write bw ","))
            (cheshire/generate-stream row bw))))
      (.write bw "]}")
      (.flush bw))
    {:tables  (count tables)
     :fields  (inc @idx)
     :conv-a  @n-conv-a
     :conv-b  @n-conv-b
     :flat    @n-flat
     :fks     fk-count}))

;;; ============================== Public: generate / cleanup ==============================

(defn generate-perf-fixture!
  "Generate one perf fixture for `scenario-spec` (a map from `scenarios`).
  Inserts a matching `:model/Database` row and writes the JSON fixture file
  to a temp file. Returns
  `{:db-id <int> :file-path <string> :stats {...}}`."
  [{:keys [name] :as scenario}]
  (let [dbn      (db-name name)
        tmp-file (File/createTempFile (str "mfi-perf-" name "-") ".json")]
    (.deleteOnExit tmp-file)
    (println (format "[generate-perf-fixture!] scenario=%s file=%s"
                     name (.getAbsolutePath tmp-file)))
    (let [stats   (write-fixture-file! tmp-file scenario)
          ;; Insert/replace the matching Database row.
          existing (t2/select-one :model/Database :name dbn :engine :postgres)
          db-id    (or (:id existing)
                       (:id (t2/insert-returning-instance!
                             :model/Database
                             {:name dbn
                              :engine :postgres
                              :details {}
                              :is_full_sync true
                              :is_on_demand false
                              :initial_sync_status "incomplete"})))]
      (println (format "  done. db-id=%d stats=%s size=%dMB"
                       db-id stats (long (/ (.length tmp-file) (* 1024 1024)))))
      {:db-id db-id
       :file-path (.getAbsolutePath tmp-file)
       :stats stats})))

(defn cleanup-perf-fixture!
  "Delete all `metabase_field` rows whose `table_id` is in the database, then
  all `metabase_table` rows for that database, then the `metabase_database`
  row. Returns `:ok`."
  [db-id]
  (let [table-ids (mapv :id (t2/select [:model/Table :id] :db_id db-id))]
    (when (seq table-ids)
      (t2/delete! :model/Field :table_id [:in table-ids])
      (t2/delete! :model/Table :id [:in table-ids]))
    (t2/delete! :model/Database :id db-id))
  :ok)

;;; ============================== Heap sampling ==============================

(defn- with-heap-sampling
  "Run `f` with a background thread polling heap usage every 50ms. Returns
  `{:result (f) :peak-heap-bytes <long>}`."
  [f]
  (let [r        (Runtime/getRuntime)
        peak     (atom 0)
        running  (atom true)
        sampler  (Thread.
                  ^Runnable
                  (fn []
                    (while @running
                      (let [used (- (.totalMemory r) (.freeMemory r))]
                        (swap! peak max used))
                      (Thread/sleep 50))))]
    (.start sampler)
    (try
      (let [result (f)]
        {:result result :peak-heap-bytes @peak})
      (finally
        (reset! running false)
        (.join sampler 1000)))))

;;; ============================== Per-phase timing ==============================

(defn- now-ms ^long [] (System/currentTimeMillis))

(defn- with-instrumented-phases
  "Run `f` with phase loaders wrapped to capture per-phase elapsed-ms. Returns
  `{:result (f) :phase-ms {:phase-1 N :phase-2 N :phase-3 N :phase-4 N}}`."
  [f]
  (let [phase-ms (atom {})
        wrap-phase (fn [k orig]
                     (fn [& args]
                       (let [start (now-ms)
                             res   (apply orig args)]
                         (swap! phase-ms assoc k (- (now-ms) start))
                         res)))
        ;; Capture originals from the namespace's private vars.
        load-databases* (var-get #'mfi/load-databases!)
        run-phase-2*    (var-get #'mfi/run-phase-2!)
        run-phase-3*    (var-get #'mfi/run-phase-3!)
        run-phase-4*    (var-get #'mfi/run-phase-4!)]
    (with-redefs-fn
      {#'mfi/load-databases! (wrap-phase :phase-1 load-databases*)
       #'mfi/run-phase-2!    (wrap-phase :phase-2 run-phase-2*)
       #'mfi/run-phase-3!    (wrap-phase :phase-3 run-phase-3*)
       #'mfi/run-phase-4!    (wrap-phase :phase-4 run-phase-4*)}
      (fn []
        (let [result (f)]
          {:result result :phase-ms @phase-ms})))))

(defn- count-stub-fields
  "Count `metabase_field` rows for `db-id` that still carry the stub sentinel
  after the import. Should be 0 for Convention B; possibly non-zero for
  Convention A worst-case."
  [db-id]
  (let [table-ids (mapv :id (t2/select [:model/Table :id] :db_id db-id))]
    (if (empty? table-ids)
      0
      (t2/count :model/Field
                :table_id [:in table-ids]
                :database_type "__stub__"))))

;;; ============================== Runner ==============================

(defn- format-bytes [n]
  (let [mb (/ n 1024.0 1024.0)]
    (format "%.1fMB" mb)))

(defn- format-ms [n]
  (if (and n (> n 1000))
    (format "%.1fs" (/ n 1000.0))
    (format "%dms" (or n 0))))

(defn- print-comparison-table!
  "Print a comparison table from a vec of result maps."
  [results]
  (println)
  (println "============================== COMPARISON ==============================")
  (println (format "%-20s %10s %10s %8s %8s %8s %8s %10s"
                   "scenario" "total" "peak-heap" "ph1" "ph2" "ph3" "ph4" "stubs"))
  (doseq [{:keys [scenario total-ms peak-heap-bytes phase-ms stubs]} results]
    (println (format "%-20s %10s %10s %8s %8s %8s %8s %10d"
                     scenario
                     (format-ms total-ms)
                     (format-bytes peak-heap-bytes)
                     (format-ms (:phase-1 phase-ms))
                     (format-ms (:phase-2 phase-ms))
                     (format-ms (:phase-3 phase-ms))
                     (format-ms (:phase-4 phase-ms))
                     stubs)))
  (println "========================================================================"))

(defn run-all-scenarios!
  "Drive all four scenarios sequentially, printing results."
  []
  (let [results
        (vec
         (for [[i scen] (map-indexed vector scenarios)]
           (do
             (println)
             (println (format "=== scenario %d/%d : %s ===" (inc i) (count scenarios) (:name scen)))
             (let [{:keys [db-id file-path stats]} (generate-perf-fixture! scen)
                   _ (println (format "  starting import (file=%s)…" file-path))
                   start (now-ms)
                   {:keys [result peak-heap-bytes]}
                   (with-heap-sampling
                     (fn []
                       (with-instrumented-phases
                         (fn [] (mfi/import-metadata-file! (File. ^String file-path))))))
                   total-ms (- (now-ms) start)
                   {:keys [phase-ms]} result
                   stub-count (count-stub-fields db-id)]
               (println (format "  import done in %s, peak-heap=%s, stubs=%d"
                                (format-ms total-ms)
                                (format-bytes peak-heap-bytes)
                                stub-count))
               (cleanup-perf-fixture! db-id)
               ;; Best-effort: drop the fixture file too.
               (try (.delete (File. ^String file-path)) (catch Throwable _ nil))
               {:scenario (:name scen)
                :total-ms total-ms
                :peak-heap-bytes peak-heap-bytes
                :phase-ms phase-ms
                :stats stats
                :stubs stub-count}))))]
    (print-comparison-table! results)
    results))

(comment
  ;; Quick smoke at the REPL: just generate one fixture and inspect stats —
  ;; do NOT call run-all-scenarios! casually; it can take 10-30 minutes.
  (def fx (generate-perf-fixture! (first scenarios)))
  (:stats fx)
  (cleanup-perf-fixture! (:db-id fx))

  ;; Full run:
  (run-all-scenarios!)

  ;; Stub-count at any time:
  (count-stub-fields (:db-id fx)))
