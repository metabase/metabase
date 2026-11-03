(ns metabase-enterprise.semantic-layer-import.ossie.metric-sql
  "An Ossie metric's SQL aggregate expression as an IR aggregation written as SQL (see `::ir/aggregation.sql`): the
  table it is over, and the SQL with a placeholder standing for each reference to a dataset's field.

  An Ossie metric is SQL over the *fields* of the model's datasets, `SUM(lineitem.net_amount) / COUNT(DISTINCT
  orders.o_orderkey)`, where a field may itself be an expression over the dataset's source columns. The IR holds a
  metric's SQL with its references to the semantic layer's own objects as placeholders, which the resolve stage inlines
  (a dimension's or named expression's `expr`, perhaps through a join), and reads any other identifier as a column of
  the metric's table. So [[aggregation]] has to find every field reference in the metric's SQL and swap a placeholder
  in for it. It parses the SQL with sqlglot ([[metabase.sql-parsing.core/parse-expression]]) to find the column
  references exactly, resolves each to a dataset and a field (see [[resolve-columns]]), and rewrites the SQL as
  sqlglot renders it, where every identifier is spelled one way, so that the swap is a textual one that cannot miss
  (see [[rewrite]]).

  A metric that spans datasets is over one table in Metabase, and reaches the others through implicit joins, so it
  needs a *base* dataset: the one among those it refers to from which every other is reached through the model's
  many-to-one relationships (see [[base-dataset]]), each other dataset by the shortest path of relationships (see
  [[paths]]), which becomes the reference's path of joins. A dataset-scoped metric's base is its own dataset. An
  aggregate over a field of a joined dataset, the one side of the relationship, would count that dataset's rows once
  per row of the base: `SUM(store.employees)` from `store_sales` sums each store's employees once per sale. The spec's
  own semantics for this are still a proposal (apache/ossie PR 246, the reference strategy of which de-duplicates the
  one side by its key before aggregating), and Metabase's implicit join does not do that, so such an aggregate is
  reported (see [[check-fan-out]]); `MIN`, `MAX` and `COUNT(DISTINCT ...)` give the same answer either way and
  convert, and so does an aggregate whose argument also refers to the base dataset (`SUM(lineitem.qty * part.price)`),
  which is a value per base row.

  What the SQL does beyond its references, an aggregate the import has no equivalent for, a window function, a
  function the SQL converter does not know, is the resolve stage's to report, when it converts the SQL."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase-enterprise.semantic-layer-import.unsupported :as unsupported]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.util.regex Pattern)))

(set! *warn-on-reflection* true)

(mr/def ::field
  "A dataset's field as the metric SQL sees it: what a reference to it is in the IR, a dimension or a named
  expression."
  [:map {:closed true}
   [:name :string]
   [:kind [:enum :dimension :expression]]])

(mr/def ::dataset
  "A dataset as the metric SQL sees it: its fields by name."
  [:map {:closed true}
   [:name   :string]
   [:fields [:map-of :string ::field]]])

(mr/def ::relationship
  "A many-to-one relationship, as the join from `from` to `to` named `name`, which is how a reference's path names
  it."
  [:map {:closed true}
   [:name :string]
   [:from :string]
   [:to   :string]])

(mr/def ::model
  "What a metric's SQL resolves against: the model's datasets by name, and its relationships. Every relationship is
  here, whether or not the IR could make a join of it: a reference through one the import could not make is then
  reported with the join's reason, which says more than that there is no path."
  [:map {:closed true}
   [:datasets      [:map-of :string ::dataset]]
   [:relationships [:sequential ::relationship]]])

(mr/def ::node
  "A node of the tree [[sql-parsing/parse-expression]] returns, see there."
  [:map {:closed true}
   [:class :string]
   [:sql   :string]
   [:args  [:map-of {::mr/deliberately-open true, :description "sqlglot's named children, of any shape"}
            :keyword :any]]
   [:func  {:optional true} :string]])

(mu/defn- parse :- ::node
  "The sqlglot tree of `text`, a metric's SQL, in `dialect`; [[unsupported/throw-reason]] with the parser's diagnostic
  when it does not parse."
  [dialect :- [:maybe :string]
   text    :- :string]
  (try
    (sql-parsing/parse-expression dialect text)
    (catch Exception e
      (if (sql-parsing/parse-error? e)
        (unsupported/throw-reason "could not parse %s: %s" (pr-str text) (sql-parsing/parse-error-message e))
        (throw e)))))

(mu/defn- children :- [:sequential ::node]
  "The child nodes of `node`, in the order of its args."
  [node :- ::node]
  (into []
        (mapcat (fn [arg]
                  (cond
                    (map? arg)        [arg]
                    (sequential? arg) (filter map? arg)
                    :else             [])))
        (vals (:args node))))

(mu/defn- nodes :- [:sequential ::node]
  "`tree` and every node under it, depth first."
  [tree :- ::node]
  (tree-seq map? children tree))

(mr/def ::column
  "A column reference in a metric's SQL: the dataset it qualifies the field with (nil for none), the field, and the
  node's rendering, which is the text [[rewrite]] swaps a placeholder in for."
  [:map {:closed true}
   [:qualifier [:maybe :string]]
   [:name      :string]
   [:sql       :string]])

(mu/defn- column :- [:maybe ::column]
  "The reference the `Column` node `node` is; nil for `t.*`, which is no field. A column qualified by more than a
  dataset (`a.b.c`) is [[unsupported/throw-reason]]: a metric names a dataset and a field, nothing more."
  [{:keys [args] :as node} :- ::node]
  (when (some-> args :this :class (= "Identifier"))
    (when (or (:db args) (:catalog args))
      (unsupported/throw-reason "%s names more than a dataset and a field" (:sql node)))
    {:qualifier (some-> args :table :args :this)
     :name      (-> args :this :args :this)
     :sql       (:sql node)}))

(mu/defn- columns :- [:sequential ::column]
  "Every column reference in `tree`, in order of appearance."
  [tree :- ::node]
  (into []
        (comp (filter #(= "Column" (:class %)))
              (keep column))
        (nodes tree)))

(def ^:private aggregate-classes
  "The sqlglot classes of the aggregate functions, by whether an aggregate of the class is `:safe` over a field of a
  joined dataset, the one side of a relationship, where every value stands once per base row: a minimum or a maximum
  is, and so is a count of distinct values (see [[safe-aggregate?]]); everything else counts each value once per base
  row."
  {"Min"               :safe
   "Max"               :safe
   "Count"             :distinct-only
   "ApproxDistinct"    :safe
   "Sum"               :fan-out
   "Avg"               :fan-out
   "Median"            :fan-out
   "Quantile"          :fan-out
   "PercentileCont"    :fan-out
   "PercentileDisc"    :fan-out
   "ApproxQuantile"    :fan-out
   "Stddev"            :fan-out
   "StddevPop"         :fan-out
   "StddevSamp"        :fan-out
   "Variance"          :fan-out
   "VariancePop"       :fan-out
   "CountIf"           :fan-out
   "ArrayAgg"          :fan-out
   "GroupConcat"       :fan-out
   "AnyValue"          :fan-out
   "Mode"              :fan-out})

(mu/defn- safe-aggregate? :- :boolean
  "Whether the aggregate function `node` gives the same answer over a field of a joined dataset whether or not that
  dataset's rows are counted once per base row (see [[aggregate-classes]])."
  [{:keys [class args]} :- ::node]
  (case (get aggregate-classes class)
    :safe          true
    :distinct-only (= "Distinct" (some-> args :this :class))
    false))

(mr/def ::aggregated
  "An aggregate function node and the column references that are the value it aggregates: the ones in its argument
  outside any condition (a `CASE`'s `WHEN`, a `FILTER (WHERE ...)`), where a reference is a row's value rather than a
  test on it."
  [:map {:closed true}
   [:aggregate ::node]
   [:columns   [:sequential ::column]]])

(mr/def ::aggregated-column
  "One column reference and the aggregate function it is the value of."
  [:map {:closed true}
   [:aggregate ::node]
   [:column    ::column]])

(mu/defn- aggregated-pairs :- [:sequential ::aggregated-column]
  "The column references under `node` that an aggregate function takes the value of, each with the aggregate.
  `aggregate` is the innermost aggregate function `node` sits in, and `condition?` whether it sits where a boolean is
  tested rather than a value taken."
  [{:keys [class args] :as node} :- ::node
   aggregate                     :- [:maybe ::node]
   condition?                    :- :boolean]
  (let [aggregate (if (contains? aggregate-classes class) node aggregate)
        walk      (fn [child condition?]
                    (cond
                      (map? child)        (aggregated-pairs child aggregate condition?)
                      (sequential? child) (mapcat #(aggregated-pairs % aggregate condition?) (filter map? child))
                      :else               []))]
    (case class
      "Column" (if (and aggregate (not condition?))
                 (when-let [found (column node)]
                   [{:aggregate aggregate, :column found}])
                 [])
      ;; a `WHEN`'s test is a condition, its `THEN` a value
      "If"     (concat (walk (:this args) true)
                       (walk (:true args) condition?)
                       (walk (:false args) condition?))
      ;; `agg(x) FILTER (WHERE c)`: the aggregate itself, then its condition
      "Filter" (concat (walk (:this args) condition?)
                       (walk (:expression args) true))
      ;; a window's partitioning and ordering are not what its aggregate takes the value of
      "Window" (concat (walk (:this args) condition?)
                       (walk (:partition_by args) true)
                       (walk (:order args) true))
      (mapcat #(walk % condition?) (vals args)))))

(mu/defn- aggregated-columns :- [:sequential ::aggregated]
  "Every aggregate function in `tree` with the columns it aggregates as its value (see `::aggregated` and
  [[aggregated-pairs]])."
  [tree :- ::node]
  (->> (aggregated-pairs tree nil false)
       (group-by :aggregate)
       (mapv (fn [[aggregate found]]
               {:aggregate aggregate, :columns (mapv :column found)}))))

(mr/def ::resolved-column
  "A column reference resolved to the dataset and field it names."
  [:map {:closed true}
   [:column  ::column]
   [:dataset :string]
   [:field   ::field]])

(mu/defn- find-named :- [:maybe [:or ::dataset ::field]]
  "The dataset or field of `by-name` called `the-name`: exactly, or failing that ignoring case, since SQL does not
  mind the case of an unquoted identifier and a writer may spell a dataset or field either way."
  [by-name  :- [:map-of :string [:or ::dataset ::field]]
   the-name :- :string]
  (or (get by-name the-name)
      (some (fn [[k v]]
              (when (= (u/lower-case-en k) (u/lower-case-en the-name))
                v))
            by-name)))

(mu/defn- resolve-column :- ::resolved-column
  "The dataset and field `column` names in `model`. Qualified (`dataset.field`), it is a field of that dataset. Bare, it
  is a field of `scope`, the dataset of a dataset-scoped metric, when there is one; for a model-scoped metric, which
  the spec says has to qualify every field, it is read as the field of the one dataset that declares a field of that
  name, as every converter reads it, and reported when none or several do. [[unsupported/throw-reason]] when the
  dataset or the field does not exist, or when a dataset-scoped metric refers to another dataset."
  [{:keys [datasets]}                       :- ::model
   scope                                    :- [:maybe :string]
   {:keys [qualifier], field-name :name, :as column} :- ::column]
  (let [dataset (cond
                  qualifier
                  (or (find-named datasets qualifier)
                      (unsupported/throw-reason "%s refers to dataset %s, which the model does not have"
                                                (:sql column) (pr-str qualifier)))

                  scope
                  (get datasets scope)

                  :else
                  (let [declaring (filter #(find-named (:fields %) field-name) (vals datasets))]
                    (cond
                      (empty? declaring)
                      (unsupported/throw-reason "no dataset has a field %s" (pr-str field-name))

                      (next declaring)
                      (unsupported/throw-reason (str "%s is a field of more than one dataset (%s); a model-scoped"
                                                     " metric names a field as dataset.field")
                                                (pr-str field-name)
                                                (str/join ", " (sort (map (comp pr-str :name) declaring))))

                      :else
                      (first declaring))))]
    (when (and scope (not= scope (:name dataset)))
      (unsupported/throw-reason (str "%s refers to dataset %s from a metric of dataset %s; a metric that spans"
                                     " datasets is model-scoped")
                                (:sql column) (pr-str (:name dataset)) (pr-str scope)))
    (if-let [field (find-named (:fields dataset) field-name)]
      {:column column, :dataset (:name dataset), :field field}
      (unsupported/throw-reason "dataset %s has no field %s" (pr-str (:name dataset)) (pr-str field-name)))))

(mu/defn- resolve-columns :- [:sequential ::resolved-column]
  "Every column reference in `tree` resolved (see [[resolve-column]])."
  [model :- ::model
   scope :- [:maybe :string]
   tree  :- ::node]
  (mapv #(resolve-column model scope %) (columns tree)))

(mr/def ::path
  "The shortest path of relationship names from a base dataset to another, the empty path for the base itself, or
  `::ambiguous` for a dataset two shortest paths lead to, or that is only reached through one such."
  [:or [:sequential :string] [:= ::ambiguous]])

(mu/defn- reachable :- [:map-of :string ::path]
  "The datasets reached from `start` through `relationships`, each with its `::path`, breadth first so that the first
  path found to a dataset is a shortest one."
  [relationships :- [:sequential ::relationship]
   start         :- :string]
  (loop [frontier [start], found {start []}]
    (if (empty? frontier)
      found
      (let [steps      (for [dataset frontier
                             :let    [path (get found dataset)]
                             {:keys [name to]} (filter #(= dataset (:from %)) relationships)
                             :when   (not (contains? found to))]
                         [to (if (= path ::ambiguous) ::ambiguous (conj path name))])
            next-found (reduce (fn [acc [to path]]
                                 (if (contains? acc to)
                                   ;; reached twice at the same depth: no one shortest path
                                   (assoc acc to ::ambiguous)
                                   (assoc acc to path)))
                               {}
                               steps)]
        (recur (vec (keys next-found)) (merge found next-found))))))

(mu/defn- base-dataset :- :string
  "The dataset a metric over `referenced` datasets is a table of: its own dataset for a dataset-scoped metric
  (`scope`), else the one dataset among `referenced` from which every other is reached through the model's
  relationships (see [[reachable]]). A metric that refers to no dataset (`COUNT(*)`) is over the model's one dataset.
  [[unsupported/throw-reason]] when no dataset reaches all the others, or more than one does."
  [{:keys [datasets relationships]} :- ::model
   scope                            :- [:maybe :string]
   referenced                       :- [:set :string]]
  (cond
    scope
    scope

    (empty? referenced)
    (if (= 1 (count datasets))
      (key (first datasets))
      (unsupported/throw-reason (str "the metric refers to no dataset, and the model has %d; a model-scoped metric"
                                     " names the dataset of every field it aggregates")
                                (count datasets)))

    (= 1 (count referenced))
    (first referenced)

    :else
    (let [candidates (filter (fn [dataset]
                               (every? (set (keys (reachable relationships dataset))) referenced))
                             (sort referenced))]
      (cond
        (empty? candidates)
        (unsupported/throw-reason (str "no dataset among %s reaches the others through the model's relationships;"
                                       " a metric that spans datasets is over the one whose many-to-one"
                                       " relationships lead to every dataset it refers to")
                                  (str/join ", " (map pr-str (sort referenced))))

        (next candidates)
        (unsupported/throw-reason (str "%s each reach the others through the model's relationships, so the metric"
                                       " could be over any of them; a metric that spans datasets needs one dataset"
                                       " on the many side of every relationship it follows")
                                  (str/join ", " (map pr-str candidates)))

        :else
        (first candidates)))))

(mu/defn- paths :- [:map-of :string [:sequential :string]]
  "The path of joins, by relationship name, from `base` to each of `referenced`, the shortest; `base` itself has the
  empty path. [[unsupported/throw-reason]] when two shortest paths lead to a dataset, since nothing says which join is
  meant."
  [{:keys [relationships]} :- ::model
   base                    :- :string
   referenced              :- [:set :string]]
  (let [found (reachable relationships base)]
    (into {}
          (map (fn [dataset]
                 (let [path (get found dataset)]
                   (if (= path ::ambiguous)
                     (unsupported/throw-reason (str "dataset %s is reached from %s by more than one path of the same"
                                                    " length through the model's relationships; nothing says which")
                                               (pr-str dataset) (pr-str base))
                     [dataset path]))))
          referenced)))

(mu/defn- check-fan-out :- :nil
  "[[unsupported/throw-reason]] when an aggregate of `tree` that is not [[safe-aggregate?]] takes its value from a
  field of a joined dataset only (see the namespace docstring): `by-sql` is the resolved reference for each column
  node's rendering."
  [tree   :- ::node
   base   :- :string
   by-sql :- [:map-of :string ::resolved-column]]
  (doseq [{:keys [aggregate columns]} (aggregated-columns tree)
          :when (not (safe-aggregate? aggregate))
          :let  [datasets (into #{} (map (comp :dataset by-sql :sql)) columns)]
          :when (and (seq datasets) (not (contains? datasets base)))
          :let  [{:keys [dataset field]} (by-sql (:sql (first columns)))]]
    (unsupported/throw-reason (str "%s aggregates %s of dataset %s, which %s reaches on the one side of a"
                                   " relationship: each value would count once per %s row, not once; over a joined"
                                   " dataset only MIN, MAX and COUNT(DISTINCT ...) give the same answer either way")
                              (:sql aggregate) (pr-str (:name field)) (pr-str dataset) (pr-str base) (pr-str base))))

(mr/def ::segment
  "A piece of the rendered SQL: `code`, or a string literal, which [[rewrite]] leaves alone."
  [:map {:closed true}
   [:code? :boolean]
   [:text  :string]])

(mu/defn- segments :- [:sequential ::segment]
  "`sql` split into code and string literals, a literal running from a `'` to the next `'` that is not doubled."
  [sql :- :string]
  (loop [remaining sql, acc []]
    (if (empty? remaining)
      acc
      (if-let [literal (re-find #"^'(?:[^']|'')*'" remaining)]
        (recur (subs remaining (count literal)) (conj acc {:code? false, :text literal}))
        ;; an unterminated literal cannot come out of the parser's own rendering; whatever is left is code
        (let [code (or (re-find #"^[^']+" remaining) remaining)]
          (recur (subs remaining (count code)) (conj acc {:code? true, :text code})))))))

(mu/defn- reference-pattern :- (ms/InstanceOfClass Pattern)
  "The pattern that matches the column rendering `sql` where it stands as a whole identifier in code: not inside a
  longer identifier, a quoted one, or a longer dotted name."
  [sql :- :string]
  (re-pattern (str "(?<![\\p{L}\\p{N}_\"`\\]\\.])" (Pattern/quote sql) "(?![\\p{L}\\p{N}_\"`\\[])")))

