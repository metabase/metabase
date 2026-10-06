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
             (rolled-back #(remote-sync.db/child-card-ids (ids 65536) [])))))))

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
