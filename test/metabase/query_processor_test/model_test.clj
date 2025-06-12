(ns metabase.query-processor-test.model-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(deftest ^:parallel model-self-join-test
  (testing "Field references from model joined a second time can be resolved (#48639)"
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
      (mt/with-temp [:model/Card base-model
                     {:dataset_query
                      (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                          (lib/join (-> (lib/join-clause (lib.metadata/table mp (mt/id :reviews))
                                                         [(lib/=
                                                           (lib.metadata/field mp (mt/id :products :id))
                                                           (lib.metadata/field mp (mt/id :reviews :product_id)))])
                                        (lib/with-join-fields :all)))
                          lib.convert/->legacy-MBQL)
                      :database_id (mt/id)
                      :name "Products+Reviews"
                      :type :model}
                     :model/Card consumer-model
                     {:dataset_query
                      (as-> (lib/query mp (lib.metadata/card mp (:id base-model))) $q
                        (lib/aggregate $q (lib/sum (->> $q
                                                        lib/available-aggregation-operators
                                                        (m/find-first (comp #{:sum} :short))
                                                        :columns
                                                        (m/find-first (comp #{"Price"} :display-name)))))
                        (lib/breakout $q (-> (m/find-first (comp #{"Reviews → Created At"} :display-name)
                                                           (lib/breakoutable-columns $q))
                                             (lib/with-temporal-bucket :month)))
                        (lib.convert/->legacy-MBQL $q))
                      :database_id (mt/id)
                      :name "Products+Reviews Summary"
                      :type :model}]
        (let [question (as-> (lib/query mp (lib.metadata/card mp (:id base-model))) $q
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
                                                        :found       (map :display-name (lib/breakoutable-columns query))}))))]
                           (lib/join $q (-> (lib/join-clause (lib.metadata/card mp (:id consumer-model))
                                                             [(lib/=
                                                               (lib/with-temporal-bucket (find-col $q "Reviews → Created At: Month")
                                                                 :month)
                                                               (lib/with-temporal-bucket (find-col
                                                                                          (lib/query mp (lib.metadata/card mp (:id consumer-model)))
                                                                                          "Reviews → Created At: Month")
                                                                 :month))])
                                            (lib/with-join-fields :all))))
                         (lib/->legacy-MBQL $q))]
          (is (= ["Reviews → Created At: Month"
                  "Average of Rating"
                  "Products+Reviews Summary - Reviews → Created At: Month → Reviews → Created At: Month"
                  "Products+Reviews Summary - Reviews → Created At: Month → Sum"]
                 (->> (qp/process-query question)
                      mt/cols
                      (mapv :display_name)))))))))
