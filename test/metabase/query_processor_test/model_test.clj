(ns metabase.query-processor-test.model-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
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
                                             (lib/with-temporal-bucket :month))))
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
                         (lib/join $q (-> (lib/join-clause (lib.metadata/card mp (:id consumer-model))
                                                           [(lib/=
                                                             (-> (m/find-first (comp #{"Reviews → Created At: Month"} :display-name)
                                                                               (lib/breakoutable-columns $q))
                                                                 (lib/with-temporal-bucket :month))
                                                             (-> (m/find-first (comp #{"Reviews → Created At: Month"} :display-name)
                                                                               (lib/breakoutable-columns
                                                                                (lib/query mp (lib.metadata/card mp (:id consumer-model)))))
                                                                 (lib/with-temporal-bucket :month)))])
                                          (lib/with-join-fields :all))))]
          (is (= ["Reviews → Created At: Month"
                  "Average of Rating"
                  "Products+Reviews Summary - Reviews → Created At: Month → Created At"
                  "Products+Reviews Summary - Reviews → Created At: Month → Sum"]
                 (->> (qp/process-query question)
                      mt/cols
                      (mapv :display_name)))))))))
