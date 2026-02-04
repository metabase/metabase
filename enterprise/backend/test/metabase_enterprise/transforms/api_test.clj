(ns ^:mb/driver-tests metabase-enterprise.transforms.api-test
  "Tests for /api/transform endpoints."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.transforms.api]
   [metabase-enterprise.transforms.models.transform :as transform.model]
   [metabase-enterprise.transforms.query-test-util :as query-test-util]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :refer [get-test-schema
                                                     parse-instant
                                                     utc-timestamp
                                                     with-transform-cleanup!]]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
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
  (let [table-name (t2/select-one-fn :name :model/Table (mt/id :transforms_products))]
    (query-test-util/make-query
     {:source-table  table-name
      :source-column "category"
      :filter-fn     lib/=
      :filter-values [category]})))

(deftest create-transform-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-data-analyst-role! (mt/user->id :lucky)
          (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
            (with-transform-cleanup! [table-name "gadget_products"]
              (let [query        (make-query "Gadget")
                    schema       (get-test-schema)
                    response     (mt/user-http-request :lucky :post 200 "ee/transform"
                                                       {:name   "Gadget Products"
                                                        :source {:type  "query"
                                                                 :query query}
                                                        :target {:type   "table"
                                                                 :schema schema
                                                                 :name   table-name}})
                    transform-id (:id response)
                    lucky-id (mt/user->id :lucky)
                    creator-id   (t2/select-one-fn :creator_id :model/Transform transform-id)]
                (testing "Response includes creator_id"
                  (is (= lucky-id (:creator_id response))))
                (testing "Database record has creator_id set correctly"
                  (is (= lucky-id creator-id)))
                (testing "Response hydrates creator"
                  (is (map? (:creator response)))
                  (is (= lucky-id (get-in response [:creator :id]))))
                (testing "Response includes owner_user_id defaulting to creator"
                  (is (= lucky-id (:owner_user_id response))))
                (testing "Response hydrates owner"
                  (is (map? (:owner response)))
                  (is (= lucky-id (get-in response [:owner :id]))))))))))))

(deftest create-transform-with-owner-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (testing "Creating a transform with explicit owner_user_id"
          (with-transform-cleanup! [table-name "owner_user_id_test"]
            (let [query (make-query "Gadget")
                  schema (get-test-schema)
                  rasta-id (mt/user->id :rasta)
                  response (mt/user-http-request :crowberto :post 200 "ee/transform"
                                                 {:name "Transform with explicit owner"
                                                  :source {:type "query"
                                                           :query query}
                                                  :target {:type "table"
                                                           :schema schema
                                                           :name table-name}
                                                  :owner_user_id rasta-id})]
              (is (= rasta-id (:owner_user_id response))
                  "owner_user_id should match the specified user")
              (is (nil? (:owner_email response))
                  "owner_email should be nil when owner_user_id is set")
              (is (= rasta-id (get-in response [:owner :id]))
                  "Hydrated owner should match the specified user"))))

        (testing "Creating a transform with external owner_email"
          (with-transform-cleanup! [table-name "owner_email_test"]
            (let [query (make-query "Gadget")
                  schema (get-test-schema)
                  response (mt/user-http-request :crowberto :post 200 "ee/transform"
                                                 {:name "Transform with external owner"
                                                  :source {:type "query"
                                                           :query query}
                                                  :target {:type "table"
                                                           :schema schema
                                                           :name table-name}
                                                  :owner_email "external.owner@example.com"})]
              (is (nil? (:owner_user_id response))
                  "owner_user_id should be nil when owner_email is set")
              (is (= "external.owner@example.com" (:owner_email response))
                  "owner_email should match the specified email")
              (is (= {:email "external.owner@example.com"} (:owner response))
                  "Hydrated owner should be email-only map"))))))))

(deftest update-transform-owner-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (with-transform-cleanup! [table-name "update_owner_test"]
          (let [query (make-query "Gadget")
                schema (get-test-schema)
                created (mt/user-http-request :crowberto :post 200 "ee/transform"
                                              {:name "Transform for owner update"
                                               :source {:type "query"
                                                        :query query}
                                               :target {:type "table"
                                                        :schema schema
                                                        :name table-name}})
                transform-id (:id created)
                crowberto-id (mt/user->id :crowberto)
                rasta-id (mt/user->id :rasta)]

            (testing "Initial owner is the creator"
              (is (= crowberto-id (:owner_user_id created))))

            (testing "Update owner to a different user"
              (let [updated (mt/user-http-request :crowberto :put 200
                                                  (format "ee/transform/%s" transform-id)
                                                  {:owner_user_id rasta-id})]
                (is (= rasta-id (:owner_user_id updated)))
                (is (nil? (:owner_email updated)))
                (is (= rasta-id (get-in updated [:owner :id])))))

            (testing "Update owner to external email"
              (let [updated (mt/user-http-request :crowberto :put 200
                                                  (format "ee/transform/%s" transform-id)
                                                  {:owner_email "new.owner@example.com"
                                                   :owner_user_id nil})]
                (is (nil? (:owner_user_id updated)))
                (is (= "new.owner@example.com" (:owner_email updated)))
                (is (= {:email "new.owner@example.com"} (:owner updated)))))

            (testing "Clear owner by setting both to nil"
              (let [updated (mt/user-http-request :crowberto :put 200
                                                  (format "ee/transform/%s" transform-id)
                                                  {:owner_user_id nil
                                                   :owner_email nil})]
                (is (nil? (:owner_user_id updated)))
                (is (nil? (:owner_email updated)))
                (is (nil? (:owner updated)))))))))))

(deftest transform-type-detection-test
  (testing "Transform type is automatically detected and set based on source"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms :transforms-python}
        (mt/dataset transforms-dataset/transforms-test
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
              (testing "MBQL query transforms are detected as :mbql"
                (with-transform-cleanup! [table-name "mbql_transform"]
                  (let [mbql-query (mt/mbql-query transforms_products)
                        schema (get-test-schema)
                        response (mt/user-http-request :lucky :post 200 "ee/transform"
                                                       {:name   "MBQL Transform"
                                                        :source {:type  "query"
                                                                 :query mbql-query}
                                                        :target {:type   "table"
                                                                 :schema schema
                                                                 :name   table-name}})]
                    (is (= "mbql" (:source_type response))))))

              (testing "Native query transforms are detected as :native"
                (with-transform-cleanup! [table-name "native_transform"]
                  (let [schema (get-test-schema)
                        response (mt/user-http-request :lucky :post 200 "ee/transform"
                                                       {:name   "Native Transform"
                                                        :source {:type  "query"
                                                                 :query (lib/native-query (mt/metadata-provider) "SELECT 1")}
                                                        :target {:type   "table"
                                                                 :schema schema
                                                                 :name   table-name}})]
                    (is (= "native" (:source_type response))))))

              (testing "Python transforms are detected as :python"
                (with-transform-cleanup! [table-name "python_transform"]
                  (let [schema (get-test-schema)
                        response (mt/user-http-request :lucky :post 200 "ee/transform"
                                                       {:name   "My beautiful python runner"
                                                        :source {:type            "python"
                                                                 :body            "print('hello world')"
                                                                 :source-tables   {}
                                                                 :source-database (mt/id)}
                                                        :target {:type     "table"
                                                                 :schema   schema
                                                                 :name     table-name
                                                                 :database (mt/id)}})]
                    (is (= "python" (:source_type response)))))))))))))

(deftest transform-type-updates-test
  (testing "Transform type is automatically updated when source changes"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
              (with-transform-cleanup! [table-name "type_update_transform"]
                (let [native-query (lib/native-query (mt/metadata-provider) "SELECT 1")
                      mbql-query (mt/mbql-query transforms_products)
                      schema (get-test-schema)
                      created (mt/user-http-request :lucky :post 200 "ee/transform"
                                                    {:name   "Native Transform"
                                                     :source {:type  "query"
                                                              :query native-query}
                                                     :target {:type   "table"
                                                              :schema schema
                                                              :name   table-name}})]
                  (is (= "native" (:source_type created)))

                  (testing "Type automatically changes to mbql when updating to an MBQL query"
                    (let [updated (mt/user-http-request :lucky :put 200
                                                        (format "ee/transform/%s" (:id created))
                                                        {:source {:type  "query"
                                                                  :query mbql-query}})]
                      (is (= "mbql" (:source_type updated))))))))))))))

