(ns metabase.legacy-mbql.normalize
  "Logic for taking any sort of weird MBQL query and normalizing it into a standardized, canonical form. You can think
  of this like taking any 'valid' MBQL query and rewriting it as-if it was written in perfect up-to-date MBQL in the
  latest version. There are four main things done here, done as four separate steps:

  #### NORMALIZING TOKENS

  Converting all identifiers to lower-case, lisp-case keywords. e.g. `{\"SOURCE_TABLE\" 10}` becomes `{:source-table
  10}`.

  #### CANONICALIZING THE QUERY

  Rewriting deprecated MBQL 95/98 syntax and other things that are still supported for backwards-compatibility in
  canonical modern MBQL syntax. For example `{:breakout [:count 10]}` becomes `{:breakout [[:count [:field 10 nil]]]}`.

  #### WHOLE-QUERY TRANSFORMATIONS

  Transformations and cleanup of the query structure as a whole to fix inconsistencies. Whereas the canonicalization
  phase operates on a lower-level, transforming invidual clauses, this phase focuses on transformations that affect
  multiple clauses, such as removing duplicate references to Fields if they are specified in both the `:breakout` and
  `:fields` clauses.

  This is not the only place that does such transformations; several pieces of QP middleware perform similar
  individual transformations, such as `reconcile-breakout-and-order-by-bucketing`.

  #### REMOVING EMPTY CLAUSES

  Removing empty clauses like `{:aggregation nil}` or `{:breakout []}`.

  Token normalization occurs first, followed by canonicalization, followed by removing empty clauses."
  (:require
   [clojure.set :as set]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defn- mbql-clause?
  "True if `x` is an MBQL clause (a sequence with a token as its first arg). (This is different from the implementation
  in `mbql.u` because it also supports un-normalized clauses. You shouldn't need to use this outside of this
  namespace.)"
  [x]
  (and (sequential? x)
       (not (map-entry? x))
       ((some-fn keyword? string?) (first x))))

(defn- maybe-normalize-token
  "Normalize token `x`, but only if it's a keyword or string."
  [x]
  (if ((some-fn keyword? string?) x)
    (mbql.u/normalize-token x)
    x))

