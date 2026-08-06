(ns metabase.query-processor.schema-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.legacy-mbql.schema :as mbql.s]
   ;; `::lib.schema/query` refers to `::lib.metadata.protocols/metadata-provider`, which is only in the registry once
   ;; that namespace is loaded -- without this require the schema below fails to resolve
   [metabase.lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util.malli.registry :as mr]))

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
  (testing (str "Every key the legacy and MBQL 5 query schemas name has to be named by `::qp.schema/any-query` too. "
                "`::qp.schema/api-query` closes against those keys, so one missing here is a param an endpoint "
                "taking a query as its body would reject. Add the key to `::any-query` as well as to the schema you "
                "are extending.")
    (are [schema] (empty? (set/difference (top-level-keys schema)
                                          (top-level-keys ::qp.schema/any-query)))
      ::mbql.s/Query
      ::lib.schema/query))
  (testing "keys no other schema names are the ones needing their own justification in the docstring"
    (is (= #{;; internal audit app queries
             :fn :args :limit :offset
             ;; set by the QP rather than a client
             :cache-strategy :viz-settings}
           (set/difference (top-level-keys ::qp.schema/any-query)
                           (top-level-keys ::mbql.s/Query)
                           (top-level-keys ::lib.schema/query))))))

(deftest ^:parallel api-query-test
  (testing "closes against the keys `::any-query` names, without loosening the constraints it carries"
    (are [valid? query] (= valid? (mr/validate ::qp.schema/api-query query))
      true  {:database 1, :type "query", :query {:source-table 1}}
      true  {:database 1, :lib/type "mbql/query", :stages []}
      ;; an internal query names no database and runs a named function instead
      true  {:type "internal", :fn "some.namespace/a-query", :args [], :limit 1}
      false {:database 1, :type :query, :query {}, :sneaky 1}
      ;; the `[:fn ...]` branches still apply
      false {:database 1, :query {}}))
  (testing "`::any-query` stays open, for a query carrying keys that cannot be set over HTTP"
    (is (mr/validate ::qp.schema/any-query {:database 1, :type :query, :query {}, :sneaky 1}))))

(deftest ^:parallel api-query-does-not-coerce-test
  (testing (str "A schema used for an API param is decoded, not just validated, and a query may not be normalized "
                "yet. Coercing `:type` to a keyword here would rewrite the query into a form that no longer matches "
                "its unnormalized shape.")
    (are [query] (= query (mc/decode ::qp.schema/api-query query (mtx/string-transformer)))
      {:type "internal", :fn "a/b", :args []}
      {:database 1, :type "query", :query {:source-table 1}}
      {:database 1, :lib/type "mbql/query", :stages []}
      {:database 1, :type :query, :query {:source-table 1}})))
