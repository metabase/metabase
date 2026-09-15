(ns metabase.transform-testing.expectations.equals
  "The `equals` expectation: the transform output holds exactly the declared rows, over exactly the
  declared columns.

  Only the declared columns are compared, so a column the expectation does not name — a `NOW()`
  timestamp, say — never enters the query. It also means `equals` says nothing about a column the
  output has and the expectation does not."
  (:require
   [clojure.string :as str]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.transform-testing.compile :as transform-testing.compile]
   [metabase.transform-testing.errors :as transform-testing.errors]
   [metabase.transform-testing.expectations.protocol :as expectations.protocol]
   [metabase.transform-testing.expectations.report :as expectations.report]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------- Schemas -----------------------------------------------

(mr/def ::expectation
  "An expectation that the transform output equals test data."
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         (comp keyword :format)}
   [:sql  [:merge
           [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
            [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :equals]]
            [:name ::lib.schema.common/non-blank-string]]
           ::transform-testing.schema/sql-data]]
   [:rows [:merge
           [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
            [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :equals]]
            [:name ::lib.schema.common/non-blank-string]]
           ::transform-testing.schema/rows-data]]])

(def ^:private cell
  "A value as a failure report carries it: a string, a number, a boolean, or null."
  [:maybe [:or :boolean number? :string]])

(def ^:private base
  "The shared result keys, pinned to this type."
  [:merge
   ::transform-testing.schema/expectation-result.base
   [:map [:type [:= :equals]]]])

(def ^:private findings
  [:merge
   base
   [:map {:description "The comparison's findings, reported in full on a pass as well as a failure."}
    [:columns         [:sequential ::transform-testing.schema/result-column]]
    [:row-counts      [:map {:closed true}
                       [:actual   :int]
                       [:expected :int]]]
    [:extra-rows      [:sequential ::transform-testing.schema/row]]
    [:missing-rows    [:sequential ::transform-testing.schema/row]]
    [:cell-mismatches [:sequential [:map {:closed true}
                                    [:column   :string]
                                    [:expected cell]
                                    [:actual   cell]]]]
    [:truncated       :int]]])

(mr/def ::result
  "What an `equals` expectation found.

  Unless `:status` is `error`, every key is present on a pass as well as a failure:
  `:extra-rows`, `:missing-rows` and `:cell-mismatches` come back empty rather than missing.
  `:row-counts` sets the output's row count against the number of rows the expectation declared.
  `:cell-mismatches` is filled only when exactly one row is missing and exactly one is extra.
  `:extra-rows` and `:missing-rows` are capped; `:truncated` is how many rows that cap dropped."
  [:multi {:dispatch :status}
   [:error  base]
   [:passed findings]
   [:failed findings]])

;;; ------------------------------------------- Comparison SQL -------------------------------------------

(def ^:private src-column
  "The column carrying +1 for an output row and -1 for an expected one."
  :__mb_src)

(mu/defn comparison-query :- ::transform-testing.compile/compiled-query
  "The query comparing `output-table` against the literal `rows` over `columns`.

  The comparison runs in the warehouse. Canonicalizing both sides in Clojure means reimplementing
  each engine's notion of equality in Java types; comparing in SQL uses the engine's own.

  Cell values are bound parameters throughout. The only text reaching the SQL is `sql-names`, the
  output table's own column names as [[resolve-columns]] found them — never an author-supplied
  string."
  [driver       :- :keyword
   output-table :- :string
   columns      :- [:sequential ::transform-testing.schema/column]
   sql-names    :- [:sequential :string]
   rows         :- [:sequential ::transform-testing.schema/row]]
  (let [cols   (mapv keyword sql-names)
        tagged (fn [from tag] {:select (conj cols [[:inline tag] src-column]) :from [from]})]
    (transform-testing.compile/compiled
     driver
     {:select   (conj cols [[:sum src-column] :__mb_delta])
      :from     [[{:union-all [(tagged (keyword output-table) 1)
                               (tagged [(transform-testing.compile/rows-relation columns sql-names rows)
                                        :__mb_expected]
                                       -1)]}
                  :__mb_comparison]]
      :group-by cols
      :having   [:<> [:sum src-column] [:inline 0]]})))

(mu/defn row-count-query :- ::transform-testing.compile/compiled-query
  "The query counting the rows of `output-table`."
  [driver       :- :keyword
   output-table :- :string]
  (transform-testing.compile/compiled
   driver
   {:select [[[:count [:inline 1]] :__mb_count]] :from [(keyword output-table)]}))

;;; --------------------------------------------- Reporting ---------------------------------------------

(defn- cell-mismatches
  "The cells that differ between the one missing row and the one extra row, or nil when the diff is
  not one-for-one.

  Only the unambiguous case is paired. Sorting both sides and pairing positionally for a larger
  diff produces output that reads as authoritative and is arbitrary."
  [column-names [missing :as missing-rows] [extra :as extra-rows]]
  (when (= 1 (count missing-rows) (count extra-rows))
    (not-empty
     (vec (for [c     column-names
                :let  [e (get missing c) a (get extra c)]
                :when (not= e a)]
            {:column c :expected e :actual a})))))

;;; ---------------------------------------- Resolving declared columns ----------------------------------

