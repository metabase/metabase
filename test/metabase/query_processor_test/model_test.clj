(ns metabase.query-processor-test.model-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.result-metadata :as lib.metadata.result-metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

;;; see also [[metabase.query-processor.util.add-alias-info-test/model-duplicate-joins-test]]
(deftest ^:parallel model-self-join-test
  (testing "Field references from model joined a second time can be resolved (#48639)"
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          mp (lib.tu/mock-metadata-provider
              mp
              ;; card 1 has all columns from products and all columns from reviews
              {:cards [{:id 1
                        :dataset-query
                        (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                            (lib/join (-> (lib/join-clause (lib.metadata/table mp (mt/id :reviews))
                                                           [(lib/=
                                                             (lib.metadata/field mp (mt/id :products :id))
                                                             (lib.metadata/field mp (mt/id :reviews :product_id)))])
                                          (lib/with-join-fields :all)))
                            lib.convert/->legacy-MBQL)
                        :database-id (mt/id)
                        :name "Products+Reviews"
                        :type :model}]})
          mp (lib.tu/mock-metadata-provider
              mp
              ;; card 2 uses card 1 as a source and returns sum(venues.price) and month(reviews.created-at)
              {:cards [{:id 2
                        :dataset-query
                        (binding [lib.metadata.calculation/*display-name-style* :long]
                          (as-> (lib/query mp (lib.metadata/card mp 1)) $q
                            (lib/aggregate $q (lib/sum (->> $q
                                                            lib/available-aggregation-operators
                                                            (m/find-first (comp #{:sum} :short))
                                                            :columns
                                                            (m/find-first (comp #{"Price"} :display-name)))))
                            (lib/breakout $q (-> (m/find-first (comp #{"Reviews → Created At"} :display-name)
                                                               (lib/breakoutable-columns $q))
                                                 (lib/with-temporal-bucket :month)))
                            (lib.convert/->legacy-MBQL $q)))
                        :database-id (mt/id)
                        :name "Products+Reviews Summary"
                        :type :model}]})
          ;; question uses card 1 as a source and returns sum(venues.price) and month(reviews.created-at), the joins
          ;; card 2 and includes those same columns from card 2.
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
                                                      :found       (map :display-name (lib/breakoutable-columns query))}))))]
                         (lib/join $q (-> (lib/join-clause (lib.metadata/card mp 2)
                                                           [(lib/=
                                                             (lib/with-temporal-bucket (find-col $q "Reviews → Created At: Month")
                                                               :month)
                                                             (lib/with-temporal-bucket (find-col
                                                                                        (lib/query mp (lib.metadata/card mp 2))
                                                                                        "Reviews → Created At: Month")
                                                               :month))])
                                          (lib/with-join-fields :all))))))]
      ;; the first two columns are from Stage 0 => Card 1 => Breakout + Aggregation.
      ;;
      ;; the second two columns are from Stage 1 => Joins => Card 2 => Breakout + Aggregation
      (is (=? [{:name         "CREATED_AT"
                :field-ref    [:field "Reviews__CREATED_AT" {:base-type :type/DateTimeWithLocalTZ, :temporal-unit :month}]
                :display-name "Reviews → Created At: Month"}
               {:name         "avg"
                :field-ref    [:field "avg" {:base-type :type/Float}]
                :display-name "Average of Rating"}
               {:name         "CREATED_AT_2"
                :field-ref    [:field "Reviews__CREATED_AT" {:base-type :type/DateTimeWithLocalTZ, :temporal-unit :month}]
                :display-name "Products+Reviews Summary - Reviews → Created At: Month"}
               {:name         "sum"
                :field-ref    [:field "sum" {:base-type :type/Float, :join-alias "Products+Reviews Summary - Reviews → Created At: Month"}]
                :display-name "Products+Reviews Summary - Reviews → Created At: Month → Sum of Price"}]
              (lib.metadata.result-metadata/expected-cols question)))
      (is (= ["Reviews → Created At: Month"
              "Average of Rating"
              ;; TODO (Cam 6/16/25) -- not sure what the actual good display name here should be, but I don't think
              ;; either one of these looks quite right. The commented out version is old legacy `annotate` behavior, and
              ;; the new one is the one calculated by [[metabase.lib.metadata.result-metadata]].
              #_"Products+Reviews Summary - Reviews → Created At: Month → Reviews → Created At: Month"
              "Products+Reviews Summary - Reviews → Created At: Month → Created At"
              "Products+Reviews Summary - Reviews → Created At: Month → Sum"]
             (->> (qp/process-query question)
                  mt/cols
                  (mapv :display_name)))))))
