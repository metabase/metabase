(ns metabase.driver.sql.key-blocks
  "Key blocks: a sample of a table read as many short runs of rows at points spread over an ordered key, for a SQL
  driver whose database has no good built-in sample.

  The key range is cut into equal parts, one run for each part. The first run starts at the lowest key, the runs of the
  middle parts start at a random point of their part, and the last run reads down from the highest key, so the sample
  has the true first and last rows. A run reads `WHERE key >= start ORDER BY key LIMIT n`, which an index on the key
  reads in order and stops, so all the runs together read about as many rows as the first-rows sample. A run keeps only
  the rows of its own part, so that runs never overlap.

  Gaps in the key make a run in a part with few rows reach far, so its rows would count too much. The density of each
  run, its rows over the part of the key range that they cover, measured from the requested start point, gives weights:
  each run keeps its rows in proportion to its density. When the weights drop many rows, the runs are read once more,
  longer."
  (:refer-clojure :exclude [mapv some])
  (:require
   [clojure.string :as str]
   [metabase.driver.common.table-rows-sample :as table-rows-sample]
   [metabase.driver.sql.util :as sql.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.core :as qp]
   [metabase.util.performance :refer [mapv some]])
  (:import
   (java.time Instant LocalDate LocalDateTime OffsetDateTime ZoneOffset ZonedDateTime)
   (java.util Random)))

(set! *warn-on-reflection* true)

(def ^:private default-run-count
  "How many runs a sample reads. Measured: the quality levels off at 100 to 200 runs."
  200)

(def ^:private max-run-length-factor
  "How much longer than at first the runs can be when they are read again because the weights dropped rows. The rows
  are held in memory to weight them, so this caps them at twice the sample size."
  2)

(def ^:private min-kept
  "The part of the sample size that the sample must keep in the end; below it, the key is too uneven for key blocks,
  and the driver declines."
  0.5)

(def ^:private reread-below
  "The part of the sample size that the weighted runs must keep; below it, the runs are read again, longer."
  0.8)

(def ^:private key-alias "mb_sample_key")
(def ^:private run-alias "mb_sample_run")

;;; ------------------------------------------------ Keys as numbers -------------------------------------------------

(defn- ->number
  "`k`, a value of the key, as a number on a scale where the distance between two keys means something: the number
  itself, days for a date, milliseconds for a date and time. nil for a value of another type."
  [k]
  (condp instance? k
    Number         (double k)
    LocalDate      (double (.toEpochDay ^LocalDate k))
    LocalDateTime  (double (.toEpochMilli (.toInstant ^LocalDateTime k ZoneOffset/UTC)))
    OffsetDateTime (double (.toEpochMilli (.toInstant ^OffsetDateTime k)))
    ZonedDateTime  (double (.toEpochMilli (.toInstant ^ZonedDateTime k)))
    Instant        (double (.toEpochMilli ^Instant k))
    java.util.Date (double (.getTime ^java.util.Date k))
    nil))

(defn- integral?
  "Whether the keys like `k` are whole numbers on the scale of [[->number]], so that the smallest step is 1."
  [k]
  (or (integer? k) (not (number? k))))

(defn- number->
  "The key value at `x` on the scale of [[->number]], of the same type as `like`: rounded up to a whole step for a key
  of whole steps, so that a run starts inside its part."
  [like x]
  (let [step (Math/ceil (double x))]
    (condp instance? like
      Long           (long step)
      Integer        (int step)
      Short          (short step)
      BigInteger     (biginteger step)
      clojure.lang.BigInt (bigint step)
      BigDecimal     (bigdec x)
      LocalDate      (LocalDate/ofEpochDay (long step))
      LocalDateTime  (LocalDateTime/ofInstant (Instant/ofEpochMilli (long step)) ZoneOffset/UTC)
      OffsetDateTime (OffsetDateTime/ofInstant (Instant/ofEpochMilli (long step)) (.getOffset ^OffsetDateTime like))
      ZonedDateTime  (ZonedDateTime/ofInstant (Instant/ofEpochMilli (long step)) (.getZone ^ZonedDateTime like))
      Instant        (Instant/ofEpochMilli (long step))
      (double x))))

;;; ---------------------------------------------- Runs and their weights ----------------------------------------------

