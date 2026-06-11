(ns metabase.metabot.tools.entity-details-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.metabot.tools.entity-details-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest get-document-details-invalid-document-id-test
  (testing "returns error for invalid document-id"
    (is (= {:output "invalid document_id"} (entity-details/get-document-details {:document-id "invalid"})))
    (is (= {:output "invalid document_id"} (entity-details/get-document-details {:document-id nil})))
    (is (= {:output "invalid document_id"} (entity-details/get-document-details {:document-id 1.5})))))

(deftest get-document-details-valid-document-test
  (testing "returns document details for valid document-id"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                   :model/Document {doc-id :id} {:name "Test Document"
                                                 :document "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Hello World\"}]}]}"
                                                 :collection_id coll-id
                                                 :creator_id (mt/user->id :crowberto)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (entity-details/get-document-details {:document-id doc-id})]
          (is (contains? result :structured-output))
          (let [doc-info (:structured-output result)]
            (is (= doc-id (:id doc-info)))
            (is (= "Test Document" (:name doc-info)))
            (is (= {:content [{:content [{:text "Hello World", :type "text"}], :type "paragraph"}], :type "doc"}
                   (:document doc-info)))))))))

(deftest get-document-details-nonexistent-document-test
  (testing "returns 'document not found' for non-existent document"
    (let [result (entity-details/get-document-details {:document-id 99999})]
      (is (= {:output "error fetching document: Not found."} result)))))

(deftest get-document-details-archived-document-test
  (testing "returns document details for archived document"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                   :model/Document {doc-id :id} {:name "Archived Document"
                                                 :document "{\"type\":\"doc\",\"content\":[]}"
                                                 :collection_id coll-id
                                                 :creator_id (mt/user->id :crowberto)
                                                 :archived true}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (entity-details/get-document-details {:document-id doc-id})]
          (is (contains? result :structured-output))
          (let [doc-info (:structured-output result)]
            (is (= doc-id (:id doc-info)))
            (is (= "Archived Document" (:name doc-info)))
            (is (= {:content [], :type "doc"} (:document doc-info)))))))))

(deftest get-document-details-minimal-document-test
  (testing "returns document details for document with minimal fields"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Minimal Document"
                                                 :document "{\"type\":\"doc\"}"
                                                 :creator_id (mt/user->id :crowberto)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (entity-details/get-document-details {:document-id doc-id})]
          (is (contains? result :structured-output))
          (let [doc-info (:structured-output result)]
            (is (= doc-id (:id doc-info)))
            (is (= "Minimal Document" (:name doc-info)))
            (is (= {:type "doc"} (:document doc-info)))))))))

(deftest get-document-details-empty-document-content-test
  (testing "returns document details for document with empty content"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Empty Document"
                                                 :document ""
                                                 :creator_id (mt/user->id :crowberto)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (entity-details/get-document-details {:document-id doc-id})]
          (is (contains? result :structured-output))
          (let [doc-info (:structured-output result)]
            (is (= doc-id (:id doc-info)))
            (is (= "Empty Document" (:name doc-info)))
            (is (= nil (:document doc-info)))))))))

(deftest get-document-no-user-access-test
  (testing "does not return details if the user can't access the document"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Document {doc-id :id} {:name "Empty Document"
                                                   :document ""
                                                   :creator_id (mt/user->id :crowberto)}]
        (mt/with-current-user (mt/user->id :rasta)
          (is (= {:output "error fetching document: You don't have permissions to do that."}
                 (entity-details/get-document-details {:document-id doc-id}))))))))

(deftest get-query-details-mbql-v4-test
  (testing "get-query-details works with MBQL v4 (legacy) queries"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [legacy-query {:database (mt/id)
                            :type :query
                            :query {:source-table (mt/id :venues)
                                    :limit 10}}
              result (entity-details/get-query-details {:query legacy-query})]
          (is (contains? result :structured-output))
          (let [output (:structured-output result)]
            (is (= :query (:type output)))
            (is (string? (:query-id output)))
            (is (map? (:query output)))
            (is (= (mt/id) (get-in output [:query :database])))
            (is (sequential? (:result-columns output)))
            (is (pos? (count (:result-columns output))))))))))

