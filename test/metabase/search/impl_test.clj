(ns metabase.search.impl-test
  "There are a lot more tests around search in [[metabase.api.search-test]]. TODO: we should move more of those tests
  into this namespace."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.config :as config]
   [metabase.search.config :as search.config]
   [metabase.search.core :as search]
   [metabase.search.impl :as search.impl]
   [metabase.search.in-place.legacy :as search.legacy]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ^:parallel parse-engine-test
  (testing "Default engine"
    (is (= "search.engine" (namespace (#'search.impl/parse-engine nil)))))
  (testing "Unknown engine resolves to the default"
    (is (=  (#'search.impl/parse-engine nil)
            (#'search.impl/parse-engine "vespa"))))
  (testing "Registered engines"
    (is (= :search.engine/in-place (#'search.impl/parse-engine "in-place")))
    (when (search/supports-index?)
      (is (= :search.engine/appdb (#'search.impl/parse-engine "appdb")))))
  ;; We don't currently leverage subclasses.
  #_(when (search/supports-index?)
      (testing "Subclasses"
        (is (= :search.engine/hybrid (#'search.impl/parse-engine "hybrid"))))))

(deftest ^:parallel order-clause-test
  (testing "it includes all columns and normalizes the query"
    (is (= [[:case
             [:like [:lower :model]             "%foo%"] [:inline 0]
             [:like [:lower :name]              "%foo%"] [:inline 0]
             [:like [:lower :display_name]      "%foo%"] [:inline 0]
             [:like [:lower :description]       "%foo%"] [:inline 0]
             [:like [:lower :collection_name]   "%foo%"] [:inline 0]
             [:like [:lower :collection_type]   "%foo%"] [:inline 0]
             [:like [:lower :display]           "%foo%"] [:inline 0]
             [:like [:lower :table_schema]      "%foo%"] [:inline 0]
             [:like [:lower :table_name]        "%foo%"] [:inline 0]
             [:like [:lower :table_description] "%foo%"] [:inline 0]
             [:like [:lower :database_name]     "%foo%"] [:inline 0]
             [:like [:lower :model_name]        "%foo%"] [:inline 0]
             [:like [:lower :dataset_query]     "%foo%"] [:inline 0]
             :else [:inline 1]]]
           (search.legacy/order-clause "Foo")))))

(deftest search-db-call-count-test
  (let [search-string (mt/random-name)]
    (t2.with-temp/with-temp
      [:model/Card      _              {:name (str "card db 1 " search-string)}
       :model/Card      _              {:name (str "card db 2 " search-string)}
       :model/Card      _              {:name (str "card db 3 " search-string)}
       :model/Dashboard _              {:name (str "dash 1 " search-string)}
       :model/Dashboard _              {:name (str "dash 2 " search-string)}
       :model/Dashboard _              {:name (str "dash 3 " search-string)}
       :model/Database  {db-id :id}    {:name (str "database 1 " search-string)}
       :model/Database  _              {:name (str "database 2 " search-string)}
       :model/Database  _              {:name (str "database 3 " search-string)}
       :model/Table     {table-id :id} {:db_id  db-id
                                        :schema nil}
       :model/Card      _              {:name (str "metric 1 " search-string) :type :metric}
       :model/Card      _              {:name (str "metric 1 " search-string) :type :metric}
       :model/Card      _              {:name (str "metric 2 " search-string) :type :metric}
       :model/Segment   _              {:table_id table-id
                                        :name     (str "segment 1 " search-string)}
       :model/Segment   _              {:table_id table-id
                                        :name     (str "segment 2 " search-string)}
       :model/Segment   _              {:table_id table-id
                                        :name     (str "segment 3 " search-string)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (binding [config/*request-id* (random-uuid)]
          (let [do-search (fn []
                            (search.impl/search {:search-string               search-string
                                                 :archived?                   false
                                                 :models                      search.config/all-models
                                                 :current-user-id             (mt/user->id :crowberto)
                                                 :is-superuser?               true
                                                 :current-user-perms          #{"/"}
                                                 :model-ancestors?            false
                                                 :limit-int                   100
                                                 :calculate-available-models? false}))]
          ;; warm it up, in case the DB call depends on the order of test execution and it needs to
          ;; do some initialization
            (do-search)
            (t2/with-call-count [call-count]
              (do-search)
            ;; the call count number here are expected to change if we change the search api
            ;; we have this test here just to keep tracks this number to remind us to put effort
            ;; into keep this number as low as we can
              (is (<= (call-count) 5)))))))))

(deftest created-at-correctness-test
  (let [search-term   "created-at-filtering"
        new           #t "2023-05-04T10:00Z[UTC]"
        two-years-ago (t/minus new (t/years 2))]
    (mt/with-clock new
      (t2.with-temp/with-temp
        [:model/Dashboard  {dashboard-new :id} {:name       search-term
                                                :created_at new}
         :model/Dashboard  {dashboard-old :id} {:name       search-term
                                                :created_at two-years-ago}
         :model/Database   {db-new :id}       {:name       search-term
                                               :created_at new}
         :model/Database   {db-old :id}      {:name       search-term
                                              :created_at two-years-ago}
         :model/Table      {table-new :id}    {:name       search-term
                                               :db_id      db-new
                                               :created_at new}
         :model/Table      {table-old :id}    {:name       search-term
                                               :db_id      db-old
                                               :created_at two-years-ago}
         :model/Collection {coll-new :id}     {:name       search-term
                                               :created_at new}
         :model/Collection {coll-old :id}     {:name       search-term
                                               :created_at two-years-ago}
         :model/Card       {card-new :id}     {:name       search-term
                                               :created_at new}
         :model/Card       {card-old :id}     {:name       search-term
                                               :created_at two-years-ago}
         :model/Card       {model-new :id}    {:name       search-term
                                               :type       :model
                                               :created_at new}
         :model/Card       {model-old :id}    {:name       search-term
                                               :type       :model
                                               :created_at two-years-ago}
         :model/Action     {action-new :id}   {:name       search-term
                                               :model_id   model-new
                                               :type       :http
                                               :created_at new}
         :model/Action     {action-old :id}   {:name       search-term
                                               :model_id   model-old
                                               :type       :http
                                               :created_at two-years-ago}
         :model/Segment    {_segment-new :id} {:name       search-term
                                               :created_at new}
         :model/Card       {metric-new :id}   {:name       search-term
                                               :type       :metric
                                               :created_at new}
         :model/Card       {metric-old :id}   {:name       search-term
                                               :type       :metric
                                               :created_at two-years-ago}]
        ;; with clock doesn't work if calling via API, so we call the search function directly
        (let [test-search (fn [created-at expected]
                            (testing (format "searching with created-at = %s" created-at)
                              (mt/with-current-user (mt/user->id :crowberto)
                                (is (= expected
                                       (->> (search.impl/search (search.impl/search-context
                                                                 {:search-string      search-term
                                                                  :search-engine      "in-place"
                                                                  :archived           false
                                                                  :models             search.config/all-models
                                                                  :created-at         created-at
                                                                  :current-user-id    (mt/user->id :crowberto)
                                                                  :is-superuser?      true
                                                                  :current-user-perms @api/*current-user-permissions-set*}))
                                            :data
                                            (map (juxt :model :id))
                                            set))))))
              new-result  #{["action"     action-new]
                            ["card"       card-new]
                            ["collection" coll-new]
                            ["database"   db-new]
                            ["dataset"    model-new]
                            ["dashboard"  dashboard-new]
                            ["table"      table-new]
                            ["metric"     metric-new]}
              old-result  #{["action"     action-old]
                            ["card"       card-old]
                            ["collection" coll-old]
                            ["database"   db-old]
                            ["dataset"    model-old]
                            ["dashboard"  dashboard-old]
                            ["table"      table-old]
                            ["metric"     metric-old]}]
          ;; absolute datetime
          (test-search "Q2-2021" old-result)
          (test-search "2023-05-04" new-result)
          (test-search "2021-05-03~" (set/union old-result new-result))
          ;; range is inclusive of the start but exclusive of the end, so this does not contain new-result
          (test-search "2021-05-04~2023-05-03" old-result)
          (test-search "2021-05-05~2023-05-04" new-result)
          (test-search "~2023-05-03" old-result)
          (test-search "2021-05-04T09:00:00~2021-05-04T10:00:10" old-result)

          ;; relative times
          (test-search "thisyear" new-result)
          (test-search "past1years-from-12months" old-result)
          (test-search "today" new-result))))))

(deftest last-edited-at-correctness-test
  (let [search-term   "last-edited-at-filtering"
        new           #t "2023-05-04T10:00Z[UTC]"
        two-years-ago (t/minus new (t/years 2))]
    (mt/with-clock new
      (t2.with-temp/with-temp
        [:model/Dashboard  {dashboard-new :id} {:name search-term}
         :model/Dashboard  {dashboard-old :id} {:name search-term}
         :model/Card       {card-new :id}      {:name search-term}
         :model/Card       {card-old :id}      {:name search-term}
         :model/Card       {model-new :id}     {:name search-term
                                                :type :model}
         :model/Card       {model-old :id}     {:name search-term
                                                :type :model}
         :model/Card       {metric-new :id}    {:name search-term :type :metric}
         :model/Card       {metric-old :id}    {:name search-term :type :metric}
         :model/Action     {action-new :id}    {:name       search-term
                                                :model_id   model-new
                                                :type       :http
                                                :updated_at new}
         :model/Action     {action-old :id}    {:name       search-term
                                                :model_id   model-old
                                                :type       :http
                                                :updated_at two-years-ago}]
        (t2/insert! (t2/table-name :model/Revision) (for [[model model-id timestamp]
                                                          [["Dashboard" dashboard-new new]
                                                           ["Dashboard" dashboard-old two-years-ago]
                                                           ["Card" card-new new]
                                                           ["Card" card-old two-years-ago]
                                                           ["Card" model-new new]
                                                           ["Card" model-old two-years-ago]
                                                           ["Card" metric-new new]
                                                           ["Card" metric-old two-years-ago]]]
                                                      {:model       model
                                                       :model_id    model-id
                                                       :object      "{}"
                                                       :user_id     (mt/user->id :rasta)
                                                       :timestamp   timestamp
                                                       :most_recent true}))
        ;; with clock doesn't work if calling via API, so we call the search function directly
        (let [test-search (fn [last-edited-at expected]
                            (testing (format "searching with last-edited-at = %s" last-edited-at)
                              (mt/with-current-user (mt/user->id :crowberto)
                                (is (= expected
                                       (->> (search.impl/search (search.impl/search-context
                                                                 {:search-string      search-term
                                                                  :search-engine      "in-place"
                                                                  :archived           false
                                                                  :models             search.config/all-models
                                                                  :last-edited-at     last-edited-at
                                                                  :current-user-id    (mt/user->id :crowberto)
                                                                  :is-superuser?      true
                                                                  :current-user-perms @api/*current-user-permissions-set*}))
                                            :data
                                            (map (juxt :model :id))
                                            set))))))
              new-result  #{["action"    action-new]
                            ["card"      card-new]
                            ["dataset"   model-new]
                            ["dashboard" dashboard-new]
                            ["metric"    metric-new]}
              old-result  #{["action"    action-old]
                            ["card"      card-old]
                            ["dataset"   model-old]
                            ["dashboard" dashboard-old]
                            ["metric"    metric-old]}]
          ;; absolute datetime
          (test-search "Q2-2021" old-result)
          (test-search "2023-05-04" new-result)
          (test-search "2021-05-03~" (set/union old-result new-result))
          ;; range is inclusive of the start but exclusive of the end, so this does not contain new-result
          (test-search "2021-05-04~2023-05-03" old-result)
          (test-search "2021-05-05~2023-05-04" new-result)
          (test-search "~2023-05-03" old-result)
          (test-search "2021-05-04T09:00:00~2021-05-04T10:00:10" old-result)

          ;; relative times
          (test-search "thisyear" new-result)
          (test-search "past1years-from-12months" old-result)
          (test-search "today" new-result))))))

(deftest ^:parallel serialize-test
  (testing "It normalizes dataset queries from strings"
    (let [query  {:type     :query
                  :query    {:source-query {:source-table 1}}
                  :database 1}
          result {:name          "card"
                  :model         "card"
                  :dataset_query (json/encode query)
                  :all-scores {}
                  :relevant-scores {}}]
      (is (= query (-> result search.impl/serialize :dataset_query)))))
  (testing "Doesn't error on other models without a query"
    (is (nil? (-> {:name "dash" :model "dashboard" :all-scores {} :relevant-scores {}}
                  search.impl/serialize
                  :dataset_query)))))