(deftest create-transform-feature-flag-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (testing "Creating a query transform without :transforms feature returns 403"
      (mt/with-premium-features #{}
        (mt/dataset transforms-dataset/transforms-test
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
              (let [query  (make-query "Gadget")
                    schema (get-test-schema)
                    response (mt/user-http-request :lucky :post 402 "ee/transform"
                                                   {:name   "Test Transform"
                                                    :source {:type  "query"
                                                             :query query}
                                                    :target {:type   "table"
                                                             :schema schema
                                                             :name   "test_transform"}})]
                (is (= "error-premium-feature-not-available" (:status response))))))))

      (testing "Creating a query transform with :transforms feature succeeds"
        (mt/with-premium-features #{:transforms}
          (mt/dataset transforms-dataset/transforms-test
            (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
              (mt/with-data-analyst-role! (mt/user->id :lucky)
                (with-transform-cleanup! [table-name "test_query_transform"]
                  (let [query  (make-query "Gadget")
                        schema (get-test-schema)
                        response (mt/user-http-request :lucky :post 200 "ee/transform"
                                                       {:name   "Test Transform"
                                                        :source {:type  "query"
                                                                 :query query}
                                                        :target {:type   "table"
                                                                 :schema schema
                                                                 :name   table-name}})]
                    (is (some? (:id response)))))))))))))

(deftest update-transform-feature-flag-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (testing "Updating a query transform requires :transforms feature"
              (with-transform-cleanup! [table-name "test_update"]
                (let [query  (make-query "Gadget")
                      schema (get-test-schema)
                      transform-payload {:name   "Original Transform"
                                         :source {:type  "query"
                                                  :query query}
                                         :target {:type   "table"
                                                  :schema schema
                                                  :name   table-name}}
                      created (mt/user-http-request :lucky :post 200 "ee/transform" transform-payload)]
                ;; Now test update without feature flag
                  (mt/with-premium-features #{}
                    (let [response (mt/user-http-request :lucky :put
                                                         (format "ee/transform/%d" (:id created))
                                                         (assoc transform-payload :name "Updated Transform"))]
                      (is (= "error-premium-feature-not-available" (:status response))))))))))))))

(deftest run-transform-feature-flag-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (testing "Running a query transform requires :transforms feature"
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
              (with-transform-cleanup! [table-name "test_run"]
                (let [query  (make-query "Gadget")
                      schema (get-test-schema)
                      transform-payload {:name   "Test Run Transform"
                                         :source {:type  "query"
                                                  :query query}
                                         :target {:type   "table"
                                                  :schema schema
                                                  :name   table-name}}
                      created (mt/user-http-request :lucky :post 200 "ee/transform" transform-payload)]
                ;; Now test run without feature flag
                  (mt/with-premium-features #{}
                    (let [response (mt/user-http-request :lucky :post
                                                         (format "ee/transform/%d/run" (:id created)))]
                      (is (= "error-premium-feature-not-available" (:status response))))))))))))))

(deftest list-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/with-data-analyst-role! (mt/user->id :lucky)
        (testing "Can list without query parameters"
          (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
            (mt/user-http-request :lucky :get 200 "ee/transform")))
        (testing "Can list with query parameters"
          (mt/dataset transforms-dataset/transforms-test
            (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
              (with-transform-cleanup! [table-name "gadget_products"]
                (let [body         {:name        "Gadget Products"
                                    :description "Desc"
                                    :source      {:type  "query"
                                                  :query (make-query "Gadget")}
                                    :target      {:type   "table"
                                                  :schema (get-test-schema)
                                                  :name   table-name}}
                      _            (mt/user-http-request :lucky :post 200 "ee/transform" body)
                      list-resp    (mt/user-http-request :lucky :get 200 "ee/transform")
                      lucky-id (mt/user->id :lucky)]
                  (is (seq list-resp))
                  (testing "List response hydrates creator"
                    (is (every? #(map? (:creator %)) list-resp))
                    (is (some #(= lucky-id (get-in % [:creator :id])) list-resp)))
                  (testing "List response includes source_readable field"
                    (is (every? #(contains? % :source_readable) list-resp))
                    (is (some #(true? (:source_readable %)) list-resp)
                        "At least one transform should have readable sources")))))))))))

(deftest filter-transforms-test
  (testing "should be able to filter transforms"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/with-data-analyst-role! (mt/user->id :lucky)
          (mt/with-temp [:model/Transform               {t1-id :id} {}
                         :model/Transform               {t2-id :id} {}
                         :model/TransformTag            {tag1-id :id} {:name "tag1"}
                         :model/TransformTag            {tag2-id :id} {:name "tag2"}
                         :model/TransformTransformTag _ {:transform_id t1-id :tag_id tag1-id :position 1}
                         :model/TransformTransformTag _ {:transform_id t2-id :tag_id tag2-id :position 1}
                         :model/TransformRun _          {:transform_id t1-id :status "started" :run_method "manual"
                                                         :start_time (parse-instant "2025-08-26T10:12:11")
                                                         :end_time nil
                                                         :is_active true}]
            (testing "no filters"
              (is (=? [{:id t1-id} {:id t2-id}]
                      (mt/user-http-request :lucky :get 200 "ee/transform"))))
            (testing "last_run_start_time filter"
              (is (=? [{:id t1-id}]
                      (mt/user-http-request :lucky :get 200 "ee/transform" :last_run_start_time "2025-08-26T10:12:11"))))
            (testing "last_run_statuses filter"
              (is (=? [{:id t1-id}]
                      (mt/user-http-request :lucky :get 200 "ee/transform" :last_run_statuses ["started" "succeeded"]))))
            (testing "tag_ids filter"
              (is (=? [{:id t1-id}]
                      (mt/user-http-request :lucky :get 200 "ee/transform" :tag_ids [tag1-id])))
              (is (=? [{:id t2-id}]
                      (mt/user-http-request :lucky :get 200 "ee/transform" :tag_ids [tag2-id]))))))))))

(deftest get-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-data-analyst-role! (mt/user->id :lucky)
          (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
            (with-transform-cleanup! [table-name "gadget_products"]
              (let [body         {:name        "Gadget Products"
                                  :description "Desc"
                                  :source      {:type  "query"
                                                :query (make-query "Gadget")}
                                  :target      {:type   "table"
                                                :schema (get-test-schema)
                                                :name   table-name}}
                    resp         (mt/user-http-request :lucky :post 200 "ee/transform" body)
                    get-resp     (mt/user-http-request :lucky :get 200 (format "ee/transform/%s" (:id resp)))
                    lucky-id (mt/user->id :lucky)]
                (is (=? (m/dissoc-in body [:source :query :lib/metadata])
                        (update-in get-resp [:source :query] lib/normalize)))
                (testing "GET response hydrates creator"
                  (is (map? (:creator get-resp)))
                  (is (= lucky-id (get-in get-resp [:creator :id]))))))))))))

