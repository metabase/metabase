(ns ^:mb/driver-tests metabase-enterprise.transforms.api-test
  "Tests for /api/transform endpoints."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.transforms.models.transform-tag]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-query-util :as test-query-util]
   [metabase-enterprise.transforms.test-util :refer [with-transform-cleanup!]]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase-enterprise.worker.models.worker-run]
   [metabase.driver :as driver]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------------------
;;; Test Helper Functions
;;; ------------------------------------------------------------

(defn test-transform
  "Create a test transform with sensible defaults.
   Can be called with just a name string or an options map."
  [name-or-opts]
  (let [opts       (if (string? name-or-opts)
                     {:name name-or-opts}
                     name-or-opts)
        query      (or (:query opts)
                       (str "SELECT " (or (:select opts) "1") " as num"))
        table-name (or (:table-name opts)
                       (str "test_table_" (u/generate-nano-id)))]
    {:name   (or (:name opts) "Test Transform")
     :source {:type  "query"
              :query {:database (mt/id)
                      :type     "native"
                      :native   {:query         query
                                 :template-tags {}}}}
     :target {:type "table"
              :name table-name}}))

(defn create-worker-run
  "Create a worker run with default values.
   Can override any field by passing opts map."
  ([transform-id]
   (create-worker-run transform-id {}))
  ([transform-id opts]
   (merge {:work_type  "transform"
           :work_id    transform-id
           :status     "succeeded"
           :run_id     (u/generate-nano-id)
           :run_method "manual"
           :is_local   true
           :start_time (t/instant)
           :end_time   (t/instant)}
          opts)))