(deftest get-query-details-mbql-v5-test
  (testing "get-query-details works with MBQL v5 queries"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [mbql-v5-query (lib/query (mt/metadata-provider) (mt/mbql-query venues {:limit 10}))
              result (entity-details/get-query-details {:query mbql-v5-query})]
          (is (contains? result :structured-output))
          (let [output (:structured-output result)]
            (is (= :query (:type output)))
            (is (string? (:query-id output)))
            (is (map? (:query output)))
            (is (= (mt/id) (get-in output [:query :database])))
            (is (sequential? (:result-columns output)))
            (is (pos? (count (:result-columns output))))))))))

(deftest get-query-details-native-query-test
  (testing "get-query-details works with native queries"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [native-query (lib/native-query (mt/metadata-provider) "SELECT * FROM VENUES LIMIT 10")
              result (entity-details/get-query-details {:query native-query})]
          (is (contains? result :structured-output))
          (let [output (:structured-output result)]
            (is (= :query (:type output)))
            (is (string? (:query-id output)))
            (is (map? (:query output)))
            (is (= (mt/id) (get-in output [:query :database])))
            (is (sequential? (:result-columns output)))))))))

(deftest related-tables-exclude-implicitly-joinable-fields-test
  (testing "Related tables should only include fields from the table itself, not implicitly joinable fields"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [orders-id (mt/id :orders)
              products-id (mt/id :products)
              ;; Get expected field count for Products table (without implicitly joinable fields)
              products-query (lib/query (mt/metadata-provider) (mt/mbql-query products))
              expected-products-field-count (count (lib/visible-columns products-query -1 {:include-implicitly-joinable? false}))
              ;; Get Orders table details with related tables
              result (entity-details/get-table-details {:entity-type :table
                                                        :entity-id orders-id})
              output (:structured-output result)
              related-tables (:related_tables output)
              products-related (first (filter #(= products-id (:id %)) related-tables))]
          (testing "Orders table has Products as a related table"
            (is (some? products-related)))
          (testing "Related Products table has correct number of fields (excluding implicitly joinable fields)"
            (is (= expected-products-field-count
                   (count (:fields products-related)))
                (str "Products related table should have " expected-products-field-count
                     " fields (only its own fields, not implicitly joinable fields)"))))))))

(defn- measure-definition
  "Create an MBQL5 measure definition with a sum aggregation."
  [table-id field-id]
  (let [mp (mt/metadata-provider)
        table (lib.metadata/table mp table-id)
        query (lib/query mp table)
        field (lib.metadata/field mp field-id)]
    (lib/aggregate query (lib/sum field))))

(defn- segment-definition
  "Create an MBQL5 segment definition with a filter."
  [table-id field-id value]
  (let [mp (mt/metadata-provider)
        table (lib.metadata/table mp table-id)
        query (lib/query mp table)
        field (lib.metadata/field mp field-id)]
    (lib/filter query (lib/> field value))))

