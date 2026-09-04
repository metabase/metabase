(ns metabase-enterprise.data-sensitivity.api-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-sensitivity.core-test :as core-test]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- table-url [table-id]
  (str "ee/data-sensitivity/table/" table-id))

(defn- database-url [db-id]
  (str "ee/data-sensitivity/database/" db-id))

(defn- field-rows [table-ids]
  (t2/select-fn-vec (juxt :id :data_sensitivity :semantic_type) :model/Field
                    {:where    [:in :table_id table-ids]
                     :order-by [[:id :asc]]}))

(deftest premium-feature-required-test
  (mt/with-premium-features #{}
    (mt/assert-has-premium-feature-error
     "Data sensitivity" (mt/user-http-request :crowberto :post 402 (table-url (mt/id :people))))
    (mt/assert-has-premium-feature-error
     "Data sensitivity" (mt/user-http-request :crowberto :post 402 (database-url (mt/id))))))

(deftest database-write-permission-required-test
  (mt/with-premium-features #{:data-sensitivity}
    (core-test/do-with-llm!
     (core-test/canned-llm (constantly {}))
     (fn []
       (is (= "You don't have permissions to do that."
              (mt/user-http-request :rasta :post 403 (table-url (mt/id :people)))))
       (is (= "You don't have permissions to do that."
              (mt/user-http-request :rasta :post 403 (database-url (mt/id)))))))))

(deftest missing-table-test
  (mt/with-premium-features #{:data-sensitivity}
    (is (= "Not found."
           (mt/user-http-request :crowberto :post 404 (table-url Integer/MAX_VALUE))))))

(deftest unavailable-reason-test
  (mt/with-premium-features #{:data-sensitivity}
    (testing "a disabled Metabot is a 400 with the reason, before any classification runs"
      (mt/with-dynamic-fn-redefs [metabot.settings/metabot-enabled? (constantly false)]
        (is (=? {:message "Metabot is disabled. Enable Metabot to classify data sensitivity."
                 :reason  "metabot-disabled"}
                (mt/user-http-request :crowberto :post 400 (table-url (mt/id :people)))))
        (is (=? {:reason "metabot-disabled"}
                (mt/user-http-request :crowberto :post 400 (database-url (mt/id)))))))))

(deftest classify-table-test
  (testing "the table endpoint returns the diff without :metabot-v3 and writes nothing"
    (mt/with-premium-features #{:data-sensitivity}
      (mt/with-temp [:model/Field _ {:table_id (mt/id :people) :name "ds_api_agree" :base_type :type/Text
                                     :data_sensitivity :PII}
                     :model/Field _ {:table_id (mt/id :people) :name "ds_api_disagree" :base_type :type/Text
                                     :data_sensitivity :PUBLIC}]
        (let [entries  {"ds_api_agree"    {:data_sensitivity "PII"}
                        "ds_api_disagree" {:data_sensitivity "PII" :confidence "low"}}
              before   (field-rows [(mt/id :people)])
              response (core-test/do-with-llm!
                        (core-test/canned-llm #(get entries % {}))
                        #(mt/user-http-request :crowberto :post 200 (table-url (mt/id :people))))
              by-name  (into {} (map (juxt :name identity)) (:fields response))]
          (is (= before (field-rows [(mt/id :people)])) "the endpoint must not write to metabase_field")
          (is (=? {:table_id    (mt/id :people)
                   :table_name  "PEOPLE"
                   :database_id (mt/id)
                   :model       "test/mini"
                   :requests    1
                   :usage       {:input_tokens 100 :output_tokens 20}
                   :counts      {:fields (count (:fields response))}}
                  response))
          (is (=? {:current  {:data_sensitivity "PII" :human_set? false :state "classifier"}
                   :proposed {:data_sensitivity "PII" :confidence "high" :reasoning "because"}
                   :status   "agree"}
                  (get by-name "ds_api_agree")))
          (is (=? {:current  {:data_sensitivity "PUBLIC" :state "classifier"}
                   :proposed {:data_sensitivity "PII" :confidence "low"}
                   :status   "disagree"}
                  (get by-name "ds_api_disagree")))
          (is (=? {:current {:data_sensitivity nil :state "unscanned"}
                   :status  "disagree"}
                  (get by-name "EMAIL"))))))))

(deftest classify-database-test
  (mt/with-premium-features #{:data-sensitivity}
    (let [tables (t2/select :model/Table :db_id (mt/id) :active true {:order-by [[:schema :asc] [:name :asc]]})]
      (testing "the database endpoint classifies every active table and writes nothing"
        (let [before   (field-rows (map :id tables))
              response (core-test/do-with-llm!
                        (core-test/canned-llm (constantly {}))
                        #(mt/user-http-request :crowberto :post 200 (database-url (mt/id))))]
          (is (= before (field-rows (map :id tables))) "the endpoint must not write to metabase_field")
          (is (=? {:database_id (mt/id)
                   :schema      nil
                   :requests    (count tables)
                   :failed      0
                   :usage       {:input_tokens (* 100 (count tables))}}
                  response))
          (is (= (map :id tables) (map :table_id (:tables response))))))
      (testing "the schema body parameter restricts the tables"
        (let [schema   (:schema (first tables))
              expected (filter #(= schema (:schema %)) tables)
              response (core-test/do-with-llm!
                        (core-test/canned-llm (constantly {}))
                        #(mt/user-http-request :crowberto :post 200 (database-url (mt/id)) {:schema schema}))]
          (is (= schema (:schema response)))
          (is (= (map :id expected) (map :table_id (:tables response)))))
        (let [response (core-test/do-with-llm!
                        (core-test/canned-llm (constantly {}))
                        #(mt/user-http-request :crowberto :post 200 (database-url (mt/id)) {:schema "no_such_schema"}))]
          (is (= [] (:tables response)))
          (is (= 0 (:requests response))))))))
