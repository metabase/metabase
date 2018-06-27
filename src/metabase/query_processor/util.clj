(ns metabase.query-processor.util
  "Utility functions used by the global query processor and middleware functions."
  (:require [buddy.core
             [codecs :as codecs]
             [hash :as hash]]
            [cheshire.core :as json]
            [clojure
             [string :as str]
             [walk :as walk]]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(defn mbql-query?
  "Is the given query an MBQL query?"
  [query]
  (= :query (keyword (:type query))))

(defn datetime-field?
  "Is FIELD a `DateTime` field?"
  [{:keys [base-type special-type]}]
  (or (isa? base-type :type/DateTime)
      (isa? special-type :type/DateTime)))

(defn query-without-aggregations-or-limits?
  "Is the given query an MBQL query without a `:limit`, `:aggregation`, or `:page` clause?"
  [{{aggregations :aggregation, :keys [limit page]} :query}]
  (and (not limit)
       (not page)
       (or (empty? aggregations)
           (= (:aggregation-type (first aggregations)) :rows))))

(defn query->remark
  "Generate an approparite REMARK to be prepended to a query to give DBAs additional information about the query being
  executed. See documentation for `mbql->native` and [issue #2386](https://github.com/metabase/metabase/issues/2386)
  for more information."  ^String [{{:keys [executed-by query-hash query-type], :as info} :info}]
  (str "Metabase" (when info
                    (assert (instance? (Class/forName "[B") query-hash))
                    (format ":: userID: %s queryType: %s queryHash: %s"
                            executed-by query-type (codecs/bytes->hex query-hash)))))


;;; ------------------------------------------------- Normalization --------------------------------------------------

;; The following functions make it easier to deal with MBQL queries, which are case-insensitive, string/keyword
;; insensitive, and underscore/hyphen insensitive.  These should be preferred instead of assuming the frontend will
;; always pass in clauses the same way, since different variation are all legal under MBQL '98.

;; TODO - In the future it might make sense to simply walk the entire query and normalize the whole thing when it
;; comes in. I've tried implementing middleware to do that but it ended up breaking a few things that wrongly assume
;; different clauses will always use a certain case (e.g. SQL `:template_tags`). Fixing all of that is out-of-scope
;; for the nested queries PR but should possibly be revisited in the future.

(s/defn normalize-token :- s/Keyword
  "Convert a string or keyword in various cases (`lisp-case`, `snake_case`, or `SCREAMING_SNAKE_CASE`) to a lisp-cased
  keyword."
  [token :- su/KeywordOrString]
  (-> (name token)
      str/lower-case
      (str/replace #"_" "-")
      keyword))

(defn get-normalized
  "Get the value for normalized key K in map M, regardless of how the key was specified in M,
   whether string or keyword, lisp-case, snake_case, or SCREAMING_SNAKE_CASE.

     (get-normalized {\"NUM_TOUCANS\" 2} :num-toucans) ; -> 2"
  ([m k]
   {:pre [(or (u/maybe? map? m)
              (println "Not a map:" m))]}
   (when (seq m)
     (let [k (normalize-token k)]
       (loop [[[map-k v] & more] (seq m)]
         (cond
           (= k (normalize-token map-k)) v
           (seq more)                    (recur more))))))
  ([m k not-found]
   (let [v (get-normalized m k)]
     (if (some? v)
       v
       not-found))))

(defn get-in-normalized
  "Like `get-normalized`, but accepts a sequence of keys KS, like `get-in`.

    (get-in-normalized {\"NUM_BIRDS\" {\"TOUCANS\" 2}} [:num-birds :toucans]) ; -> 2"
  ([m ks]
   {:pre [(u/maybe? sequential? ks)]}
   (loop [m m, [k & more] ks]
     (if-not k
       m
       (recur (get-normalized m k) more))))
  ([m ks not-found]
   (let [v (get-in-normalized m ks)]
     (if (some? v)
       v
       not-found))))

(defn dissoc-normalized
  "Remove all matching keys from map M regardless of case, string/keyword, or hypens/underscores.

     (dissoc-normalized {\"NUM_TOUCANS\" 3} :num-toucans) ; -> {}"
  [m k]
  {:pre [(or (u/maybe? map? m)
             (println "Not a map:" m))]}
  (let [k (normalize-token k)]
    (loop [m m, [map-k & more, :as ks] (keys m)]
      (cond
        (not (seq ks)) m
        (= k (normalize-token map-k)) (recur (dissoc m map-k) more)
        :else                         (recur m                more)))))


;;; ---------------------------------------------------- Hashing -----------------------------------------------------

(defn- select-keys-for-hashing
  "Return QUERY with only the keys relevant to hashing kept.
  (This is done so irrelevant info or options that don't affect query results doesn't result in the same query
  producing different hashes.)"
  [query]
  {:pre [(map? query)]}
  (let [{:keys [constraints parameters], :as query} (select-keys query [:database :type :query :native :parameters
                                                                        :constraints])]
    (cond-> query
      (empty? constraints) (dissoc :constraints)
      (empty? parameters)  (dissoc :parameters))))

(defn query-hash
  "Return a 256-bit SHA3 hash of QUERY as a key for the cache. (This is returned as a byte array.)"
  [query]
  (hash/sha3-256 (json/generate-string (select-keys-for-hashing query))))


;;; --------------------------------------------- Query Source Card IDs ----------------------------------------------

(defn query->source-card-id
  "Return the ID of the Card used as the \"source\" query of this query, if applicable; otherwise return `nil`."
  ^Integer [outer-query]
  (let [source-table (get-in-normalized outer-query [:query :source-table])]
    (when (string? source-table)
      (when-let [[_ card-id-str] (re-matches #"^card__(\d+$)" source-table)]
        (Integer/parseInt card-id-str)))))

;;; ---------------------------------------- General Tree Manipulation Helpers ---------------------------------------

(defn postwalk-pred
  "Transform `form` by applying `f` to each node where `pred` returns true"
  [pred f form]
  (walk/postwalk (fn [node]
                   (if (pred node)
                     (f node)
                     node))
                 form))
