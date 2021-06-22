(ns metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions-test
  (:require [clojure.core.async :as a]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [honeysql.core :as hsql]
            [medley.core :as m]
            [metabase-enterprise.sandbox.models.group-table-access-policy :refer [GroupTableAccessPolicy]]
            [metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions :as row-level-restrictions]
            [metabase-enterprise.sandbox.test-util :as mt.tu]
            [metabase.api.common :as api]
            [metabase.driver :as driver]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.mbql.normalize :as normalize]
            [metabase.mbql.util :as mbql.u]
            [metabase.models :refer [Card Collection Field Table]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.cache-test :as cache-test]
            [metabase.query-processor.middleware.permissions :as qp.perms]
            [metabase.query-processor.pivot :as qp.pivot]
            [metabase.query-processor.util :as qputil]
            [metabase.test :as mt]
            [metabase.test.data.env :as tx.env]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [schema.core :as s]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      SHARED GTAP DEFINITIONS & HELPER FNS                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- identifier
  ([table-key]
   (mt/with-everything-store
     (sql.qp/->honeysql (or driver/*driver* :h2) (Table (mt/id table-key)))))

  ([table-key field-key]
   (mt/with-everything-store
     (sql.qp/->honeysql (or driver/*driver* :h2) (Field (mt/id table-key field-key))))))

(defn- venues-category-mbql-gtap-def []
  {:query      (mt/mbql-query venues)
   :remappings {:cat ["variable" [:field (mt/id :venues :category_id) nil]]}})

(defn- venues-price-mbql-gtap-def []
  {:query      (mt/mbql-query venues)
   :remappings {:price ["variable" [:field (mt/id :venues :price) nil]]}})

(defn- checkins-user-mbql-gtap-def []
  {:query      (mt/mbql-query checkins {:filter [:> $date "2014-01-01"]})
   :remappings {:user ["variable" [:field (mt/id :checkins :user_id) nil]]}})

(defn- format-honeysql [honeysql]
  (let [honeysql (cond-> honeysql
                   (= driver/*driver* :sqlserver)
                   (assoc :modifiers ["TOP 1000"])

                   ;; SparkSQL has to have an alias source table (or at least our driver is written as if it has to
                   ;; have one.) HACK
                   (= driver/*driver* :sparksql)
                   (update :from (fn [[table]]
                                   [[table (sql.qp/->honeysql :sparksql
                                             (hx/identifier :table-alias @(resolve 'metabase.driver.sparksql/source-table-alias)))]])))]
    (first (hsql/format honeysql, :quoting (sql.qp/quote-style driver/*driver*), :allow-dashed-names? true))))

(defn- venues-category-native-gtap-def []
  (driver/with-driver (or driver/*driver* :h2)
    (assert (driver/supports? driver/*driver* :native-parameters))
    {:query (mt/native-query
              {:query
               (format-honeysql
                {:select   [:*]
                 :from     [(identifier :venues)]
                 :where    [:= (identifier :venues :category_id) (hsql/raw "{{cat}}")]
                 :order-by [(identifier :venues :id)]})

               :template_tags
               {:cat {:name "cat" :display_name "cat" :type "number" :required true}}})
     :remappings {:cat ["variable" ["template-tag" "cat"]]}}))

(defn- parameterized-sql-with-join-gtap-def []
  (driver/with-driver (or driver/*driver* :h2)
    (assert (driver/supports? driver/*driver* :native-parameters))
    {:query (mt/native-query
              {:query
               (format-honeysql
                {:select    [(identifier :checkins :id)
                             (identifier :checkins :user_id)
                             (identifier :venues :name)
                             (identifier :venues :category_id)]
                 :from      [(identifier :checkins)]
                 :left-join [(identifier :venues)
                             [:= (identifier :checkins :venue_id) (identifier :venues :id)]]
                 :where     [:= (identifier :checkins :user_id) (hsql/raw "{{user}}")]
                 :order-by  [[(identifier :checkins :id) :asc]]})

               :template_tags
               {"user" {:name         "user"
                        :display-name "User ID"
                        :type         :number
                        :required     true}}})
     :remappings {:user ["variable" ["template-tag" "user"]]}}))

(defn- venue-names-native-gtap-def []
  {:query (mt/native-query
            {:query
             (format-honeysql
              {:select   [(identifier :venues :name)]
               :from     [(identifier :venues)]
               :order-by [(identifier :venues :id)]})})})

(defn- run-venues-count-query []
  (mt/format-rows-by [int]
    (mt/rows
      (mt/run-mbql-query venues {:aggregation [[:count]]}))))

(defn- run-checkins-count-broken-out-by-price-query []
  (mt/format-rows-by [#(some-> % int) int]
    (mt/rows
      (mt/run-mbql-query checkins
        {:aggregation [[:count]]
         :order-by    [[:asc $venue_id->venues.price]]
         :breakout    [$venue_id->venues.price]}))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                MIDDLEWARE TESTS                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest all-table-ids-test
  (testing (str "make sure that `all-table-ids` can properly find all Tables in the query, even in cases where a map "
                "has a `:source-table` and some of its children also have a `:source-table`"))
  (is (= (mt/$ids nil
           #{$$checkins $$venues $$users $$categories})
         (#'row-level-restrictions/all-table-ids
          (mt/mbql-query nil
            {:source-table $$checkins
             :joins        [{:source-table $$venues}
                            {:source-query {:source-table $$users
                                            :joins        [{:source-table $$categories}]}}]})))))

(defn- remove-metadata [m]
  (mbql.u/replace m
    (_ :guard (every-pred map? :source-metadata))
    (remove-metadata (dissoc &match :source-metadata))))

(defn- apply-row-level-permissions [query]
  (-> (mt/with-everything-store
        (mt/test-qp-middleware row-level-restrictions/apply-row-level-permissions (normalize/normalize query)))
      :pre
      remove-metadata))

(deftest middleware-test
  (testing "Make sure the middleware does the correct transformation given the GTAPs we have"
    (mt/with-gtaps {:gtaps      {:checkins (checkins-user-mbql-gtap-def)
                                 :venues   (dissoc (venues-price-mbql-gtap-def) :query)}
                    :attributes {"user" 5, "price" 1}}
      (testing "Should add a filter for attributes-only GTAP"
        (is (= (mt/query checkins
                 {:type       :query
                  :query      {:source-query {:source-table $$checkins
                                              :fields       [$id !default.$date $user_id $venue_id]
                                              :filter       [:and
                                                             [:>= !default.date [:absolute-datetime #t "2014-01-02T00:00Z[UTC]" :default]]
                                                             [:=
                                                              $user_id
                                                              [:value 5 {:base_type         :type/Integer
                                                                         :effective_type    :type/Integer
                                                                         :coercion_strategy nil
                                                                         :semantic_type     :type/FK
                                                                         :database_type     "INTEGER"
                                                                         :name              "USER_ID"}]]]
                                              ::row-level-restrictions/gtap?        true}
                               :joins        [{:source-query
                                               {:source-table $$venues
                                                :fields       [$venues.id $venues.name $venues.category_id
                                                               $venues.latitude $venues.longitude $venues.price]
                                                :filter       [:=
                                                               $venues.price
                                                               [:value 1 {:base_type         :type/Integer
                                                                          :effective_type    :type/Integer
                                                                          :coercion_strategy nil
                                                                          :semantic_type     :type/Category
                                                                          :database_type     "INTEGER"
                                                                          :name              "PRICE"}]]
                                                ::row-level-restrictions/gtap?        true}
                                               :alias     "v"
                                               :strategy  :left-join
                                               :condition [:= $venue_id &v.venues.id]}]
                               :aggregation  [[:count]]}})
               (apply-row-level-permissions
                (mt/mbql-query checkins
                  {:aggregation [[:count]]
                   :joins       [{:source-table $$venues
                                  :alias        "v"
                                  :strategy     :left-join
                                  :condition    [:= $venue_id &v.venues.id]}]}))))))

    (testing "Should substitute appropriate value in native query"
      (mt/with-gtaps {:gtaps      {:venues (venues-category-native-gtap-def)}
                      :attributes {"cat" 50}}
        (is (= (mt/query nil
                 {:database   (mt/id)
                  :type       :query
                  :query      {:aggregation  [[:count]]
                               :source-query {:native (str "SELECT * FROM \"PUBLIC\".\"VENUES\" "
                                                           "WHERE \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" = 50 "
                                                           "ORDER BY \"PUBLIC\".\"VENUES\".\"ID\"")
                                              :params []}}})
               (apply-row-level-permissions
                (mt/mbql-query venues
                  {:aggregation [[:count]]}))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                END-TO-END TESTS                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest e2e-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (testing "When querying with full permissions, no changes should be made"
      (mt/with-gtaps {:gtaps      {:venues (venues-category-mbql-gtap-def)}
                      :attributes {"cat" 50}}
        (perms/grant-permissions! &group (perms/table-query-path (Table (mt/id :venues))))
        (is (= [[100]]
               (run-venues-count-query)))))

    (testing (str "Basic test around querying a table by a user with segmented only permissions and a GTAP question that "
                  "is a native query")
      (mt/with-gtaps {:gtaps      {:venues (venues-category-native-gtap-def)}
                      :attributes {"cat" 50}}
        (is (= [[10]]
               (run-venues-count-query)))))

    (testing (str "Basic test around querying a table by a user with segmented only permissions and a GTAP question that "
                  "is MBQL")
      (mt/with-gtaps {:gtaps      {:venues (venues-category-mbql-gtap-def)}
                      :attributes {"cat" 50}}
        (is (= [[10]]
               (run-venues-count-query)))))

    (testing (str "When processing a query that requires a user attribute and that user attribute isn't there, throw an "
                  "exception letting the user know it's missing")
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Query requires user attribute `cat`"
           (mt/with-gtaps {:gtaps      {:venues (venues-category-mbql-gtap-def)}
                           :attributes {"something_random" 50}}
             (mt/run-mbql-query venues {:aggregation [[:count]]})))))

    (testing "Another basic test, same as above, but with a numeric string that needs to be coerced"
      (mt/with-gtaps {:gtaps      {:venues (venues-category-mbql-gtap-def)}
                      :attributes {"cat" "50"}}
        (is (= [[10]]
               (run-venues-count-query)))))

    (testing "Another basic test, this one uses a stringified float for the login attribute"
      (mt/with-gtaps {:gtaps      {:venues {:query      (mt/mbql-query venues)
                                            :remappings {:cat ["variable" [:field (mt/id :venues :latitude) nil]]}}}
                      :attributes {"cat" "34.1018"}}
        (is (= [[3]]
               (run-venues-count-query)))))

    (testing "Tests that users can have a different parameter name in their query than they have in their user attributes"
      (mt/with-gtaps {:gtaps      {:venues {:query      (:query (venues-category-native-gtap-def))
                                            :remappings {:something.different ["variable" ["template-tag" "cat"]]}}}
                      :attributes {"something.different" 50}}
        (is (= [[10]]
               (run-venues-count-query)))))

    (testing "Make sure that you can still use a SQL-based GTAP without needing to have SQL read perms for the Database"
      (is (= [["Red Medicine"] ["Stout Burgers & Beers"]]
             (mt/rows
               (mt/with-gtaps {:gtaps {:venues (venue-names-native-gtap-def)}}
                 (mt/run-mbql-query venues {:limit 2}))))))

    (testing (str "When no card_id is included in the GTAP, should default to a query against the table, with the GTAP "
                  "criteria applied")
      (mt/with-gtaps {:gtaps      {:venues (dissoc (venues-category-mbql-gtap-def) :query)}
                      :attributes {"cat" 50}}
        (is (= [[10]]
               (run-venues-count-query)))))

    (testing "Same test as above but make sure we coerce a numeric string correctly"
      (mt/with-gtaps {:gtaps      {:venues (dissoc (venues-category-mbql-gtap-def) :query)}
                      :attributes {"cat" "50"}}
        (is (= [[10]]
               (run-venues-count-query)))))

    (testing "Users with view access to the related collection should bypass segmented permissions"
      (mt/with-temp-copy-of-db
        (mt/with-temp* [Collection [collection]
                        Card       [card        {:collection_id (u/the-id collection)}]]
          (mt/with-group [group]
            (perms/revoke-permissions! (perms-group/all-users) (mt/id))
            (perms/grant-collection-read-permissions! group collection)
            (mt/with-test-user :rasta
              (binding [qp.perms/*card-id* (u/the-id card)]
                (is (= 1
                       (count
                        (mt/rows
                          (qp/process-query
                           {:database (mt/id)
                            :type     :query
                            :query    {:source-table (mt/id :venues)
                                       :limit        1}})))))))))))

    (testing (str "This test isn't covering a row level restrictions feature, but rather checking it it doesn't break "
                  "querying of a card as a nested query. Part of the row level perms check is looking at the table (or "
                  "card) to see if row level permissions apply. This was broken when it wasn't expecting a card and "
                  "only expecting resolved source-tables")
      (mt/with-temp Card [card {:dataset_query (mt/mbql-query venues)}]
        (mt/with-test-user :rasta
          (is (= [[100]]
                 (mt/format-rows-by [int]
                   (mt/rows
                     (qp/process-query
                      {:database (mt/id)
                       :type     :query
                       :query    {:source-table (format "card__%s" (u/the-id card))
                                  :aggregation  [["count"]]}}))))))))))

;; Test that we can follow FKs to related tables and breakout by columns on those related tables. This test has
;; several things wrapped up which are detailed below

(defn- row-level-restrictions-fk-drivers
  "Drivers to test row-level restrictions against foreign keys with. Includes BigQuery, which for whatever reason does
  not normally have FK tests ran for it."
  []
  (cond-> (mt/normal-drivers-with-feature :nested-queries :foreign-keys)
    (@tx.env/test-drivers :bigquery) (conj :bigquery)))

(deftest e2e-fks-test
  (mt/test-drivers (row-level-restrictions-fk-drivers)
    (mt/with-bigquery-fks :bigquery
     (testing (str "1 - Creates a GTAP filtering question, looking for any checkins happening on or after 2014\n"
                   "2 - Apply the `user` attribute, looking for only our user (i.e. `user_id` =  5)\n"
                   "3 - Checkins are related to Venues, query for checkins, grouping by the Venue's price\n"
                   "4 - Order by the Venue's price to ensure a predictably ordered response")
       (mt/with-gtaps {:gtaps      {:checkins (checkins-user-mbql-gtap-def)
                                    :venues   nil}
                       :attributes {"user" 5}}
         (is (= [[1 10] [2 36] [3 4] [4 5]]
                (run-checkins-count-broken-out-by-price-query)))))

     (testing (str "Test that we're able to use a GTAP for an FK related table. For this test, the user has segmented "
                   "permissions on checkins and venues, so we need to apply a GTAP to the original table (checkins) in "
                   "addition to the related table (venues). This test uses a GTAP question for both tables")
       (mt/with-gtaps {:gtaps      {:checkins (checkins-user-mbql-gtap-def)
                                    :venues   (venues-price-mbql-gtap-def)}
                       :attributes {"user" 5, "price" 1}}
         (is (= #{[nil 45] [1 10]}
                (set (run-checkins-count-broken-out-by-price-query))))))

     (testing "Test that the FK related table can be a \"default\" GTAP, i.e. a GTAP where the `card_id` is nil"
       (mt/with-gtaps {:gtaps      {:checkins (checkins-user-mbql-gtap-def)
                                    :venues   (dissoc (venues-price-mbql-gtap-def) :query)}
                       :attributes {"user" 5, "price" 1}}
         (is (= #{[nil 45] [1 10]}
                (set (run-checkins-count-broken-out-by-price-query))))))

     (testing (str "Test that we have multiple FK related, segmented tables. This test has checkins with a GTAP "
                   "question with venues and users having the default GTAP and segmented permissions")
       (mt/with-gtaps {:gtaps      {:checkins (checkins-user-mbql-gtap-def)
                                    :venues   (dissoc (venues-price-mbql-gtap-def) :query)
                                    :users    {:remappings {:user ["variable" [:field (mt/id :users :id) nil]]}}}
                       :attributes {"user" 5, "price" 1}}
         (is (= #{[nil "Quentin Sören" 45] [1 "Quentin Sören" 10]}
                (set
                 (mt/format-rows-by [#(when % (int %)) str int]
                   (mt/rows
                     (mt/run-mbql-query checkins
                       {:aggregation [[:count]]
                        :order-by    [[:asc $venue_id->venues.price]]
                        :breakout    [$venue_id->venues.price $user_id->users.name]})))))))))))

(defn- run-query-returning-remark [run-query-fn]
  (let [remark (atom nil)
        orig   qputil/query->remark]
    (with-redefs [qputil/query->remark (fn [driver outer-query]
                                         (u/prog1 (orig driver outer-query)
                                           (reset! remark <>)))]
      (let [results (run-query-fn)]
        (or (some-> @remark (str/replace #"queryHash: \w+" "queryHash: <hash>"))
            (println "NO REMARK FOUND:\n" (u/pprint-to-str 'red results))
            (throw (ex-info "No remark found!" {:results results})))))))

(deftest remark-test
  (testing "make sure GTAP queries still include ID of user who ran them in the remark"
    (mt/with-gtaps {:gtaps      {:venues (venues-category-mbql-gtap-def)}
                    :attributes {"cat" 50}}
      (is (= (format "Metabase:: userID: %d queryType: MBQL queryHash: <hash>" (mt/user->id :rasta))
             (run-query-returning-remark
              (fn []
                (mt/user-http-request :rasta :post "dataset" (mt/mbql-query venues {:aggregation [[:count]]})))))))))

(deftest breakouts-test
  (mt/test-drivers (row-level-restrictions-fk-drivers)
    (testing "Make sure that if a GTAP is in effect we can still do stuff like breakouts (#229)"
      (mt/with-gtaps {:gtaps      {:venues (venues-category-native-gtap-def)}
                      :attributes {"cat" 50}}
        (is (= [[1 6] [2 4]]
               (mt/format-rows-by [int int]
                 (mt/rows
                   (mt/run-mbql-query venues
                     {:aggregation [[:count]]
                      :breakout    [$price]})))))))))

(deftest sql-with-join-test
  (mt/test-drivers (row-level-restrictions-fk-drivers)
    (testing (str "If we use a parameterized SQL GTAP that joins a Table the user doesn't have access to, does it "
                  "still work? (EE #230) If we pass the query in directly without anything that would require nesting "
                  "it, it should work")
      (is (= [[2  1]
              [72 1]]
             (mt/format-rows-by [int int identity int]
               (mt/rows
                 (mt/with-gtaps {:gtaps      {:checkins (parameterized-sql-with-join-gtap-def)}
                                 :attributes {"user" 1}}
                   (mt/run-mbql-query checkins
                     {:limit 2})))))))

    (testing (str "EE #230: If we modify the query in a way that would cause the original to get nested as a source query, "
                  "do things work?")
      (is (= [[5 69]]
             (mt/format-rows-by [int int]
               (mt/rows
                 (mt/with-gtaps {:gtaps      {:checkins (parameterized-sql-with-join-gtap-def)}
                                 :attributes {"user" 5}}
                   (mt/run-mbql-query checkins
                     {:aggregation [[:count]]
                      :breakout    [$user_id]})))))))))

(deftest correct-metadata-test
  (testing (str "We should return the same metadata as the original Table when running a query against a sandboxed "
                "Table (EE #390)\n")
    (let [cols          (fn []
                          (mt/cols
                            (mt/run-mbql-query venues
                              {:order-by [[:asc $id]]
                               :limit    2})))
          original-cols (cols)
          ;; `with-gtaps` copies the test DB so this function will update the IDs in `original-cols` so they'll match
          ;; up with the current copy
          expected-cols (fn []
                          (for [col  original-cols
                                :let [id (mt/id :venues (keyword (str/lower-case (:name col))))]]
                            (assoc col
                                   :id id
                                   :table_id (mt/id :venues)
                                   :field_ref [:field id nil])))]
      (testing "A query with a simple attributes-based sandbox should have the same metadata"
        (mt/with-gtaps {:gtaps      {:venues (dissoc (venues-category-mbql-gtap-def) :query)}
                        :attributes {"cat" 50}}
            (is (= (expected-cols)
                   (cols)))))

      (testing "A query with an equivalent MBQL query sandbox should have the same metadata"
        (mt/with-gtaps {:gtaps      {:venues (venues-category-mbql-gtap-def)}
                        :attributes {"cat" 50}}
            (is (= (expected-cols)
                   (cols)))))

      (testing "A query with an equivalent native query sandbox should have the same metadata"
        (mt/with-gtaps {:gtaps {:venues {:query (mt/native-query
                                                  {:query
                                                   (str "SELECT ID, NAME, CATEGORY_ID, LATITUDE, LONGITUDE, PRICE "
                                                        "FROM VENUES "
                                                        "WHERE CATEGORY_ID = {{cat}}")

                                                   :template_tags
                                                   {:cat {:name "cat" :display_name "cat" :type "number" :required true}}})
                                         :remappings {:cat ["variable" ["template-tag" "cat"]]}}}
                        :attributes {"cat" 50}}
          (is (= (expected-cols)
                 (cols)))))

      (testing (str "If columns are added/removed/reordered we should still merge in metadata for the columns we're "
                    "able to match from the original Table")
        (mt/with-gtaps {:gtaps {:venues {:query (mt/native-query
                                                  {:query
                                                   (str "SELECT NAME, ID, LONGITUDE, PRICE, 1 AS ONE "
                                                        "FROM VENUES "
                                                        "WHERE CATEGORY_ID = {{cat}}")

                                                   :template_tags
                                                   {:cat {:name "cat" :display_name "cat" :type "number" :required true}}})
                                         :remappings {:cat ["variable" ["template-tag" "cat"]]}}}
                        :attributes {"cat" 50}}
          (let [[id-col name-col _ _ longitude-col price-col] (expected-cols)]
              (is (= [name-col id-col longitude-col price-col]
                     (cols)))))))))

(deftest sql-with-joins-test
  (testing "Should be able to use a Saved Question with no source Metadata as a GTAP (EE #525)"
    (mt/with-gtaps (mt/$ids
                     {:gtaps      {:venues   {:query      (mt/native-query
                                                            {:query         (str "SELECT DISTINCT VENUES.* "
                                                                                 "FROM VENUES "
                                                                                 "LEFT JOIN CHECKINS"
                                                                                 "       ON CHECKINS.VENUE_ID = VENUES.ID "
                                                                                 "WHERE CHECKINS.USER_ID IN ({{sandbox}})")
                                                             :template-tags {"sandbox"
                                                                             {:name         "sandbox"
                                                                              :display-name "Sandbox"
                                                                              :type         :text}}})
                                              :remappings {"user_id" [:variable [:template-tag "sandbox"]]}}
                                   :checkins {:remappings {"user_id" [:dimension $checkins.user_id]}}}
                      :attributes {"user_id" 1}})
      (is (= [[2 "2014-09-18T00:00:00Z"  1 31 31 "Bludso's BBQ"         5 33.8894 -118.207 2]
              [72 "2015-04-18T00:00:00Z" 1  1  1 "Red Medicine"         4 10.0646 -165.374 3]
              [80 "2013-12-27T00:00:00Z" 1 99 99 "Golden Road Brewing" 10 34.1505 -118.274 2]]
             (mt/rows
               (mt/run-mbql-query checkins
                 {:joins    [{:fields       :all
                              :source-table $$venues
                              :condition    [:= $venue_id &Venue.venues.id]
                              :alias        "Venue"}]
                  :order-by [[:asc $id]]
                  :limit    3})))))))

(deftest run-sql-queries-to-infer-columns-test
  (testing "Run SQL queries to infer the columns when used as GTAPS (#13716)\n"
    (testing "Should work with SQL queries that return less columns than there were in the original Table\n"
      (mt/with-gtaps (mt/$ids
                       {:gtaps      {:venues   {:query      (mt/native-query
                                                              {:query         (str "SELECT DISTINCT VENUES.ID, VENUES.NAME "
                                                                                   "FROM VENUES "
                                                                                   "WHERE VENUES.ID IN ({{sandbox}})")
                                                               :template-tags {"sandbox"
                                                                               {:name         "sandbox"
                                                                                :display-name "Sandbox"
                                                                                :type         :text}}})
                                                :remappings {"venue_id" [:variable [:template-tag "sandbox"]]}}
                                     :checkins {}}
                        :attributes {"venue_id" 1}})
        (let [venues-gtap-card-id (db/select-one-field :card_id GroupTableAccessPolicy
                                    :group_id (:id &group)
                                    :table_id (mt/id :venues))]
          (is (integer? venues-gtap-card-id))
          (testing "GTAP Card should not yet current have result_metadata"
            (is (= nil
                   (db/select-one-field :result_metadata Card :id venues-gtap-card-id))))
          (testing "Should be able to run the query"
            (is (= [[1 "Red Medicine" 1 "Red Medicine"]]
                   (mt/rows
                     (mt/run-mbql-query venues
                       {:fields   [$id $name] ; joined fields get appended automatically because we specify :all :below
                        :joins    [{:fields       :all
                                    :source-table $$venues
                                    :condition    [:= $id &Venue.id]
                                    :alias        "Venue"}]
                        :order-by [[:asc $id]]
                        :limit    3})))))
          (testing "After running the query the first time, result_metadata should have been saved for the GTAP Card"
            (is (schema= [(s/one {:name         (s/eq "ID")
                                  :base_type    (s/eq :type/BigInteger)
                                  :display_name (s/eq "ID")
                                  s/Keyword     s/Any}
                                 "ID col")
                          (s/one {:name         (s/eq "NAME")
                                  :base_type    (s/eq :type/Text)
                                  :display_name (s/eq "Name")
                                  s/Keyword     s/Any}
                                 "NAME col")]
                         (db/select-one-field :result_metadata Card :id venues-gtap-card-id)))))))))

(deftest run-queries-to-infer-columns-error-on-column-type-changes-test
  (testing "If we have to run a query to infer columns (see above) we should validate column constraints (#14099)\n"
    (letfn [(do-with-sql-gtap [sql f]
              (mt/with-gtaps (mt/$ids
                               {:gtaps      {:venues   {:query      (mt/native-query
                                                                      {:query         sql
                                                                       :template-tags {"sandbox"
                                                                                       {:name         "sandbox"
                                                                                        :display-name "Sandbox"
                                                                                        :type         :text}}})
                                                        :remappings {"venue_id" [:variable [:template-tag "sandbox"]]}}
                                             :checkins {}}
                                :attributes {"venue_id" 1}})
                (let [venues-gtap-card-id (db/select-one-field :card_id GroupTableAccessPolicy
                                            :group_id (:id &group)
                                            :table_id (mt/id :venues))]
                  (is (integer? venues-gtap-card-id))
                  (testing "GTAP Card should not yet current have result_metadata"
                    (is (= nil
                           (db/select-one-field :result_metadata Card :id venues-gtap-card-id))))
                  (f {:run-query (fn []
                                   (mt/run-mbql-query venues
                                     {:fields   [$id $name]
                                      :joins    [{:fields       :all
                                                  :source-table $$venues
                                                  :condition    [:= $id &Venue.id]
                                                  :alias        "Venue"}]
                                      :order-by [[:asc $id]]
                                      :limit    3}))}))))]
      (testing "Removing columns should be ok."
        (do-with-sql-gtap
         (str "SELECT ID, NAME "
              "FROM VENUES "
              "WHERE ID IN ({{sandbox}})")
         (fn [{:keys [run-query]}]
           (testing "Query without weird stuff going on should work"
             (is (= [[1 "Red Medicine" 1 "Red Medicine"]]
                    (mt/rows (run-query))))))))

      (testing "Don't allow people to change the types of columns in the original Table"
        (do-with-sql-gtap
         (str "SELECT ID, 100 AS NAME "
              "FROM VENUES "
              "WHERE ID IN ({{sandbox}})")
         (fn [{:keys [run-query]}]
           (testing "Should throw an Exception when running the query"
             (is (thrown-with-msg?
                  clojure.lang.ExceptionInfo
                  #"Sandbox Questions can't return columns that have different types than the Table they are sandboxing"
                  (run-query))))))

        (testing "Should be ok if you change the type of the column to a *SUBTYPE* of the original Type"
          (do-with-sql-gtap
           (str "SELECT cast(ID AS bigint) AS ID, NAME "
                "FROM VENUES "
                "WHERE ID IN ({{sandbox}})")
           (fn [{:keys [run-query]}]
             (testing "Should throw an Exception when running the query"
               (is (= [[1 "Red Medicine" 1 "Red Medicine"]]
                      (mt/rows (run-query))))))))))))

(deftest dont-cache-sandboxes-test
  (cache-test/with-mock-cache [save-chan]
    (mt/with-gtaps {:gtaps      {:venues (venues-category-mbql-gtap-def)}
                    :attributes {"cat" 50}}
      (letfn [(run-query []
                (qp/process-query (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                                         :cache-ttl 100)))]
        (testing "Run the query, should not be cached"
          (let [result (run-query)]
            (is (= nil
                   (:cached result)))
            (is (= [[10]]
                   (mt/rows result)))))
        (testing "Cache entry should be saved within 5 seconds"
          (let [[_ chan] (a/alts!! [save-chan (a/timeout 5000)])]
            (is (= save-chan
                   chan))))

        (testing "Run it again, should be cached"
          (let [result (run-query)]
            (is (= true
                   (:cached result)))
            (is (= [[10]]
                   (mt/rows result)))))
        (testing "Run the query with different User attributes, should not get the cached result"
          (mt.tu/with-user-attributes :rasta {"cat" 40}
            ;; re-bind current user so updated attributes come in to effect
            (mt/with-test-user :rasta
              (is (= {"cat" 40}
                     (:login_attributes @api/*current-user*)))
              (let [result (run-query)]
                (is (= nil
                       (:cached result)))
                (is (= [[9]]
                       (mt/rows result)))))))))))



(deftest remapped-fks-test
  (testing "Sandboxing should work with remapped FK columns (#14629)"
    (mt/dataset sample-dataset
      ;; set up GTAP against reviews
      (mt/with-gtaps (mt/$ids reviews
                       {:gtaps      {:reviews {:remappings {"user_id" [:dimension $product_id]}}}
                        :attributes {"user_id" 1}})
        ;; grant full data perms for products
        (perms/grant-permissions! (perms-group/all-users) (perms/object-path
                                                           (mt/id)
                                                           (db/select-one-field :schema Table :id (mt/id :products))
                                                           (mt/id :products)))
        (mt/with-test-user :rasta
          (testing "Sanity check: should be able to query products"
            (is (schema= {:status   (s/eq :completed)
                          s/Keyword s/Any}
                         (mt/run-mbql-query products {:limit 10}))))
          (testing "Try the sandbox without remapping in place"
            (let [result (mt/run-mbql-query reviews {:order-by [[:asc $id]]})]
              (is (schema= {:status    (s/eq :completed)
                            :row_count (s/eq 8)
                            s/Keyword  s/Any}
                           result))
              (is (= [1
                      1
                      "christ"
                      5
                      (str "Ad perspiciatis quis et consectetur. Laboriosam fuga voluptas ut et modi ipsum. Odio et "
                           "eum numquam eos nisi. Assumenda aut magnam libero maiores nobis vel beatae officia.")
                      "2018-05-15T20:25:48.517Z"]
                     (first (mt/rows result))))))
          (testing "Ok, add remapping and it should still work"
            (mt/with-column-remappings [reviews.product_id products.title]
              (let [result (mt/run-mbql-query reviews {:order-by [[:asc $id]]})]
                (is (schema= {:status    (s/eq :completed)
                              :row_count (s/eq 8)
                              s/Keyword  s/Any}
                             result))
                (is (= [1
                        1
                        "christ"
                        5
                        (str "Ad perspiciatis quis et consectetur. Laboriosam fuga voluptas ut et modi ipsum. Odio et "
                             "eum numquam eos nisi. Assumenda aut magnam libero maiores nobis vel beatae officia.")
                        "2018-05-15T20:25:48.517Z"
                        "Rustic Paper Wallet"] ; <- Includes the remapped column
                       (first (mt/rows result))))))))))))

(deftest drill-thru-on-joins-test
  (testing "should work on questions with joins, with sandboxed target table, where target fields cannot be filtered (#13642)"
    ;; Sandbox ORDERS and PRODUCTS
    (mt/dataset sample-dataset
      (mt/with-gtaps (mt/$ids nil
                       {:gtaps      {:orders   {:remappings {:user_id [:dimension $orders.user_id]}}
                                     :products {:remappings {:user_cat [:dimension $products.category]}}}
                        :attributes {:user_id  "1"
                                     :user_cat "Widget"}})
        ;; create query with joins
        (let [query (mt/mbql-query orders
                      {:aggregation [[:count]]
                       :breakout    [&products.products.category]
                       :joins       [{:fields       :all
                                      :source-table $$products
                                      :condition    [:= $product_id &products.products.id]
                                      :alias        "products"}]
                       :limit       10})]
          (testing "Should be able to run the query"
            (is (schema= {:data      {:rows     (s/eq [[nil 5] ["Widget" 6]])
                                      s/Keyword s/Any}
                          :status    (s/eq :completed)
                          :row_count (s/eq 2)
                          s/Keyword  s/Any}
                         (qp/process-query query))))
          (testing "should be able to save the query as a Card and run it"
            (mt/with-temp* [Collection [{collection-id :id}]
                            Card       [{card-id :id} {:dataset_query query, :collection_id collection-id}]]
              (perms/grant-collection-read-permissions! &group collection-id)
              (is (schema= {:data      {:rows     (s/eq [[nil 5] ["Widget" 6]])
                                        s/Keyword s/Any}
                            :status    (s/eq "completed")
                            :row_count (s/eq 2)
                            s/Keyword  s/Any}
                           (mt/user-http-request :rasta :post 202 (format "card/%d/query" card-id))))))
          (letfn [(test-drill-thru []
                    (testing "Drill-thru question should work"
                      (let [drill-thru-query
                            (mt/mbql-query orders
                              {:filter [:= $products.category "Widget"]
                               :joins  [{:fields       :all
                                         :source-table $$products
                                         :condition    [:= $product_id &products.products.id]
                                         :alias        "products"}]
                               :limit  10})

                            test-preprocessing
                            (fn []
                              (testing "`resolve-joined-fields` middleware should infer `:field` `:join-alias` correctly"
                                (is (= [:=
                                        [:field (mt/id :products :category) {:join-alias "products"}]
                                        [:value "Widget" {:base_type     :type/Text
                                                          :effective_type :type/Text
                                                          :coercion_strategy nil
                                                          :semantic_type  (db/select-one-field :semantic_type Field
                                                                           :id (mt/id :products :category))
                                                          :database_type "VARCHAR"
                                                          :name          "CATEGORY"}]]
                                       (get-in (qp/query->preprocessed drill-thru-query) [:query :filter])))))]
                        (testing "As an admin"
                          (mt/with-test-user :crowberto
                            (test-preprocessing)
                            (is (schema= {:status    (s/eq :completed)
                                          :row_count (s/eq 10)
                                          s/Keyword  s/Any}
                                         (qp/process-query drill-thru-query)))))
                        (testing "As a sandboxed user"
                          (test-preprocessing)
                          (is (schema= {:status    (s/eq :completed)
                                        :row_count (s/eq 6)
                                        s/Keyword  s/Any}
                                       (qp/process-query drill-thru-query)))))))]
            (test-drill-thru)
            (mt/with-column-remappings [orders.product_id products.title]
              (test-drill-thru))))))))

(deftest drill-thru-on-implicit-joins-test
  (testing "drill-through should work on implicit joined tables with sandboxes should have correct metadata (#13641)"
    (mt/dataset sample-dataset
      ;; create Sandbox on ORDERS
      (mt/with-gtaps (mt/$ids nil
                       {:gtaps      {:orders {:remappings {:user_id [:dimension $orders.user_id]}}}
                        :attributes {:user_id "1"}})
        ;; make sure the sandboxed group can still access the Products table, which is referenced below.
        (perms/grant-permissions! &group (perms/object-path (mt/id) "PUBLIC" (mt/id :products)))
        (letfn [(do-tests []
                  ;; create a query based on the sandboxed Table
                  (testing "should be able to run the query. Results should come back with correct metadata"
                    (let [query (mt/mbql-query orders
                                  {:aggregation [[:count]]
                                   :breakout    [$product_id->products.category]
                                   :order-by    [[:asc $product_id->products.category]]
                                   :limit       5})]
                      (letfn [(test-metadata []
                                (is (schema= {:status   (s/eq :completed)
                                              :data     {:results_metadata
                                                         {:columns  [(s/one {:name      (s/eq "CATEGORY")
                                                                             :field_ref (s/eq (mt/$ids $orders.product_id->products.category))
                                                                             s/Keyword  s/Any}
                                                                            "results metadata for products.category")
                                                                     (s/one {:name      (s/eq "count")
                                                                             :field_ref (s/eq [:aggregation 0])
                                                                             s/Keyword  s/Any}
                                                                            "results metadata for count aggregation")]
                                                          s/Keyword s/Any}
                                                         s/Keyword s/Any}
                                              s/Keyword s/Any}
                                             (qp/process-query query))))]
                        (testing "as an admin"
                          (mt/with-test-user :crowberto
                            (test-metadata)))
                        (testing "as a sandboxed user"
                          (test-metadata)))))
                  (testing "Drill-thru question should work"
                    (letfn [(test-drill-thru-query []
                              (is (schema= {:status   (s/eq :completed)
                                            s/Keyword s/Any}
                                           (mt/run-mbql-query orders
                                             {:filter   [:= $product_id->products.category "Doohickey"]
                                              :order-by [[:asc $product_id->products.category]]
                                              :limit    5}))))]
                      (testing "as admin"
                        (mt/with-test-user :crowberto
                          (test-drill-thru-query)))
                      (testing "as sandboxed user"
                        (test-drill-thru-query)))))]
          (do-tests)
          (mt/with-column-remappings [orders.product_id products.title]
            (do-tests)))))))

(defn- set-query-metadata-for-gtap-card!
  "Find the GTAP Card associated with Group and table-name and add `:result_metadata` to it. Because we (probably) need
  a parameter in order to run the query to get metadata, pass `param-name` and `param-value` template tag parameters
  when running the query."
  [group table-name param-name param-value]
  (let [card-id (db/select-one-field :card_id GroupTableAccessPolicy :group_id (u/the-id group), :table_id (mt/id table-name))
        query   (db/select-one-field :dataset_query Card :id (u/the-id card-id))
        results (mt/with-test-user :crowberto
                  (qp/process-query (assoc query :parameters [{:type   :category
                                                               :target [:variable [:template-tag param-name]]
                                                               :value  param-value}])))
        metadata (get-in results [:data :results_metadata :columns])]
    (is (seq metadata))
    (db/update! Card card-id :result_metadata metadata)))

(defn- unset-query-metadata-for-gtap-card! [group table-name]
  (let [card-id (db/select-one-field :card_id GroupTableAccessPolicy :group_id (u/the-id group), :table_id (mt/id table-name))]
    (db/update! Card card-id :result_metadata nil)))

(deftest native-fk-remapping-test
  (testing "FK remapping should still work for questions with native sandboxes (EE #520)"
    (mt/dataset sample-dataset
      (let [mbql-sandbox-results (mt/with-gtaps {:gtaps      (mt/$ids
                                                               {:orders   {:remappings {"user_id" [:dimension $orders.user_id]}}
                                                                :products {:remappings {"user_cat" [:dimension $products.category]}}})
                                                 :attributes {"user_id" 1, "user_cat" "Widget"}}
                                   (mt/with-column-remappings [orders.product_id products.title]
                                     (mt/run-mbql-query orders)))]
        (doseq [orders-gtap-card-has-metadata?   [true false]
                products-gtap-card-has-metadata? [true false]]
          (testing (format "\nwith GTAP metadata for Orders? %s Products? %s"
                           (pr-str orders-gtap-card-has-metadata?)
                           (pr-str products-gtap-card-has-metadata?))
            (mt/with-gtaps {:gtaps      {:orders   {:query      (mt/native-query
                                                                  {:query         "SELECT * FROM ORDERS WHERE USER_ID={{uid}} AND TOTAL > 10"
                                                                   :template-tags {"uid" {:display-name "User ID"
                                                                                          :id           "1"
                                                                                          :name         "uid"
                                                                                          :type         :number}}})
                                                    :remappings {"user_id" [:variable [:template-tag "uid"]]}}
                                         :products {:query      (mt/native-query
                                                                  {:query         "SELECT * FROM PRODUCTS WHERE CATEGORY={{cat}} AND PRICE > 10"
                                                                   :template-tags {"cat" {:display-name "Category"
                                                                                          :id           "2"
                                                                                          :name         "cat"
                                                                                          :type         :text}}})
                                                    :remappings {"user_cat" [:variable [:template-tag "cat"]]}}}
                            :attributes {"user_id" "1", "user_cat" "Widget"}}
              (when orders-gtap-card-has-metadata?
                (set-query-metadata-for-gtap-card! &group :orders "uid" 1))
              (when products-gtap-card-has-metadata?
                (set-query-metadata-for-gtap-card! &group :products "cat" "Widget"))
              (mt/with-column-remappings [orders.product_id products.title]
                (testing "Sandboxed results should be the same as they would be if the sandbox was MBQL"
                  (letfn [(format-col [col]
                            (dissoc col :field_ref :id :table_id :fk_field_id))
                          (format-results [results]
                            (-> results
                                (update-in [:data :cols] (partial map format-col))
                                (m/dissoc-in [:data :native_form])
                                (m/dissoc-in [:data :results_metadata :checksum])
                                (update-in [:data :results_metadata :columns] (partial map format-col))))]
                    (is (= (format-results mbql-sandbox-results)
                           (format-results (mt/run-mbql-query orders))))))

                (testing "Should be able to run a query against Orders"
                  (is (= [[1 1 14 37.65 2.07 39.72 nil "2019-02-11T21:40:27.892Z" 2 "Awesome Concrete Shoes"]]
                         (mt/rows (mt/run-mbql-query orders {:limit 1})))))))))))))

(deftest pivot-query-test
  ;; sample-dataset doesn't work on Redshift yet -- see #14784
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :foreign-keys :nested-queries :left-join) :redshift)
    (testing "Pivot table queries should work with sandboxed users (#14969)"
      (mt/dataset sample-dataset
        (mt/with-gtaps {:gtaps      (mt/$ids
                                      {:orders   {:remappings {:user_id [:dimension $orders.user_id]}}
                                       :products {:remappings {:user_cat [:dimension $products.category]}}})
                        :attributes {:user_id 1, :user_cat "Widget"}}
          (perms/grant-permissions! &group (perms/table-query-path (Table (mt/id :people))))
          ;; not sure why Snowflake has slightly different results
          (is (= (if (= driver/*driver* :snowflake)
                   [["Twitter" "Widget" 0 510.82]
                    ["Twitter" nil      0 407.93]
                    [nil       "Widget" 1 510.82]
                    [nil       nil      1 407.93]
                    ["Twitter" nil      2 918.75]
                    [nil       nil      3 918.75]]
                   (->> [["Twitter" nil      0 401.51]
                         ["Twitter" "Widget" 0 498.59]
                         [nil       nil      1 401.51]
                         [nil       "Widget" 1 498.59]
                         ["Twitter" nil      2 900.1]
                         [nil       nil      3 900.1]]
                        (sort-by (let [nil-first? (mt/sorts-nil-first? driver/*driver*)
                                       sort-str   (fn [s]
                                                    (cond
                                                      (some? s)  s
                                                      nil-first? "A"
                                                      :else      "Z"))]
                                   (fn [[x y group]]
                                     [group (sort-str x) (sort-str y)])))))
                 (mt/formatted-rows [str str int 2.0]
                   (qp.pivot/run-pivot-query
                    (mt/mbql-query orders
                      {:joins       [{:source-table $$people
                                      :fields       :all
                                      :condition    [:= $user_id &P.people.id]
                                      :alias        "P"}]
                       :aggregation [[:sum $total]]
                       :breakout    [&P.people.source
                                     $product_id->products.category]
                       :limit       5}))))))))))
