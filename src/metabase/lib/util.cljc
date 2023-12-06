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
   [metabase.lib.common :as lib.common]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.mbql.util :as mbql.u]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

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

(defn named-expression-clause
  "Top level expressions must be clauses with :lib/expression-name, so if we get a literal, wrap it in :value."
  [clause a-name]
  (-> (if (clause? clause)
        clause
        [:value {:lib/uuid (str (random-uuid))
                 :effective-type (lib.schema.expression/type-of clause)}
         clause])
      (lib.options/update-options assoc :lib/expression-name a-name)))

(defn replace-clause
  "Replace the `target-clause` in `stage` `location` with `new-clause`.
   If a clause has :lib/uuid equal to the `target-clause` it is swapped with `new-clause`.
   If `location` contains no clause with `target-clause` no replacement happens."
  [stage location target-clause new-clause]
  {:pre [((some-fn clause? #(= (:lib/type %) :mbql/join)) target-clause)]}
  (let [new-clause (if (= :expressions (first location))
                     (named-expression-clause new-clause (expression-name target-clause))
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

(defn- join->pipeline [join]
  (let [source (select-keys join [:source-table :source-query])
        stages (inner-query->stages source)]
    (-> join
        (dissoc :source-table :source-query)
        (update-legacy-boolean-expression->list :condition :conditions)
        (assoc :lib/type :mbql/join
               :stages stages)
        lib.options/ensure-uuid)))

(defn- joins->pipeline [joins]
  (mapv join->pipeline joins))

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

(mu/defn ensure-mbql-final-stage :- ::lib.schema/query
  "Convert query to a pMBQL (pipeline) query, and make sure the final stage is an `:mbql` one."
  [query]
  (let [query (pipeline query)]
    (cond-> query
      (= (:lib/type (query-stage query -1)) :mbql.stage/native)
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

(mu/defn ^:private string-byte-count :- [:int {:min 0}]
  "Number of bytes in a string using UTF-8 encoding."
  [s :- :string]
  #?(:clj (count (.getBytes (str s) "UTF-8"))
     :cljs (.. (js/TextEncoder.) (encode s) -length)))

#?(:clj
   (mu/defn ^:private string-character-at :- [:string {:min 0, :max 1}]
     [s :- :string
      i :-[:int {:min 0}]]
     (str (.charAt ^String s i))))

(mu/defn ^:private truncate-string-to-byte-count :- :string
  "Truncate string `s` to `max-length-bytes` UTF-8 bytes (as opposed to truncating to some number of
  *characters*)."
  [s                :- :string
   max-length-bytes :- [:int {:min 1}]]
  #?(:clj
     (loop [i 0, cumulative-byte-count 0]
       (cond
         (= cumulative-byte-count max-length-bytes) (subs s 0 i)
         (> cumulative-byte-count max-length-bytes) (subs s 0 (dec i))
         (>= i (count s))                           s
         :else                                      (recur (inc i)
                                                           (long (+
                                                                  cumulative-byte-count
                                                                  (string-byte-count (string-character-at s i)))))))

     :cljs
     (let [buf (js/Uint8Array. max-length-bytes)
           result (.encodeInto (js/TextEncoder.) s buf)] ;; JS obj {read: chars_converted, write: bytes_written}
       (subs s 0 (.-read result)))))

(def ^:private truncate-alias-max-length-bytes
  "Length to truncate column and table identifiers to. See [[metabase.driver.impl/default-alias-max-length-bytes]] for
  reasoning."
  60)

(def ^:private truncated-alias-hash-suffix-length
  "Length of the hash suffixed to truncated strings by [[truncate-alias]]."
  ;; 8 bytes for the CRC32 plus one for the underscore
  9)

(mu/defn ^:private crc32-checksum :- [:string {:min 8, :max 8}]
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
   (if (<= (string-byte-count s) max-bytes)
     s
     (let [checksum  (crc32-checksum s)
           truncated (truncate-string-to-byte-count s (- max-bytes truncated-alias-hash-suffix-length))]
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

(mu/defn unique-name-generator :- [:=>
                                   [:cat ::lib.schema.common/non-blank-string]
                                   ::lib.schema.common/non-blank-string]
  "Create a new function with the signature

    (f str) => str

  That takes any sort of string identifier (e.g. a column alias or table/join alias) and returns a guaranteed-unique
  name truncated to 60 characters (actually 51 characters plus a hash)."
  []
  (comp truncate-alias
        (mbql.u/unique-name-generator
         ;; unique by lower-case name, e.g. `NAME` and `name` => `NAME` and `name_2`
         :name-key-fn     u/lower-case-en
         ;; truncate alias to 60 characters (actually 51 characters plus a hash).
         :unique-alias-fn (fn [original suffix]
                            (truncate-alias (str original \_ suffix))))))

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
   as well as any subsequent stages."
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
                      (conj (vec summary-clauses) (lib.common/->op-arg a-summary-clause))))]
    (if new-summary?
      (-> new-query
          (update-query-stage
            stage-number
            (fn [stage]
              (-> stage
                  (dissoc :order-by :fields)
                  (m/update-existing :joins (fn [joins] (mapv #(dissoc % :fields) joins))))))
          ;; subvec holds onto references, so create a new vector
          (update :stages (comp #(into [] %) subvec) 0 (inc (canonical-stage-index query stage-number))))
      new-query)))