(deftest source-readable-field-test
  (testing "Transforms API includes source_readable field"
    (mt/with-premium-features #{:transforms}
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/dataset transforms-dataset/transforms-test
          (with-transform-cleanup! [table-name "test_readable"]
            (let [body {:name        "Test Transform"
                        :description "Test"
                        :source      {:type  "query"
                                      :query (make-query "Gadget")}
                        :target      {:type   "table"
                                      :schema (get-test-schema)
                                      :name   table-name}}]
              (testing "Users with transforms permission can see source_readable field"
                (mt/with-data-analyst-role! (mt/user->id :lucky)
                  (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
                    (let [created (mt/user-http-request :lucky :post 200 "ee/transform" body)]
                      (testing "in POST /ee/transform response"
                        (is (contains? created :source_readable))
                        (is (boolean? (:source_readable created))))

                      (testing "in GET /ee/transform response"
                        (let [list-resp (mt/user-http-request :lucky :get 200 "ee/transform")]
                          (is (every? #(contains? % :source_readable) list-resp))
                          (is (every? #(boolean? (:source_readable %)) list-resp))))

                      (testing "in GET /ee/transform/:id response"
                        (let [get-resp (mt/user-http-request :lucky :get 200 (format "ee/transform/%s" (:id created)))]
                          (is (contains? get-resp :source_readable))
                          (is (boolean? (:source_readable get-resp)))))

                      (testing "source_readable is true when user has database read permission"
                        (let [get-resp (mt/user-http-request :lucky :get 200 (format "ee/transform/%s" (:id created)))]
                          (is (true? (:source_readable get-resp))
                              "User with transforms permission should be able to read the source database"))))))))))))))

(defn- ->transform [transform-name query]
  {:source {:type "query",
            :query query}
   :name transform-name
   :target {:schema "public"
            :name "orders_2"
            :type "table"}})

(deftest get-transform-dependencies-test
  (mt/with-data-analyst-role! (mt/user->id :lucky)
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-temp [:model/Table {table :id} {:schema "public", :name "orders_2"}
                     :model/Field _           {:table_id table, :name "foo"}
                     :model/Transform parent  (->transform "transform1" (mt/mbql-query orders))
                     :model/Transform child   (-> (->transform "transform2" (mt/mbql-query nil {:source-table table}))
                                                  (assoc-in [:target :name] "orders_3"))]
        (mt/with-premium-features #{:transforms}
          (let [deps-resp (mt/user-http-request :lucky :get 200 (format "ee/transform/%s/dependencies" (:id child)))]
            (is (=? [{:name      "transform1"
                      :source    {:type "query"
                                  :query {:database (mt/id)
                                          :lib/type "mbql/query"
                                          :stages   [{:source-table (mt/id :orders)}]}}
                      :id        (:id parent)
                      :entity_id (:entity_id parent)
                      :target    {:schema "public", :name "orders_2", :type "table"}}]
                    deps-resp))
            (testing "Dependencies response hydrates creator"
              (is (every? #(map? (:creator %)) deps-resp)))))))))

(deftest put-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (with-transform-cleanup! [table-name "gadget_products"]
              (let [query2       (make-query "None")
                    resp         (mt/user-http-request :lucky :post 200 "ee/transform"
                                                       {:name   "Gadget Products"
                                                        :source {:type  "query"
                                                                 :query (make-query "Gadget")}
                                                        :target {:type   "table"
                                                                 :schema (get-test-schema)
                                                                 :name   table-name}})
                    transform    {:name        "Gadget Products 2"
                                  :description "Desc"
                                  :source      {:type  "query"
                                                :query query2}
                                  :target      {:type   "table"
                                                :schema (get-test-schema)
                                                :name   table-name}}
                    put-resp     (mt/user-http-request :lucky :put 200 (format "ee/transform/%s" (:id resp))
                                                       transform)
                    lucky-id (mt/user->id :lucky)]
                (is (=? (m/dissoc-in transform [:source :query :lib/metadata])
                        (update-in put-resp [:source :query] lib/normalize)))
                (testing "PUT response hydrates creator"
                  (is (map? (:creator put-resp)))
                  (is (= lucky-id (get-in put-resp [:creator :id]))))))))))))

(deftest change-target-table-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (with-transform-cleanup! [table1-name "dookey_products"
                                      table2-name "doohickey_products"]
              (let [query2   (make-query "Doohickey")
                    original {:name   "Gadget Products"
                              :source {:type  "query"
                                       :query (make-query "Gadget")}
                              :target {:type   "table"
                                       :schema (get-test-schema)
                                       :name   table1-name}}
                    resp     (mt/user-http-request :lucky :post 200 "ee/transform"
                                                   original)
                    updated  {:name        "Doohickey Products"
                              :description "Desc"
                              :source      {:type  "query"
                                            :query query2}
                              :target      {:type   "table"
                                            :schema (get-test-schema)
                                            :name   table2-name}}]
                (is (=? (-> updated
                            (m/dissoc-in [:source :query :lib/metadata]))
                        (-> (mt/user-http-request :lucky :put 200 (format "ee/transform/%s" (:id resp)) updated)
                            (update-in [:source :query] lib/normalize))))
                (is (false? (transforms.util/target-table-exists? original)))))))))))

(deftest delete-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (with-transform-cleanup! [table-name "gadget_products"]
              (let [resp (mt/user-http-request :lucky :post 200 "ee/transform"
                                               {:name   "Gadget Products"
                                                :source {:type  "query"
                                                         :query (make-query "Gadget")}
                                                :target {:type   "table"
                                                         :schema (get-test-schema)
                                                         :name   table-name}})]
                (mt/user-http-request :lucky :delete 204 (format "ee/transform/%s" (:id resp)))
                (mt/user-http-request :lucky :get 404 (format "ee/transform/%s" (:id resp)))))))))))

(deftest delete-table-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (with-transform-cleanup! [table-name "gadget_products"]
              (let [resp (mt/user-http-request :lucky :post 200 "ee/transform"
                                               {:name   "Gadget Products"
                                                :source {:type  "query"
                                                         :query (make-query "Gadget")}
                                                :target {:type   "table"
                                                         :schema (get-test-schema)
                                                         :name   table-name}})]
                (mt/user-http-request :lucky :delete 204 (format "ee/transform/%s/table" (:id resp)))))))))))

(defn- test-run!
  [transform-id]
  (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (let [resp      (mt/user-http-request :lucky :post 202 (format "ee/transform/%s/run" transform-id))
            timeout-s 10 ; 10 seconds is our timeout to finish execution and sync
            limit     (+ (System/currentTimeMillis) (* timeout-s 1000))]
        (is (=? {:message "Transform run started"}
                resp))
        (loop []
          (when (> (System/currentTimeMillis) limit)
            (throw (ex-info (str "Transform run timed out after " timeout-s " seconds") {})))
          (let [resp   (mt/user-http-request :lucky :get 200 (format "ee/transform/%s" transform-id))
                status (some-> resp :last_run :status keyword)]
            (when-not (contains? #{:started :succeeded} status)
              (throw (ex-info (str "Transform run failed with status " status) {:resp resp})))
            (when-not (some? (:table resp))
              (Thread/sleep 100)
              (recur))))))))

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
          (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
            (mt/with-data-analyst-role! (mt/user->id :lucky)
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
                        {transform-id :id} (mt/user-http-request :lucky :post 200 "ee/transform"
                                                                 original)
                        _                  (do (test-run! transform-id)
                                               (wait-for-table table1-name 5000))
                        _                  (is (true? (transforms.util/target-table-exists? original)))
                        _                  (check-query-results table1-name [5 11 16] "Gadget")
                        updated            {:name        "Doohickey Products"
                                            :description "Desc"
                                            :source      {:type  "query"
                                                          :query query2}
                                            :target      target2}]
                    (is (=? (-> updated
                                (m/dissoc-in [:source :query :lib/metadata]))
                            (->
                             (mt/user-http-request :lucky :put 200 (format "ee/transform/%s" transform-id) updated)
                             (update-in [:source :query] lib/normalize))))
                    (test-run! transform-id)
                    (wait-for-table table2-name 5000)
                    (is (true? (transforms.util/target-table-exists? original)))
                    (is (true? (transforms.util/target-table-exists? updated)))
                    (check-query-results table2-name [2 3 4 13] "Doohickey")))))))))))

(deftest get-runs-filter-by-single-transform-id-test
  (testing "GET /api/ee/transform/run - filter by single transform ID"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms}
        (mt/with-temp [:model/Transform transform1 {}
                       :model/Transform transform2 {}
                       :model/TransformRun run1 {:transform_id (:id transform1)}
                       :model/TransformRun run2 {:transform_id (:id transform2)}]
          (testing "Filter by transform1 ID only returns transform1 runs"
            (let [response (mt/user-http-request :lucky :get 200 "ee/transform/run"
                                                 :transform_ids [(:id transform1)])]
              (assert-run-count response 1)
              (assert-transform-ids response #{(:id transform1)})
              (is (= (:id run1) (-> response :data first :id)))))

          (testing "Filter by transform2 ID only returns transform2 runs"
            (let [response (mt/user-http-request :lucky :get 200 "ee/transform/run"
                                                 :transform_ids [(:id transform2)])]
              (assert-run-count response 1)
              (assert-transform-ids response #{(:id transform2)})
              (is (= (:id run2) (-> response :data first :id))))))))))

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
        (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
          (mt/with-data-analyst-role! (mt/user->id :lucky)
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
                                                :target {:type "table" :schema schema :name table-name}}))))))))))))

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

