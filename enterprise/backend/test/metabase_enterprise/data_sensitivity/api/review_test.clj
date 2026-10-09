(ns metabase-enterprise.data-sensitivity.api.review-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- url [run-id & parts]
  (apply str "ee/data-sensitivity/runs/" run-id parts))

(defn- suggestion! [run-id table-id field-id & {:as overrides}]
  (t2/insert-returning-pk! :model/MetadataGenerationSuggestion
                           (merge {:run_id         run-id
                                   :table_id       table-id
                                   :field_id       field-id
                                   :attribute      :semantic_type
                                   :source         :deterministic
                                   :current_value  "type/Category"
                                   :proposed_value "type/Email"
                                   :confidence     :high
                                   :reasoning      "Values look like email addresses."}
                                  overrides)))

(defn- statuses [ids]
  (into {} (map (juxt :id :status)) (t2/select :model/MetadataGenerationSuggestion :id [:in ids])))

(defn- do-with-run
  "Two tables `A` (fields a1, a2) and `B` (field b1) with a run over them. `f` gets the run id, the table ids and a map
  of suggestion name to id: `a1-sem` and `a1-ds` on a1, `a2-human` (source human) on a2, `b1-sem` on b1."
  [f]
  (mt/with-temp [:model/Database {db-id :id}  {}
                 :model/Table    {a :id}      {:db_id db-id :schema "S" :name "A"}
                 :model/Table    {b :id}      {:db_id db-id :schema "S" :name "B"}
                 :model/Field    {a1 :id}     {:table_id a :name "a1" :position 0}
                 :model/Field    {a2 :id}     {:table_id a :name "a2" :position 1}
                 :model/Field    {b1 :id}     {:table_id b :name "b1" :position 0}
                 :model/MetadataGenerationRun {run-id :id} {:database_id db-id
                                                            :scope       {:type :database}
                                                            :attributes  [:data_sensitivity :semantic_type]
                                                            :status      :succeeded}]
    (f run-id {:a a :b b}
       {:a1-sem   (suggestion! run-id a a1)
        :a1-ds    (suggestion! run-id a a1 :attribute :data_sensitivity :current_value nil :source :none
                               :proposed_value "PII")
        :a2-human (suggestion! run-id a a2 :source :human :current_value "type/Name")
        :b1-sem   (suggestion! run-id b b1)})))

(deftest superuser-required-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a]} _]
       (mt/user-http-request :rasta :get 403 (url run-id "/tables"))
       (mt/user-http-request :rasta :get 403 (url run-id "/tables/" a "/suggestions"))
       (mt/user-http-request :rasta :post 403 (url run-id "/decisions") {:decision "accept" :all true})))))

(deftest run-tables-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a b]} {:keys [b1-sem]}]
       (t2/update! :model/MetadataGenerationSuggestion b1-sem {:status :rejected})
       (is (= [{:table_id a :table_name "A" :schema "S" :total 3 :human_set_pending 1
                :counts {:pending 3 :accepted 0 :rejected 0 :stale 0 :applied 0}}
               {:table_id b :table_name "B" :schema "S" :total 1 :human_set_pending 0
                :counts {:pending 0 :accepted 0 :rejected 1 :stale 0 :applied 0}}]
              (mt/user-http-request :crowberto :get 200 (url run-id "/tables"))))
       (testing "an unknown run is a 404"
         (mt/user-http-request :crowberto :get 404 (url Integer/MAX_VALUE "/tables")))))))

(deftest table-suggestions-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a b]} {:keys [a1-sem a1-ds a2-human]}]
       (testing "suggestions of one table in field order, with the field name"
         (is (=? [{:id a1-ds    :field_name "a1" :attribute "data_sensitivity" :source "none" :status "pending"}
                  {:id a1-sem   :field_name "a1" :attribute "semantic_type" :current_value "type/Category"
                   :proposed_value "type/Email" :confidence "high"}
                  {:id a2-human :field_name "a2" :source "human"}]
                 (mt/user-http-request :crowberto :get 200 (url run-id "/tables/" a "/suggestions")))))
       (testing "a table of another run has no suggestions"
         (is (= [] (mt/user-http-request :crowberto :get 200 (url run-id "/tables/" (inc b) "/suggestions")))))))))