(defn- resolve-column
  "The output table's own spelling of `declared-name`.

  The author writes the name as it appears in the transform's SQL; the warehouse stores whatever its
  folding rules produced, which for the same unquoted identifier is upper case on H2 and Snowflake
  and lower on Postgres. Resolving against the materialized table means the comparison names a
  column the table actually has — and, since the result is always one of the output's own names, no
  author-supplied string ever reaches the SQL as an identifier."
  [expectation-name output-columns declared-name]
  (let [folded   (filter #(.equalsIgnoreCase ^String % declared-name) output-columns)
        resolved (or (first (filter #(= % declared-name) output-columns))
                     (when (= 1 (count folded)) (first folded))
                     (if (seq folded)
                       ;; Several columns differ from each other only in case, so folding cannot
                       ;; choose between them. Reporting this as "not found" would send the author
                       ;; hunting for a typo while listing columns that plainly match.
                       (throw (transform-testing.errors/ex
                               ::transform-testing.errors/ambiguous-column
                               (tru "Expectation {0} names column {1}, which matches more than one output column: {2}. Write it exactly as the output spells it."
                                    (pr-str expectation-name) (pr-str declared-name)
                                    (str/join ", " folded))
                               {:expectation expectation-name
                                :column      declared-name
                                :candidates  (vec folded)}))
                       (throw (transform-testing.errors/ex
                               ::transform-testing.errors/unknown-column
                               (tru "Expectation {0} compares column {1}, which the transform output does not have. It has: {2}"
                                    (pr-str expectation-name) (pr-str declared-name)
                                    (str/join ", " output-columns))
                               {:expectation expectation-name
                                :column      declared-name
                                :available   (vec output-columns)}))))]
    ;; The warehouse handing back a name that cannot be written as one identifier is rare, but
    ;; comparing the wrong thing silently would be worse than refusing.
    (when-let [reason (transform-testing.compile/unsafe-identifier-reason resolved)]
      (throw (transform-testing.errors/ex
              ::transform-testing.errors/unsafe-identifier
              (tru "Expectation {0}: the output column {1} cannot be compared because {2}."
                   (pr-str expectation-name) (pr-str resolved) reason)
              {:expectation expectation-name :column resolved})))
    resolved))

(defn resolve-columns
  "The output table's own spelling of each column `expectation` declares, in declared order.

  Only the SQL uses these. A failure reports the column under the name the author wrote, which is
  what they can find in their own test."
  [{:keys [name columns]} output-columns]
  (let [output-names (mapv :name output-columns)]
    (mapv #(resolve-column name output-names (:name %)) columns)))

;;; ----------------------------------------------- Types -----------------------------------------------

(defrecord EqualsRows [type name format columns rows]
  expectations.protocol/Expectation
  (probes [this {:keys [driver output-table output-columns]}]
    {:comparison   (assoc (comparison-query driver output-table columns
                                            (resolve-columns this output-columns) rows)
                          :max-rows (inc expectations.report/row-cap))
     :actual-count (assoc (row-count-query driver output-table) :max-rows 1)})

  (interpret [_this results]
    (let [column-names (mapv :name columns)
          ;; A comparison row is the declared columns followed by the signed multiplicity: how many
          ;; times too often the row appears in the output (+) or in the expectation (-).
          diffs        (for [row (:rows (:comparison results))]
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
          actual-count (some-> results :actual-count :rows ffirst long)
          ;; The comparison selects the resolved output columns in declared order, then the delta,
          ;; so dropping the delta lines its column metadata up with what the author declared.
          reported     (mapv (fn [declared {:keys [database_type]}]
                               {:name declared :database_type database_type})
                             column-names
                             (butlast (:columns (:comparison results))))]
      ;; Every key is always present: a consumer should not have to tell nil from [].
      (cond-> {:name            name
               :type            :equals
               :status          (if (and (empty? extra) (empty? missing)) :passed :failed)
               :columns         reported
               :row-counts      {:actual (or actual-count 0) :expected (count rows)}
               :extra-rows      extra
               :missing-rows    missing
               :truncated       (+ extra-dropped missing-dropped)
               :cell-mismatches []}

        (cell-mismatches column-names missing extra)
        (assoc :cell-mismatches (cell-mismatches column-names missing extra))))))

(defn- not-implemented [expectation-name]
  (transform-testing.errors/ex
   ::transform-testing.errors/unsupported-format
   (tru "Expectation {0} compares against a SQL query, which is not implemented yet. Give ''columns'' and ''rows'' instead."
        (pr-str expectation-name))
   {:expectation expectation-name :format :sql}))

(defrecord EqualsSql [type name format sql]
  expectations.protocol/Expectation
  ;; The form is accepted at authoring time and refused when it runs. Refusing it at construction
  ;; would be the friendlier place, but reading is construction here, so it would also make every
  ;; already-stored test of this shape unreadable — including the one upstream's serdes round-trip
  ;; carries. Until the form is implemented, the refusal rides back on the expectation itself,
  ;; naming it, while its siblings still report.
  (probes [_this _context]
    (throw (not-implemented name)))
  (interpret [_this _results]
    (throw (not-implemented name))))

;;; --------------------------------------------- Building ----------------------------------------------

(defn build
  "The record for an already-normalized, already-validated `equals` expectation."
  [{:keys [format] :as m}]
  ;; The linter forbids these constructors everywhere, so that nothing builds an expectation without
  ;; going through the front door. This is the one place they are the right call.
  #_{:clj-kondo/ignore [:discouraged-var]}
  (case format
    ;; A declared `database_type` is not checked here. It is checked where it becomes SQL, in
    ;; `compile/rows-relation` — the same reasoning as the sql form above: reading a stored test is
    ;; construction, so a refusal here would make an already-saved test unreadable rather than
    ;; merely unrunnable.
    :rows (->EqualsRows :equals (:name m) :rows (:columns m) (:rows m))
    :sql  (->EqualsSql :equals (:name m) :sql (:sql m))))
