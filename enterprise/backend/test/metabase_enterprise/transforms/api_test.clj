(ns ^:mb/driver-tests metabase-enterprise.transforms.api-test
  "Tests for /api/transform endpoints."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.transforms.models.transform-run]
   [metabase-enterprise.transforms.models.transform-tag]
   [metabase-enterprise.transforms.models.transform-transform-tag]
   [metabase-enterprise.transforms.query-test-util :as query-test-util]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :refer [parse-instant with-transform-cleanup! utc-timestamp get-test-schema]]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
  (let [table-name (t2/select-one-fn :name :model/Table (mt/id :transforms_products))
        query (query-test-util/make-query
               {:source-table  table-name
                :source-column "category"
                :filter-fn     lib/=
                :filter-values [category]})]
      ;; Convert to legacy MBQL which the transform API expects
    (lib.convert/->legacy-MBQL query)))

(deftest create-transform-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (with-transform-cleanup! [table-name "gadget_products"]
          (let [query  (make-query "Gadget")
                schema (get-test-schema)]
            (mt/user-http-request :crowberto :post 200 "ee/transform"
                                  {:name   "Gadget Products"
                                   :source {:type  "query"
                                            :query query}
                                   :target {:type   "table"
                                            :schema schema
                                            :name   table-name}})))))))

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
                             :target      {:type   "table"
                                           :schema (get-test-schema)
                                           :name   table-name}}
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
                      :target      {:type   "table"
                                    :schema (get-test-schema)
                                    :name   table-name}}
                resp (mt/user-http-request :crowberto :post 200 "ee/transform" body)]
            (is (=? body
                    (->
                     (mt/user-http-request :crowberto :get 200 (format "ee/transform/%s" (:id resp)))
                     (update-in [:source :query] mbql.normalize/normalize))))))))))

(defn- ->transform [transform-name query]
  {:source {:type "query",
            :query query}
   :name transform-name
   :target {:schema "public"
            :name "orders_2"
            :type "table"}})

(deftest get-transform-dependencies-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-temp [:model/Table {table :id} {:schema "public", :name "orders_2"}
                   :model/Field _           {:table_id table, :name "foo"}
                   :model/Transform parent  (->transform "transform1" (mt/mbql-query orders))
                   :model/Transform child   (-> (->transform "transform2" (mt/mbql-query nil {:source-table table}))
                                                (assoc-in [:target :name] "orders_3"))]
      (mt/with-premium-features #{:transforms}
        (is (= [parent]
               (mt/user-http-request :crowberto :get 200 (format "ee/transform/%s/dependencies" (:id child)))))))))

(deftest put-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (with-transform-cleanup! [table-name "gadget_products"]
          (let [query2    (make-query "None")
                resp      (mt/user-http-request :crowberto :post 200 "ee/transform"
                                                {:name   "Gadget Products"
                                                 :source {:type  "query"
                                                          :query (make-query "Gadget")}
                                                 :target {:type   "table"
                                                          :schema (get-test-schema)
                                                          :name   table-name}})
                transform {:name        "Gadget Products 2"
                           :description "Desc"
                           :source      {:type  "query"
                                         :query query2}
                           :target      {:type   "table"
                                         :schema (get-test-schema)
                                         :name   table-name}}]
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
                          :target {:type   "table"
                                   :schema (get-test-schema)
                                   :name   table1-name}}
                resp     (mt/user-http-request :crowberto :post 200 "ee/transform"
                                               original)
                updated  {:name        "Doohickey Products"
                          :description "Desc"
                          :source      {:type  "query"
                                        :query query2}
                          :target      {:type   "table"
                                        :schema (get-test-schema)
                                        :name   table2-name}}]
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
                                            :target {:type   "table"
                                                     :schema (get-test-schema)
                                                     :name   table-name}})]
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
                                            :target {:type   "table"
                                                     :schema (get-test-schema)
                                                     :name   table-name}})]
            (mt/user-http-request :crowberto :delete 204 (format "ee/transform/%s/table" (:id resp)))))))))