(deftest transform-revisions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (with-transform-cleanup! [table-name "transform_revisions_test"]
          (let [test-transform-revisions (fn [action url req exp-revisions]
                                           (let [response (mt/user-http-request :crowberto action 200 url req)
                                                 transform-id (:id response)
                                                 ;; Read the updated transform from the DB for accurate comparison
                                                 transform (-> (t2/select-one :model/Transform transform-id)
                                                               (t2/hydrate :transform_tag_ids))]
                                             (is (= exp-revisions (t2/count :model/Revision :model "Transform"
                                                                            :model_id transform-id)))
                                             (let [revision (t2/select-one :model/Revision :model "Transform"
                                                                           :model_id transform-id :most_recent true)
                                                   rev-transform (:object revision)
                                                   removed #{:id :entity_id :created_at :updated_at}]
                                               (is (every? #(not (contains? rev-transform %)) removed))
                                               ;; Compare revision with DB transform (both have in-memory representation)
                                               (is (=? (dissoc rev-transform :source :owner) transform)))
                                             transform-id))
                gadget-req {:name   "Gadget Products"
                            :description "The gadget products"
                            :source {:type  "query"
                                     :query (make-query "Gadget")}
                            :target {:type   "table"
                                     :schema (get-test-schema)
                                     :name   table-name}}
                transform-id (test-transform-revisions :post "ee/transform" gadget-req 1)
                widget-req {:name   "Widget Products"
                            :description "The widget products"
                            :source {:type  "query"
                                     :query (make-query "Widget")}
                            :tag_ids [4]
                            :target {:type   "table"
                                     :schema (get-test-schema)
                                     :name   table-name}}]
            (test-transform-revisions :put (str "ee/transform/" transform-id) widget-req 2)))))))

(deftest permissions-test
  (testing "Transform endpoints require transforms permission"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform transform {}]
        (testing "Regular users without transform permission get 403"
          (mt/user-http-request :rasta :get 403 "ee/transform")
          (mt/user-http-request :rasta :get 403 (str "ee/transform/" (:id transform)))
          (mt/user-http-request :rasta :post 403 "ee/transform"
                                {:name   "Test"
                                 :source {:type  "query"
                                          :query {:database (mt/id)
                                                  :type     "native"
                                                  :native   {:query "SELECT 1"}}}
                                 :target {:type "table" :name "test_table"}})
          (mt/user-http-request :rasta :put 403 (str "ee/transform/" (:id transform))
                                {:name "Updated"})
          (mt/user-http-request :rasta :delete 403 (str "ee/transform/" (:id transform))))

        (testing "Data analysts can read transforms"
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (mt/user-http-request :lucky :get 200 "ee/transform")
            (mt/user-http-request :lucky :get 200 (str "ee/transform/" (:id transform)))))))))

(defmethod driver/database-supports? [::driver/driver ::extract-columns-from-query]
  [_driver _feature _database]
  true)

(doseq [driver [:clickhouse :redshift :bigquery-cloud-sdk :snowflake]]
  (defmethod driver/database-supports? [driver ::extract-columns-from-query]
    [_driver _feature _database]
    false))

(deftest ^:parallel extract-columns-from-query-test
  (testing "POST /api/ee/transform/extract-columns"
    (mt/test-drivers (mt/normal-driver-select {:+features [:transforms/table
                                                           ::extract-columns-from-query]})
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (letfn [(make-native-query [sql]
                    {:lib/type :mbql/query
                     :database (mt/id)
                     :stages [{:lib/type :mbql.stage/native
                               :native sql}]})]
            (testing "Successfully extracts columns from a simple SELECT query"
              (let [response (mt/user-http-request :crowberto :post 200 "ee/transform/extract-columns"
                                                   {:query (make-native-query "SELECT id, name, category, price FROM transforms_products")})]
                (is (= ["id" "price"] (:columns response))
                    "Should only return numeric (id, price) columns, filtering out text columns (name, category)")))

            (testing "Returns nil for invalid SQL"
              (let [response (mt/user-http-request :crowberto :post 200 "ee/transform/extract-columns"
                                                   {:query (make-native-query "SELECT * FORM invalid_table")})]
                (is (nil? (:columns response)))))

            (testing "Extracts columns from query with aliases"
              (let [response (mt/user-http-request :crowberto :post 200 "ee/transform/extract-columns"
                                                   {:query (make-native-query "SELECT id AS product_id, name AS product_name FROM transforms_products")})]
                (is (= ["product_id"] (:columns response))
                    "Should only return numeric column (id), filtering out text column (name)")))

            (testing "Filters columns by type - only returns numeric and temporal columns"
              (let [response (mt/user-http-request :crowberto :post 200 "ee/transform/extract-columns"
                                                   {:query (make-native-query "SELECT id, name, category, price, created_at FROM transforms_products")})]
                (is (= ["id" "price" "created_at"] (:columns response))
                    "Should return numeric (id, price) and temporal (created_at) columns, filtering out text columns (name, category)")))

            (testing "Requires superuser permissions"
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :rasta :post 403 "ee/transform/extract-columns"
                                           {:query (make-native-query "SELECT * FROM transforms_products")}))))

            (testing "Returns 404 for non-existent database"
              (is (= "Not found."
                     (mt/user-http-request :crowberto :post 404 "ee/transform/extract-columns"
                                           {:query {:lib/type :mbql/query
                                                    :database 999999
                                                    :stages [{:lib/type :mbql.stage/native
                                                              :native "SELECT * FROM transforms_products"}]}}))))))))))

(deftest ^:parallel is-simple-query-test
  (testing "POST /api/ee/transform/is-simple-query"
    (mt/with-premium-features #{:transforms}
      (testing "Returns true for simple SELECT queries"
        (let [response (mt/user-http-request :crowberto :post 200 "ee/transform/is-simple-query"
                                             {:query "SELECT id, name FROM products"})]
          (is (true? (:is_simple response)))
          (is (nil? (:reason response)))))

      (testing "Returns true for simple SELECT with WHERE clause"
        (let [response (mt/user-http-request :crowberto :post 200 "ee/transform/is-simple-query"
                                             {:query "SELECT id, name FROM products WHERE category = 'Electronics'"})]
          (is (true? (:is_simple response)))))

      (testing "Returns true for simple SELECT with JOIN"
        (let [response (mt/user-http-request :crowberto :post 200 "ee/transform/is-simple-query"
                                             {:query "SELECT p.id, p.name, c.name FROM products p JOIN categories c ON p.category_id = c.id"})]
          (is (true? (:is_simple response)))))

      (testing "Returns false for query with LIMIT"
        (let [response (mt/user-http-request :crowberto :post 200 "ee/transform/is-simple-query"
                                             {:query "SELECT id, name FROM products LIMIT 10"})]
          (is (false? (:is_simple response)))
          (is (= "Contains a LIMIT" (:reason response)))))

      (testing "Returns false for query with OFFSET"
        (let [response (mt/user-http-request :crowberto :post 200 "ee/transform/is-simple-query"
                                             {:query "SELECT id, name FROM products OFFSET 5"})]
          (is (false? (:is_simple response)))
          (is (= "Contains an OFFSET" (:reason response)))))

      (testing "Returns false for query with LIMIT and OFFSET"
        (let [response (mt/user-http-request :crowberto :post 200 "ee/transform/is-simple-query"
                                             {:query "SELECT id, name FROM products LIMIT 10 OFFSET 5"})]
          (is (false? (:is_simple response)))
          (is (= "Contains a LIMIT" (:reason response)))))

      (testing "Returns false for query with CTE"
        (let [response (mt/user-http-request :crowberto :post 200 "ee/transform/is-simple-query"
                                             {:query "WITH category_counts AS (SELECT category, COUNT(*) as cnt FROM products GROUP BY category) SELECT * FROM category_counts"})]
          (is (false? (:is_simple response)))
          (is (= "Contains a CTE" (:reason response))))))))

