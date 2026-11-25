(ns metabase.driver.sql.key-blocks
  "Key blocks: a sample of a table read as many short runs of rows at points spread over an ordered key, for a SQL
  driver whose database has no good built-in sample.

  The key range is cut into equal parts, one run for each part. The first run starts at the lowest key, the runs of the
  middle parts start at a random point of their part, and the last run reads down from the highest key, so the sample
  has the true first and last rows. A run reads `WHERE key >= start ORDER BY key LIMIT n`, which an index on the key
  reads in order and stops, so all the runs together read about as many rows as the first-rows sample. A run keeps only
  the rows of its own part, so that runs never overlap.

  Gaps in the key make a run in a part with few rows reach far, so its rows would count too much. So the runs are
  read twice. The first read takes only the keys, and gives the density of each run: its rows over the part of the key
  range they cover, measured from the start point as sent. The second read takes the rows, with a limit for each run in
  proportion to its density, scaled so that all the runs together read about the sample size. Its rows go straight to
  the reducing function."
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
  "How much longer than the first read a run of the second read can be, for the densest runs of an uneven key."
  4)

(def ^:private min-kept
  "The part of the sample size that the second read must reach; below it, the key is too uneven for key blocks, and
  the driver declines."
  0.5)

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

(defn- arm-limits
  "The limit of each run of the second read, in proportion to its density and scaled so that they add up to about
  `rows`, each run reading at most [[max-run-length-factor]] times `length`. A run with rows reads at least one, and
  a run that stopped at the end of its part reads at most the rows that the part has."
  [runs length step rows]
  (let [densities (mapv #(run-density % length step) runs)
        densest   (reduce max 0.0 densities)
        weights   (mapv #(if (zero? densest) 0.0 (/ % densest)) densities)
        total     (reduce + weights)
        scale     (if (zero? total) 0.0 (min (* max-run-length-factor length) (/ rows total)))]
    (mapv (fn [{:keys [keys]} weight]
            (let [n (count keys)]
              (cond-> (if (zero? n) 0 (max 1 (Math/round (double (* scale weight)))))
                (< 0 n length) (min n))))
          runs weights)))

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
  "One statement that reads the runs: an arm of `UNION ALL` for each run with a limit above 0, around the compiled
  sample query `{:query sql, :params params}`. The last run is read down from `hi`. Each arm tags its rows with its run
  number. The statement has a limit of its own, so that a session limit such as `sql_select_limit` does not cut it."
  [driver {sql :query params :params} starts hi limits]
  (let [k    (str "b." (sql.u/quote-name driver :field key-alias))
        run  (sql.u/quote-name driver :field run-alias)
        n    (count starts)
        arms (for [i     (range (inc n))
                   :let  [limit (nth limits i)]
                   :when (pos? limit)]
               (let [last? (= i n)]
                 {:sql   (format "(SELECT %d AS %s, b.* FROM (%s) b WHERE %s %s ? ORDER BY %s %s LIMIT %d)"
                                 i run sql k (if last? "<=" ">=") k (if last? "DESC" "ASC") limit)
                  :param (if last? hi (nth starts i))}))]
    {:query  (str (str/join " UNION ALL " (map :sql arms)) " LIMIT " (reduce + limits))
     :params (into [] (mapcat #(conj (vec params) (:param %))) arms)}))

(defn- native-query
  "The native query `{:query sql, :params params}` on the Database `database-id`, for sync."
  [database-id {:keys [query params]}]
  {:lib/type   :mbql/query
   :database   database-id
   :stages     [{:lib/type :mbql.stage/native :native query :params params}]
   :middleware {:format-rows? false :skip-results-metadata? true}
   :info       {:context :table-rows-sample}})

(defn- collect-rows
  "Run the native query `sql` on the Database `database-id`, and return its rows."
  [database-id sql]
  (qp/process-query (native-query database-id sql)
                    (fn [_md]
                      (fn
                        ([] (transient []))
                        ([acc] (persistent! acc))
                        ([acc row] (conj! acc row))))))

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

(defn- part-filter
  "A function of a run number and a key number: whether the key is in that run's part."
  [{:keys [bounds starts]}]
  (let [last-run (count starts)]
    (fn [i x]
      (if (= i last-run)
        (and (>= x (nth bounds last-run)) (<= x (peek bounds)))
        (and (>= x (nth bounds i)) (< x (nth bounds (inc i))))))))

(defn- read-keys
  "The first read: the keys of the runs of `length` rows of `plan`, as maps of `:start`, `:end`, `:descending?` and
  `:keys` (the keys of the run's part)."
  [driver database-id {:keys [keys-compiled bounds params starts hi] :as plan} length]
  (let [rows     (collect-rows database-id (runs-sql driver keys-compiled params hi
                                                     (vec (repeat (inc (count starts)) length))))
        by-run   (group-by first rows)
        in-part? (part-filter plan)
        last-run (count starts)]
    (mapv (fn [i]
            {:start       (if (= i last-run) (peek bounds) (nth starts i))
             :end         (nth bounds (if (= i last-run) last-run (inc i)))
             :descending? (= i last-run)
             :keys        (into [] (comp (map #(->number (peek %))) (filter #(in-part? i %))) (get by-run i))})
          (range (inc last-run)))))

(defn- stream-rows
  "The second read: the rows of the runs with `limits`, reduced with `rff` with only the sample columns, and only the
  rows of each run's part. Returns the result of the reduction and the number of rows."
  [driver database-id {:keys [compiled params hi] :as plan} limits rff]
  (let [in-part? (part-filter plan)
        kept     (volatile! 0)
        result   (qp/process-query
                  (native-query database-id (runs-sql driver compiled params hi limits))
                  (fn [metadata]
                    (let [rf (rff (update metadata :cols #(subvec (vec %) 1 (dec (count %)))))]
                      (fn
                        ([] (rf))
                        ([acc] (rf acc))
                        ([acc row]
                         (if (in-part? (first row) (->number (peek row)))
                           (do (vswap! kept inc)
                               (rf acc (subvec row 1 (dec (count row)))))
                           acc))))))]
    {:result result :kept @kept}))

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

(defn sample
  "The [[metabase.driver/table-random-sample]] of key blocks for `fields` of `table`, read on its column `key-name`,
  which must have an index that reads it in order and no repeated values: about `(:rows opts)` rows in
  `(:runs opts 200)` runs.

  Declines, so that sync reads the first rows, when the table has no row count estimate, when the key is not a number
  or a date or time, has no range to place the runs in, or is so uneven that the runs would read less than
  [[min-kept]] of the sample size. `:seed` in `opts` makes the start points repeatable."
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
      (let [length (max 1 (long (Math/ceil (/ rows (double runs)))))
            plan   (assoc plan :keys-compiled (qp.compile/compile (base-query mp table-md [key-col] key-col nil)))
            limits (arm-limits (read-keys driver database-id plan length) length (:step plan) rows)]
        (if (< (reduce + limits) (* min-kept rows))
          {:method :first-rows}
          (let [cols                   (mapv #(lib.metadata/field mp (:id %)) fields)
                plan                   (assoc plan :compiled (qp.compile/compile
                                                              (base-query mp table-md cols key-col truncation-size)))
                {:keys [result kept]} (stream-rows driver database-id plan limits rff)]
            {:method   :block
             :runs     (count (filter pos? limits))
             :fraction (/ kept (double (max row-count 1)))
             :result   result}))))))
