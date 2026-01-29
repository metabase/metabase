(ns ^:mb/driver-tests metabase-enterprise.transforms.api-test
  "EE-only tests for /api/transform feature gating."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [metabase.transforms.test-util :refer [get-test-schema
                                          with-transform-cleanup!]]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- query-transform-payload
  [table-name]
  {:name   "Test Transform"
   :source {:type  "query"
            :query (lib/native-query (mt/metadata-provider) "SELECT 1")}
   :target {:type   "table"
            :schema (get-test-schema)
            :name   table-name}})

(defn- python-transform-map
  [table-name]
  {:name   "Python Transform"
   :source {:type            "python"
            :body            "print('hello world')"
            :source-tables   {}
            :source-database (mt/id)}
   :target {:type     "table"
            :schema   (get-test-schema)
            :name     table-name
            :database (mt/id)}})

(defn- search-transform-ids
  [search-term]
  (into #{}
        (comp (filter #(= "transform" (name (:model %))))
              (map :id))
        (search.tu/search-results search-term)))

(defn- search-api-transform-ids
  [user search-term]
  (let [response (mt/user-http-request user :get 200 "search" :q search-term :models "transform")]
    (set (map :id (:data response)))))

(deftest create-query-transform-requires-feature-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{}
      (mt/dataset transforms-dataset/transforms-test
        (let [table-name (str "test_transform_" (u/generate-nano-id))
              response   (mt/user-http-request :crowberto :post 402 "transform"
                                               (query-transform-payload table-name))]
          (is (= "Premium features required for this transform type are not enabled." response)))))))

(deftest update-query-transform-requires-feature-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-temp [:model/Transform {transform-id :id} {}]
          (let [response (mt/user-http-request :crowberto :put 402
                                               (format "transform/%d" transform-id)
                                               {:name "Updated Transform"})]
            (is (= "Premium features required for this transform type are not enabled." response))))))))

(deftest run-query-transform-requires-feature-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-temp [:model/Transform {transform-id :id} {}]
          (let [response (mt/user-http-request :crowberto :post 402
                                               (format "transform/%d/run" transform-id))]
            (is (= "Premium features required for this transform type are not enabled." response))))))))

(deftest list-transforms-404-without-feature-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :get 404 "transform"))))

(deftest get-transform-404-without-feature-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-temp [:model/Transform {transform-id :id} {}]
          (mt/user-http-request :crowberto :get 404 (format "transform/%d" transform-id)))))))

(deftest list-transforms-excludes-python-without-python-feature-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-temp [:model/Transform {query-id :id} {}
                       :model/Transform {python-id :id} (python-transform-map (str "python_transform_" (u/generate-nano-id)))]
          (let [response (mt/user-http-request :crowberto :get 200 "transform")
                ids      (set (map :id response))]
            (is (contains? ids query-id))
            (is (not (contains? ids python-id)))))))))

(deftest get-python-transform-404-without-python-feature-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-temp [:model/Transform {python-id :id} (python-transform-map (str "python_transform_" (u/generate-nano-id)))]
          (mt/user-http-request :crowberto :get 404 (format "transform/%d" python-id)))))))

(deftest get-python-transform-200-with-python-feature-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms :transforms-python}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-temp [:model/Transform {python-id :id} (python-transform-map (str "python_transform_" (u/generate-nano-id)))]
          (let [response (mt/user-http-request :crowberto :get 200 (format "transform/%d" python-id))]
            (is (= "python" (:source_type response)))))))))

(deftest create-transform-with-routing-fails-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms :database-routing}
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (with-transform-cleanup! [table-name "gadget_products"]
              (mt/with-temp [:model/Database _destination {:engine driver/*driver*
                                                           :router_database_id (mt/id)
                                                           :details {:destination_database true}}
                             :model/DatabaseRouter _ {:database_id (mt/id)
                                                      :user_attribute "db_name"}]
                (is (= "Transforms are not supported on databases with DB routing enabled."
                       (mt/user-http-request :crowberto :post 400 "transform"
                                             (query-transform-payload table-name))))))))))))

(deftest update-transform-with-routing-fails-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms :database-routing}
      (mt/dataset transforms-dataset/transforms-test
        (with-transform-cleanup! [table-name "gadget_products"]
          (mt/with-temp [:model/Database _destination {:engine driver/*driver*
                                                       :router_database_id (mt/id)
                                                       :details {:destination_database true}}
                         :model/DatabaseRouter _ {:database_id (mt/id)
                                                  :user_attribute "db_name"}
                         :model/Transform transform (query-transform-payload table-name)]
            (is (= "Transforms are not supported on databases with DB routing enabled."
                   (mt/user-http-request :crowberto :put 400 (format "transform/%s" (:id transform))
                                         (assoc transform :name "Gadget Products 2"))))))))))

(deftest search-filters-transform-source-types-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/dataset transforms-dataset/transforms-test
      (let [search-term (str "transform-search-" (u/generate-nano-id))
            query-name  (str search-term "-query")
            python-name (str search-term "-python")]
        (mt/with-temp [:model/Transform {query-id :id} (assoc (query-transform-payload (str "target_" (u/generate-nano-id)))
                                                              :name query-name)
                       :model/Transform {python-id :id} (assoc (python-transform-map (str "target_" (u/generate-nano-id)))
                                                               :name python-name)]
          (search.tu/with-new-search-and-legacy-search
            (testing "no transforms feature"
              (mt/with-premium-features #{}
                (is (empty? (search-transform-ids search-term)))))
            (testing "transforms only"
              (mt/with-premium-features #{:transforms}
                (is (= #{query-id} (search-transform-ids search-term)))))
            (testing "transforms and transforms-python"
              (mt/with-premium-features #{:transforms :transforms-python}
                (is (= #{query-id python-id} (search-transform-ids search-term)))))))))))

(deftest search-filtering-updates-with-feature-flips-without-reindex-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/dataset transforms-dataset/transforms-test
      (let [search-term (str "transform-search-" (u/generate-nano-id))
            query-name  (str search-term "-query")
            python-name (str search-term "-python")]
        (mt/with-temp [:model/Transform {query-id :id} (assoc (query-transform-payload (str "target_" (u/generate-nano-id)))
                                                              :name query-name)
                       :model/Transform {python-id :id} (assoc (python-transform-map (str "target_" (u/generate-nano-id)))
                                                               :name python-name)]
          (search.tu/with-new-search-and-legacy-search
            (mt/with-premium-features #{:transforms :transforms-python}
              (is (= #{query-id python-id} (search-transform-ids search-term))))
            (mt/with-premium-features #{:transforms}
              (is (= #{query-id} (search-transform-ids search-term))))
            (mt/with-premium-features #{}
              (is (empty? (search-transform-ids search-term))))))))))

(deftest search-api-transform-models-empty-without-feature-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{}
      (mt/dataset transforms-dataset/transforms-test
        (let [search-term (str "transform-search-" (u/generate-nano-id))
              query-name  (str search-term "-query")]
          (mt/with-temp [:model/Transform {query-id :id} (assoc (query-transform-payload (str "target_" (u/generate-nano-id)))
                                                                :name query-name)]
            (search.tu/with-new-search-and-legacy-search
              (let [ids (search-api-transform-ids :crowberto search-term)]
                (is (empty? ids))
                (is (not (contains? ids query-id)))))))))))
