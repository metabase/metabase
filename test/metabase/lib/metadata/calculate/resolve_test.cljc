(ns metabase.lib.metadata.calculate.resolve-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.metadata.calculate.resolve :as calculate.resolve]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel resolve-join-test
  (let [join  {:lib/type    :mbql/join
               :lib/options {:lib/uuid "490a5abb-54c2-4e62-9196-7e9e99e8d291"}
               :alias       "CATEGORIES__via__CATEGORY_ID"
               :condition   [:=
                             {:lib/uuid "cc5f6c43-1acb-49c2-aeb5-e3ff9c70541f"}
                             [:field
                              {:lib/uuid "0fd96757-ce97-40c3-9810-3f3ad82cd888"}
                              (meta/id :venues :category-id)]
                             [:field
                              {:lib/uuid   "916bbcfe-7595-4954-8990-aa026e641141"
                               :join-alias "CATEGORIES__via__CATEGORY_ID"}
                              (meta/id :categories :id)]]
               :strategy    :left-join
               :fk-field-id (meta/id :venues :category-id)
               :stages      [{:lib/type     :mbql.stage/mbql
                              :lib/options  {:lib/uuid "bbbae500-c972-4550-b100-e0584eb72c4d"}
                              :source-table (meta/id :categories)}]}
        query {:lib/type     :mbql/query
               :type         :pipeline
               :stages       [{:lib/type     :mbql.stage/mbql
                               :lib/options  {:lib/uuid "fdcfaa06-8e65-471d-be5a-f1e821022482"}
                               :source-table (meta/id :venues)
                               :fields       [[:field
                                               {:join-alias "CATEGORIES__via__CATEGORY_ID"
                                                :lib/uuid   "8704e09b-496e-4045-8148-1eef28e96b51"}
                                               (meta/id :categories :name)]]
                               :joins        [join]}]
               :database     (meta/id)
               :lib/metadata meta/metadata-provider}]
    (is (= join
           (calculate.resolve/join query -1 "CATEGORIES__via__CATEGORY_ID")))))
