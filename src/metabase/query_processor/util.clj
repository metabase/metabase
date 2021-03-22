(ns metabase.query-processor.util
  "Utility functions used by the global query processor and middleware functions."
  (:require [buddy.core.codecs :as codecs]
            [buddy.core.hash :as hash]
            [cheshire.core :as json]
            [clojure.string :as str]
            [metabase.driver :as driver]
            [metabase.util.schema :as su]
            [schema.core :as s]))

;; TODO - I think most of the functions in this namespace that we don't remove could be moved to `metabase.mbql.util`

(defn ^:deprecated mbql-query? ;; not really needed anymore since we don't need to normalize tokens
  "Is the given query an MBQL query?
   DEPRECATED: just look at `:type` directly since it is guaranteed to be normalized?"
  [query]
  (= :query (keyword (:type query))))

(defn query-without-aggregations-or-limits?
  "Is the given query an MBQL query without a `:limit`, `:aggregation`, or `:page` clause?"
  [{{aggregations :aggregation, :keys [limit page]} :query}]
  (and (not limit)
       (not page)
       (nil? aggregations)))

(defn default-query->remark
  "Generates the default query remark. Exists as a separate function so that overrides of the query->remark multimethod
   can access the default value."
  [{{:keys [executed-by query-hash], :as info} :info, query-type :type}]
  (str "Metabase" (when executed-by
                    (assert (instance? (Class/forName "[B") query-hash))
                    (format ":: userID: %s queryType: %s queryHash: %s"
                            executed-by
                            (case (keyword query-type)
                              :query  "MBQL"
                              :native "native")
                            (codecs/bytes->hex query-hash)))))

(defmulti query->remark
  "Generate an appropriate remark `^String` to be prepended to a query to give DBAs additional information about the query
  being executed. See documentation for `mbql->native` and #2386.
  for more information."
  {:arglists '(^String [driver query])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod query->remark :default
  [_ query]
  (default-query->remark query))


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


;;; ---------------------------------------------------- Hashing -----------------------------------------------------

(defn- select-keys-for-hashing
  "Return `query` with only the keys relevant to hashing kept.
  (This is done so irrelevant info or options that don't affect query results doesn't result in the same query
  producing different hashes.)"
  [query]
  {:pre [(map? query)]}
  (let [{:keys [constraints parameters], :as query} (select-keys query [:database :type :query :native :parameters
                                                                        :constraints])]
    (cond-> query
      (empty? constraints) (dissoc :constraints)
      (empty? parameters)  (dissoc :parameters))))

(s/defn ^bytes query-hash :- (Class/forName "[B")
  "Return a 256-bit SHA3 hash of `query` as a key for the cache. (This is returned as a byte array.)"
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