;;; ------------------------------------------------------------
;;; User Attribution Tests
;;; ------------------------------------------------------------

(deftest manual-run-user-attribution-test
  (testing "Manual runs are attributed to the triggering user, not the owner"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (with-transform-cleanup! [table-name "user_attribution_test"]
            (let [rasta-id (mt/user->id :rasta)
                  crowberto-id (mt/user->id :crowberto)
                  ;; Create transform owned by rasta, but run by crowberto
                  transform (mt/user-http-request :crowberto :post 200 "ee/transform"
                                                  {:name "Attribution Test"
                                                   :source {:type "query"
                                                            :query (make-query "Gadget")}
                                                   :target {:type "table"
                                                            :schema (get-test-schema)
                                                            :name table-name}
                                                   :owner_user_id rasta-id})
                  transform-id (:id transform)]
              ;; Verify owner is rasta
              (is (= rasta-id (:owner_user_id transform))
                  "Owner should be rasta")
              ;; Run as crowberto (different from owner)
              (mt/user-http-request :crowberto :post 202
                                    (format "ee/transform/%d/run" transform-id))
              ;; Wait for run to start and check attribution
              (let [run (u/poll {:thunk #(t2/select-one :model/TransformRun :transform_id transform-id)
                                 :done? some?
                                 :timeout-ms 5000})]
                (is (some? run) "Run should exist")
                (is (= crowberto-id (:user_id run))
                    "Run should be attributed to the triggering user (crowberto), not the owner (rasta)")))))))))

;;; ------------------------------------------------------------
;;; Collection Items Integration Tests
;;; ------------------------------------------------------------

(deftest collection-items-include-transforms-test
  (testing "GET /api/collection/:id/items"
    (testing "Includes transforms in collection items"
      (mt/with-data-analyst-role! (mt/user->id :lucky)
        (mt/with-premium-features #{:transforms}
          (mt/with-temp [:model/Collection {collection-id :id} {:name "Transforms Collection"
                                                                :namespace :transforms}
                         :model/Transform  {transform-id :id}
                         {:name "Test Transform"
                          :description "A test transform"
                          :collection_id collection-id}]
            ;; Test 1: Transform appears in unfiltered results
            (let [items (:data (mt/user-http-request :lucky :get 200
                                                     (format "collection/%d/items" collection-id)))]
              (is (= 1 (count items)))
              (is (= "transform" (:model (first items))))
              (is (= "Test Transform" (:name (first items)))))

            ;; Test 2: Transform appears when filtered by models=transform
            (let [items (:data (mt/user-http-request :lucky :get 200
                                                     (format "collection/%d/items" collection-id)
                                                     :models "transform"))]
              (is (= 1 (count items)))
              (is (= transform-id (:id (first items)))))

            ;; Test 3: Transform NOT returned when filtering for other models only
            (let [items (:data (mt/user-http-request :lucky :get 200
                                                     (format "collection/%d/items" collection-id)
                                                     :models "card"))]
              (is (empty? items)))

            ;; Test 4: Non-analysts users don't see transforms
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection-id)
            (let [items (:data (mt/user-http-request :rasta :get 200
                                                     (format "collection/%d/items" collection-id)))]
              (is (empty? items)))

            ;; Test 5: Admins see transforms
            (let [items (:data (mt/user-http-request :crowberto :get 200
                                                     (format "collection/%d/items" collection-id)))]
              (is (= 1 (count items)))
              (is (= "transform" (:model (first items))))
              (is (= "Test Transform" (:name (first items)))))))))))

(deftest create-transform-with-tags-test
  (testing "POST /api/ee/transform with tag_ids"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (let [schema (t2/select-one-fn :schema :model/Table :db_id (mt/id) :active true)]
              (testing "Can create transform with tags"
              ;; Create tags via API since we're testing transform creation with existing tags
                (let [tag1 (mt/user-http-request :lucky :post 200 "ee/transform-tag"
                                                 {:name (str "test-tag-1-" (random-uuid))})
                      tag2 (mt/user-http-request :lucky :post 200 "ee/transform-tag"
                                                 {:name (str "test-tag-2-" (random-uuid))})]
                  (try
                    (let [transform-request (-> (merge (mt/with-temp-defaults :model/Transform)
                                                       {:tag_ids [(:id tag1) (:id tag2)]})
                                                (assoc-in [:target :schema] schema))
                          transform-response (mt/user-http-request :lucky :post 200 "ee/transform"
                                                                   transform-request)]
                      (try
                        (is (= (:name transform-request) (:name transform-response)))
                        (is (= (:tag_ids transform-request) (sort (:tag_ids transform-response))))
                        (finally
                          (t2/delete! :model/Transform :id (:id transform-response)))))
                    (finally
                      (t2/delete! :model/TransformTag :id [:in [(:id tag1) (:id tag2)]])))))
              (testing "Can create transform without tags"
                (let [transform-request (assoc-in (mt/with-temp-defaults :model/Transform)
                                                  [:target :schema] schema)
                      transform-response (mt/user-http-request :lucky :post 200 "ee/transform"
                                                               transform-request)]
                  (try
                    (is (= (:name transform-request) (:name transform-response)))
                    (is (= [] (:tag_ids transform-response)))
                    (finally
                      (t2/delete! :model/Transform :id (:id transform-response)))))))))))))

(deftest update-transform-tags-test
  (testing "PUT /api/ee/transform/:id with tag_ids"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (mt/with-temp [:model/Transform transform {:name "Test Transform"
                                                       :source {:type "query"
                                                                :query {:database (mt/id)
                                                                        :type "native"
                                                                        :native {:query "SELECT 1"}}}
                                                       :target {:type "table"
                                                                :name "test_table"}}
                           :model/TransformTag tag1 {:name "update-tag-1"}
                           :model/TransformTag tag2 {:name "update-tag-2"}
                           :model/TransformTag tag3 {:name "update-tag-3"}]

              (testing "Can add tags to transform"
                (let [updated (mt/user-http-request :lucky :put 200 (str "ee/transform/" (:id transform))
                                                    {:tag_ids [(:id tag1) (:id tag2)]})]
                  (is (= [(:id tag1) (:id tag2)] (sort (:tag_ids updated))))))

              (testing "Can update tags on transform"
                (let [updated (mt/user-http-request :lucky :put 200 (str "ee/transform/" (:id transform))
                                                    {:tag_ids [(:id tag2) (:id tag3)]})]
                  (is (= [(:id tag2) (:id tag3)] (sort (:tag_ids updated))))))

              (testing "Can remove all tags from transform"
                (let [updated (mt/user-http-request :lucky :put 200 (str "ee/transform/" (:id transform))
                                                    {:tag_ids []})]
                  (is (= [] (:tag_ids updated))))))))))))

(deftest get-transform-with-tags-test
  (testing "GET /api/ee/transform/:id returns tag_ids"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (mt/with-temp [:model/Transform transform {:name "Transform With Tags"
                                                       :source {:type "query"
                                                                :query {:database (mt/id)
                                                                        :type "native"
                                                                        :native {:query "SELECT 1"}}}
                                                       :target {:type "table"
                                                                :name "tagged_table"}}
                           :model/TransformTag tag1 {:name "get-tag-1"}
                           :model/TransformTag tag2 {:name "get-tag-2"}]
            ;; Add tags to transform
              (transform.model/update-transform-tags! (:id transform) [(:id tag1) (:id tag2)])

              (testing "Single transform returns tag_ids"
                (let [fetched (mt/user-http-request :lucky :get 200 (str "ee/transform/" (:id transform)))]
                  (is (= [(:id tag1) (:id tag2)] (sort (:tag_ids fetched))))))

              (testing "Transform without tags returns empty array"
                (mt/with-temp [:model/Transform transform2 {:name "Transform Without Tags"
                                                            :source {:type "query"
                                                                     :query {:database (mt/id)
                                                                             :type "native"
                                                                             :native {:query "SELECT 1"}}}
                                                            :target {:type "table"
                                                                     :name "untagged_table"}}]
                  (let [fetched (mt/user-http-request :lucky :get 200 (str "ee/transform/" (:id transform2)))]
                    (is (= [] (:tag_ids fetched)))))))))))))