(defn is-clause?
  "If `x` an MBQL clause, and an instance of clauses defined by keyword(s) `k-or-ks`?

    (is-clause? :count [:count 10])        ; -> true
    (is-clause? #{:+ :- :* :/} [:+ 10 20]) ; -> true

  (This is different from the implementation in `mbql.u` because it also supports un-normalized clauses. You shouldn't
  need to use this outside of this namespace.)"
  [k-or-ks x]
  (and
   (mbql-clause? x)
   (let [clause-name (maybe-normalize-token (first x))]
     (if (coll? k-or-ks)
       ((set k-or-ks) clause-name)
       (= k-or-ks clause-name)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                NORMALIZE TOKENS                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(declare normalize-tokens)

(defmulti ^:private normalize-mbql-clause-tokens
  (comp maybe-normalize-token first))

(defmethod normalize-mbql-clause-tokens :aggregation
  ;; nil options should be removed from aggregation references (`[:aggregation 0]`).
  [[_ aggregation-index option]]
  (cond-> [:aggregation aggregation-index]
    (some? option) (conj option)))

(defn- normalize-ref-opts [opts]
  (let [opts (normalize-tokens opts :ignore-path)]
    (cond-> opts
      (:base-type opts)      (update :base-type keyword)
      (:effective-type opts) (update :effective-type keyword)
      (:temporal-unit opts)  (update :temporal-unit keyword)
      (:binning opts)        (update :binning (fn [binning]
                                                (cond-> binning
                                                  (:strategy binning) (update :strategy keyword)))))))

(defmethod normalize-mbql-clause-tokens :expression
  ;; For expression references (`[:expression \"my_expression\"]`) keep the arg as is but make sure it is a string.
  [[_ expression-name opts]]
  (let [expression [:expression (if (keyword? expression-name)
                                  (u/qualified-name expression-name)
                                  expression-name)]
        opts (->> opts
                  normalize-ref-opts
                  ;; Only keep fields required for handling binned&datetime expressions (#33528)
                  ;; Allowing added alias-info through here breaks
                  ;; [[metabase.query-processor.util.nest-query-test/nest-expressions-ignore-source-queries-test]]
                  (m/filter-keys #{:base-type :temporal-unit :binning})
                  not-empty)]
    (cond-> expression
      opts (conj opts))))

(defmethod normalize-mbql-clause-tokens :binning-strategy
  ;; For `:binning-strategy` clauses (which wrap other Field clauses) normalize the strategy-name and recursively
  ;; normalize the Field it bins.
  [[_ field strategy-name strategy-param]]
  (if strategy-param
    (conj (normalize-mbql-clause-tokens [:binning-strategy field strategy-name]) strategy-param)
    [:binning-strategy (normalize-tokens field :ignore-path) (maybe-normalize-token strategy-name)]))

(defmethod normalize-mbql-clause-tokens :field
  [[_ id-or-name opts]]
  [:field
   id-or-name
   (normalize-ref-opts opts)])

(defmethod normalize-mbql-clause-tokens :field-literal
  ;; Similarly, for Field literals, keep the arg as-is, but make sure it is a string."
  [[_ field-name field-type]]
  [:field-literal
   (if (keyword? field-name)
     (u/qualified-name field-name)
     field-name)
   (keyword field-type)])

(defmethod normalize-mbql-clause-tokens :datetime-field
  ;; Datetime fields look like `[:datetime-field <field> <unit>]` or `[:datetime-field <field> :as <unit>]`
  ;; normalize the unit, and `:as` (if present) tokens, and the Field."
  [[_ field as-or-unit maybe-unit]]
  (if maybe-unit
    [:datetime-field (normalize-tokens field :ignore-path) :as (maybe-normalize-token maybe-unit)]
    [:datetime-field (normalize-tokens field :ignore-path) (maybe-normalize-token as-or-unit)]))

(defmethod normalize-mbql-clause-tokens :time-interval
  ;; `time-interval`'s `unit` should get normalized, and `amount` if it's not an integer."
  [[_ field amount unit options]]
  (if options
    (conj (normalize-mbql-clause-tokens [:time-interval field amount unit])
          (normalize-tokens options :ignore-path))
    [:time-interval
     (normalize-tokens field :ignore-path)
     (if (integer? amount)
       amount
       (maybe-normalize-token amount))
     (maybe-normalize-token unit)]))

(defmethod normalize-mbql-clause-tokens :relative-time-interval
  [[_ col & [_value _bucket _offset-value _offset-bucket :as args]]]
  (into [:relative-time-interval (normalize-tokens col :ignore-path)]
        (map maybe-normalize-token)
        args))

(defmethod normalize-mbql-clause-tokens :relative-datetime
  ;; Normalize a `relative-datetime` clause. `relative-datetime` comes in two flavors:
  ;;
  ;;   [:relative-datetime :current]
  ;;   [:relative-datetime -10 :day] ; amount & unit"
  [[_ amount unit]]
  (if unit
    [:relative-datetime amount (maybe-normalize-token unit)]
    [:relative-datetime :current]))

(defmethod normalize-mbql-clause-tokens :interval
  [[_ amount unit]]
  [:interval amount (maybe-normalize-token unit)])

(defmethod normalize-mbql-clause-tokens :datetime-add
  [[_ field amount unit]]
  [:datetime-add (normalize-tokens field :ignore-path) amount (maybe-normalize-token unit)])

(defmethod normalize-mbql-clause-tokens :datetime-subtract
  [[_ field amount unit]]
  [:datetime-subtract (normalize-tokens field :ignore-path) amount (maybe-normalize-token unit)])

(defmethod normalize-mbql-clause-tokens :get-week
  [[_ field mode]]
  (if mode
    [:get-week (normalize-tokens field :ignore-path) (maybe-normalize-token mode)]
    [:get-week (normalize-tokens field :ignore-path)]))

(defmethod normalize-mbql-clause-tokens :temporal-extract
  [[_ field unit mode]]
  (if mode
    [:temporal-extract (normalize-tokens field :ignore-path) (maybe-normalize-token unit) (maybe-normalize-token mode)]
    [:temporal-extract (normalize-tokens field :ignore-path) (maybe-normalize-token unit)]))

(defmethod normalize-mbql-clause-tokens :datetime-diff
  [[_ x y unit]]
  [:datetime-diff
   (normalize-tokens x :ignore-path)
   (normalize-tokens y :ignore-path)
   (maybe-normalize-token unit)])

(defmethod normalize-mbql-clause-tokens :value
  ;; The args of a `value` clause shouldn't be normalized.
  ;; See https://github.com/metabase/metabase/issues/23354 for details
  [[_ value info]]
  [:value value info])

(defmethod normalize-mbql-clause-tokens :offset
  [[_tag opts expr n, :as clause]]
  {:pre [(= (count clause) 4)]}
  (let [opts (lib.normalize/normalize :metabase.lib.schema.common/options (or opts {}))]
    [:offset opts (normalize-tokens expr :ignore-path) n]))

(defmethod normalize-mbql-clause-tokens :default
  ;; MBQL clauses by default are recursively normalized.
  ;; This includes the clause name (e.g. `[\"COUNT\" ...]` becomes `[:count ...]`) and args.
  [[clause-name & args]]
  (into [(maybe-normalize-token clause-name)] (map #(normalize-tokens % :ignore-path)) args))

(defn- aggregation-subclause?
  [x]
  (or (when ((some-fn keyword? string?) x)
        (#{:avg :count :cum-count :distinct :stddev :sum :min :max :+ :- :/ :*
           :sum-where :count-where :share :var :median :percentile}
         (maybe-normalize-token x)))
      (when (mbql-clause? x)
        (aggregation-subclause? (first x)))))

(defn- normalize-ag-clause-tokens
  "For old-style aggregations like `{:aggregation :count}` make sure we normalize the ag type (`:count`). Other wacky
  clauses like `{:aggregation [:count :count]}` need to be handled as well :("
  [ag-clause]
  (cond
    ;; something like {:aggregations :count}
    ((some-fn keyword? string?) ag-clause)
    (maybe-normalize-token ag-clause)

    ;; named aggregation ([:named <ag> <name>])
    (is-clause? :named ag-clause)
    (let [[_ wrapped-ag & more] ag-clause]
      (into [:named (normalize-ag-clause-tokens wrapped-ag)] more))

    ;; something wack like {:aggregations [:count [:sum 10]]} or {:aggregations [:count :count]}
    (when (mbql-clause? ag-clause)
      (aggregation-subclause? (second ag-clause)))
    (mapv normalize-ag-clause-tokens ag-clause)

    :else
    (normalize-tokens ag-clause :ignore-path)))

(defn- normalize-expressions-tokens
  "For expressions, we don't want to normalize the name of the expression; keep that as is, and make it a string;
   normalize the definitions as normal."
  [expressions-clause]
  (into {} (for [[expression-name definition] expressions-clause]
             [(u/qualified-name expression-name)
              (normalize-tokens definition :ignore-path)])))

(defn- normalize-order-by-tokens
  "Normalize tokens in the order-by clause, which can have different syntax when using MBQL 95 or 98
  rules (`[<field> :asc]` vs `[:asc <field>]`, for example)."
  [clauses]
  (vec (for [subclause clauses]
         (if (mbql-clause? subclause)
           ;; MBQL 98+ [direction field] style: normalize as normal
           (normalize-mbql-clause-tokens subclause)
           ;; otherwise it's MBQL 95 [field direction] style: flip the args and *then* normalize the clause. And then
           ;; flip it back to put it back the way we found it.
           (reverse (normalize-mbql-clause-tokens (reverse subclause)))))))

(defn- template-tag-definition-key->transform-fn
  "Get the function that should be used to transform values for normalized key `k` in a template tag definition."
  [k]
  (get {:default     identity
        :type        maybe-normalize-token
        :widget-type maybe-normalize-token}
       k
       ;; if there's not a special transform function for the key in the map above, just wrap the key-value
       ;; pair in a dummy map and let [[normalize-tokens]] take care of it. Then unwrap
       (fn [v]
         (-> (normalize-tokens {k v} :ignore-path)
             (get k)))))

(defn- normalize-template-tag-definition
  "For a template tag definition, normalize all the keys appropriately."
  [tag-definition]
  (let [tag-def (into
                 {}
                 (map (fn [[k v]]
                        (let [k            (maybe-normalize-token k)
                              transform-fn (template-tag-definition-key->transform-fn k)]
                          [k (transform-fn v)])))
                 tag-definition)]
    ;; `:widget-type` is a required key for Field Filter (dimension) template tags -- see
    ;; [[metabase.legacy-mbql.schema/TemplateTag:FieldFilter]] -- but prior to v42 it wasn't usually included by the
    ;; frontend. See #20643. If it's not present, just add in `:category` which will make things work they way they
    ;; did in the past.
    (cond-> tag-def
      (and (= (:type tag-def) :dimension)
           (not (:widget-type tag-def)))
      (assoc :widget-type :category))))

(defn- normalize-template-tags
  "Normalize native-query template tags. Like `expressions` we want to preserve the original name rather than normalize
  it."
  [template-tags]
  (into
   {}
   (map (fn [[tag-name tag-definition]]
          (let [tag-name (u/qualified-name tag-name)]
            [tag-name
             (-> (normalize-template-tag-definition tag-definition)
                 (assoc :name tag-name))])))
   template-tags))

(defn normalize-query-parameter
  "Normalize a parameter in the query `:parameters` list."
  [{param-type :type, :keys [target id values_source_config], :as param}]
  (cond-> param
    id                   (update :id u/qualified-name)
    ;; some things that get ran thru here, like dashcard param targets, do not have :type
    param-type           (update :type maybe-normalize-token)
    target               (update :target #(normalize-tokens % :ignore-path))
    values_source_config (update-in [:values_source_config :label_field] #(normalize-tokens % :ignore-path))
    values_source_config (update-in [:values_source_config :value_field] #(normalize-tokens % :ignore-path))))

(defn- normalize-source-query [source-query]
  (let [{native? :native, :as source-query} (update-keys source-query maybe-normalize-token)]
    (if native?
      (-> source-query
          (set/rename-keys {:native :query})
          (normalize-tokens [:native])
          (set/rename-keys {:query :native}))
      (normalize-tokens source-query [:query]))))

(defn- normalize-join [join]
  ;; path in call to `normalize-tokens` is [:query] so it will normalize `:source-query` as appropriate
  (let [{:keys [strategy fields], join-alias :alias, :as join} (normalize-tokens join :query)]
    (cond-> join
      strategy
      (update :strategy maybe-normalize-token)

      ((some-fn keyword? string?) fields)
      (update :fields maybe-normalize-token)

      join-alias
      (update :alias u/qualified-name))))

(declare canonicalize-mbql-clauses)

(defn normalize-field-ref
  "Normalize the field ref. Ensure it's well-formed mbql, not just json."
  [clause]
  (-> clause normalize-tokens canonicalize-mbql-clauses))

(defn normalize-source-metadata
  "Normalize source/results metadata for a single column."
  [metadata]
  {:pre [(map? metadata)]}
  (-> (reduce #(m/update-existing %1 %2 keyword) metadata [:base_type :effective_type :semantic_type :visibility_type :source :unit])
      (m/update-existing :field_ref normalize-field-ref)
      (m/update-existing :fingerprint walk/keywordize-keys)))

(defn- normalize-native-query
  "For native queries, normalize the top-level keys, and template tags, but nothing else."
  [native-query]
  (let [native-query (update-keys native-query maybe-normalize-token)]
    (cond-> native-query
      (seq (:template-tags native-query)) (update :template-tags normalize-template-tags))))

(defn- normalize-actions-row [row]
  (cond-> row
    (map? row) (update-keys u/qualified-name)))

(def ^:private path->special-token-normalization-fn
  "Map of special functions that should be used to perform token normalization for a given path. For example, the
  `:expressions` key in an MBQL query should preserve the case of the expression names; this custom behavior is
  defined below."
  {:type            maybe-normalize-token
   ;; don't normalize native queries
   :native          normalize-native-query
   :query           {:aggregation     normalize-ag-clause-tokens
                     :expressions     normalize-expressions-tokens
                     :order-by        normalize-order-by-tokens
                     :source-query    normalize-source-query
                     :source-metadata {::sequence normalize-source-metadata}
                     :joins           {::sequence normalize-join}}
   ;; we smuggle metadata for Models and want to preserve their "database" form vs a normalized form so it matches
   ;; the style in annotate.clj
   :info            {:metadata/model-metadata identity
                     ;; the original query that runs through qp.pivot should be ignored here entirely
                     :pivot/original-query    (fn [_] nil)
                     ;; don't try to normalize the keys in viz-settings passed in as part of `:info`.
                     :visualization-settings  identity
                     :context                 maybe-normalize-token}
   :parameters      {::sequence normalize-query-parameter}
   ;; TODO -- when does query ever have a top-level `:context` key??
   :context         #(some-> % maybe-normalize-token)
   :source-metadata {::sequence normalize-source-metadata}
   :viz-settings    maybe-normalize-token
   :create-row      normalize-actions-row
   :update-row      normalize-actions-row})

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
    (try
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
                       :let  [k (maybe-normalize-token k)]]
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
        x)
      (catch #?(:clj Throwable :cljs js/Error) e
        (throw (ex-info (i18n/tru "Error normalizing form: {0}" (ex-message e))
                        {:form x, :path path, :special-fn special-fn}
                        e))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  CANONICALIZE                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- wrap-implicit-field-id
  "Wrap raw integer Field IDs (i.e., those in an implicit 'field' position) in a `:field` clause if they're not
  already. Done for MBQL 95 backwards-compatibility. e.g.:

    {:filter [:= 10 20]} ; -> {:filter [:= [:field 10 nil] 20]}"
  [field]
  (if (integer? field)
    [:field field nil]
    field))

(defmulti ^:private canonicalize-mbql-clause
  {:arglists '([clause])}
  (fn [clause]
    (when (mbql-clause? clause)
      (first clause))))

(defmethod canonicalize-mbql-clause :default
  [clause]
  clause)

(defn- canonicalize-implicit-field-id
  "If `clause` is a raw integer ID wrap it in a `:field` clause. Either way, canonicalize the resulting clause."
  [clause]
  (canonicalize-mbql-clause (wrap-implicit-field-id clause)))

(defmethod canonicalize-mbql-clause :field
  [[_ id-or-name opts]]
  {:pre [((some-fn map? nil?) opts)]}
  (if (is-clause? :field id-or-name)
    (let [[_ nested-id-or-name nested-opts] id-or-name]
      (canonicalize-mbql-clause [:field nested-id-or-name (not-empty (merge nested-opts opts))]))
    ;; remove empty stuff from the options map. The `remove-empty-clauses` step will further remove empty stuff
    ;; afterwards
    [:field id-or-name (not-empty opts)]))

(defmethod canonicalize-mbql-clause :aggregation
  [[_tag index opts]]
  (if (empty? opts)
    [:aggregation index]
    [:aggregation index opts]))

;;; legacy Field clauses

(defmethod canonicalize-mbql-clause :field-id
  [[_ id]]
  ;; if someone is dumb and does something like [:field-id [:field-literal ...]] be nice and fix it for them.
  (if (mbql-clause? id)
    (canonicalize-mbql-clause id)
    [:field id nil]))

(defmethod canonicalize-mbql-clause :field-literal
  [[_ field-name base-type]]
  [:field field-name {:base-type base-type}])

(defmethod canonicalize-mbql-clause :fk->
  [[_ field-1 field-2]]
  (let [[_ source _]       (canonicalize-implicit-field-id field-1)
        [_ dest dest-opts] (canonicalize-implicit-field-id field-2)]
    [:field dest (assoc dest-opts :source-field source)]))

(defmethod canonicalize-mbql-clause :joined-field
  [[_ join-alias field]]
  (-> (canonicalize-implicit-field-id field)
      (mbql.u/assoc-field-options :join-alias join-alias)))

(defmethod canonicalize-mbql-clause :datetime-field
  [clause]
  (case (count clause)
    3
    (let [[_ field unit] clause]
      (-> (canonicalize-implicit-field-id field)
          (mbql.u/with-temporal-unit unit)))

    4
    (let [[_ field _ unit] clause]
      (canonicalize-mbql-clause [:datetime-field field unit]))))

(defmethod canonicalize-mbql-clause :binning-strategy
  [[_ field strategy param binning-options]]
  (let [[_ id-or-name opts] (canonicalize-implicit-field-id field)]
    [:field
     id-or-name
     (assoc opts :binning (merge {:strategy strategy}
                                 (when param
                                   {strategy param})
                                 binning-options))]))

;;; filter clauses

;; For `and`/`or`/`not` compound filters, recurse on the arg(s), then simplify the whole thing.
(defn- canonicalize-compound-filter-clause [[filter-name & args]]
  (mbql.u/simplify-compound-filter
   (into [filter-name]
         ;; we need to canonicalize any other mbql clauses that might show up in args here because
         ;; simplify-compund-filter validates its output :(
         (map canonicalize-mbql-clause args))))

(doseq [clause-name [:and :or :not]]
  (defmethod canonicalize-mbql-clause clause-name
    [clause]
    (canonicalize-compound-filter-clause clause)))

(defmethod canonicalize-mbql-clause :inside
  [[_ field-1 field-2 & coordinates]]
  (into [:inside
         (canonicalize-implicit-field-id field-1)
         (canonicalize-implicit-field-id field-2)]
        coordinates))

(defmethod canonicalize-mbql-clause :time-interval
  [[_ field & args]]
  ;; if you specify a `:temporal-unit` for the Field inside a `:time-interval`, remove it. The unit in
  ;; `:time-interval` takes precedence.
  (let [field (cond-> (canonicalize-implicit-field-id field)
                (mbql.u/is-clause? :field field) (mbql.u/update-field-options dissoc :temporal-unit))]
    (into [:time-interval field] args)))

;; all the other filter types have an implict field ID for the first arg
;; (e.g. [:= 10 20] gets canonicalized to [:= [:field-id 10] 20]
(defn- canonicalize-simple-filter-clause
  [[filter-name first-arg & other-args]]
  ;; Support legacy expressions like [:> 1 25] where 1 is a field id.
  (into [filter-name (canonicalize-implicit-field-id first-arg)]
        (map canonicalize-mbql-clause other-args)))

(doseq [clause-name [:= :!= :< :<= :> :>=
                     :is-empty :not-empty :is-null :not-null
                     :between]]
  (defmethod canonicalize-mbql-clause clause-name
    [clause]
    (canonicalize-simple-filter-clause clause)))

;; These clauses have pMBQL-style options in index 1, when they have multiple arguments.
(doseq [tag [:starts-with :ends-with :contains :does-not-contain]]
  (defmethod canonicalize-mbql-clause tag
    [[_tag opts & args :as clause]]
    (if (> (count args) 2)
      (into [tag (or opts {})] (map canonicalize-mbql-clause args))
      (canonicalize-simple-filter-clause clause))))

;;; aggregations/expression subclauses

;; Remove `:rows` type aggregation (long-since deprecated; simpliy means no aggregation) if present
(defmethod canonicalize-mbql-clause :rows
  [_]
  nil)

;; TODO -- if options is empty, should we just unwrap the clause?
(defmethod canonicalize-mbql-clause :aggregation-options
  [[_ wrapped-aggregation-clause options]]
  [:aggregation-options (canonicalize-mbql-clause wrapped-aggregation-clause) options])

;; for legacy `:named` aggregations convert them to a new-style `:aggregation-options` clause.
;;
;; 99.99% of clauses should have no options, however if they do and `:use-as-display-name?` is false (default is
;; true) then generate options to change `:name` rather than `:display-name`
(defmethod canonicalize-mbql-clause :named
  [[_ wrapped-ag expr-name & more]]
  (canonicalize-mbql-clause
   [:aggregation-options
    (canonicalize-mbql-clause wrapped-ag)
    (let [[{:keys [use-as-display-name?]}] more]
      (if (false? use-as-display-name?)
        {:name expr-name}
        {:display-name expr-name}))]))

(defn- canonicalize-count-clause [[clause-name field]]
  (if field
    [clause-name (canonicalize-implicit-field-id field)]
    [clause-name]))

(doseq [clause-name [:count :cum-count]]
  (defmethod canonicalize-mbql-clause clause-name
    [clause]
    (canonicalize-count-clause clause)))

(defn- canonicalize-simple-aggregation-with-field
  [[clause-name field]]
  [clause-name (canonicalize-implicit-field-id field)])

(doseq [clause-name [:avg :cum-sum :distinct :stddev :sum :min :max :median :var]]
  (defmethod canonicalize-mbql-clause clause-name
    [clause]
    (canonicalize-simple-aggregation-with-field clause)))

(defmethod canonicalize-mbql-clause :percentile
  [[_ field percentile]]
  [:percentile (canonicalize-implicit-field-id field) percentile])

(defn- canonicalize-filtered-aggregation-clause
  [[clause-name filter-subclause]]
  [clause-name (canonicalize-mbql-clause filter-subclause)])

(doseq [clause-name [:share :count-where]]
  (defmethod canonicalize-mbql-clause clause-name
    [clause]
    (canonicalize-filtered-aggregation-clause clause)))

(defmethod canonicalize-mbql-clause :sum-where
  [[_ field filter-subclause]]
  [:sum-where (canonicalize-mbql-clause field) (canonicalize-mbql-clause filter-subclause)])

(defmethod canonicalize-mbql-clause :case
  [[_ clauses options]]
  (if options
    (conj (canonicalize-mbql-clause [:case clauses])
          (normalize-tokens options :ignore-path))
    [:case (vec (for [[pred expr] clauses]
                  [(canonicalize-mbql-clause pred) (canonicalize-mbql-clause expr)]))]))

(defmethod canonicalize-mbql-clause :substring
  [[_ arg start & more]]
  (into [:substring
         (canonicalize-mbql-clause arg)
         ;; 0 indexes were allowed in the past but we are now enforcing this rule in MBQL.
         ;; This allows stored queries with literal 0 in the index to work.
         (if (= 0 start) 1 (canonicalize-mbql-clause start))]
        (map canonicalize-mbql-clause more)))

(defmethod canonicalize-mbql-clause :offset
  [[_tag opts expr n, :as clause]]
  {:pre [(= (count clause) 4)]}
  [:offset (or opts {}) (canonicalize-mbql-clause expr) n])

;;; top-level key canonicalization

(defn- canonicalize-mbql-clauses
  "Walk an `mbql-query` an canonicalize non-top-level clauses like `:fk->`."
  [form]
  (cond
    ;; Special handling for records so that they are not converted into plain maps.
    ;; Only the values are canonicalized.
    (record? form)
    (reduce-kv (fn [r k x] (assoc r k (canonicalize-mbql-clauses x))) form form)

    ;; Only the values are canonicalized.
    (map? form)
    (update-vals form canonicalize-mbql-clauses)

    (mbql-clause? form)
    (let [top-canonical
          (try
            (canonicalize-mbql-clause form)
            (catch #?(:clj Throwable :cljs js/Error) e
              (log/error "Invalid clause:" form)
              (throw (ex-info (i18n/tru "Invalid MBQL clause: {0}" (ex-message e))
                              {:clause form}
                              e))))]
      ;; Canonical clauses are assumed to be sequential things conj'd at the end.
      ;; In fact, they should better be vectors.
      (if (seq top-canonical)
        (into (conj (empty top-canonical) (first top-canonical))
              (map canonicalize-mbql-clauses)
              (rest top-canonical))
        top-canonical))

    ;; ISeq instances (e.g., list and lazy sequences) are converted to vectors.
    (seq? form)
    (mapv canonicalize-mbql-clauses form)

    ;; Other collections (e.g., vectors, sets, and queues) are assumed to be conj'd at the end
    ;; and we keep their types.
    (coll? form)
    (into (empty form) (map canonicalize-mbql-clauses) form)

    :else
    form))

(defn- wrap-single-aggregations
  "Convert old MBQL 95 single-aggregations like `{:aggregation :count}` or `{:aggregation [:count]}` to MBQL 98+
  multiple-aggregation syntax (e.g. `{:aggregation [[:count]]}`)."
  [aggregations]
  (lib.util.match/replace aggregations
    seq? (recur (vec &match))

    ;; something like {:aggregations :count} -- MBQL 95 single aggregation
    keyword?
    [[&match]]

    ;; special-case: MBQL 98 multiple aggregations using unwrapped :count or :rows
    ;; e.g. {:aggregations [:count [:sum 10]]} or {:aggregations [:count :count]}
    [(_ :guard (every-pred keyword? (complement #{:named :+ :- :* :/})))
     (_ :guard aggregation-subclause?)
     & _]
    (into [] (mapcat wrap-single-aggregations) aggregations)

    ;; something like {:aggregations [:sum 10]} -- MBQL 95 single aggregation
    [(_ :guard keyword?) & _]
    [&match]

    _
    &match))

(defn- canonicalize-aggregations
  "Canonicalize subclauses (see above) and make sure `:aggregation` is a sequence of clauses instead of a single
  clause."
  [aggregations]
  (->> (wrap-single-aggregations aggregations)
       (keep canonicalize-mbql-clauses)
       vec))

(defn- canonicalize-breakouts [breakouts]
  (if (mbql-clause? breakouts)
    (recur [breakouts])
    (not-empty (mapv wrap-implicit-field-id breakouts))))

(defn- canonicalize-order-by
  "Make sure order by clauses like `[:asc 10]` get `:field-id` added where appropriate, e.g. `[:asc [:field-id 10]]`"
  [clauses]
  (lib.util.match/replace clauses
    seq? (recur (vec &match))

    ;; MBQL 95 reversed [<field> <direction>] clause
    [field :asc]        (recur [:asc field])
    [field :desc]       (recur [:desc field])
    [field :ascending]  (recur [:asc field])
    [field :descending] (recur [:desc field])

    ;; MBQL 95 names but MBQL 98+ reversed syntax
    [:ascending field]  (recur [:asc field])
    [:descending field] (recur [:desc field])

    [:asc field]  [:asc  (canonicalize-implicit-field-id field)]
    [:desc field] [:desc (canonicalize-implicit-field-id field)]

    ;; this case should be the first one hit when we come in with a vector of clauses e.g. [[:asc 1] [:desc 2]]
    [& clauses] (vec (distinct (map canonicalize-order-by clauses)))))

(declare canonicalize-inner-mbql-query)

(defn- canonicalize-template-tag [{:keys [dimension], :as tag}]
  (cond-> tag
    dimension (update :dimension canonicalize-mbql-clause)))

(defn- canonicalize-template-tags [tags]
  (into {} (for [[tag-name tag] tags]
             [tag-name (canonicalize-template-tag tag)])))

(defn- canonicalize-native-query [{:keys [template-tags], :as native-query}]
  (cond-> native-query
    template-tags (update :template-tags canonicalize-template-tags)))

(defn- canonicalize-source-query [{native? :native, :as source-query}]
  (cond-> source-query
    (not native?) canonicalize-inner-mbql-query
    native?       canonicalize-native-query))

(defn- non-empty? [x]
  (if (coll? x)
    (seq x)
    (some? x)))

(defn- canonicalize-top-level-mbql-clauses
  "Perform specific steps to canonicalize the various top-level clauses in an MBQL query."
  [mbql-query]
  (cond-> mbql-query
    (non-empty? (:aggregation  mbql-query)) (update :aggregation  canonicalize-aggregations)
    (non-empty? (:breakout     mbql-query)) (update :breakout     canonicalize-breakouts)
    (non-empty? (:fields       mbql-query)) (update :fields       (partial mapv wrap-implicit-field-id))
    (non-empty? (:order-by     mbql-query)) (update :order-by     canonicalize-order-by)
    (non-empty? (:source-query mbql-query)) (update :source-query canonicalize-source-query)))

(def ^:private ^{:arglists '([query])} canonicalize-inner-mbql-query
  (comp canonicalize-mbql-clauses canonicalize-top-level-mbql-clauses))

(defn- move-source-metadata-to-mbql-query
  "In Metabase 0.33.0 `:source-metadata` about resolved queries is added to the 'inner' MBQL query rather than to the
  top-level; if we encounter the old style, move it to the appropriate location."
  [{:keys [source-metadata], :as query}]
  (-> query
      (dissoc :source-metadata)
      (assoc-in [:query :source-metadata] source-metadata)))

(defn- canonicalize-mbql-clauses-excluding-native
  [{:keys [native] :as outer-query}]
  (if native
    (-> outer-query (dissoc :native) canonicalize-mbql-clauses (assoc :native native))
    (canonicalize-mbql-clauses outer-query)))

(defn- canonicalize
  "Canonicalize a query [MBQL query], rewriting the query as if you perfectly followed the recommended style guides for
  writing MBQL. Does things like removes unneeded and empty clauses, converts older MBQL '95 syntax to MBQL '98, etc."
  [{:keys [query parameters source-metadata native], :as outer-query}]
  (try
    (cond-> outer-query
      source-metadata move-source-metadata-to-mbql-query
      query           (update :query canonicalize-inner-mbql-query)
      parameters      (update :parameters (partial mapv canonicalize-mbql-clauses))
      native          (update :native canonicalize-native-query)
      true            canonicalize-mbql-clauses-excluding-native)
    (catch #?(:clj Throwable :cljs js/Error) e
      (throw (ex-info (i18n/tru "Error canonicalizing query: {0}" (ex-message e))
                      {:query query}
                      e)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          WHOLE-QUERY TRANSFORMATIONS                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- remove-breakout-fields-from-fields
  "Remove any Fields specified in both `:breakout` and `:fields` from `:fields`; it is implied that any breakout Field
  will be returned, specifying it in both would imply it is to be returned twice, which tends to cause confusion for
  the QP and drivers. (This is done to work around historic bugs with the way queries were generated on the frontend;
  I'm not sure this behavior makes sense, but removing it would break existing queries.)

  We will remove either exact matches:

    {:breakout [[:field-id 10]], :fields [[:field-id 10]]} ; -> {:breakout [[:field-id 10]]}

  or unbucketed matches:

    {:breakout [[:datetime-field [:field-id 10] :month]], :fields [[:field-id 10]]}
    ;; -> {:breakout [[:field-id 10]]}"
  [{{:keys [breakout fields]} :query, :as query}]
  (if-not (and (seq breakout) (seq fields))
    query
    ;; get a set of all Field clauses (of any type) in the breakout. For temporal-bucketed fields, we'll include both
    ;; the bucketed `[:datetime-field <field> ...]` clause and the `<field>` clause it wraps
    (let [breakout-fields (into #{} cat (lib.util.match/match breakout
                                          [:field id-or-name opts]
                                          [&match
                                           [:field id-or-name (dissoc opts :temporal-unit)]]))]
      ;; now remove all the Fields in `:fields` that match the ones in the set
      (update-in query [:query :fields] (comp vec (partial remove breakout-fields))))))

(defn- perform-whole-query-transformations
  "Perform transformations that operate on the query as a whole, making sure the structure as a whole is logical and
  consistent."
  [query]
  (try
    (remove-breakout-fields-from-fields query)
    (catch #?(:clj Throwable :cljs js/Error) e
      (throw (ex-info (i18n/tru "Error performing whole query transformations")
                      {:query query}
                      e)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             REMOVING EMPTY CLAUSES                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(declare remove-empty-clauses)

(defn- remove-empty-clauses-in-map [m path]
  (let [m (into (empty m) (for [[k v] m
                                :let  [v (remove-empty-clauses v (conj path k))]
                                :when (some? v)]
                            [k v]))]
    (when (seq m)
      m)))

(defn- remove-empty-clauses-in-sequence* [xs path]
  (let [xs (mapv #(remove-empty-clauses % (conj path ::sequence))
                 xs)]
    (when (some some? xs)
      xs)))

(defmulti ^:private remove-empty-clauses-in-mbql-clause
  {:arglists '([clause path])}
  (fn [[tag] _path]
    tag))

(defmethod remove-empty-clauses-in-mbql-clause :default
  [clause path]
  (remove-empty-clauses-in-sequence* clause path))

(defmethod remove-empty-clauses-in-mbql-clause :offset
  [[_tag opts expr n] path]
  [:offset opts (remove-empty-clauses expr (conj path :offset)) n])

(defn- remove-empty-clauses-in-sequence [x path]
  (if (mbql-clause? x)
    (remove-empty-clauses-in-mbql-clause x path)
    (remove-empty-clauses-in-sequence* x path)))

(defn- remove-empty-clauses-in-join [join]
  (remove-empty-clauses join [:query]))

(defn- remove-empty-clauses-in-source-query [{native? :native, :as source-query}]
  (if native?
    (-> source-query
        (set/rename-keys {:native :query})
        (remove-empty-clauses [:native])
        (set/rename-keys {:query :native}))
    (remove-empty-clauses source-query [:query])))

(defn- remove-empty-clauses-in-parameter [parameter]
  (merge
   ;; don't remove `value: nil` from a parameter, the FE code (`haveParametersChanged`) is extremely dumb and will
   ;; consider the parameter to have changed and thus the query to be 'dirty' if we do this.
   (select-keys parameter [:value])
   (remove-empty-clauses-in-map parameter [:parameters ::sequence])))

(def ^:private path->special-remove-empty-clauses-fn
  {:native       identity
   :query        {:source-query remove-empty-clauses-in-source-query
                  :joins        {::sequence remove-empty-clauses-in-join}}
   :parameters   {::sequence remove-empty-clauses-in-parameter}
   :viz-settings identity
   :create-row   identity
   :update-row   identity})

(defn- remove-empty-clauses
  "Remove any empty or `nil` clauses in a query."
  ([query]
   (remove-empty-clauses query []))

  ([x path]
   (try
     (let [special-fn (when (seq path)
                        (get-in path->special-remove-empty-clauses-fn path))]
       (cond
         (fn? special-fn) (special-fn x)
         (record? x)      x
         (map? x)         (remove-empty-clauses-in-map x path)
         (sequential? x)  (remove-empty-clauses-in-sequence x path)
         :else            x))
     (catch #?(:clj Throwable :cljs js/Error) e
       (throw (ex-info "Error removing empty clauses from form."
                       {:form x, :path path}
                       e))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUTTING IT ALL TOGETHER                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^{:arglists '([outer-query])} normalize
  "Normalize the tokens in a Metabase query (i.e., make them all `lisp-case` keywords), rewrite deprecated clauses as
  up-to-date MBQL 2000, and remove empty clauses."
  (let [normalize* (comp remove-empty-clauses
                         perform-whole-query-transformations
                         canonicalize
                         normalize-tokens)]
    (fn [query]
      (try
        (normalize* query)
        (catch #?(:clj Throwable :cljs js/Error) e
          (throw (ex-info (i18n/tru "Error normalizing query: {0}" (ex-message e))
                          {:query query}
                          e)))))))

(mu/defn normalize-or-throw :- ::mbql.s/Query
  "Like [[normalize]], but checks the result against the Malli schema for a legacy query, which will cause it to throw
  if it fails (at least in dev)."
  [query :- :map]
  (normalize query))

(mu/defn normalize-fragment
  "Normalize just a specific fragment of a query, such as just the inner MBQL part or just a filter clause. `path` is
  where this fragment would normally live in a full query.

    (normalize-fragment [:query :filter] [\"=\" 100 200])
    ;;-> [:= [:field-id 100] 200]"
  [path :- [:maybe [:sequential :keyword]]
   x]
  (if-not (seq path)
    (normalize x)
    (get (normalize-fragment (butlast path) {(last path) x}) (last path))))
