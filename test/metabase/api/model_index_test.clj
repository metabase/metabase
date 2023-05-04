(ns metabase.api.model-index-test
  (:require [clojure.core.async :as a]
            [clojure.test :refer :all]
            [metabase.models.card :refer [Card]]
            [metabase.query-processor.async :as qp.async]
            [metabase.task :as task]
            [metabase.test :as mt]
            [toucan2.util :as u]))

(defn- result-metadata-for-query [query]
  (first
   (a/alts!!
    [(qp.async/result-metadata-for-query-async query)
     (a/timeout 2000)])))

(deftest full-lifecycle-test
  (mt/dataset sample-dataset
    (let [query     (mt/mbql-query products)
          pk_ref    (mt/$ids $products.id)
          value_ref (mt/$ids $products.title)]
      (mt/with-temp* [Card [model {:dataset         true
                                   :name            "model index test"
                                   :dataset_query   query
                                   :result_metadata (result-metadata-for-query query)}]]
        (let [model-index (mt/user-http-request :rasta :post 200 "/model-index"
                                                {:model_id  (:id model)
                                                 :pk_ref    pk_ref
                                                 :value_ref value_ref})]
          (testing "POST"
            (is (=? {:generation 1
                     :state      "indexed"
                     :model_id   (:id model)
                     :error      nil}
                    model-index)))
          (testing "GET by model id"
            (is (=? [{:generation 1
                      :state      "indexed"
                      :model_id   (:id model)
                      :error      nil}]
                    (mt/user-http-request :rasta :get 200 "model-index"
                                          :model_id (:id model)))))
          (testing "GET by model-index id"
            (is (=? {:generation 1
                     :state      "indexed"
                     :model_id   (:id model)
                     :error      nil}
                    (mt/user-http-request :rasta :get 200
                                          (str "/model-index/" (:id model-index))))))
          (testing "DELETE"
            (let [by-key (fn [k xs]
                           (some (fn [x] (when (= (:key x) k) x)) xs))]
              (testing "There's a task to sync the values"
                (let [index-trigger! #(->> (task/scheduler-info)
                                           :jobs
                                           (by-key "metabase.task.IndexValues.job")
                                           :triggers
                                           (by-key (format "metabase.task.IndexValues.trigger.%d"
                                                           (:id model-index))))]
                  (is (some? (index-trigger!)) "Index trigger not found")
                  (mt/user-http-request :rasta :delete 200 (str "model-index/" (:id model-index)))
                  (is (nil? (index-trigger!)) "Index trigger not cleaned up"))))))))))

(deftest create-tests
  (testing "Ensures that the pk ref is a primary key"
    (mt/dataset sample-dataset
      (let [query (mt/mbql-query products)]
        (mt/with-temp* [Card [model {:dataset         true
                                     :name            "model index test"
                                     :dataset_query   query
                                     :result_metadata (result-metadata-for-query query)}]]
          (let [by-name (fn [n] (or (some (fn [f] (when (= n (-> f :name u/lower-case-en))
                                                    (:field_ref f)))
                                          (:result_metadata model))
                                    (throw (ex-info (str "Didn't find field: " n)
                                                    {:fields (map :name (:result_metadata model))
                                                     :field  n}))))]
            (doseq [bad-pk-ref [(by-name "title") (by-name "created_at")]]
              (let [response (mt/user-http-request :rasta :post 400 "/model-index"
                                                   {:model_id  (:id model)
                                                    :pk_ref    bad-pk-ref ;; invalid pk
                                                    :value_ref (by-name "title")})]
                (is (=? {:cause "Field is not of type :type/PK"
                         :data  {:expected-type "type/PK"}}
                        response))))
            (doseq [bad-value-ref [(by-name "id") (by-name "price") (by-name "created_at")]]
              (let [response (mt/user-http-request :rasta :post 400 "/model-index"
                                                   {:model_id  (:id model)
                                                    :pk_ref    (by-name "id")
                                                    :value_ref bad-value-ref})]
                (is (=? {:cause "Field is not of type :type/Text"
                         :data  {:expected-type "type/Text"}}
                        response))))
            (let [not-in-query (mt/$ids $people.email)]
              (let [response (mt/user-http-request :rasta :post 400 "/model-index"
                                                   {:model_id  (:id model)
                                                    :pk_ref    (by-name "id")
                                                    :value_ref not-in-query})]
                (is (=? {:cause #"Could not identify field by ref.*"}
                        response))))))))))