(defn- part-bounds
  "The bounds of `runs` equal parts of the key range from `lo` to `hi`, as `runs + 1` numbers from `lo` to `hi`."
  [lo hi runs]
  (let [width (/ (- hi lo) runs)]
    (conj (mapv #(+ lo (* width %)) (range runs)) hi)))

(defn- run-starts
  "The start of the ascending run of each part but the last: a random point of the part, as a number. The first run
  starts at the lowest key, which the caller passes as it is. The last part is read down from its upper bound."
  [bounds ^Random random]
  (into [(first bounds)]
        (map (fn [i]
               (let [lower (nth bounds i)]
                 (+ lower (* (.nextDouble random) (- (nth bounds (inc i)) lower))))))
        (range 1 (- (count bounds) 2))))

(defn- run-density
  "The rows of a run over the part of the key range that they cover, from its start point as sent to the database.

  A run that read its full `length` covers the range up to its last key. A run that stopped at the end of its part
  covers the rest of the part. `step` is the smallest distance between two keys: 1 for whole numbers."
  [{:keys [start end keys descending?]} length step]
  (let [n (count keys)]
    (if (zero? n)
      0.0
      (let [reach (if (= n length)
                    (if descending? (- start (last keys)) (- (last keys) start))
                    (if descending? (- start end) (- end start)))]
        (/ n (max (+ reach step) step))))))

(defn- weighted-keep
  "How many rows to keep from each run, in proportion to its density: the densest run keeps all of its rows, and a run
  with rows keeps at least one. A run on a cluster of keys makes the others keep few rows; the sample then keeps less
  than [[min-kept]] and the driver declines."
  [densities counts]
  (let [densest (reduce max 0.0 densities)]
    (mapv (fn [density n]
            (if (or (zero? n) (zero? densest))
              0
              (max 1 (Math/round (double (* n (/ density densest)))))))
          densities counts)))

;;; --------------------------------------------------- The query ----------------------------------------------------

(defn- base-query
  "The sample query of sync for `cols` of `table`, with no limit, not even the default one, and with the key
  `key-col` as a last column under a name of its own. A limit would keep the database from merging it into the run
  around it, so that each run would read the whole table."
  [mp table cols key-col truncation-size]
  ;; with explicit fields, `lib/expression` adds the new expression as the last field
  (-> (table-rows-sample/table-rows-sample-query mp table cols (cond-> {:limit nil}
                                                                 truncation-size
                                                                 (assoc :truncation-size truncation-size)))
      (lib/expression key-alias key-col)
      qp/disable-max-results))

(defn- runs-sql
  "One statement that reads all the runs: an arm of `UNION ALL` for each run, around the compiled sample query
  `{:query sql, :params params}`, the last one read down from `hi`. Each arm tags its rows with its run number. The
  statement has a limit of its own, so that a session limit such as `sql_select_limit` does not cut it."
  [driver {sql :query params :params} starts hi length]
  (let [k   (str "b." (sql.u/quote-name driver :field key-alias))
        run (sql.u/quote-name driver :field run-alias)
        arm (fn [i comparison direction]
              (format "(SELECT %d AS %s, b.* FROM (%s) b WHERE %s %s ? ORDER BY %s %s LIMIT %d)"
                      i run sql k comparison k direction length))
        n   (count starts)]
    {:query  (str (str/join " UNION ALL " (conj (mapv #(arm % ">=" "ASC") (range n))
                                                (arm n "<=" "DESC")))
                  " LIMIT " (* (inc n) length))
     :params (into [] cat (concat (map #(conj (vec params) %) starts)
                                  [(conj (vec params) hi)]))}))

(defn- collect
  "Run the native query `sql` on the Database `database-id`, and return its metadata and rows."
  [database-id {:keys [query params]}]
  (let [metadata (volatile! nil)
        rows     (qp/process-query
                  {:lib/type   :mbql/query
                   :database   database-id
                   :stages     [{:lib/type :mbql.stage/native :native query :params params}]
                   :middleware {:format-rows? false :skip-results-metadata? true}
                   :info       {:context :table-rows-sample}}
                  (fn [md]
                    (vreset! metadata md)
                    (fn
                      ([] (transient []))
                      ([acc] (persistent! acc))
                      ([acc row] (conj! acc row)))))]
    {:metadata @metadata :rows rows}))

(defn- key-range
  "The lowest and highest value of `key-col` of `table`. An index on the key gives them with no scan."
  [mp table key-col]
  (let [query (-> (lib/query mp table)
                  (lib/aggregate (lib/min key-col))
                  (lib/aggregate (lib/max key-col))
                  (assoc :middleware {:format-rows? false :skip-results-metadata? true}))]
    (first (qp/process-query query (fn [_md]
                                     (fn
                                       ([] [])
                                       ([acc] acc)
                                       ([acc row] (conj acc row))))))))

(defn- read-runs
  "Read the runs of `length` rows of `plan`, and return them as maps of `:start`, `:end`, `:descending?`, `:keys` and
  `:rows` (the sample columns of each row of the run's part), with the metadata of the sample columns."
  [driver database-id {:keys [compiled bounds params starts hi]} length]
  (let [{:keys [metadata rows]} (collect database-id (runs-sql driver compiled params hi length))
        by-run   (group-by first rows)
        last-run (count starts)
        in-part? (fn [i x]
                   (if (= i last-run)
                     (and (>= x (nth bounds last-run)) (<= x (peek bounds)))
                     (and (>= x (nth bounds i)) (< x (nth bounds (inc i))))))]
    {:metadata (update metadata :cols #(subvec (vec %) 1 (dec (count %))))
     :runs     (mapv (fn [i]
                       (let [part (filterv #(in-part? i (->number (peek %))) (get by-run i))]
                         {:start       (if (= i last-run) (peek bounds) (nth starts i))
                          :end         (nth bounds (if (= i last-run) last-run (inc i)))
                          :descending? (= i last-run)
                          :keys        (mapv #(->number (peek %)) part)
                          :rows        (mapv #(subvec % 1 (dec (count %))) part)}))
                     (range (inc last-run)))}))

(defn- weighted-rows
  "The rows that the weights keep, from the start of each run."
  [runs length step]
  (let [keep-counts (weighted-keep (mapv #(run-density % length step) runs)
                                   (mapv (comp count :keys) runs))]
    (into [] cat (map (fn [{:keys [rows]} n] (take n rows)) runs keep-counts))))

(defn- key-column
  "The column of `table` named `key-name`, when it is a number or a date or a date and time with no coercion, which
  would compile to an expression that no index reads."
  [mp table-id key-name]
  (some (fn [col]
          (when (and (= key-name (:name col))
                     (nil? (:coercion-strategy col))
                     (some #(isa? ((some-fn :effective-type :base-type) col) %)
                           [:type/Number :type/Date :type/DateTime]))
            col))
        (lib.metadata/fields mp table-id)))

(defn- run-plan
  "Where the runs of a sample of `runs` runs of the key from `lo` to `hi` start, or nil when the key cannot have
  them: when it is of a type with no distance, or a key of whole numbers with fewer than 2 values for each run, such
  as the first column of a key of several columns with few values."
  [lo hi runs seed]
  (let [lo-n (->number lo)
        hi-n (->number hi)]
    (when (and lo-n hi-n (< lo-n hi-n)
               (not (and (integral? lo) (< (- hi-n lo-n) (* 2 runs)))))
      (let [bounds (part-bounds lo-n hi-n runs)
            ;; the start points as sent: the true lowest key for the first run, the others rounded to the key's type
            params (into [lo] (map #(number-> lo %)) (rest (run-starts bounds (if seed (Random. (long seed)) (Random.)))))]
        {:bounds bounds
         :params params
         :starts (mapv ->number params)
         :hi     hi
         :step   (if (integral? lo) 1.0 (* 1e-9 (- hi-n lo-n)))}))))

(defn- read-weighted
  "The rows that the weights keep from runs of `length` rows, read again once with longer runs when they keep less
  than [[reread-below]] of `rows`, and the metadata of their columns."
  [driver database-id {:keys [step] :as plan} rows length]
  (let [initial (read-runs driver database-id plan length)
        kept    (weighted-rows (:runs initial) length step)]
    (if (and (seq kept) (< (count kept) (* reread-below rows)))
      (let [longer (min (* max-run-length-factor length)
                        (long (Math/ceil (* length (/ rows (double (count kept)))))))
            again  (read-runs driver database-id plan longer)]
        {:metadata (:metadata again) :rows (weighted-rows (:runs again) longer step)})
      {:metadata (:metadata initial) :rows kept})))

(defn sample
  "The [[metabase.driver/table-random-sample]] of key blocks for `fields` of `table`, read on its column `key-name`,
  which must have an index that reads it in order: about `(:rows opts)` rows in `(:runs opts 200)` runs.

  Declines, so that sync reads the first rows, when the table has no row count estimate, when the key is not a number
  or a date or time, has no range to place the runs in, or is so uneven that the weights keep less than [[min-kept]]
  of the sample size. `:seed` in `opts` makes the start points repeatable."
  [driver table fields key-name rff {:keys [rows row-count truncation-size runs seed] :or {runs default-run-count}}]
  (let [database-id (:db_id table)
        mp          (lib-be/application-database-metadata-provider database-id)
        table-md    (lib.metadata/table mp (:id table))
        key-col     (when row-count (key-column mp (:id table) key-name))
        plan        (when key-col
                      (let [[lo hi] (key-range mp table-md key-col)]
                        (run-plan lo hi runs seed)))]
    (if-not plan
      {:method :first-rows}
      (let [cols     (mapv #(lib.metadata/field mp (:id %)) fields)
            plan     (assoc plan :compiled (qp.compile/compile (base-query mp table-md cols key-col truncation-size)))
            length   (max 1 (long (Math/ceil (/ rows (double runs)))))
            {:keys [metadata] kept :rows} (read-weighted driver database-id plan rows length)]
        (if (< (count kept) (* min-kept rows))
          {:method :first-rows}
          (let [rf (rff metadata)]
            {:method   :block
             :runs     (inc (count (:starts plan)))
             :fraction (/ (count kept) (double (max row-count 1)))
             :result   (rf (reduce rf (rf) kept))}))))))
