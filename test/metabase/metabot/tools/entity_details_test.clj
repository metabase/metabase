(ns metabase.metabot.tools.entity-details-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

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
              (let [measure (first measures)]
                (is (= measure-id (:id measure)))
                (is (= "Total Revenue" (:name measure)))
                (is (string? (:definition-description measure)))
                (is (map? (:definition measure)))))))))))

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
              (let [segment (first segments)]
                (is (= segment-id (:id segment)))
                (is (= "High Value Orders" (:name segment)))
                (is (string? (:definition-description segment)))
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

(deftest get-report-details-skips-related-tables-test
  (testing "get-report-details never computes related-tables"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Card {card-id :id}
                       {:database_id   (mt/id)
                        :type          :question
                        :name          "Orders question"
                        :dataset_query (mt/mbql-query orders {:limit 3})}]
          (let [calls (atom 0)
                orig  (mt/original-fn #'entity-details/related-tables)]
            (mt/with-dynamic-fn-redefs [entity-details/related-tables (fn [& args]
                                                                        (swap! calls inc)
                                                                        (apply orig args))]
              (let [output (-> (entity-details/get-report-details {:report-id card-id})
                               :structured-output)]
                (is (=? {:id card-id :type :question} output))
                (is (not (contains? output :related_tables)))
                (is (= 0 @calls))))))))))

(deftest get-report-details-skips-metrics-test
  (testing "get-report-details never computes metrics"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Card {card-id :id}
                       {:database_id   (mt/id)
                        :type          :question
                        :name          "Orders question"
                        :dataset_query (mt/mbql-query orders {:limit 3})}]
          (let [calls (atom 0)
                orig  (mt/original-fn #'lib/available-metrics)]
            (mt/with-dynamic-fn-redefs [lib/available-metrics (fn [& args]
                                                                (swap! calls inc)
                                                                (apply orig args))]
              (let [output (-> (entity-details/get-report-details {:report-id card-id})
                               :structured-output)]
                (is (=? {:id card-id :type :question} output))
                (is (not (contains? output :metrics)))
                (is (= 0 @calls))))))))))

(deftest related-tables-with-fields-capped-test
  (testing (str "FK-related-table *column* expansion is capped at `max-related-tables-with-fields` so a table "
                "with a very large / highly-connected schema can't fetch and pin an unbounded number of columns "
                "during a single MetaBot context build (metabase#76493)")
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [with-fields-tables (fn []
                                   (-> (entity-details/get-table-details {:entity-type :table
                                                                          :entity-id (mt/id :orders)})
                                       :structured-output
                                       :related_tables))]
          (testing "Orders has more than one FK-related table by default (Products + People)"
            (is (> (count (with-fields-tables)) 1)))
          (testing "with the cap lowered, no more than `max-related-tables-with-fields` related tables carry columns"
            (with-redefs-fn {#'entity-details/max-related-tables-with-fields 1}
              (fn []
                (let [tables (with-fields-tables)]
                  (is (= 1 (count tables)))
                  (is (every? (comp seq :fields) tables)
                      "the surfaced column-bearing table actually carries its fields"))))))))))

(deftest related-tables-without-fields-list-test
  (testing (str "FK-related tables beyond the column-expansion cap are still surfaced by identity (no column "
                "fetch) in :related_tables_without_fields, so the LLM knows they exist and can look them up "
                "individually (metabase#76493)")
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [details (fn []
                        (:structured-output
                         (entity-details/get-table-details {:entity-type :table
                                                            :entity-id (mt/id :orders)})))]
          (testing "no without-fields list when every related table fits under the column cap"
            (let [output (details)]
              (is (nil? (:related_tables_without_fields output)))
              (is (nil? (:related_tables_total output)))))
          (testing "lowering the column cap moves the remaining tables into the without-fields list"
            (with-redefs-fn {#'entity-details/max-related-tables-with-fields 1}
              (fn []
                (let [output      (details)
                      with-fields (:related_tables output)
                      without     (:related_tables_without_fields output)]
                  (is (= 1 (count with-fields)))
                  (is (= 1 (count without)))
                  (testing "list entries carry id/name but no columns"
                    (is (every? :id without))
                    (is (every? :name without))
                    (is (every? (comp empty? :fields) without)))
                  (testing ":related_tables and the list are disjoint FK paths"
                    (let [shown-paths (into #{} (map (juxt :id :related_by)) with-fields)]
                      (is (not-any? (comp shown-paths (juxt :id :related_by)) without))))
                  (testing "no tables were dropped entirely, so no :related_tables_total"
                    (is (nil? (:related_tables_total output)))))))))))))

