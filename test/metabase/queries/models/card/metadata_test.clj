(ns metabase.queries.models.card.metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.test :as mt]))

(deftest ^:parallel populate-result-metadata-normalize-output-test
  (testing "populate-result-metadata should normalize output"
    (let [card {:result_metadata [{:database_type             "BIGINT"
                                   :semantic_type             "type/PK"
                                   :table_id                  10806
                                   :lib/deduplicated-name     "ID"
                                   :lib/original-name         "ID"
                                   :name                      "ID"
                                   :lib/source-column-alias   "ID"
                                   :lib/original-display-name "ID"
                                   :source                    "fields"
                                   :field_ref                 ["field" 61327 nil]
                                   :effective_type            "type/BigInteger"
                                   :active                    true
                                   :id                        61327
                                   :lib/desired-column-alias  "ID"
                                   :position                  0
                                   :visibility_type           "normal"
                                   :display_name              "EDITED DISPLAY"
                                   :base_type                 "type/BigInteger"}]}]
      (is (=? {:result_metadata [{:database_type             "BIGINT"
                                  :semantic_type             :type/PK
                                  :table_id                  10806
                                  :lib/deduplicated-name     "ID"
                                  :lib/original-name         "ID"
                                  :name                      "ID"
                                  :lib/source-column-alias   "ID"
                                  :lib/original-display-name "ID"
                                  :source                    :fields
                                  :field_ref                 [:field 61327 nil]
                                  :effective_type            :type/BigInteger
                                  :active                    true
                                  :id                        61327
                                  :lib/desired-column-alias  "ID"
                                  :position                  0
                                  :visibility_type           :normal
                                  :display_name              "EDITED DISPLAY"
                                  :base_type                 :type/BigInteger}]}
              (card.metadata/populate-result-metadata card))))))

(deftest ^:parallel infer-metadata-no-remaps
  (testing "infer-metadata should not include remapped columns (#67128)"
    (mt/with-temp [:model/Dimension _ {:field_id                (mt/id :orders :user_id)
                                       :name                    "User ID"
                                       :human_readable_field_id (mt/id :people :name)
                                       :type                    :external}
                   :model/Dimension _ {:field_id                (mt/id :orders :product_id)
                                       :name                    "Product ID"
                                       :human_readable_field_id (mt/id :products :title)
                                       :type                    :external}]
      (let [mp (mt/metadata-provider)
            query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
        (is (= 9 ;; there are two remaps, giving 11 if included
               (count (card.metadata/infer-metadata query))))))))
