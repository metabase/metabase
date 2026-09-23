(ns mage.cljts.rules.sql
  "Toucan 2 calls and HoneySQL maps, shown as the SQL they produce:

      (t2/select-one :model/Card :id id :archived false)
      =>  t2.selectOne(Card, sql`SELECT * FROM report_card WHERE (id = ${id}) AND (archived = FALSE)`)

  The HoneySQL data is rebuilt from the source, with every non-literal part (locals, function calls) swapped for a
  `${...}` placeholder showing the translated expression, then formatted with HoneySQL itself. Anything HoneySQL
  can't format falls back to the plain object/array rendering."
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [mage.cljts.doc :as d]
   [mage.cljts.models :as models]
   [mage.cljts.names :as names]
   [mage.cljts.parse :as p]
   [mage.cljts.rules.core :as rc]
   [mage.cljts.translate :as t]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Source -> HoneySQL data ------------------------------------

(sql/register-fn! ::only-if
                  (fn [_ [condition clause]]
                    (let [[s & params] (sql/format-expr clause)]
                      (into [(str "(" s " /* only if " condition " */)")] params))))

(def ^:dynamic ^:private *placeholders*
  "Atom of placeholder-id -> `${expr}` text, while building one query."
  nil)

(defn- placeholder
  "An identifier token standing in for a non-literal expression; replaced by `${expr}` after formatting."
  [ctx node]
  (let [text (str "${" (d/flat-string (t/expr (t/xctx ctx) node)) "}")
        id   (str "ph__" (count @*placeholders*) "__")]
    (swap! *placeholders* assoc id text)
    (keyword id)))

(defn- fill-placeholders [^String s]
  (reduce (fn [^String s [id text]] (str/replace s id text)) s @*placeholders*))

(defn- model-table
  "Table name keyword for a model keyword node, or nil."
  [ctx node]
  (when-let [m (t/model-name ctx node)]
    (keyword (or (models/table-for m) (str/lower-case m)))))

(defn hsql-data
  "Rebuild HoneySQL data from source `node`, with placeholders for non-literal parts."
  [ctx node]
  (let [node* (p/unwrap-meta node)]
    (cond
      (p/keyword-node? node*) (or (model-table ctx node*) (keyword (t/keyword-string ctx node*)))
      (p/string-node? node*)  (p/string-value node*)
      (and (= :token (p/tag node*)) (not (p/symbol-node? node*))) (p/token-value node*)
      (p/vector-node? node*)  (mapv #(hsql-data ctx %) (p/forms node*))
      (p/map-node? node*)     (into {} (for [[k v] (partition 2 (p/forms node*))]
                                         [(hsql-data ctx k) (hsql-data ctx v)]))
      (t/head-is? ctx node* '#{clojure.core/when})
      (let [[_ c clause & more] (p/forms node*)]
        (if (and clause (empty? more))
          [::only-if (d/flat-string (t/expr (t/xctx ctx) c)) (hsql-data ctx clause)]
          (placeholder ctx node*)))
      :else                   (placeholder ctx node*))))

(defn- literal-value
  "A kv-condition value for Toucan: keywords are values (Toucan transforms them to strings), not columns."
  [ctx node]
  (let [node* (p/unwrap-meta node)]
    (if (and (p/keyword-node? node*) (not (t/model-name ctx node*)))
      (t/keyword-string ctx node*)
      (hsql-data ctx node))))

(def ^:private condition-ops
  #{:in :not-in := :not= :<> :< :> :<= :>= :like :ilike :not-like :between :is :is-not})

(defn- kv-condition [ctx k-node v-node]
  (let [col (keyword (t/keyword-string ctx k-node))
        v*  (p/unwrap-meta v-node)]
    (if (and (p/vector-node? v*) (p/keyword-node? (first (p/forms v*)))
             (condition-ops (:k (first (p/forms v*)))))
      (let [[op & more] (p/forms v*)]
        (into [(:k op) col] (map #(literal-value ctx %) more)))
      [:= col (literal-value ctx v-node)])))

(defn- split-top-level
  "Split `s` on `sep` where not inside parentheses or quotes."
  [^String s ^String sep]
  (loop [i 0, depth 0, quote? false, start 0, acc []]
    (if (>= i (count s))
      (conj acc (subs s start))
      (let [c (.charAt s i)]
        (cond
          (= c \')                     (recur (inc i) depth (not quote?) start acc)
          quote?                       (recur (inc i) depth quote? start acc)
          (= c \()                     (recur (inc i) (inc depth) quote? start acc)
          (= c \))                     (recur (inc i) (dec depth) quote? start acc)
          (and (zero? depth) (.startsWith s sep i))
          (recur (+ i (count sep)) depth quote? (+ i (count sep)) (conj acc (subs s start i)))
          :else                        (recur (inc i) depth quote? start acc))))))

(defn- wrap-line
  "Break an over-long SELECT (at commas) or WHERE (at ANDs) line."
  [^String line]
  (cond
    (<= (count line) 90) [line]

    (str/starts-with? line "SELECT ")
    (let [[kw rest-s] [(re-find #"^SELECT (?:DISTINCT )?" line) (str/replace-first line #"^SELECT (?:DISTINCT )?" "")]
          cols (split-top-level rest-s ", ")]
      (if (< (count cols) 2)
        [line]
        (cons (str/trimr kw) (map-indexed (fn [i c] (str "  " c (when (< i (dec (count cols))) ","))) cols))))

    (str/starts-with? line "WHERE ")
    (let [conds (split-top-level (subs line 6) " AND ")]
      (if (< (count conds) 2)
        [line]
        (cons (str "WHERE " (first conds)) (map #(str "  AND " %) (rest conds)))))

    :else [line]))

(defn- format-sql
  "Format HoneySQL data to SQL lines (pretty, values inlined), or nil if HoneySQL can't."
  [data]
  (try
    (let [[s] (sql/format data {:inline true :pretty true})]
      (->> (str/split-lines (fill-placeholders (str/trim s)))
           (mapcat wrap-line)
           vec))
    (catch Exception _ nil)))

(defn sql-doc
  "A ``sql`...` `` template doc for SQL lines: one line when short, otherwise indented on its own lines."
  [lines]
  (let [one-line (str/join " " (map str/trim lines))]
    (if (<= (count one-line) 80)
      (str "sql`" one-line "`")
      ["sql`" [:nest 2 [:hardline (d/lines lines)]] :hardline "`"])))

;;; ------------------------------------------------ Toucan calls ------------------------------------------------

(defn- parse-toucan-args
  "Split Toucan args after the model into {:pk node, :conditions [...hsql], :query-map node}."
  [ctx args]
  (let [[args query-map] (if (and (seq args) (p/map-node? (p/unwrap-meta (last args))))
                           [(butlast args) (last args)]
                           [args nil])
        [pk args] (if (odd? (count args)) [(first args) (rest args)] [nil args])]
    (when (every? #(p/keyword-node? (p/unwrap-meta (first %))) (partition 2 args))
      {:pk         pk
       :conditions (vec (concat (when pk [[:= :id (hsql-data ctx pk)]])
                                (for [[k v] (partition 2 args)] (kv-condition ctx (p/unwrap-meta k) v))))
       :query-map  (some->> query-map (hsql-data ctx))})))

(defn- model-parts
  "{:model \"Card\" :table :report_card :columns [...]} for a model argument, or nil for unknown shapes."
  [ctx node]
  (let [node* (p/unwrap-meta node)]
    (cond
      (t/model-name ctx node*)
      {:model (t/model-name ctx node*) :table (model-table ctx node*)}

      (and (p/vector-node? node*) (t/model-name ctx (first (p/forms node*))))
      (let [[m & cols] (p/forms node*)]
        {:model (t/model-name ctx m) :table (model-table ctx m) :columns (mapv #(hsql-data ctx %) cols)})

      (p/keyword-node? node*)
      {:model (names/js-string (t/keyword-string ctx node*)) :table (keyword (t/keyword-string ctx node*))}

      :else nil)))

(defn- where-clause [conditions query-map]
  (let [all (cond-> conditions (:where query-map) (conj (:where query-map)))]
    (case (count all)
      0 nil
      1 (first all)
      (into [:and] all))))

(defn- select-sql
  [{:keys [table columns]} {:keys [conditions query-map]} select-override]
  (let [where (where-clause conditions query-map)]
    (format-sql (cond-> (merge {:select (or select-override (:select query-map) columns [:*])
                                :from   [table]}
                               (dissoc query-map :where :select))
                  where (assoc :where where)))))

(declare toucan-call*)

(defn- toucan-call
  "Try to render a Toucan call with SQL. `build` gets (model-parts, parsed-args) and returns SQL lines or nil."
  [ctx model-node args render]
  (binding [*placeholders* (atom {})]
    (toucan-call* ctx model-node args render)))

(defn- toucan-call*
  [ctx model-node args render]
  (let [mp     (model-parts ctx model-node)
        parsed (when mp (parse-toucan-args ctx args))]
    (or (when (and mp parsed) (render mp parsed))
        t/decline)))

(defn- t2 [nm] (symbol "toucan2.core" nm))

(defn- t2-call [fname model sql-lines]
  (t/call-docs (str "t2." fname) [model (sql-doc sql-lines)] true))

(doseq [[fname js] [["select" "select"] ["select-one" "selectOne"] ["reducible-select" "reducibleSelect"]
                    ["select-pks-set" "selectPksSet"] ["select-pks-vec" "selectPksVec"]
                    ["select-one-pk" "selectOnePk"]]]
  (t/defexpr (t2 fname)
    (fn [ctx _node [model & args]]
      (toucan-call ctx model args
                   (fn [mp parsed]
                     (when-let [lines (select-sql mp parsed (when (str/includes? fname "pk") [:id]))]
                       (t2-call js (:model mp) lines)))))))

(doseq [[fname wrap] [["select-one-fn" :one] ["select-fn-set" :set] ["select-fn-vec" :vec]
                      ["select-fn->fn" :map] ["select-pk->fn" :map]]]
  (t/defexpr (t2 fname)
    (fn [ctx _node [f model & args]]
      (let [f*  (p/unwrap-meta f)
            col (when (p/keyword-node? f*) (keyword (t/keyword-string ctx f*)))]
        (if (= wrap :map)
          t/decline
          (toucan-call ctx model args
                       (fn [mp parsed]
                         (when-let [lines (select-sql mp parsed (when col [col]))]
                           (let [one? (= wrap :one)
                                 call (t2-call (if one? "selectOne" "select") (:model mp) lines)]
                             (cond
                               (and one? col) [call (names/prop-access (name col) true)]
                               one?           (t/call-docs (rc/fn-arg ctx f) [call])
                               :else          (let [mapped (rc/method-call-doc call "map" [(rc/fn-arg ctx f)])]
                                                (if (= wrap :set) ["new Set(" mapped ")"] mapped))))))))))))

(t/defexpr (t2 "count")
  (fn [ctx _node [model & args]]
    (toucan-call ctx model args
                 (fn [mp parsed]
                   (when-let [lines (select-sql mp parsed [[:%count.*]])]
                     (t2-call "count" (:model mp) lines))))))

(t/defexpr (t2 "exists?")
  (fn [ctx _node [model & args]]
    (toucan-call ctx model args
                 (fn [mp parsed]
                   (when-let [lines (select-sql mp parsed [1])]
                     (t2-call "exists" (:model mp) lines))))))

(t/defexpr (t2 "delete!")
  (fn [ctx _node [model & args]]
    (toucan-call ctx model args
                 (fn [{:keys [table] :as mp} {:keys [conditions query-map]}]
                   (when-let [lines (format-sql (cond-> {:delete-from [table]}
                                                  (where-clause conditions query-map)
                                                  (assoc :where (where-clause conditions query-map))))]
                     (t2-call "delete" (:model mp) lines))))))

(t/defexpr (t2 "update!")
  (fn [ctx _node [model & args]]
    (let [changes (last args)
          conds   (butlast args)
          ;; (t2/update! :model/X {:id 1} {...}) -- a map of conditions
          conds   (if (and (= 1 (count conds)) (p/map-node? (p/unwrap-meta (first conds))))
                    (p/forms (p/unwrap-meta (first conds)))
                    conds)
          changes* (p/unwrap-meta changes)]
      (if-not changes
        t/decline
        (toucan-call ctx model conds
                     (fn [{:keys [table] :as mp} {:keys [conditions]}]
                       (let [literal? (and (p/map-node? changes*)
                                           (every? p/keyword-node? (take-nth 2 (p/forms changes*))))
                             set-map  (if literal?
                                        (into {} (for [[k v] (partition 2 (p/forms changes*))]
                                                   [(keyword (t/keyword-string ctx k)) (literal-value ctx v)]))
                                        {:__changes__ 1})
                             lines    (format-sql (cond-> {:update table :set set-map}
                                                    (seq conditions) (assoc :where (where-clause conditions nil))))
                             lines    (when lines
                                        (mapv #(str/replace % "__changes__ = 1"
                                                            (str "...${" (d/flat-string (t/expr (t/xctx ctx) changes)) "}"))
                                              lines))]
                         (when lines (t2-call "update" (:model mp) lines)))))))))

(defn- honeysql-map? [_ctx node]
  (let [node* (p/unwrap-meta node)]
    (and (p/map-node? node*)
         (let [k (first (p/forms node*))]
           (and (p/keyword-node? k)
                (#{:select :select-distinct :from :update :delete-from :insert-into :with :union :union-all}
                 (:k k)))))))

(defn- query-doc [ctx node]
  (when (honeysql-map? ctx node)
    (binding [*placeholders* (atom {})]
      (some-> (format-sql (hsql-data ctx node)) sql-doc))))

(t/defexpr #{(t2 "query") (t2 "query-one") (t2 "reducible-query") 'metabase.app-db.query/query
             'metabase.app-db.core/query}
  (fn [ctx node [q & more]]
    (if-let [qd (and (empty? more) (query-doc ctx q))]
      (t/call-docs (t/sym-doc ctx (p/sym (first (p/forms node)))) [qd] true)
      t/decline)))

(alter-var-root #'t/*map-literal-hook* (constantly query-doc))