(deftest get-table-details-with-measures-test
  (testing "get-table-details returns measures when with_measures is true"
    (let [measure-def (measure-definition (mt/id :orders) (mt/id :orders :total))]
      (mt/with-temp [:model/Measure {measure-id :id} {:name       "Total Revenue"
                                                      :table_id   (mt/id :orders)
                                                      :definition measure-def}]
        (mt/with-current-user (mt/user->id :crowberto)
          (testing "with_measures: false (default) does not include measures"
            (let [result (entity-details/get-table-details {:entity-type :table
                                                            :entity-id (mt/id :orders)})
                  output (:structured-output result)]
              (is (nil? (:measures output)))))
          (testing "with_measures: true includes measures for the table"
            (let [result (entity-details/get-table-details {:entity-type :table
                                                            :entity-id (mt/id :orders)
                                                            :with-measures? true})
                  output (:structured-output result)
                  measures (:measures output)]
              (is (sequential? measures))
              (is (= 1 (count measures)))
              (let [measure (first measures)
                    definition (:definition measure)]
                (is (= measure-id (:id measure)))
                (is (= "Total Revenue" (:name measure)))
                (is (string? (:definition-description measure)))
                (testing "portable_entity_id is surfaced (21-char NanoID for `[measure, {}, <pid>]` clauses)"
                  (is (string? (:portable-entity-id measure)))
                  (is (= 21 (count (:portable-entity-id measure)))))
                (testing "definition is a portable aggregation clause array"
                  (is (vector? definition))
                  (is (= 1 (count definition))
                      "measures have exactly one aggregation clause")
                  (let [[head opts arg] (first definition)]
                    (is (= "sum" head) "head is a string operator")
                    (is (map? opts) "options map at position 1")
                    (is (= "field" (first arg)) "argument is a field clause")
                    (is (vector? (nth arg 2))
                        "field's FK is a portable string array (not numeric id)")
                    (is (every? (some-fn string? nil?) (nth arg 2))
                        "every portable FK segment is a string (or null for schemaless)")))))))))))

(deftest get-table-details-with-segments-test
  (testing "get-table-details returns segments when with_segments is true"
    (let [segment-def (segment-definition (mt/id :orders) (mt/id :orders :total) 100)]
      (mt/with-temp [:model/Segment {segment-id :id} {:name       "High Value Orders"
                                                      :table_id   (mt/id :orders)
                                                      :definition segment-def}]
        (mt/with-current-user (mt/user->id :crowberto)
          (testing "with_segments: false (default) does not include segments"
            (let [result (entity-details/get-table-details {:entity-type :table
                                                            :entity-id (mt/id :orders)})
                  output (:structured-output result)]
              (is (nil? (:segments output)))))
          (testing "with_segments: true includes segments for the table"
            (let [result (entity-details/get-table-details {:entity-type :table
                                                            :entity-id (mt/id :orders)
                                                            :with-segments? true})
                  output (:structured-output result)
                  segments (:segments output)]
              (is (sequential? segments))
              (is (= 1 (count segments)))
              (let [segment (first segments)
                    definition (:definition segment)]
                (is (= segment-id (:id segment)))
                (is (= "High Value Orders" (:name segment)))
                (is (string? (:definition-description segment)))
                (testing "portable_entity_id is surfaced (21-char NanoID for `[segment, {}, <pid>]` clauses)"
                  (is (string? (:portable-entity-id segment)))
                  (is (= 21 (count (:portable-entity-id segment)))))
                (testing "definition is a portable filter clause array"
                  (is (vector? definition))
                  (is (>= (count definition) 1)
                      "segments have one or more filter clauses")
                  (let [[head opts field-clause value] (first definition)]
                    (is (= ">" head) "head is a string operator")
                    (is (map? opts) "options map at position 1")
                    (is (= "field" (first field-clause)) "argument is a field clause")
                    (is (vector? (nth field-clause 2))
                        "field's FK is a portable string array")
                    (is (= 100 value) "literal comparison value is preserved")))))))))))

