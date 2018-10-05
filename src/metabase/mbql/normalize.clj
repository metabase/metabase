(ns metabase.mbql.normalize
  "Logic for taking any sort of weird MBQL query and normalizing it into a standardized, canonical form. You can think
  of this like taking any 'valid' MBQL query and rewriting it as-if it was written in perfect up-to-date MBQL in the
  latest version. There are two main things done here, done as three separate steps:

  #### NORMALIZING TOKENS

  Converting all identifiers to lower-case, lisp-case keywords. e.g. `{\"SOURCE_TABLE\" 10}` becomes `{:source-table
  10}`.

  #### CANONICALIZING THE QUERY

  Rewriting deprecated MBQL 95 syntax and other things that are still supported for backwards-compatibility in
  canonical MBQL 98 syntax. For example `{:breakout [:count 10]}` becomes `{:breakout [[:count [:field-id 10]]]}`.

  #### REMOVING EMPTY CLAUSES

  Removing empty clauses like `{:aggregation nil}` or `{:breakout []}`.

  Token normalization occurs first, followed by canonicalization, followed by removing empty clauses."
  (:require [clojure.walk :as walk]
            [medley.core :as m]
            [metabase.mbql.util :as mbql.u]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]))

(defn- mbql-clause?
  "True if `x` is an MBQL clause (a sequence with a token as its first arg). (This is different from the implementation
  in `mbql.u` because it also supports un-normalized clauses. You shouldn't need to use this outside of this
  namespace.)"
  [x]
  (and (sequential? x)
       ((some-fn keyword? string?) (first x))))

