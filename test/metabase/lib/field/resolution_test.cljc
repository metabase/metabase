(ns metabase.lib.field.resolution-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.card :as lib.card]
   [metabase.lib.core :as lib]
   [metabase.lib.field :as lib.field]
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.result-metadata :as lib.metadata.result-metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.util.humanization :as u.humanization]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

;;; this is adapted from [[metabase.query-processor.preprocess-test/model-display-names-test]]; the `query` below is
;;; meant to look like the results of [[metabase.query-processor.preprocess/preprocess]] (what we will actually see
;;; in [[metabase.lib.metadata.result-metadata/expected-cols]])
(deftest ^:parallel model-display-names-test
  (testing "Preserve display names from models"
    (let [native-cols (for [col [{:name "EXAMPLE_TIMESTAMP", :base-type :type/DateTime}
                                 {:name "EXAMPLE_WEEK", :base-type :type/DateTime}]]
                        (assoc col :lib/type :metadata/column, :display-name (:name col)))
          mp (as-> meta/metadata-provider mp
               (lib.tu/mock-metadata-provider
                mp
                {:cards
                 [{:id              1
                   :name            "NATIVE"
                   :database-id     (meta/id)
                   :dataset-query   {:database (meta/id), :type :native, :native {:query "SELECT * FROM some_table;"}}
                   :result-metadata native-cols}]})
               ;; Card 2 is a model that uses the Card 1 (a native query) as a source
               (lib.tu/mock-metadata-provider
                mp
                {:cards
                 [(let [query (lib.tu.macros/mbql-query nil
                                {:fields [[:field "EXAMPLE_TIMESTAMP" {:base-type :type/DateTime}]
                                          [:field "EXAMPLE_WEEK" {:base-type :type/DateTime, :temporal-unit :week}]]
                                 :source-table "card__1"})]
                    {:id              2
                     :type            :model
                     :name            "MODEL"
                     :database-id     (meta/id)
                     :dataset-query   query
                     :result-metadata (for [col (lib.metadata.result-metadata/expected-cols (lib/query mp query))]
                                        (assoc col :display-name (u.humanization/name->human-readable-name :simple (:name col))))})]}))
          query {:lib/type     :mbql/query
                 :lib/metadata mp
                 :database     (meta/id)
                 :stages       [{:lib/type :mbql.stage/native
                                 :lib/stage-metadata {:lib/type :metadata/results
                                                      :columns (lib.card/card-metadata-columns mp (lib.metadata/card mp 1))}
                                 :native   "SELECT * FROM some_table;"
                                 ;; `:qp` and `:source-query` keys get added by QP middleware during preprocessing.
                                 :qp/stage-is-from-source-card 1}
                                {:lib/type :mbql.stage/mbql
                                 :lib/stage-metadata {:lib/type :metadata/results
                                                      :columns (lib.card/card-metadata-columns mp (lib.metadata/card mp 2))}
                                 :fields [[:field {:base-type :type/DateTime, :lib/uuid "48052020-59e3-47e7-bfdc-38ab12c27292"}
                                           "EXAMPLE_TIMESTAMP"]
                                          [:field {:base-type :type/DateTime, :temporal-unit :week, :lib/uuid "dd9bdda4-688c-4a14-8ff6-88d4e2de6628"}
                                           "EXAMPLE_WEEK"]]
                                 :qp/stage-had-source-card 1
                                 :qp/stage-is-from-source-card 2
                                 :source-query/model? false}
                                {:lib/type :mbql.stage/mbql
                                 :fields [[:field {:base-type :type/DateTime, :lib/uuid "40bb920d-d197-4ed2-ad2f-9400427b0c16"}
                                           "EXAMPLE_TIMESTAMP"]
                                          [:field {:base-type :type/DateTime, :inherited-temporal-unit :week, :lib/uuid "2b33e40b-3537-4126-aef0-96a7792d339b"}
                                           "EXAMPLE_WEEK"]]
                                 :qp/stage-had-source-card 2
                                 ;; i.e., the previous stage was from a model. Added
                                 ;; by [[metabase.query-processor.middleware.fetch-source-query/resolve-source-cards-in-stage]]]
                                 :source-query/model? true}]}]
      (testing `lib.field/previous-stage-and-model-metadata
        (is (= {:display-name "Example Timestamp"}
               (#'lib.field/previous-stage-and-model-metadata query -1 nil "EXAMPLE_TIMESTAMP"))))
      (let [field-ref (first (lib/fields query -1))]
        (is (=? [:field {:lib/uuid "40bb920d-d197-4ed2-ad2f-9400427b0c16"} "EXAMPLE_TIMESTAMP"]
                field-ref))
        (testing `lib.field.resolution/options-metadata*
          (is (=? {:lib/source-uuid "40bb920d-d197-4ed2-ad2f-9400427b0c16"}
                  (#'lib.field.resolution/options-metadata* field-ref))))
        (testing `lib.field.resolution/resolve-field-metadata
          (is (=? {:name            "EXAMPLE_TIMESTAMP"
                   :display-name    "Example Timestamp"
                   :lib/source-uuid "40bb920d-d197-4ed2-ad2f-9400427b0c16"}
                  (lib.field.resolution/resolve-field-metadata query -1 field-ref)))))
      (testing `lib/returned-columns
        (is (= ["Example Timestamp"
                ;; old `annotate` behavior would append the temporal unit to the display name here
                ;; even tho we explicitly overrode the display name in the model metadata. I don't
                ;; think that behavior is desirable. New behavior takes the display name specified
                ;; by the user as-is.
                "Example Week"
                #_"Example Week: Week"]
               (map :display-name (lib/returned-columns (lib/query mp query)))))))))