(defn- test-run
  [transform-id]
  (let [resp      (mt/user-http-request :crowberto :post 202 (format "ee/transform/%s/run" transform-id))
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
  (let [mp    (mt/metadata-provider)
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
                           (comp #{"category"} u/lower-case-en :name)
                           (lib/visible-columns base-query))
          ;; Filter by category and count rows
          filtered-query  (if category-column
                            (lib/filter base-query (lib/= category-column category))
                            base-query)
          count-query     (lib/aggregate filtered-query (lib/count))
          result          (qp/process-query count-query)
          actual-count   (-> (mt/formatted-rows [int] result) first first)]
      ;; Verify we got the expected number of rows
      (is (= (count ids) actual-count)
          (str "Expected " (count ids) " rows with category " category
               " in table " table-name ", but got " actual-count)))))

(defn- wait-for-table
  "Wait for a table to appear in metadata, with timeout.
   Copied from execute_test.clj - will consolidate later."
  [table-name timeout-ms]
  (let [mp    (mt/metadata-provider)
        limit (+ (System/currentTimeMillis) timeout-ms)]
    (loop []
      (Thread/sleep 200)
      (when (> (System/currentTimeMillis) limit)
        (throw (ex-info "table has not been created" {:table-name table-name, :timeout-ms timeout-ms})))
      (or (m/find-first (comp #{table-name} :name) (lib.metadata/tables mp))
          (recur)))))

(deftest execute-transform-test
  (testing "transform execution with :transforms/table target"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
            (with-transform-cleanup! [{table1-name :name :as target1} {:type   "table"
                                                                       :schema schema
                                                                       :name   "gadget_products"}
                                      {table2-name :name :as target2} {:type   "table"
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
                (check-query-results table2-name [2 3 4 13] "Doohickey")))))))))

(deftest get-runs-filter-by-single-transform-id-test
  (testing "GET /api/ee/transform/run - filter by single transform ID"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform transform1 {}
                     :model/Transform transform2 {}
                     :model/TransformRun run1 {:transform_id (:id transform1)}
                     :model/TransformRun run2 {:transform_id (:id transform2)}]
        (testing "Filter by transform1 ID only returns transform1 runs"
          (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                               :transform_ids [(:id transform1)])]
            (assert-run-count response 1)
            (assert-transform-ids response #{(:id transform1)})
            (is (= (:id run1) (-> response :data first :id)))))

        (testing "Filter by transform2 ID only returns transform2 runs"
          (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                               :transform_ids [(:id transform2)])]
            (assert-run-count response 1)
            (assert-transform-ids response #{(:id transform2)})
            (is (= (:id run2) (-> response :data first :id)))))))))

(deftest get-runs-filter-by-multiple-transform-ids-test
  (testing "GET /api/ee/transform/run - filter by multiple transform IDs"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform transform1 {}
                     :model/Transform transform2 {}
                     :model/Transform transform3 {}
                     :model/TransformRun _run1 {:transform_id (:id transform1)}
                     :model/TransformRun _run2 {:transform_id (:id transform2)}
                     :model/TransformRun _run3 {:transform_id (:id transform3)}]
        (testing "Filter by transform1 and transform2 IDs returns only those runs"
          (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                               :transform_ids [(:id transform1) (:id transform2)])]
            (assert-run-count response 2)
            (assert-transform-ids response #{(:id transform1) (:id transform2)})))))))

(deftest get-runs-filter-by-single-status-test
  (testing "GET /api/ee/transform/run - filter by single status"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform transform {}
                     :model/TransformRun _run1 {:transform_id (:id transform) :status "succeeded"}
                     :model/TransformRun _run2 {:transform_id (:id transform) :status "failed"}
                     :model/TransformRun _run3 {:transform_id (:id transform) :status "failed"}]
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
                      (:data response)))))))))

(defn- transform-runs
  [our-pred & filters]
  (let [response (apply mt/user-http-request :crowberto :get 200 "ee/transform/run" filters)]
    (filter our-pred (:data response))))