(deftest list-transforms-with-tags-test
  (testing "GET /api/ee/transform returns transforms with tag_ids"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/with-data-analyst-role! (mt/user->id :lucky)
          (mt/with-temp [:model/Transform transform1 {:name "Transform 1"
                                                      :source {:type "query"
                                                               :query {:database (mt/id)
                                                                       :type "native"
                                                                       :native {:query "SELECT 1"}}}
                                                      :target {:type "table"
                                                               :name "list_table_1"}}
                         :model/Transform transform2 {:name "Transform 2"
                                                      :source {:type "query"
                                                               :query {:database (mt/id)
                                                                       :type "native"
                                                                       :native {:query "SELECT 2"}}}
                                                      :target {:type "table"
                                                               :name "list_table_2"}}
                         :model/TransformTag tag1 {:name "list-tag-1"}
                         :model/TransformTag tag2 {:name "list-tag-2"}]
            ;; Add tags to transforms
            (transform.model/update-transform-tags! (:id transform1) [(:id tag1)])
            (transform.model/update-transform-tags! (:id transform2) [(:id tag1) (:id tag2)])

            (testing "List endpoint returns all transforms with their tag_ids"
              (let [transforms (mt/user-http-request :lucky :get 200 "ee/transform")
                    t1 (some #(when (= (:id %) (:id transform1)) %) transforms)
                    t2 (some #(when (= (:id %) (:id transform2)) %) transforms)]
                (is (= [(:id tag1)] (:tag_ids t1)))
                (is (= [(:id tag1) (:id tag2)] (sort (:tag_ids t2))))))))))))

(deftest delete-tag-removes-associations-test
  (testing "Deleting a tag removes it from all transforms"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (mt/with-temp [:model/Transform transform {:name   "Transform for Delete Test"
                                                       :source {:type  "query"
                                                                :query {:database (mt/id)
                                                                        :type     "native"
                                                                        :native   {:query "SELECT 1"}}}
                                                       :target {:type "table"
                                                                :name "delete_test_table"}}
                           :model/TransformTag tag2 {:name "tag-to-keep"}]
            ;; Create tag1 via API since we're testing its deletion
              (let [tag1 (mt/user-http-request :lucky :post 200 "ee/transform-tag"
                                               {:name "tag-to-delete"})]
                (try
                ;; Add both tags to transform
                  (transform.model/update-transform-tags! (:id transform) [(:id tag1) (:id tag2)])

                ;; Verify tags are associated
                  (let [fetched (mt/user-http-request :lucky :get 200 (str "ee/transform/" (:id transform)))]
                    (is (= (set [(:id tag1) (:id tag2)]) (set (:tag_ids fetched)))))

                ;; Delete tag1
                  (mt/user-http-request :lucky :delete 204 (str "ee/transform-tag/" (:id tag1)))

                ;; Verify tag1 is removed but tag2 remains
                  (let [fetched (mt/user-http-request :lucky :get 200 (str "ee/transform/" (:id transform)))]
                    (is (= [(:id tag2)] (vec (:tag_ids fetched)))))
                  (finally
                    (t2/delete! :model/TransformTag :id (:id tag1))))))))))))

(deftest preserve-tag-order-test
  (testing "Tag order is preserved when adding/updating transform tags"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (mt/with-temp [:model/TransformTag tag1 {:name "order-tag-1"}
                           :model/TransformTag tag2 {:name "order-tag-2"}
                           :model/TransformTag tag3 {:name "order-tag-3"}]

              (let [schema (t2/select-one-fn :schema :model/Table :db_id (mt/id) :active true)]
                (testing "Creating transform with specific tag order preserves that order"
                  (let [transform-request (-> (merge (mt/with-temp-defaults :model/Transform)
                                                     {:tag_ids [(:id tag3) (:id tag1) (:id tag2)]})
                                              (assoc-in [:target :schema] schema))
                        transform (mt/user-http-request :lucky :post 200 "ee/transform"
                                                        transform-request)]
                    (try
                    ;; Should preserve the exact order: tag3, tag1, tag2
                      (is (= [(:id tag3) (:id tag1) (:id tag2)] (:tag_ids transform)))
                    ;; Verify order is preserved when fetching
                      (let [fetched (mt/user-http-request :lucky :get 200 (str "ee/transform/" (:id transform)))]
                        (is (= [(:id tag3) (:id tag1) (:id tag2)] (:tag_ids fetched))))
                    ;; Update with different order
                      (let [updated (mt/user-http-request :lucky :put 200 (str "ee/transform/" (:id transform))
                                                          {:tag_ids [(:id tag2) (:id tag3) (:id tag1)]})]
                      ;; Should now have the new order: tag2, tag3, tag1
                        (is (= [(:id tag2) (:id tag3) (:id tag1)] (:tag_ids updated))))
                    ;; Verify new order persists
                      (let [fetched-again (mt/user-http-request :lucky :get 200 (str "ee/transform/" (:id transform)))]
                        (is (= [(:id tag2) (:id tag3) (:id tag1)] (:tag_ids fetched-again))))
                      (finally
                        (t2/delete! :model/Transform :id (:id transform))))))
                (testing "Duplicate tag IDs are handled correctly"
                  (let [transform-request (-> (merge (mt/with-temp-defaults :model/Transform)
                                                     {:tag_ids [(:id tag1) (:id tag2) (:id tag1)]})
                                              (assoc-in [:target :schema] schema))
                        transform (mt/user-http-request :lucky :post 200 "ee/transform"
                                                        transform-request)]
                    (try
                    ;; Should only have each tag once, but preserve relative order
                      (is (= [(:id tag1) (:id tag2)] (:tag_ids transform)))
                      (finally
                        (t2/delete! :model/Transform :id (:id transform))))))))))))))

