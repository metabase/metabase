(ns metabase-enterprise.curated-search.reconcile-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.curated-search.index-table :as index-table]
   [metabase-enterprise.curated-search.reconcile :as reconcile]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.search :as tools.search]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest doc-id-test
  (testing "equal (entity_type, entity_local_id, doc_type, doc_text) tuples hash equal"
    (is (= (reconcile/doc-id "metric" 9 "name" "Revenue")
           (reconcile/doc-id "metric" 9 "name" "Revenue"))))
  (testing "each component changes the doc_id (instructions is deliberately not an input)"
    (let [d (reconcile/doc-id "metric" 9 "name" "Revenue")]
      (doseq [variant [(reconcile/doc-id "table"  9 "name"    "Revenue")
                       (reconcile/doc-id "metric" 8 "name"    "Revenue")
                       (reconcile/doc-id "metric" 9 "synonym" "Revenue")
                       (reconcile/doc-id "metric" 9 "name"    "Sales")]]
        (is (not= d variant) (pr-str variant))))))

(deftest format-embedding-rejects-invalid-values-test
  (testing "non-numbers, NaN and infinities are rejected before they reach a raw SQL literal"
    (doseq [bad [Double/NaN Double/POSITIVE_INFINITY Double/NEGATIVE_INFINITY "0.1"]]
      (is (thrown-with-msg? Exception #"invalid value"
                            (index-table/format-embedding [0.1 bad 0.3]))
          (pr-str bad)))
    (is (string? (index-table/format-embedding [0.1 -0.2 0.3])))))