(mr/def ::rewritten
  "The SQL with placeholders in it, and what each placeholder stood for: the rendering of the column it replaced."
  [:map {:closed true}
   [:sql          :string]
   [:placeholders [:map-of :string :string]]])

(mu/defn- rewrite :- ::rewritten
  "`tree`'s SQL, as sqlglot renders it, with a placeholder identifier in place of every column reference, one
  placeholder per distinct rendering. Each column is swapped in the code between string literals (see [[segments]])
  and nowhere else; the number of swaps has to be the number of times the column occurs in the tree, otherwise the
  text and the tree disagree (a field named like a keyword, say) and the metric is [[unsupported/throw-reason]]
  rather than rewritten wrong."
  [tree :- ::node]
  (let [found        (columns tree)
        occurrences  (frequencies (map :sql found))
        placeholders (into {}
                           (map-indexed (fn [i sql] [sql (format "__ossie_ref_%d__" i)]))
                           (distinct (map :sql found)))
        swapped      (volatile! (zipmap (keys occurrences) (repeat 0)))
        code         (fn [text]
                       (reduce (fn [text [sql placeholder]]
                                 (str/replace text (reference-pattern sql)
                                              (fn [_]
                                                (vswap! swapped update sql inc)
                                                placeholder)))
                               text
                               placeholders))
        sql          (transduce (map (fn [{:keys [code? text]}] (if code? (code text) text)))
                                str
                                (segments (:sql tree)))]
    (doseq [[column-sql expected] occurrences
            :let [actual (get @swapped column-sql)]
            :when (not= expected actual)]
      (unsupported/throw-reason (str "%s occurs %d times in %s but was found %d times as an identifier; the import"
                                     " cannot tell the references apart from the rest of the SQL")
                                column-sql expected (pr-str (:sql tree)) actual))
    {:sql          sql
     :placeholders (into {} (map (fn [[column-sql placeholder]] [placeholder column-sql])) placeholders)}))

