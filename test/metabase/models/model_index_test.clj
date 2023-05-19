(ns metabase.models.model-index-test
  (:require [clojure.set :as set]
            [clojure.test :refer :all]
            [clojurewerkz.quartzite.conversion :as qc]
            [clojurewerkz.quartzite.scheduler :as qs]
            [malli.core :as mc]
            [malli.error :as me]
            [metabase.driver :as driver]
            [metabase.models.card :refer [Card]]
            [metabase.models.model-index :as model-index :refer [ModelIndex
                                                                 ModelIndexValue]]
            [metabase.query-processor :as qp]
            [metabase.task :as task]
            [metabase.task.index-values :as task.index-values]
            [metabase.task.sync-databases :as task.sync-databases]
            [metabase.test :as mt]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan2.core :as t2]
            [toucan2.tools.with-temp :as t2.with-temp]))

(defmacro with-scheduler-setup [& body]
  `(let [scheduler# (#'tu/in-memory-scheduler)]
     ;; need cross thread rebinding from with-redefs not a binding
     (with-redefs [task/scheduler (constantly scheduler#)]
       (qs/standby scheduler#)
       (#'task.index-values/job-init!)
       ;; with-temp creates new dbs which schedules the refresh tasks. without this, if this is the first time the db
       ;; is added you get a gnarly stacktrace about missing keys for sync and refresh. It doesn't ultimately matter
       ;; but let's keep it clean
       (#'task.sync-databases/job-init)
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
        (t2.with-temp/with-temp [Card model (assoc (mt/card-with-source-metadata-for-query query)
                                                   :dataset         true
                                                   :name            "model index test")]
          (let [model-index (mt/user-http-request :rasta :post 200 "/model-index"
                                                  {:model_id  (:id model)
                                                   :pk_ref    pk_ref
                                                   :value_ref value_ref})
                by-key      (fn [k xs]
                              (some (fn [x] (when (= (:key x) k) x)) xs))]
            (testing "We can get the model index"
              (is (=? {:generation 1
                       :state      "indexed"
                       :model_id   (:id model)
                       :error      nil}
                      (mt/user-http-request :rasta :get 200 (str "/model-index/" (:id model-index))))))
            (testing "We can invoke the task ourself manually"
              (model-index/add-values! model-index)
              (is (= 200 (count (t2/select ModelIndexValue :model_index_id (:id model-index)))))
              (is (= (into #{} cat (mt/rows (qp/process-query
                                             (mt/mbql-query products {:fields [$title]}))))
                     (t2/select-fn-set :name ModelIndexValue :model_index_id (:id model-index)))))
            (let [index-trigger! #(->> (task/scheduler-info)
                                       :jobs
                                       (by-key "metabase.task.IndexValues.job")
                                       :triggers
                                       (by-key (format "metabase.task.IndexValues.trigger.%d"
                                                       (:id model-index))))]
              (testing "There's a task to sync the values"
                (let [trigger (index-trigger!)]
                  (is (some? trigger) "Index trigger not found")
                  (is (= (:schedule model-index) (:schedule trigger)))
                  (is (= {"model-index-id" (:id model-index)}
                         (qc/from-job-data (:data trigger))))))
              (testing "Deleting the model index removes the indexing task"
                (t2/delete! ModelIndex :id (:id model-index))
                (is (nil? (index-trigger!)) "Index trigger not removed")))))))))

(deftest fetch-values-test
  (mt/test-drivers (dissoc (mt/normal-drivers) :mongo)
    (mt/dataset sample-dataset
      (doseq [[scenario query [field-refs]]
              (remove nil?
                      [[:mbql (mt/mbql-query products {:fields [$id $title]})]
                       [:native (mt/native-query
                                 (qp/compile
                                  (mt/mbql-query products {:fields [$id $title]})))]
                       (when (driver/database-supports? (:engine (mt/db)) :left-join (mt/db))
                         [:join (mt/$ids
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
                          [(mt/$ids [[:field $products.id {:join-alias "Products"}]
                                     [:field $products.title {:join-alias "Products"}]])]])])]
        (t2.with-temp/with-temp [Card model (mt/card-with-source-metadata-for-query
                                             query)]
          (testing (str "scenario: " scenario)
            (let [[pk-ref value-ref] (or field-refs
                                         (->> model :result_metadata (map :field_ref)))
                  [error values]  (#'model-index/fetch-values {:model_id  (:id model)
                                                               :pk_ref    pk-ref
                                                               :value_ref value-ref})]
              (is (nil? error))
              (is (mc/validate [:sequential [:tuple int? string?]] values)
                  (-> (mc/validate [:sequential [:tuple int? string?]] values)
                      (me/humanize))))))))))

(defn- test-index
  "Takes a query, pk and value names so it can look up the exact field ref from the metadata. This is what the UI would
  do and ensures that items in the options map are correct."
  [{:keys [query pk-name value-name quantity subset scenario]}]
  (testing scenario
    (t2.with-temp/with-temp [Card model (assoc (mt/card-with-source-metadata-for-query query)
                                               :dataset         true
                                               :name            "model index test")]
      (let [by-name     (fn [n] (or (some (fn [f]
                                            (when (= (-> f :display_name u/lower-case-en) (u/lower-case-en n))
                                              (:field_ref f)))
                                          (:result_metadata model))
                                    (throw (ex-info (str "Didn't find field: " n)
                                                    {:fields (map :name (:result_metadata model))
                                                     :field  n}))))
            model-index (mt/user-http-request :rasta :post 200 "model-index"
                                              {:model_id  (:id model)
                                               :pk_ref    (by-name pk-name)
                                               :value_ref (by-name value-name)})]
        ;; post most likely creates this, but duplicate to be sure
        (model-index/add-values! model-index)
        (is (= "indexed"
               (t2/select-one-fn :state ModelIndex :id (:id model-index))))
        (is (= quantity
               (t2/count ModelIndexValue :model_index_id (:id model-index))))
        (is (set/subset? subset (t2/select-fn-set :name ModelIndexValue
                                                  :model_index_id (:id model-index))))
        (mt/user-http-request :rasta :delete 200 (str "/model-index/" (:id model-index)))))))

(deftest model-index-test
  (mt/dataset sample-dataset
    (testing "Simple queries"
      (test-index {:query      (mt/mbql-query products)
                   :pk-name    "id"
                   :value-name "title"
                   :quantity   200
                   :subset     #{"Awesome Concrete Shoes" "Mediocre Wooden Bench"}
                   :scenario   :simple-table}))
    (testing "With joins"
      (test-index {:query      (mt/$ids
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
                   :pk-name    "Products → ID"
                   :value-name "Products → Title"
                   :quantity   200
                   :subset     #{"Awesome Concrete Shoes" "Mediocre Wooden Bench"}
                   :scenario   :with-joins}))
    (testing "Native"
      (test-index {:query      (mt/native-query (qp/compile (mt/mbql-query products)))
                   :pk-name    "id"
                   :value-name "title"
                   :quantity   200
                   :subset     #{"Awesome Concrete Shoes" "Mediocre Wooden Bench"}
                   :scenario   :native}))
    (testing "Records error message on failure"
      (let [query             (mt/mbql-query products {:fields [$id $title]})
            pk-ref            (mt/$ids $products.id)
            invalid-value-ref (mt/$ids $products.ean)]
        (t2.with-temp/with-temp [Card model (assoc (mt/card-with-source-metadata-for-query query)
                                                   :dataset         true
                                                   :name            "model index test")
                                 ModelIndex mi {:model_id   (:id model)
                                                :pk_ref     pk-ref
                                                :value_ref  invalid-value-ref
                                                :generation 0
                                                :creator_id (mt/user->id :rasta)
                                                :schedule   "0 0 23 * * ? *"
                                                :state      "initial"}]
          (model-index/add-values! mi)
          (let [bad-attempt (t2/select-one ModelIndex :id (:id mi))]
            (is (=? {:state "error"
                     :error #"(?s)Error executing query.*"}
                    bad-attempt))))))))

(deftest generation-test
  (mt/dataset sample-dataset
    (let [query  (mt/mbql-query products)
          pk_ref (mt/$ids $products.id)]
      (t2.with-temp/with-temp [Card model (assoc (mt/card-with-source-metadata-for-query query)
                                           :dataset         true
                                           :name            "Simple MBQL model")
                               ModelIndex model-index {:model_id   (:id model)
                                                       :pk_ref     pk_ref
                                                       :schedule   "0 0 23 * * ? *"
                                                       :state      "initial"
                                                       :value_ref  (mt/$ids $products.title)
                                                       :generation 0
                                                       :creator_id (mt/user->id :rasta)}]
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
