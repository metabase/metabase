(ns metabase.query-processor-test.parameters_test
  "Tests for query parameters."
  (:require [expectations :refer [expect]]
            [metabase
             [query-processor :as qp]
             [query-processor-test :refer :all]]
            [metabase.query-processor.middleware.expand :as ql]
            [metabase.test.data :as data]))

(expect-with-non-timeseries-dbs
  [[9 "Nils Gotam"]]
  (format-rows-by [int str]
    (let [inner-query (data/query users
                        (ql/aggregation (ql/rows)))
          outer-query (data/wrap-inner-query inner-query)
          outer-query (assoc outer-query :parameters [{:name "id", :type "id", :target ["field-id" (data/id :users :id)], :value 9}])]
      (rows (qp/process-query outer-query)))))


(expect-with-non-timeseries-dbs
  [[6]]
  (format-rows-by [int]
    (let [inner-query (data/query venues
                        (ql/aggregation (ql/count)))
          outer-query (data/wrap-inner-query inner-query)
          outer-query (assoc outer-query :parameters [{:name "price", :type "category", :target ["field-id" (data/id :venues :price)], :value 4}])]
      (rows (qp/process-query outer-query)))))

;; Make sure using commas in numeric params treats them as separate IDs (#5457)
(expect
  "SELECT * FROM USERS where id IN (1, 2, 3)"
  (-> (qp/process-query
        {:database   (data/id)
         :type       "native"
         :native     {:query         "SELECT * FROM USERS [[where id IN ({{ids_list}})]]"
                      :template_tags {:ids_list {:name         "ids_list"
                                                 :display_name "Ids list"
                                                 :type         "number"}}}
         :parameters [{:type   "category"
                       :target ["variable" ["template-tag" "ids_list"]]
                       :value  "1,2,3"}]})
      :data :native_form :query))
