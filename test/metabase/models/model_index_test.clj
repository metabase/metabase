(ns metabase.models.model-index-test
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
            [metabase.test :as mt]
            [metabase.test.util :as tu]
            [toucan2.core :as t2]))

(defn- result-metadata-for-query [query]
  (first
   (a/alts!!
    [(qp.async/result-metadata-for-query-async query)
     (a/timeout 2000)])))

(defmacro with-scheduler-setup [& body]
  `(let [scheduler# (#'tu/in-memory-scheduler)]
     ;; need cross thread rebinding from with-redefs not a binding
     (with-redefs [task/scheduler (constantly scheduler#)]
       (qs/standby scheduler#)
       (#'task.index-values/job-init!)
       (qs/start scheduler#)
       (try
         ~@body
         (finally (qs/shutdown scheduler#))))))

(deftest quick-run-through
  (with-scheduler-setup
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
                                                   :value_ref value_ref})
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
                     (t2/select-fn-set :name ModelIndexValue :model_index_id (:id model-index)))))))))))

(defn- test-index
  [{:keys [query pk-ref value-ref quantity subset scenario]}]
  (testing scenario
    (mt/with-temp* [Card [model {:dataset         true
                                 :name            "model index test"
                                 :dataset_query   query
                                 :result_metadata (result-metadata-for-query query)}]]
      (let [model-index (mt/user-http-request :rasta :post 200 "/model-index"
                                              {:model_id  (:id model)
                                               :pk_ref    pk-ref
                                               :value_ref value-ref})]
        ;; post most likely creates this, but duplicate to be sure
        (model-index/add-values! model-index)
        (is (= "indexed"
               (t2/select-one-fn :state ModelIndex :id (:id model-index))))
        (is (= quantity
               (t2/count ModelIndexValue :model_index_id (:id model-index))))
        (is (set/subset? subset (t2/select-fn-set :name ModelIndexValue
                                                  :model_index_id (:id model-index))))))))

(deftest model-index-test
  (mt/dataset sample-dataset
    (testing "Simple queries"
      (test-index {:query     (mt/mbql-query products)
                   :pk-ref    (mt/$ids $products.id)
                   :value-ref (mt/$ids $products.title)
                   :quantity  200
                   :subset    #{"Awesome Concrete Shoes" "Mediocre Wooden Bench"}
                   :scenario  :simple-table}))
    (testing "With joins"
      (test-index {:query     (mt/$ids
                               {:type     :query,
                                :query    {:source-table $$people,
                                           :joins        [{:fields       :all,
                                                           :source-table $$orders,
                                                           :condition    [:=
                                                                          [:field $people.id nil]
                                                                          [:field $orders.user_id {:join-alias "Orders"}]],
                                                           :alias        "Orders"}
                                                          {:fields       :all,
                                                           :source-table $$products,
                                                           :condition    [:=
                                                                          [:field $orders.product_id {:join-alias "Orders"}]
                                                                          [:field $products.id {:join-alias "Products"}]],
                                                           :alias        "Products"}]},
                                :database (mt/id)})
                   :pk-ref    (mt/$ids &Products.products.id)
                   :value-ref (mt/$ids &Products.products.title)
                   :quantity  200
                   :subset    #{"Awesome Concrete Shoes" "Mediocre Wooden Bench"}
                   :scenario  :with-joins}))
    (testing "Native"
      (test-index {:query     (mt/native-query {:query "SELECT * FROM PRODUCTS"})
                   :pk-ref    [:field "ID" {:base-type :type/BigInteger}]
                   :value-ref [:field "TITLE" {:base-type :type/Text}]
                   :quantity  200
                   :subset    #{"Awesome Concrete Shoes" "Mediocre Wooden Bench"}
                   :scenario  :native}))))

(deftest generation-test
  (mt/dataset sample-dataset
    (let [query  (mt/mbql-query products)
          pk_ref (mt/$ids $products.id)]
      (mt/with-temp* [Card [model {:dataset         true
                                   :name            "Simple MBQL model"
                                   :dataset_query   query
                                   :result_metadata (result-metadata-for-query query)}]
                      ModelIndex [model-index {:model_id   (:id model)
                                               :pk_ref     pk_ref
                                               :schedule   "0 0 23 * * ? *"
                                               :state      "initial"
                                               :value_ref  (mt/$ids $products.title)
                                               :generation 0
                                               :creator_id (mt/user->id :rasta)}]]
        (let [indexed-values! (fn fetch-indexed-values []
                                (into {}
                                      (map (juxt :model_pk identity))
                                      (t2/select ModelIndexValue :model_index_id (:id model-index))))]
          (testing "Populates indexed values"
            (#'model-index/add-values* model-index
                                       [[1 "chair"] [2 "desk"]])
            (is (partial= {1 {:name       "chair"
                              :model_pk   1
                              :generation 1}
                           2 {:name       "desk"
                              :model_pk   2
                              :generation 1}}
                          (indexed-values!))))
          (testing "Removes values no longer present"
            ;; drop desk and add lamp
            (#'model-index/add-values* (update model-index :generation inc)
                                       [[1 "chair"] [3 "lamp"]])
            (is (partial= {1 {:name       "chair"
                              :model_pk   1
                              :generation 2}
                           3 {:name       "lamp"
                              :model_pk   3
                              :generation 2}}
                          (indexed-values!))))
          (testing "Can remove the model index"
            (mt/user-http-request :rasta :delete 200 (str "/model-index/" (:id model-index)))
            (is (= {} (indexed-values!)))))))))
