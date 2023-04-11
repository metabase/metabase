(ns metabase.lib.table-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel join-table-metadata-test
  (testing "You should be able to pass :metadata/table to lib/join"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/join (-> (lib/table (meta/id :categories))
                                  (lib/with-join-alias "Cat")
                                  (lib/with-join-fields :all))
                              [(lib/= (lib/field (meta/id :venues :category-id))
                                      (-> (lib/field (meta/id :categories :id))
                                          (lib/with-join-alias "Cat")))]))]
      (is (=? {:stages [{:joins
                         [{:stages     [{}]
                           :alias      "Cat"
                           :fields     :all
                           :conditions [[:=
                                         {}
                                         [:field {} (meta/id :venues :category-id)]
                                         [:field {:join-alias "Cat"} (meta/id :categories :id)]]]}]}]}
              query)))))
