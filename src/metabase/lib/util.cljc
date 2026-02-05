(ns metabase.lib.util
  (:refer-clojure :exclude [format every? mapv select-keys update-keys some get-in #?(:clj for)])
  (:require
   #?@(:clj
       ([potemkin :as p])
       :cljs
       ([goog.string :as gstring]
        [goog.string.format :as gstring.format]))
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.common :as lib.common]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [every? mapv select-keys update-keys some get-in #?(:clj for)]]))

#?(:clj
   (set! *warn-on-reflection* true))

;; The formatting functionality is only loaded if you depend on goog.string.format.
#?(:cljs (comment gstring.format/keep-me))

;;; For convenience: [[metabase.lib.util/format]] maps to [[clojure.core/format]] in Clj and [[goog.string/format]] in
;;; Cljs. They both work like [[clojure.core/format]], but since that doesn't exist in Cljs, you can use this instead.
#?(:clj
   (p/import-vars [clojure.core format])

   :cljs
   (def format "Exactly like [[clojure.core/format]] but ClojureScript-friendly." gstring/format))

;;; TODO (Cam 9/8/25) -- overlapping functionality with [[metabase.lib.schema.common/is-clause?]]
(defn clause?
  "Returns true if this is a **normalized** MBQL 5 clause."
  [clause]
  (and (vector? clause)
       (keyword? (first clause))
       (let [opts (second clause)]
         (and (map? opts)
              (contains? opts :lib/uuid)))))

(defn- denormalized-or-unconverted-clause?
  "Whether this clause is a not a properly normalized MBQL 5 clause -- usually because it failed normalization because
  it's invalid, e.g. using an aggregation function like `:sum` inside `:expressions`."
  [clause]
  (and (sequential? clause)
       (not (map-entry? clause))
       (string? (first clause))))

;;; TODO (Cam 9/8/25) -- some overlap with [[metabase.lib.dispatch/mbql-clause-type]]
(defn clause-of-type?
  "Returns truthy if is a clause of `clause-type`, which can be either a keyword (like `:field`) or a set (like
  `#{:field :expression}`)."
  [clause clause-type]
  (and (clause? clause)
       (if (set? clause-type)
         (clause-type (first clause))
         (= (first clause) clause-type))))

(defn field-clause?
  "Returns true if this is a field clause."
  [clause]
  (clause-of-type? clause :field))

(defn ref-clause?
  "Returns true if this is any sort of reference clause"
  [clause]
  (and (clause? clause)
       (lib.hierarchy/isa? (first clause) ::lib.schema.ref/ref)))

;;; TODO (Cam 8/28/25) -- base type is the original effective type!!! We shouldn't need a separate
;;; `:metabase.lib.field/original-effective-type` key.
(defn original-isa?
  "Returns whether the type of `expression` isa? `typ`.
   If the expression has an original-effective-type due to bucketing, check that."
  [expression typ]
  (isa?
   (or (and (clause? expression)
            ((some-fn :metabase.lib.field/original-effective-type :effective-type :base-type) (lib.options/options expression)))
       (lib.schema.expression/type-of expression))
   typ))

(defn expression-name
  "Returns the :lib/expression-name of `clause`. Returns nil if `clause` is not a clause."
  [clause]
  (when (clause? clause)
    (:lib/expression-name (lib.options/options clause))))

(defn top-level-expression-clause
  "Top level expressions must be clauses with :lib/expression-name, so if we get a literal, wrap it in :value."
  [clause a-name]
  (some-> (cond
            (clause? clause)
            clause

            (denormalized-or-unconverted-clause? clause)
            nil

            :else
            [:value {:lib/uuid (str (random-uuid))
                     :effective-type (lib.schema.expression/type-of clause)}
             clause])
          (lib.options/update-options (fn [opts]
                                        (-> opts
                                            (assoc :lib/expression-name a-name)
                                            (dissoc :name :display-name))))))

