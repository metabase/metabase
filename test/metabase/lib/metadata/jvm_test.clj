(ns metabase.lib.metadata.jvm-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.test :as mt]))

(deftest ^:parallel fetch-field-test
  (let [field (#'lib.metadata.jvm/fetch-instance :metadata/field (mt/id :categories :id))]
    (is (not (me/humanize (mc/validate lib.metadata/ColumnMetadata field))))))

(deftest ^:parallel saved-question-metadata-test
  (let [card  {:dataset-query {:database (mt/id)
                               :type     :query
                               :query    {:source-table (mt/id :venues)
                                          :joins        [{:fields       :all
                                                          :source-table (mt/id :categories)
                                                          :condition    [:=
                                                                         [:field (mt/id :venues :category_id) nil]
                                                                         [:field (mt/id :categories :id) {:join-alias "Cat"}]]
                                                          :alias        "Cat"}]}}}
        query (lib/saved-question-query
               (lib.metadata.jvm/application-database-metadata-provider (mt/id))
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