(mu/defn- reference :- ::ir/reference
  "The IR reference for `resolved`, a field of a dataset reached from the base by `path`."
  [path                   :- [:sequential :string]
   {:keys [field]}        :- ::resolved-column]
  (case (:kind field)
    :dimension  {:kind :dimension, :path (vec path), :name (:name field), :bucket nil}
    :expression {:kind :expression, :path (vec path), :name (:name field)}))

(mr/def ::aggregation
  "What [[aggregation]] makes of a metric's SQL: the dataset it is over, and the IR aggregation."
  [:map {:closed true}
   [:table       :string]
   [:aggregation ::ir/aggregation.sql]])

(mu/defn aggregation :- ::aggregation
  "The IR aggregation for the metric SQL `text`, parsed in the sqlglot `dialect` (nil for the default), over `model`:
  `scope` is the dataset of a dataset-scoped metric, nil for a model-scoped one. See the namespace docstring for what
  is decided here and what is [[unsupported/throw-reason]]."
  [model   :- ::model
   scope   :- [:maybe :string]
   dialect :- [:maybe :string]
   text    :- :string]
  (let [tree       (parse dialect text)
        resolved   (resolve-columns model scope tree)
        by-sql     (m/index-by (comp :sql :column) resolved)
        referenced (into #{} (map :dataset) resolved)
        base       (base-dataset model scope referenced)
        base-paths (paths model base referenced)]
    (check-fan-out tree base by-sql)
    (let [{:keys [sql placeholders]} (rewrite tree)]
      {:table       base
       :aggregation {:text       text
                     :sql        sql
                     :references (into {}
                                       (map (fn [[placeholder column-sql]]
                                              (let [{:keys [dataset] :as found} (by-sql column-sql)]
                                                [placeholder (reference (get base-paths dataset) found)])))
                                       placeholders)}})))
