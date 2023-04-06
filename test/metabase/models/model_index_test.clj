(ns metabase.models.model-index-test
  (:require [clojure.core.async :as a]
            [clojure.test :refer :all]
            [clojurewerkz.quartzite.conversion :as qc]
            [metabase.models.card :refer [Card]]
            [metabase.models.model-index :refer [ModelIndex ModelIndexValue]]
            [metabase.models.model-index :as model-index]
            [metabase.query-processor :as qp]
            [metabase.query-processor.async :as qp.async]
            [metabase.task :as task]
            [metabase.task.index-values :as task.index-values]
            [metabase.test :as mt]
            [toucan2.core :as t2]))

(defn- result-metadata-for-query [query]
  (first
   (a/alts!!
    [(qp.async/result-metadata-for-query-async query)
     (a/timeout 2000)])))

(deftest quick-run-through
  (mt/dataset sample-dataset
    (let [query  (mt/mbql-query products)
          pk_ref (mt/$ids $products.id)]
      (mt/with-temp* [Card [model {:dataset         true
                                   :name            "Simple MBQL model"
                                   :dataset_query   query
                                   :result_metadata (result-metadata-for-query query)}]]
        ;; there's a bug in toucan2 and i don't know how to get the newly inserted item
        (mt/user-http-request :rasta :post 200 "/model-index"
                              {:model_id  (:id model)
                               :pk_ref    pk_ref
                               :value_ref (mt/$ids $products.title)})
        (let [model-index (t2/select-one ModelIndex :model_id (:id model))
              by-key      (fn [k xs]
                            (some (fn [x] (when (= (:key x) k) x)) xs))]
          (testing "There's a task to sync the values"
            (let [index-trigger (->> (task/scheduler-info)
                                     :jobs
                                     (by-key "metabase.task.IndexValues.job")
                                     :triggers
                                     (by-key (format "metabase.task.IndexValues.trigger.%d"
                                                     (:id model-index))))]
              (is (some? index-trigger) "Index trigger not found")
              (is (= (:schedule index-trigger) (:schedule model-index)))
              (is (= {"model-index-id" (:id model-index)}
                     (qc/from-job-data (:data index-trigger))))))
          ;; for now initial is done on thread on post.
          #_(testing "There are no values for that model index yet"
              (is (zero? (count (t2/select ModelIndexValue :model_index_id (:id model-index))))))
          (testing "We can invoke the task ourself manually"
            (model-index/add-values! model-index)
            (is (= 200 (count (t2/select ModelIndexValue :model_index_id (:id model-index)))))
            (is (= (into #{} cat (mt/rows (qp/process-query
                                           (mt/mbql-query products {:fields [$title]}))))
                   (t2/select-fn-set :name ModelIndexValue :model_index_id (:id model-index)))))
          (task.index-values/remove-indexing-job model-index)
          (testing "Search"
            (let [search-results (->> (mt/user-http-request :rasta :get 200 "search"
                                                            :q "Synergistic"
                                                            :models "indexed-entity"
                                                            :archived false)
                                      :data
                                      (filter (comp #{(:id model)} :model_id)))
                  f              (fn [sr] (-> (select-keys sr [:pk_ref :name :id :model_name])
                                              (update :pk_ref model-index/normalize-field-ref)))]
              (is (partial= {"Synergistic Wool Coat"   {:pk_ref     pk_ref
                                                        :name       "Synergistic Wool Coat"
                                                        :model_name "Simple MBQL model"}
                             "Synergistic Steel Chair" {:pk_ref     pk_ref
                                                        :name       "Synergistic Steel Chair"
                                                        :model_name "Simple MBQL model"}}
                            (into {} (map (juxt :name f)) search-results)))
              (is (every? int? (map :id search-results))))))))))
