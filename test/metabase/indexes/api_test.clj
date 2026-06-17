(ns metabase.indexes.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms.query-test-util :as query-test-util]))

(set! *warn-on-reflection* true)

(defn- temp-transform-spec
  "A real query transform over a test-data table. Query transforms are available without a premium feature on
  non-hosted instances, so a superuser passes the transform read/write checks the index endpoints rely on."
  []
  {:name   (mt/random-name)
   :source {:type "query" :query (query-test-util/make-query :source-table "venues")}
   :target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}})

(def ^:private btree {:kind "btree" :name "by_cat" :columns [{:name "name"}]})

(deftest crud-happy-path-test
  (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
    (testing "POST creates a pending index"
      (let [created (mt/user-http-request :crowberto :post 200 "indexes"
                                          {:transform_id transform-id :structured btree})]
        (is (= "pending" (:status created)))
        (is (= transform-id (:transform_id created)))
        (is (= "by_cat" (:index_name created)))
        (testing "GET lists it for the transform"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200
                                                     (str "indexes?transform-id=" transform-id))]
            (is (= [(:id created)] (map :id data)))))
        (testing "the listed index carries no mirrored table_id"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200
                                                     (str "indexes?transform-id=" transform-id))]
            (is (not (contains? (first data) :table_id)))))
        (testing "GET /:id fetches one (status poll)"
          (is (= "by_cat" (:index_name (mt/user-http-request :crowberto :get 200
                                                             (str "indexes/" (:id created)))))))
        (testing "PUT replaces the structured definition"
          (let [updated (mt/user-http-request :crowberto :put 200 (str "indexes/" (:id created))
                                              {:structured (assoc btree :columns [{:name "price"}])})]
            (is (= "price" (-> updated :structured :columns first :name)))))
        (testing "DELETE removes it"
          (mt/user-http-request :crowberto :delete 204 (str "indexes/" (:id created)))
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200
                                                     (str "indexes?transform-id=" transform-id))]
            (is (empty? data))))))))

(deftest requires-transform-write-test
  (testing "a user without write access to the transform cannot manage its indexes"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "indexes"
                                   {:transform_id transform-id :structured btree}))))))

(deftest list-requires-transform-id-test
  (testing "GET requires transform-id"
    (is (re-find #"transform-id"
                 (str (mt/user-http-request :crowberto :get 400 "indexes"))))))

(deftest unknown-transform-404s-test
  (testing "creating an index for a non-existent transform 404s"
    (mt/user-http-request :crowberto :post 404 "indexes"
                          {:transform_id Integer/MAX_VALUE :structured btree})))

(deftest duplicate-index-name-rejected-test
  (testing "you can't create two indexes with the same name on one transform"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (mt/user-http-request :crowberto :post 200 "indexes"
                            {:transform_id transform-id :structured btree})
      (is (re-find #"already exists"
                   (mt/user-http-request :crowberto :post 400 "indexes"
                                         {:transform_id transform-id :structured btree}))))))

(deftest inline-kind-index-name-test
  (testing "an inline kind with no :name gets its index_name from :kind"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (let [created (mt/user-http-request :crowberto :post 200 "indexes"
                                          {:transform_id transform-id
                                           :structured {:kind "sortkey" :style "compound" :columns [{:name "name"}]}})]
        (is (= "sortkey" (:index_name created)))))))
