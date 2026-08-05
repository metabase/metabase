(ns metabase.query-processor.schema-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [malli.core :as mc]
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
  (testing (str "Every key the legacy and MBQL 5 query schemas name has to be in "
                "[[qp.schema/query-top-level-keys]], or an API endpoint taking a query as its body will drop it "
                "from the request. Add the key there as well as to the schema.")
    (are [schema] (empty? (set/difference (top-level-keys schema) qp.schema/query-top-level-keys))
      ::mbql.s/Query
      ::lib.schema/query))
  (testing "keys that no schema names are the ones needing their own justification in the docstring"
    (is (= #{;; internal audit app queries
             :fn :args :limit :offset
             ;; set by the QP rather than a client
             :cache-strategy :viz-settings}
           (set/difference qp.schema/query-top-level-keys
                           (top-level-keys ::mbql.s/Query)
                           (top-level-keys ::lib.schema/query))))))