(defmulti custom-name-method
  "Implementation for [[custom-name]]."
  {:arglists '([x])}
  lib.dispatch/dispatch-value
  :hierarchy lib.hierarchy/hierarchy)

(defn custom-name
  "Return the user supplied name of `x`, if any."
  [x]
  (custom-name-method x))

(defmethod custom-name-method :default
  [x]
  ;; We assume that clauses only get a :display-name option if the user explicitly specifies it.
  ;; Expressions from the :expressions clause of MBQL 5 queries have custom names by default.
  (when (clause? x)
    ((some-fn :display-name :lib/expression-name) (lib.options/options x))))

(defn replace-clause
  "Replace the `target-clause` in `stage` `location` with `new-clause`.
   If a clause has :lib/uuid equal to the `target-clause` it is swapped with `new-clause`.
   If `location` contains no clause with `target-clause` no replacement happens."
  [stage location target-clause new-clause]
  {:pre [((some-fn clause? #(= (:lib/type %) :mbql/join)) target-clause)]}
  (let [new-clause (if (= :expressions (first location))
                     (-> new-clause
                         (top-level-expression-clause (or (custom-name new-clause)
                                                          (expression-name target-clause))))
                     new-clause)]
    (m/update-existing-in
     stage
     location
     (fn [clause-or-clauses]
       (->> (for [clause clause-or-clauses]
              (if (= (lib.options/uuid clause) (lib.options/uuid target-clause))
                new-clause
                clause))
            vec)))))

(defn remove-clause
  "Remove the `target-clause` in `stage` `location`.
   If a clause has :lib/uuid equal to the `target-clause` it is removed.
   If `location` contains no clause with `target-clause` no removal happens.
   If the the location is empty, dissoc it from stage.
   For the [:fields] location if only expressions remain, dissoc from stage."
  [stage location target-clause stage-number]
  {:pre [(clause? target-clause)]}
  (if-let [target (get-in stage location)]
    (let [target-uuid (lib.options/uuid target-clause)
          [first-loc last-loc] [(first location) (last location)]
          result (into [] (remove (comp #{target-uuid} lib.options/uuid)) target)
          result (when-not (and (= location [:fields])
                                (every? #(clause-of-type? % :expression) result))
                   result)]
      (cond
        (seq result)
        (assoc-in stage location result)

        (= [:joins :conditions] [first-loc last-loc])
        (throw (ex-info (i18n/tru "Cannot remove the final join condition")
                        {:error ::cannot-remove-final-join-condition
                         :conditions (get-in stage location)
                         :join (get-in stage (pop location))
                         :stage-number stage-number
                         :stage stage}))

        (= [:joins :fields] [first-loc last-loc])
        (update-in stage (pop location) dissoc last-loc)

        :else
        (m/dissoc-in stage location)))
    stage))

;;; TODO -- all of this `->pipeline` stuff should probably be merged into [[metabase.lib.convert]] at some point in
;;; the near future.

(defn- native-query->pipeline
  "Convert a `:type` `:native` QP MBQL query to a MBQL 5 query. See docstring for [[mbql-query->pipeline]] for an
  explanation of what this means."
  [query]
  (merge {:lib/type :mbql/query
          ;; we're using `merge` here instead of threading stuff so the `:lib/` keys are the first part of the map for
          ;; readability in the REPL.
          :stages   [(merge {:lib/type :mbql.stage/native}
                            (set/rename-keys (:native query) {:query :native}))]}
         (dissoc query :type :native)))

(declare inner-query->stages)

(defn- update-legacy-boolean-expression->list
  "Updates m with a legacy boolean expression at `legacy-key` into a list with an implied and for MBQL 5 at `mbql5-key`"
  [m legacy-key mbql5-key]
  (cond-> m
    (contains? m legacy-key) (update legacy-key #(if (and (vector? %)
                                                          (= (first %) :and))
                                                   (vec (drop 1 %))
                                                   [%]))
    (contains? m legacy-key) (set/rename-keys {legacy-key mbql5-key})))

(defn ->stage-metadata
  "Convert legacy `:source-metadata` to [[metabase.lib.metadata/StageMetadata]]."
  [source-metadata]
  (when source-metadata
    (when-let [m (cond
                   (seqable? source-metadata) {:columns source-metadata}
                   (map? source-metadata)     source-metadata
                   :else                      (do
                                                (log/warnf "Ignoring invalid source metadata: expected sequence of columns, got %s" (pr-str (type source-metadata)))
                                                nil))]
      (-> m
          (update :columns (fn [columns]
                             (mapv (fn [column]
                                     (-> column
                                         (update-keys u/->kebab-case-en)
                                         (assoc :lib/type :metadata/column)))
                                   columns)))
          (assoc :lib/type :metadata/results)))))

(defn- join->pipeline [join]
  (let [stages (inner-query->stages (or (:source-query join)
                                        (select-keys join [:source-table])))
        stages (if-let [source-metadata (:source-metadata join)]
                 (assoc-in stages [(dec (count stages)) :lib/stage-metadata] (->stage-metadata source-metadata))
                 stages)]
    (-> join
        (dissoc :source-table :source-query :source-metadata)
        (update-legacy-boolean-expression->list :condition :conditions)
        (assoc :lib/type :mbql/join
               :stages stages)
        lib.options/ensure-uuid)))

(defn- joins->pipeline [joins]
  (mapv join->pipeline joins))

(defn- inner-query->stages [{:keys [source-query source-metadata], :as inner-query}]
  (let [previous-stages (if source-query
                          (inner-query->stages source-query)
                          [])
        source-metadata (->stage-metadata source-metadata)
        previous-stage  (dec (count previous-stages))
        previous-stages (cond-> previous-stages
                          (and source-metadata
                               (not (neg? previous-stage))) (assoc-in [previous-stage :lib/stage-metadata] source-metadata))
        stage-type      (if (:native inner-query)
                          :mbql.stage/native
                          :mbql.stage/mbql)
        ;; we're using `merge` here instead of threading stuff so the `:lib/` keys are the first part of the map for
        ;; readability in the REPL.
        this-stage      (merge {:lib/type stage-type}
                               (dissoc inner-query :source-query :source-metadata))
        this-stage      (cond-> this-stage
                          (seq (:joins this-stage)) (update :joins joins->pipeline)
                          :always (update-legacy-boolean-expression->list :filter :filters))]
    (conj previous-stages this-stage)))

(defn- mbql-query->pipeline
  "Convert a `:type` `:query` QP MBQL (i.e., MBQL as currently understood by the Query Processor, or the JS MLv1) to a
  MBQL 5 query. The key difference is that instead of having a `:query` with a `:source-query` with a `:source-query`
  and so forth, you have a vector of `:stages` where each stage serves as the source query for the next stage.
  Initially this was an implementation detail of a few functions, but it's easier to visualize and manipulate, so now
  all of MLv2 deals with MBQL 5. See this Slack thread
  https://metaboat.slack.com/archives/C04DN5VRQM6/p1677118410961169?thread_ts=1677112778.742589&cid=C04DN5VRQM6 for
  more information."
  [query]
  (merge {:lib/type :mbql/query
          :stages   (inner-query->stages (:query query))}
         (dissoc query :type :query)))

(mr/def ::legacy-query
  [:map
   {:error/message "legacy query"}
   [:type [:enum :native :query]]])

(mr/def ::mbql5-query
  [:map
   {:error/message "MBQL 5 query"}
   [:lib/type [:= :mbql/query]]])

(mr/def ::legacy-or-mbql5-query
  "Schema for a map that is either a legacy query OR a MBQL 5 query."
  [:or ::legacy-query ::mbql5-query])

(mu/defn pipeline
  "Ensure that a `query` is in the general shape of a MBQL 5 query. This doesn't walk the query and fix everything! The
  goal here is just to make sure we have `:stages` in the correct place and the like. See [[metabase.lib.convert]] for
  functions that actually ensure all parts of the query match the MBQL 5 schema (they use this function as part of that
  process.)"
  [query :- ::legacy-or-mbql5-query]
  (if (= (:lib/type query) :mbql/query)
    query
    (case (:type query)
      :native (native-query->pipeline query)
      :query  (mbql-query->pipeline query))))

(mu/defn canonical-stage-index :- [:int {:min 0}]
  "If `stage-number` index is a negative number e.g. `-1` convert it to a positive index so we can use `nth` on
  `stages`. `-1` = the last stage, `-2` = the penultimate stage, etc."
  [{:keys [stages], :as _query} :- :map
   stage-number                 :- :int]
  (let [stage-number' (if (neg? stage-number)
                        (+ (count stages) stage-number)
                        stage-number)]
    (when (or (>= stage-number' (count stages))
              (neg? stage-number'))
      (throw (ex-info (i18n/tru "Stage {0} does not exist" stage-number)
                      {:num-stages (count stages)})))
    stage-number'))

(mu/defn previous-stage-number :- [:maybe [:int {:min 0}]]
  "The index of the previous stage, if there is one. `nil` if there is no previous stage."
  [query        :- :map
   stage-number :- :int]
  (let [stage-number (canonical-stage-index query stage-number)]
    (when (pos? stage-number)
      (dec stage-number))))

(defn first-stage?
  "Whether a `stage-number` is referring to the first stage of a query or not."
  [query stage-number]
  (not (previous-stage-number query stage-number)))

(mu/defn next-stage-number :- [:maybe :int]
  "The index of the next stage, if there is one. `nil` if there is no next stage."
  [{:keys [stages], :as _query} :- :map
   stage-number                 :- :int]
  (let [stage-number (if (neg? stage-number)
                       (+ (count stages) stage-number)
                       stage-number)]
    (when (< (inc stage-number) (count stages))
      (inc stage-number))))

(defn last-stage?
  "Whether a `stage-number` is referring to the last stage of a query or not."
  [query stage-number]
  ;; Call canonical-stage-index to ensure this throws when given an invalid stage-number.
  (not (next-stage-number query (canonical-stage-index query stage-number))))

(mu/defn query-stage :- [:maybe ::lib.schema/stage]
  "Fetch a specific `stage` of a query. This handles negative indices as well, e.g. `-1` will return the last stage of
  the query."
  [query        :- ::mbql5-query
   stage-number :- :int]
  (let [{:keys [stages], :as query} query]
    (get (vec stages) (canonical-stage-index query stage-number))))

(mu/defn previous-stage :- [:maybe ::lib.schema/stage]
  "Return the previous stage of the query, if there is one; otherwise return `nil`."
  [query stage-number :- :int]
  (when-let [stage-num (previous-stage-number query stage-number)]
    (query-stage query stage-num)))

(mu/defn update-query-stage :- ::lib.schema/query
  "Update a specific `stage-number` of a `query` by doing

    (apply f stage args)

  `stage-number` can be a negative index, e.g. `-1` will update the last stage of the query."
  [query        :- ::legacy-or-mbql5-query
   stage-number :- :int
   f & args]
  (let [{:keys [stages], :as query} (pipeline query)
        stage-number'               (canonical-stage-index query stage-number)
        stages'                     (apply update (vec stages) stage-number' f args)]
    (assoc query :stages stages')))

(mu/defn drop-later-stages :- ::lib.schema/query
  "Drop any stages in the `query` that come after `stage-number`."
  [query        :- ::legacy-or-mbql5-query
   stage-number :- :int]
  (cond-> (pipeline query)
    (not (last-stage? query stage-number))
    (update :stages #(take (inc (canonical-stage-index query stage-number)) %))))

(defn native-stage?
  "Is this query stage a native stage?"
  ([stage]
   (= (:lib/type stage) :mbql.stage/native))
  ([query stage-number]
   (native-stage? (query-stage query stage-number))))

(defn mbql-stage?
  "Is this query stage an MBQL stage?"
  ([stage]
   (= (:lib/type stage) :mbql.stage/mbql))
  ([query stage-number]
   (mbql-stage? (query-stage query stage-number))))

(mu/defn ensure-mbql-final-stage :- ::lib.schema/query
  "Convert query to a MBQL 5 (pipeline) query, and make sure the final stage is an `:mbql` one."
  [query]
  (let [query (pipeline query)]
    (cond-> query
      (native-stage? query -1)
      (update :stages conj {:lib/type :mbql.stage/mbql}))))

(defn join-strings-with-conjunction
  "This is basically [[clojure.string/join]] but uses commas to join everything but the last two args, which are joined
  by a string `conjunction`. Uses Oxford commas for > 2 args.

  (join-strings-with-conjunction \"and\" [\"X\" \"Y\" \"Z\"])
  ;; => \"X, Y, and Z\""
  [conjunction coll]
  (when (seq coll)
    (if (= (count coll) 1)
      (first coll)
      (let [conjunction (str \space (str/trim conjunction) \space)]
        (if (= (count coll) 2)
          ;; exactly 2 args: X and Y
          (str (first coll) conjunction (second coll))
          ;; > 2 args: X, Y, and Z
          (str
           (str/join ", " (butlast coll))
           ","
           conjunction
           (last coll)))))))

(mu/defn legacy-string-table-id->card-id :- [:maybe ::lib.schema.id/card]
  "If `table-id` is a legacy `card__<id>`-style string, parse the `<id>` part to an integer Card ID. Only for legacy
  queries! You don't need to use this in MBQL 5 since this is converted automatically by [[metabase.lib.convert]] to
  `:source-card`."
  [table-id]
  (when (string? table-id)
    (when-let [[_match card-id-str] (re-find #"^card__(\d+)$" table-id)]
      (parse-long card-id-str))))

(mu/defn source-table-id :- [:maybe ::lib.schema.id/table]
  "If this query has a `:source-table` ID, return it."
  [query]
  (-> query :stages first :source-table))

(mu/defn source-card-id :- [:maybe ::lib.schema.id/card]
  "If this query has a `:source-card` ID, return it."
  [query]
  (-> query :stages first :source-card))

(def ^:private strip-id-regex
  #?(:cljs (js/RegExp. " id$" "i")
     ;; `(?i)` is JVM-specific magic to turn on the `i` case-insensitive flag.
     :clj  #"(?i) id$"))

(mu/defn strip-id :- :string
  "Given a display name string like \"Product ID\", this will drop the trailing \"ID\" and trim whitespace.
  Used to turn a FK field's name into a pseudo table name when implicitly joining."
  [display-name :- :string]
  (-> display-name
      (str/replace strip-id-regex "")
      str/trim))

(def ^:const column-display-name-separator
  "Separator used for temporal bucket and binning suffixes (e.g., 'Total: Month', 'Price: 10 bins').
   See: temporal_bucket.cljc, binning.cljc"
  ": ")

(def ^:const join-display-name-separator
  "Separator used for joined table column names (e.g., 'Products → Created At').
   See: field.cljc - field-display-name-add-fk-or-join-display-name"
  " → ")

(def ^:const implicit-join-display-name-separator
  "Separator used for implicit join aliases (e.g., 'People - Product').
   See: join.cljc - calculate-join-alias"
  " - ")

(defn- static-part
  "Create a static (non-translatable) part."
  [value]
  {:type :static, :value value})

(defn- translatable-part
  "Create a translatable part."
  [value]
  {:type :translatable, :value value})

(defn- try-parse-aggregation-to-parts
  "Try to parse a display name using aggregation patterns.
   Returns a vector of parts or nil if no pattern matches."
  [display-name patterns]
  (some (fn [{:keys [prefix suffix]}]
          (when (and (str/starts-with? display-name prefix)
                     (str/ends-with? display-name suffix)
                     ;; Ensure we have a non-empty inner part
                     (> (- (count display-name) (count prefix) (count suffix)) 0))
            (let [inner (subs display-name (count prefix) (- (count display-name) (count suffix)))]
              {:matched   true
               :prefix    prefix
               :suffix    suffix
               :inner     inner})))
        patterns))

(defn- try-parse-join-to-parts
  "Try to parse a joined column display name.
   Returns {:matched true, :join-alias str, :column str} or nil."
  [display-name]
  (let [arrow-idx (str/index-of display-name join-display-name-separator)]
    (when (and arrow-idx (pos? arrow-idx))
      {:matched    true
       :join-alias (subs display-name 0 arrow-idx)
       :column     (subs display-name (+ arrow-idx (count join-display-name-separator)))})))

(defn- try-parse-implicit-join-to-parts
  "Try to parse an implicit join alias (e.g., 'People - Product').
   Returns {:matched true, :table str, :fk-field str} or nil."
  [join-alias]
  (let [dash-idx (str/index-of join-alias implicit-join-display-name-separator)]
    (when (and dash-idx (pos? dash-idx))
      {:matched  true
       :table    (subs join-alias 0 dash-idx)
       :fk-field (subs join-alias (+ dash-idx (count implicit-join-display-name-separator)))})))

(defn- try-parse-colon-suffix-to-parts
  "Try to parse a display name with a colon suffix.
   Returns {:matched true, :column str, :suffix str} or nil."
  [display-name]
  (let [colon-idx (str/last-index-of display-name column-display-name-separator)]
    (when (and colon-idx (pos? colon-idx))
      {:matched true
       :column  (subs display-name 0 colon-idx)
       :suffix  (subs display-name (+ colon-idx (count column-display-name-separator)))})))

(defn parse-column-display-name-parts
  "Parse a column display name into a flat list of parts for translation.

   Takes a display name string and an optional vector of aggregation patterns
   (each pattern is a map with :prefix and :suffix keys).

   Returns a vector of parts, where each part is a map with:
   - :type - either :static (don't translate) or :translatable (should be translated)
   - :value - the string value of this part

   The FE simply needs to:
   1. Translate all parts where :type is :translatable
   2. Concatenate all :value strings together

   Examples:
   - \"Total\" => [{:type :translatable, :value \"Total\"}]

   - \"Sum of Total\" =>
     [{:type :static, :value \"Sum of \"}
      {:type :translatable, :value \"Total\"}]

   - \"Sum of Total matching condition\" =>
     [{:type :static, :value \"Sum of \"}
      {:type :translatable, :value \"Total\"}
      {:type :static, :value \" matching condition\"}]

   - \"Products → Total\" =>
     [{:type :translatable, :value \"Products\"}
      {:type :static, :value \" → \"}
      {:type :translatable, :value \"Total\"}]

   - \"People - Product → Created At: Month\" =>
     [{:type :translatable, :value \"People\"}
      {:type :static, :value \" - \"}
      {:type :translatable, :value \"Product\"}
      {:type :static, :value \" → \"}
      {:type :translatable, :value \"Created At\"}
      {:type :static, :value \": \"}
      {:type :static, :value \"Month\"}]"
  ([display-name]
   (parse-column-display-name-parts display-name nil))
  ([display-name aggregation-patterns]
   (letfn [(parse-inner [s]
             ;; Recursively parse the inner part which may have more patterns
             (parse-column-display-name-parts s aggregation-patterns))

           (parse-join-alias [join-alias]
             ;; Parse join alias which may be an implicit join like "People - Product"
             (if-let [{:keys [table fk-field]} (try-parse-implicit-join-to-parts join-alias)]
               (-> []
                   (into (parse-inner table))
                   (conj (static-part implicit-join-display-name-separator))
                   (into (parse-inner fk-field)))
               ;; Simple join alias, just translate it
               (parse-inner join-alias)))]

     (or
      ;; First try aggregation patterns (most specific, wraps other patterns)
      (when-let [{:keys [prefix suffix inner]} (try-parse-aggregation-to-parts display-name aggregation-patterns)]
        (-> []
            (cond-> (seq prefix) (conj (static-part prefix)))
            (into (parse-inner inner))
            (cond-> (seq suffix) (conj (static-part suffix)))))

      ;; Then try join pattern
      (when-let [{:keys [join-alias column]} (try-parse-join-to-parts display-name)]
        (-> []
            (into (parse-join-alias join-alias))
            (conj (static-part join-display-name-separator))
            (into (parse-inner column))))

      ;; Then try colon suffix (temporal bucket or binning)
      ;; The suffix is static because it's a unit name (Month, Day, etc.) or binning label
      (when-let [{:keys [column suffix]} (try-parse-colon-suffix-to-parts display-name)]
        (-> []
            (into (parse-inner column))
            (conj (static-part column-display-name-separator))
            (conj (static-part suffix))))

      ;; Otherwise it's a plain column name - translatable
      [(translatable-part display-name)]))))

(mu/defn add-summary-clause :- ::lib.schema/query
  "If the given stage has no summary, it will drop :fields, :order-by, and :join :fields from it,
   as well as dropping any subsequent stages."
  [query :- ::lib.schema/query
   stage-number :- :int
   location :- [:enum :breakout :aggregation]
   a-summary-clause]
  (let [query (pipeline query)
        stage-number (or stage-number -1)
        stage (query-stage query stage-number)
        new-summary? (not (or (seq (:aggregation stage)) (seq (:breakout stage))))
        new-query (update-query-stage
                   query stage-number
                   update location
                   (fn [summary-clauses]
                     (->> a-summary-clause
                          lib.common/->op-arg
                          (conj (vec summary-clauses)))))]
    (if new-summary?
      (-> new-query
          (update-query-stage
           stage-number
           (fn [stage]
             (dissoc stage :order-by)))
          (update :stages #(into [] (take (inc (canonical-stage-index query stage-number))) %)))
      new-query)))

(defn fresh-uuids
  "Recursively replace all the :lib/uuids in `x` with fresh ones. Useful if you need to attach something to a query more
  than once."
  ([x]
   (fresh-uuids x (constantly nil)))
  ([x register-fn]
   (cond
     (sequential? x)
     (into (empty x) (map #(fresh-uuids % register-fn)) x)

     (map? x)
     (into
      (empty x)
      (map (fn [[k v]]
             [k (if (= k :lib/uuid)
                  (let [new-id (str (random-uuid))]
                    (register-fn v new-id)
                    new-id)
                  (fresh-uuids v register-fn))]))
      x)

     :else
     x)))

(defn fresh-uuids-preserving-aggregation-refs
  "Recursively replace all `:lib/uuid`s on an MBQL structure with fresh ones. Avoids duplicate UUID errors when
  attaching something to a query more than once. This builds on [[fresh-uuids]] to include updating any
  `[:aggregation {} \"uuid\"]` refs to use the corresponding new UUID."
  [query]
  (let [remapping (volatile! (transient {}))
        query     (fresh-uuids query (fn [old-uuid new-uuid]
                                       (vswap! remapping assoc! old-uuid new-uuid)))
        remapping (persistent! @remapping)]
    (lib.util.match/replace query
      [:aggregation opts old-uuid]
      [:aggregation opts (or (remapping old-uuid)
                             (throw (ex-info "Could not convert old :aggregation ref to new UUIDs"
                                             {:aggregation &match})))])))

(mu/defn normalized-query-type :- [:maybe [:enum #_MLv2 :mbql/query #_legacy :query :native #_audit :internal]]
  "Get the `:lib/type` or `:type` from `query`, even if it is not-yet normalized."
  [query :- [:maybe :map]]
  (when (map? query)
    (when-let [query-type (some-> (some #(get query %)
                                        [:lib/type :type "lib/type" "type"])
                                  keyword)]
      (when (#{:mbql/query :query :native :internal} query-type)
        query-type))))

(mu/defn normalized-mbql-version :- [:maybe [:enum :mbql-version/mbql5 :mbql-version/legacy]]
  "Version of MBQL a `query` map is using, either `:mbql-version/mbql-5` or `:mbql-version/legacy`."
  [query :- [:maybe :map]]
  (case (normalized-query-type query)
    :mbql/query      :mbql-version/mbql5
    (:query :native) :mbql-version/legacy
    ;; otherwise, this is not a valid MBQL query.
    nil))
