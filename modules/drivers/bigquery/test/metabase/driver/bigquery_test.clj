(ns metabase.driver.bigquery-test
  (:require [clojure.test :refer :all]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :as datasets]))

(deftest table-rows-sample-test
  (datasets/test-driver :bigquery
    (is (= [[1 "Red Medicine"]
            [2 "Stout Burgers & Beers"]
            [3 "The Apple Pan"]
            [4 "Wurstküche"]
            [5 "Brite Spot Family Restaurant"]]
           (->> (metadata-queries/table-rows-sample (Table (data/id :venues))
                  [(Field (data/id :venues :id))
                   (Field (data/id :venues :name))])
                (sort-by first)
                (take 5))))))

(deftest db-timezone-id-test
  (datasets/test-driver :bigquery
    (is (= "UTC"
           (tu/db-timezone-id)))))
