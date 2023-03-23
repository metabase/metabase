(ns metabase.api.metabot-test
  (:require [clojure.core.async :as a]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.api.common :as api]
            [metabase.db.query :as mdb.query]
            [metabase.models :refer [Card Collection Database Field Metric Table]]
            [metabase.query-processor.async :as qp.async]
            [metabase.test :as mt]
            [toucan2.core :as t2]))

(deftest metabot-only-works-on-models-test
  (testing "POST /api/metabot/model/:model-id"
    (mt/dataset sample-dataset
      (let [q        "At what time was the status closed for each user?"
            response (mt/user-http-request :rasta :post 404
                                           (format "/metabot/model/%s" (mt/id :people))
                                           {:question q})]
        (is (= "Not found." response))))))

(defn- result-metadata-for-query [query]
  (first
   (a/alts!!
    [(qp.async/result-metadata-for-query-async query)
     (a/timeout 1000)])))

(deftest simple-echo-test
  (testing "POST /api/metabot/model"
    (mt/dataset sample-dataset
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [source-query {:database (mt/id)
                            :type     :query
                            :query    (mt/$ids
                                       {:source-table $$orders
                                        :joins        [{:fields       [&u.people.state
                                                                       &u.people.longitude
                                                                       &u.people.latitude]
                                                        :source-table $$people
                                                        :condition    [:= $orders.user_id &u.people.id]}
                                                       {:fields       [&u.products.price]
                                                        :source-table $$products
                                                        :condition    [:= $orders.product_id &u.products.id]}]
                                        :fields       [$orders.created_at]})}]
          (mt/with-temp* [Collection [{collection-id :id}]
                          Card [{model-id :id} {:table_id        (mt/id :products)
                                                :collection_id   collection-id
                                                :dataset_query   source-query
                                                :result_metadata (mt/with-test-user
                                                                   :rasta
                                                                   (result-metadata-for-query
                                                                    source-query))
                                                :dataset         true}]]
            (let [q "At what time was the status closed for each user?"
                  {:keys [original_question
                          assertions
                          sql_query
                          database_id
                          id
                          suggested_visualization]
                   :as   response} (mt/user-http-request
                                    :rasta
                                    :post
                                    200
                                    (format "/metabot/model/%s" model-id)
                                    {:question q
                                     :fake     true})]
              (is (= original_question q))
              (is (seq? assertions))
              (is (= "SELECT * FROM THIS IS FAKE TO NOT BURN CREDITS" sql_query))
              (is (= (mt/id) database_id))
              (is (= model-id id))
              (is (map? suggested_visualization)))))))))

(comment
  ;; The following are example based and assume you have a model locally with the given id
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user*                 (delay (t2/select-one 'User :id 1))]
    (mt/user-http-request
     :rasta :post 200 (format "/metabot/model/%s" 1036)
     {:question     "What is the total price of all purchases in the state of CA?"}))

  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user*                 (delay (t2/select-one 'User :id 1))]
    (mt/user-http-request
     :rasta :post 200 (format "/metabot/model/%s" 1036)
     {:question     "What is the average rating of items in the mountain west?"}))

  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user*                 (delay (t2/select-one 'User :id 1))]
    (mt/user-http-request
     :rasta :post 200 (format "/metabot/model/%s" 1036)
     {:question     "What is the average rating of items in the mountain west?"}))

  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user*                 (delay (t2/select-one 'User :id 1))]
    (mt/user-http-request
     :rasta :post 200 (format "/metabot/model/%s" 1036)
     {:question     "In which states do Doohickeys sell the best?"}))

  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user*                 (delay (t2/select-one 'User :id 1))]
    (mt/user-http-request
     :rasta :post 200 (format "/metabot/model/%s" 1036)
     {:question     "How do I correlate source to high ratings?"}))
  )

(def example-response
  "To correlate 'SOURCE' to 'RATING', you can use the following SQL query:

 ```
 SELECT SOURCE, AVG(RATING) as AVERAGE_RATING
 FROM `My Model 2`
 GROUP BY SOURCE
 ORDER BY AVERAGE_RATING DESC
 ```

 This will group the data by SOURCE and calculate the average rating for each one. The results will be ordered in descending order based on the average rating, which will help you identify which SOURCE has the highest rating.")


;(let [[_pre sql _post] (str/split example-response #"```")]
;  (mdb.query/format-sql sql))