(deftest measure-segment-definition-round-trips-through-construct-test
  (testing (str "the exported measure/segment definition is in the exact portable form "
                "an agent can paste into construct_notebook_query's external-query — "
                "regression test for benchmark/5 Tables - Measures and Segments failures")
    (let [measure-def (measure-definition (mt/id :orders) (mt/id :orders :total))
          segment-def (segment-definition (mt/id :orders) (mt/id :orders :total) 100)
          table-fk    [(:name (lib.metadata/database (mt/metadata-provider)))
                       (:schema (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))
                       "ORDERS"]]
      (mt/with-temp [:model/Measure _ {:name "Round-trip Measure"
                                       :table_id (mt/id :orders)
                                       :definition measure-def}
                     :model/Segment _ {:name "Round-trip Segment"
                                       :table_id (mt/id :orders)
                                       :definition segment-def}]
        (mt/with-current-user (mt/user->id :crowberto)
          (let [result   (entity-details/get-table-details
                          {:entity-type :table :entity-id (mt/id :orders)
                           :with-measures? true :with-segments? true})
                output   (:structured-output result)
                m-clause (-> output :measures first :definition)
                s-clause (-> output :segments first :definition)
                ;; Simulate the agent pasting these clauses into a fresh external-query.
                fresh-query {:lib/type "mbql/query"
                             :stages [{:lib/type "mbql.stage/mbql"
                                       :source-table table-fk
                                       :aggregation m-clause
                                       :filters s-clause}]}]
            (testing "external-query containing the pasted clauses resolves cleanly"
              ;; require the construct-tool pipeline lazily — it's the agent-facing entry point
              (let [repr      (requiring-resolve 'metabase.agent-lib.representations/external-query->portable)
                    repair    (requiring-resolve 'metabase.agent-lib.representations.repair/repair)
                    resolve-q (requiring-resolve 'metabase.agent-lib.representations.resolve/resolve-query)
                    mp        ((requiring-resolve 'metabase.lib-be.core/application-database-metadata-provider) (mt/id))
                    cs        @(requiring-resolve 'metabase.models.serialization.resolve.mp/unchecked-app-db-content-store)
                    portable  (repr fresh-query)
                    repaired  (repair mp portable cs)
                    resolved  (resolve-q mp repaired cs)]
                (is (= :mbql/query (:lib/type resolved)))
                (is (= 1 (count (get-in resolved [:stages 0 :aggregation]))))
                (is (= 1 (count (get-in resolved [:stages 0 :filters]))))))))))))

(deftest measure-segment-opaque-id-clause-round-trips-test
  (testing (str "the `portable_entity_id` surfaced on `<measure>` / `<segment>` can be used in "
                "`[measure, {}, pid]` / `[segment, {}, pid]` clauses end-to-end — regression "
                "test for benchmark/6 Tables-MS rubric (data_source must reference the ids)")
    (let [measure-def (measure-definition (mt/id :orders) (mt/id :orders :total))
          segment-def (segment-definition (mt/id :orders) (mt/id :orders :total) 100)
          table-fk    [(:name (lib.metadata/database (mt/metadata-provider)))
                       (:schema (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))
                       "ORDERS"]]
      (mt/with-temp [:model/Measure {measure-id :id measure-pid :entity_id}
                     {:name "Opaque Measure"
                      :table_id (mt/id :orders)
                      :definition measure-def}
                     :model/Segment {segment-id :id segment-pid :entity_id}
                     {:name "Opaque Segment"
                      :table_id (mt/id :orders)
                      :definition segment-def}]
        (mt/with-current-user (mt/user->id :crowberto)
          (let [;; Mirrors what the agent does: paste `[measure, {}, "<pid>"]` and
                ;; `[segment, {}, "<pid>"]` into a fresh external-query and send it.
                fresh-query {:lib/type "mbql/query"
                             :stages [{:lib/type "mbql.stage/mbql"
                                       :source-table table-fk
                                       :aggregation [["measure" {} measure-pid]]
                                       :filters [["segment" {} segment-pid]]}]}
                repr      (requiring-resolve 'metabase.agent-lib.representations/external-query->portable)
                repair    (requiring-resolve 'metabase.agent-lib.representations.repair/repair)
                resolve-q (requiring-resolve 'metabase.agent-lib.representations.resolve/resolve-query)
                mp        ((requiring-resolve 'metabase.lib-be.core/application-database-metadata-provider) (mt/id))
                cs        @(requiring-resolve 'metabase.models.serialization.resolve.mp/unchecked-app-db-content-store)
                portable  (repr fresh-query)
                repaired  (repair mp portable cs)
                resolved  (resolve-q mp repaired cs)]
            (testing "measure clause resolves to numeric id (rubric's `data_source` check)"
              (let [agg (get-in resolved [:stages 0 :aggregation])]
                (is (= 1 (count agg)))
                (is (= :measure (first (first agg))))
                (is (= measure-id (nth (first agg) 2)))))
            (testing "segment clause resolves to numeric id"
              (let [filters (get-in resolved [:stages 0 :filters])]
                (is (= 1 (count filters)))
                (is (= :segment (first (first filters))))
                (is (= segment-id (nth (first filters) 2)))))))))))

(deftest get-table-details-measures-scoped-to-table-test
  (testing "get-table-details only returns measures for the requested table, not other tables"
    (let [orders-measure-def (measure-definition (mt/id :orders) (mt/id :orders :total))
          products-measure-def (measure-definition (mt/id :products) (mt/id :products :price))]
      (mt/with-temp [:model/Measure {orders-measure-id :id} {:name       "Orders Total"
                                                             :table_id   (mt/id :orders)
                                                             :definition orders-measure-def}
                     :model/Measure {_products-measure-id :id} {:name       "Products Price"
                                                                :table_id   (mt/id :products)
                                                                :definition products-measure-def}]
        (mt/with-current-user (mt/user->id :crowberto)
          (let [result (entity-details/get-table-details {:entity-type :table
                                                          :entity-id (mt/id :orders)
                                                          :with-measures? true})
                output (:structured-output result)
                measures (:measures output)]
            (is (= 1 (count measures)))
            (is (= orders-measure-id (:id (first measures))))))))))

(deftest get-metric-details-with-segments-test
  (testing "get-metric-details returns segments when with_segments is true"
    ;; Note: lib/available-segments requires the query to have a direct source-table-id.
    ;; For metrics, this means the underlying card must be based on a table (not another card).
    (let [mp (mt/metadata-provider)
          metric-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                           (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders :total)))))
          segment-def (segment-definition (mt/id :orders) (mt/id :orders :total) 50)]
      (mt/with-temp [:model/Card {metric-id :id} {:dataset_query metric-query
                                                  :database_id   (mt/id)
                                                  :name          "Total Orders"
                                                  :type          :metric}
                     :model/Segment {segment-id :id} {:name       "Large Orders"
                                                      :table_id   (mt/id :orders)
                                                      :definition segment-def}]
        (mt/with-current-user (mt/user->id :crowberto)
          (testing "with_segments: false (default) does not include segments"
            (let [result (entity-details/get-metric-details {:metric-id metric-id})
                  output (:structured-output result)]
              (is (nil? (:segments output)))))
          (testing "with_segments: true includes segments for the metric"
            (let [result (entity-details/get-metric-details {:metric-id metric-id
                                                             :with-segments? true})
                  output (:structured-output result)
                  segments (:segments output)]
              (is (sequential? segments))
              (is (= 1 (count segments)))
              (let [segment (first segments)]
                (is (= segment-id (:id segment)))
                (is (= "Large Orders" (:name segment)))))))))))

;;; ============================================================
;;; Base-table surfacing on get-metric-details (regression)
;;; ============================================================

(deftest get-metric-details-exposes-base-table-test
  (testing (str "get-metric-details must populate `:base_table_id`, `:base_table_name`, and\n"
                "`:base_table_portable_fk` so the LLM can write `source-table:` verbatim.\n"
                "Regression: earlier code read `(some-> (:dataset-query card) :query :source-table)`,\n"
                "which silently produced nil because the t2 row uses `:dataset_query` (snake_case)\n"
                "and the query is MBQL 5 with `:stages[0] :source-table`, not legacy `:query`.\n"
                "The fix reads `:table_id` directly from the card row.")
    (let [mp (mt/metadata-provider)
          metric-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                           (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders :total)))))]
      (mt/with-temp [:model/Card {metric-id :id} {:dataset_query metric-query
                                                  :database_id   (mt/id)
                                                  :name          "Base-table Sample Metric"
                                                  :type          :metric}]
        (mt/with-current-user (mt/user->id :crowberto)
          (let [output  (:structured-output (entity-details/get-metric-details
                                             {:metric-id metric-id
                                              :with-queryable-dimensions? false
                                              :with-field-values? false}))
                db-name (t2/select-one-fn :name :model/Database :id (mt/id))
                orders  (t2/select-one [:model/Table :schema :name] :id (mt/id :orders))]
            (is (= (mt/id :orders) (:base_table_id output)))
            (is (= (:name orders)  (:base_table_name output)))
            (is (= [db-name (:schema orders) (:name orders)]
                   (:base_table_portable_fk output))
                "portable FK should be `[database_name, schema, table_name]`")))))))

;;; ============================================================
;;; Portable entity_id in card details (step 11.2)
;;; ============================================================

(deftest get-entity-details-question-exposes-portable-entity-id-test
  (testing "card details (question) expose :portable_entity_id for the agent to use in source-card"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Card {card-id :id card-eid :entity_id}
                       {:database_id  (mt/id)
                        :type         :question
                        :name         "My Saved Q"
                        :dataset_query {:database (mt/id)
                                        :type     :query
                                        :query    {:source-table (mt/id :venues)}}}]
          (let [result (entity-details/get-table-details {:entity-type :question :entity-id card-id})
                output (:structured-output result)]
            (is (= :question (:type output)))
            (is (= card-id (:id output)))
            (is (= card-eid (:portable_entity_id output)))
            (is (string? (:portable_entity_id output)))))))))