(deftest related-tables-total-truncation-test
  (testing (str "FK-related tables beyond `max-related-tables` are dropped entirely and the drop is reported via "
                ":related_tables_total so the LLM knows the surfaced set is itself truncated (metabase#76493)")
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        ;; surface only one of Orders' two FK-related tables; the other is dropped entirely
        (with-redefs-fn {#'entity-details/max-related-tables 1}
          (fn []
            (let [output (:structured-output
                          (entity-details/get-table-details {:entity-type :table
                                                             :entity-id (mt/id :orders)}))]
              (is (= 1 (count (:related_tables output))))
              (is (nil? (:related_tables_without_fields output))
                  "with only one table surfaced and it carrying fields, the without-fields list is empty")
              (is (= 2 (:related_tables_total output))
                  ":related_tables_total reports the full FK-related count before the cap")
              (is (> (:related_tables_total output)
                     (+ (count (:related_tables output))
                        (count (:related_tables_without_fields output))))
                  "total exceeds the surfaced set, signalling tables were dropped"))))))))

(deftest related-tables-without-fields-omitted-when-no-fields-requested-test
  (testing (str "with `with-fields?` false every related table is column-free, so there is no with/without "
                "distinction: the whole capped set is surfaced in :related_tables and :related_tables_without_fields "
                "is omitted, while the :related_tables cap is still enforced")
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [orders-query (let [mp (mt/metadata-provider)]
                             (lib/query mp (lib.metadata/table mp (mt/id :orders))))
              related      (fn [] (#'entity-details/related-tables orders-query false identity))]
          (testing "Orders has more than one FK-related table (Products + People)"
            (is (> (count (:related_tables (related))) 1)))
          (testing "lowering the column-expansion cap does NOT spill into a without-fields list"
            (with-redefs-fn {#'entity-details/max-related-tables-with-fields 1}
              (fn []
                (let [output (related)]
                  (is (> (count (:related_tables output)) 1)
                      "every surfaced table stays in :related_tables")
                  (is (every? (comp empty? :fields) (:related_tables output))
                      "no table carries columns when with-fields? is false")
                  (is (nil? (:related_tables_without_fields output))
                      ":related_tables_without_fields is omitted entirely when with-fields? is false")))))
          (testing "the :related_tables cap still applies (and reports drops) when with-fields? is false"
            (with-redefs-fn {#'entity-details/max-related-tables 1}
              (fn []
                (let [output (related)]
                  (is (= 1 (count (:related_tables output))))
                  (is (nil? (:related_tables_without_fields output)))
                  (is (= 2 (:related_tables_total output))
                      "tables dropped by the cap are still reported via :related_tables_total"))))))))))

(defn- orders+reviews-join-query
  "A query whose source table is Orders with an explicit join to Reviews.

  Both tables carry a `PRODUCT_ID` FK to Products, so `visible-columns` exposes two FK columns with the same name
  pointing at the same target table and therefore must be distinguished by field id, not name."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
        (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :reviews))
                                   [(lib/= (lib.metadata/field mp (mt/id :orders :id))
                                           (lib.metadata/field mp (mt/id :reviews :id)))])))))

(deftest fk-related-table-groups-distinguishes-same-named-fks-test
  (testing (str "two distinct FK fields that share a name and point at the same target table stay separate FK paths: "
                "`fk-related-table-groups` keys distinctness on the FK field id, not its name (so they don't collapse)")
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [groups   (#'entity-details/fk-related-table-groups (orders+reviews-join-query))
              products (mt/id :products)
              ;; the two PRODUCT_ID FK paths: orders.PRODUCT_ID and reviews.PRODUCT_ID, both -> products
              product-paths (filter (fn [[target-table-id _ fk-name]]
                                      (and (= target-table-id products) (= fk-name "PRODUCT_ID")))
                                    groups)]
          (testing "both PRODUCT_ID FKs survive distinct/sort as separate tuples"
            (is (= 2 (count product-paths))))
          (testing "they share a name and target table but differ by FK field id"
            (is (=? #{[products (mt/id :orders :product_id) "PRODUCT_ID"]
                      [products (mt/id :reviews :product_id) "PRODUCT_ID"]}
                    (set product-paths)))))))))

(deftest related-tables-related-by-field-id-test
  (testing (str "`:related_by` carries a `{:id :name}` map so the LLM can disambiguate two related-table entries that "
                "share a `:related_by` name and target table (e.g. orders.PRODUCT_ID vs reviews.PRODUCT_ID)")
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [output       (#'entity-details/related-tables (orders+reviews-join-query) false identity)
              products     (mt/id :products)
              product-rows (filter #(and (= (:id %) products) (= (-> % :related_by :name) "PRODUCT_ID"))
                                   (:related_tables output))]
          (testing "every related table's :related_by is a {:id :name} map"
            (is (every? #(and (-> % :related_by :id) (-> % :related_by :name)) (:related_tables output))))
          (testing "the two same-named PRODUCT_ID entries are present and distinguished only by :related_by :id"
            (is (=? #{{:id products :related_by {:id (mt/id :orders :product_id) :name "PRODUCT_ID"}}
                      {:id products :related_by {:id (mt/id :reviews :product_id) :name "PRODUCT_ID"}}}
                    (into #{} (map #(select-keys % [:id :related_by])) product-rows)))))))))
