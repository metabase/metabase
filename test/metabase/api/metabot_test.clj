(ns metabase.api.metabot-test
  (:require [clojure.core.async :as a]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.api.common :as api]
            [metabase.api.metabot :as metabot]
            [metabase.db.query :as mdb.query]
            [metabase.models :refer [Card Collection Database Field Metric Table]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.async :as qp.async]
            [metabase.test :as mt]
            [metabase.util :as u]
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
     {:question "What is the total price of all purchases in the state of CA?"}))

  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user*                 (delay (t2/select-one 'User :id 1))]
    (mt/user-http-request
     :rasta :post 200 (format "/metabot/model/%s" 1036)
     {:question "What is the average rating of items in the mountain west?"}))

  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user*                 (delay (t2/select-one 'User :id 1))]
    (mt/user-http-request
     :rasta :post 200 (format "/metabot/model/%s" 1036)
     {:question "What is the average rating of items in the mountain west?"}))

  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user*                 (delay (t2/select-one 'User :id 1))]
    (mt/user-http-request
     :rasta :post 200 (format "/metabot/model/%s" 1036)
     {:question "In which states do Doohickeys sell the best?"}))

  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user*                 (delay (t2/select-one 'User :id 1))]
    (mt/user-http-request
     :rasta :post 200 (format "/metabot/model/%s" 1036)
     {:question "How do I correlate source to high ratings?"}))

  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user*                 (delay (t2/select-one 'User :id 1))]
    (mt/user-http-request
     :rasta :post 200 (format "/metabot/model/%s" 1036)
     {:question "Show me all of my data"}))

  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user*                 (delay (t2/select-one 'User :id 1))]
    (mt/user-http-request
     :rasta :post 200 (format "/metabot/model/%s" 1036)
     {:question "Show me all of my data in CA"}))
  )

(comment
  (def example-response
    "To correlate 'SOURCE' to 'RATING', you can use the following SQL query:

   ```
   SELECT SOURCE, AVG(RATING) as AVERAGE_RATING
   FROM \"My Model 2\"
   GROUP BY SOURCE
   ORDER BY AVERAGE_RATING DESC
   ```

   This will group the data by SOURCE and calculate the average rating for each one. The results will be ordered in descending order based on the average rating, which will help you identify which SOURCE has the highest rating.")

  (metabot/extract-sql
   "The SQL query to find the total price of all purchases in the state of CA would be:\n\n```SQL\nSELECT SUM(PRICE) as total_price\nFROM \"My Model 2\"\nWHERE STATE = 'CA';\n```")

  (t2/select-one Card :id 1036)

  (t2/select-one Field :id 57)

  (str/replace (u/slugify (:name (t2/select-one Card :id 1036))) #"_" "-")

  (->> (let [{:keys [dataset_query]} (t2/select-one Card :id 1036)
             {:keys [query]} dataset_query
             {:keys [joins]} query]
         (for [{:keys [alias fields] :as join} joins
               [_ field] fields
               :let [field-name (:name (t2/select-one [Field :name] :id field))]]
           [field-name (format "%s__%s" alias field-name)]))
       (sort-by (comp - count first))))

(comment
  (def x "SELECT \"PUBLIC\".\"ORDERS\".\"ID\" AS \"ID\",\n       \"PUBLIC\".\"ORDERS\".\"TOTAL\" AS \"TOTAL\",\n       \"PUBLIC\".\"ORDERS\".\"CREATED_AT\" AS \"CREATED_AT\",\n       \"People - User\".\"LONGITUDE\" AS \"People - User__LONGITUDE\",\n       \"People - User\".\"STATE\" AS \"People - User__STATE\",\n       \"People - User\".\"SOURCE\" AS \"People - User__SOURCE\",\n       \"People - User\".\"LATITUDE\" AS \"People - User__LATITUDE\",\n       \"Products\".\"CATEGORY\" AS \"Products__CATEGORY\",\n       \"Products\".\"PRICE\" AS \"Products__PRICE\",\n       \"Products\".\"RATING\" AS \"Products__RATING\"\nFROM \"PUBLIC\".\"ORDERS\"\n         LEFT JOIN \"PUBLIC\".\"PEOPLE\" AS \"People - User\" ON \"PUBLIC\".\"ORDERS\".\"USER_ID\" = \"People - User\".\"ID\" LEFT JOIN \"PUBLIC\".\"PRODUCTS\" AS \"Products\" ON \"PUBLIC\".\"ORDERS\".\"PRODUCT_ID\" = \"Products\".\"ID\"\nLIMIT 1048575")
  (qp/process-query {:database 1
                     :type     "native"
                     :native   {:query (format "WITH X AS (%s) SELECT TOTAL FROM X" x)}})
  ; "People - User__STATE"
  ;My_Model_2

  (let [{:keys [dataset_query name]} (t2/select-one Card :id 1036)
        {:keys [query]} (qp/compile-and-splice-parameters dataset_query)
        new-query (str/replace
                   query
                   #"AS \"([^_]+__([^\"]+))\""
                   (fn [[_ _ b]] (format "AS \"%s\"" b)))]
    (println (mdb.query/format-sql new-query)))

  (let [{:keys [dataset_query name]} (t2/select-one Card :id 1036)
        {:keys [query]} (qp/compile-and-splice-parameters dataset_query)
        new-query (str/replace
                   query
                   #"AS \"([^_]+__([^\"]+))\""
                   (fn [[_ _ b]] (format "AS \"%s\"" b)))]
    (println (mdb.query/format-sql query)))

  ;; The challenge...

  ;; This is what we use to 'train' metabot
  ;; Aside - Would it work to compute the aliases and provide that as column names?
  (->> (t2/select-one Card :id 1036)
       metabot/model-messages
       (mapv :content))

  ;; And this is the native query version of the model
  ;; Note the aliases for all join tables
  ;; e.g. "People - User"."LONGITUDE" AS "People - User__LONGITUDE"
  ;; This leaks the table abstraction from below -- We really just want what
  ;; looks like a denormalized table with "sensible" names
  ;; i.e. We want to use the column names above
  (let [{:keys [dataset_query name]} (t2/select-one Card :id 1036)
        {:keys [query]} (qp/compile-and-splice-parameters dataset_query)]
    (println (mdb.query/format-sql query)))

  (let [{:keys [dataset_query name]} (t2/select-one Card :id 1036)]
    ;(#'metabase.query-processor/preprocess* dataset_query)
    dataset_query)

  (t2/select-one [Card :dataset_query :result_metadata] :id 1036)

  (let [{:keys [dataset_query result_metadata]} (t2/select-one [Card :dataset_query :result_metadata] :id 1036)
        query dataset_query]
    [(let [{:keys [query]} (let [driver (metabase.driver.util/database->driver (:database (qp/preprocess query)))]
                             (let [qp (metabase.query-processor.reducible/combine-middleware
                                       (vec metabase.query-processor/around-middleware)
                                       (fn [query _rff _context]
                                         (metabase.query-processor.util.add-alias-info/add-alias-info
                                          (#'metabase.query-processor/preprocess* query))))]
                               (qp query nil nil)))
           {:keys [fields joins]} query]
       (for [field fields
             :let [[_ id m] field
                   alias (:metabase.query-processor.util.add-alias-info/desired-alias m)]]
         [alias id]))
     (into {} (map (juxt :id :display_name) result_metadata))])

  (metabot/aliases (t2/select-one [Card :dataset_query :result_metadata] :id 1036))

  (println (metabot/inner-query (t2/select-one Card :id 1036)))

  )