;; mt/with-temp assumes ID as primary key
(defmacro with-worker-runs
  "Create worker runs and ensure they are cleaned up after the test.
   Binds the run IDs to the provided binding symbol."
  [[binding runs] & body]
  `(let [runs#    ~runs
         ~binding (mapv :run_id runs#)]
     (t2/insert! :model/WorkerRun runs#)
     (try
       ~@body
       (finally
         (when (seq ~binding)
           (t2/delete! :model/WorkerRun :run_id [:in ~binding]))))))

(defmacro with-transform-tags
  "Create transform-tag associations and ensure cleanup.
   Associations should be a seq of {:transform_id X :tag_id Y} maps."
  [associations & body]
  `(let [assocs# ~associations]
     (when (seq assocs#)
       (t2/insert! :transform_tags assocs#))
     (try
       ~@body
       (finally
         (doseq [assoc# assocs#]
           (t2/delete! :transform_tags
                       :transform_id (:transform_id assoc#)
                       :tag_id (:tag_id assoc#)))))))

;;; ------------------------------------------------------------
;;; Assertion Helpers
;;; ------------------------------------------------------------

(defn assert-run-count
  "Assert that the response contains the expected number of runs."
  [response expected-count]
  (is (= expected-count (count (:data response)))
      (str "Expected " expected-count " runs, got " (count (:data response)))))

(defn assert-transform-ids
  "Assert that the response contains runs for exactly the expected transform IDs."
  [response expected-ids]
  (let [actual-ids (set (map :transform_id (:data response)))]
    (is (= expected-ids actual-ids)
        (str "Expected transform IDs " expected-ids ", got " actual-ids))))

(defn- make-query
  "Create a query filtering products by category, using shared utility.
   Returns a legacy MBQL query structure for API compatibility."
  [category]
  (mt/dataset transforms-dataset/transforms-test
    (let [query (test-query-util/make-filter-query
                 {:table-suffix "products"
                  :column-name "category"
                  :filter-value category
                  :clickhouse-expression? true})]
      ;; Convert to legacy MBQL which the transform API expects
      (lib.convert/->legacy-MBQL query))))

(defn- get-test-schema
  "Get the schema from the products table in the test dataset.
   This is needed for databases like BigQuery that require a schema/dataset."
  []
  (t2/select-one-fn :schema :model/Table (mt/id :products)))

(comment
  (binding [driver/*driver* :clickhouse]
    (make-query "Gadget"))
  -)

(deftest create-transform-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (with-transform-cleanup! [table-name "gadget_products"]
          (let [query (make-query "Gadget")
                schema (get-test-schema)]
          (mt/user-http-request :crowberto :post 200 "ee/transform"
                                {:name   "Gadget Products"
                                 :source {:type  "query"
                                            :query query}
                               ;; for clickhouse (and other dbs where we do merge into), we will
                               ;; want a primary key
                               ;;:primary-key-column "id"
                                 :target {:type "table"
                                            :schema schema
                                            :name table-name}})))))))

(deftest list-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (testing "Can list without query parameters"
      (mt/with-premium-features #{:transforms}
        (mt/user-http-request :crowberto :get 200 "ee/transform")))
    (testing "Can list with query parameters"
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (with-transform-cleanup! [table-name "gadget_products"]
            (let [body      {:name        "Gadget Products"
                             :description "Desc"
                             :source      {:type  "query"
                                 :query (make-query "Gadget")}
                             :target      {:type "table"
                                           :schema (get-test-schema)
                                           :name table-name}}
                  _         (mt/user-http-request :crowberto :post 200 "ee/transform" body)
                  list-resp (mt/user-http-request :crowberto :get 200 "ee/transform")]
              (is (seq list-resp)))))))))

(deftest get-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (with-transform-cleanup! [table-name "gadget_products"]
          (let [body {:name        "Gadget Products"
                      :description "Desc"
                      :source      {:type  "query"
                               :query (make-query "Gadget")}
                      :target      {:type "table"
                                    :schema (get-test-schema)
                                    :name table-name}}
                resp (mt/user-http-request :crowberto :post 200 "ee/transform" body)]
            (is (=? (assoc body
                           :last_run nil)
                    (->
                     (mt/user-http-request :crowberto :get 200 (format "ee/transform/%s" (:id resp)))
                     (update-in [:source :query] mbql.normalize/normalize))))))))))

(deftest put-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (with-transform-cleanup! [table-name "gadget_products"]
          (let [query2 (make-query "None")
                resp   (mt/user-http-request :crowberto :post 200 "ee/transform"
                                             {:name   "Gadget Products"
                                              :source {:type  "query"
                                                     :query (make-query "Gadget")}
                                              :target {:type "table"
                                                          :schema (get-test-schema)
                                                       :name table-name}})
                transform {:name              "Gadget Products 2"
                           :description       "Desc"
                           :source            {:type  "query"
                                    :query query2}
                           :target            {:type "table"
                                         :schema (get-test-schema)
                                               :name table-name}}]
            (is (=? transform
                    (->
                    (mt/user-http-request :crowberto :put 200 (format "ee/transform/%s" (:id resp))
                                           transform)
                     (update-in [:source :query] mbql.normalize/normalize))))))))))

(deftest change-target-table-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (with-transform-cleanup! [table1-name "dookey_products"
                                  table2-name "doohickey_products"]
          (let [query2   (make-query "Doohickey")
                original {:name   "Gadget Products"
                          :source {:type  "query"
                                   :query (make-query "Gadget")}
                          :target {:type "table"
                                   :schema (get-test-schema)
                                   :name table1-name}}
                resp     (mt/user-http-request :crowberto :post 200 "ee/transform"
                                               original)
                updated  {:name        "Doohickey Products"
                          :description "Desc"
                          :source      {:type  "query"
                                  :query query2}
                          :target      {:type "table"
                                        :schema (get-test-schema)
                                        :name table2-name}}]
            (is (=? updated
                    (->
                     (mt/user-http-request :crowberto :put 200 (format "ee/transform/%s" (:id resp)) updated)
                     (update-in [:source :query] mbql.normalize/normalize))))
            (is (false? (transforms.util/target-table-exists? original)))))))))

(deftest delete-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (with-transform-cleanup! [table-name "gadget_products"]
          (let [resp (mt/user-http-request :crowberto :post 200 "ee/transform"
                                           {:name   "Gadget Products"
                                            :source {:type  "query"
                                                     :query (make-query "Gadget")}
                                            :target {:type "table"
                                                     :schema (get-test-schema)
                                                     :name table-name}})]
            (mt/user-http-request :crowberto :delete 204 (format "ee/transform/%s" (:id resp)))
            (mt/user-http-request :crowberto :get 404 (format "ee/transform/%s" (:id resp)))))))))

(deftest delete-table-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (with-transform-cleanup! [table-name "gadget_products"]
          (let [resp (mt/user-http-request :crowberto :post 200 "ee/transform"
                                           {:name   "Gadget Products"
                                            :source {:type  "query"
                                                     :query (make-query "Gadget")}
                                            :target {:type "table"
                                                     :schema (get-test-schema)
                                                     :name table-name}})]
            (mt/user-http-request :crowberto :delete 204 (format "ee/transform/%s/table" (:id resp)))))))))

(defn- test-run
  [transform-id]
  (let [resp (mt/user-http-request :crowberto :post 202 (format "ee/transform/%s/run" transform-id))
        timeout-s 10 ; 10 seconds is our timeout to finish execution and sync
        limit     (+ (System/currentTimeMillis) (* timeout-s 1000))]
    (is (=? {:message "Transform run started"}
            resp))
    (loop []
      (when (> (System/currentTimeMillis) limit)
        (throw (ex-info (str "Transform run timed out after " timeout-s " seconds") {})))
      (let [resp   (mt/user-http-request :crowberto :get 200 (format "ee/transform/%s" transform-id))
            status (some-> resp :last_run :status keyword)]
        (when-not (contains? #{:started :succeeded} status)
          (throw (ex-info (str "Transform run failed with status " status) {:resp resp})))
        (when-not (some? (:table resp))
          (Thread/sleep 100)
          (recur))))))

(defn- check-query-results
  "Verifies that a transform successfully created a table with expected data.

   Uses a simple count-based approach that works reliably across all drivers
   without depending on field metadata being synced.

   Args:
     table-name - Name of the table created by the transform
     ids - Vector of expected product IDs (for count validation)
     category - The category filter used (e.g., \"Gadget\" or \"Doohickey\")"
  [table-name ids category]
  ;; Use the metadata provider to find the table
  (let [mp    (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        ;; Find the table by name
        table (m/find-first (comp #{table-name} :name)
                            (lib.metadata/tables mp))]
    (when-not table
      (throw (ex-info (str "Table not found in metadata: " table-name)
                      {:table-name table-name})))

    ;; Build a query for the table
    (let [base-query      (lib/query mp table)
          ;; Find the category column
          category-column (m/find-first
                           (comp #{"category"} str/lower-case :name)
                           (lib/visible-columns base-query))
          ;; Filter by category and count rows
          filtered-query  (if category-column
                            (lib/filter base-query (lib/= category-column category))
                            base-query)
          count-query     (lib/aggregate filtered-query (lib/count))
          result          (qp/process-query count-query)
          actual-count    (-> result :data :rows first first)]
      ;; Verify we got the expected number of rows
      (is (= (count ids) actual-count)
          (str "Expected " (count ids) " rows with category " category
               " in table " table-name ", but got " actual-count)))))

(defn- wait-for-table
  "Wait for a table to appear in metadata, with timeout.
   Copied from execute_test.clj - will consolidate later."
  [table-name timeout-ms]
  (let [mp    (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        limit (+ (System/currentTimeMillis) timeout-ms)]
    (loop []
      (Thread/sleep 200)
      (when (> (System/currentTimeMillis) limit)
        (throw (ex-info "table has not been created" {:table-name table-name, :timeout-ms timeout-ms})))
      (or (m/find-first (comp #{table-name} :name) (lib.metadata/tables mp))
          (recur)))))

(deftest execute-transform-test
  (doseq [target-type ["table" #_"view"]
          :let        [feature (keyword "transforms" target-type)]]
    (testing (str "transform execution with " target-type " target")
      (mt/test-drivers (mt/normal-drivers-with-feature feature)
        (mt/with-premium-features #{:transforms}
          (mt/dataset transforms-dataset/transforms-test
            (let [schema (t2/select-one-fn :schema :model/Table (mt/id :products))]
              (with-transform-cleanup! [{table1-name :name :as target1} {:type   target-type
                                                                         :schema schema
                                                                         :name   "gadget_products"}
                                        {table2-name :name :as target2} {:type   target-type
                                                                         :schema schema
                                                                         :name   "doohickey_products"}]
                (let [query2             (make-query "Doohickey")
                      original           {:name   "Gadget Products"
                                          :source {:type  "query"
                                         :query (make-query "Gadget")}
                                          :target target1}
                      {transform-id :id} (mt/user-http-request :crowberto :post 200 "ee/transform"
                                                               original)
                      _                  (do (test-run transform-id)
                                             (wait-for-table table1-name 5000))
                      _                  (is (true? (transforms.util/target-table-exists? original)))
                      _                  (check-query-results table1-name [5 11 16] "Gadget")
                      updated            {:name        "Doohickey Products"
                                          :description "Desc"
                                          :source      {:type  "query"
                                        :query query2}
                                          :target      target2}]
                  (is (=? updated
                          (->
                           (mt/user-http-request :crowberto :put 200 (format "ee/transform/%s" transform-id) updated)
                           (update-in [:source :query] mbql.normalize/normalize))))
                  (test-run transform-id)
                  (wait-for-table table2-name 5000)
                  (is (true? (transforms.util/target-table-exists? original)))
                  (is (true? (transforms.util/target-table-exists? updated)))
                  ;; Doohickey products in our test dataset have IDs 2, 3, 4, 13
                  ;; We verify all 4 products are present
                  (check-query-results table2-name [2 3 4 13] "Doohickey"))))))))))

(deftest get-runs-filter-by-single-transform-id-test
  (testing "GET /api/ee/transform/run - filter by single transform ID"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform transform1 (test-transform "Transform 1")
                     :model/Transform transform2 (test-transform "Transform 2")]
        (with-worker-runs [run-ids [(create-worker-run (:id transform1))
                                    (create-worker-run (:id transform2))]]
          (testing "Filter by transform1 ID only returns transform1 runs"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                 :transform_ids [(:id transform1)])]
              (assert-run-count response 1)
              (assert-transform-ids response #{(:id transform1)})
              (is (= (first run-ids) (-> response :data first :id)))))

          (testing "Filter by transform2 ID only returns transform2 runs"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                 :transform_ids [(:id transform2)])]
              (assert-run-count response 1)
              (assert-transform-ids response #{(:id transform2)})
              (is (= (second run-ids) (-> response :data first :id))))))))))

(deftest get-runs-filter-by-multiple-transform-ids-test
  (testing "GET /api/ee/transform/run - filter by multiple transform IDs"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform transform1 (test-transform "Transform 1")
                     :model/Transform transform2 (test-transform "Transform 2")
                     :model/Transform transform3 (test-transform "Transform 3")]
        (with-worker-runs [_run-ids [(create-worker-run (:id transform1))
                                     (create-worker-run (:id transform2))
                                     (create-worker-run (:id transform3))]]
          (testing "Filter by transform1 and transform2 IDs returns only those runs"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                 :transform_ids [(:id transform1) (:id transform2)])]
              (assert-run-count response 2)
              (assert-transform-ids response #{(:id transform1) (:id transform2)}))))))))

(deftest get-runs-filter-by-single-status-test
  (testing "GET /api/ee/transform/run - filter by single status"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform transform (test-transform "Transform with multiple runs")]
        (with-worker-runs [_run-ids [(create-worker-run (:id transform) {:status "succeeded"})
                                     (create-worker-run (:id transform) {:status "failed"})
                                     (create-worker-run (:id transform) {:status "failed"})]]
          (testing "Filter by 'failed' status returns only failed runs"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                 :statuses ["failed"])]
              (is (>= (count (:data response)) 2))
              (is (every? #(= "failed" (:status %))
                          (filter #(= (:id transform) (:transform_id %)) (:data response))))))

          (testing "Filter by 'succeeded' status returns only succeeded runs"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                 :statuses ["succeeded"])]
              (is (>= (count (:data response)) 1))
              (is (some #(and (= "succeeded" (:status %))
                              (= (:id transform) (:transform_id %)))
                        (:data response))))))))))

(deftest get-runs-filter-by-multiple-statuses-test
  (testing "GET /api/ee/transform/run - filter by multiple statuses"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform transform {:name "Transform with multiple runs"
                                                 :source {:type  "query"
                                                          :query {:database (mt/id)
                                                                  :type     "native"
                                                                  :native   {:query         "SELECT 1"
                                                                             :template-tags {}}}}
                                                 :target {:type "table"
                                                          :name (str "test_table_" (u/generate-nano-id))}}]
        (with-worker-runs [_run-ids [(create-worker-run (:id transform) {:status "succeeded"})
                                     (create-worker-run (:id transform) {:status "succeeded"})
                                     (create-worker-run (:id transform) {:status "failed"})
                                     (create-worker-run (:id transform) {:status "timeout"})]]
          (testing "Filter by 'succeeded' and 'failed' returns both types"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                 :statuses ["succeeded" "failed"])
                  our-runs (filter #(= (:id transform) (:transform_id %)) (:data response))]
              (is (>= (count our-runs) 3))
              (is (every? #(contains? #{"succeeded" "failed"} (:status %)) our-runs)))))))))

(deftest get-runs-filter-by-single-tag-test
  (testing "GET /api/ee/transform/run - filter by single tag"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform transform1 (test-transform "Tagged Transform 1")
                     :model/Transform transform2 (test-transform "Tagged Transform 2")
                     :model/Transform transform3 (test-transform "Untagged Transform")
                     :model/TransformTag tag1 {:name (str "test-tag-" (u/generate-nano-id))}]
        (with-transform-tags [{:transform_id (:id transform1) :tag_id (:id tag1)}
                              {:transform_id (:id transform2) :tag_id (:id tag1)}]
          (with-worker-runs [_run-ids [(create-worker-run (:id transform1))
                                       (create-worker-run (:id transform2))
                                       (create-worker-run (:id transform3))]]
            (testing "Filter by tag1 returns only tagged transforms' runs"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                   :transform_tag_ids [(:id tag1)])]
                (assert-run-count response 2)
                (assert-transform-ids response #{(:id transform1) (:id transform2)})
                (is (not (contains? (set (map :transform_id (:data response)))
                                    (:id transform3))))))))))))

(deftest get-runs-filter-by-multiple-tags-test
  (testing "GET /api/ee/transform/run - filter by multiple tags (union)"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform transform1 {:name   "Transform with tag1"
                                                  :source {:type  "query"
                                                           :query {:database (mt/id)
                                                                   :type     "native"
                                                                   :native   {:query         "SELECT 1"
                                                                              :template-tags {}}}}
                                                  :target {:type "table"
                                                           :name (str "test_table_1_" (u/generate-nano-id))}}
                     :model/Transform transform2 {:name   "Transform with both tags"
                                                  :source {:type  "query"
                                                           :query {:database (mt/id)
                                                                   :type     "native"
                                                                   :native   {:query         "SELECT 2"
                                                                              :template-tags {}}}}
                                                  :target {:type "table"
                                                           :name (str "test_table_2_" (u/generate-nano-id))}}
                     :model/Transform transform3 {:name   "Transform with tag2"
                                                  :source {:type  "query"
                                                           :query {:database (mt/id)
                                                                   :type     "native"
                                                                   :native   {:query         "SELECT 3"
                                                                              :template-tags {}}}}
                                                  :target {:type "table"
                                                           :name (str "test_table_3_" (u/generate-nano-id))}}
                     :model/Transform transform4 {:name   "Untagged Transform"
                                                  :source {:type  "query"
                                                           :query {:database (mt/id)
                                                                   :type     "native"
                                                                   :native   {:query         "SELECT 4"
                                                                              :template-tags {}}}}
                                                  :target {:type "table"
                                                           :name (str "test_table_4_" (u/generate-nano-id))}}
                     :model/TransformTag tag1 {:name (str "test-tag-1-" (u/generate-nano-id))}
                     :model/TransformTag tag2 {:name (str "test-tag-2-" (u/generate-nano-id))}]
        ;; Associate tags with transforms
        (with-transform-tags [{:transform_id (:id transform1) :tag_id (:id tag1)}
                              {:transform_id (:id transform2) :tag_id (:id tag1)}
                              {:transform_id (:id transform2) :tag_id (:id tag2)}
                              {:transform_id (:id transform3) :tag_id (:id tag2)}]
          (with-worker-runs [_run-ids [(create-worker-run (:id transform1))
                                       (create-worker-run (:id transform2))
                                       (create-worker-run (:id transform3))
                                       (create-worker-run (:id transform4))]]
            (testing "Filter by tag1 and tag2 returns union (transforms with either tag)"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                   :transform_tag_ids [(:id tag1) (:id tag2)])
                    returned-transform-ids (set (map :transform_id (:data response)))]
                (assert-run-count response 3)
                (assert-transform-ids response #{(:id transform1) (:id transform2) (:id transform3)})
                (is (not (contains? returned-transform-ids (:id transform4))))))))))))

(deftest get-runs-combine-transform-id-and-status-test
  (testing "GET /api/ee/transform/run - combine transform ID and status filters"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform transform1 {:name   "Transform 1"
                                                  :source {:type  "query"
                                                           :query {:database (mt/id)
                                                                   :type     "native"
                                                                   :native   {:query         "SELECT 1"
                                                                              :template-tags {}}}}
                                                  :target {:type "table"
                                                           :name (str "test_table_1_" (u/generate-nano-id))}}
                     :model/Transform transform2 {:name   "Transform 2"
                                                  :source {:type  "query"
                                                           :query {:database (mt/id)
                                                                   :type     "native"
                                                                   :native   {:query         "SELECT 2"
                                                                              :template-tags {}}}}
                                                  :target {:type "table"
                                                           :name (str "test_table_2_" (u/generate-nano-id))}}]
        ;; Create multiple runs with different statuses for transform1
        (with-worker-runs [_run-ids [(create-worker-run (:id transform1) {:status "succeeded"})
                                     (create-worker-run (:id transform1) {:status "failed"})
                                     (create-worker-run (:id transform1) {:status "failed"})
                                     (create-worker-run (:id transform2) {:status "failed"})]]
          (testing "Filter by transform1 ID and failed status"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                 :transform_ids [(:id transform1)]
                                                 :statuses ["failed"])]
              (assert-run-count response 2)
              (is (every? #(and (= (:id transform1) (:transform_id %))
                                (= "failed" (:status %)))
                          (:data response))))))))))

(deftest get-runs-combine-tag-and-status-test
  (testing "GET /api/ee/transform/run - combine tag and status filters"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform transform1 {:name   "Tagged Transform 1"
                                                  :source {:type  "query"
                                                           :query {:database (mt/id)
                                                                   :type     "native"
                                                                   :native   {:query         "SELECT 1"
                                                                              :template-tags {}}}}
                                                  :target {:type "table"
                                                           :name (str "test_table_1_" (u/generate-nano-id))}}
                     :model/Transform transform2 {:name   "Tagged Transform 2"
                                                  :source {:type  "query"
                                                           :query {:database (mt/id)
                                                                   :type     "native"
                                                                   :native   {:query         "SELECT 2"
                                                                              :template-tags {}}}}
                                                  :target {:type "table"
                                                           :name (str "test_table_2_" (u/generate-nano-id))}}
                     :model/Transform transform3 {:name   "Untagged Transform"
                                                  :source {:type  "query"
                                                           :query {:database (mt/id)
                                                                   :type     "native"
                                                                   :native   {:query         "SELECT 3"
                                                                              :template-tags {}}}}
                                                  :target {:type "table"
                                                           :name (str "test_table_3_" (u/generate-nano-id))}}
                     :model/TransformTag tag1 {:name (str "test-tag-" (u/generate-nano-id))}]
        ;; Associate tag1 with transform1 and transform2
        (with-transform-tags [{:transform_id (:id transform1) :tag_id (:id tag1)}
                              {:transform_id (:id transform2) :tag_id (:id tag1)}]
          (with-worker-runs [_run-ids [(create-worker-run (:id transform1) {:status "succeeded"})
                                       (create-worker-run (:id transform2) {:status "failed"})
                                       (create-worker-run (:id transform3) {:status "failed"})
                                       (create-worker-run (:id transform2) {:status "succeeded"})]]
            (testing "Filter by tag1 and failed status returns only failed runs of tagged transforms"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                   :transform_tag_ids [(:id tag1)]
                                                   :statuses ["failed"])]
                (assert-run-count response 1)
                (is (= (:id transform2) (-> response :data first :transform_id)))
                (is (= "failed" (-> response :data first :status)))))))))))

(deftest get-runs-intersect-transform-id-and-tag-test
  (testing "GET /api/ee/transform/run - intersection of transform IDs and tags"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform transform1 (test-transform "Transform with tag1")
                     :model/Transform transform2 (test-transform "Transform with tag2")
                     :model/TransformTag tag1 {:name (str "test-tag-1-" (u/generate-nano-id))}
                     :model/TransformTag tag2 {:name (str "test-tag-2-" (u/generate-nano-id))}]
        (with-transform-tags [{:transform_id (:id transform1) :tag_id (:id tag1)}
                              {:transform_id (:id transform2) :tag_id (:id tag2)}]
          (with-worker-runs [_run-ids [(create-worker-run (:id transform1))
                                       (create-worker-run (:id transform2))]]

            (testing "Filter by transform1 ID and tag1 returns transform1 (has both)"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                   :transform_ids [(:id transform1)]
                                                   :transform_tag_ids [(:id tag1)])]
                (assert-run-count response 1)
                (assert-transform-ids response #{(:id transform1)})))

            (testing "Filter by transform1 ID and tag2 returns empty (transform1 doesn't have tag2)"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                   :transform_ids [(:id transform1)]
                                                   :transform_tag_ids [(:id tag2)])]
                (assert-run-count response 0)))

            (testing "Filter by both transform IDs and tag1 returns only transform1"
              (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                   :transform_ids [(:id transform1) (:id transform2)]
                                                   :transform_tag_ids [(:id tag1)])]
                (assert-run-count response 1)
                (assert-transform-ids response #{(:id transform1)})))))))))
