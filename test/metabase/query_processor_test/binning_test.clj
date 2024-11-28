(ns metabase.query-processor-test.binning-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(deftest ^:parallel binning-in-result-cols-display-name-test
  (doseq [[table-key field-key binning-name expected-display-name]
          [[:orders :tax "50 bins" "Tax: 50 bins"]
           [:venues :longitude "Bin every 1 degree" "Longitude: 1°"]]]
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          query (as-> (lib/query mp (lib.metadata/table mp (mt/id table-key))) $
                  (lib/aggregate $ (lib/count))
                  (lib/breakout $ (lib/with-binning (lib.metadata/field mp (mt/id table-key field-key))
                                                    (m/find-first (comp #{binning-name} :display-name)
                                                                  (lib/available-binning-strategies
                                                                   $
                                                                   (lib.metadata/field mp (mt/id table-key field-key)))))))]
      (testing "Binning is suffixed to columns display name"
        (is expected-display-name
            (-> (qp/process-query query) mt/cols first :display_name)))
      (testing "Binning is visible on cards"
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib.convert/->legacy-MBQL query)}]
          (is expected-display-name
              (qp/process-query (lib/query mp (lib.metadata/card mp card-id)))))))))