(deftest root-collection-items-include-transforms-test
  (testing "GET /api/collection/root/items"
    (testing "Includes transforms in root collection items"
      (mt/with-premium-features #{:transforms}
        (mt/with-temp [:model/Transform {transform-id :id}
                       {:name "Root Transform"
                        :description "A transform at root"}]
          (testing "Transform appears in unfiltered results"
            (let [items (->> (:data (mt/user-http-request :crowberto :get 200
                                                          "collection/root/items"
                                                          :namespace "transforms"))
                             (filter #(= "transform" (:model %))))]
              (is (= 1 (count items)))
              (is (= "transform" (:model (first items))))
              (is (= "Root Transform" (:name (first items))))))
          (testing "Transform appears when filtered by models=trans form"

            (let [items (:data (mt/user-http-request :crowberto :get 200
                                                     "collection/root/items"
                                                     :namespace "transforms"
                                                     :models "transform"))]
              (is (= 1 (count items)))
              (is (= transform-id (:id (first items))))))

          (testing "Transform NOT returned when filtering for other models only"
            (let [items (:data (mt/user-http-request :crowberto :get 200
                                                     "collection/root/items"
                                                     :namespace "transforms"
                                                     :models "card"))]
              (is (empty? items))))

          (testing "Non-admin users don't see transforms"
            (let [items (->> (:data (mt/user-http-request :rasta :get 200
                                                          "collection/root/items"
                                                          :namespace "transforms"))
                             (filter #(= "transform" (:model %))))]
              (is (empty? items)))))))))

(deftest transforms-appear-in-here-test
  (testing "GET /api/collection/:id/items"
    (testing "Transforms in a collection appear in its :here field"
      (mt/with-premium-features #{:transforms}
        (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent"
                                                          :namespace :transforms}
                       :model/Collection {child-id :id} {:name "Child"
                                                         :location (format "/%d/" parent-id)
                                                         :namespace :transforms}
                       :model/Transform _ {:name "Test Transform"
                                           :collection_id child-id}]
          ;; Check child collection shows transform in :here
          (let [child-coll (first (:data (mt/user-http-request :crowberto :get 200
                                                               (format "collection/%d/items" parent-id))))]
            (is (= ["transform"] (:here child-coll)))))))))

(deftest transforms-appear-in-below-test
  (testing "GET /api/collection/:id/items"
    (testing "Transforms in descendant collections appear in :below field"
      (mt/with-premium-features #{:transforms}
        (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent"
                                                          :namespace :transforms}
                       :model/Collection {child-id :id} {:name "Child"
                                                         :location (format "/%d/" parent-id)
                                                         :namespace :transforms}
                       :model/Collection {grandchild-id :id} {:name "Grandchild"
                                                              :location (format "/%d/%d/" parent-id child-id)
                                                              :namespace :transforms}
                       :model/Transform _ {:name "Nested Transform"
                                           :collection_id grandchild-id}]
          ;; Check child collection shows transform in :below
          (let [child-coll (first (:data (mt/user-http-request :crowberto :get 200
                                                               (format "collection/%d/items" parent-id))))]
            (is (= ["collection"] (:here child-coll)))
            (is (= ["transform"] (:below child-coll)))))))))

(deftest native-incremental-column-type-validated-on-create-test
  (testing "POST /api/ee/transform column type validation"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table ::extract-columns-from-query)
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (let [schema (get-test-schema)]
            (testing "Rejects unsupported checkpoint column type (text)"
              (let [response (mt/user-http-request :crowberto :post 400 "ee/transform"
                                                   {:name "Invalid Incremental Transform"
                                                    :source {:type "query"
                                                             :query (lib/native-query (mt/metadata-provider)
                                                                                      "SELECT id, name, category, price FROM transforms_products")
                                                             :source-incremental-strategy {:type "checkpoint"
                                                                                           :checkpoint-filter "name"}}
                                                    :target {:type "table-incremental"
                                                             :schema schema
                                                             :name "invalid_incremental"
                                                             :target-incremental-strategy {:type "append"}}})]
                (is (string? response))
                (is (re-find #"Only numeric and temporal" response))))))))))

(deftest native-incremental-column-type-validated-on-update-test
  (testing "PUT /api/ee/transform column type validation"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table ::extract-columns-from-query)
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (let [schema (get-test-schema)]
            (with-transform-cleanup! [table-name "update_incremental_test"]
              (let [;; Create a non-incremental transform first
                    created (mt/user-http-request :crowberto :post 200 "ee/transform"
                                                  {:name "Test Transform"
                                                   :source {:type "query"
                                                            :query (lib/native-query (mt/metadata-provider)
                                                                                     "SELECT id, name, category FROM transforms_products")}
                                                   :target {:type "table"
                                                            :schema schema
                                                            :name table-name}})]
                (testing "Rejects update to unsupported checkpoint column type (text)"
                  (let [response (mt/user-http-request :crowberto :put 400
                                                       (format "ee/transform/%d" (:id created))
                                                       {:source {:type "query"
                                                                 :query (lib/native-query (mt/metadata-provider)
                                                                                          "SELECT id, name, category FROM transforms_products")
                                                                 :source-incremental-strategy {:type "checkpoint"
                                                                                               :checkpoint-filter "category"}}
                                                        :target {:type "table-incremental"
                                                                 :schema schema
                                                                 :name table-name
                                                                 :target-incremental-strategy {:type "append"}}})]
                    (is (string? response))
                    (is (re-find #"Only numeric and temporal" response))))))))))))

(deftest mbql-incremental-column-type-validated-on-create-test
  (testing "MBQL query with checkpoint-filter-unique-key - checkpoint column type validation"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table ::extract-columns-from-query)
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (let [schema (get-test-schema)]
            (testing "Rejects unsupported checkpoint column type (text)"
              (let [query (mt/mbql-query transforms_products)
                    response (mt/user-http-request :crowberto :post 400 "ee/transform"
                                                   {:name "Invalid MBQL Incremental"
                                                    :source {:type "query"
                                                             :query query
                                                             :source-incremental-strategy {:type "checkpoint"
                                                                                           :checkpoint-filter-unique-key "column-unique-key-v1$name"}}
                                                    :target {:type "table-incremental"
                                                             :schema schema
                                                             :name "invalid_mbql_incremental"
                                                             :target-incremental-strategy {:type "append"}}})]
                (is (string? response))
                (is (re-find #"not supported" response))))))))))

(deftest native-incremental-column-validation-when-not-extractable-test
  (testing "Native query checkpoint column validation with text input fallback"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table ::extract-columns-from-query)
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (let [schema (get-test-schema)]
            (testing "Accepts any column if they were not extractable"
              (with-transform-cleanup! [table-name "fallback_test_unextracted"]
                (with-redefs [metabase-enterprise.transforms.api/extract-all-columns-from-query
                              ;; simulate lack of driver support for extraction
                              (fn [_driver _database-id _query] nil)]
                  (let [response (mt/user-http-request :crowberto :post 200 "ee/transform"
                                                       {:name "Unextracted Column - Text Input Fallback"
                                                        :source {:type "query"
                                                                 :query (lib/native-query (mt/metadata-provider)
                                                                                          "SELECT id, name, created_at FROM transforms_products")
                                                                 :source-incremental-strategy {:type "checkpoint"
                                                                                               ;; created_at is in the query but not in our stubbed extraction
                                                                                               :checkpoint-filter "created_at"}}
                                                        :target {:type "table-incremental"
                                                                 :schema schema
                                                                 :name table-name
                                                                 :target-incremental-strategy {:type "append"}}})]
                    (is (some? (:id response))
                        "Should accept column not in extracted metadata, allowing text input fallback")))))))))))

;;; ------------------------------------------------------------
;;; Run List Sorting
;;; ------------------------------------------------------------

(deftest get-runs-sort-by-transform-name-test
  (testing "GET /api/ee/transform/run - sort by transform-name"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform    {transform-b-id :id} {:name "Transform B"}
                     :model/Transform    {transform-a-id :id} {:name "Transform A"}
                     :model/TransformRun {run-b-id :id}       {:transform_id transform-b-id}
                     :model/TransformRun {run-a-id :id}       {:transform_id transform-a-id}]
        (doseq [sort-direction [:asc :desc]]
          (testing (str sort-direction)
            (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                 :sort_column "transform-name"
                                                 :sort_direction sort-direction
                                                 :transform_ids [transform-a-id transform-b-id])]
              (is (= (cond-> [run-a-id run-b-id]
                       (= sort-direction :desc) reverse)
                     (->> response :data (map :id)))))))))))

(deftest get-runs-sort-stable-test
  (testing "GET /api/ee/transform/run - sorting is stable when values are equal (tiebreaker by :id)"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform    {transform-1-id :id} {:name "Same Name"}
                     :model/Transform    {transform-2-id :id} {:name "Same Name"}
                     :model/TransformRun {run-1-id :id}       {:transform_id transform-1-id}
                     :model/TransformRun {run-2-id :id}       {:transform_id transform-2-id}]
        (doseq [sort-direction [:asc :desc]]
          (testing (str sort-direction)
            (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                 :sort_column "transform-name"
                                                 :sort_direction sort-direction
                                                 :transform_ids [transform-1-id transform-2-id])]
              (is (= (cond-> [run-1-id run-2-id]
                       (= sort-direction :desc) reverse)
                     (->> response :data (map :id)))))))))))

(deftest get-runs-sort-by-start-time-test
  (testing "GET /api/ee/transform/run - sort by start-time"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform    {transform-id :id} {}
                     :model/TransformRun {earlier-run-id :id} {:transform_id transform-id
                                                               :start_time   (parse-instant "2025-01-01T00:00:00")}
                     :model/TransformRun {later-run-id :id}   {:transform_id transform-id
                                                               :start_time   (parse-instant "2025-01-02T00:00:00")}]
        (doseq [sort-direction [:asc :desc]]
          (testing (str sort-direction)
            (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                 :sort_column "start-time"
                                                 :sort_direction sort-direction
                                                 :transform_ids [transform-id])]
              (is (= (cond-> [earlier-run-id later-run-id]
                       (= sort-direction :desc) reverse)
                     (->> response :data (map :id)))))))))))

(deftest get-runs-sort-by-end-time-test
  (testing "GET /api/ee/transform/run - sort by end-time"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform    {transform-id :id} {}
                     :model/TransformRun {earlier-run-id :id} {:transform_id transform-id
                                                               :end_time     (parse-instant "2025-01-01T00:00:00")}
                     :model/TransformRun {later-run-id :id}   {:transform_id transform-id
                                                               :end_time     (parse-instant "2025-01-02T00:00:00")}]
        (doseq [sort-direction [:asc :desc]]
          (testing (str sort-direction)
            (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                 :sort_column "end-time"
                                                 :sort_direction sort-direction
                                                 :transform_ids [transform-id])]
              (is (= (cond-> [earlier-run-id later-run-id]
                       (= sort-direction :desc) reverse)
                     (->> response :data (map :id)))))))))))

