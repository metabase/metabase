(ns metabase.lib.util
  (:refer-clojure :exclude [format])
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   #?@(:clj
       ([potemkin :as p]))
   #?@(:cljs
       (["crc-32" :as CRC32]
        [goog.string :as gstring]
        [goog.string.format :as gstring.format]))))

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

(defn- clause? [clause]
  (and (vector? clause)
       (> (count clause) 1)
       (keyword? (first clause))
       (map? (second clause))
       (contains? (second clause) :lib/uuid)))

(defn- clause-uuid [clause]
  (when (clause? clause)
    (get-in clause [1 :lib/uuid])))

(defn replace-clause
  "Replace the `target-clause` in `stage` `location` with `new-clause`.
   If a clause has :lib/uuid equal to the `target-clause` it is swapped with `new-clause`.
   If `location` contains no clause with `target-clause` no replacement happens."
  [stage location target-clause new-clause]
  {:pre [(clause? target-clause)]}
  (update
    stage
    location
    #(->> (for [clause %]
            (if (= (clause-uuid clause) (clause-uuid target-clause))
              new-clause
              clause))
          vec)))

(defn remove-clause
  "Replace the `target-clause` in `stage` `location`.
   If a clause has :lib/uuid equal to the `target-clause` it is removed.
   If `location` contains no clause with `target-clause` no removal happens.
   If the the location is empty, dissoc it from stage."
  [stage location target-clause]
  {:pre [(clause? target-clause)]}
  (let [target-uuid (clause-uuid target-clause)
        target (get stage location)
        result (->> target
                    (remove (comp #{target-uuid} clause-uuid))
                    vec
                    not-empty)]
    (if result
      (assoc stage location result)
      (dissoc stage location))))

;;; TODO -- all of this `->pipeline` stuff should probably be merged into [[metabase.lib.convert]] at some point in
;;; the near future.

(defn- native-query->pipeline
  "Convert a `:type` `:native` QP MBQL query to a `:type` `:pipeline` pMBQL query. See docstring
  for [[mbql-query->pipeline]] for an explanation of what this means."
  [query]
  (merge {:lib/type :mbql/query
          :type     :pipeline
          ;; we're using `merge` here instead of threading stuff so the `:lib/` keys are the first part of the map for
          ;; readability in the REPL.
          :stages   [(merge (lib.options/ensure-uuid {:lib/type :mbql.stage/native})
                            (set/rename-keys (:native query) {:query :native}))]}
         (dissoc query :type :native)))

(declare inner-query->stages)

(defn- join->pipeline [join]
  (let [source (select-keys join [:source-table :source-query])
        stages (inner-query->stages source)]
    (-> join
        (dissoc :source-table :source-query)
        (assoc :lib/type :mbql/join
               :stages stages)
        lib.options/ensure-uuid)))

(defn- joins->pipeline [joins]
  (mapv join->pipeline joins))

(defn- inner-query->stages [{:keys [source-query source-metadata], :as inner-query}]
  (let [previous-stages (if source-query
                          (inner-query->stages source-query)
                          [])
        source-metadata (when source-metadata
                          (-> (if (vector? source-metadata)
                                {:columns source-metadata}
                                source-metadata)
                              (update :columns (fn [columns]
                                                 (for [column columns]
                                                   (assoc column :lib/type :metadata/field))))
                              (assoc :lib/type :metadata/results)))
        previous-stages (cond-> previous-stages
                          source-metadata (assoc-in [(dec (count previous-stages)) :lib/stage-metadata] source-metadata))
        stage-type      (if (:native inner-query)
                          :mbql.stage/native
                          :mbql.stage/mbql)
        ;; we're using `merge` here instead of threading stuff so the `:lib/` keys are the first part of the map for
        ;; readability in the REPL.
        this-stage      (merge (lib.options/ensure-uuid
                                {:lib/type stage-type})
                               (dissoc inner-query :source-query :source-metadata))
        this-stage      (cond-> this-stage
                          (seq (:joins this-stage)) (update :joins joins->pipeline))]
    (conj previous-stages this-stage)))

(defn- mbql-query->pipeline
  "Convert a `:type` `:query` QP MBQL (i.e., MBQL as currently understood by the Query Processor, or the JS MLv1) to a
  `:type` `:pipeline` 'pMBQL' query. The key difference is that instead of having a `:query` with a `:source-query`
  with a `:source-query` and so forth, you have a vector of `:stages` where each stage serves as the source query for
  the next stage. Initially this was an implementation detail of a few functions, but it's easier to visualize and
  manipulate, so now all of MLv2 deals with pMBQL. See this Slack thread
  https://metaboat.slack.com/archives/C04DN5VRQM6/p1677118410961169?thread_ts=1677112778.742589&cid=C04DN5VRQM6 for
  more information."
  [query]
  (merge {:lib/type :mbql/query
          :type     :pipeline
          :stages   (inner-query->stages (:query query))}
         (dissoc query :type :query)))

(mu/defn pipeline
  "Ensure that a `query` is in the general shape of a pMBQL `:pipeline` query. This doesn't walk the query and fix
  everything! The goal here is just to make sure we have `:stages` in the correct place and the like.
  See [[metabase.lib.convert]] for functions that actually ensure all parts of the query match the pMBQL schema (they
  use this function as part of that process.)"
  [query :- [:map [:type [:keyword]]]]
  (condp = (:type query)
    :pipeline query
    :native   (native-query->pipeline query)
    :query    (mbql-query->pipeline query)))

(mu/defn ^:private non-negative-stage-index :- [:int {:min 0}]
  "If `stage-number` index is a negative number e.g. `-1` convert it to a positive index so we can use `nth` on
  `stages`. `-1` = the last stage, `-2` = the penultimate stage, etc."
  [stages       :- [:sequential [:ref ::lib.schema/stage]]
   stage-number :- :int]
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
  [{:keys [stages], :as _query} :- :map
   stage-number                 :- :int]
  (let [stage-number (non-negative-stage-index stages stage-number)]
    (when (pos? stage-number)
      (dec stage-number))))

(mu/defn query-stage :- ::lib.schema/stage
  "Fetch a specific `stage` of a query. This handles negative indices as well, e.g. `-1` will return the last stage of
  the query."
  [query        :- [:map [:type [:keyword]]]
   stage-number :- :int]
  (let [{:keys [stages]} (pipeline query)]
    (get (vec stages) (non-negative-stage-index stages stage-number))))

(mu/defn previous-stage :- [:maybe ::lib.schema/stage]
  "Return the previous stage of the query, if there is one; otherwise return `nil`."
  [query stage-number :- :int]
  (when-let [stage-num (previous-stage-number query stage-number)]
    (query-stage query stage-num)))

(mu/defn update-query-stage :- ::lib.schema/query
  "Update a specific `stage-number` of a `query` by doing

    (apply f stage args)

  `stage-number` can be a negative index, e.g. `-1` will update the last stage of the query."
  [query        :- [:map [:type [:keyword]]]
   stage-number :- :int
   f & args]
  (let [{:keys [stages], :as query} (pipeline query)
        stage-number'               (non-negative-stage-index stages stage-number)
        stages'                     (apply update (vec stages) stage-number' f args)]
    (assoc query :stages stages')))

(mu/defn ensure-mbql-final-stage :- ::lib.schema/query
  "Convert query to a `:pipeline` query, and make sure the final stage is an `:mbql` one."
  [query]
  (let [query (pipeline query)]
    (cond-> query
      (= (:lib/type (query-stage query -1)) :mbql.stage/native)
      (update :stages conj (lib.options/ensure-uuid {:lib/type :mbql.stage/mbql})))))

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

(defn update-stages-ignore-joins
  "Like [[update-stages]], but does not recurse into the stages inside joins.

  `f` has the signature

    (f query stage-number stage)"
  [query f]
  (reduce
   (fn [query stage-number]
     (update-in query [:stages stage-number] (fn [stage]
                                               (f query stage-number stage))))
   query
   (range 0 (count (:stages query)))))

(defn update-stages
  "Apply function `f` to every stage of a query, depth-first. Also applied to all query stages.

  `f` has the signature

    (f query stage-number stage)

  `query` reflects the results of the previous call to `f`.

  As a convenience, if `f` returns nil, the original stage will be used without changes."
  [query f]
  (letfn [(update-join [join]
            (-> query
                (assoc :stages (:stages join))
                (update-stages f)
                :stages))
          (update-joins [joins]
            (mapv update-join joins))]
    (update-stages-ignore-joins
     query
     (fn [query stage-number stage]
       (let [stage (cond-> stage
                     (:joins stage)
                     update-joins)]
         (f query stage-number stage))))))

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
                                                           (+
                                                            cumulative-byte-count
                                                            (string-byte-count (string-character-at s i))))))

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

(mu/defn truncate-alias :- ::lib.schema.common/non-blank-string
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

(mu/defn string-table-id->card-id :- [:maybe ::lib.schema.id/card]
  "If `table-id` is a `card__<id>`-style string, parse the `<id>` part to an integer Card ID."
  [table-id]
  (when (string? table-id)
    (when-let [[_match card-id-str] (re-find #"^card__(\d+)$" table-id)]
      (parse-long card-id-str))))
