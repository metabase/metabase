(ns metabase.driver.sparksql-test
  (:require [expectations :refer :all]
            [metabase.driver.sql.query-processor :as sql.qp]))

;; Make sure our custom implementation of `apply-page` works the way we'd expect
(expect
  {:select ["name" "id"]
   :from   [{:select   [[:default.categories.name "name"]
                        [:default.categories.id "id"]
                        [{:s "row_number() OVER (ORDER BY `default`.`categories`.`id` ASC)"} :__rownum__]]
             :from     [:default.categories]
             :order-by [[:default.categories.id :asc]]}]
   :where  [:> :__rownum__ 5]
   :limit  5}
  (sql.qp/apply-top-level-clause :sparksql :page
    {:select [[:default.categories.name "name"] [:default.categories.id "id"]]
     :from     [:default.categories]
     :order-by [[:default.categories.id :asc]]}
    {:page {:page  2
            :items 5}}))
