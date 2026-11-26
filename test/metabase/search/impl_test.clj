(ns metabase.search.impl-test
  "There are a lot more tests around search in [[metabase.search.api-test]]. TODO: we should move more of those tests
  into this namespace."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.funnysql.util :as funnysql.util]
   [metabase.lib.core :as lib]
   [metabase.queries-rest.api.card :as api.card]
   [metabase.queries.models.card :as card]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.config :as search.config]
   [metabase.search.core :as search]
   [metabase.search.impl :as search.impl]
   [metabase.search.in-place.legacy :as search.legacy]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.transforms.feature-gating :as transforms.gating]
   [toucan2.core :as t2]))

(deftest ^:parallel parse-engine-test
  (testing "Default engine"
    (is (= "search.engine" (namespace (#'search.impl/parse-engine nil)))))
  (testing "Unknown engine resolves to the default"
    (is (=  (#'search.impl/parse-engine nil)
            (#'search.impl/parse-engine "vespa"))))
  (testing "Registered engines"
    (is (= :search.engine/in-place (#'search.impl/parse-engine "in-place")))
    (when (search/supports-index?)
      (is (= :search.engine/appdb (#'search.impl/parse-engine "appdb"))))
    (testing "Legacy engine name"
      (when (search/supports-index?)
        (is (= :search.engine/fulltext (#'search.impl/parse-engine "fulltext"))))))
  ;; We don't currently leverage subclasses.
  #_(when (search/supports-index?)
      (testing "Subclasses"
        (is (= :search.engine/hybrid (#'search.impl/parse-engine "hybrid"))))))

(deftest vector-search-knobs-absent-test
  ;; threading and gating of the knobs is covered end-to-end in [[metabase.search.api-test]]; this pins the
  ;; contract that search-context must never DEFAULT them -- absence is what lets the semantic engine fall
  ;; back to its setting-backed defaults, and the schema's default-value transformer makes that easy to
  ;; break by adding an innocent-looking :default
  (let [ctx (search.impl/search-context {:current-user-id       1
                                         :is-superuser?         true
                                         :is-impersonated-user? false
                                         :is-sandboxed-user?    false
                                         :is-routed-user?       false
                                         :models                nil
                                         :search-string         "x"})]
    (is (not-any? ctx [:vector-search-strategy :vector-search-ef-search :vector-search-max-scan-tuples
                       :vector-search-explain? :vector-search-force-index?]))))

(deftest ^:parallel order-clause-test
  (testing "it includes all columns and normalizes the query"
    (is (= [[:case
             [:like [:lower :model] (funnysql.util/like-substring "foo")] [:inline 0]
             [:like [:lower :name] (funnysql.util/like-substring "foo")] [:inline 0]
             [:like [:lower :display_name] (funnysql.util/like-substring "foo")] [:inline 0]
             [:like [:lower :description] (funnysql.util/like-substring "foo")] [:inline 0]
             [:like [:lower :collection_name] (funnysql.util/like-substring "foo")] [:inline 0]
             [:like [:lower :collection_type] (funnysql.util/like-substring "foo")] [:inline 0]
             [:like [:lower :display] (funnysql.util/like-substring "foo")] [:inline 0]
             [:like [:lower :display_type] (funnysql.util/like-substring "foo")] [:inline 0]
             [:like [:lower :table_schema] (funnysql.util/like-substring "foo")] [:inline 0]
             [:like [:lower :table_name] (funnysql.util/like-substring "foo")] [:inline 0]
             [:like [:lower :table_display_name] (funnysql.util/like-substring "foo")] [:inline 0]
             [:like [:lower :table_description] (funnysql.util/like-substring "foo")] [:inline 0]
             [:like [:lower :database_name] (funnysql.util/like-substring "foo")] [:inline 0]
             [:like [:lower :model_name] (funnysql.util/like-substring "foo")] [:inline 0]
             [:like [:lower :dataset_query] (funnysql.util/like-substring "foo")] [:inline 0]
             [:like [:lower :slug] (funnysql.util/like-substring "foo")] [:inline 0]
             :else [:inline 1]]]
           (search.legacy/order-clause "Foo")))))

(deftest search-db-call-count-test
  (testing "search takes the same number of DB calls for 1 result of each model and for 3 of each"
    (let [small (mt/random-name)
          large (mt/random-name)]
      (mt/with-temp
        [:model/Card      _ {:name (str "card db 1 " small)}
         :model/Dashboard _ {:name (str "dash 1 " small)}
         :model/Database  _ {:name (str "database 1 " small)}
         :model/Card      _ {:name (str "metric 1 " small) :type :metric}
         :model/Segment   _ {:name (str "segment 1 " small)}
         :model/Card      _ {:name (str "card db 1 " large)}
         :model/Card      _ {:name (str "card db 2 " large)}
         :model/Card      _ {:name (str "card db 3 " large)}
         :model/Dashboard _ {:name (str "dash 1 " large)}
         :model/Dashboard _ {:name (str "dash 2 " large)}
         :model/Dashboard _ {:name (str "dash 3 " large)}
         :model/Database  _ {:name (str "database 1 " large)}
         :model/Database  _ {:name (str "database 2 " large)}
         :model/Database  _ {:name (str "database 3 " large)}
         :model/Card      _ {:name (str "metric 1 " large) :type :metric}
         :model/Card      _ {:name (str "metric 2 " large) :type :metric}
         :model/Card      _ {:name (str "metric 3 " large) :type :metric}
         :model/Segment   _ {:name (str "segment 1 " large)}
         :model/Segment   _ {:name (str "segment 2 " large)}
         :model/Segment   _ {:name (str "segment 3 " large)}]
        (mt/with-current-user (mt/user->id :crowberto)
          (let [counted (fn [search-string]
                          (binding [config/*request-id* (random-uuid)]
                            (t2/with-call-count [call-count]
                              (let [results (search.impl/search {:search-string               search-string
                                                                 :search-engine               :search.engine/in-place
                                                                 :archived?                   false
                                                                 :models                      search.config/all-models
                                                                 :current-user-id             (mt/user->id :crowberto)
                                                                 :is-superuser?               true
                                                                 :is-impersonated-user?       false
                                                                 :is-sandboxed-user?          false
                                                                 :is-routed-user?             false
                                                                 :is-data-analyst?            false
                                                                 :model-ancestors?            false
                                                                 :limit-int                   100
                                                                 :calculate-available-models? false
                                                                 :enabled-transform-source-types (transforms.gating/enabled-source-types)})]
                                [(count (:data results)) (call-count)]))))]
            (search/init-index!)
            (counted small)
            (counted large)
            (let [[small-rows small-calls] (counted small)
                  [large-rows large-calls] (counted large)]
              (is (= [5 15] [small-rows large-rows]))
              (is (= small-calls large-calls)))))))))

(deftest created-at-correctness-test
  (let [search-term   "created-at-filtering"
        new           #t "2023-05-04T10:00Z[UTC]"
        two-years-ago (t/minus new (t/years 2))]
    (mt/with-clock new
      (mt/with-temp
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
                                               :type       :query
                                               :created_at new}
         :model/Action     {action-old :id}   {:name       search-term
                                               :model_id   model-old
                                               :type       :query
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
                                                                  :is-impersonated-user? false
                                                                  :is-sandboxed-user? false
                                                                  :is-routed-user?    false}))
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
      (mt/with-temp
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
                                                :type       :query
                                                :updated_at new}
         :model/Action     {action-old :id}    {:name       search-term
                                                :model_id   model-old
                                                :type       :query
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
                                                                  :is-impersonated-user? false
                                                                  :is-sandboxed-user? false
                                                                  :is-routed-user?    false}))
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

(deftest old-values-removed-from-index
  (when (search/supports-index?)
    (#'search.index/sync-tracking-atoms!)
    (let [search-term (str (random-uuid))]
      (search.tu/with-temp-index-table
        (binding [search.ingestion/*force-sync* true]
          (mt/with-model-cleanup [:model/Card]
            (let [[{card-id :id}] (card/create-cards! [{:creator_id (mt/user->id :rasta)
                                                        :database_id (mt/id)
                                                        :display :table
                                                        :visualization_settings {}
                                                        :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1")
                                                        :name search-term}])]
              (mt/with-current-user (mt/user->id :crowberto)
                (testing "Initially finds the question"
                  (is (= #{["card" card-id]}
                         (->> (search.impl/search (search.impl/search-context
                                                   {:search-string      search-term
                                                    :search-engine      "appdb"
                                                    :archived           false
                                                    :models             search.config/all-models
                                                    :current-user-id    (mt/user->id :crowberto)
                                                    :is-superuser?      true
                                                    :is-impersonated-user? false
                                                    :is-sandboxed-user? false
                                                    :is-routed-user?    false}))
                              :data
                              (map (juxt :model :id))
                              set))))
                (testing "Changing to a different type removes the old value from the index"
                  (api.card/update-card! card-id {:type :model} true)
                  (is (= #{["dataset" card-id]}
                         (->> (search.impl/search (search.impl/search-context
                                                   {:search-string      search-term
                                                    :search-engine      "appdb"
                                                    :archived           false
                                                    :models             search.config/all-models
                                                    :current-user-id    (mt/user->id :crowberto)
                                                    :is-superuser?      true
                                                    :is-impersonated-user? false
                                                    :is-sandboxed-user? false
                                                    :is-routed-user?    false}))
                              :data
                              (map (juxt :model :id))
                              set))))))))))))

(deftest limit-correct-with-permissions
  (let [search-term "permissions-filtering"]
    (mt/with-temp
      [:model/Dashboard _ {:name search-term}
       :model/Card _ {:name search-term}
       :model/Card _ {:name search-term}
       :model/Card _ {:name search-term}
       :model/Card _ {:name search-term}
       :model/Card _ {:name search-term}
       :model/Card _ {:name search-term}
       :model/Card _ {:name search-term}
       :model/Card _ {:name search-term}
       :model/Card _ {:name search-term}
       :model/Card _ {:name search-term}
       :model/Card _ {:name search-term}
       :model/Card _ {:name search-term}
       :model/Card _ {:name search-term}
       :model/Card _ {:name search-term}]
      (testing "searching with limit"
        (mt/with-current-user (mt/user->id :crowberto)
          (with-redefs [search.impl/check-permissions-for-model (fn [_search-ctx search-result]
                                                                  (and (= "card" (:model search-result))
                                                                       (= 0 (mod (:id search-result) 2))))]
            (let [result (->> (search.impl/search (search.impl/search-context
                                                   {:search-string      search-term
                                                    :limit              4
                                                    :search-engine      "in-place"
                                                    :archived           false
                                                    :models             search.config/all-models
                                                    :current-user-id    (mt/user->id :crowberto)
                                                    :is-superuser?      true
                                                    :is-impersonated-user? false
                                                    :is-sandboxed-user? false
                                                    :is-routed-user?    false}))
                              :data
                              (map (juxt :model :id))
                              set)]
              (is (= 4 (count result)))
              (doseq [[model id] result]
                (is (= "card" model))
                (is (= 0 (mod id 2)))))))))))

(deftest indexed-entity-without-hydrated-checks-is-denied-test
  (testing "An indexed entity that `hydrate-checks` did not tag is denied, and the denial is logged"
    (mt/with-log-messages-for-level [messages [metabase.search.impl :warn]]
      (is (false? (#'search.impl/check-permissions-for-model
                   {:current-user-id (mt/user->id :crowberto), :is-superuser? true}
                   {:model "indexed-entity", :id 1, :database_id (mt/id)})))
      (is (=? [{:message #"Denying an indexed entity search result that was not tagged by hydrate-checks"}]
              (messages))))))

(deftest indexed-entity-without-database-is-denied-quietly-test
  (testing "An indexed entity with no database is tagged by `hydrate-checks`, so its denial is not logged"
    (mt/with-log-messages-for-level [messages [metabase.search.impl :warn]]
      (let [search-ctx {:current-user-id (mt/user->id :crowberto), :is-superuser? true}
            [row]      (#'search.impl/hydrate-checks search-ctx :read [{:model "indexed-entity", :id 1, :database_id nil}])]
        (is (false? (#'search.impl/check-permissions-for-model search-ctx row)))
        (is (= [] (messages)))))))
