(ns metabase-enterprise.data-testing.expectations.equals
  "The `equals` expectation: the output of the query under test holds exactly the expected rows, over exactly their
  columns. The expected rows are written out (`format: rows`), or are what a SQL query returns (`format: sql`). That
  query is rewritten, as every expectation's SQL is, to read the run's temp tables; the check that it reads nothing
  else sees the tables the SQL parser finds, not a table named inside a string.

  Only the expected columns are compared, so a column the expectation does not name — a `NOW()`
  timestamp, say — never enters the query. It also means `equals` says nothing about a column the
  output has and the expectation does not. The two sides meet in one `UNION ALL`, so the database's typing of it
  decides whether values of different types are equal: H2 converts the string `'01'` to equal the integer `1`, and
  Postgres refuses to compare them."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-testing.compile :as data-testing.compile]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.expectations.protocol :as expectations.protocol]
   [metabase-enterprise.data-testing.expectations.report :as expectations.report]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------- Result schema -----------------------------------------

(def ^:private cell
  "A value as a failure report carries it: a string, a number, a boolean, or null."
  [:maybe [:or :boolean number? :string]])

(mr/def ::cell-mismatch
  "A cell that differs between the one missing row and the one extra row."
  [:map {:closed true}
   [:column   :string]
   [:expected cell]
   [:actual   cell]])

(mr/def ::expectation
  "A built `equals` expectation."
  [:fn #(satisfies? expectations.protocol/Expectation %)])

(def ^:private base
  "The shared result keys, pinned to this type."
  [:merge
   ::data-testing.schema/expectation-result.base
   [:map [:type [:= :equals]]]])

(def ^:private findings
  [:merge
   base
   [:map {:description "The comparison's findings, reported in full on a pass as well as a failure."}
    [:columns         [:sequential ::data-testing.schema/result-column]]
    [:row-counts      [:map {:closed true}
                       [:actual   :int]
                       [:expected :int]]]
    [:extra-rows      [:sequential ::data-testing.schema/row]]
    [:missing-rows    [:sequential ::data-testing.schema/row]]
    [:cell-mismatches [:sequential ::cell-mismatch]]
    [:truncated       :int]]])

(mr/def ::result
  "What an `equals` expectation found.

  Unless `:status` is `error`, every key is present on a pass as well as a failure:
  `:extra-rows`, `:missing-rows` and `:cell-mismatches` come back empty rather than missing.
  `:row-counts` sets the output's row count against the number of expected rows.
  `:cell-mismatches` is filled only when exactly one row is missing and exactly one is extra.
  `:extra-rows` and `:missing-rows` are capped; `:truncated` is how many rows that cap dropped."
  [:multi {:dispatch :status}
   [:error  base]
   [:passed findings]
   [:failed findings]])

;;; --------------------------------------------- Reporting ---------------------------------------------

(mu/defn- cell-mismatches :- [:maybe [:sequential ::cell-mismatch]]
  "The cells that differ between the one missing row and the one extra row, or nil when the diff is
  not one-for-one.

  Only the unambiguous case is paired. Sorting both sides and pairing positionally for a larger
  diff produces output that reads as authoritative and is arbitrary."
  [column-names                 :- [:sequential :string]
   [missing :as missing-rows]   :- [:sequential ::data-testing.schema/row]
   [extra :as extra-rows]       :- [:sequential ::data-testing.schema/row]]
  (when (= 1 (count missing-rows) (count extra-rows))
    (not-empty
     (vec (for [c     column-names
                :let  [e (get missing c) a (get extra c)]
                :when (not= e a)]
            {:column c :expected e :actual a})))))

;;; ---------------------------------------- Resolving expected columns ----------------------------------

(mu/defn- unknown-column :- (ms/InstanceOfClass clojure.lang.ExceptionInfo)
  "The refusal of `column-name`, which the output does not have. `form` is where the name came from: the author's
  `columns` (`:rows`) or the expected query's result (`:sql`)."
  [form             :- [:enum :rows :sql]
   expectation-name :- :string
   output-columns   :- [:sequential :string]
   column-name      :- :string]
  (data-testing.errors/ex
   ::data-testing.errors/unknown-column
   (case form
     :rows (tru "Expectation {0} compares column {1}, which the output of the query under test does not have. It has: {2}"
                (pr-str expectation-name) (pr-str column-name) (str/join ", " output-columns))
     :sql  (tru "The query of expectation {0} returns column {1}, which the output of the query under test does not have. It has: {2}. If the query computes this column, name it with AS."
                (pr-str expectation-name) (pr-str column-name) (str/join ", " output-columns)))
   {:expectation expectation-name
    :column      column-name
    :available   (vec output-columns)}))

(mu/defn- resolve-column :- :string
  "The output table's own spelling of `column-name`.

  An expectation names a column as the author wrote it (`format: rows`) or as the expected table spells it
  (`format: sql`); the output table holds whatever the warehouse's folding produced, which for the same unquoted
  identifier is upper case on H2 and Snowflake and lower on Postgres. Resolving against the materialized table means
  the comparison names a column the table actually has — and, since the result is always one of the output's own
  names, no author-supplied string ever reaches the SQL as an identifier."
  [form             :- [:enum :rows :sql]
   expectation-name :- :string
   output-columns   :- [:sequential :string]
   column-name      :- :string]
  (let [folded (filter #(.equalsIgnoreCase ^String % column-name) output-columns)]
    (or (first (filter #(= % column-name) output-columns))
        (when (= 1 (count folded)) (first folded))
        (if (seq folded)
          ;; Several columns differ from each other only in case, so folding cannot choose between
          ;; them. Reporting this as "not found" would send the author hunting for a typo while
          ;; listing columns that plainly match.
          (throw (data-testing.errors/ex
                  ::data-testing.errors/ambiguous-column
                  (tru "Expectation {0} names column {1}, which matches more than one output column: {2}. Write it exactly as the output spells it."
                       (pr-str expectation-name) (pr-str column-name)
                       (str/join ", " folded))
                  {:expectation expectation-name
                   :column      column-name
                   :candidates  (vec folded)}))
          (throw (unknown-column form expectation-name output-columns column-name))))))

(mu/defn- resolve-names :- [:sequential :string]
  "The output table's own spelling of each of `column-names`, in order. `form` is as for [[resolve-column]]."
  [form             :- [:enum :rows :sql]
   expectation-name :- :string
   column-names     :- [:sequential :string]
   output-columns   :- [:sequential ::data-testing.schema/result-column]]
  (let [output-names (mapv :name output-columns)]
    (mapv #(resolve-column form expectation-name output-names %) column-names)))

(mu/defn resolve-columns :- [:sequential :string]
  "The output table's own spelling of each column `expectation` declares, in declared order.

  Only the SQL uses these. A failure reports the column under the name the author wrote, which is
  what they can find in their own test."
  [{:keys [name columns]} :- ::expectation
   output-columns         :- [:sequential ::data-testing.schema/result-column]]
  (resolve-names :rows name (mapv :name columns) output-columns))

;;; ---------------------------------------------- Comparing --------------------------------------------

(mu/defn- check-compared-columns! :- :nil
  "Refuse the comparison of the expectation `expectation-name` unless each output column in `output-names` is compared
  once and none shares the name of the comparison's own column. `column-names` are the same columns as the expectation
  names them."
  [expectation-name :- :string
   column-names     :- [:sequential :string]
   output-names     :- [:sequential :string]]
  (when-let [repeated (first (for [[output-name n] (frequencies output-names) :when (< 1 n)] output-name))]
    (let [names (vec (for [[column-name output-name] (map vector column-names output-names)
                           :when (= output-name repeated)]
                       column-name))]
      (throw (data-testing.errors/ex
              ::data-testing.errors/colliding-columns
              (tru "Expectation {0} compares output column {1} more than once, as {2}. Compare each column once."
                   (pr-str expectation-name) (pr-str repeated) (str/join ", " names))
              {:expectation expectation-name :column repeated :columns names}))))
  (when-let [reserved (first (filter #(.equalsIgnoreCase ^String % data-testing.compile/comparison-tag) output-names))]
    (throw (data-testing.errors/ex
            ::data-testing.errors/colliding-columns
            (tru "Expectation {0} compares column {1}, a name the comparison uses for a column of its own. Rename the column in the query under test."
                 (pr-str expectation-name) (pr-str reserved))
            {:expectation expectation-name :column reserved :columns [reserved]})))
  nil)

(defn- comparison-probes
  "The comparison of `output-table` with `expected-table` and the row count of `output-table`, as probes. The columns
  compared are `output-names` as the output spells them and `expected-names` as the expected table spells them, paired
  by position; `column-names` are the same columns as the expectation `expectation-name` names them."
  [driver expectation-name column-names output-table expected-table output-names expected-names]
  (check-compared-columns! expectation-name column-names output-names)
  {:comparison   (assoc (data-testing.compile/comparison-query driver output-table expected-table
                                                               output-names expected-names)
                        :max-rows (inc expectations.report/row-cap))
   :actual-count (assoc (data-testing.compile/row-count-query driver output-table) :max-rows 1)})

(defn- probe-count
  "The count a row-count probe read, or 0 when it read none."
  [result]
  (or (some-> result :rows ffirst long) 0))

(mu/defn- comparison-result :- ::result
  "What the expectation `expectation-name` found, from the rows its comparison probe read and the row counts of the
  output and of the expected rows. `column-names` are the expected columns as a report names them, and `output-names`
  the output's spelling of each."
  [expectation-name :- :string
   column-names     :- [:sequential :string]
   output-names     :- [:sequential :string]
   output-columns   :- [:sequential ::data-testing.schema/result-column]
   comparison-rows  :- [:sequential [:sequential ms/FieldValue]]
   actual-count     :- :int
   expected-count   :- :int]
  (let [;; A comparison row is the expected columns followed by the signed multiplicity: how many
        ;; times too often the row appears in the output (+) or in the expectation (-).
        diffs        (for [row comparison-rows]
                       [(long (last row))
                        (zipmap column-names (map expectations.report/cell (butlast row)))])
        expand       (fn [keep?]
                       ;; Take inside the expansion, not after it. A single comparison row can
                       ;; carry a multiplicity of millions, and realizing that many copies just to
                       ;; drop all but `row-cap` of them turns a failed assertion into a memory
                       ;; event. The transducer short-circuits, so `repeat` is never realized past
                       ;; the cap; the dropped count comes from arithmetic rather than counting.
                       (let [matching (filterv (comp keep? first) diffs)
                             total    (reduce + 0 (map (comp abs first) matching))
                             rows     (into [] (comp (mapcat (fn [[delta cells]]
                                                               (repeat (abs delta) cells)))
                                                     (take expectations.report/row-cap))
                                            matching)]
                         [rows (- total (count rows))]))
        [extra   extra-dropped]   (expand pos?)
        [missing missing-dropped] (expand neg?)
        ;; name -> the output table's type for each column
        output-type  (into {} (map (juxt :name :database_type)) output-columns)
        reported     (mapv (fn [column-name output-name]
                             {:name column-name :database_type (output-type output-name)})
                           column-names
                           output-names)]
    ;; Every key is always present: a consumer should not have to tell nil from [].
    (cond-> {:name            expectation-name
             :type            :equals
             :status          (if (and (empty? extra) (empty? missing)) :passed :failed)
             :columns         reported
             :row-counts      {:actual actual-count :expected expected-count}
             :extra-rows      extra
             :missing-rows    missing
             :truncated       (+ extra-dropped missing-dropped)
             :cell-mismatches []}

      (cell-mismatches column-names missing extra)
      (assoc :cell-mismatches (cell-mismatches column-names missing extra)))))

;;; ----------------------------------------------- Types -----------------------------------------------

(defrecord EqualsRows [type name format columns rows]
  expectations.protocol/Expectation
  ;; The expected table is built with the output's own spellings, so both sides name the columns alike. Its columns
  ;; are checked before it is built, since two of one name would fail in the warehouse.
  (temp-tables [this {:keys [driver output-columns]}]
    (let [output-names (resolve-columns this output-columns)]
      (check-compared-columns! name (mapv :name columns) output-names)
      {"expected" (data-testing.compile/rows-query driver columns output-names rows)}))

  (probes [this {:keys [driver output-table output-columns temp-tables]}]
    (let [output-names (resolve-columns this output-columns)]
      (comparison-probes driver name (mapv :name columns) output-table (get temp-tables "expected")
                         output-names output-names)))

  (interpret [this {:keys [output-columns]} results]
    (comparison-result name (mapv :name columns) (resolve-columns this output-columns) output-columns
                       (:rows (:comparison results)) (probe-count (:actual-count results)) (count rows))))

(defn- expected-columns
  "The column names of the temp table that holds the expected rows, as the warehouse spells them."
  [{:keys [temp-table-columns]}]
  (mapv :name (get temp-table-columns "expected")))

(defrecord EqualsSql [type name format sql]
  expectations.protocol/Expectation
  (temp-tables [_this {:keys [driver replacements output-token]}]
    {"expected" {:query  (data-testing.compile/replace-tables driver sql replacements output-token)
                 :params []}})

  (probes [_this {:keys [driver output-table output-columns temp-tables] :as context}]
    (let [expected-names (expected-columns context)
          expected-table (get temp-tables "expected")]
      (assoc (comparison-probes driver name expected-names output-table expected-table
                                (resolve-names :sql name expected-names output-columns) expected-names)
             :expected-count (assoc (data-testing.compile/row-count-query driver expected-table) :max-rows 1))))

  (interpret [_this {:keys [output-columns] :as context} results]
    (let [expected-names (expected-columns context)]
      (comparison-result name expected-names (resolve-names :sql name expected-names output-columns) output-columns
                         (:rows (:comparison results)) (probe-count (:actual-count results))
                         (probe-count (:expected-count results))))))

;;; --------------------------------------------- Building ----------------------------------------------

(defmethod expectations.protocol/build :equals
  [{:keys [format] :as m}]
  (mu/validate-throw ::data-testing.schema/expectation m)
  ;; The linter forbids these constructors everywhere, so that an expectation is only ever built from a
  ;; value the schema has passed. This is the one place they are the right call.
  #_{:clj-kondo/ignore [:discouraged-var]}
  (case format
    ;; A declared `cast_type` is not checked here, nor anywhere else: `compile/rows-query` quotes
    ;; a cast target that is not a plain type name, leaving the database to refuse it.
    :rows (->EqualsRows :equals (:name m) :rows (:columns m) (:rows m))
    :sql  (->EqualsSql :equals (:name m) :sql (:sql m))))
