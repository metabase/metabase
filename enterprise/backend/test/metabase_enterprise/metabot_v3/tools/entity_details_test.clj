(ns metabase-enterprise.metabot-v3.tools.entity-details-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.entity-details :as entity-details]
   [metabase-enterprise.test :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
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
              result (entity-details/get-table-details {:table-id orders-id})
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
            (let [result (entity-details/get-table-details {:table-id (mt/id :orders)})
                  output (:structured-output result)]
              (is (nil? (:measures output)))))

          (testing "with_measures: true includes measures for the table"
            (let [result (entity-details/get-table-details {:table-id (mt/id :orders)
                                                            :with-measures? true})
                  output (:structured-output result)
                  measures (:measures output)]
              (is (sequential? measures))
              (is (= 1 (count measures)))
              (let [measure (first measures)]
                (is (= measure-id (:id measure)))
                (is (= "Total Revenue" (:name measure)))
                (is (map? (:definition measure)))))))))))

(deftest get-table-details-with-segments-test
  (testing "get-table-details returns segments when with_segments is true"
    (let [segment-def (segment-definition (mt/id :orders) (mt/id :orders :total) 100)]
      (mt/with-temp [:model/Segment {segment-id :id} {:name       "High Value Orders"
                                                      :table_id   (mt/id :orders)
                                                      :definition segment-def}]
        (mt/with-current-user (mt/user->id :crowberto)
          (testing "with_segments: false (default) does not include segments"
            (let [result (entity-details/get-table-details {:table-id (mt/id :orders)})
                  output (:structured-output result)]
              (is (nil? (:segments output)))))

          (testing "with_segments: true includes segments for the table"
            (let [result (entity-details/get-table-details {:table-id (mt/id :orders)
                                                            :with-segments? true})
                  output (:structured-output result)
                  segments (:segments output)]
              (is (sequential? segments))
              (is (= 1 (count segments)))
              (let [segment (first segments)]
                (is (= segment-id (:id segment)))
                (is (= "High Value Orders" (:name segment)))
                (is (map? (:definition segment)))))))))))

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
          (let [result (entity-details/get-table-details {:table-id (mt/id :orders)
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

(defn- sandboxed-query []
  (let [mp       (mt/metadata-provider)
        table    (lib.metadata/table mp (mt/id :categories))
        id-field (lib.metadata/field mp (mt/id :categories :id))]
    (lib/filter (lib/query mp table) (lib/< id-field 3))))

(deftest sandboxed-field-values-test
  (met/with-gtaps! {:gtaps {:categories {:query (sandboxed-query)}}}
    (let [field-id (mt/id :categories :name)]
      (try
        (let [result     (entity-details/get-table-details {:table-id (mt/id :categories)})
              name-field (some #(when (= "NAME" (:name %)) %) (get-in result [:structured-output :fields]))]
          (testing "returns sandboxed field values"
            (is (= ["African" "American"] (:field_values name-field)))))
        (finally
          (t2/delete! :model/FieldValues :field_id field-id :type :advanced))))))