(defn is-clause?
  "If `x` an MBQL clause, and an instance of clauses defined by keyword(s) `k-or-ks`?

    (is-clause? :count [:count 10])        ; -> true
    (is-clause? #{:+ :- :* :/} [:+ 10 20]) ; -> true

  (This is different from the implementation in `mbql.u` because it also supports un-normalized clauses. You shouldn't
  need to use this outside of this namespace.)"
  [k-or-ks x]
  (and
   (mbql-clause? x)
   (let [clause-name (mbql.u/normalize-token (first x))]
     (if (coll? k-or-ks)
       ((set k-or-ks) clause-name)
       (= k-or-ks clause-name)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                NORMALIZE TOKENS                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(declare normalize-tokens)

(defn- normalize-expression-ref-tokens
  "For expression references (`[:expression \"my_expression\"]`) keep the arg as is but make sure it is a string."
  [_ expression-name]
  [:expression (if (keyword? expression-name)
                 (u/keyword->qualified-name expression-name)
                 expression-name)])

(defn- normalize-binning-strategy-tokens
  "For `:binning-strategy` clauses (which wrap other Field clauses) normalize the strategy-name and recursively
  normalize the Field it bins."
  ([_ field strategy-name]
   [:binning-strategy (normalize-tokens field :ignore-path) (mbql.u/normalize-token strategy-name)])
  ([_ field strategy-name strategy-param]
   (conj (normalize-binning-strategy-tokens nil field strategy-name)
         strategy-param)))

(defn- normalize-field-literal-tokens
  "Similarly, for Field literals, keep the arg as-is, but make sure it is a string."
  [_ field-name field-type]
  [:field-literal
   (if (keyword? field-name)
     (u/keyword->qualified-name field-name)
     field-name)
   (keyword field-type)])

(defn- normalize-datetime-field-tokens
  "Datetime fields look like `[:datetime-field <field> <unit>]` or `[:datetime-field <field> :as <unit>]`; normalize the
  unit, and `:as` (if present) tokens, and the Field."
  ([_ field unit]
   [:datetime-field (normalize-tokens field :ignore-path) (mbql.u/normalize-token unit)])
  ([_ field _ unit]
   [:datetime-field (normalize-tokens field :ignore-path) :as (mbql.u/normalize-token unit)]))

(defn- normalize-time-interval-tokens
  "`time-interval`'s `unit` should get normalized, and `amount` if it's not an integer."
  ([_ field amount unit]
   [:time-interval
    (normalize-tokens field :ignore-path)
    (if (integer? amount)
      amount
      (mbql.u/normalize-token amount))
    (mbql.u/normalize-token unit)])
  ([_ field amount unit options]
   (conj (normalize-time-interval-tokens nil field amount unit) (normalize-tokens options :ignore-path))))

(defn- normalize-relative-datetime-tokens
  "Normalize a `relative-datetime` clause. `relative-datetime` comes in two flavors:

     [:relative-datetime :current]
     [:relative-datetime -10 :day] ; amount & unit"
  ([_ _]
   [:relative-datetime :current])
  ([_ amount unit]
   [:relative-datetime amount (mbql.u/normalize-token unit)]))

(def ^:private mbql-clause->special-token-normalization-fn
  "Special fns to handle token normalization for different MBQL clauses."
  {:expression        normalize-expression-ref-tokens
   :field-literal     normalize-field-literal-tokens
   :datetime-field    normalize-datetime-field-tokens
   :binning-strategy  normalize-binning-strategy-tokens
   :time-interval     normalize-time-interval-tokens
   :relative-datetime normalize-relative-datetime-tokens})

(defn- normalize-mbql-clause-tokens
  "MBQL clauses by default get just the clause name normalized (e.g. `[\"COUNT\" ...]` becomes `[:count ...]`) and the
  args are left as-is. If we need to do something special on top of that implement a fn in
  `mbql-clause->special-token-normalization-fn` above to handle the special normalization rules"
  [[clause-name & args]]
  (let [clause-name (mbql.u/normalize-token clause-name)]
    (if-let [f (mbql-clause->special-token-normalization-fn clause-name)]
      (apply f clause-name args)
      (vec (cons clause-name (map #(normalize-tokens % :ignore-path) args))))))


(defn- aggregation-subclause? [x]
  (or (when ((some-fn keyword? string?) x)
        (#{:avg :count :cum-count :distinct :stddev :sum :min :max :+ :- :/ :*} (mbql.u/normalize-token x)))
      (when (mbql-clause? x)
        (aggregation-subclause? (first x)))))

(defn- normalize-ag-clause-tokens
  "For old-style aggregations like `{:aggregation :count}` make sure we normalize the ag type (`:count`). Other wacky
  clauses like `{:aggregation [:count :count]}` need to be handled as well :("
  [ag-clause]
  (cond
    ;; something like {:aggregations :count}
    ((some-fn keyword? string?) ag-clause)
    (mbql.u/normalize-token ag-clause)

    ;; named aggregation ([:named <ag> <name>])
    (is-clause? :named ag-clause)
    (let [[_ ag ag-name] ag-clause]
      [:named (normalize-ag-clause-tokens ag) ag-name])

    ;; something wack like {:aggregations [:count [:sum 10]]} or {:aggregations [:count :count]}
    (when (mbql-clause? ag-clause)
      (aggregation-subclause? (second ag-clause)))
    (mapv normalize-ag-clause-tokens ag-clause)

    :else
    (normalize-tokens ag-clause :ignore-path)))

(defn- normalize-expressions-tokens
  "For expressions, we don't want to normalize the name of the expression; keep that as is, but make it a keyword;
   normalize the definitions as normal."
  [expressions-clause]
  (into {} (for [[expression-name definition] expressions-clause]
             [(keyword expression-name)
              (normalize-tokens definition :ignore-path)])))

(defn- normalize-order-by-tokens
  "Normalize tokens in the order-by clause, which can have different syntax when using MBQL 95 or 98
  rules (`[<field> :asc]` vs `[:asc <field>]`, for example)."
  [clauses]
  (vec (for [subclause clauses]
         (if (mbql-clause? subclause)
           ;; MBQL 98 [direction field] style: normalize as normal
           (normalize-mbql-clause-tokens subclause)
           ;; otherwise it's MBQL 95 [field direction] style: flip the args and *then* normalize the clause. And then
           ;; flip it back to put it back the way we found it.
           (reverse (normalize-mbql-clause-tokens (reverse subclause)))))))

(defn- normalize-template-tags
  "Normalize native-query template tags. Like `expressions` we want to preserve the original name rather than normalize
  it."
  [template-tags]
  (into {} (for [[tag-name tag-def] template-tags]
             [(u/keyword->qualified-name tag-name)
              (let [tag-def (-> (normalize-tokens tag-def :ignore-path)
                                (update :type mbql.u/normalize-token))]
                (cond-> tag-def
                  (:widget-type tag-def) (update :widget-type #(when % (mbql.u/normalize-token %)))))])))

(defn- normalize-query-parameter [param]
  (-> param
      (update :type mbql.u/normalize-token)
      (update :target #(normalize-tokens % :ignore-path))))

(defn- normalize-source-query [{native? :native, :as source-query}]
  (normalize-tokens source-query [(if native? :native :query)]))

(defn- normalize-source-metadata [metadata]
  (-> metadata
      (update :base_type    keyword)
      (update :special_type keyword)
      (update :fingerprint  walk/keywordize-keys )))

(def ^:private path->special-token-normalization-fn
  "Map of special functions that should be used to perform token normalization for a given path. For example, the
  `:expressions` key in an MBQL query should preserve the case of the expression names; this custom behavior is
  defined below."
  {:type            mbql.u/normalize-token
   ;; don't normalize native queries
   :native          {:query         identity
                     :template-tags normalize-template-tags}
   :query           {:aggregation  normalize-ag-clause-tokens
                     :expressions  normalize-expressions-tokens
                     :order-by     normalize-order-by-tokens
                     :source-query normalize-source-query}
   :parameters      {::sequence normalize-query-parameter}
   :context         #(some-> % mbql.u/normalize-token)
   :source-metadata {::sequence normalize-source-metadata}})

(defn normalize-tokens
  "Recursively normalize tokens in `x`.

  Every time this function recurses (thru a map value) it adds a new (normalized) key to key path, e.g. `path` will be
  `[:query :order-by]` when we're in the MBQL order-by clause. If we need to handle these top-level clauses in special
  ways add a function to `path->special-token-normalization-fn` above.

  In some cases, dealing with the path isn't desirable, but we don't want to accidentally trigger normalization
  functions (such as accidentally normalizing the `:type` key in something other than the top-level of the query), so
  by convention please pass `:ignore-path` to avoid accidentally triggering path functions."
  [x & [path]]
  (let [path       (if (keyword? path)
                     [path]
                     (vec path))
        special-fn (when (seq path)
                     (get-in path->special-token-normalization-fn path))]
    (cond
      (fn? special-fn)
      (special-fn x)

      ;; Skip record types because this query is an `expanded` query, which is not going to play nice here. Hopefully we
      ;; can remove expanded queries entirely soon.
      (record? x)
      x

      ;; maps should just get the keys normalized and then recursively call normalize-tokens on the values.
      ;; Each recursive call appends to the keypath above so we can handle top-level clauses in a special way if needed
      (map? x)
      (into {} (for [[k v] x
                     :let  [k (mbql.u/normalize-token k)]]
                 [k (normalize-tokens v (conj (vec path) k))]))

      ;; MBQL clauses handled above because of special cases
      (mbql-clause? x)
      (normalize-mbql-clause-tokens x)

      ;; for non-mbql sequential collections (probably something like the subclauses of :order-by or something like
      ;; that) recurse on all the args.
      ;;
      ;; To signify that we're recursing into a sequential collection, this appends `::sequence` to path
      (sequential? x)
      (mapv #(normalize-tokens % (conj (vec path) ::sequence)) x)

      :else
      x)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  CANONICALIZE                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(declare canonicalize-mbql-clauses)

(defn- wrap-implicit-field-id
  "Wrap raw integer Field IDs (i.e., those in an implicit 'field' position) in a `:field-id` clause if they're not
  already. Done for MBQL 95 backwards-compatibility. e.g.:

    {:filter [:= 10 20]} ; -> {:filter [:= [:field-id 10] 20]}"
  [field]
  (if (integer? field)
    [:field-id field]
    field))

(defn- canonicalize-aggregation-subclause
  "Remove `:rows` type aggregation (long-since deprecated; simpliy means no aggregation) if present, and wrap
  `:field-ids` where appropriate."
  [[ag-type :as ag-subclause]]
  (cond
    (= ag-type :rows)
    nil

    ;; For named aggregations (`[:named <ag> <name>]`) we want to leave as-is an just canonicalize the ag it names
    (= ag-type :named)
    (let [[_ ag ag-name] ag-subclause]
      [:named (canonicalize-aggregation-subclause ag) ag-name])

    (#{:+ :- :* :/} ag-type)
    (vec
     (cons
      ag-type
      ;; if args are also ag subclauses normalize those, but things like numbers are allowed too so leave them as-is
      (for [arg (rest ag-subclause)]
        (cond-> arg
          (mbql-clause? arg) canonicalize-aggregation-subclause))))

    ;; for metric macros (e.g. [:metric <metric-id>]) do not wrap the metric in a :field-id clause
    (= :metric ag-type)
    ag-subclause

    ;; something with an arg like [:sum [:field-id 41]]
    (second ag-subclause)
    (let [[_ field] ag-subclause]
      [ag-type (wrap-implicit-field-id field)])

    :else
    ag-subclause))

(defn- wrap-single-aggregations
  "Convert old MBQL 95 single-aggregations like `{:aggregation :count}` or `{:aggregation [:count]}` to MBQL 98
  multiple-aggregation syntax (e.g. `{:aggregation [[:count]]}`)."
  [aggregations]
  (cond
    ;; something like {:aggregations :count} -- MBQL 95 single aggregation
    (keyword? aggregations)
    [[aggregations]]

    ;; special-case: MBQL 98 multiple aggregations using unwrapped :count or :rows
    ;; e.g. {:aggregations [:count [:sum 10]]} or {:aggregations [:count :count]}
    (and (mbql-clause? aggregations)
         (aggregation-subclause? (second aggregations))
         (not (is-clause? #{:named :+ :- :* :/} aggregations)))
    (reduce concat (map wrap-single-aggregations aggregations))

    ;; something like {:aggregations [:sum 10]} -- MBQL 95 single aggregation
    (mbql-clause? aggregations)
    [(vec aggregations)]

    :else
    (vec aggregations)))

(defn- canonicalize-aggregations
  "Canonicalize subclauses (see above) and make sure `:aggregation` is a sequence of clauses instead of a single
  clause."
  [aggregations]
  (->> (wrap-single-aggregations aggregations)
       (map canonicalize-aggregation-subclause)
       (filterv identity)))

(defn- canonicalize-filter [[filter-name & args, :as filter-clause]]
  (cond
    ;; for other `and`/`or`/`not` compound filters, recurse on the arg(s), then simplify the whole thing
    (#{:and :or :not} filter-name)
    (mbql.u/simplify-compound-filter (vec (cons
                                           filter-name
                                           ;; we need to canonicalize any other mbql clauses that might show up in
                                           ;; args like datetime-field here because simplify-compund-filter validates
                                           ;; its output :(
                                           (map (comp canonicalize-mbql-clauses canonicalize-filter)
                                                args))))

    ;; string filters should get the string implict filter options added if not specified explicitly
    (#{:starts-with :ends-with :contains :does-not-contain} filter-name)
    (let [[field arg options] args]
      (cond-> [filter-name (wrap-implicit-field-id field) arg]
        (seq options) (conj options)))

    (= :inside filter-name)
    (let [[field-1 field-2 & coordinates] args]
      (vec
       (concat
        [:inside (wrap-implicit-field-id field-1) (wrap-implicit-field-id field-2)]
        coordinates)))

    ;; all the other filter types have an implict field ID for the first arg
    ;; (e.g. [:= 10 20] gets canonicalized to [:= [:field-id 10] 20]
    (#{:= :!= :< :<= :> :>= :is-null :not-null :between :inside :time-interval} filter-name)
    (apply vector filter-name (wrap-implicit-field-id (first args)) (rest args))

    ;; don't wrap segment IDs in `:field-id`
    (= filter-name :segment)
    filter-clause

    :else
    (throw (IllegalArgumentException. (str (tru "Illegal filter clause: {0}" filter-clause))))))

(defn- canonicalize-order-by
  "Make sure order by clauses like `[:asc 10]` get `:field-id` added where appropriate, e.g. `[:asc [:field-id 10]]`"
  [order-by-clause]
  (vec (for [subclause order-by-clause
             :let      [[direction field-id] (if (#{:asc :desc :ascending :descending} (first subclause))
                                               ;; normal [<direction> <field>] clause
                                               subclause
                                               ;; MBQL 95 reversed [<field> <direction>] clause
                                               (reverse subclause))]]
         [(case direction
            :asc        :asc
            :desc       :desc
            ;; old MBQL 95 names
            :ascending  :asc
            :descending :desc)
          (wrap-implicit-field-id field-id)])))

(declare canonicalize-inner-mbql-query)

(defn- canonicalize-source-query [{native? :native, :as source-query}]
  (cond-> source-query
    (not native?) canonicalize-inner-mbql-query))

(defn- non-empty? [x]
  (if (coll? x)
    (seq x)
    (some? x)))

(defn- canonicalize-top-level-mbql-clauses
  "Perform specific steps to canonicalize the various top-level clauses in an MBQL query."
  [mbql-query]
  (cond-> mbql-query
    (non-empty? (:aggregation  mbql-query)) (update :aggregation  canonicalize-aggregations)
    (non-empty? (:breakout     mbql-query)) (update :breakout     (partial mapv wrap-implicit-field-id))
    (non-empty? (:fields       mbql-query)) (update :fields       (partial mapv wrap-implicit-field-id))
    (non-empty? (:filter       mbql-query)) (update :filter       canonicalize-filter)
    (non-empty? (:order-by     mbql-query)) (update :order-by     canonicalize-order-by)
    (non-empty? (:source-query mbql-query)) (update :source-query canonicalize-source-query)))


(def ^:private mbql-clause->canonicalization-fn
  {:fk->
   (fn [_ field-1 field-2]
     [:fk-> (wrap-implicit-field-id field-1) (wrap-implicit-field-id field-2)])

   :datetime-field
   (fn
     ([_ field unit]
      [:datetime-field (wrap-implicit-field-id field) unit])
     ([_ field _ unit]
      [:datetime-field (wrap-implicit-field-id field) unit]))

   :field-id
   (fn [_ id]
     ;; if someone is dumb and does something like [:field-id [:field-literal ...]] be nice and fix it for them.
     (if (mbql-clause? id)
       id
       [:field-id id]))

   :binning-strategy
   (fn canonicalize-binning-strategy
     ([_ field strategy-name]
      [:binning-strategy (wrap-implicit-field-id field) strategy-name])
     ([_ field strategy-name strategy-param]
      (conj (canonicalize-binning-strategy nil field strategy-name) strategy-param)))})

(defn- canonicalize-mbql-clauses
  "Walk an `mbql-query` an canonicalize non-top-level clauses like `:fk->`."
  [mbql-query]
  (walk/prewalk
   (fn [clause]
     (if-not (mbql-clause? clause)
       clause
       (let [[clause-name & args] clause
             f                    (mbql-clause->canonicalization-fn clause-name)]
         (if f
           (apply f clause)
           clause))))
   mbql-query))

(def ^:private ^{:arglists '([query])} canonicalize-inner-mbql-query
  (comp canonicalize-mbql-clauses canonicalize-top-level-mbql-clauses))

(defn- canonicalize
  "Canonicalize a query [MBQL query], rewriting the query as if you perfectly followed the recommended style guides for
  writing MBQL. Does things like removes unneeded and empty clauses, converts older MBQL '95 syntax to MBQL '98, etc."
  [outer-query]
  (cond-> outer-query
    (:query outer-query)      (update :query canonicalize-inner-mbql-query)
    (:parameters outer-query) (update :parameters (partial mapv canonicalize-mbql-clauses))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             REMOVING EMPTY CLAUSES                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO - can't we combine these functions into a single fn?

(defn- non-empty-value?
  "Is this 'value' in a query map considered non-empty (e.g., should we refrain from removing that key entirely?) e.g.:

    {:aggregation nil} ; -> remove this, value is nil
    {:filter []}       ; -> remove this, also empty
    {:limit 100}       ; -> keep this"
  [x]
  (cond
    ;; record types could be something like `driver` and should always be considered non-empty
    (record? x)
    true

    (map? x)
    (seq x)

    ;; a sequence is considered non-empty if it has some non-nil values
    (sequential? x)
    (and (seq x)
         (some some? x))

    ;; any other value is considered non-empty if it is not nil
    :else
    (some? x)))

(defn- remove-empty-clauses
  "Remove any empty or `nil` clauses in a query."
  [query]
  (walk/postwalk
   (fn [x]
     (cond
       ;; TODO - we can remove this part once we take out the `expand` namespace. This is here just to prevent
       ;; double-expansion from barfing
       (record? x)
       x

       (map? x)
       (m/filter-vals non-empty-value? x)

       :else
       x))
   query))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUTTING IT ALL TOGETHER                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO - should have this validate against the MBQL schema afterwards, right? Maybe once we get closer to making this
;; all mergable
(def ^{:arglists '([outer-query])} normalize
  "Normalize the tokens in a Metabase query (i.e., make them all `lisp-case` keywords), rewrite deprecated clauses as
  up-to-date MBQL 98, and remove empty clauses."
  (comp remove-empty-clauses
        canonicalize
        normalize-tokens))

(defn normalize-fragment
  "Normalize just a specific fragment of a query, such as just the inner MBQL part or just a filter clause. `path` is
  where this fragment would normally live in a full query.

    (normalize-fragment [:query :filter] [\"=\" 100 200])
    ;;-> [:= [:field-id 100] 200]"
  [path x]
  (if-not (seq path)
    (normalize x)
    (get (normalize-fragment (butlast path) {(last path) x}) (last path))))
