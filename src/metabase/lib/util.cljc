(ns metabase.lib.util
  (:refer-clojure :exclude [format])
  (:require
   #?@(:clj
       ([potemkin :as p]))
   #?@(:cljs
       (["crc-32" :as CRC32]
        [goog.string :as gstring]
        [goog.string.format :as gstring.format]))
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.common :as lib.common]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

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

(defn clause?
  "Returns true if this is a clause."
  [clause]
  (and (vector? clause)
       (keyword? (first clause))
       (let [opts (get clause 1)]
         (and (map? opts)
              (contains? opts :lib/uuid)))))

(defn clause-of-type?
  "Returns true if this is a clause."
  [clause clause-type]
  (and (clause? clause)
       (= (first clause) clause-type)))

(defn field-clause?
  "Returns true if this is a field clause."
  [clause]
  (clause-of-type? clause :field))

(defn ref-clause?
  "Returns true if this is any sort of reference clause"
  [clause]
  (and (clause? clause)
       (lib.hierarchy/isa? (first clause) ::lib.schema.ref/ref)))

(defn segment-clause?
  "Returns true if this is a segment clause"
  [clause]
  (and (clause? clause)
       (lib.hierarchy/isa? (first clause) ::lib.schema.ref/segment)))

(defn metric-clause?
  "Returns true if this is a metric clause"
  [clause]
  (and (clause? clause)
       (lib.hierarchy/isa? (first clause) ::lib.schema.ref/metric)))

