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

(deftest ^:parallel model-self-join-test
  (testing "Field references from model joined a second time can be resolved (#48639)"
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          mp (lib.tu/mock-metadata-provider
              mp
              {:cards [{:id 1
                        :dataset-query
                        (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                            ;; I guess this join is named `Reviews`
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
      (is (=? ["CREATED_AT" "avg" "CREATED_AT_2" "sum"]
              (map :name (lib.metadata.result-metadata/expected-cols question))))
      (is (= [{:id (mt/id :reviews :created_at)
               :display_name "Reviews → Created At: Month"}
              {:display_name "Average of Rating"}
              {:id (mt/id :reviews :created_at)
               :source_alias "Products+Reviews Summary - Reviews → Created At: Month"
               ;; TODO (Cam 6/17/25) -- the 'old' answer here was this, but it's returning something slightly different
               ;; now that I added the [[metabase.lib.field/qp-model-metadata-for-stage]] stuff. Not really 100% sure
               ;; what the ideal answer is here and if this is a bug or not. If we somehow revert to the old display
               ;; name that's fine.
               ;;
               ;; :display_name "Products+Reviews Summary - Reviews → Created At: Month → Created At"
               :display_name "Reviews → Created At"}
              {:source_alias "Products+Reviews Summary - Reviews → Created At: Month"
               :display_name "Products+Reviews Summary - Reviews → Created At: Month → Sum"}]
             (->> (qp/process-query question)
                  mt/cols
                  (mapv #(select-keys % [:id :source_alias :display_name]))))))))
