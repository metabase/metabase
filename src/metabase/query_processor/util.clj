(ns metabase.query-processor.util
  "Utility functions used by the global query processor and middleware functions."
  (:require [buddy.core
             [codecs :as codecs]
             [hash :as hash]]
            [cheshire.core :as json]
            [clojure
             [string :as str]
             [walk :as walk]]
            [metabase.util.schema :as su]
            [schema.core :as s]))

;; TODO - I think most of the functions in this namespace that we don't remove could be moved to `metabase.mbql.util`

(defn ^:deprecated mbql-query? ;; not really needed anymore since we don't need to normalize tokens
  "Is the given query an MBQL query?"
  [query]
  (= :query (keyword (:type query))))

(defn ^:deprecated datetime-field?
  "Is FIELD a `DateTime` field?
   (DEPRECATED because this only works for expanded queries.)"
  [{:keys [base-type special-type]}]
  (or (isa? base-type :type/DateTime)
      (isa? special-type :type/DateTime)))

(defn query-without-aggregations-or-limits?
  "Is the given query an MBQL query without a `:limit`, `:aggregation`, or `:page` clause?"
  [{{aggregations :aggregation, :keys [limit page]} :query}]
  (and (not limit)
       (not page)
       (nil? aggregations)))

(defn query->remark
  "Generate an approparite REMARK to be prepended to a query to give DBAs additional information about the query being
  executed. See documentation for `mbql->native` and [issue #2386](https://github.com/metabase/metabase/issues/2386)
  for more information."
  ^String [{{:keys [executed-by query-hash query-type], :as info} :info}]
  (str "Metabase" (when info
                    (assert (instance? (Class/forName "[B") query-hash))
                    (format ":: userID: %s queryType: %s queryHash: %s"
                            executed-by query-type (codecs/bytes->hex query-hash)))))


;;; ------------------------------------------------- Normalization --------------------------------------------------

;; TODO - this has been moved to `metabase.mbql.util`; use that implementation instead.
(s/defn ^:deprecated normalize-token :- s/Keyword
  "Convert a string or keyword in various cases (`lisp-case`, `snake_case`, or `SCREAMING_SNAKE_CASE`) to a lisp-cased
  keyword."
  [token :- su/KeywordOrString]
  (-> (name token)
      str/lower-case
      (str/replace #"_" "-")
      keyword))

(defn get-in-query
  "Similar to `get-in` but will look in either `:query` or recursively in `[:query :source-query]`. Using
  this function will avoid having to check if there's a nested query vs. top-level query."
  ([m ks]
   (get-in-query m ks nil))
  ([m ks not-found]
   (if-let [source-query (get-in m [:query :source-query])]
     (recur (assoc m :query source-query) ks not-found)
     (get-in m (cons :query ks) not-found))))

(defn assoc-in-query
  "Similar to `assoc-in but will look in either `:query` or recursively in `[:query :source-query]`. Using
  this function will avoid having to check if there's a nested query vs. top-level query."
  [m ks v]
  (if-let [source-query (get-in m [:query :source-query])]
    ;; We have a soure-query, we need to recursively `assoc-in` with the source query as the query
    (assoc-in m
              [:query :source-query]
              (-> (assoc m :query source-query)
                  (assoc-in-query ks v)
                  :query))
    (assoc-in m (cons :query ks) v)))


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
  (let [source-table (get-in outer-query [:query :source-table])]
    (when (string? source-table)
      (when-let [[_ card-id-str] (re-matches #"^card__(\d+$)" source-table)]
        (Integer/parseInt card-id-str)))))


;;; ---------------------------------------- General Tree Manipulation Helpers ---------------------------------------

(defn ^:deprecated postwalk-pred
  "Transform `form` by applying `f` to each node where `pred` returns true

  DEPRECATED: use `mbql.u/replace-clauses` instead, or if that's not sophisticated enough, use a `clojure.walk` fn
  directly."
  [pred f form]
  (walk/postwalk (fn [node]
                   (if (pred node)
                     (f node)
                     node))
                 form))

(defn ^:deprecated postwalk-collect
  "Invoke `collect-fn` on each node satisfying `pred`. If `collect-fn` returns a value, accumulate that and return the
  results.

  DEPRECATED: Use `mbql.u/clause-instances` instead to find all instances of a clause."
  [pred collect-fn form]
  (let [results (atom [])]
    (postwalk-pred pred
                   (fn [node]
                     (when-let [result (collect-fn node)]
                       (swap! results conj result))
                     node)
                   form)
    @results))