(deftest get-runs-filter-by-multiple-statuses-test
  (testing "GET /api/ee/transform/run - filter by multiple statuses"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform {t0-id :id} {}
                     :model/Transform {t1-id :id} {}
                     :model/TransformRun {r0-id  :id} {:transform_id t0-id :status "timeout" :run_method "cron"
                                                       :start_time (parse-instant "2025-08-25T10:12:11")
                                                       :end_time (parse-instant "2025-08-26T10:52:17")}
                     :model/TransformRun {r1-id  :id} {:transform_id t0-id :status "succeeded" :run_method "manual"
                                                       :start_time (parse-instant "2025-08-26T10:12:11")
                                                       :end_time (parse-instant "2025-08-27T10:52:17")}
                     :model/TransformRun {r2-id :id} {:transform_id t1-id :status "succeeded" :run_method "cron"
                                                      :start_time (parse-instant "2025-08-22T10:12:11")
                                                      :end_time (parse-instant "2025-08-22T10:12:17")}
                     :model/TransformRun {r3-id :id} {:transform_id t1-id :status "succeeded" :run_method "manual"
                                                      :start_time (parse-instant "2025-08-22T23:57:34")
                                                      :end_time (parse-instant "2025-08-23T00:17:41")}
                     :model/TransformRun {_r4-id :id} {:transform_id t1-id :status "failed" :run_method "cron"
                                                       :start_time (parse-instant "2025-08-25T15:22:18")
                                                       :end_time (parse-instant "2025-08-25T19:12:17")}
                     :model/TransformRun {_r5-id :id} {:transform_id t1-id :status "timeout" :run_method "manual"
                                                       :start_time (parse-instant "2025-08-25T20:29:58")
                                                       :end_time (parse-instant "2025-08-25T22:12:17")}
                     :model/TransformRun {_r6-id :id} {:transform_id t1-id :status "started" :run_method "cron"
                                                       :start_time (parse-instant "2025-08-25T23:56:04")
                                                       :end_time nil :is_active true}]
        (let [our-run-pred (comp #{t0-id t1-id} :transform_id)
              t0-runs [{:id r1-id
                        :start_time (utc-timestamp "2025-08-26T10:12:11")
                        :end_time (utc-timestamp "2025-08-27T10:52:17")
                        :run_method "manual"
                        :status "succeeded"
                        :transform {:id t0-id}
                        :transform_id t0-id}
                       {:id r0-id
                        :start_time (utc-timestamp "2025-08-25T10:12:11")
                        :end_time (utc-timestamp "2025-08-26T10:52:17")
                        :run_method "cron"
                        :status "timeout"
                        :transform {:id t0-id}
                        :transform_id t0-id}]]
          (testing "Filter by 'succeeded' and 'failed' returns both types"
            (let [statuses #{"succeeded" "failed" "started"}
                  our-runs (transform-runs our-run-pred :statuses (vec statuses))]
              (is (= 5 (count our-runs)))
              (is (every? #(contains? statuses (:status %)) our-runs))))
          (testing "Filter by 'start_time'"
            (is (=? [{:id r1-id
                      :start_time (utc-timestamp "2025-08-26T10:12:11")
                      :end_time (utc-timestamp "2025-08-27T10:52:17")
                      :run_method "manual"
                      :status "succeeded"
                      :transform {:id t0-id}
                      :transform_id t0-id}]
                    (transform-runs our-run-pred :start_time "2025-08-26~")))
            (let [our-runs (transform-runs our-run-pred :start_time "~2025-08-25")]
              (is (= 6 (count our-runs))))
            (let [our-runs (transform-runs our-run-pred :start_time "2025-08-22~2025-08-23")]
              (is (=? [{:transform {:id t1-id}
                        :run_method "manual"
                        :is_active nil
                        :start_time (utc-timestamp "2025-08-22T23:57:34")
                        :end_time (utc-timestamp "2025-08-23T00:17:41")
                        :transform_id t1-id
                        :status "succeeded"
                        :id r3-id}
                       {:transform {:id t1-id}
                        :run_method "cron"
                        :is_active nil
                        :start_time (utc-timestamp "2025-08-22T10:12:11")
                        :end_time (utc-timestamp "2025-08-22T10:12:17")
                        :transform_id t1-id
                        :status "succeeded"
                        :id r2-id}]
                      our-runs))))
          (testing "Filter by 'end_time'"
            (is (=? t0-runs
                    (transform-runs our-run-pred :end_time "2025-08-26~")))
            (is (empty? (transform-runs our-run-pred :end_time "~2025-08-21"))))
          (testing "Filter by 'run_methods'"
            (let [our-runs (transform-runs our-run-pred :run_methods ["manual"])]
              (is (= 3 (count our-runs)))
              (is (every? (comp #{"manual"} :run_method) our-runs)))
            (let [our-runs (transform-runs our-run-pred :run_methods ["cron"])]
              (is (= 4 (count our-runs)))
              (is (every? (comp #{"cron"} :run_method) our-runs)))
            (let [our-runs (transform-runs our-run-pred :run_methods ["cron" "manual"])]
              (is (= 7 (count our-runs)))))
          (testing "Filter by a combination"
            (is (=? [{:id r3-id
                      :status "succeeded"
                      :run_method "manual"
                      :start_time (utc-timestamp "2025-08-22T23:57:34")
                      :end_time (utc-timestamp "2025-08-23T00:17:41")
                      :transform {:id t1-id}
                      :transform_id t1-id}]
                    (transform-runs our-run-pred :run_methods ["manual"] :start_time "~2025-08-25" :end_time "~2025-08-23")))))))))

(deftest get-runs-filter-by-single-tag-test
  (testing "GET /api/ee/transform/run - filter by single tag"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform transform1 {}
                     :model/Transform transform2 {}
                     :model/Transform transform3 {}
                     :model/TransformTag tag1 {}
                     :model/TransformTag _tag2 {}
                     :model/TransformTag _tag3 {}
                     :model/TransformTransformTag _ {:transform_id (:id transform1) :tag_id (:id tag1) :position 0}
                     :model/TransformTransformTag _ {:transform_id (:id transform2) :tag_id (:id tag1) :position 0}
                     :model/TransformRun _run1 {:transform_id (:id transform1)}
                     :model/TransformRun _run2 {:transform_id (:id transform2)}
                     :model/TransformRun _run3 {:transform_id (:id transform3)}]
        (testing "Filter by tag1 returns only tagged transforms' runs"
          (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                               :transform_tag_ids [(:id tag1)])]
            (assert-run-count response 2)
            (assert-transform-ids response #{(:id transform1) (:id transform2)})
            (is (not (contains? (set (map :transform_id (:data response)))
                                (:id transform3))))))))))

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
                     :model/TransformTag tag1 {}
                     :model/TransformTag tag2 {}
                     :model/TransformTransformTag _ {:transform_id (:id transform1) :tag_id (:id tag1) :position 0}
                     :model/TransformTransformTag _ {:transform_id (:id transform2) :tag_id (:id tag1) :position 0}
                     :model/TransformTransformTag _ {:transform_id (:id transform2) :tag_id (:id tag2) :position 1}
                     :model/TransformTransformTag _ {:transform_id (:id transform3) :tag_id (:id tag2) :position 0}

                     :model/TransformRun _run1 {:transform_id (:id transform1)}
                     :model/TransformRun _run2 {:transform_id (:id transform2)}
                     :model/TransformRun _run3 {:transform_id (:id transform3)}
                     :model/TransformRun _run4 {:transform_id (:id transform4)}]
        ;; Associate tags with transforms
        (testing "Filter by tag1 and tag2 returns union (transforms with either tag)"
          (let [response               (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                             :transform_tag_ids [(:id tag1) (:id tag2)])
                returned-transform-ids (set (map :transform_id (:data response)))]
            (assert-run-count response 3)
            (assert-transform-ids response #{(:id transform1) (:id transform2) (:id transform3)})
            (is (not (contains? returned-transform-ids (:id transform4))))))))))

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
                                                           :name (str "test_table_2_" (u/generate-nano-id))}}
                     :model/TransformRun _run1 {:transform_id (:id transform1) :status "succeeded"}
                     :model/TransformRun _run1 {:transform_id (:id transform1) :status "failed"}
                     :model/TransformRun _run1 {:transform_id (:id transform1) :status "failed"}
                     :model/TransformRun _run1 {:transform_id (:id transform2) :status "failed"}]
        ;; Create multiple runs with different statuses for transform1
        (testing "Filter by transform1 ID and failed status"
          (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                               :transform_ids [(:id transform1)]
                                               :statuses ["failed"])]
            (assert-run-count response 2)
            (is (every? #(and (= (:id transform1) (:transform_id %))
                              (= "failed" (:status %)))
                        (:data response)))))))))

