(ns metabase.lib.card-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

(comment lib/keep-me)

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel source-card-infer-metadata-test
  (testing "We should be able to calculate metadata for a Saved Question missing results_metadata"
    (let [card-1            {:name          "My Card"
                             :id            1
                             :dataset_query {:database (meta/id)
                                             :type     :query
                                             :query    {:source-table (meta/id :checkins)
                                                        :aggregation  [[:count]]
                                                        :breakout     [[:field (meta/id :checkins :user-id) nil]]}}}
          metadata-provider (lib.tu/composed-metadata-provider
                             meta/metadata-provider
                             (lib.tu/mock-metadata-provider
                              {:cards [card-1]}))
          query             {:lib/type     :mbql/query
                             :lib/metadata metadata-provider
                             :database     (meta/id)
                             :type         :pipeline
                             :stages       [{:lib/type     :mbql.stage/mbql
                                             :source-table "card__1"}]}]
      (is (=? [{:id                       (meta/id :checkins :user-id)
                :name                     "USER_ID"
                :lib/source               :source/card
                :lib/source-column-alias  "USER_ID"
                :lib/desired-column-alias "USER_ID"}
               {:name                     "count"
                :lib/source               :source/card
                :lib/source-column-alias  "count"
                :lib/desired-column-alias "count"}]
              (map #(select-keys % [:id :name :lib/source :lib/source-column-alias :lib/desired-column-alias])
                   (lib.metadata.calculation/metadata query)))))))
