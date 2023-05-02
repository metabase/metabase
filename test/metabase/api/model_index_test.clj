(ns metabase.api.model-index-test
  (:require [clojure.core.async :as a]
            [clojure.set :as set]
            [clojure.test :refer :all]
            [clojurewerkz.quartzite.conversion :as qc]
            [clojurewerkz.quartzite.scheduler :as qs]
            [metabase.models.card :refer [Card]]
            [metabase.models.model-index :as model-index :refer [ModelIndex ModelIndexValue]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.async :as qp.async]
            [metabase.task :as task]
            [metabase.task.index-values :as task.index-values]
            [metabase.task.sync-databases :as task.sync-databases]
            [metabase.test :as mt]
            [metabase.test.util :as tu]
            [toucan2.core :as t2]))

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
                    (mt/user-http-request :rasta :get 200 (str "/model-index/" (:id model))))))
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