(deftest get-runs-combine-tag-and-status-test
  (testing "GET /api/ee/transform/run - combine tag and status filters"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform transform1 {}
                     :model/Transform transform2 {}
                     :model/Transform transform3 {}
                     :model/TransformTag tag1 {}
                     :model/TransformTransformTag _ {:transform_id (:id transform1) :tag_id (:id tag1) :position 0}
                     :model/TransformTransformTag _ {:transform_id (:id transform2) :tag_id (:id tag1) :position 0}
                     :model/TransformRun _run1 {:transform_id (:id transform1) :status "succeeded"}
                     :model/TransformRun _run1 {:transform_id (:id transform2) :status "failed"}
                     :model/TransformRun _run1 {:transform_id (:id transform3) :status "failed"}
                     :model/TransformRun _run1 {:transform_id (:id transform2) :status "succeeded"}]
        ;; Associate tag1 with transform1 and transform2
        (testing "Filter by tag1 and failed status returns only failed runs of tagged transforms"
          (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                               :transform_tag_ids [(:id tag1)]
                                               :statuses ["failed"])]
            (assert-run-count response 1)
            (is (= (:id transform2) (-> response :data first :transform_id)))
            (is (= "failed" (-> response :data first :status)))))))))

(deftest get-runs-intersect-transform-id-and-tag-test
  (testing "GET /api/ee/transform/run - intersection of transform IDs and tags"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform transform1 {}
                     :model/Transform transform2 {}
                     :model/TransformTag tag1 {}
                     :model/TransformTag tag2 {}
                     :model/TransformTransformTag _ {:transform_id (:id transform1) :tag_id (:id tag1) :position 0}
                     :model/TransformTransformTag _ {:transform_id (:id transform2) :tag_id (:id tag2) :position 0}
                     :model/TransformRun _run1 {:transform_id (:id transform1)}
                     :model/TransformRun _run1 {:transform_id (:id transform2)}]
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
            (assert-transform-ids response #{(:id transform1)})))))))

(deftest create-transform-with-routing-fails-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms :database-routing}
      (mt/dataset transforms-dataset/transforms-test
        (with-transform-cleanup! [table-name "gadget_products"]
          (let [query  (make-query "Gadget")
                schema (get-test-schema)]
            (mt/with-temp [:model/Database _destination {:engine driver/*driver*
                                                         :router_database_id (mt/id)
                                                         :details {:destination_database true}}
                           :model/DatabaseRouter _ {:database_id (mt/id)
                                                    :user_attribute "db_name"}]
              (is (= "Transforms are not supported on databases with DB routing enabled."
                     (mt/user-http-request :crowberto :post 400 "ee/transform"
                                           {:name   "Gadget Products"
                                            :source {:type "query" :query query}
                                            :target {:type "table" :schema schema :name table-name}}))))))))))

(deftest update-transform-with-routing-fails-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms :database-routing}
      (mt/dataset transforms-dataset/transforms-test
        (with-transform-cleanup! [table-name "gadget_products"]
          (let [query  (make-query "Gadget")
                schema (get-test-schema)]
            (mt/with-temp [:model/Database _destination {:engine driver/*driver*
                                                         :router_database_id (mt/id)
                                                         :details {:destination_database true}}
                           :model/DatabaseRouter _ {:database_id (mt/id)
                                                    :user_attribute "db_name"}
                           :model/Transform transform {:name   "Gadget Products"
                                                       :source {:type "query" :query query}
                                                       :target {:type "table" :schema schema :name table-name}}]
              (is (= "Transforms are not supported on databases with DB routing enabled."
                     (mt/user-http-request :crowberto :put 400 (format "ee/transform/%s" (:id transform))
                                           (assoc transform :name "Gadget Products 2")))))))))))
