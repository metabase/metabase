(ns metabase-enterprise.index-manager.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- temp-transform-spec []
  {:name   (mt/random-name)
   :source {:type "python" :source-database (mt/id) :body "import pandas as pd\n"}
   :target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}})

(def ^:private btree {:kind "btree" :name "by_cat" :columns [{:name "category"}]})

(deftest crud-happy-path-test
  (mt/with-premium-features #{:transforms-python}
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (testing "POST creates a pending request"
        (let [created (mt/user-http-request :crowberto :post 200 "ee/index-manager"
                                            {:transform_id transform-id :structured btree})]
          (is (= "pending" (:status created)))
          (is (= transform-id (:transform_id created)))
          (is (= "by_cat" (:index_name created)))
          (testing "GET lists it for the transform"
            (let [{:keys [data]} (mt/user-http-request :crowberto :get 200
                                                       (str "ee/index-manager?transform-id=" transform-id))]
              (is (= [(:id created)] (map :id data)))))
          (testing "PUT replaces the structured definition"
            (let [updated (mt/user-http-request :crowberto :put 200 (str "ee/index-manager/" (:id created))
                                                {:structured (assoc btree :columns [{:name "price"}])})]
              (is (= "price" (-> updated :structured :columns first :name)))))
          (testing "DELETE removes it"
            (mt/user-http-request :crowberto :delete 204 (str "ee/index-manager/" (:id created)))
            (let [{:keys [data]} (mt/user-http-request :crowberto :get 200
                                                       (str "ee/index-manager?transform-id=" transform-id))]
              (is (empty? data)))))))))

(deftest superuser-only-test
  (testing "non-superusers cannot manage index requests"
    (mt/with-premium-features #{:transforms-python}
      (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 "ee/index-manager"
                                     {:transform_id transform-id :structured btree})))))))

(deftest premium-feature-required-test
  (testing "the endpoints require the transforms premium feature"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
        (mt/user-http-request :crowberto :post 402 "ee/index-manager"
                              {:transform_id transform-id :structured btree})))))
