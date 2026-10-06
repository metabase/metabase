(ns metabase-enterprise.remote-sync.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- ids
  "`n` consecutive ids that match no row."
  [n]
  (vec (range 900000000 (+ 900000000 n))))

(defn- rolled-back
  "Call `f` in an app-DB transaction that is rolled back. Returns `{:result <f's result>}`, or `{:error <message>}`
  when `f` throws."
  [f]
  (try
    (t2/with-transaction [_conn nil {:rollback-only true}]
      {:result (f)})
    (catch Exception e
      {:error (ex-message (or (ex-cause e) e))})))

;; Postgres accepts at most 65,535 bind parameters in one statement.
(deftest delete-step-above-postgres-parameter-limit-test
  (when (= :postgres (mdb/db-type))
    (testing "delete-rsos-of-keys! accepts 32,768 keys (65,536 parameters)"
      (is (= {:result 0}
             (rolled-back #(remote-sync.db/delete-rsos-of-keys!
                            (mapv (fn [id] {:model_type "Card" :model_id id}) (ids 32768)))))))
    (testing "delete-instances! accepts 65,536 ids"
      (is (= {:result 0}
             (rolled-back #(remote-sync.db/delete-instances! :model/Card (ids 65536))))))
    (testing "child-card-ids accepts 65,536 dashboard ids"
      (is (= {:result []}
             (rolled-back #(remote-sync.db/child-card-ids (ids 65536) [])))))
    (testing "cascaded-action-and-index-ids accepts 65,536 card ids"
      (is (= {:result {:action-ids [] :index-ids []}}
             (rolled-back #(remote-sync.db/cascaded-action-and-index-ids (ids 65536))))))
    (testing "model-index-value-search-ids accepts 65,536 model index ids"
      (is (= {:result []}
             (rolled-back #(remote-sync.db/model-index-value-search-ids (ids 65536))))))))

(defn- model-index
  "The columns of a ModelIndex of the model Card `model-id`."
  [model-id]
  {:model_id   model-id
   :pk_ref     [:field 1 nil]
   :value_ref  [:field 2 nil]
   :schedule   "0 0 0 * * ? *"
   :state      "indexed"
   :creator_id (mt/user->id :rasta)})

(deftest chunked-cascade-lookups-test
  (let [chunk-size @#'remote-sync.db/ids-per-query
        ;; `first-id` is in the first chunk, and `last-id` is in the second chunk
        across     (fn [first-id last-id] (vec (concat [first-id] (ids chunk-size) [last-id])))]
    (mt/with-temp [:model/Card       {model-1 :id}  {:name "First model" :type :model}
                   :model/Card       {model-2 :id}  {:name "Second model" :type :model}
                   :model/Action     {action-1 :id} {:name "First action" :type :implicit :model_id model-1}
                   :model/Action     {action-2 :id} {:name "Second action" :type :implicit :model_id model-2}
                   :model/ModelIndex {index-1 :id}  (model-index model-1)
                   :model/ModelIndex {index-2 :id}  (model-index model-2)]
      ;; the delete of each ModelIndex removes its values by FK cascade
      (t2/insert! :model/ModelIndexValue [{:model_index_id index-1 :model_pk 1 :name "First value"}
                                          {:model_index_id index-2 :model_pk 2 :name "Second value"}])
      (testing "cascaded-action-and-index-ids finds the rows of the Cards in each chunk, each row one time"
        (is (= {:action-ids (sort [action-1 action-2])
                :index-ids  (sort [index-1 index-2])}
               (update-vals (remote-sync.db/cascaded-action-and-index-ids (across model-1 model-2)) sort))))
      (testing "model-index-value-search-ids finds the values of the ModelIndexes in each chunk, each value one time"
        (is (= (sort [(str index-1 ":1") (str index-2 ":2")])
               (sort (remote-sync.db/model-index-value-search-ids (across index-1 index-2)))))))))

(deftest delete-closure-test
  (mt/with-temp [:model/Dashboard  {dash-id :id}     {:name "Closure dashboard"}
                 :model/Document   {doc-id :id}      {:name         "Closure document"
                                                      :document     {:type "doc" :content []}
                                                      :content_type "application/json+vnd.prose-mirror"}
                 :model/Card       {dash-card :id}   {:name "Dashboard question" :dashboard_id dash-id}
                 :model/Card       {doc-model :id}   {:name "Document model" :type :model :document_id doc-id}
                 :model/Card       {plain-model :id} {:name "Plain model" :type :model}
                 :model/Action     {doc-action :id}  {:name "Document action" :type :implicit :model_id doc-model}
                 :model/Action     {plain-action :id} {:name "Plain action" :type :implicit :model_id plain-model}
                 :model/ModelIndex {index-id :id}    {:model_id   doc-model
                                                      :pk_ref     [:field 1 nil]
                                                      :value_ref  [:field 2 nil]
                                                      :schedule   "0 0 0 * * ? *"
                                                      :state      "indexed"
                                                      :creator_id (mt/user->id :rasta)}]
    (testing "the closure adds the Cards of each Dashboard and Document, then the Actions and model indexes of each Card"
      (is (= {:ids-by-model    {:model/Dashboard #{dash-id}
                                :model/Document  #{doc-id}
                                :model/Card      #{dash-card doc-model}
                                :model/Action    #{doc-action}}
              :model-index-ids #{index-id}}
             (remote-sync.db/delete-closure {:model/Dashboard #{dash-id} :model/Document #{doc-id}}))))
    (testing "the Actions of a Card that the input names, and the ids of a model with no cascade, are in the closure"
      (is (= {:ids-by-model    {:model/Card     #{plain-model}
                                :model/Action   #{plain-action}
                                :model/Timeline #{1}}
              :model-index-ids #{}}
             (remote-sync.db/delete-closure {:model/Card #{plain-model} :model/Timeline #{1}}))))
    (testing "an empty input gives an empty closure"
      (is (= {:ids-by-model {} :model-index-ids #{}}
             (remote-sync.db/delete-closure {}))))))
