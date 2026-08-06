(ns metabase.query-processor.schema-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase.api.macros :as api.macros]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.schema :as lib.schema]
   [metabase.query-processor.schema :as qp.schema]))

(set! *warn-on-reflection* true)

(defn- top-level-keys
  "The keys `schema` names at the top level, unioned across `:and`/`:merge`/`:maybe` branches and through refs."
  [schema]
  (let [schema (mc/schema schema)]
    (case (mc/type schema)
      :map          (into #{} (map first) (mc/children schema))
      (:and :merge) (into #{} (mapcat top-level-keys) (mc/children schema))
      :maybe        (top-level-keys (first (mc/children schema)))
      (if (mc/-ref-schema? schema)
        (top-level-keys (mc/deref schema))
        #{}))))

(deftest ^:parallel query-top-level-keys-test
  (testing (str "Every key the legacy and MBQL 5 query schemas name has to be named by `::qp.schema/any-query` too, "
                "or an API endpoint taking a query as its body will drop it from the request. Add the key to "
                "`::qp.schema/any-query` as well as to the schema you are extending.")
    (are [schema] (empty? (set/difference (top-level-keys schema)
                                          (top-level-keys ::qp.schema/any-query)))
      ::mbql.s/Query
      ::lib.schema/query)))

(deftest ^:parallel any-query-does-not-coerce-test
  (testing (str "Decoding a query as an API param must not normalize it. `::any-query` is a pre-normalization "
                "schema, and callers downstream compare against the un-normalized values -- "
                "`metabase.query-processor.api/run-streaming-query` checks `:type` against the string \"internal\", "
                "so coercing it to a keyword here 400s every internal audit app query.")
    (let [decode (#'api.macros/decoder (api.macros/closed-params-schema ::qp.schema/any-query))]
      (testing "a string stays a string"
        (are [query] (= query (decode query))
          ;; the shape the audit app posts to `POST /api/dataset`
          {:type "internal", :fn "metabase-enterprise.audit-app.pages.queries/bad-table", :args [nil "x"]
           :limit 1, :offset 0}
          {:database 1, :type "query", :query {:source-table 1}}
          {:database 1, :lib/type "mbql/query", :stages []}))
      (testing "a keyword stays a keyword"
        (are [query] (= query (decode query))
          {:database 1, :type :query, :query {:source-table 1}}
          {:database 1, :lib/type :mbql/query, :stages []})))))

(deftest ^:parallel query-top-level-keys-justification-test
  (testing "keys no other schema names are the ones needing their own justification in the docstring"
    (is (= #{;; internal audit app queries
             :fn :args :limit :offset
             ;; set by the QP rather than a client
             :cache-strategy :viz-settings}
           (set/difference (top-level-keys ::qp.schema/any-query)
                           (top-level-keys ::mbql.s/Query)
                           (top-level-keys ::lib.schema/query))))))
