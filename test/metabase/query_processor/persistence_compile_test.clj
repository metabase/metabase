(ns metabase.query-processor.persistence-compile-test
  "Compile-level tests for persisted model substitution (#78240). Unlike
  [[metabase.query-processor.persistence-test]], these tests don't need a driver that supports `:persist-models`,
  because compilation only consults the `PersistedInfo` app-db record — no cache table has to actually exist. That
  means they run against the default (H2) test database, which is a `:sql-mbql5` driver."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.model-persistence.core :as model-persistence]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.metadata :as qp.metadata]
   [metabase.system.core :as system]
   [metabase.test :as mt]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- do-with-fake-persisted-model!
  "Create a model Card with `model-query` plus a PersistedInfo record that satisfies
  [[metabase.query-processor.util.persisted-cache/can-substitute?]] (matching query-hash and definition), without
  creating the actual cache table. Calls `(f model-id table-name)`."
  [model-query f]
  (let [result-metadata (-> model-query
                            #_{:clj-kondo/ignore [:deprecated-var]}
                            (qp.metadata/legacy-result-metadata nil))]
    (mt/with-temp [:model/Card {model-id :id} {:type            :model
                                               :database_id     (mt/id)
                                               :query_type      :query
                                               :dataset_query   model-query
                                               :result_metadata result-metadata}]
      ;; compute the hash and definition from the card as seen by the metadata provider, since that is exactly what
      ;; `can-substitute?` will compare against at query time
      (let [mp         (lib.metadata.jvm/application-database-metadata-provider (mt/id))
            card-md    (lib.metadata/card mp model-id)
            table-name (format "model_%d_test" model-id)]
        (mt/with-temp [:model/PersistedInfo _ {:card_id     model-id
                                               :database_id (mt/id)
                                               :table_name  table-name
                                               :query_hash  (model-persistence/query-hash (:dataset-query card-md))
                                               :definition  (model-persistence/metadata->definition
                                                             (:result-metadata card-md)
                                                             table-name)
                                               :active      true
                                               :state       "persisted"}]
          (f model-id table-name))))))

(defn- compile-query-on-model [model-id]
  ;; use a fresh metadata provider so the Card is fetched with the PersistedInfo created above
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
    (-> (lib/query mp (lib.metadata/card mp model-id))
        qp.compile/compile
        :query)))

(defn- check-substituted-sql [sql table-name]
  (let [cache-schema (ddl.i/schema-name {:id (mt/id)} (system/site-uuid))]
    (testing (format "\ncompiled SQL:\n%s\n" sql)
      (testing "cache table was substituted in"
        (is (str/includes? sql cache-schema))
        (is (str/includes? sql table-name)))
      (testing "the cache lookup replaces the model's own compiled query entirely"
        (is (not (str/includes? (u/lower-case-en sql) "orders"))))
      (testing "no SELECT jammed up directly against the cache-table subquery (#78240)"
        (is (not (re-find (re-pattern (str table-name "\"?\\s+SELECT")) sql)))))))

(deftest ^:synchronized multi-stage-persisted-model-compile-test
  (testing "Persisted multi-stage model used as a source compiles to a query on the cache table (#78240)"
    ;; two stages: summarize count by product-id, then filter count > 5 in a second stage
    (do-with-fake-persisted-model!
     (mt/mbql-query orders
       {:source-query {:source-table $$orders
                       :aggregation  [[:count]]
                       :breakout     [$product_id]}
        :filter       [:> *count/Integer 5]})
     (fn [model-id table-name]
       (check-substituted-sql (compile-query-on-model model-id) table-name)))))

(deftest ^:synchronized expression-persisted-model-compile-test
  (testing "Persisted model whose stage gets split by nest-expressions compiles to a query on the cache table (#78240)"
    ;; single stage, but the custom column means the SQL QP nests the expression into a sub-stage during preprocessing
    (do-with-fake-persisted-model!
     (mt/mbql-query orders
       {:expressions {"double_total" [:* $total 2]}
        :aggregation [[:count]]
        :breakout    [[:expression "double_total"]]})
     (fn [model-id table-name]
       (check-substituted-sql (compile-query-on-model model-id) table-name)))))
