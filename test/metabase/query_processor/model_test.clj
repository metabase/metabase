(ns metabase.query-processor.model-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

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
