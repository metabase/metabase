(ns metabase.driver.bigquery-test
  (:require [expectations :refer :all]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qptest]]
            [metabase.driver.bigquery :as bigquery]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor.interface :as qpi]
            [metabase.query-processor.middleware.expand :as ql]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :refer [expect-with-engine]]))

(def ^:private col-defaults
  {:remapped_to nil, :remapped_from nil})

;; Test native queries
(expect-with-engine :bigquery
  [[100]
   [99]]
  (get-in (qp/process-query
            {:native   {:query (str "SELECT `test_data.venues`.`id` "
                                    "FROM `test_data.venues` "
                                    "ORDER BY `test_data.venues`.`id` DESC "
                                    "LIMIT 2;")}
             :type     :native
             :database (data/id)})
          [:data :rows]))

;;; table-rows-sample
(expect-with-engine :bigquery
  [[1 "Red Medicine"]
   [2 "Stout Burgers & Beers"]
   [3 "The Apple Pan"]
   [4 "Wurstküche"]
   [5 "Brite Spot Family Restaurant"]]
  (->> (driver/table-rows-sample (Table (data/id :venues))
         [(Field (data/id :venues :id))
          (Field (data/id :venues :name))])
       (sort-by first)
       (take 5)))

;; make sure that BigQuery native queries maintain the column ordering specified in the SQL -- post-processing
;; ordering shouldn't apply (Issue #2821)
(expect-with-engine :bigquery
  {:columns ["venue_id" "user_id" "checkins_id"],
   :cols    (mapv #(merge col-defaults %)
                  [{:name "venue_id",    :display_name "Venue ID",    :base_type :type/Integer}
                   {:name "user_id",     :display_name  "User ID",    :base_type :type/Integer}
                   {:name "checkins_id", :display_name "Checkins ID", :base_type :type/Integer}])}

  (select-keys (:data (qp/process-query
                        {:native   {:query (str "SELECT `test_data.checkins`.`venue_id` AS `venue_id`, "
                                                "       `test_data.checkins`.`user_id` AS `user_id`, "
                                                "       `test_data.checkins`.`id` AS `checkins_id` "
                                                "FROM `test_data.checkins` "
                                                "LIMIT 2")}
                         :type     :native
                         :database (data/id)}))
               [:cols :columns]))

;; make sure that the bigquery driver can handle named columns with characters that aren't allowed in BQ itself
(expect-with-engine :bigquery
  {:rows    [[113]]
   :columns ["User_ID_Plus_Venue_ID"]}
  (qptest/rows+column-names
    (qp/process-query {:database (data/id)
                       :type     "query"
                       :query    {:source_table (data/id :checkins)
                                  :aggregation  [["named" ["max" ["+" ["field-id" (data/id :checkins :user_id)]
                                                                      ["field-id" (data/id :checkins :venue_id)]]]
                                                  "User ID Plus Venue ID"]]}})))

(defn- aggregation-names [query-map]
  (->> query-map
       :aggregation
       (map :custom-name)))

(defn- pre-alias-aggregations' [query-map]
  (binding [qpi/*driver* (driver/engine->driver :bigquery)]
    (aggregation-names (#'bigquery/pre-alias-aggregations query-map))))

(defn- agg-query-map [aggregations]
  (-> {}
      (ql/source-table 1)
      (ql/aggregation aggregations)))

;; make sure BigQuery can handle two aggregations with the same name (#4089)
(expect
  ["sum" "count" "sum_2" "avg" "sum_3" "min"]
  (pre-alias-aggregations' (agg-query-map [(ql/sum (ql/field-id 2))
                                           (ql/count (ql/field-id 2))
                                           (ql/sum (ql/field-id 2))
                                           (ql/avg (ql/field-id 2))
                                           (ql/sum (ql/field-id 2))
                                           (ql/min (ql/field-id 2))])))

(expect
  ["sum" "count" "sum_2" "avg" "sum_2_2" "min"]
  (pre-alias-aggregations' (agg-query-map [(ql/sum (ql/field-id 2))
                                           (ql/count (ql/field-id 2))
                                           (ql/sum (ql/field-id 2))
                                           (ql/avg (ql/field-id 2))
                                           (assoc (ql/sum (ql/field-id 2)) :custom-name "sum_2")
                                           (ql/min (ql/field-id 2))])))

(expect-with-engine :bigquery
  {:rows [[7929 7929]], :columns ["sum" "sum_2"]}
  (qptest/rows+column-names
    (qp/process-query {:database (data/id)
                       :type     "query"
                       :query    (-> {}
                                     (ql/source-table (data/id :checkins))
                                     (ql/aggregation (ql/sum (ql/field-id (data/id :checkins :user_id)))
                                                     (ql/sum (ql/field-id (data/id :checkins :user_id)))))})))

(expect-with-engine :bigquery
  {:rows [[7929 7929 7929]], :columns ["sum" "sum_2" "sum_3"]}
  (qptest/rows+column-names
    (qp/process-query {:database (data/id)
                       :type     "query"
                       :query    (-> {}
                                     (ql/source-table (data/id :checkins))
                                     (ql/aggregation (ql/sum (ql/field-id (data/id :checkins :user_id)))
                                                     (ql/sum (ql/field-id (data/id :checkins :user_id)))
                                                     (ql/sum (ql/field-id (data/id :checkins :user_id)))))})))

(expect-with-engine :bigquery
  "UTC"
  (tu/db-timezone-id))


;; make sure that BigQuery properly aliases the names generated for Join Tables. It's important to use the right
;; alias, e.g. something like `categories__via__category_id`, which is considerably different from what other SQL
;; databases do. (#4218)
(expect-with-engine :bigquery
  (str "SELECT count(*) AS `count`,"
       " `test_data.categories__via__category_id`.`name` AS `categories__via__category_id___name` "
       "FROM `test_data.venues` "
       "LEFT JOIN `test_data.categories` `test_data.categories__via__category_id`"
       " ON `test_data.venues`.`category_id` = `test_data.categories__via__category_id`.`id` "
       "GROUP BY `categories__via__category_id___name` "
       "ORDER BY `categories__via__category_id___name` ASC")
  ;; normally for test purposes BigQuery doesn't support foreign keys so override the function that checks that and
  ;; make it return `true` so this test proceeds as expected
  (with-redefs [qpi/driver-supports? (constantly true)]
    (tu/with-temp-vals-in-db 'Field (data/id :venues :category_id) {:fk_target_field_id (data/id :categories :id)
                                                                    :special_type       "type/FK"}
      (let [results (qp/process-query
                     {:database (data/id)
                      :type     "query"
                      :query    {:source-table (data/id :venues)
                                 :aggregation  [:count]
                                 :breakout     [[:fk-> (data/id :venues :category_id) (data/id :categories :name)]]}})]
        (get-in results [:data :native_form :query] results)))))

;; Make sure the BigQueryIdentifier class works as expected
(expect
  ["SELECT `dataset.table`.`field`"]
  (hsql/format {:select [(#'bigquery/map->BigQueryIdentifier
                          {:dataset-name "dataset", :table-name "table", :field-name "field"})]}))

(expect
  ["SELECT `dataset.table`"]
  (hsql/format {:select [(#'bigquery/map->BigQueryIdentifier {:dataset-name "dataset", :table-name "table"})]}))
