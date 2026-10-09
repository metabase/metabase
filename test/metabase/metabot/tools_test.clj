(ns metabase.metabot.tools-test
  (:require
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.channel.settings :as channel.settings]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools :as agent-tools]
   [metabase.metabot.tools.charts.create :as create-chart-tools]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.core :as tools.core]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.metabot.tools.legacy :as tools.legacy]
   [metabase.metabot.tools.shared :as shared]
   [metabase.notification.models :as models.notification]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest all-tools-test
  (testing "every tool in every profile declares itself validly, converted or not"
    (let [tool-vars (mapcat :tools (vals @@#'profiles/*profiles))]
      (is (seq tool-vars))
      (doseq [tool-var tool-vars]
        (is (var? tool-var) "a profile names every tool as a var, whichever kind it is")
        (testing (str tool-var)
          (let [{:keys [name description args]} (tools.legacy/declaration-of tool-var)]
            (is (string? name))
            (is (string? description))
            (is (some? args))))))))

(deftest entries-carry-title-fn-test
  (testing "a tool's title function reaches the entry the adapters read"
    (let [entries (agent-tools/->entries [#'agent-tools/search-tool] (atom {}) nil nil)]
      (is (fn? (get-in entries ["search" :title-fn]))))))

(deftest filter-by-capabilities-test
  (testing "returns tools with no capability requirements when capabilities empty"
    (let [tool-vars [#'agent-tools/search-tool #'agent-tools/read-resource-tool]]
      (is (= tool-vars
             (#'profiles/filter-by-capabilities tool-vars #{})))))
  (testing "filters out tools that require missing capabilities"
    (let [tool-vars [#'agent-tools/search-tool
                     #'agent-tools/create-sql-query-tool]
          capabilities #{}
          result (#'profiles/filter-by-capabilities tool-vars capabilities)]
      (is (= ["search"] (mapv #(:name (tools.legacy/declaration-of %)) result)))))
  (testing "includes tools when capabilities are provided"
    (let [tool-vars [#'agent-tools/search-tool #'agent-tools/create-sql-query-tool #'agent-tools/create-chart-tool]
          capabilities #{:permission-write-sql-queries}
          result (#'profiles/filter-by-capabilities tool-vars capabilities)]
      (is (= tool-vars result)))))

(defn- tools-for-profile
  "Get tools for a profile with unrestricted scope."
  [profile-id]
  (binding [scope/*current-user-scope* api-scope/unrestricted]
    (profiles/get-tools-for-profile profile-id #{})))

(deftest ^:parallel get-tools-for-internal-profile-test
  (let [tools (tools-for-profile :internal)]
    (is (map? tools))
    (is (>= (count tools) 5))
    (is (contains? tools "search"))
    (is (contains? tools "edit_chart"))
    (is (contains? tools "create_chart"))
    (is (contains? tools "create_dashboard_subscription"))))

(deftest ^:parallel get-tools-for-sql-profile-test
  (let [tools (tools-for-profile :sql)]
    (is (map? tools))
    (is (contains? tools "search"))
    (is (contains? tools "read_resource"))
    (is (contains? tools "ask_for_sql_clarification"))))

(deftest get-tools-for-nlq-profile-test
  (testing "nlq discovers data through the curated library tool when it can serve queries, else general search"
    ;; Entity retrieval unavailable (no pgvector / OSS): the general `search` fallback is the discovery tool,
    ;; so the agent is never left with zero ways to find data. The library tool is filtered out.
    (mt/with-dynamic-fn-redefs [entity-retrieval/entity-retrieval-available? (constantly false)]
      (let [tools (tools-for-profile :nlq)]
        (is (map? tools))
        (is (contains? tools "search"))
        (is (contains? tools "construct_notebook_query"))
        (is (contains? tools "create_chart"))
        (is (not (contains? tools "retrieve_library_entities")))))
    ;; Entity retrieval available (pgvector configured + library-retrieval licensed): the curated library tool
    ;; replaces general search. Exactly one discovery tool survives capability filtering.
    (mt/with-dynamic-fn-redefs [entity-retrieval/entity-retrieval-available? (constantly true)]
      (let [tools (tools-for-profile :nlq)]
        (is (contains? tools "retrieve_library_entities"))
        (is (not (contains? tools "search")))))))

(deftest ^:parallel get-tools-for-document-generate-content-profile-test
  (let [tools     (tools-for-profile :document-generate-content)
        sql-tools (binding [scope/*current-user-scope* api-scope/unrestricted]
                    (profiles/get-tools-for-profile :document-generate-content
                                                    #{:permission-write-sql-queries}))]
    (is (map? tools))
    (is (contains? tools "list_available_data_sources"))
    (is (contains? tools "list_available_fields"))
    (is (contains? tools "get_field_values"))
    (is (contains? tools "document_construct_model_chart"))
    (is (contains? tools "load_skill")
        "the model chart tool's query skills make load_skill available")
    (testing "both SQL tools need the SQL capability, like the tools they delegate to"
      (is (not (contains? tools "document_construct_sql_chart")))
      (is (contains? sql-tools "document_construct_sql_chart")))
    (testing "document_schema_collect is gated too -- it only feeds document_construct_sql_chart"
      (is (not (contains? tools "document_schema_collect")))
      (is (contains? sql-tools "document_schema_collect")))))

(deftest ^:parallel get-tools-for-slackbot-profile-test
  (let [tools (tools-for-profile :slackbot)]
    (is (map? tools))
    (is (contains? tools "search"))
    (is (contains? tools "construct_notebook_query"))
    (is (contains? tools "list_available_fields"))
    (is (contains? tools "get_field_values"))
    (is (contains? tools "static_viz"))
    (is (contains? tools "create_alert"))
    (is (contains? tools "create_dashboard_subscription"))))

(deftest ^:parallel get-tools-for-unknown-profile-test
  (let [tools (tools-for-profile :unknown-profile)]
    (is (empty? tools))))

(deftest ^:parallel get-tools-for-profile-metadata-test
  (let [tools (tools-for-profile :embedding_next)]
    (doseq [[tool-name tool-var] tools]
      (is (var? tool-var))
      (is (string? tool-name))
      (is (= tool-name (:name (tools.legacy/declaration-of tool-var))))
      (is (some? (:args (tools.legacy/declaration-of tool-var)))))))

(deftest search-tool-test
  (testing "search-tool var has valid metadata"
    (let [m (meta #'agent-tools/search-tool)]
      (is (= "search" (:tool-name m)))
      (is (some? (:schema m))))))

(deftest construct-notebook-query-tool-test
  (testing "construct_notebook_query evaluates a representations query and creates a chart"
    (let [query-captured (atom nil)
          chart-called  (atom nil)]
      (mt/with-dynamic-fn-redefs [construct/execute-representations-query
                                  (fn [external-query & _opts]
                                    (reset! query-captured external-query)
                                    {:structured-output {:query-id "q-1"
                                                         :query {:database 1}
                                                         :result-columns []}
                                     :instructions "Query created."})
                                  create-chart-tools/create-chart (fn [args]
                                                                    (reset! chart-called args)
                                                                    {:chart-id "c-1"
                                                                     :chart-type :table
                                                                     :chart-link "metabase://chart/c-1"
                                                                     :chart-content "<chart/>"
                                                                     :query-id (:query-id args)
                                                                     :query {:database 1}
                                                                     :results-url "/question#hash"})]
        (let [query-input {:lib/type "mbql/query"
                           :stages   [{:lib/type     "mbql.stage/mbql"
                                       :source-table ["Sample" "PUBLIC" "ORDERS"]
                                       :aggregation  [["count" {}]]}]}
              result (binding [shared/*profile-id* :nlq]
                       (tools.core/handle agent-tools/construct-notebook-query-tool
                                          {:reasoning     "check seats"
                                           :query         query-input
                                           :title         "Seat check"
                                           :description   "Total order count."
                                           :visualization {:chart_type "table"}}
                                          {}))]
          (is (= query-input @query-captured))
          (is (= "c-1" (get-in result [:structured-output :chart-id])))
          (is (= "q-1" (get-in result [:structured-output :query-id])))
          (is (= :table (get @chart-called :chart-type)))
          (is (seq (:data-parts result)))
          (is (= "Total order count."
                 (get-in result [:data-parts 0 :data :description]))))))))

(defn- construct-tool-with-thrown
  "Run `construct_notebook_query` with `execute-representations-query` throwing `e`."
  [e]
  (mt/with-dynamic-fn-redefs [construct/execute-representations-query (fn [& _] (throw e))]
    (binding [shared/*profile-id* :nlq]
      (tools.core/handle agent-tools/construct-notebook-query-tool
                         {:query       {:lib/type "mbql/query" :stages []}
                          :title       "Seat check"
                          :description "Total order count."}
                         {}))))

(deftest construct-notebook-query-tool-permission-error-test
  (testing (str "a 403 from the pipeline becomes the declared not-found error: `api/read-check` throws "
                "a bare one with no `:agent-error?`, and saying the entity exists but is forbidden would "
                "leak it")
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (construct-tool-with-thrown
                          (ex-info "You don't have permissions to do that." {:status-code 403}))))]
      (is (=? {:class :recoverable
               :code  :metabase.metabot.tools.recoverable.common/not-found}
              (tools.error/classify e)))))
  (testing "an unexpected error propagates to the agent loop"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"something went sideways"
                          (construct-tool-with-thrown
                           (ex-info "something went sideways" {}))))))

(deftest ->entries-test
  (testing "an entry carries what the adapters and the system message read"
    (let [entries (agent-tools/->entries [#'agent-tools/create-sql-query-tool
                                          #'agent-tools/search-tool]
                                         (atom {:state {:queries {} :charts {}}}) nil :nlq)]
      (doseq [tool-name ["create_sql_query" "search"]]
        (testing tool-name
          (let [entry (get entries tool-name)]
            (is (map? entry))
            (is (= tool-name (:tool-name entry)))
            (is (string? (:doc entry)))
            (is (some? (:schema entry)))
            (is (fn? (:fn entry))))))))
  (testing "an unconverted tool's schema comes from its var metadata"
    (let [entries (agent-tools/->entries [#'agent-tools/create-chart-tool] (atom {}) nil :nlq)
          [_:=> [_:cat declared] _out] (:schema (get entries "create_chart"))
          [_:=> [_:cat original] _out] (:schema (meta #'agent-tools/create-chart-tool))]
      (is (= original declared))))
  (testing "a converted tool and an unconverted one sit side by side"
    (let [entries (agent-tools/->entries [#'agent-tools/list-timelines-tool       ; mu/defn var
                                          #'agent-tools/get-timeline-details-tool] ; record
                                         (atom {}) nil :nlq)]
      (is (= #{"list_timelines" "get_timeline_details"} (set (keys entries))))
      (is (every? fn? (map :fn (vals entries))))))
  (testing "the entry's :fn goes through the runtime, so it reports rather than throws"
    (let [entries (agent-tools/->entries [#'agent-tools/search-tool] (atom {}) nil :nlq)
          outcome ((get-in entries ["search" :fn]) {:not_an_argument true})]
      (is (=? {:error {:class :validation :code :invalid-arguments}} outcome)))))

(deftest tool-schemas-exclude-state-keys-test
  (testing "create_chart schema does not expose state keys"
    (let [{:keys [schema]} (meta #'agent-tools/create-chart-tool)
          [_:=> [_:cat params] _out] schema]
      (is (not-any? #(= :charts_state (first %)) (rest params)))))
  (testing "edit_chart schema does not expose state keys"
    (let [{:keys [schema]} (meta #'agent-tools/edit-chart-tool)
          [_:=> [_:cat params] _out] schema]
      (is (not-any? #(= :queries_state (first %)) (rest params)))))
  (testing "create_sql_query schema does not expose state keys"
    (let [{:keys [schema]} (meta #'agent-tools/create-sql-query-tool)
          [_:=> [_:cat params] _out] schema]
      (is (not-any? #(= :queries_state (first %)) (rest params)))
      (is (not-any? #(= :charts_state (first %)) (rest params)))
      (is (not-any? #(= :memory_atom (first %)) (rest params)))))
  (testing "edit_sql_query schema does not expose state keys"
    (let [{:keys [schema]} (meta #'agent-tools/edit-sql-query-tool)
          [_:=> [_:cat params] _out] schema]
      (is (not-any? #(= :queries_state (first %)) (rest params)))
      (is (not-any? #(= :charts_state (first %)) (rest params)))))
  (testing "replace_sql_query schema does not expose state keys"
    (let [{:keys [schema]} (meta #'agent-tools/replace-sql-query-tool)
          [_:=> [_:cat params] _out] schema]
      (is (not-any? #(= :queries_state (first %)) (rest params)))
      (is (not-any? #(= :charts_state (first %)) (rest params))))))

(deftest slackbot-schedules-keep-their-day-test
  (mt/with-dynamic-fn-redefs [channel.settings/slack-configured?                  (constantly true)
                              channel.settings/slack-cached-channels-and-usernames
                              (constantly {:channels [{:display-name "#data-team" :name "data-team" :id "C123"}]})]
    (mt/with-model-cleanup [:model/Notification :model/Pulse]
      (mt/with-temp [:model/Card      {card-id :id} {}
                     :model/Dashboard {dash-id :id} {}]
        (binding [shared/*memory-atom* (atom {:context {:slack_channel_id "C123"}})]
          (mt/with-current-user (mt/user->id :crowberto)
            (doseq [schedule [{:frequency "weekly" :day_of_week "monday" :hour 9}
                              {:frequency "monthly" :day_of_month "first-monday" :hour 9}]]
              (agent-tools/create-alert-tool {:card_id card-id :send_condition "has_result" :schedule schedule})
              (agent-tools/slackbot-create-dashboard-subscription-tool {:dashboard_id dash-id :schedule schedule}))))
        (testing "alerts"
          (is (= #{"0 0 9 ? * 2 *" "0 0 9 ? * 2#1 *"}
                 (->> (models.notification/notifications-for-card card-id)
                      (mapcat :subscriptions)
                      (into #{} (map :cron_schedule))))))
        (testing "dashboard subscriptions"
          (is (= #{[:weekly "mon" nil] [:monthly "mon" :first]}
                 (->> (t2/hydrate (t2/select :model/Pulse :dashboard_id dash-id) :channels)
                      (mapcat :channels)
                      (into #{} (map (juxt :schedule_type :schedule_day :schedule_frame)))))))))))
