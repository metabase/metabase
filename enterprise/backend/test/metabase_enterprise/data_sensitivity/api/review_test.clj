(ns metabase-enterprise.data-sensitivity.api.review-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- proposal! [run-id table-id field-id & {:as overrides}]
  (t2/insert-returning-pk! :model/MetadataGenerationProposal
                           (merge {:last_run_id    run-id
                                   :table_id       table-id
                                   :field_id       field-id
                                   :attribute      :semantic_type
                                   :proposed_value "type/Email"
                                   :confidence     :high
                                   :reasoning      "Values look like email addresses."}
                                  overrides)))

(defn- do-with-proposals!
  "Tables `A` (fields a1, a2) and `B` (field b1) in schema `S` and table `C` (field c1) in schema `T` of one database,
  with proposals of two runs. `f` gets the database id, the table ids and a map of proposal name to id: `a1-sem` and
  `a1-ds` on a1, `a2-human` on a2, whose semantic type a person set, `b1-sem` on b1 of the older run, `c1-sem` on c1."
  [f]
  (mt/with-temp [:model/Database {db-id :id}  {}
                 :model/Table    {a :id}      {:db_id db-id :schema "S" :name "A"}
                 :model/Table    {b :id}      {:db_id db-id :schema "S" :name "B"}
                 :model/Table    {c :id}      {:db_id db-id :schema "T" :name "C"}
                 :model/Field    {a1 :id}     {:table_id a :name "a1" :position 0 :semantic_type :type/Category}
                 :model/Field    {a2 :id}     {:table_id a :name "a2" :position 1}
                 :model/Field    {b1 :id}     {:table_id b :name "b1" :position 0}
                 :model/Field    {c1 :id}     {:table_id c :name "c1" :position 0}
                 :model/MetadataGenerationRun {old-run :id} {:database_id db-id
                                                             :scope       {:type :database}
                                                             :attributes  [:semantic_type]
                                                             :status      :succeeded
                                                             :is_active   nil}
                 :model/MetadataGenerationRun {run-id :id} {:database_id db-id
                                                            :scope       {:type :database}
                                                            :attributes  [:data_sensitivity :semantic_type]
                                                            :status      :succeeded}]
    (field-user-settings/upsert-user-settings {:id a2} {:semantic_type :type/Name})
    (f db-id {:a a :b b :c c}
       {:a1-sem   (proposal! run-id a a1)
        :a1-ds    (proposal! run-id a a1 :attribute :data_sensitivity :proposed_value "PII")
        :a2-human (proposal! run-id a a2)
        :b1-sem   (proposal! old-run b b1)
        :c1-sem   (proposal! run-id c c1)})))

(deftest superuser-required-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-proposals!
     (fn [db-id _ _]
       (mt/user-http-request :rasta :get 403 "ee/data-sensitivity/proposals/tables" :database-id db-id)
       (mt/user-http-request :rasta :get 403 "ee/data-sensitivity/proposals" :database-id db-id)
       (mt/user-http-request :rasta :post 403 "ee/data-sensitivity/proposals/apply"
                             {:reject_all true :database_id db-id})))))

(deftest table-counts-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-proposals!
     (fn [db-id {:keys [a b c]} {:keys [a1-ds]}]
       (t2/update! :model/MetadataGenerationProposal a1-ds {:status :rejected})
       (testing "pending proposals of all runs per table, without rejected ones"
         (is (= [{:table_id a :table_name "A" :schema "S" :pending 2 :human_set_pending 1}
                 {:table_id b :table_name "B" :schema "S" :pending 1 :human_set_pending 0}
                 {:table_id c :table_name "C" :schema "T" :pending 1 :human_set_pending 0}]
                (mt/user-http-request :crowberto :get 200 "ee/data-sensitivity/proposals/tables"
                                      :database-id db-id))))
       (testing "schema and table-id narrow the scope"
         (is (=? [{:table_id c}]
                 (mt/user-http-request :crowberto :get 200 "ee/data-sensitivity/proposals/tables"
                                       :database-id db-id :schema "T")))
         (is (=? [{:table_id b :pending 1}]
                 (mt/user-http-request :crowberto :get 200 "ee/data-sensitivity/proposals/tables" :table-id b))))
       (testing "an inactive table is left out"
         (t2/update! :model/Table c {:active false})
         (is (= [a b] (map :table_id (mt/user-http-request :crowberto :get 200 "ee/data-sensitivity/proposals/tables"
                                                           :database-id db-id)))))
       (testing "a scope needs a database or a table that exists"
         (mt/user-http-request :crowberto :get 400 "ee/data-sensitivity/proposals/tables")
         (mt/user-http-request :crowberto :get 400 "ee/data-sensitivity/proposals/tables" :schema "S")
         (mt/user-http-request :crowberto :get 404 "ee/data-sensitivity/proposals/tables"
                               :database-id Integer/MAX_VALUE)
         (mt/user-http-request :crowberto :get 404 "ee/data-sensitivity/proposals/tables" :table-id c))))))

(deftest pending-proposals-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-proposals!
     (fn [db-id {:keys [a b]} {:keys [a1-sem a1-ds a2-human b1-sem c1-sem]}]
       (testing "pending proposals in table and field order, with the reasoning and the current value and its layer"
         (is (=? [{:id a1-ds    :field_name "a1" :attribute "data_sensitivity" :source "none" :current_value nil
                   :status "pending"}
                  {:id a1-sem   :field_name "a1" :attribute "semantic_type" :source "deterministic"
                   :current_value "type/Category" :proposed_value "type/Email" :confidence "high"
                   :reasoning "Values look like email addresses."}
                  {:id a2-human :field_name "a2" :source "human" :current_value "type/Name"}
                  {:id b1-sem}
                  {:id c1-sem}]
                 (mt/user-http-request :crowberto :get 200 "ee/data-sensitivity/proposals" :database-id db-id))))
       (testing "a rejected proposal is hidden"
         (t2/update! :model/MetadataGenerationProposal a1-ds {:status :rejected})
         (is (= [a1-sem a2-human]
                (map :id (mt/user-http-request :crowberto :get 200 "ee/data-sensitivity/proposals" :table-id a)))))
       (testing "a table without pending proposals has none"
         (t2/update! :model/MetadataGenerationProposal b1-sem {:status :rejected})
         (is (= [] (mt/user-http-request :crowberto :get 200 "ee/data-sensitivity/proposals" :table-id b))))))))

(deftest inactive-field-proposals-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-proposals!
     (fn [db-id {:keys [a]} {:keys [a1-sem a1-ds a2-human]}]
       (t2/update! :model/Field (t2/select-one-fn :field_id :model/MetadataGenerationProposal :id a2-human)
                   {:active false})
       (testing "proposals of an inactive field are not counted"
         (is (=? [{:table_id a :pending 2 :human_set_pending 0}]
                 (mt/user-http-request :crowberto :get 200 "ee/data-sensitivity/proposals/tables" :table-id a))))
       (testing "proposals of an inactive field are not listed"
         (is (= [a1-ds a1-sem]
                (map :id (mt/user-http-request :crowberto :get 200 "ee/data-sensitivity/proposals"
                                               :database-id db-id :table-id a)))))))))
