(ns metabase.lib.card-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util :as u]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

(comment lib/keep-me)

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel source-card-infer-metadata-test
  (testing "We should be able to calculate metadata for a Saved Question missing results_metadata"
    (let [query (lib.tu/query-with-card-source-table)]
      (is (=? [{:id                       (meta/id :checkins :user-id)
                :name                     "USER_ID"
                :lib/source               :source/card
                :lib/source-column-alias  "USER_ID"
                :lib/desired-column-alias "USER_ID"}
               {:name                     "count"
                :lib/source               :source/card
                :lib/source-column-alias  "count"
                :lib/desired-column-alias "count"}]
              (lib.metadata.calculation/metadata query)))
      (testing `lib/display-info
        (is (=? [{:name                   "USER_ID"
                  :display_name           "User ID"
                  :table                  {:name         "My Card"
                                           :display_name "My Card"}
                  :effective_type         :type/Integer
                  :semantic_type          :type/FK
                  :is_calculated          false
                  :is_from_previous_stage false
                  :is_implicitly_joinable false
                  :is_from_join           false}
                 {:name                   "count"
                  :display_name           "Count"
                  :table                  {:name         "My Card"
                                           :display_name "My Card"}
                  :effective_type         :type/Integer
                  :is_from_previous_stage false
                  :is_from_join           false
                  :is_calculated          false
                  :is_implicitly_joinable false}]
                (for [col (lib.metadata.calculation/metadata query)]
                  (lib/display-info query col))))))))

(deftest ^:parallel card-source-query-metadata-test
  (doseq [metadata [{:id              1
                     :name            "My Card"
                     :result_metadata meta/results-metadata}
                    ;; in some cases the FE is transforming the metadata like this, not sure why but handle it anyway
                    ;; (#29739)
                    {:id     1
                     :name   "My Card"
                     :fields (:columns meta/results-metadata)}]]
    (testing (str "metadata = \n" (u/pprint-to-str metadata))
      (let [query {:lib/type     :mbql/query
                   :lib/metadata (lib.tu/mock-metadata-provider
                                  {:cards [metadata]})
                   :database     (meta/id)
                   :stages       [{:lib/type     :mbql.stage/mbql
                                   :lib/options  {:lib/uuid (str (random-uuid))}
                                   :source-table "card__1"}]}]
        (is (=? (for [col (:columns meta/results-metadata)]
                  (assoc col :lib/source :source/card))
                (lib.metadata.calculation/metadata query)))))))

(deftest ^:parallel card-results-metadata-merge-metadata-provider-metadata-test
  (testing "Merge metadata from the metadata provider into result_metadata (#30046)"
    (let [query (lib.tu/query-with-card-source-table-with-result-metadata)]
      (is (=? [{:lib/type                 :metadata/field
                :id                       (meta/id :checkins :user-id)
                :table_id                 (meta/id :checkins)
                :semantic_type            :type/FK
                ;; this comes from the metadata provider, it's not present in `result_metadata`
                :fk_target_field_id       (meta/id :users :id)
                :lib/desired-column-alias "USER_ID"}
               {:lib/type :metadata/field
                :name     "count"}]
              (lib.metadata.calculation/metadata query))))))
