(ns metabase-enterprise.data-sensitivity.api.review-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- url [run-id & parts]
  (apply str "ee/data-sensitivity/runs/" run-id parts))

(defn- suggestion! [run-id table-id field-id & {:as overrides}]
  (t2/insert-returning-pk! :model/MetadataGenerationProposal
                           (merge {:last_run_id    run-id
                                   :table_id       table-id
                                   :field_id       field-id
                                   :attribute      :semantic_type
                                   :proposed_value "type/Email"
                                   :confidence     :high
                                   :reasoning      "Values look like email addresses."}
                                  overrides)))

(defn- do-with-run!
  "Two tables `A` (fields a1, a2) and `B` (field b1) with a run over them. `f` gets the run id, the table ids and a map
  of proposal name to id: `a1-sem` and `a1-ds` on a1, `a2-human` on a2, whose semantic type a person set, `b1-sem` on
  b1."
  [f]
  (mt/with-temp [:model/Database {db-id :id}  {}
                 :model/Table    {a :id}      {:db_id db-id :schema "S" :name "A"}
                 :model/Table    {b :id}      {:db_id db-id :schema "S" :name "B"}
                 :model/Field    {a1 :id}     {:table_id a :name "a1" :position 0 :semantic_type :type/Category}
                 :model/Field    {a2 :id}     {:table_id a :name "a2" :position 1}
                 :model/Field    {b1 :id}     {:table_id b :name "b1" :position 0}
                 :model/MetadataGenerationRun {run-id :id} {:database_id db-id
                                                            :scope       {:type :database}
                                                            :attributes  [:data_sensitivity :semantic_type]
                                                            :status      :succeeded}]
    (field-user-settings/upsert-user-settings {:id a2} {:semantic_type :type/Name})
    (f run-id {:a a :b b}
       {:a1-sem   (suggestion! run-id a a1)
        :a1-ds    (suggestion! run-id a a1 :attribute :data_sensitivity :proposed_value "PII")
        :a2-human (suggestion! run-id a a2)
        :b1-sem   (suggestion! run-id b b1)})))

(deftest superuser-required-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run!
     (fn [run-id {:keys [a]} _]
       (mt/user-http-request :rasta :get 403 (url run-id "/tables"))
       (mt/user-http-request :rasta :get 403 (url run-id "/tables/" a "/suggestions"))
       (mt/user-http-request :rasta :post 403 (url run-id "/apply") {:all true})))))

(deftest run-tables-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run!
     (fn [run-id {:keys [a b]} {:keys [b1-sem]}]
       (t2/update! :model/MetadataGenerationProposal b1-sem {:status :rejected})
       (is (= [{:table_id a :table_name "A" :schema "S" :total 3 :human_set_pending 1
                :counts {:pending 3 :rejected 0}}
               {:table_id b :table_name "B" :schema "S" :total 1 :human_set_pending 0
                :counts {:pending 0 :rejected 1}}]
              (mt/user-http-request :crowberto :get 200 (url run-id "/tables"))))
       (testing "an unknown run is a 404"
         (mt/user-http-request :crowberto :get 404 (url Integer/MAX_VALUE "/tables")))))))

(deftest table-suggestions-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run!
     (fn [run-id {:keys [a b]} {:keys [a1-sem a1-ds a2-human]}]
       (testing "proposals of one table in field order, with the field name and the current value and its layer"
         (is (=? [{:id a1-ds    :field_name "a1" :attribute "data_sensitivity" :source "none" :current_value nil
                   :status "pending" :last_run_id run-id}
                  {:id a1-sem   :field_name "a1" :attribute "semantic_type" :source "deterministic"
                   :current_value "type/Category" :proposed_value "type/Email" :confidence "high"}
                  {:id a2-human :field_name "a2" :source "human" :current_value "type/Name"}]
                 (mt/user-http-request :crowberto :get 200 (url run-id "/tables/" a "/suggestions")))))
       (testing "a table without proposals of the run has none"
         (is (= [] (mt/user-http-request :crowberto :get 200 (url run-id "/tables/" (inc b) "/suggestions")))))))))
