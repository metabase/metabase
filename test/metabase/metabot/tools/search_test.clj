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
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest ^:parallel search-display-test
  (testing "surfaces the query as the search object (client owns the verb/tense)"
    (is (= "revenue" (#'search/search-display {:query "revenue"}))))
  (testing "no query -> nil"
    (is (nil? (#'search/search-display {})))
    (is (nil? (#'search/search-display {:query ""})))))

(deftest ^:parallel search-result->item-test
  (testing "trims a result to the fields the results card renders, nesting collection id+name"
    (is (= {:id 1 :type "table" :name "orders" :display_name "Orders"
            :database_id 2 :database_schema "PUBLIC" :database_name "Sample"
            :collection {:id 3 :name "Finance"}}
           (#'search/search-result->item
            {:id 1 :type "table" :name "orders" :display_name "Orders"
             :database_id 2 :database_schema "PUBLIC" :database_name "Sample"
             :collection {:id 3 :name "Finance" :authority_level nil}
             :score 0.99 :description "wide table"}))))
  (testing "no collection -> no collection key"
    (is (= {:id 5 :type "dashboard" :name "Revenue"}
           (#'search/search-result->item
            {:id 5 :type "dashboard" :name "Revenue" :collection nil}))))
  (testing "carries a question's display (as a string) + moderated_status for the exact icon"
    (is (= {:id 7 :type "question" :name "Revenue" :display "line"
            :moderated_status "verified"}
           (#'search/search-result->item
            {:id 7 :type "question" :name "Revenue" :display :line
             :moderated_status "verified"})))))

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
              :curated                    true
              :collection_authority_level "official"
              :data_authority             "authoritative"
              :data_layer                 "final"
              :collection                 {:id 3 :name "Official" :authority_level "official"}})))))

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
                   :curated                    true
                   :collection_authority_level "official"
                   :data_authority             "authoritative"
                   :data_layer                 "final"
                   :collection                 {:id 3 :name "Official" :authority_level "official"}})
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
                  :can_write false
                  :collection_authority_level "official"
                  :collection {:id 10 :name "Finance" :authority_level "official"}
                  :updated_at "2024-01-03"
                  :created_at "2024-01-03"}
        expected {:id 3
                  :type "dashboard"
                  :name "Main Dashboard"
                  :description "Dashboard desc"
                  :verified false
                  :can_write false
                  :official_collection true
                  :official true
                  :collection {:id 10 :name "Finance" :authority_level "official"}
                  :is_container true
                  :updated_at "2024-01-03"
                  :created_at "2024-01-03"}]
    (is (= expected (#'search/postprocess-search-result result)))))

(deftest ^:parallel postprocess-document-search-result-test
  (testing "document result postprocessing"
    (let [result   {:model                      "document"
                    :id                         8
                    :name                       "Quarterly plan"
                    :can_write                  false
                    :collection_authority_level "official"
                    :collection                 {:id 10 :name "Finance" :authority_level "official"}
                    :updated_at                 "2024-01-03"
                    :created_at                 "2024-01-02"}
          expected {:id                  8
                    :type                "document"
                    :name                "Quarterly plan"
                    :description         nil
                    :can_write           false
                    :official_collection true
                    :verified            false
                    :official            true
                    :collection          {:id 10 :name "Finance" :authority_level "official"}
                    :updated_at          "2024-01-03"
                    :created_at          "2024-01-02"}]
      (is (= expected (#'search/postprocess-search-result result))))))

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
                    :moderated_status "verified"
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
                  :collection_authority_level "official"
                  :location "/"
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

(deftest weights-always-reach-the-search-context-test
  ;; `weights` is merged with `metabot-weight-overrides` before the context is built, so it can never
  ;; be nil — which is why the `cond->` guard that used to wrap it was dead. Asserted rather than
  ;; reasoned about, since dropping the guard relies on it.
  (testing "the curator-boost overrides are always applied, with caller weights winning per key"
    (mt/with-test-user :rasta
      (with-redefs [perms/impersonated-user? (fn [] false)
                    perms/sandboxed-user? (fn [] false)
                    api/*current-user-id* 1]
        (testing "no caller weights -> the overrides alone"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured (:weights context))
                                                             {:data []})]
              (search/search {:query "x"}))
            (is (=? {:official-collection 4 :verified 5 :view-count 3} @captured))))
        (testing "caller weights override per key, leaving the rest of the boosts in place"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured (:weights context))
                                                             {:data []})]
              (search/search {:query "x" :weights {:verified 99}}))
            (is (=? {:official-collection 4 :verified 99 :view-count 3} @captured))))))))

(deftest entity-refs-ignore-transform-refs-test
  ;; `entity-refs->search-results` has no transform branch, which is why dropping
  ;; `remove-unreadable-transforms` from its pipeline was safe. Pin that: a transform ref must
  ;; produce nothing rather than an unfiltered record.
  (testing "a transform ref yields no result, so there is nothing for a transform filter to remove"
    (mt/with-test-user :crowberto
      (is (empty? (search/entity-refs->search-results [{:model "transform" :id 1}]))))))

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
        (testing "general search includes documents in its default entity types"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured (:models context))
                                                             {:data []})]
              (search/search-tool {:query "x"}))
            (is (contains? @captured "document"))))
        (testing "agent-supplied entity_types narrow the default allowed set"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured (:models context))
                                                             {:data []})]
              (search/nlq-search-tool {:query "x" :entity_types ["metric"]}))
            (is (= #{"metric"} @captured))))
        (testing "NLQ search accepts document and dashboard destination types"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured (:models context))
                                                             {:data []})]
              (search/nlq-search-tool {:query        "plan"
                                       :entity_types ["document" "dashboard"]}))
            (is (= #{"document" "dashboard"} @captured))))))))

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

(deftest official-flag-end-to-end-test
  ;; Runs the real pipeline rather than a hand-written row, because the `official` regression this
  ;; guards was invisible to unit fixtures: they fed a shape (`official_collection` / a top-level
  ;; `authority_level`) that the pipeline never actually produces.
  (testing "is_official is derived from the shape a real search returns"
    (binding [search.ingestion/*force-sync* true]
      (mt/with-test-user :crowberto
        (search.tu/with-temp-index-table
          (mt/with-temp [:model/Collection {off-id :id} {:name            "Zx9OfficialColl"
                                                         :authority_level "official"}
                         :model/Collection {plain-id :id} {:name "Zx9PlainColl"}
                         :model/Card      {card-id :id}  {:name "Zx9Card" :collection_id off-id}
                         :model/Document  {doc-id :id}   {:name "Zx9Doc"  :collection_id off-id}]
            ;; keyed by [type id]: ids are only unique per table, so a collection and a card can
            ;; collide and silently overwrite each other here
            (let [by-ref (->> (search/search {:query        "Zx9"
                                              :entity-types ["collection" "question" "document"]})
                              (map (juxt (juxt :type :id) identity))
                              (into {}))
                  by-id  (fn [t id] (by-ref [t id]))]
              (testing "a collection reports its *own* authority, not its parent's"
                (is (=? {:official true :authority_level "official" :is_container true}
                        (by-id "collection" off-id)))
                (is (=? {:official false} (by-id "collection" plain-id))))
              (testing "items inside an official collection inherit the flag"
                (is (=? {:official true} (by-id "question" card-id)))
                (testing "including documents, whose spec has no official_collection attr"
                  (is (=? {:official true} (by-id "document" doc-id))))))))))))

(deftest published-table-in-library-collection-test
  ;; Tables *can* live in collections: the table search spec joins Collection on `is_published`.
  ;; Before this, table results dropped `:collection` outright and library membership came only from
  ;; `data_layer`, so a table sitting in a Library collection reported `is_library_member=false`
  ;; while a table in no collection at all reported true — exactly backwards.
  (testing "a published table in a library collection is a library member and has a collection path"
    (binding [search.ingestion/*force-sync* true]
      (mt/with-additional-premium-features #{:library}
        (mt/with-test-user :crowberto
          (search.tu/with-temp-index-table
            (mt/with-temp [:model/Collection {lib-id :id} {:name "Zq7LibColl" :type "library-data"}
                           :model/Database {db-id :id}   {:name "Zq7DB"}
                           ;; deliberately *not* on the :final tier, so the only thing that can make
                           ;; this a library member is the collection it was published into
                           :model/Table {published-id :id} {:name          "Zq7PublishedTable"
                                                            :db_id         db-id
                                                            :is_published  true
                                                            :collection_id lib-id
                                                            :data_layer    :internal}
                           :model/Table {final-id :id}     {:name       "Zq7FinalTable"
                                                            :db_id      db-id
                                                            :data_layer :final}]
              (let [by-id (->> (search/search {:query "Zq7" :entity-types ["table"]})
                               (map (juxt :id identity))
                               (into {}))]
                (is (=? {:library_member  true
                         :collection_path "Zq7LibColl"
                         :collection      {:id lib-id :name "Zq7LibColl"}}
                        (by-id published-id)))
                (testing "the data-layer route still covers a :final table that is in no collection"
                  (is (=? {:library_member true} (by-id final-id)))
                  (is (nil? (:collection (by-id final-id)))
                      "an unpublished table carries no collection map"))))))))))

(deftest unreadable-collection-name-not-leaked-test
  ;; A published table is reachable through *data* permissions, which say nothing about the
  ;; collection it was published into — unlike a card, whose search hit already implies collection
  ;; read. So neither the table nor a measure bound to it may surface that collection's name.
  (testing "a collection the user cannot read contributes no name to a table or measure result"
    (binding [search.ingestion/*force-sync* true]
      (mt/with-additional-premium-features #{:library}
        (search.tu/with-temp-index-table
          (mt/with-temp [:model/Collection {secret-id :id} {:name "Pb6SecretLibColl" :type "library-data"}
                         :model/Database   {db-id :id}     {:name "Pb6DB"}
                         :model/Table {tbl-id :id} {:name "Pb6PublishedTable" :db_id db-id
                                                    :is_published true :collection_id secret-id}
                         :model/Measure {m-id :id} {:name "Pb6Measure" :table_id tbl-id}]
            (perms/revoke-collection-permissions! (perms-group/all-users) secret-id)
            (mt/with-test-user :rasta
              (let [by-ref (->> (search/search {:query "Pb6" :entity-types ["table" "measure"]})
                                (map (juxt (juxt :type :id) identity))
                                (into {}))
                    tbl    (by-ref ["table" tbl-id])
                    msr    (by-ref ["measure" m-id])]
                (is (some? tbl) "the table is still reachable via data perms")
                (doseq [[label r] [["table" tbl] ["measure" msr]]]
                  (testing label
                    (is (nil? (:collection_path r)))
                    (is (nil? (:collection r)))))
                (testing "library membership still lands — it discloses the root's type, never a name"
                  (is (true? (:library_member tbl)))
                  (is (true? (:library_member msr))))))))))))

(deftest measure-segment-inherit-library-membership-test
  ;; A measure or segment is only surfaced by `retrieve_library_entities` because its binding table
  ;; was published into the Library, so it must carry the same `library_member` the table does.
  (testing "measures and segments inherit library membership from their binding table"
    (binding [search.ingestion/*force-sync* true]
      (mt/with-additional-premium-features #{:library}
        (mt/with-test-user :crowberto
          (search.tu/with-temp-index-table
            (mt/with-temp [:model/Collection {data-id :id}  {:name "Pb5Data" :type "library-data"}
                           :model/Database   {db-id :id}    {:name "Pb5DB"}
                           :model/Table {lib-tbl :id}       {:name "Pb5LibTable" :db_id db-id
                                                             :is_published true :collection_id data-id}
                           :model/Table {plain-tbl :id}     {:name "Pb5PlainTable" :db_id db-id}
                           :model/Measure {lib-measure :id} {:name "Pb5LibMeasure" :table_id lib-tbl}
                           :model/Segment {lib-segment :id} {:name "Pb5LibSegment" :table_id lib-tbl}
                           :model/Measure {plain-measure :id} {:name "Pb5PlainMeasure" :table_id plain-tbl}]
              (let [by-ref (->> (search/search {:query        "Pb5"
                                                :entity-types ["table" "measure" "segment"]})
                                (map (juxt (juxt :type :id) identity))
                                (into {}))]
                (is (=? {:library_member true} (by-ref ["measure" lib-measure])))
                (is (=? {:library_member true} (by-ref ["segment" lib-segment])))
                (testing "one bound to an unpublished table does not inherit it"
                  (is (not (:library_member (by-ref ["measure" plain-measure]))))))
              (testing "and the same holds through the entity-ref path"
                (let [by-type (->> (search/entity-refs->search-results
                                    [{:model "measure" :id lib-measure}
                                     {:model "segment" :id lib-segment}])
                                   (map (juxt :type identity))
                                   (into {}))]
                  (is (=? {:library_member true} (by-type "measure")))
                  (is (=? {:library_member true} (by-type "segment"))))))))))))

(deftest official-document-under-in-place-test
  ;; `official-flag-end-to-end-test` runs on whichever engine resolves by default (appdb here), so it
  ;; cannot catch the in-place document projection dropping its collection columns again.
  (testing "a document in an official collection reads as official under the in-place engine too"
    (mt/with-test-user :crowberto
      (search.tu/with-legacy-search
        ;; `with-legacy-search` leaves semantic *active* where it's supported, and metabot resolves
        ;; through `resolved-engine`, which prefers semantic — so on an instance with the feature on
        ;; this would quietly stop exercising in-place. Force it, then assert we got there.
        (mt/with-dynamic-fn-redefs [search.engine/active-engines (constantly nil)]
          (is (= :search.engine/in-place (search.engine/resolved-engine))
              "this test is only meaningful against the in-place engine")
          (mt/with-temp [:model/Collection {off-id :id} {:name "Ip4OfficialColl" :authority_level "official"}
                         :model/Document {doc-id :id}  {:name "Ip4Doc" :collection_id off-id}]
            (let [doc (->> (search/search {:query "Ip4" :entity-types ["document"]})
                           (filter #(= doc-id (:id %)))
                           first)]
              (is (=? {:type "document" :official true} doc)))))))))

(deftest table-collection-edge-cases-test
  ;; A table published at the *root* has no collection row, and the table spec coalesces a display
  ;; name for it, which makes `search.impl/serialize` stamp the collection id as the string "root".
  ;; Feeding that to a numeric `:id [:in ...]` lookup threw and failed the entire search.
  (testing "root-published and stale-collection tables neither break search nor claim a collection"
    (binding [search.ingestion/*force-sync* true]
      (mt/with-additional-premium-features #{:library}
        (mt/with-test-user :crowberto
          (search.tu/with-temp-index-table
            (mt/with-temp [:model/Collection {data-id :id} {:name "Pb2Data" :type "library-data"}
                           :model/Database   {db-id :id}   {:name "Pb2DB"}
                           :model/Table {root-id :id}  {:name "Pb2RootPublished" :db_id db-id
                                                        :is_published true :collection_id nil}
                           ;; unpublished, but still carrying a collection id it isn't published into
                           :model/Table {stale-id :id} {:name "Pb2StaleUnpublished" :db_id db-id
                                                        :is_published false :collection_id data-id
                                                        :data_layer :internal}]
              (let [by-id (->> (search/search {:query "Pb2" :entity-types ["table"]})
                               (map (juxt :id identity))
                               (into {}))]
                (testing "the search completes at all"
                  (is (= 2 (count by-id))))
                (testing "a root-published table carries no collection"
                  (is (nil? (:collection (by-id root-id))))
                  (is (nil? (:collection_path (by-id root-id)))))
                (testing "an unpublished table does not claim a stale collection"
                  (is (nil? (:collection (by-id stale-id))))
                  (is (not (:library_member (by-id stale-id)))))))))))))

(deftest document-search-test
  (testing "search can discover documents by name"
    (mt/with-test-user :crowberto
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Document {document-id :id}
                       {:name "Quarterly planning sh1b0le#doc"}]
          (let [result (->> (search/search {:query        "sh1b0le#doc"
                                            :entity-types ["document"]})
                            (filter #(= document-id (:id %)))
                            first)]
            (is (= "document" (:type result)))
            (is (= "Quarterly planning sh1b0le#doc" (:name result)))))))))

(deftest validate-and-enrich-documents-test
  (testing "stale document search hits are removed using the live model"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Document {document-id :id} {:name "Existing document"}]
        (let [results [{:id document-id :type "document" :name "Existing document"}
                       {:id Integer/MAX_VALUE :type "document" :name "Deleted document"}
                       {:id 1 :type "dashboard" :name "Unrelated dashboard"}]]
          (is (= [{:id document-id :type "document" :name "Existing document" :can_write true}
                  {:id 1 :type "dashboard" :name "Unrelated dashboard"}]
                 (#'search/validate-and-enrich-documents results))))))))

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
  (testing "saved-question and model search results expose `portable_entity_id` (the card's NanoID)\nso the LLM can use it verbatim as `source-card:` without a follow-up read_resource call"
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
                "`source-table:` without a separate read_resource call. We look up\n"
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

(deftest enrich-with-metric-base-tables-respects-table-permissions-test
  (testing "a readable metric does not reveal metadata for an unreadable base table"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-test-user :rasta
        (search.tu/with-temp-index-table
          (mt/with-temp [:model/Card {metric-id :id} {:name          "Restricted Base Table Metric"
                                                      :type          :metric
                                                      :database_id   (mt/id)
                                                      :table_id      (mt/id :orders)
                                                      :dataset_query {:database (mt/id)
                                                                      :type     :query
                                                                      :query    {:source-table (mt/id :orders)
                                                                                 :aggregation  [[:count]]}}}]
            (let [results    (search/search {:query "Restricted Base Table Metric"})
                  metric-res (some #(when (= [metric-id "metric"] [(:id %) (:type %)]) %) results)]
              (is (some? metric-res) "collection access still makes the metric searchable")
              (is (not-any? #(contains? metric-res %)
                            [:base_table_id
                             :base_table_name
                             :base_table_schema
                             :base_table_portable_fk])))))))))

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