(defmacro ^:private with-isolated-index
  "Run `body` with isolated pgvector tables bound and dropped afterwards, binding `ds-sym` to the
  pgvector datasource. Skips the body entirely when no pgvector store is configured."
  [[ds-sym] & body]
  `(when semantic.db.datasource/db-url
     (let [suffix# (System/nanoTime)
           ~ds-sym (semantic.db.datasource/ensure-initialized-data-source!)]
       (binding [index-table/*vectors-table* (str "library_entity_index_test_" suffix#)
                 index-table/*meta-table*    (str "library_entity_index_meta_test_" suffix#)]
         (try
           ~@body
           (finally
             (jdbc/execute! ~ds-sym [(str "DROP TABLE IF EXISTS "
                                          index-table/*vectors-table* ", "
                                          index-table/*meta-table*)])))))))

(defn- index-rows [ds]
  (jdbc/execute! ds
                 [(format "SELECT doc_id, entity_type, entity_local_id, doc_type, doc_text, instructions FROM \"%s\""
                          index-table/*vectors-table*)]
                 {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(defn- docs-for
  "Index rows describing one entity (robust to any other library content in the test appdb)."
  [ds entity-type entity-local-id]
  (filter #(and (= entity-type (:entity_type %)) (= entity-local-id (:entity_local_id %)))
          (index-rows ds)))

(deftest ^:sequential reconcile-lifecycle-test
  ;; :library lets us publish a Table into a library-data collection; the reconcile enumerates the
  ;; library tree via collections/library-collection + descendant-ids, so we build a real library root.
  (mt/with-premium-features #{:library :semantic-search}
    (with-isolated-index [ds]
      (let [model semantic.tu/mock-embedding-model]
        (mt/with-temp [:model/Collection {lib-id :id}     {:type "library" :location "/"}
                       :model/Collection {data-id :id}    {:type "library-data" :location (str "/" lib-id "/")}
                       :model/Collection {metrics-id :id}  {:type "library-metrics" :location (str "/" lib-id "/")}
                       :model/Database   {db-id :id}       {}
                       :model/Table      {table-id :id}    {:db_id db-id :collection_id data-id
                                                            :is_published true :active true
                                                            :name "orders" :display_name "Orders"
                                                            :description "All orders"}
                       :model/Card       {metric-id :id}   {:type "metric" :collection_id metrics-id
                                                            :name "Revenue" :description "Total revenue"
                                                            :database_id db-id}
                       :model/OsiAiContext {cse-id :id} {:entity {:model "table" :id table-id}
                                                         :ai_context {:instructions "Group by month."
                                                                      :synonyms ["sales" "revenue"]
                                                                      :examples ["orders last month"]}}]
          (testing "first run indexes name/description docs for every library entity, plus ai_context docs"
            (reconcile/reconcile! ds model)
            (testing "the published table: name + description + 2 synonyms + 1 example, all stamped with instructions"
              (let [docs (docs-for ds "table" table-id)]
                (is (= {"name" 1 "description" 1 "synonym" 2 "example" 1}
                       (frequencies (map :doc_type docs))))
                (is (= #{"Group by month."} (set (map :instructions docs))))
                (is (= #{"Orders"} (set (map :doc_text (filter #(= "name" (:doc_type %)) docs)))))))
            (testing "the library metric: name + description only, no ai_context, no instructions"
              (let [docs (docs-for ds "metric" metric-id)]
                (is (= {"name" 1 "description" 1} (frequencies (map :doc_type docs))))
                (is (= #{nil} (set (map :instructions docs)))))))
          (testing "an unchanged second run writes nothing"
            (is (=? {:inserted 0 :updated 0 :deleted 0} (reconcile/reconcile! ds model))))
          (testing "editing instructions updates rows in place — no doc_id changes, no re-embed"
            (let [before (set (map :doc_id (docs-for ds "table" table-id)))]
              (t2/update! :model/OsiAiContext cse-id
                          {:ai_context {:instructions "Group by week."
                                        :synonyms ["sales" "revenue"]
                                        :examples ["orders last month"]}})
              (is (=? {:inserted 0 :deleted 0} (reconcile/reconcile! ds model)))
              (let [after (docs-for ds "table" table-id)]
                (is (= before (set (map :doc_id after))) "doc_ids unchanged")
                (is (= #{"Group by week."} (set (map :instructions after))) "instructions refreshed"))))
          (testing "renaming the table mints a new name doc_id and GCs the old one"
            (let [old-name-id (->> (docs-for ds "table" table-id)
                                   (filter #(= "name" (:doc_type %))) first :doc_id)]
              (t2/update! :model/Table table-id {:display_name "Sales Orders"})
              (reconcile/reconcile! ds model)
              (let [names (filter #(= "name" (:doc_type %)) (docs-for ds "table" table-id))]
                (is (= 1 (count names)))
                (is (= "Sales Orders" (:doc_text (first names))))
                (is (not= old-name-id (:doc_id (first names)))))))
          (testing "unpublishing the table removes it from the library, GCing all its docs"
            (t2/update! :model/Table table-id {:is_published false})
            (reconcile/reconcile! ds model)
            (is (empty? (docs-for ds "table" table-id)))
            (is (seq (docs-for ds "metric" metric-id)) "the metric is untouched")))))))

(deftest ^:sequential rebuild-on-model-change-test
  (mt/with-premium-features #{:library :semantic-search}
    (with-isolated-index [ds]
      (let [model semantic.tu/mock-embedding-model]
        (mt/with-temp [:model/Collection {lib-id :id}  {:type "library" :location "/"}
                       :model/Collection {data-id :id} {:type "library-data" :location (str "/" lib-id "/")}
                       :model/Database   {db-id :id}    {}
                       :model/Table      {table-id :id} {:db_id db-id :collection_id data-id
                                                         :is_published true :active true
                                                         :name "orders" :display_name "Orders"}]
          (testing "populate the index under the original model"
            (reconcile/reconcile! ds model)
            (is (seq (docs-for ds "table" table-id))))
          (testing "a model-identity change drops the vectors table and the next run re-embeds everything"
            (let [new-model (assoc model :model-name "model-v2")]
              (is (= :rebuilt (index-table/ensure-tables! ds new-model)))
              (is (= [] (index-rows ds)))
              (reconcile/reconcile! ds new-model)
              (is (seq (docs-for ds "table" table-id)))
              (testing "a schema-version mismatch alone also triggers the rebuild"
                (jdbc/execute! ds [(format "UPDATE \"%s\" SET schema_version = schema_version - 1"
                                           index-table/*meta-table*)])
                (is (= :rebuilt (index-table/ensure-tables! ds new-model)))
                (is (= [] (index-rows ds))))
              (testing "the rebuild heals the meta row, so it doesn't recur on the next sync"
                (is (= :ok (index-table/ensure-tables! ds new-model)))))))))))

(defn- measure-definition [table-id field-id]
  (let [mp (mt/metadata-provider)]
    (lib/aggregate (lib/query mp (lib.metadata/table mp table-id))
                   (lib/sum (lib.metadata/field mp field-id)))))

(defn- segment-definition [table-id field-id value]
  (let [mp (mt/metadata-provider)]
    (lib/filter (lib/query mp (lib.metadata/table mp table-id))
                (lib/> (lib.metadata/field mp field-id) value))))

(deftest ^:sequential measures-and-segments-indexed-and-hydrated-test
  (testing "measures/segments on a published library table are indexed and hydrate with parent-table context"
    (mt/with-premium-features #{:library :semantic-search}
      (with-isolated-index [ds]
        (let [model  semantic.tu/mock-embedding-model
              orders (mt/id :orders)
              total  (mt/id :orders :total)]
          (mt/with-temp [:model/Collection {lib-id :id}  {:type "library" :location "/"}
                         :model/Collection {data-id :id} {:type "library-data" :location (str "/" lib-id "/")}
                         :model/Measure {measure-id :id} {:name "Order Revenue" :description "sum of order totals"
                                                          :table_id orders :creator_id (mt/user->id :crowberto)
                                                          :definition (measure-definition orders total)}
                         :model/Segment {segment-id :id} {:name "Big Orders" :description "totals over 100"
                                                          :table_id orders
                                                          :definition (segment-definition orders total 100)}]
            ;; publish the (real, fielded) orders table into the library for the duration of the test
            (mt/with-temp-vals-in-db :model/Table orders {:collection_id data-id :is_published true}
              (reconcile/reconcile! ds model)
              (testing "both are indexed with name + description docs"
                (is (= {"name" 1 "description" 1}
                       (frequencies (map :doc_type (docs-for ds "measure" measure-id)))))
                (is (= {"name" 1 "description" 1}
                       (frequencies (map :doc_type (docs-for ds "segment" segment-id))))))
              (testing "the tool hydrates them as first-class results carrying parent-table context"
                (mt/with-test-user :crowberto
                  (let [by-key (into {} (map (juxt (juxt :type :id) identity))
                                     (tools.search/entity-refs->search-results
                                      [{:model "measure" :id measure-id} {:model "segment" :id segment-id}]))]
                    (is (=? {:type "measure" :id measure-id :name "Order Revenue"
                             :database_id (mt/id) :base_table_id orders}
                            (get by-key ["measure" measure-id])))
                    (is (=? {:type "segment" :id segment-id :name "Big Orders"
                             :database_id (mt/id) :base_table_id orders}
                            (get by-key ["segment" segment-id])))))))))))))
