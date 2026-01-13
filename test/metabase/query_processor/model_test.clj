(ns metabase.query-processor.model-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.test :as mt]))

;; TODO (eric, 2025-01-12): remapped column does not get new display name
(defn- run-query-for-card
  "Run query for Card synchronously."
  [card-id]
  (qp.card/process-query-for-card
   card-id :api
   :make-run (constantly
              (fn [query info]
                (qp/process-query (assoc (qp/userland-query query) :info info))))))

(deftest ^:parallel model-custom-column-names-persist-test
  (testing "Custom column names from model result_metadata persist in saved questions (#65532)"
    (let [mp (mt/metadata-provider)
          expected-columns [{:name "ID"
                             :display_name "ID"}
                            {:name "ID_2"
                             :display_name "IDX"}]]
      #_{:clj-kondo/ignore [:discouraged-var]}
      (mt/with-temp [:model/Card model {:type :model
                                        :database_id (mt/id)
                                        :dataset_query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                                           (lib/join (-> (lib/join-clause (lib.metadata/table mp (mt/id :products))
                                                                                          [(lib/=
                                                                                            (lib.metadata/field mp (mt/id :orders :product_id))
                                                                                            (lib.metadata/field mp (mt/id :products :id)))])
                                                                         (lib/with-join-alias "Products")
                                                                         (lib/with-join-fields [(lib.metadata/field mp (mt/id :products :id))])))
                                                           (lib/with-fields [(lib.metadata/field mp (mt/id :orders :id))]))
                                        :result_metadata [{:name "ID"
                                                           :display_name "ID"
                                                           :base_type :type/BigInteger}
                                                          {:name "ID_2"
                                                           :display_name "IDX"
                                                           :base_type :type/BigInteger}]}
                     :model/Card q1 {:type :question
                                     :database_id (mt/id)
                                     :dataset_query (lib/query mp (lib.metadata/card mp (:id model)))}
                     :model/Card q2 {:type :question
                                     :database_id (mt/id)
                                     :dataset_query (lib/query mp (lib.metadata/card mp (:id q1)))}]
        (mt/as-admin
          (testing "/api/card/{id}/query"
            ;; These are defined in metabase.query-processor.card/process-query-for-card
            (testing "Model metadata works directly on model"
              (is (=? expected-columns
                      (mt/cols (run-query-for-card (:id model))))))
            (testing "Model metadata gets passed through to question on model"
              (is (=? expected-columns
                      (mt/cols (run-query-for-card (:id q1))))))
            (testing "Model metadata gets passed through to question on question on model"
              (is (=? expected-columns
                      (mt/cols (run-query-for-card (:id q2)))))))
          (testing "/api/dataset"
            ;; These are defined in metabase.query-processor.api/run-streaming-query
            (testing "Model metadata works directly on a model"
              (is (=? expected-columns
                      (:cols
                       (:data
                        (mt/user-http-request :rasta :post 202 "dataset" (lib/query mp (lib.metadata/card mp (:id model)))))))))
            (testing "Model metadata gets passed through to question on model"
              (is (=? expected-columns
                      (:cols (:data
                              (mt/user-http-request :crowberto :post 202 "dataset" (lib/query mp (lib.metadata/card mp (:id q1)))))))))
            (testing "Model metadata gets passed through to question on question on model"
              (is (=? expected-columns
                      (:cols (:data
                              (mt/user-http-request :crowberto :post 202 "dataset" (lib/query mp (lib.metadata/card mp (:id q2)))))))))))))))

;;; see also [[metabase.lib.field-test/model-self-join-test-display-name-test]]
(deftest ^:parallel model-self-join-test
  (testing "Field references from model joined a second time can be resolved (#48639)"
    (let [mp       (mt/metadata-provider)
          mp       (lib.tu/mock-metadata-provider
                    mp
                    {:cards [{:id            1
                              :dataset-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                                 ;; I guess this join is named `Reviews`
                                                 (lib/join (-> (lib/join-clause (lib.metadata/table mp (mt/id :reviews))
                                                                                [(lib/=
                                                                                  (lib.metadata/field mp (mt/id :products :id))
                                                                                  (lib.metadata/field mp (mt/id :reviews :product_id)))])
                                                               (lib/with-join-fields :all))))
                              :database-id   (mt/id)
                              :name          "Products+Reviews"
                              :type          :model}]})
          mp       (lib.tu/mock-metadata-provider
                    mp
                    {:cards [{:id            2
                              :dataset-query (binding [lib.metadata.calculation/*display-name-style* :long]
                                               (as-> (lib/query mp (lib.metadata/card mp 1)) $q
                                                 (lib/aggregate $q (lib/sum (->> $q
                                                                                 lib/available-aggregation-operators
                                                                                 (m/find-first (comp #{:sum} :short))
                                                                                 :columns
                                                                                 (m/find-first (comp #{"Price"} :display-name)))))
                                                 (lib/breakout $q (-> (m/find-first (comp #{"Reviews → Created At"} :display-name)
                                                                                    (lib/breakoutable-columns $q))
                                                                      (lib/with-temporal-bucket :month)))))
                              :database-id   (mt/id)
                              :name          "Products+Reviews Summary"
                              :type          :model}]})
          question (binding [lib.metadata.calculation/*display-name-style* :long]
                     (as-> (lib/query mp (lib.metadata/card mp 1)) $q
                       (lib/breakout $q (-> (m/find-first (comp #{"Reviews → Created At"} :display-name)
                                                          (lib/breakoutable-columns $q))
                                            (lib/with-temporal-bucket :month)))
                       (lib/aggregate $q (lib/avg (->> $q
                                                       lib/available-aggregation-operators
                                                       (m/find-first (comp #{:avg} :short))
                                                       :columns
                                                       (m/find-first (comp #{"Rating"} :display-name)))))
                       (lib/append-stage $q)
                       (letfn [(find-col [query display-name]
                                 (or (m/find-first #(= (:display-name %) display-name)
                                                   (lib/breakoutable-columns query))
                                     (throw (ex-info "Failed to find column with display name"
                                                     {:display-name display-name
                                                      :found        (map :display-name (lib/breakoutable-columns query))}))))]
                         (lib/join $q (-> (lib/join-clause (lib.metadata/card mp 2)
                                                           [(lib/=
                                                             (lib/with-temporal-bucket (find-col $q "Reviews → Created At: Month")
                                                               :month)
                                                             (lib/with-temporal-bucket (find-col
                                                                                        (lib/query mp (lib.metadata/card mp 2))
                                                                                        "Reviews → Created At: Month")
                                                               :month))])
                                          (lib/with-join-fields :all))))))]
      (is (= ["Reviews → Created At: Month"
              "Average of Rating"
              ;; the 'correct' display name here seems to change any time we touch anything. Some previous values:
              #_"Products+Reviews Summary - Reviews → Created At: Month → Reviews → Created At: Month"
              #_"Products+Reviews Summary - Reviews → Created At: Month → Created At"
              "Products+Reviews Summary - Reviews → Created At: Month → Created At: Month"
              "Products+Reviews Summary - Reviews → Created At: Month → Sum of Price"]
             (->> (qp/process-query question)
                  mt/cols
                  (mapv :display_name)))))))
