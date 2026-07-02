(ns metabase.metabot.tools.search-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.metadata.jvm :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.search :as search]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.search.core :as search-core]
   [metabase.search.engine :as search.engine]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;; ---- postprocess-search-result: one deftest per entity type ----
;;
;; Each test feeds a raw search-index row through postprocess-search-result and asserts
;; the entity-shaped output. Curation flags (`official_collection`, `verified`) are
;; always present (default false), `is_container` only on dashboard/collection results.

(deftest ^:parallel postprocess-search-result-table-test
  (let [result   {:model "table"
                  :id 1
                  :table_name "orders"
                  :name "Orders"
                  :description "Order table"
                  :database_id 42
                  :table_schema "public"
                  :updated_at "2024-01-01"
                  :created_at "2024-01-01"}
        expected {:id 1
                  :type "table"
                  :name "orders"
                  :display_name "Orders"
                  :description "Order table"
                  :database_id 42
                  :database_schema "public"
                  :official_collection false
                  :verified false
                  :official false
                  :data_authority nil
                  :updated_at "2024-01-01"
                  :created_at "2024-01-01"}]
    (is (= expected (#'search/postprocess-search-result result)))))

(deftest ^:parallel postprocess-search-result-curation-signals-test
  (testing "non-null curation signals (curated, official collection, table data_authority + data_layer) carried through"
    (is (=? {:type           "table"
             :curated        true
             :official       true
             :data_authority "authoritative"
             :data_layer     "final"}
            (#'search/postprocess-search-result
             {:model               "table"
              :id                  9
              :table_name          "Gold"
              :name                "Gold"
              :database_id         1
              :table_schema        "public"
              :curated             true
              :official_collection true
              :data_authority      "authoritative"
              :data_layer          "final"
              :collection          {:id 3 :name "Official" :authority_level "official"}})))))

(deftest ^:parallel search-result-xml-renders-curation-signals-test
  (testing "the XML the LLM actually sees carries curated/data_layer/data_authority for a table result —
            the render path that was a no-op until these reached search results (BOT-1570)"
    (let [result (#'search/postprocess-search-result
                  {:model               "table"
                   :id                  9
                   :table_name          "Gold"
                   :name                "Gold"
                   :database_id         1
                   :table_schema        "public"
                   :curated             true
                   :official_collection true
                   :data_authority      "authoritative"
                   :data_layer          "final"
                   :collection          {:id 3 :name "Official" :authority_level "official"}})
          xml    (llm-shape/search-result->xml result)]
      (is (str/includes? xml "is_curated=\"true\""))
      (is (str/includes? xml "is_official=\"true\""))
      (is (str/includes? xml "data_layer=\"final\""))
      (is (str/includes? xml "data_authority=\"authoritative\"")))))

(deftest ^:parallel postprocess-search-result-model-test
  (let [result   {:model "dataset"
                  :id 2
                  :name "Sales Model"
                  :description "Model for sales"
                  :database_id 43
                  :verified true
                  :collection nil
                  :updated_at "2024-01-02"
                  :created_at "2024-01-02"}
        expected {:id 2
                  :type "model"
                  :name "Sales Model"
                  :description "Model for sales"
                  :database_id 43
                  :official_collection false
                  :verified true
                  :official false
                  :collection {}
                  :updated_at "2024-01-02"
                  :created_at "2024-01-02"}]
    (is (= expected (#'search/postprocess-search-result result)))))

(deftest ^:parallel postprocess-search-result-transform-test
  (let [result   {:model "transform"
                  :id 3
                  :name "User Transform"
                  :description "Transform for users"
                  :database_id 44
                  :updated_at "2024-01-03"
                  :created_at "2024-01-03"}
        expected {:id 3
                  :type "transform"
                  :name "User Transform"
                  :description "Transform for users"
                  :database_id 44
                  :official_collection false
                  :verified false
                  :updated_at "2024-01-03"
                  :created_at "2024-01-03"}]
    (is (= expected (#'search/postprocess-search-result result)))))

(deftest ^:parallel postprocess-search-result-dashboard-test
  (let [result   {:model "dashboard"
                  :id 3
                  :name "Main Dashboard"
                  :description "Dashboard desc"
                  :verified false
                  :official_collection true
                  :collection {:id 10 :name "Finance" :authority_level "official"}
                  :updated_at "2024-01-03"
                  :created_at "2024-01-03"}
        expected {:id 3
                  :type "dashboard"
                  :name "Main Dashboard"
                  :description "Dashboard desc"
                  :verified false
                  :official_collection true
                  :official true
                  :collection {:id 10 :name "Finance" :authority_level "official"}
                  :is_container true
                  :updated_at "2024-01-03"
                  :created_at "2024-01-03"}]
    (is (= expected (#'search/postprocess-search-result result)))))

(deftest ^:parallel postprocess-search-result-card-test
  (testing "card with moderated_status normalises to verified=true"
    (let [result   {:model "card"
                    :id 4
                    :name "Q1"
                    :description "Question desc"
                    :moderated_status "verified"
                    :collection {:id 11 :name "Analytics" :authority_level nil}
                    :updated_at "2024-01-04"
                    :created_at "2024-01-04"}
          expected {:id 4
                    :type "question"
                    :name "Q1"
                    :description "Question desc"
                    :database_id nil
                    :official_collection false
                    :verified true
                    :official false
                    :collection {:id 11 :name "Analytics" :authority_level nil}
                    :updated_at "2024-01-04"
                    :created_at "2024-01-04"}]
      (is (= expected (#'search/postprocess-search-result result))))))

(deftest ^:parallel postprocess-search-result-metric-test
  (let [result   {:model "metric"
                  :id 5
                  :name "Revenue"
                  :description "Metric desc"
                  :verified nil
                  :updated_at "2024-01-05"
                  :created_at "2024-01-05"}
        expected {:id 5
                  :type "metric"
                  :name "Revenue"
                  :description "Metric desc"
                  :database_id nil
                  :official_collection false
                  :verified false
                  :official false
                  :collection {}
                  :updated_at "2024-01-05"
                  :created_at "2024-01-05"}]
    (is (= expected (#'search/postprocess-search-result result)))))

(deftest ^:parallel postprocess-search-result-database-test
  (let [result   {:model "database"
                  :id 6
                  :name "Production DB"
                  :description "Main database"
                  :updated_at "2024-01-06"
                  :created_at "2024-01-06"}
        expected {:id 6
                  :type "database"
                  :name "Production DB"
                  :description "Main database"
                  :official_collection false
                  :verified false
                  :updated_at "2024-01-06"
                  :created_at "2024-01-06"}]
    (is (= expected (#'search/postprocess-search-result result)))))

(deftest ^:parallel postprocess-search-result-collection-test
  (let [result   {:model "collection"
                  :id 7
                  :name "Marketing"
                  :description "Marketing collection"
                  :authority_level "official"
                  :location "/"
                  :official_collection true
                  :updated_at "2024-01-07"
                  :created_at "2024-01-07"}
        expected {:id 7
                  :type "collection"
                  :name "Marketing"
                  :description "Marketing collection"
                  :authority_level "official"
                  :location "/"
                  :official_collection true
                  :verified false
                  :official true
                  :is_container true
                  :updated_at "2024-01-07"
                  :created_at "2024-01-07"}]
    (is (= expected (#'search/postprocess-search-result result)))))

(deftest search-native-query-test
  (mt/with-test-user :rasta
    (with-redefs [perms/impersonated-user? (fn [] false)
                  perms/sandboxed-user? (fn [] false)
                  api/*current-user-id* 1]
      (testing ":search-native-query is included in context when true"
        (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                         (is (true? (:search-native-query context)))
                                                         {:data []})]
          (search/search {:query "test"
                          :entity-types ["card"]
                          :search-native-query true})))
      (testing ":search-native-query is not included in context when nil or false"
        (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                         (is (not (contains? context :search-native-query)))
                                                         {:data []})]
          (search/search {:query "test"
                          :entity-types ["card"]
                          :search-native-query false})
          (search/search {:query "test"
                          :entity-types ["card"]
                          :search-native-query nil}))))))

(deftest tool-default-entity-types-test
  (testing "tool variants restrict default entity types to their allowed set"
    (mt/with-test-user :rasta
      (with-redefs [perms/impersonated-user? (fn [] false)
                    perms/sandboxed-user? (fn [] false)
                    api/*current-user-id* 1]
        (testing "nlq-search-tool with no entity_types searches table/model/metric/measure/segment/question/collection"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured (:models context))
                                                             {:data []})]
              (search/nlq-search-tool {:query "x"}))
            (is (= #{"table" "dataset" "metric" "measure" "segment" "card" "collection"} @captured))
            (is (not (contains? @captured "dashboard")))
            (is (not (contains? @captured "transform")))
            (is (not (contains? @captured "database")))))
        (testing "sql-search-tool with no entity_types searches only table/model"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured (:models context))
                                                             {:data []})]
              (search/sql-search-tool {:query "x" :database_id 1}))
            (is (= #{"table" "dataset"} @captured))))
        (testing "agent-supplied entity_types narrow the default allowed set"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured (:models context))
                                                             {:data []})]
              (search/nlq-search-tool {:query "x" :entity_types ["metric"]}))
            (is (= #{"metric"} @captured))))))))

(deftest tool-scope-args-test
  (testing "search-tool surfaces database_id/collection_id scope args to the search context"
    (mt/with-test-user :rasta
      (with-redefs [perms/impersonated-user? (fn [] false)
                    perms/sandboxed-user? (fn [] false)
                    api/*current-user-id* 1]
        (testing "database_id is forwarded as :table-db-id"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured context)
                                                             {:data []})]
              (search/search-tool {:query "x" :database_id 42}))
            (is (= 42 (:table-db-id @captured)))))
        (testing "collection_id is forwarded as :collection (descendant scope)"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured context)
                                                             {:data []})]
              (search/search-tool {:query "x" :collection_id 7}))
            (is (= 7 (:collection @captured)))))))))

(deftest tool-limit-test
  (testing "tool variants apply the :limit arg with default 25 and cap 50"
    (mt/with-test-user :rasta
      (with-redefs [perms/impersonated-user? (fn [] false)
                    perms/sandboxed-user? (fn [] false)
                    api/*current-user-id* 1]
        (testing "default limit is 25 when not provided (grep-style: agent scans and picks)"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured (:limit-int context))
                                                             {:data []})]
              (search/search-tool {:query "x"}))
            (is (= 25 @captured))))
        (testing "explicit limit is honored"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured (:limit-int context))
                                                             {:data []})]
              (search/search-tool {:query "x" :limit 10}))
            (is (= 10 @captured))))
        (testing "limit above 50 is rejected by schema validation"
          (is (thrown? Exception
                       (search/search-tool {:query "x" :limit 75}))))
        (testing "limit below 1 is rejected by schema validation"
          (is (thrown? Exception
                       (search/search-tool {:query "x" :limit 0}))))))))

(deftest other-user-collection-test
  (testing "excludes entities from other users' collections"
    (mt/with-test-user :crowberto
      (search.tu/with-temp-index-table
        (let [admins-coll-id (t2/select-one-pk :model/Collection :personal_owner_id api/*current-user-id*)
              others-coll-id (t2/select-one-pk :model/Collection :personal_owner_id (mt/user->id :rasta))]
          (mt/with-temp [:model/Collection {public-coll-id :id} {}
                         :model/Dashboard  {dash-id-1 :id}      {:name "Our Dashboard",  :collection_id public-coll-id}
                         :model/Dashboard  {dash-id-2 :id}      {:name "My Dashboard",   :collection_id admins-coll-id}
                         :model/Dashboard  {dash-id-3 :id}      {:name "Your Dashboard", :collection_id others-coll-id}]
            (let [test-dashboard-ids #{dash-id-1 dash-id-2 dash-id-3}]
              (is (= #{"Our Dashboard" "My Dashboard"}
                     (->> (search/search {:query "Dashboard"})
                          (filter (fn [{:keys [id type]}] (and (= "dashboard" type) (contains? test-dashboard-ids id))))
                          (map :name)
                          (set)))))))))))

(deftest enrich-with-collection-descriptions-test
  (mt/with-premium-features #{:content-verification}
    (mt/with-test-user :crowberto
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Collection {finance-coll-id :id} {:name "Finance Team"
                                                                :description "Finance team collection"}
                       :model/Collection {analytics-coll-id :id} {:name "Analytics"
                                                                  :description "Analytics collection"}
                       :model/Collection {no-desc-coll-id :id} {:name "No Description"}
                       :model/Dashboard {dash-1-id :id} {:name "Finance Dashboard"
                                                         :collection_id finance-coll-id}
                       :model/Dashboard {dash-2-id :id} {:name "Analytics Dashboard"
                                                         :collection_id analytics-coll-id}
                       :model/Dashboard {dash-3-id :id} {:name "No Desc Dashboard"
                                                         :collection_id no-desc-coll-id}]
          (testing "search results include collection descriptions"
            (let [results (search/search {:query "Dashboard"})
                  test-dashboard-ids #{dash-1-id dash-2-id dash-3-id}
                  test-results (->> results
                                    (filter (fn [{:keys [id type]}]
                                              (and (= "dashboard" type)
                                                   (contains? test-dashboard-ids id)))))]
              (testing "includes collection descriptions when present"
                (let [finance-dash (u/seek #(= dash-1-id (:id %)) test-results)
                      analytics-dash (u/seek #(= dash-2-id (:id %)) test-results)]
                  (is (= "Finance team collection" (get-in finance-dash [:collection :description])))
                  (is (= "Analytics collection" (get-in analytics-dash [:collection :description])))))
              (testing "handles nil collection descriptions"
                (let [no-desc-dash (u/seek #(= dash-3-id (:id %)) test-results)]
                  (is (nil? (get-in no-desc-dash [:collection :description])))
                  (is (= "No Description" (get-in no-desc-dash [:collection :name]))))))))))))

(deftest library-membership-test
  (testing "library_member reflects real curation, gated on the :library feature"
    (mt/with-premium-features #{:library}
      (mt/with-temp [:model/Collection {lib-coll-id :id}      {:name "Lib Coll" :type "library"}
                     :model/Collection {official-coll-id :id} {:name "Official Coll" :authority_level "official"}
                     :model/Database   {db-id :id}            {}
                     :model/Table      {final-table-id :id}    {:db_id db-id :data_layer :final}
                     :model/Table      {internal-table-id :id} {:db_id db-id :data_layer :internal}]
        (testing "collection items: true when the root collection is a library type, not merely shared/official"
          (let [by-id (u/index-by :id
                                  (mt/with-test-user :crowberto
                                    (#'search/enrich-with-collection-paths
                                     [{:type "model" :id 1 :collection {:id lib-coll-id}}
                                      {:type "model" :id 2 :collection {:id official-coll-id}}])))]
            (is (true?  (:library_member (by-id 1))) "item in a library collection")
            (is (false? (:library_member (by-id 2))) "item in an official (non-library) collection")))
        (testing "tables: true only when the data layer is :final"
          (let [by-id (u/index-by :id
                                  (#'search/enrich-tables-with-data-layer
                                   [{:type "table" :id final-table-id}
                                    {:type "table" :id internal-table-id}]))]
            (is (true?  (:library_member (by-id final-table-id)))    ":final tables are library members")
            (is (false? (:library_member (by-id internal-table-id))) ":internal tables are not"))))))
  (testing "without the :library feature, tables are not flagged"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {t-id :id} {:db_id db-id :data_layer :final}]
        (is (nil? (:library_member (first (#'search/enrich-tables-with-data-layer
                                           [{:type "table" :id t-id}])))))))))

(deftest collection-path-respects-read-permissions-test
  (testing "collection_path omits ancestor collections the current user can't read (no name leak)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta)
                                                          :group_id group-id}
                     :model/Collection parent-coll {:name "Secret Parent"}
                     :model/Collection child-coll  {:name "Visible Child"
                                                    :location (collection/location-path parent-coll)}]
        ;; rasta can read the child but NOT the parent.
        (perms/grant-collection-read-permissions! group-id child-coll)
        (let [path-for (fn [user]
                         (-> (mt/with-test-user user
                               (#'search/enrich-with-collection-paths
                                [{:type "model" :id 1 :collection {:id (:id child-coll)}}]))
                             first
                             :collection_path))]
          (testing "an admin who can read the whole chain sees the full path"
            (is (= "Secret Parent/Visible Child" (path-for :crowberto))))
          (testing "a user without read access to the parent only sees the readable leaf"
            (let [rasta-path (path-for :rasta)]
              (is (= "Visible Child" rasta-path))
              (is (not (str/includes? rasta-path "Secret Parent"))
                  "the unreadable ancestor's name must not leak into collection_path"))))))))

(deftest ^:parallel broaden-query-test
  (testing "zero-hit fallback OR-joins meaningful tokens, skipping queries where broadening doesn't apply"
    (are [in out] (= out (#'search/broaden-query in))
      "hard bounce rate campaign" "hard or bounce or rate or campaign"  ; every word ANDed -> OR-join
      "the rate of churn"         "rate or churn"                        ; stopwords dropped
      "Rate OF Churn"             "Rate or Churn"                        ; stopword match is case-insensitive
      "revenue"                   nil                                    ; single token, nothing to broaden
      "a or b"                    nil                                    ; already an OR query
      "Orders OR Revenue"         nil                                    ; `or` match is case-insensitive too
      "\"monthly revenue\""       nil                                    ; quoted = deliberate exact match
      "sales, revenue"            "sales or revenue"                     ; clinging edge punctuation is stripped
      "sales -refunds"            "sales or refunds"                     ; leading `-` stripped: the fallback deliberately ignores negation intent
      "the of for"                nil                                    ; collapses to <2 tokens after stopwords
      ""                          nil
      nil                         nil)))

(deftest broaden-query-retry-wiring-test
  ;; `with-test-user` wraps the whole test so the app DB is initialized *before* any `with-redefs`
  ;; below stubs `mdb/db-type` — otherwise a lazy DB init inside the redef window would see the H2
  ;; test DB reporting itself as `:postgres` and fail the version check.
  (mt/with-test-user :crowberto
    (testing "a zero-hit search retries once with the broadened query — but only on a Postgres appdb engine"
      (let [calls       (atom [])
            fake-search (fn [ctx] (swap! calls conj (:search-string ctx)) {:data []})
            run!        (fn [engines default db-type]
                          (reset! calls [])
                          (with-redefs [search-core/search           fake-search
                                        search.engine/active-engines (constantly engines)
                                        search.engine/default-engine (constantly default)
                                        mdb/db-type                  (constantly db-type)
                                        ;; No metabot-id and always-empty results, so the metabot
                                        ;; row is irrelevant; stub the lookup (the `:model/Metabot`
                                        ;; table isn't present in the OSS test DB).
                                        t2/select-one                (constantly nil)]
                            (#'search/search {:query "hard bounce rate"}))
                          @calls)]
        (testing "Postgres appdb: empty primary triggers a second call with the OR-broadened string"
          (is (= ["hard bounce rate" "hard or bounce or rate"]
                 (run! #{:search.engine/appdb} :search.engine/appdb :postgres))))
        (testing "appdb on H2 does NOT retry — its LIKE-AND token semantics make the OR-join narrower, not broader"
          (is (= ["hard bounce rate"]
                 (run! #{:search.engine/appdb} :search.engine/appdb :h2))))
        (testing "semantic engine does NOT retry — it already fuses keyword + vector matching"
          (is (= ["hard bounce rate"]
                 (run! #{:search.engine/semantic :search.engine/appdb} :search.engine/appdb :postgres))))
        (testing "in-place engine does NOT retry — LIKE-pattern matching has no `|` notion"
          (is (= ["hard bounce rate"]
                 (run! #{:search.engine/in-place} :search.engine/in-place :postgres))))))))

(deftest enrich-with-portable-entity-ids-test
  (testing "saved-question and model search results expose `portable_entity_id` (the card's NanoID)\nso the LLM can use it verbatim as `source-card:` without a follow-up entity_details call"
    (mt/with-test-user :crowberto
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Card {q-id :id q-eid :entity_id} {:name "PortableEID Sample Question"
                                                                :type :question
                                                                :database_id (mt/id)
                                                                :table_id    (mt/id :orders)
                                                                :dataset_query {:database (mt/id)
                                                                                :type     :query
                                                                                :query    {:source-table (mt/id :orders)
                                                                                           :aggregation  [[:count]]}}}
                       :model/Card {m-id :id m-eid :entity_id} {:name "PortableEID Sample Model"
                                                                :type :model
                                                                :database_id (mt/id)
                                                                :table_id    (mt/id :orders)
                                                                :dataset_query {:database (mt/id)
                                                                                :type     :query
                                                                                :query    {:source-table (mt/id :orders)}}}
                       :model/Dashboard {dash-id :id} {:name "PortableEID Sample Dashboard"}]
          (let [results      (search/search {:query "PortableEID Sample"})
                by-id        (u/index-by (juxt :id :type) results)
                question-res (get by-id [q-id "question"])
                model-res    (get by-id [m-id "model"])
                dash-res     (get by-id [dash-id "dashboard"])]
            (testing "question results carry :portable_entity_id copied from the card's entity_id"
              (is (some? question-res) "expected the question to appear in search results")
              (is (= q-eid (:portable_entity_id question-res))))
            (testing "model results carry :portable_entity_id too"
              (is (some? model-res) "expected the model to appear in search results")
              (is (= m-eid (:portable_entity_id model-res))))
            (testing "dashboard results do NOT get :portable_entity_id (source-card only accepts cards)"
              (is (some? dash-res) "expected the dashboard to appear in search results")
              (is (not (contains? dash-res :portable_entity_id))))))))))

(deftest entity-refs->search-results-test
  (testing "hydrates {:model :id} refs (as stored by the semantic layer) into enriched search records"
    (mt/with-test-user :crowberto
      (mt/with-temp [:model/Card {m-id :id m-eid :entity_id}
                     {:name "Hydrate Sample Model" :type :model
                      :database_id (mt/id) :table_id (mt/id :orders)
                      :dataset_query {:database (mt/id) :type :query
                                      :query {:source-table (mt/id :orders)}}}]
        (mt/with-temp [:model/Card {q-id :id} {:name "Hydrate Sample Question"
                                               :database_id (mt/id) :table_id (mt/id :orders)
                                               :dataset_query {:database (mt/id) :type :query
                                                               :query {:source-table (mt/id :orders)}}}]
          (let [results (search/entity-refs->search-results
                         [{:model "model" :id m-id}
                          {:model "table" :id (mt/id :orders)}
                          {:model "card" :id q-id}              ; normalized to "question"
                          {:model "model" :id Integer/MAX_VALUE}]) ; nonexistent → dropped
                by-id   (u/index-by (juxt :type :id) results)]
            (testing "model ref hydrates with type, name, and portable_entity_id"
              (is (=? {:type "model" :name "Hydrate Sample Model" :portable_entity_id m-eid
                       :database_id (mt/id)}
                      (get by-id ["model" m-id]))))
            (testing "table ref hydrates with type table and a database name"
              (is (=? {:type "table" :database_id (mt/id) :database_name string?}
                      (get by-id ["table" (mt/id :orders)]))))
            (testing "a card ref hydrates as the agent-facing type question"
              (is (=? {:type "question" :name "Hydrate Sample Question"}
                      (get by-id ["question" q-id]))))
            (testing "refs whose entity no longer exists are dropped"
              (is (= 3 (count results))))))))))

(deftest entity-refs->search-results-same-card-two-types-test
  (testing "a card referenced under two (possibly stale) type strings collapses to one record with its current type"
    (mt/with-test-user :crowberto
      (mt/with-temp [:model/Card {c-id :id} {:name "Dual Typed" :type :model
                                             :database_id (mt/id) :table_id (mt/id :orders)
                                             :dataset_query {:database (mt/id) :type :query
                                                             :query {:source-table (mt/id :orders)}}}]
        (let [results (search/entity-refs->search-results
                       [{:model "model" :id c-id} {:model "metric" :id c-id}])]
          (is (= [["model" c-id]] (map (juxt :type :id) results))
              "one record, carrying the card's current type"))))))

(deftest entity-refs->search-results-respects-read-perms-test
  (testing "hydration drops entities the current user can't read — a curated entry may point at a restricted one"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {restricted-id :id}
                     {:name "Secret Card" :collection_id coll-id
                      :database_id (mt/id) :table_id (mt/id :orders)
                      :dataset_query {:database (mt/id) :type :query
                                      :query {:source-table (mt/id :orders)}}}]
        (let [refs [{:model "card" :id restricted-id}]]
          (testing "a superuser can read it"
            (mt/with-test-user :crowberto
              (is (= [restricted-id] (map :id (search/entity-refs->search-results refs))))))
          (testing "a user without access to its collection does not see it"
            (mt/with-test-user :rasta
              (is (empty? (search/entity-refs->search-results refs))))))))))

(deftest enrich-with-base-tables-test
  (testing (str "Metric search results carry `base_table_*` fields so the LLM can write\n"
                "`source-table:` without a separate entity_details call. We look up\n"
                "`report_card.table_id` → `metabase_table.{schema,name}` and assemble the\n"
                "portable FK `[database_name, schema, table_name]`. This closes the failure\n"
                "mode where the LLM saw a metric in search, had its portable_entity_id, but\n"
                "hallucinated the base table (`[<db>, public, customers]`).")
    (mt/with-test-user :crowberto
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Card {metric-id :id} {:name        "BaseTable Sample Metric"
                                                    :type        :metric
                                                    :database_id (mt/id)
                                                    :table_id    (mt/id :orders)
                                                    :dataset_query
                                                    {:database (mt/id)
                                                     :type     :query
                                                     :query    {:source-table (mt/id :orders)
                                                                :aggregation  [[:count]]}}}]
          (let [results   (search/search {:query "BaseTable Sample Metric"})
                by-id     (u/index-by (juxt :id :type) results)
                metric-res (get by-id [metric-id "metric"])
                db-name   (t2/select-one-fn :name :model/Database :id (mt/id))
                orders-t  (t2/select-one [:model/Table :schema :name] :id (mt/id :orders))]
            (is (some? metric-res) "metric should appear in search results")
            (testing "base_table_* fields are populated"
              (is (= (mt/id :orders) (:base_table_id metric-res)))
              (is (= (:name orders-t) (:base_table_name metric-res)))
              (is (= (:schema orders-t) (:base_table_schema metric-res))))
            (testing "base_table_portable_fk is `[database_name, schema, table_name]`"
              (is (= [db-name (:schema orders-t) (:name orders-t)]
                     (:base_table_portable_fk metric-res))))))))))

(deftest ^:parallel measure-segment-base-tables-test
  (testing (str "Measures and segments reach the LLM with the same `base_table_*` affordance as\n"
                "metrics, but via a different path: their search row already carries the join'd\n"
                "table fields, so postprocess-search-result copies `:table_*` through as\n"
                "`:base_table_*`, and enrich-with-base-tables only assembles the portable FK\n"
                "once `:database_name` is set. (enrich's metric branch does a DB lookup; the\n"
                "measure/segment branch is pure, so this needs no index.)")
    (doseq [model ["measure" "segment"]]
      (testing model
        (let [raw  {:model              model
                    :id                 7
                    :name               (str "Sample " model)
                    :description        "desc"
                    :database_id        10
                    :table_id           42
                    :table_name         "orders"
                    :table_schema       "public"
                    :table_display_name "Orders"}
              post (#'search/postprocess-search-result raw)]
          (testing "postprocess copies the join'd table fields through as :base_table_*"
            (is (=? {:type                    model
                     :database_id             10
                     :base_table_id           42
                     :base_table_name         "orders"
                     :base_table_schema       "public"
                     :base_table_display_name "Orders"}
                    post)))
          (testing "enrich-with-base-tables assembles the portable FK once :database_name is known"
            (let [enriched (first (#'search/enrich-with-base-tables
                                   [(assoc post :database_name "My DB")]))]
              (is (= ["My DB" "public" "orders"] (:base_table_portable_fk enriched))))))))))

(deftest remove-unreadable-transforms-test
  (testing "remove-unreadable-transforms correctly filters transforms based on source database access"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Database {db-id :id} {}]
        (let [mp (lib-be/application-database-metadata-provider db-id)]
          (mt/with-temp [:model/Transform {transform-id :id}
                         {:name   "Test Transform"
                          :source {:type  "query"
                                   :query (lib/native-query mp "SELECT 1")}}]
            (let [mock-results [{:id transform-id :type "transform" :name "Test Transform"}
                                {:id 999 :type "dashboard" :name "Some Dashboard"}]]
              (testing "keeps transforms when user can query the source database"
                (mt/with-test-user :crowberto
                  (let [results (#'search/remove-unreadable-transforms mock-results)]
                    (is (= 2 (count results))))))
              (testing "filters out transforms when user cannot query the source database"
                (mt/with-user-in-groups [group {:name "No Query Access"}
                                         user [group]]
                  (mt/with-db-perm-for-group! (perms-group/all-users) db-id :perms/create-queries :no
                    (mt/with-db-perm-for-group! group db-id :perms/create-queries :no
                      (binding [api/*current-user-id* (:id user)]
                        (let [results (#'search/remove-unreadable-transforms mock-results)]
                          (is (= 1 (count results)))
                          (is (= "dashboard" (:type (first results)))))))))))))))))

(deftest weight-override-test
  (testing "weights can be overridden on a per-tool-call basis"
    (mt/with-test-user :crowberto
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Collection {coll-id :id} {}
                       :model/Dashboard  {id-1 :id}    {:name "Regular Dash (sh1b0le#h)",    :collection_id coll-id}
                       :model/Dashboard  {id-2 :id}    {:name "Bookmarked Dash (sh1b0le#h)", :collection_id coll-id}
                       :model/DashboardBookmark _      {:dashboard_id id-2, :user_id api/*current-user-id*}]
          (let [base-query   {:query "sh1b0le#h", :entity-types ["dashboard"]}
                test-entity? (comp #{id-1 id-2} :id)
                query        (fn [& [weights]]
                               (->> (search/search (assoc base-query :weights weights))
                                    (filter test-entity?)
                                    (map (comp first #(str/split % #"\s") :name))))]
            (is (= ["Bookmarked" "Regular"] (query)))
            (is (= ["Regular" "Bookmarked"] (query {:bookmarked -1})))))))))

(deftest card-ref-hydration-emits-current-string-type-test
  (testing "a card ref hydrates to the Card's CURRENT type as a string — not the stale ref type, not a keyword"
    ;; regression: a stale index hit across a metric<->model relabel must describe the entity by its current
    ;; shape, and the type must be the agent-facing string (a :model keyword breaks entity-class + enrichers).
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {card-id :id} {:type :model}]
        (let [[result] (search/entity-refs->search-results [{:model "metric" :id card-id}])]
          (is (= "model" (:type result)))
          (is (string? (:type result))))))))
