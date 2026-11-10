(ns metabase.metabot.tools.search-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.metadata.jvm :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.test-util :as test-util]
   [metabase.metabot.tools :as metabot.tools]
   [metabase.metabot.tools.search :as search]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.search.core :as search-core]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.transforms.feature-gating :as transforms.gating]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- invoke-search
  ([tool-list args] (invoke-search tool-list args nil nil))
  ([tool-list args metabot profile-id]
   (binding [scope/*current-user-scope* #{scope/agent-search}]
     ((get-in (metabot.tools/->entries tool-list (atom {}) metabot profile-id) ["search" :fn]) args))))

(defn- do-with-search-stub!
  "Call `thunk` with the engines set to `engines`, `ranked-results` answering each search string from
  `string->ranked`, and `search-results` paginating whatever ranking it is handed. A search string that
  `string->ranked` has no entry for throws, as a failing query would."
  [engines string->ranked thunk]
  (with-redefs [perms/impersonated-user?     (constantly false)
                perms/sandboxed-user?        (constantly false)
                search.engine/active-engines (constantly engines)
                search.engine/disjunction    (fn [_ terms] terms)
                search-core/ranked-results   (fn [{:keys [search-string]}]
                                               (or (string->ranked search-string)
                                                   (throw (ex-info "Search index unavailable" {}))))
                search-core/search-results   (fn [{:keys [limit-int]} _ ranked]
                                               {:data  (vec (cond->> ranked limit-int (take limit-int)))
                                                :total (count ranked)})]
    (thunk)))

(defn- result-notes
  "The lines a search output adds after its results, up to its instructions."
  [output]
  (->> (str/split-lines output)
       (drop-while #(not= "</results>" %))
       rest
       (take-while #(not= "<instructions>" %))
       (remove str/blank?)))

(def ^:private retry-note
  (str "Retry once with a shorter `query`: one or two distinctive words, or a synonym. "
       "If that also finds nothing, tell the user instead of searching again."))

(deftest ^:parallel search-requires-query-test
  (mt/with-dynamic-fn-redefs [search/search-by-query (fn [_] (throw (ex-info "Search must not run" {})))]
    (doseq [[tool-var extra-args] [[#'search/search-tool {}]
                                   [#'search/sql-search-tool {:database_id 1}]
                                   [#'search/nlq-search-tool {}]]
            query-args [{} {:query ""} {:query "  "}]]
      (is (=? {:error {:class :validation :code :invalid-arguments}}
              (invoke-search [tool-var] (merge extra-args query-args)))))))

(deftest sql-search-checks-database-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-test-user :rasta
      (mt/with-dynamic-fn-redefs [search/search-by-query (fn [_] (throw (ex-info "Search must not run" {})))]
        (doseq [database-id [Integer/MAX_VALUE (mt/id) 0 -1]]
          (is (= {:error {:class :recoverable :code ::search/unavailable-database}
                  :output (str "Database " database-id
                               " was not found. It may not exist, or you may not have access to it.\n"
                               "In the SQL editor, use the database currently selected there. Elsewhere, leave out `database_id`.\n"
                               "Call `read_resource` with `metabase://databases` to find an accessible database ID.")}
                 (invoke-search [#'search/sql-search-tool #'metabot.tools/read-resource-tool]
                                {:database_id database-id :query "orders"}))))))))

(deftest sql-search-non-admin-database-access-test
  (search.tu/with-legacy-search
    (let [args {:database_id (mt/id) :query "orders" :entity_types ["table"]}
          search-as-rasta (fn []
                            (mt/with-test-user :rasta
                              (is (false? api/*is-superuser?*))
                              (is (= (mt/user->id :rasta) api/*current-user-id*))
                              (invoke-search [#'search/sql-search-tool] args)))]
      (testing "a non-admin with database access can search"
        (let [result (search-as-rasta)]
          (is (nil? (:error result)))
          (is (= :search (get-in result [:structured-output :result-type])))
          (is (some #(= (mt/id :orders) (:id %)) (get-in result [:structured-output :data])))))
      (testing "the same non-admin is refused without database access"
        (mt/with-no-data-perms-for-all-users!
          (let [result (search-as-rasta)]
            (is (= {:class :recoverable :code ::search/unavailable-database} (:error result)))
            (is (= (str "Database " (mt/id)
                        " was not found. It may not exist, or you may not have access to it.\n"
                        "In the SQL editor, use the database currently selected there. Elsewhere, leave out `database_id`.")
                   (:output result)))))))))

(deftest ^:parallel sql-search-database-recovery-follows-profile-test
  (mt/with-dynamic-fn-redefs [search/search-by-query (constantly [])]
    (is (= {:error {:class :recoverable :code ::search/unavailable-database}
            :output (str "Database " Integer/MAX_VALUE
                         " was not found. It may not exist, or you may not have access to it.\n"
                         "In the SQL editor, use the database currently selected there. Elsewhere, leave out `database_id`.")}
           (invoke-search [#'search/sql-search-tool]
                          {:database_id Integer/MAX_VALUE :query "orders"})))))

(deftest search-query-and-context-test
  (mt/with-test-user :crowberto
    (let [metabot {:entity_id "configured-search-bot" :collection_id 42 :use_verified_content true}]
      (doseq [[tool-var extra-args search-opts]
              [[#'search/search-tool {} {}]
               [#'search/sql-search-tool {:database_id (mt/id)} {:database-id (mt/id)}]
               [#'search/nlq-search-tool {} {:profile-id "nlq"}]]]
        (let [captured (atom nil)]
          (mt/with-dynamic-fn-redefs [search/search-by-query (fn [opts] (reset! captured opts) [])]
            (is (=? {:structured-output {:result-type :search :data [] :total_count 0}
                     :data-parts [{:type :data :data-type "search_results"
                                   :data {:results [] :total_count 0}}]}
                    (invoke-search [tool-var] (merge extra-args {:query "orders"}) metabot "internal")))
            (is (=? (merge {:metabot metabot :query "orders"} search-opts) @captured))))))))

(deftest search-result-notes-test
  (mt/with-test-user :rasta
    (mt/with-dynamic-fn-redefs [perms/impersonated-user? (constantly false)
                                perms/sandboxed-user?    (constantly false)]
      (mt/with-dynamic-fn-redefs [search-core/search (fn [{:keys [search-string limit-int]}]
                                                       (case search-string
                                                         "orders"  {:data  (for [id [1 2 3]] {:id id :model "card" :name (str "Orders " id)})
                                                                    :total 3}
                                                         "reports" {:data  (take limit-int (for [id (range 1 1001)] {:id id :model "card" :name (str "Report " id)}))
                                                                    :total 1000}
                                                         (throw (ex-info "Search index unavailable" {}))))]
        (testing "a page cut short gives the total as a lower bound, since search caps the ranked pool"
          (is (= ["Showing 1 of at least 1000 results. To see more, raise `limit` (max 50) or make the query more specific."]
                 (result-notes (:output (invoke-search [#'search/search-tool] {:query "reports" :limit 1}))))))
        (testing "a page that holds every match adds no note"
          (is (= []
                 (result-notes (:output (invoke-search [#'search/search-tool] {:query "orders"}))))))
        (testing "a failed search is a search failure the agent can recover from"
          (is (= {:class :recoverable :code ::search/search-failed}
                 (:error (invoke-search [#'search/search-tool] {:query "broken"})))))))))

(deftest empty-search-explains-itself-test
  (let [explain (fn [tool-var args metabot]
                  (let [{:keys [output structured-output]} (invoke-search [tool-var] args metabot nil)]
                    {:empty_reason (:empty_reason structured-output)
                     :notes        (result-notes output)}))]
    (mt/with-dynamic-fn-redefs [search/search-by-query (constantly [])]
      (testing "nothing narrowed the search"
        (is (= {:empty_reason "no_match"
                :notes        ["<no-results>" retry-note "</no-results>"]}
               (explain #'search/search-tool {:query "zzz"} nil)))
        (is (= {:empty_reason "no_match"
                :notes        ["<no-results>" retry-note "</no-results>"]}
               (explain #'search/nlq-search-tool {:query        "zzz"
                                                  :entity_types (vec @#'search/general-entity-types)}
                        nil))
            "every type the tool accepts narrows nothing, even beyond the tool's defaults"))
      (testing "the entity types the model picked, curated content only and a confined collection are named"
        (is (= {:empty_reason "restricted"
                :notes        ["<no-results>"
                               "Only these entity types were searched: dashboard, metric. If other types could match, add them to `entity_types`."
                               "This Metabot searches only curated content, such as verified items and items in official collections."
                               "This Metabot searches only inside its own collection."
                               retry-note
                               "</no-results>"]}
               (explain #'search/nlq-search-tool
                        {:query "zzz" :entity_types ["metric" "dashboard"]}
                        {:collection_id 7 :use_verified_content true}))))
      (testing "a database the model picked is named, with the types it leaves out"
        (mt/with-test-user :crowberto
          (is (= ["<no-results>"
                  (str "Only database " (mt/id) " was searched, so collections, dashboards and documents were left out. "
                       "To search everywhere, leave out `database_id`.")
                  retry-note
                  "</no-results>"]
                 (:notes (explain #'search/search-tool {:query "zzz" :database_id (mt/id)} nil))))
          (testing "only the types the search would have reached are named"
            (is (= ["<no-results>"
                    (str "Only database " (mt/id) " was searched, so collections were left out. "
                         "To search everywhere, leave out `database_id`.")
                    retry-note
                    "</no-results>"]
                   (:notes (explain #'search/nlq-search-tool {:query "zzz" :database_id (mt/id)} nil)))
                "the NLQ tool's defaults have no dashboards or documents")
            (is (= ["<no-results>"
                    "Only these entity types were searched: dashboard, table. If other types could match, add them to `entity_types`."
                    (str "Only database " (mt/id) " was searched, so dashboards were left out. "
                         "To search everywhere, leave out `database_id`.")
                    retry-note
                    "</no-results>"]
                   (:notes (explain #'search/search-tool
                                    {:query "zzz" :database_id (mt/id) :entity_types ["table" "dashboard"]}
                                    nil))))
            (is (= ["<no-results>"
                    "Only these entity types were searched: table. If other types could match, add them to `entity_types`."
                    (str "Only database " (mt/id) " was searched. To search everywhere, leave out `database_id`.")
                    retry-note
                    "</no-results>"]
                   (:notes (explain #'search/search-tool
                                    {:query "zzz" :database_id (mt/id) :entity_types ["table"]}
                                    nil)))
                "with no type left out, the database is still named, since a table in another one could match"))
          (is (= {:empty_reason "no_match" :notes ["<no-results>" retry-note "</no-results>"]}
                 (explain #'search/sql-search-tool {:query "zzz" :database_id (mt/id)} nil))
              "the SQL tool always searches the editor's database, so that narrows nothing"))))
    (testing "a collection the model picked is named only when the search ran in it"
      (let [notes (fn [searched-collection-id metabot]
                    (mt/with-dynamic-fn-redefs [search/search-by-query
                                                (constantly (with-meta [] {:collection-id searched-collection-id}))]
                      (:notes (explain #'search/nlq-search-tool {:query "zzz" :collection_id 9} metabot))))]
        (is (= ["<no-results>"
                "Only collection 9 and the collections inside it were searched. To search everywhere, leave out `collection_id`."
                retry-note
                "</no-results>"]
               (notes 9 nil)))
        (is (= ["<no-results>" "This Metabot searches only inside its own collection." retry-note "</no-results>"]
               (notes 7 {:collection_id 7}))
            "a confined Metabot that ignored the collection says only that it searched its own")))))

(deftest ^:parallel unsupported-search-entity-types-test
  (mt/with-dynamic-fn-redefs [search/search-by-query (fn [_] (throw (ex-info "Search must not run" {})))]
    (doseq [[tool-var extra-args entity-type]
            [[#'search/search-tool {} "database"]
             [#'search/sql-search-tool {:database_id 1} "metric"]
             [#'search/nlq-search-tool {} "transform"]]]
      (let [result (invoke-search [tool-var] (merge extra-args {:query        "orders"
                                                                :entity_types [entity-type]}))]
        (is (= {:class :validation :code :invalid-arguments} (:error result)))
        (is (str/includes? (:output result) "entity_types"))))))

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
             :moderated_status "verified"}))))
  (testing "carries the base table of a measure or segment, which the client needs to link to it"
    (is (= [{:id 8 :type "measure" :name "Revenue" :database_id 2 :table_id 10}
            {:id 9 :type "segment" :name "Big orders" :database_id 2 :table_id 10}]
           (map #'search/search-result->item
                [{:id 8 :type "measure" :name "Revenue" :database_id 2 :base_table_id 10}
                 {:id 9 :type "segment" :name "Big orders" :database_id 2 :base_table_id 10}])))))

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

(deftest weights-reach-the-search-context-test
  ;; The curation boost lives in the `:metabot` search context (see `search.config/static-context-weights`),
  ;; so the admin's weight overrides apply on top of it. Only a caller's own weights travel per request.
  (mt/with-test-user :rasta
    (with-redefs [perms/impersonated-user? (fn [] false)
                  perms/sandboxed-user? (fn [] false)
                  api/*current-user-id* 1]
      (let [context-for (fn [args]
                          (let [captured (atom nil)]
                            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                                             (reset! captured context)
                                                                             {:data []})]
                              (search/search-by-query args))
                            (select-keys @captured [:context :weights])))]
        (is (= {:context :metabot :weights nil}
               (context-for {:query "x"})))
        (is (= {:context :metabot :weights {:verified 99}}
               (context-for {:query "x" :weights {:verified 99}})))))))

(deftest entity-refs-ignore-transform-refs-test
  ;; `entity-refs->search-results` has no transform branch, which is why dropping
  ;; `remove-unreadable-transforms` from its pipeline was safe. Pin that: a transform ref must
  ;; produce nothing rather than an unfiltered record.
  (testing "a transform ref yields no result, so there is nothing for a transform filter to remove"
    (mt/with-test-user :crowberto
      (is (empty? (search/entity-refs->search-results [{:model "transform" :id 1}]))))))

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
              (invoke-search [#'search/nlq-search-tool] {:query "x"}))
            (is (= #{"table" "dataset" "metric" "measure" "segment" "card" "collection"} @captured))
            (is (not (contains? @captured "dashboard")))
            (is (not (contains? @captured "transform")))
            (is (not (contains? @captured "database")))))
        (testing "sql-search-tool with no entity_types searches only table/model"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured (:models context))
                                                             {:data []})]
              (invoke-search [#'search/sql-search-tool] {:query "x" :database_id (mt/id)}))
            (is (= #{"table" "dataset"} @captured))))
        (testing "general search includes documents in its default entity types"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured (:models context))
                                                             {:data []})]
              (invoke-search [#'search/search-tool] {:query "x"}))
            (is (contains? @captured "document"))))
        (testing "agent-supplied entity_types narrow the default allowed set"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured (:models context))
                                                             {:data []})]
              (invoke-search [#'search/nlq-search-tool] {:query "x" :entity_types ["metric"]}))
            (is (= #{"metric"} @captured))))
        (testing "NLQ search accepts document and dashboard destination types"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured (:models context))
                                                             {:data []})]
              (invoke-search [#'search/nlq-search-tool] {:query        "plan"
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
              (invoke-search [#'search/search-tool] {:query "x" :database_id (mt/id)}))
            (is (= (mt/id) (:table-db-id @captured)))))
        (testing "collection_id is forwarded as :collection (descendant scope)"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured context)
                                                             {:data []})]
              (invoke-search [#'search/search-tool] {:query "x" :collection_id 7}))
            (is (= 7 (:collection @captured)))))))))

(deftest configured-collection-bounds-caller-collection-test
  (testing "an NLQ metabot's configured collection can be narrowed by the caller but never escaped"
    (mt/with-temp [:model/Collection {scope-id :id}   {:name "Scope"}
                   :model/Collection {child-id :id}   {:name "Child" :location (format "/%d/" scope-id)}
                   :model/Collection {outside-id :id} {:name "Outside"}
                   :model/Metabot    metabot {:name "scoped bot" :collection_id scope-id}]
      (mt/with-test-user :rasta
        (mt/with-dynamic-fn-redefs [perms/impersonated-user? (fn [] false)
                                    perms/sandboxed-user? (fn [] false)]
          (let [searched-collection (fn [caller-id]
                                      (let [captured (atom nil)]
                                        (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                                                         (reset! captured context)
                                                                                         {:data []})]
                                          (search/search-by-query (cond-> {:query "x" :metabot metabot :profile-id "nlq"}
                                                                    caller-id (assoc :collection-id caller-id))))
                                        (:collection @captured)))]
            (is (= {:none       scope-id
                    :configured scope-id
                    :child      child-id
                    :outside    scope-id}
                   {:none       (searched-collection nil)
                    :configured (searched-collection scope-id)
                    :child      (searched-collection child-id)
                    :outside    (searched-collection outside-id)}))))))))

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
              (invoke-search [#'search/search-tool] {:query "x"}))
            (is (= 25 @captured))))
        (testing "explicit limit is honored"
          (let [captured (atom nil)]
            (mt/with-dynamic-fn-redefs [search-core/search (fn [context]
                                                             (reset! captured (:limit-int context))
                                                             {:data []})]
              (invoke-search [#'search/search-tool] {:query "x" :limit 10}))
            (is (= 10 @captured))))
        (testing "limits below 1 or above 50 are rejected by schema validation"
          (doseq [limit [0 75]]
            (is (=? {:error {:class :validation :code :invalid-arguments}}
                    (invoke-search [#'search/search-tool] {:query "x" :limit limit})))))))))

(deftest ^:parallel scalar-search-args-test
  (testing "a scalar where an array is declared is rejected with guidance on how to repair the call"
    (doseq [[field value message]
            [[:entity_types     "table"
              "Invalid tool arguments: `entity_types` must be an array of supported entity type strings; received a string."]]]
      (testing (str "a scalar " field)
        (is (= message
               (test-util/tool-boundary-error "search" #'metabot.tools/search-tool {:query "x" field value})))))))

(deftest ^:parallel scalar-search-args-every-variant-test
  (testing "every search tool variant rejects a scalar the same way"
    (doseq [[tool-var extra-args] [[#'metabot.tools/search-tool {}]
                                   [#'metabot.tools/sql-search-tool {:database_id 1}]
                                   [#'metabot.tools/nlq-search-tool {}]]]
      (testing (str tool-var)
        (is (= "Invalid tool arguments: `entity_types` must be an array of supported entity type strings; received a string."
               (test-util/tool-boundary-error "search" tool-var
                                              (assoc extra-args :query "x" :entity_types "table"))))))))

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
                     (->> (search/search-by-query {:query "Dashboard"})
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
            (let [by-ref (->> (search/search-by-query {:query        "Zx9"
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
              (let [by-id (->> (search/search-by-query {:query "Zq7" :entity-types ["table"]})
                               (map (juxt :id identity))
                               (into {}))]
                (is (=? {:library_member  true
                         :collection_path "Zq7LibColl"
                         :collection      {:id lib-id :name "Zq7LibColl"}}
                        (by-id published-id)))
                (testing "a :final table in no collection is not a library member"
                  (is (not (:library_member (by-id final-id))))
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
              (let [by-ref (->> (search/search-by-query {:query "Pb6" :entity-types ["table" "measure"]})
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

(deftest multi-query-search-hides-unreadable-collection-test
  ;; The multi-query `search` behind `/v1/search` and MCP v2 has no collection-path step, so it needs its own
  ;; check that a published table carries no name or description of a collection the user can't read.
  (testing "a published table in an unreadable collection carries no collection through the multi-query search"
    (binding [search.ingestion/*force-sync* true]
      (mt/with-additional-premium-features #{:library}
        (search.tu/with-temp-index-table
          (mt/with-temp [:model/Collection {secret-id :id} {:name        "Pb7SecretColl"
                                                            :description "Pb7SecretDescription"
                                                            :type        "library-data"}
                         :model/Database   {db-id :id}     {:name "Pb7DB"}
                         :model/Table      {tbl-id :id}    {:name "Pb7PublishedTable" :db_id db-id
                                                            :is_published true :collection_id secret-id}]
            (perms/revoke-collection-permissions! (perms-group/all-users) secret-id)
            (mt/with-test-user :rasta
              (let [tbl (some #(when (= tbl-id (:id %)) %)
                              (search/search {:term-queries ["Pb7"] :entity-types ["table"]}))]
                (is (some? tbl) "the table is still reachable through data permissions")
                (is (nil? (:collection tbl)))
                (is (not (str/includes? (pr-str tbl) "Pb7Secret")))))))))))

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
              (let [by-ref (->> (search/search-by-query {:query        "Pb5"
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
            (let [doc (->> (search/search-by-query {:query "Ip4" :entity-types ["document"]})
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
              (let [by-id (->> (search/search-by-query {:query "Pb2" :entity-types ["table"]})
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
          (let [result (->> (search/search-by-query {:query        "sh1b0le#doc"
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
                 (#'search/validate-and-enrich-documents false results))))))))

(deftest archived-document-hits-survive-an-archived-search-test
  (testing "GHY-4137: the staleness check must validate document hits against the archived set the
            search actually asked for. With a hardcoded `:archived false`, every archived document
            was dropped from the page while `:total` still counted it — an empty page no offset
            could ever reach."
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Document {archived-id :id} {:name "Archived doc" :archived true}
                     :model/Document {active-id :id} {:name "Active doc" :archived false}]
        (testing "an archived hit survives an archived search"
          (is (= [archived-id]
                 (map :id (#'search/validate-and-enrich-documents
                           true
                           [{:id archived-id :type "document" :name "Archived doc"}])))))
        (testing "an active hit is stale for an archived search"
          (is (= []
                 (#'search/validate-and-enrich-documents
                  true
                  [{:id active-id :type "document" :name "Active doc"}]))))
        (testing "the active search is unchanged: active survives, archived is stale"
          (is (= [active-id]
                 (map :id (#'search/validate-and-enrich-documents
                           false
                           [{:id active-id :type "document" :name "Active doc"}]))))
          (is (= []
                 (#'search/validate-and-enrich-documents
                  false
                  [{:id archived-id :type "document" :name "Archived doc"}]))))))))

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
            (let [results (search/search-by-query {:query "Dashboard"})
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
    (mt/with-temp [:model/Collection {lib-coll-id :id}      {:name "Lib Coll" :type "library"}
                   :model/Collection {official-coll-id :id} {:name "Official Coll" :authority_level "official"}]
      (let [enrich (fn []
                     (u/index-by :id
                                 (mt/with-test-user :crowberto
                                   (#'search/enrich-with-collection-paths
                                    [{:type "model" :id 1 :collection {:id lib-coll-id}}
                                     {:type "model" :id 2 :collection {:id official-coll-id}}
                                     {:type "table" :id 3}]))))]
        (mt/with-premium-features #{:library}
          (let [by-id (enrich)]
            (is (true?  (:library_member (by-id 1))) "item in a library collection")
            (is (false? (:library_member (by-id 2))) "item in an official (non-library) collection")
            ;; upgraded instances put nearly every visible table on the :final tier, so it can't count
            (is (not (contains? (by-id 3) :library_member)) "a table in no collection")))
        (testing "without the :library feature, nothing is flagged"
          (mt/with-premium-features #{}
            (is (not-any? #(contains? % :library_member) (vals (enrich))))))))))

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
      "sales -refunds"            nil                                    ; an exclusion would be lost across OR branches
      "sales - refunds"           "sales or refunds"                     ; a lone `-` is not an exclusion
      "the of for"                nil                                    ; collapses to <2 tokens after stopwords
      "revenue Revenue, revenue"  nil                                    ; repeats would OR to the same query
      "sales revenue sales"       "sales or revenue or sales"            ; repeats kept, so the final word stays a repeat (no prefix)
      "revenue dogs revenue"      "revenue or dogs or revenue"           ; likewise: neither word gets a prefix, as in the original
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
                                        ;; row is irrelevant; stub the lookup.
                                        metabot.db/metabot-by-entity-id (constantly nil)]
                            (#'search/search-by-query {:query "hard bounce rate"}))
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
                 (run! #{:search.engine/in-place} :search.engine/in-place :postgres))))))
    (testing "the retry's results say which query found them, and a failed retry keeps the empty result"
      (let [run! (fn [retry-search]
                   (with-redefs [search-core/search              (fn [{:keys [search-string]}]
                                                                   (if (= "hard bounce rate" search-string)
                                                                     {:data [] :total 0}
                                                                     (retry-search)))
                                 search.engine/active-engines    (constantly #{:search.engine/appdb})
                                 search.engine/default-engine    (constantly :search.engine/appdb)
                                 mdb/db-type                     (constantly :postgres)
                                 metabot.db/metabot-by-entity-id (constantly nil)]
                     (let [results (#'search/search-by-query {:query "hard bounce rate"})]
                       [(count results) (:broadened-query (meta results))])))]
        (is (= [1 "hard or bounce or rate"]
               (run! (constantly {:data [{:model "dashboard" :id 1 :name "Hard bounces"}] :total 1}))))
        (is (= [0 nil]
               (run! #(throw (ex-info "retry failed" {})))))))))

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
          (let [results      (search/search-by-query {:query "PortableEID Sample"})
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
          (let [results   (search/search-by-query {:query "BaseTable Sample Metric"})
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
                "`:base_table_*`, and enrich-with-measure-segment-base-tables assembles the portable FK\n"
                "once `:database_name` is set. This needs no index.")
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
          (testing "enrich-with-measure-segment-base-tables assembles the portable FK once :database_name is known"
            (let [enriched (first (#'search/enrich-with-measure-segment-base-tables
                                   [(assoc post :database_name "My DB")]))]
              (is (= ["My DB" "public" "orders"] (:base_table_portable_fk enriched))))))))))

(deftest remove-unreadable-transforms-test
  (testing "remove-unreadable-transforms correctly filters transforms based on source database access"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Database {db-id :id} {}]
        (let [mp (lib-be/application-database-metadata-provider db-id)]
          (mt/with-temp [:model/Transform {transform-id :id}
                         {:name   "Test Transform"
                          :source {:type  :query
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
                               (->> (search/search-by-query (assoc base-query :weights weights))
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

;;; ---------------------------------- multi-query search (MCP v2, /v1/search) ----------------------------------

(deftest ^:parallel reciprocal-rank-fusion-test
  (testing "Basic RRF with single list"
    (let [single-list [[{:id 1 :model "card" :name "Card 1"}
                        {:id 2 :model "dashboard" :name "Dashboard 1"}
                        {:id 3 :model "table" :name "Table 1"}]]
          result (#'search/reciprocal-rank-fusion single-list)]
      (is (= 3 (count result)))
      (is (= 1 (-> result first :id)))
      (is (= 2 (-> result second :id)))
      (is (= 3 (-> result last :id))))))

(deftest ^:parallel reciprocal-rank-fusion-test-2
  (testing "RRF with multiple lists - no overlap"
    (let [list1 [{:id 1 :model "card" :name "Card 1"}
                 {:id 2 :model "dashboard" :name "Dashboard 1"}]
          list2 [{:id 3 :model "table" :name "Table 1"}
                 {:id 4 :model "metric" :name "Metric 1"}]
          result (#'search/reciprocal-rank-fusion [list1 list2])]
      (is (= 4 (count result)))
      (is (every? #(contains? #{1 2 3 4} (:id %)) result)))))

(deftest ^:parallel reciprocal-rank-fusion-test-3
  (testing "RRF with overlapping results - should boost common items"
    (let [list1 [{:id 1 :model "card" :name "Revenue Report"}
                 {:id 2 :model "dashboard" :name "Sales Dashboard"}
                 {:id 3 :model "table" :name "Orders"}]
          list2 [{:id 2 :model "dashboard" :name "Sales Dashboard"}
                 {:id 1 :model "card" :name "Revenue Report"}
                 {:id 4 :model "metric" :name "Total Revenue"}]
          result (#'search/reciprocal-rank-fusion [list1 list2])]
      (is (= 4 (count result)))
      ;; Items appearing in both lists should rank higher
      (let [top-two-ids (set (map :id (take 2 result)))]
        (is (contains? top-two-ids 1))
        (is (contains? top-two-ids 2))))))

(deftest ^:parallel reciprocal-rank-fusion-test-4
  (testing "RRF with identical items at different positions"
    (let [list1 [{:id 1 :model "card" :name "First"}
                 {:id 2 :model "dashboard" :name "Second"}
                 {:id 3 :model "table" :name "Third"}]
          list2 [{:id 3 :model "table" :name "Third"}
                 {:id 2 :model "dashboard" :name "Second"}
                 {:id 1 :model "card" :name "First"}]
          list3 [{:id 2 :model "dashboard" :name "Second"}
                 {:id 3 :model "table" :name "Third"}
                 {:id 1 :model "card" :name "First"}]
          result (#'search/reciprocal-rank-fusion [list1 list2 list3])]
      (is (= 3 (count result)))
      ;; Item 2 appears first in list3, second in list1 and list2, so should rank highest
      (is (= 2 (-> result first :id))))))

(deftest ^:parallel reciprocal-rank-fusion-test-5
  (testing "RRF with empty lists"
    (let [list1 []
          list2 [{:id 1 :model "card" :name "Card 1"}]
          result (#'search/reciprocal-rank-fusion [list1 list2])]
      (is (= 1 (count result)))
      (is (= 1 (-> result first :id))))))

(deftest ^:parallel reciprocal-rank-fusion-test-6
  (testing "RRF with all empty lists"
    (let [result (#'search/reciprocal-rank-fusion [[] [] []])]
      (is (empty? result)))))

(deftest ^:parallel reciprocal-rank-fusion-test-7
  (testing "RRF score calculation correctness"
    ;; Test that the RRF formula 1/(k+r) where k=60 is correctly applied
    (let [list1 [{:id 1 :model "card" :name "Rank 1"}]  ; rank=1, score=1/61
          list2 [{:id 2 :model "dashboard" :name "Other"}
                 {:id 1 :model "card" :name "Rank 1"}]  ; rank=2, score=1/62
          result (#'search/reciprocal-rank-fusion [list1 list2])
          first-item (first result)
          second-item (second result)]
      ;; Item 1 appears at rank 1 in list1 (score=1/61) and rank 2 in list2 (score=1/62)
      ;; Total score = 1/61 + 1/62 ≈ 0.0164 + 0.0161 = 0.0325
      ;; Item 2 appears only at rank 1 in list2 (score=1/61 ≈ 0.0164)
      ;; So item 1 should rank higher than item 2
      (is (= 1 (:id first-item)))
      (is (= 2 (:id second-item))))))

(deftest ^:parallel reciprocal-rank-fusion-test-8
  (testing "RRF preserves item data"
    (let [complex-item {:id 42
                        :model "dataset"
                        :name "Complex Dataset"
                        :description "A detailed description"
                        :database_id 1
                        :created_at "2024-01-01"
                        :extra_field "preserved"}
          result (#'search/reciprocal-rank-fusion [[complex-item]])]
      (is (= 1 (count result)))
      (is (= complex-item (first result))))))

(deftest ^:parallel reciprocal-rank-fusion-test-9
  (testing "RRF with many lists"
    (let [lists (for [i (range 5)]
                  [{:id (inc i) :model "card" :name (str "Card " (inc i))}
                   {:id 99 :model "dashboard" :name "Common Dashboard"}
                   {:id (+ i 10) :model "table" :name (str "Table " (+ i 10))}])
          result (#'search/reciprocal-rank-fusion lists)]
      ;; Item 99 appears in all 5 lists at position 2, so should rank very high
      (is (= 99 (:id (first result)))))))

(deftest multi-query-total-is-deduped-not-summed-test
  (testing "under multi-query fusion, :total is the size of the deduped fused set, not the sum of
            per-query counts — the real reciprocal-rank-fusion feeds search-results, so an item
            appearing in both queries is counted once"
    (mt/with-test-user :rasta
      (with-redefs [perms/impersonated-user? (fn [] false)
                    perms/sandboxed-user? (fn [] false)
                    ;; default engine only, so both queries run through the same ranked-fn* branch
                    search.engine/active-engines (constantly [:search.engine/appdb])
                    search.engine/disjunction (fn [_ terms] terms)
                    ;; two queries, overlapping on item 1 (in both) — union is {1 2 3}, sum is 4
                    search-core/ranked-results (fn [context]
                                                 (if (= (:search-string context) "a")
                                                   [{:id 1 :model "card" :name "Shared"}
                                                    {:id 2 :model "card" :name "OnlyA"}]
                                                   [{:id 1 :model "card" :name "Shared"}
                                                    {:id 3 :model "card" :name "OnlyB"}]))
                    ;; the real search-results is app-db-bound; stand in with a faithful passthrough
                    ;; that reports total over the (already fused + deduped) ranking it is handed.
                    search-core/search-results (fn [_ctx _model-set ranked]
                                                 {:data (vec ranked) :total (count ranked)})]
        (let [results (search/search {:term-queries ["a" "b"] :entity-types ["question"] :limit 10})]
          ;; three distinct items survive fusion; total counts them once, not 2+2=4
          (is (= 3 (:total (meta results))))
          (is (= #{1 2 3} (set (map :id results)))))))))

(deftest embedded-metabot-search-test
  (mt/with-test-user :crowberto
    (search.tu/with-temp-index-table
      (mt/with-temp [:model/Collection {collection-id :id} {:name "Embedded sources" :authority_level "official"}
                     :model/Collection {elsewhere-id :id} {:name "Other sources" :authority_level "official"}
                     :model/Collection {drafts-id :id} {:name "Embedded drafts"
                                                        :location (collection/location-path collection-id)}
                     :model/Dashboard {included-id :id} {:name "Embedded report" :collection_id collection-id}
                     :model/Dashboard {draft-id :id} {:name "Embedded report draft" :collection_id drafts-id}
                     :model/Dashboard _ {:name "Embedded report elsewhere" :collection_id elsewhere-id}]
        (mt/with-temp-vals-in-db :model/Metabot
                                 (:id (metabot.config/resolve-metabot metabot.config/embedded-metabot-id))
                                 {:collection_id collection-id :use_verified_content true}
          (doseq [request-id [metabot.config/embedded-metabot-id "c61bf5f5-1025-47b6-9298-bf1827105bb6"]]
            (let [metabot (metabot.config/resolve-metabot request-id)
                  search-args {:term-queries ["Embedded report"]
                               :entity-types ["dashboard"]
                               :collection-id elsewhere-id
                               :metabot metabot}]
              (is (= #{included-id draft-id}
                     (into #{} (map :id) (search/search (assoc-in search-args [:metabot :use_verified_content] false)))))
              (is (= [included-id]
                     (mapv :id (search/search search-args)))))))))))

(deftest enrich-with-metric-sources-base-table-test
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
          (let [results   (search/search {:term-queries ["BaseTable Sample Metric"]})
                by-id     (into {} (map (juxt (juxt :id :type) identity)) results)
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

(deftest enrich-with-metric-sources-respects-table-permissions-test
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
            (let [results    (search/search {:term-queries ["Restricted Base Table Metric"]})
                  metric-res (some #(when (= [metric-id "metric"] [(:id %) (:type %)]) %) results)]
              (is (some? metric-res) "collection access still makes the metric searchable")
              (is (not-any? #(contains? metric-res %)
                            [:base_table_id
                             :base_table_name
                             :base_table_schema
                             :base_table_portable_fk])))))))))

(deftest measure-segment-search-test
  (testing "measure and segment hits carry a portable entity id and their base table's portable FK, as metrics do"
    (mt/with-test-user :crowberto
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Measure
                       {measure-id :id measure-eid :entity_id}
                       {:name     "MeasureSearch Sample Revenue"
                        :table_id (mt/id :orders)}

                       :model/Segment
                       {segment-id :id segment-eid :entity_id}
                       {:name     "MeasureSearch Sample Big Orders"
                        :table_id (mt/id :orders)}]
          (let [db-name (t2/select-one-fn :name :model/Database :id (mt/id))
                by-key  (into {} (map (juxt (juxt :type :id) identity))
                              (search/search {:term-queries ["MeasureSearch Sample"]}))]
            (is (=? {:type                   "measure"
                     :name                   "MeasureSearch Sample Revenue"
                     :database_id            (mt/id)
                     :database_name          db-name
                     :portable_entity_id     measure-eid
                     :base_table_id          (mt/id :orders)
                     :base_table_portable_fk [db-name "PUBLIC" "ORDERS"]}
                    (get by-key ["measure" measure-id])))
            (is (=? {:type                   "segment"
                     :name                   "MeasureSearch Sample Big Orders"
                     :database_id            (mt/id)
                     :database_name          db-name
                     :portable_entity_id     segment-eid
                     :base_table_id          (mt/id :orders)
                     :base_table_portable_fk [db-name "PUBLIC" "ORDERS"]}
                    (get by-key ["segment" segment-id])))
            (testing "the XML the agent sees carries a read_resource uri and the portable ids"
              (let [xml (str/join "\n" (map llm-shape/search-result->xml (vals by-key)))]
                (is (str/includes? xml (str "<measure id=\"" measure-id "\"")))
                (is (str/includes? xml (str "uri=\"metabase://measure/" measure-id "\"")))
                (is (str/includes? xml (str "<segment id=\"" segment-id "\"")))
                (is (str/includes? xml (str "uri=\"metabase://segment/" segment-id "\"")))
                (is (str/includes? xml (str "portable_entity_id=\"" measure-eid "\"")))
                (is (str/includes? xml "base_table_fully_qualified_name=\"PUBLIC.ORDERS\""))))))))))

(deftest partial-results-test
  (mt/with-test-user :rasta
    (doseq [[engines queries] [[[:search.engine/appdb]
                                {:term-queries ["orders" "broken"]}]
                               [[:search.engine/semantic :search.engine/appdb]
                                {:term-queries ["orders"] :semantic-queries ["broken"]}]]]
      (testing (str "engines " engines)
        (do-with-search-stub!
         engines
         {"orders" [{:id 1 :model "card" :name "Orders"}]}
         (fn []
           (let [search* #(search/search (merge queries {:entity-types ["question"]} %))]
             (testing "partial-results? keeps the other queries' results, lists the failed ones and logs the failure"
               (mt/with-log-messages-for-level [logs [metabase.metabot.tools.search :error]]
                 (let [results (search* {:partial-results? true})]
                   (is (= [1] (map :id results)))
                   (is (= {:total 1 :failed-queries ["broken"]} (meta results)))
                   (is (=? [{:level :error :e #(= "Search index unavailable" (ex-message %))}] (logs))))))
             (testing "without partial-results?, any failure fails the search"
               (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Search index unavailable" (search* {}))))
             (testing "a search where every query fails still fails"
               (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Search index unavailable"
                                     (search* {:term-queries     ["broken" "also broken"]
                                               :semantic-queries []
                                               :partial-results? true})))))))))
    (testing "a failed search that folded several queries into one lists every one of them"
      (do-with-search-stub!
       [:search.engine/semantic :search.engine/appdb]
       {"orders" [{:id 1 :model "card" :name "Orders"}]}
       (fn []
         (with-redefs [search.engine/disjunction (fn [engine terms]
                                                   (if (= :search.engine/appdb engine)
                                                     [(str/join " OR " terms)]
                                                     terms))]
           (is (= {:total 1 :failed-queries ["a" "b"]}
                  (meta (search/search {:semantic-queries ["orders"]
                                        :term-queries     ["a" "b"]
                                        :entity-types     ["question"]
                                        :partial-results? true}))))))))))

(deftest ^:parallel postprocess-search-result-measure-segment-test
  (testing "measure and segment results carry their base table from the index row, and no collection fields"
    (doseq [model ["measure" "segment"]]
      (is (= {:id                5
              :type              model
              :name              "Big Orders"
              :description       "desc"
              :updated_at        "2024-01-05"
              :created_at        "2024-01-05"
              :database_id       2
              :base_table_id     10
              :base_table_name   "ORDERS"
              :base_table_schema "PUBLIC"
              :verified          false
              :official_collection false}
             (#'search/postprocess-search-result {:model        model
                                                  :id           5
                                                  :name         "Big Orders"
                                                  :description  "desc"
                                                  :updated_at   "2024-01-05"
                                                  :created_at   "2024-01-05"
                                                  :database_id  2
                                                  :table_id     10
                                                  :table_name   "ORDERS"
                                                  :table_schema "PUBLIC"}))))))

(deftest ^:parallel search-failure-test
  (testing "a failing search backend lets the agent browse what the search was limited to (BOT-2540)"
    (mt/with-test-user :crowberto
      (mt/with-dynamic-fn-redefs [search/search-by-query (fn [_] (throw (ex-info "Search Index not found." {})))]
        (let [instance-step (str "Find the data with `read_resource` instead: read `metabase://collections` for "
                                 "metrics, models, questions and dashboards, or `metabase://databases`, then "
                                 "`metabase://database/{id}/tables`, for tables.")
              no-retry-step (str "Do not call `search` again in this turn. If you cannot find the data another "
                                 "way, tell the user that search is unavailable right now.")
              confined      {:entity_id metabot.config/embedded-metabot-id :collection_id 42}]
          (doseq [[scope tool-var extra-args metabot profile-id step]
                  [["the instance" #'search/search-tool {} nil "internal" instance-step]
                   ["the instance" #'search/nlq-search-tool {} nil "nlq" instance-step]
                   ["one database" #'search/sql-search-tool {:database_id (mt/id)} nil "sql"
                    (str "Find the data with `read_resource` instead: read `metabase://database/" (mt/id)
                         "/tables` and `metabase://database/" (mt/id) "/models`.")]
                   ["a confined collection" #'search/search-tool {} confined "internal"
                    "Find the data with `read_resource` instead: read `metabase://collection/42/items`."]
                   ["a confined collection" #'search/nlq-search-tool {} {:collection_id 42} "nlq"
                    "Find the data with `read_resource` instead: read `metabase://collection/42/items`."]
                   ;; a collection outside the confined one is ignored, as it is for the search itself
                   ["a confined collection" #'search/search-tool {:collection_id Integer/MAX_VALUE} confined "internal"
                    "Find the data with `read_resource` instead: read `metabase://collection/42/items`."]
                   ;; `read_resource` shows only verified content here too, so the browse step stays
                   ["verified content" #'search/search-tool {} {:use_verified_content true} "internal" instance-step]
                   ;; Profiles exempt from curation, where `read_resource` shows unverified content
                   ["verified content" #'search/nlq-search-tool {} {:use_verified_content true} "nlq-fallback" nil]
                   ["verified content" #'search/sql-search-tool {:database_id (mt/id)} {:use_verified_content true}
                    "sql" nil]
                   ["verified content" #'search/nlq-search-tool {} (assoc confined :use_verified_content true)
                    "nlq" nil]]]
            (testing (str tool-var " limited to " scope " under " profile-id)
              (is (= {:error  {:class :recoverable :code ::search/search-failed}
                      :output (str/join "\n" (remove nil? ["Search failed." step no-retry-step]))}
                     (invoke-search [tool-var #'metabot.tools/read-resource-tool]
                                    (merge extra-args {:query "orders"})
                                    metabot
                                    profile-id)))))
          (testing "a profile without `read_resource`, like slackbot, is still told to stop searching"
            (is (= {:error  {:class :recoverable :code ::search/search-failed}
                    :output (str "Search failed.\n" no-retry-step)}
                   (invoke-search [#'search/search-tool] {:query "orders"})))))))))

(deftest search-failure-in-a-collection-browses-tables-test
  (testing "a collection's items never list tables, so recovery adds a table route when the search could match one"
    (mt/with-test-user :crowberto
      (mt/with-dynamic-fn-redefs [search/search-by-query (fn [_] (throw (ex-info "Search Index not found." {})))]
        (let [recovery (fn [args]
                         (-> (invoke-search [#'search/search-tool #'metabot.tools/read-resource-tool]
                                            (merge args {:query "orders"}) nil "internal")
                             :output
                             str/split-lines
                             second))
              items    "Find the data with `read_resource` instead: read `metabase://collection/7/items`"]
          (testing "with the Library, a collection holds published tables"
            (mt/with-premium-features #{:library}
              (is (= (str items ", and `metabase://databases`, then `metabase://database/{id}/tables` for tables.")
                     (recovery {:collection_id 7})))
              (is (= (str items ", and `metabase://database/" (mt/id) "/tables` for tables.")
                     (recovery {:collection_id 7 :database_id (mt/id)})))
              (is (= (str items ".")
                     (recovery {:collection_id 7 :entity_types ["metric" "dashboard"]}))
                  "a search that looked for no tables needs no table route")))
          (testing "without the Library, a collection-scoped search never returns tables"
            (mt/with-premium-features #{}
              (is (= (str items ".")
                     (recovery {:collection_id 7}))))))))))

(deftest confined-collection-is-not-overridable-test
  (testing "an embedded metabot (and the nlq profile) is confined to its own collection — that is a
            containment boundary, not a default. An explicit collection-id, which the v2 search tool
            passes from a caller-supplied filter, may narrow the search within that collection but must
            not widen or relocate it."
    (mt/with-test-user :crowberto
      (mt/with-temp [:model/Collection {confined-id :id}  {:name "Bot's collection"}
                     :model/Collection {child-id :id}     {:name     "Inside the bot's collection"
                                                           :location (format "/%d/" confined-id)}
                     :model/Collection {elsewhere-id :id} {:name "Somewhere else"}
                     :model/Metabot metabot {:name          "confined bot"
                                             :collection_id confined-id}]
        (let [collection-for (fn [search-args]
                               (let [captured (atom ::unset)]
                                 (mt/with-dynamic-fn-redefs [search-core/ranked-results
                                                             (fn [context]
                                                               (reset! captured (:collection context))
                                                               [])]
                                   (search/search (merge {:term-queries ["anything"]
                                                          :entity-types ["dashboard"]
                                                          :profile-id   "nlq"
                                                          :metabot      metabot}
                                                         search-args)))
                                 @captured))]
          (testing "with no collection-id, the metabot's own collection scopes the search"
            (is (= confined-id (collection-for {}))))
          (testing "an explicit collection-id elsewhere cannot escape the confinement"
            (is (= confined-id (collection-for {:collection-id elsewhere-id}))))
          (testing "an explicit collection-id inside the confinement narrows the search"
            (is (= child-id (collection-for {:collection-id child-id}))))
          (testing "an unconfined metabot still honours an explicit collection-id"
            (mt/with-temp [:model/Metabot open-metabot {:name "open bot" :collection_id nil}]
              (is (= elsewhere-id (collection-for {:metabot       open-metabot
                                                   :collection-id elsewhere-id}))))))))))

(deftest transform-visibility-is-superuser-only-test
  (testing "this pipeline dropped remove-unreadable-transforms and relies instead on the transform
            search spec's `:visibility :superuser`. Pin the narrowing: the engine is asked for
            transforms when the caller is a superuser, and never when they are not. If this goes red,
            the removed post-filter is load-bearing again.
            The visibility rule itself is covered by metabase.search.filter-test."
    ;; Two environment inputs are pinned rather than inherited, because leaving either to the ambient
    ;; environment is what made this test pass on H2 while failing on the MySQL/MariaDB EE shards —
    ;; there the positive control failed, so every assertion here was proving nothing.
    ;;
    ;; 1. The transform source types: the in-place engine drops transform for EVERYONE when
    ;;    `enabled-transform-source-types` is empty ((empty? enabled-types) (disj "transform") in
    ;;    search/in_place/filter.clj) — a gate the appdb path has no equivalent of. This is pinned by
    ;;    redefining `transforms.gating/enabled-source-types`, the single seam search/impl.clj reads it
    ;;    from, rather than by writing the `transforms-enabled` setting. Writing that setting would
    ;;    outlive this test: `with-temporary-setting-values` restores by writing back whatever
    ;;    `setting/get` returned at capture time, so a setting that was UNSET on entry comes back
    ;;    explicitly set, permanently defeating the `if-some` fallback in its getter for every later
    ;;    test in the JVM.
    ;; 2. The engine: appdb and in-place gate transforms by different code, and MySQL/MariaDB fall
    ;;    back to in-place because the app DB cannot hold the search index. Running both here means
    ;;    the shard's engine choice can no longer decide whether this test means anything.
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-dynamic-fn-redefs [transforms.gating/enabled-source-types (constantly #{"native" "mbql" "python"})]
        (search.tu/with-appdb-search-and-legacy-search
          ;; `api/*is-superuser?*` is bound explicitly rather than inferred from the test user, which
          ;; resolves it through a SELECT on the shared user row. Both engines read exactly this var
          ;; to gate transforms, and pinning it is what the assertion is about: that this pipeline
          ;; propagates the caller's superuser status, not where that status came from.
          (let [models-for (fn [superuser?]
                             (let [captured (atom nil)]
                               (mt/with-test-user :crowberto
                                 (binding [api/*is-superuser?* superuser?]
                                   (mt/with-dynamic-fn-redefs [search-core/ranked-results
                                                               (fn [context]
                                                                 (reset! captured (:models context))
                                                                 [])]
                                     (search/search {:term-queries ["anything"]
                                                     :entity-types ["transform" "dashboard"]}))))
                               @captured))]
            (testing "a superuser's search reaches the engine with transforms in scope"
              (let [models (models-for true)]
                (is (contains? models "transform"))
                (is (contains? models "dashboard")
                    "sanity: the positive control really did reach the engine")))
            (testing "a non-superuser's search never asks the engine for transforms"
              (let [models (models-for false)]
                (is (not (contains? models "transform")))
                (is (contains? models "dashboard")
                    "sanity: the other requested type is unaffected, so this isn't an empty-set pass")))))))))

(def ^:private metric-source-keys
  "Every key [[metabase.metabot.tools.util/metric-source-fields]] can set, so `select-keys` over it asserts presence and
  absence in one comparison."
  [:base_table_id :base_table_name :base_table_schema :base_table_portable_fk
   :source_card_id :source_card_name :source_card_portable_entity_id
   :source_unavailable])

(deftest enrich-with-metric-source-cards-test
  (testing "Search offers the source card required by a single-stage card metric"
    (mt/with-test-user :crowberto
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Card {question-id :id, question-eid :entity_id}
                       {:name          "SourceCard Sample Question"
                        :type          :question
                        :database_id   (mt/id)
                        :table_id      (mt/id :orders)
                        :dataset_query {:database (mt/id)
                                        :type     :query
                                        :query    {:source-table (mt/id :orders)}}}
                       :model/Card {metric-id :id}
                       {:name          "SourceCard Sample Metric"
                        :type          :metric
                        :database_id   (mt/id)
                        :table_id      (mt/id :orders)
                        :dataset_query {:database (mt/id)
                                        :type     :query
                                        :query    {:source-table (str "card__" question-id)
                                                   :aggregation  [[:count]]}}}]
          (let [results    (search/search {:term-queries ["SourceCard Sample Metric"]})
                metric-res (some #(when (= [metric-id "metric"] [(:id %) (:type %)]) %) results)]
            (is (= {:source_card_id                 question-id
                    :source_card_name               "SourceCard Sample Question"
                    :source_card_portable_entity_id question-eid}
                   (select-keys metric-res metric-source-keys))
                "the source card includes its entity ID and the base table is not offered")))))))

(deftest enrich-with-metric-source-cards-respects-card-permissions-test
  (testing "Search does not reveal an unreadable source card or offer its base table"
    (mt/with-test-user :rasta
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Private SourceCard Collection"}
                       :model/Card {question-id :id}
                       {:name          "Restricted SourceCard Question"
                        :type          :question
                        :collection_id coll-id
                        :database_id   (mt/id)
                        :table_id      (mt/id :orders)
                        :dataset_query {:database (mt/id)
                                        :type     :query
                                        :query    {:source-table (mt/id :orders)}}}
                       :model/Card {metric-id :id}
                       {:name          "Restricted SourceCard Metric"
                        :type          :metric
                        :database_id   (mt/id)
                        :table_id      (mt/id :orders)
                        :dataset_query {:database (mt/id)
                                        :type     :query
                                        :query    {:source-table (str "card__" question-id)
                                                   :aggregation  [[:count]]}}}]
          (perms/revoke-collection-permissions! (perms-group/all-users) coll-id)
          (let [results    (search/search {:term-queries ["Restricted SourceCard Metric"]})
                metric-res (some #(when (= [metric-id "metric"] [(:id %) (:type %)]) %) results)]
            (is (some? metric-res) "collection access still makes the metric searchable")
            (is (= {:source_unavailable true}
                   (select-keys metric-res metric-source-keys))
                "the source is marked unavailable, as it is in metric details")))))))

(deftest enrich-with-metric-sources-mixed-results-test
  (testing "Search reports the source required by each metric in a mixed result set"
    (mt/with-test-user :crowberto
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Card {question-id :id, question-eid :entity_id}
                       {:name "MixedSources Question" :type :question :database_id (mt/id)
                        :table_id (mt/id :orders)
                        :dataset_query {:database (mt/id) :type :query
                                        :query {:source-table (mt/id :orders)}}}
                       :model/Card {card-metric-id :id}
                       {:name "MixedSources CardMetric" :type :metric :database_id (mt/id)
                        :table_id (mt/id :orders)
                        :dataset_query {:database (mt/id) :type :query
                                        :query {:source-table (str "card__" question-id)
                                                :aggregation  [[:count]]}}}
                       :model/Card {table-metric-id :id}
                       {:name "MixedSources TableMetric" :type :metric :database_id (mt/id)
                        :table_id (mt/id :orders)
                        :dataset_query {:database (mt/id) :type :query
                                        :query {:source-table (mt/id :orders)
                                                :aggregation  [[:count]]}}}
                       :model/Card {multi-metric-id :id}
                       {:name "MixedSources MultiStageCardMetric" :type :metric :database_id (mt/id)
                        :table_id (mt/id :orders)
                        :dataset_query {:database (mt/id) :type :query
                                        :query {:source-query {:source-table (str "card__" question-id)}
                                                :aggregation  [[:count]]}}}]
          (let [results (search/search {:term-queries ["MixedSources"]})
                by-id   (into {} (map (juxt :id identity)) results)
                card-m  (get by-id card-metric-id)
                table-m (get by-id table-metric-id)
                multi-m (get by-id multi-metric-id)
                orders-fields {:base_table_id          (mt/id :orders)
                               :base_table_name        "ORDERS"
                               :base_table_schema      "PUBLIC"
                               :base_table_portable_fk [(:database_name table-m) "PUBLIC" "ORDERS"]}]
            (is (= {:card  {:source_card_id                 question-id
                            :source_card_name               "MixedSources Question"
                            :source_card_portable_entity_id question-eid}
                    :table orders-fields
                    ;; Its definition names a card in stage 0, but its last stage does not, so the QP only
                    ;; accepts the base table.
                    :multi orders-fields}
                   (update-vals {:card card-m, :table table-m, :multi multi-m}
                                #(select-keys % metric-source-keys)))
                "each metric carries only its own source's fields")))))))

(deftest enrich-with-metric-sources-marks-unreadable-base-table-unavailable-test
  (testing "A table metric with no queryable source is marked unavailable in search"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-test-user :rasta
        (search.tu/with-temp-index-table
          (mt/with-temp [:model/Card {metric-id :id}
                         {:name "Unreadable Base Table Metric" :type :metric :database_id (mt/id)
                          :table_id (mt/id :orders)
                          :dataset_query {:database (mt/id) :type :query
                                          :query {:source-table (mt/id :orders)
                                                  :aggregation  [[:count]]}}}]
            (let [results (search/search {:term-queries ["Unreadable Base Table Metric"]})
                  metric  (first (filter #(= metric-id (:id %)) results))]
              (is (some? metric) "the metric is still readable via its collection")
              (is (= {:source_unavailable true}
                     (select-keys metric metric-source-keys))
                  "the source is explicitly marked unavailable"))))))))