(deftest get-runs-sort-by-run-method-test
  (testing "GET /api/ee/transform/run - sort by run-method (translated names)"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform    {transform-id :id}   {}
                     ;; "Manual" < "Schedule"
                     :model/TransformRun {manual-run-id :id}   {:transform_id transform-id :run_method "manual"}
                     :model/TransformRun {schedule-run-id :id} {:transform_id transform-id :run_method "cron"}]
        (doseq [sort-direction [:asc :desc]]
          (testing (str sort-direction)
            (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                 :sort_column "run-method"
                                                 :sort_direction sort-direction
                                                 :transform_ids [transform-id])]
              (is (= (cond-> [manual-run-id schedule-run-id]
                       (= sort-direction :desc) reverse)
                     (->> response :data (map :id)))))))))))

(deftest get-runs-sort-by-status-test
  (testing "GET /api/ee/transform/run - sort by status (translated names)"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Transform    {transform-id :id}        {}
                     ;; Sorted by translated name: "Canceled" < "Canceling" < "Failed" < "In progress" < "Success" < "Timeout"
                     :model/TransformRun {canceled-run-id :id}     {:transform_id transform-id :status "canceled"}
                     :model/TransformRun {canceling-run-id :id}    {:transform_id transform-id :status "canceling"}
                     :model/TransformRun {failed-run-id :id}       {:transform_id transform-id :status "failed"}
                     :model/TransformRun {in-progress-run-id :id}  {:transform_id transform-id :status "started"
                                                                    :is_active    true}
                     :model/TransformRun {success-run-id :id}      {:transform_id transform-id :status "succeeded"}
                     :model/TransformRun {timeout-run-id :id}      {:transform_id transform-id :status "timeout"}]
        (doseq [sort-direction [:asc :desc]]
          (testing (str sort-direction)
            (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                 :sort_column "status"
                                                 :sort_direction sort-direction
                                                 :transform_ids [transform-id])]
              (is (= (cond-> [canceled-run-id canceling-run-id failed-run-id
                              in-progress-run-id success-run-id timeout-run-id]
                       (= sort-direction :desc) reverse)
                     (->> response :data (map :id)))))))))))

(deftest get-runs-sort-by-transform-tags-test
  (testing "GET /api/ee/transform/run - sort by transform-tags (first tag name)"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/TransformTag          {tag-a-id :id}       {:name "Tag A"}
                     :model/TransformTag          {tag-b-id :id}       {:name "Tag B"}
                     :model/TransformTag          {tag-ignored-id :id} {:name "Tag Ignored"}
                     ;; Transform with tags "Tag A" (pos 0) and "Tag Ignored" (pos 1) — sorted by first tag "Tag A"
                     :model/Transform             {transform-a-id :id} {:name "Transform A"}
                     :model/TransformTransformTag _                    {:transform_id transform-a-id :tag_id tag-a-id       :position 0}
                     :model/TransformTransformTag _                    {:transform_id transform-a-id :tag_id tag-ignored-id :position 1}
                     ;; Transform with tag "Tag B" (pos 0) — sorted by first tag "Tag B"
                     :model/Transform             {transform-b-id :id} {:name "Transform B"}
                     :model/TransformTransformTag _                    {:transform_id transform-b-id :tag_id tag-b-id :position 0}
                     :model/TransformRun          {run-a-id :id}       {:transform_id transform-a-id}
                     :model/TransformRun          {run-b-id :id}       {:transform_id transform-b-id}]
        (doseq [sort-direction [:asc :desc]]
          (testing (str sort-direction)
            (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                 :sort_column "transform-tags"
                                                 :sort_direction sort-direction
                                                 :transform_ids [transform-a-id transform-b-id])]
              (is (= (cond-> [run-a-id run-b-id]
                       (= sort-direction :desc) reverse)
                     (->> response :data (map :id)))))))))))

(deftest get-runs-sort-by-built-in-transform-tags-test
  (testing "GET /api/ee/transform/run - sort by built-in transform-tags (translated names)"
    (mt/with-premium-features #{:transforms}
      ;; Translated names alphabetically: "daily" < "hourly" < "monthly" < "weekly"
      (mt/with-temp [:model/TransformTag {tag-daily-id :id}
                     {:name "daily" :built_in_type "daily"}

                     :model/TransformTag {tag-hourly-id :id}
                     {:name "hourly" :built_in_type "hourly"}

                     :model/TransformTag {tag-monthly-id :id}
                     {:name "monthly" :built_in_type "monthly"}

                     :model/TransformTag {tag-weekly-id :id}
                     {:name "weekly" :built_in_type "weekly"}

                     :model/Transform {transform-daily-id :id} {}
                     :model/TransformTransformTag _ {:transform_id transform-daily-id
                                                     :tag_id       tag-daily-id
                                                     :position     0}

                     :model/Transform {transform-hourly-id :id} {}
                     :model/TransformTransformTag _ {:transform_id transform-hourly-id
                                                     :tag_id       tag-hourly-id
                                                     :position     0}

                     :model/Transform {transform-monthly-id :id} {}
                     :model/TransformTransformTag _ {:transform_id transform-monthly-id
                                                     :tag_id       tag-monthly-id
                                                     :position     0}

                     :model/Transform {transform-weekly-id :id} {}
                     :model/TransformTransformTag _ {:transform_id transform-weekly-id
                                                     :tag_id       tag-weekly-id
                                                     :position     0}

                     :model/TransformRun {daily-run-id :id}
                     {:transform_id transform-daily-id}

                     :model/TransformRun {hourly-run-id :id}
                     {:transform_id transform-hourly-id}

                     :model/TransformRun {monthly-run-id :id}
                     {:transform_id transform-monthly-id}

                     :model/TransformRun {weekly-run-id :id}
                     {:transform_id transform-weekly-id}]
        (doseq [sort-direction [:asc :desc]]
          (testing (str sort-direction)
            (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                                 :sort_column "transform-tags"
                                                 :sort_direction sort-direction
                                                 :transform_ids [transform-daily-id transform-hourly-id
                                                                 transform-monthly-id transform-weekly-id])]
              (is (= (cond-> [daily-run-id hourly-run-id monthly-run-id weekly-run-id]
                       (= sort-direction :desc) reverse)
                     (->> response :data (map :id)))))))))))

(deftest get-runs-hydrate-collection-test
  (testing "GET /api/ee/transform/run - hydrates collection on transform"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Collection {collection-id :id} {:name "Subfolder" :namespace :transforms}
                     :model/Transform {transform-in-collection-id :id} {:collection_id collection-id}
                     :model/Transform {transform-in-root-id :id} {:collection_id nil}
                     :model/TransformRun {run-in-collection-id :id} {:transform_id transform-in-collection-id}
                     :model/TransformRun {run-in-root-id :id} {:transform_id transform-in-root-id}]
        (let [response (mt/user-http-request :crowberto :get 200 "ee/transform/run"
                                             :transform_ids [transform-in-collection-id
                                                             transform-in-root-id])
              runs-by-id (m/index-by :id (:data response))]
          (testing "transform in explicit collection has that collection hydrated"
            (is (= "Subfolder"
                   (get-in (runs-by-id run-in-collection-id) [:transform :collection :name]))))
          (testing "transform in root collection has root collection hydrated"
            (is (= "Transforms"
                   (get-in (runs-by-id run-in-root-id) [:transform :collection :name])))))))))