(deftest decisions-test
  (mt/with-premium-features #{:data-sensitivity}
    (testing "per suggestion: accept includes a human-set suggestion"
      (do-with-run
       (fn [run-id _ {:keys [a1-sem a2-human b1-sem] :as ids}]
         (is (= {:updated 2} (mt/user-http-request :crowberto :post 200 (url run-id "/decisions")
                                                   {:decision "accept" :suggestion_ids [a1-sem a2-human]})))
         (is (= {a1-sem :accepted a2-human :accepted b1-sem :pending}
                (select-keys (statuses (vals ids)) [a1-sem a2-human b1-sem])))
         (is (=? {:decided_by (mt/user->id :crowberto) :decided_at some?}
                 (t2/select-one :model/MetadataGenerationSuggestion a1-sem))))))
    (testing "per table: accept leaves out human-set suggestions unless include_human_set"
      (do-with-run
       (fn [run-id {:keys [a]} {:keys [a1-sem a1-ds a2-human b1-sem] :as ids}]
         (is (= {:updated 2} (mt/user-http-request :crowberto :post 200 (url run-id "/decisions")
                                                   {:decision "accept" :table_ids [a]})))
         (is (= {a1-sem :accepted a1-ds :accepted a2-human :pending b1-sem :pending} (statuses (vals ids))))
         (is (= {:updated 1} (mt/user-http-request :crowberto :post 200 (url run-id "/decisions")
                                                   {:decision "accept" :table_ids [a] :include_human_set true})))
         (is (= :accepted (get (statuses [a2-human]) a2-human))))))
    (testing "whole run: accept, then reject"
      (do-with-run
       (fn [run-id _ {:keys [a2-human] :as ids}]
         (is (= {:updated 3} (mt/user-http-request :crowberto :post 200 (url run-id "/decisions")
                                                   {:decision "accept" :all true})))
         (is (= :pending (get (statuses [a2-human]) a2-human)))
         (is (= {:updated 4} (mt/user-http-request :crowberto :post 200 (url run-id "/decisions")
                                                   {:decision "reject" :all true})))
         (is (= #{:rejected} (set (vals (statuses (vals ids)))))))))
    (testing "stale and applied suggestions do not change"
      (do-with-run
       (fn [run-id _ {:keys [a1-sem b1-sem]}]
         (t2/update! :model/MetadataGenerationSuggestion a1-sem {:status :stale})
         (t2/update! :model/MetadataGenerationSuggestion b1-sem {:status :applied})
         (mt/user-http-request :crowberto :post 200 (url run-id "/decisions") {:decision "reject" :all true})
         (is (= {a1-sem :stale b1-sem :applied} (statuses [a1-sem b1-sem]))))))))

(deftest decisions-validation-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a]} {:keys [a1-sem]}]
       (testing "exactly one selection"
         (mt/user-http-request :crowberto :post 400 (url run-id "/decisions") {:decision "accept"})
         (mt/user-http-request :crowberto :post 400 (url run-id "/decisions")
                               {:decision "accept" :all true :table_ids [a]})
         (mt/user-http-request :crowberto :post 400 (url run-id "/decisions")
                               {:decision "accept" :suggestion_ids [a1-sem] :table_ids [a]}))
       (testing "unknown decision"
         (mt/user-http-request :crowberto :post 400 (url run-id "/decisions") {:decision "maybe" :all true}))
       (testing "unknown run"
         (mt/user-http-request :crowberto :post 404 (url Integer/MAX_VALUE "/decisions")
                               {:decision "accept" :all true}))))))