(deftest get-entity-details-model-exposes-portable-entity-id-test
  (testing "card details (model) also expose :portable_entity_id"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Card {card-id :id card-eid :entity_id}
                       {:database_id  (mt/id)
                        :type         :model
                        :name         "My Model"
                        :dataset_query {:database (mt/id)
                                        :type     :query
                                        :query    {:source-table (mt/id :venues)}}}]
          (let [result (entity-details/get-table-details {:entity-type :model :entity-id card-id})
                output (:structured-output result)]
            (is (= :model (:type output)))
            (is (= card-id (:id output)))
            (is (= card-eid (:portable_entity_id output)))))))))

(deftest card-details-exposes-query-json-structured-test
  (testing "card-details surfaces the saved structured query as a portable representations map"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Card {card-id :id}
                       {:database_id  (mt/id)
                        :type         :question
                        :name         "Venues by Price"
                        :dataset_query (mt/mbql-query venues {:aggregation [[:count]]
                                                              :breakout    [$price]})}]
          (let [output (-> (entity-details/get-table-details {:entity-type :question :entity-id card-id})
                           :structured-output)
                exported (:query_json output)]
            (is (map? exported)
                "`:query_json` is present for an MBQL question")
            (is (= "mbql/query" (get exported "lib/type")))
            ;; Portable FK paths use the human-readable database name, not numeric ids.
            (is (vector? (get-in exported ["stages" 0 "source-table"])))
            (is (not (contains? exported "lib/metadata")))))))))

