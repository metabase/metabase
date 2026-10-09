(ns metabase-enterprise.data-sensitivity.api.runs-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-sensitivity.core-test :as core-test]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(defn- wait-ended [run-id]
  (loop [n 0]
    (let [run (t2/select-one :model/MetadataGenerationRun :id run-id)]
      (cond
        (nil? (:is_active run)) run
        (> n 200)               (throw (ex-info "Timed out waiting for the run" {:run run}))
        :else                   (do (Thread/sleep 50) (recur (inc n)))))))

(defn- do-with-temp-tables [n f]
  (mt/with-temp [:model/Database db {}]
    (let [tables (mapv (fn [i]
                         (let [table (t2/insert-returning-instance! :model/Table {:db_id (:id db) :schema (str "S" (mod i 2))
                                                                                  :name  (format "ds_%02d" i)
                                                                                  :active true})]
                           (t2/insert! :model/Field {:table_id (:id table) :name (format "ds_%02d_field" i)
                                                     :base_type :type/Text :database_type "TEXT"})
                           table))
                       (range n))]
      (f db tables))))

(deftest premium-feature-and-superuser-required-test
  (mt/with-premium-features #{}
    (mt/assert-has-premium-feature-error
     "Data sensitivity" (mt/user-http-request :crowberto :post 402 "ee/data-sensitivity/runs" {:database_id (mt/id)})))
  (mt/with-premium-features #{:data-sensitivity}
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :post 403 "ee/data-sensitivity/runs" {:database_id (mt/id)})))
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/data-sensitivity/runs" :database-id (mt/id))))))

(deftest run-lifecycle-api-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-temp-tables
     4
     (fn [db tables]
       (let [started (CountDownLatch. 1)
             block?  (atom true)]
         (core-test/do-with-llm!
          (fn [& args]
            (when @block?
              (.countDown started)
              (Thread/sleep 30000))
            (apply (core-test/canned-llm (constantly {:data_sensitivity "PII"})) args))
          (fn []
            (let [run (mt/user-http-request :crowberto :post 200 "ee/data-sensitivity/runs"
                                            {:database_id (:id db) :schemas ["S0"] :attributes ["data_sensitivity"]})]
              (is (=? {:id           pos-int?
                       :status       "pending"
                       :scope        {:type "schemas" :schemas ["S0"]}
                       :attributes   ["data_sensitivity"]
                       :total_tables 2
                       :creator_id   (mt/user->id :crowberto)}
                      run))
              (is (.await started 10 TimeUnit/SECONDS))
              (testing "a second run on the same database is a 409"
                (mt/user-http-request :crowberto :post 409 "ee/data-sensitivity/runs" {:database_id (:id db)}))
              (testing "GET runs/:id reports the run"
                (is (=? {:id (:id run) :status "running" :done_tables 0}
                        (mt/user-http-request :crowberto :get 200 (str "ee/data-sensitivity/runs/" (:id run))))))
              (testing "cancel stops the run"
                (is (=? {:status "canceling"}
                        (mt/user-http-request :crowberto :post 200 (str "ee/data-sensitivity/runs/" (:id run) "/cancel"))))
                (is (=? {:status :canceled} (wait-ended (:id run))))
                (mt/user-http-request :crowberto :post 409 (str "ee/data-sensitivity/runs/" (:id run) "/cancel")))
              (testing "retry-failed starts a run over the tables the canceled run did not process"
                (reset! block? false)
                (let [retry (mt/user-http-request :crowberto :post 200
                                                  (str "ee/data-sensitivity/runs/" (:id run) "/retry-failed"))]
                  (is (=? {:scope      {:type "tables" :table_ids (mapv :id (filter #(= "S0" (:schema %)) tables))}
                           :attributes ["data_sensitivity"]}
                          retry))
                  (is (=? {:status :succeeded :done_tables 2} (wait-ended (:id retry))))
                  (testing "GET runs lists the runs of the database, newest first"
                    (is (= [(:id retry) (:id run)]
                           (map :id (mt/user-http-request :crowberto :get 200 "ee/data-sensitivity/runs"
                                                          :database-id (:id db))))))))))))))))

(deftest start-validation-api-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-temp-tables
     1
     (fn [db _tables]
       (core-test/do-with-llm!
        (core-test/canned-llm (constantly {}))
        (fn []
          (testing "unknown database"
            (mt/user-http-request :crowberto :post 404 "ee/data-sensitivity/runs" {:database_id Integer/MAX_VALUE}))
          (testing "unknown schema"
            (mt/user-http-request :crowberto :post 400 "ee/data-sensitivity/runs"
                                  {:database_id (:id db) :schemas ["nope"]}))
          (testing "a table of another database"
            (mt/user-http-request :crowberto :post 400 "ee/data-sensitivity/runs"
                                  {:database_id (:id db) :table_ids [(mt/id :people)]}))
          (testing "schemas and table_ids together"
            (mt/user-http-request :crowberto :post 400 "ee/data-sensitivity/runs"
                                  {:database_id (:id db) :schemas ["S0"] :table_ids [1]}))
          (testing "retry of a run with no failed tables"
            (let [run (mt/user-http-request :crowberto :post 200 "ee/data-sensitivity/runs" {:database_id (:id db)})]
              (wait-ended (:id run))
              (mt/user-http-request :crowberto :post 400 (str "ee/data-sensitivity/runs/" (:id run) "/retry-failed"))))))))))

(deftest estimate-api-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-temp-tables
     4
     (fn [db tables]
       (core-test/do-with-llm!
        (core-test/canned-llm (constantly {}))
        (fn []
          (testing "the whole database with the default attributes"
            (is (=? {:table_count        4
                     :field_count        4
                     :total_tokens       (* 4 433)
                     :cost_usd           #(< 0.002 % 0.003)
                     :unavailable_reason nil}
                    (mt/user-http-request :crowberto :get 200 "ee/data-sensitivity/runs/estimate"
                                          :database-id (:id db)))))
          (testing "a schema and an attribute set"
            (is (=? {:table_count 2 :field_count 2 :total_tokens (* 2 369)}
                    (mt/user-http-request :crowberto :get 200 "ee/data-sensitivity/runs/estimate"
                                          :database-id (:id db) :schemas "S0" :attributes "data_sensitivity"))))
          (testing "tables"
            (is (=? {:table_count 2 :field_count 2}
                    (mt/user-http-request :crowberto :get 200 "ee/data-sensitivity/runs/estimate"
                                          :database-id (:id db) :table-ids (:id (first tables))
                                          :table-ids (:id (second tables))))))
          (testing "an attribute set with no bench row uses the highest ratio"
            (is (=? {:total_tokens (* 4 493)}
                    (mt/user-http-request :crowberto :get 200 "ee/data-sensitivity/runs/estimate"
                                          :database-id (:id db) :attributes "semantic_type"))))
          (testing "an unknown schema is a 400"
            (mt/user-http-request :crowberto :get 400 "ee/data-sensitivity/runs/estimate"
                                  :database-id (:id db) :schemas "nope"))
          (testing "requires a superuser"
            (mt/user-http-request :rasta :get 403 "ee/data-sensitivity/runs/estimate" :database-id (:id db)))))))))