(defn original-isa?
  "Returns whether the type of `expression` isa? `typ`.
   If the expression has an original-effective-type due to bucketing, check that."
  [expression typ]
  (isa?
   (or (and (clause? expression)
            (:metabase.lib.field/original-effective-type (second expression)))
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
  (-> (if (clause? clause)
        clause
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
  ;; Expressions from the :expressions clause of pMBQL queries have custom names by default.
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
  "Convert a `:type` `:native` QP MBQL query to a pMBQL query. See docstring for [[mbql-query->pipeline]] for an
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
  "Updates m with a legacy boolean expression at `legacy-key` into a list with an implied and for pMBQL at `pMBQL-key`"
  [m legacy-key pMBQL-key]
  (cond-> m
    (contains? m legacy-key) (update legacy-key #(if (and (vector? %)
                                                          (= (first %) :and))
                                                   (vec (drop 1 %))
                                                   [%]))
    (contains? m legacy-key) (set/rename-keys {legacy-key pMBQL-key})))

(defn ->stage-metadata
  "Convert legacy `:source-metadata` to [[metabase.lib.metadata/StageMetadata]]."
  [source-metadata]
  (when source-metadata
    (-> (if (seqable? source-metadata)
          {:columns source-metadata}
          source-metadata)
        (update :columns (fn [columns]
                           (mapv (fn [column]
                                   (-> column
                                       (update-keys u/->kebab-case-en)
                                       (assoc :lib/type :metadata/column)))
                                 columns)))
        (assoc :lib/type :metadata/results))))

(defn- join->pipeline [join]
  (let [source (select-keys join [:source-table :source-query])
        stages (inner-query->stages source)
        stages (if-let [source-metadata (and (>= (count stages) 2)
                                             (:source-metadata join))]
                 (assoc-in stages [(- (count stages) 2) :lib/stage-metadata] (->stage-metadata source-metadata))
                 stages)]
    (-> join
        (dissoc :source-table :source-query)
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
  pMBQL query. The key difference is that instead of having a `:query` with a `:source-query` with a `:source-query`
  and so forth, you have a vector of `:stages` where each stage serves as the source query for the next stage.
  Initially this was an implementation detail of a few functions, but it's easier to visualize and manipulate, so now
  all of MLv2 deals with pMBQL. See this Slack thread
  https://metaboat.slack.com/archives/C04DN5VRQM6/p1677118410961169?thread_ts=1677112778.742589&cid=C04DN5VRQM6 for
  more information."
  [query]
  (merge {:lib/type :mbql/query
          :stages   (inner-query->stages (:query query))}
         (dissoc query :type :query)))

(def LegacyOrPMBQLQuery
  "Schema for a map that is either a legacy query OR a pMBQL query."
  [:or
   [:map
    {:error/message "legacy query"}
    [:type [:enum :native :query]]]
   [:map
    {:error/message "pMBQL query"}
    [:lib/type [:= :mbql/query]]]])

(mu/defn pipeline
  "Ensure that a `query` is in the general shape of a pMBQL query. This doesn't walk the query and fix everything! The
  goal here is just to make sure we have `:stages` in the correct place and the like. See [[metabase.lib.convert]] for
  functions that actually ensure all parts of the query match the pMBQL schema (they use this function as part of that
  process.)"
  [query :- LegacyOrPMBQLQuery]
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
  [query        :- LegacyOrPMBQLQuery
   stage-number :- :int]
  (let [{:keys [stages], :as query} (pipeline query)]
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
  [query        :- LegacyOrPMBQLQuery
   stage-number :- :int
   f & args]
  (let [{:keys [stages], :as query} (pipeline query)
        stage-number'               (canonical-stage-index query stage-number)
        stages'                     (apply update (vec stages) stage-number' f args)]
    (assoc query :stages stages')))

(mu/defn drop-later-stages :- ::lib.schema/query
  "Drop any stages in the `query` that come after `stage-number`."
  [query        :- LegacyOrPMBQLQuery
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

(mu/defn ensure-mbql-final-stage :- ::lib.schema/query
  "Convert query to a pMBQL (pipeline) query, and make sure the final stage is an `:mbql` one."
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

(def ^:private truncate-alias-max-length-bytes
  "Length to truncate column and table identifiers to. See [[metabase.driver.impl/default-alias-max-length-bytes]] for
  reasoning."
  60)

(def ^:private truncated-alias-hash-suffix-length
  "Length of the hash suffixed to truncated strings by [[truncate-alias]]."
  ;; 8 bytes for the CRC32 plus one for the underscore
  9)

(mu/defn- crc32-checksum :- [:string {:min 8, :max 8}]
  "Return a 4-byte CRC-32 checksum of string `s`, encoded as an 8-character hex string."
  [s :- :string]
  (let [s #?(:clj (Long/toHexString (.getValue (doto (java.util.zip.CRC32.)
                                                 (.update (.getBytes ^String s "UTF-8")))))
             :cljs (-> (CRC32/str s 0)
                       (unsigned-bit-shift-right 0) ; see https://github.com/SheetJS/js-crc32#signed-integers
                       (.toString 16)))]
    ;; pad to 8 characters if needed. Might come out as less than 8 if the first byte is `00` or `0x` or something.
    (loop [s s]
      (if (< (count s) 8)
        (recur (str \0 s))
        s))))

(mu/defn truncate-alias :- [:string {:min 1, :max 60}]
  "Truncate string `s` if it is longer than [[truncate-alias-max-length-bytes]] and append a hex-encoded CRC-32
  checksum of the original string. Truncated string is truncated to [[truncate-alias-max-length-bytes]]
  minus [[truncated-alias-hash-suffix-length]] characters so the resulting string is
  exactly [[truncate-alias-max-length-bytes]]. The goal here is that two really long strings that only differ at the
  end will still have different resulting values.

    (truncate-alias \"some_really_long_string\" 15) ;   -> \"some_r_8e0f9bc2\"
    (truncate-alias \"some_really_long_string_2\" 15) ; -> \"some_r_2a3c73eb\""
  ([s]
   (truncate-alias s truncate-alias-max-length-bytes))

  ([s         :- ::lib.schema.common/non-blank-string
    max-bytes :- [:int {:min 0}]]
   (if (<= (u/string-byte-count s) max-bytes)
     s
     (let [checksum  (crc32-checksum s)
           truncated (u/truncate-string-to-byte-count s (- max-bytes truncated-alias-hash-suffix-length))]
       (str truncated \_ checksum)))))

(mu/defn legacy-string-table-id->card-id :- [:maybe ::lib.schema.id/card]
  "If `table-id` is a legacy `card__<id>`-style string, parse the `<id>` part to an integer Card ID. Only for legacy
  queries! You don't need to use this in pMBQL since this is converted automatically by [[metabase.lib.convert]] to
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

(mu/defn first-stage-type :- [:maybe [:enum :mbql.stage/mbql :mbql.stage/native]]
  "Type of the first query stage."
  [query :- :map]
  (:lib/type (query-stage query 0)))

(mu/defn first-stage-is-native? :- :boolean
  "Whether the first stage of the query is a native query stage."
  [query :- :map]
  (= (first-stage-type query) :mbql.stage/native))

(mu/defn- unique-alias :- :string
  [original :- :string
   suffix   :- :string]
  (-> (str original \_ suffix)
      (truncate-alias)))

(mr/def ::unique-name-generator
  "Stateful function with the signature

    (f)        => 'fresh' unique name generator
    (f str)    => unique-str
    (f id str) => unique-str

  i.e. repeated calls with the same string should return different unique strings."
  [:function
   ;; (f) => generates a new instance of the unique name generator for recursive generation without 'poisoning the
   ;; well'.
   [:=>
    [:cat]
    [:ref ::unique-name-generator]]
   ;; (f str) => unique-str
   [:=>
    [:cat :string]
    ::lib.schema.common/non-blank-string]
   ;; (f id str) => unique-str
   [:=>
    [:cat :any :string]
    ::lib.schema.common/non-blank-string]])

(mu/defn- unique-name-generator-with-options :- ::unique-name-generator
  [options :- :map]
  ;; ok to use here because this is the one designated wrapper for it.
  #_{:clj-kondo/ignore [:discouraged-var]}
  (let [f         (mbql.u/unique-name-generator options)
        truncate* (if (::truncate? options)
                    truncate-alias
                    identity)]
    ;; I know we could just use `comp` here but it gets really hard to figure out where it's coming from when you're
    ;; debugging things; a named function like this makes it clear where this function came from
    (fn unique-name-generator-fn
      ([]
       (unique-name-generator-with-options options))
      ([s]
       (->> s truncate* f))
      ([id s]
       (->> s truncate* (f id))))))

(mu/defn- unique-name-generator-factory :- [:function
                                            [:=>
                                             [:cat]
                                             ::unique-name-generator]
                                            [:=>
                                             [:cat [:schema [:sequential :string]]]
                                             ::unique-name-generator]]
  [options :- :map]
  (mu/fn :- ::unique-name-generator
    ([]
     (unique-name-generator-with-options options))
    ([existing-names :- [:sequential :string]]
     (let [f (unique-name-generator-with-options options)]
       (doseq [existing existing-names]
         (f existing))
       f))))

(def ^{:arglists '([] [existing-names])} unique-name-generator
  "Create a new function with the signature

    (f str) => str

  or

   (f id str) => str

  That takes any sort of string identifier (e.g. a column alias or table/join alias) and returns a guaranteed-unique
  name truncated to 60 characters (actually 51 characters plus a hash).

  Optionally takes a list of names which are already defined, \"priming\" the generator with eg. all the column names
  that currently exist on a stage of the query.

  The two-arity version of the returned function can be used for idempotence. See docstring
  for [[metabase.legacy-mbql.util/unique-name-generator]] for more information.

  New!

  You can call

    (f)

  to get a new, fresh unique name generator for recursive usage without 'poisoning the well'."
  ;; unique by lower-case name, e.g. `NAME` and `name` => `NAME` and `name_2`
   ;;
   ;; some databases treat aliases as case-insensitive so make sure the generated aliases are unique regardless of
   ;; case
  (unique-name-generator-factory
   {::truncate?      true
    :name-key-fn     u/lower-case-en
    :unique-alias-fn unique-alias}))

(def ^{:arglists '([] [existing-names])} non-truncating-unique-name-generator
  "This is the same as [[unique-name-generator]] but doesn't truncate names, matching the 'classic' behavior in QP
  results metadata."
  (unique-name-generator-factory {::truncate? false}))

(mu/defn identity-generator :- ::unique-name-generator
  "Identity unique name generator that just returns strings as-is."
  ([]
   identity-generator)
  ([s]
   s)
  ([_id s]
   s))

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
             (-> stage
                 (dissoc :order-by :fields)
                 (m/update-existing :joins (fn [joins] (mapv #(dissoc % :fields) joins))))))
          (update :stages #(into [] (take (inc (canonical-stage-index query stage-number))) %)))
      new-query)))

(defn find-stage-index-and-clause-by-uuid
  "Find the clause in `query` with the given `lib-uuid`. Return a [stage-index clause] pair, if found."
  ([query lib-uuid]
   (find-stage-index-and-clause-by-uuid query -1 lib-uuid))
  ([query stage-number lib-uuid]
   (first (keep-indexed (fn [idx stage]
                          (lib.util.match/match-lite-recursive stage
                            (clause :guard (= lib-uuid (lib.options/uuid clause)))
                            [idx clause]))
                        (:stages (drop-later-stages query stage-number))))))

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

(defn- replace-uuid-references
  [x replacement-map]
  (let [replacement (find replacement-map x)]
    (cond
      replacement
      (val replacement)

      (sequential? x)
      (into (empty x) (map #(replace-uuid-references % replacement-map)) x)

      (map? x)
      (into
       (empty x)
       (map (fn [[k v]]
              [k (cond-> v
                   (not= k :lib/uuid) (replace-uuid-references replacement-map))]))
       x)

      :else
      x)))

(defn fresh-query-instance
  "Create an copy of `query` with fresh :lib/uuid values making sure that internal
  uuid references are kept."
  [query]
  (let [v-replacement (volatile! (transient {}))
        almost-query (fresh-uuids query #(vswap! v-replacement assoc! %1 %2))
        replacement (persistent! @v-replacement)]
    (replace-uuid-references almost-query replacement)))

(mu/defn normalized-query-type :- [:maybe [:enum #_MLv2 :mbql/query #_legacy :query :native #_audit :internal]]
  "Get the `:lib/type` or `:type` from `query`, even if it is not-yet normalized."
  [query :- [:maybe :map]]
  (when (map? query)
    (when-let [query-type (keyword (some #(get query %)
                                         [:lib/type :type "lib/type" "type"]))]
      (when (#{:mbql/query :query :native :internal} query-type)
        query-type))))

(mu/defn referenced-field-ids :- [:maybe [:set ::lib.schema.id/field]]
  "Find all the integer field IDs in `coll`, Which can arbitrarily be anything that is part of MLv2 query schema."
  [coll]
  (not-empty
   (into #{}
         (comp cat (filter some?))
         (lib.util.match/match coll [:field opts (id :guard int?)] [id (:source-field opts)]))))

(defn collect-source-tables
  "Return sequence of source tables from `query`."
  [query]
  (let [from-joins (mapcat collect-source-tables (:joins query))]
    (if-let [source-query (:source-query query)]
      (concat (collect-source-tables source-query) from-joins)
      (cond->> from-joins
        (:source-table query) (cons (:source-table query))))))
