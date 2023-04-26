(ns metabase.lib.metadata.jvm-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.jvm :as sut]
   [metabase.test :as mt]))

(deftest ^:parallel saved-question-metadata-test
  (let [card  {:dataset_query {:database (mt/id)
                               :type     :query
                               :query    {:source-table (mt/id :venues)
                                          :joins        [{:fields       :all
                                                          :source-table (mt/id :categories)
                                                          :condition    [:=
                                                                         [:field (mt/id :venues :category_id) nil]
                                                                         [:field (mt/id :categories :id) {:join-alias "Cat"}]]
                                                          :alias        "Cat"}]}}}
        query (lib/saved-question-query
               (metabase.lib.metadata.jvm/application-database-metadata-provider (mt/id))
               card)]
    (is (=? [{:lib/desired-column-alias "ID"}
             {:lib/desired-column-alias "NAME"}
             {:lib/desired-column-alias "CATEGORY_ID"}
             {:lib/desired-column-alias "LATITUDE"}
             {:lib/desired-column-alias "LONGITUDE"}
             {:lib/desired-column-alias "PRICE"}
             {:lib/desired-column-alias "Cat__ID"}
             {:lib/desired-column-alias "Cat__NAME"}]
            (lib.metadata.calculation/metadata query)))))