(deftest card-details-exposes-query-json-native-test
  (testing "card-details surfaces native saved queries as a portable repr map, preserving the SQL inside"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Card {card-id :id}
                       {:database_id  (mt/id)
                        :type         :question
                        :name         "Native Venues"
                        :dataset_query {:database (mt/id)
                                        :type     :native
                                        :native   {:query "SELECT * FROM VENUES LIMIT 5"}}}]
          (let [output (-> (entity-details/get-table-details {:entity-type :question :entity-id card-id})
                           :structured-output)
                exported (:query_json output)]
            (is (map? exported))
            (is (= "mbql/query" (get exported "lib/type")))
            (is (= "mbql.stage/native" (get-in exported ["stages" 0 "lib/type"]))
                "native stage is exported in the canonical repr form, not as a bare SQL string")
            (is (= "SELECT * FROM VENUES LIMIT 5"
                   (get-in exported ["stages" 0 "native"]))
                "the SQL body itself is preserved verbatim inside `native:`")))))))

(deftest get-report-details-includes-query-json-test
  (testing "get-report-details (slim payload) carries `:query_json` so question->xml can render it"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Card {card-id :id}
                       {:database_id  (mt/id)
                        :type         :question
                        :name         "Q"
                        :dataset_query (mt/mbql-query venues {:limit 3})}]
          (let [output (-> (entity-details/get-report-details {:report-id card-id})
                           :structured-output)]
            (is (map? (:query_json output)))
            (is (= "mbql/query" (get-in output [:query_json "lib/type"])))))))))
