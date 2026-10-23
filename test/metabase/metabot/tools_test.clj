(ns metabase.metabot.tools-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.channel.settings :as channel.settings]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.test-util :as test-util]
   [metabase.metabot.tools :as agent-tools]
   [metabase.metabot.tools.charts.create :as create-chart-tools]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.core :as tools.core]
   [metabase.metabot.tools.legacy :as tools.legacy]
   [metabase.metabot.tools.shared :as shared]
   [metabase.notification.models :as models.notification]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.query-processor :as qp]
   [metabase.search.entity-retrieval.core :as entity-retrieval]
   [metabase.test :as mt]
   [metabase.util.json :as json]
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

(deftest run-query-needs-query-execution-enabled-test
  (testing "run_query is offered only once an admin enables query execution"
    (mt/with-temporary-setting-values [metabot-query-execution-enabled? false]
      (is (not (contains? (tools-for-profile :internal) "run_query"))))
    (mt/with-temporary-setting-values [metabot-query-execution-enabled? true]
      (is (contains? (tools-for-profile :internal) "run_query")))))

(deftest slackbot-profile-has-no-run-query-test
  ;; Everyone in a Slack thread can read its stored tool output, so one person's rows would reach the others.
  ;; Filter that output per reader before offering run_query there.
  (testing "run_query is not offered in Slack even with query execution enabled"
    (mt/with-temporary-setting-values [metabot-query-execution-enabled? true]
      (is (not (contains? (tools-for-profile :slackbot) "run_query"))))))

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
  (testing "a profile's registry is keyed by the name each tool declares, whether that tool is a
           record or still an `mu/defn` var. The declaration is the source of truth either way —
           reading `:tool-name` off the var only worked while every tool was the second kind."
    (let [tools (tools-for-profile :embedding_next)]
      (is (seq tools))
      (doseq [[tool-name tool-var] tools]
        (is (var? tool-var))
        (is (string? tool-name))
        (let [{declared-name :name :keys [description args]} (tools.legacy/declaration-of tool-var)]
          (is (= tool-name declared-name))
          (is (string? description))
          (is (some? args)))))))

(deftest search-tool-test
  (testing "search declares its name and argument schema"
    (let [declared (tools.legacy/declaration-of #'agent-tools/search-tool)]
      (is (= "search" (:name declared)))
      (is (some? (:args declared))))))

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
                       (test-util/call-tool agent-tools/construct-notebook-query-tool
                                            {:reasoning     "check seats"
                                             :query         query-input
                                             :title         "Seat check"
                                             :description   "Total order count."
                                             :visualization {:chart_type "table"}}))]
          (is (= query-input @query-captured))
          (is (= "c-1" (get-in result [:structured-output :chart-id])))
          (is (= "q-1" (get-in result [:structured-output :query-id])))
          (is (= :table (get @chart-called :chart-type)))
          (is (seq (:data-parts result)))
          (is (= "Total order count."
                 (get-in result [:data-parts 0 :data :description]))))))))

(deftest construct-notebook-query-keeps-mbql5-temporal-filter-test
  (testing "the generated_entity part carries a between filter of absolute-datetime bounds through JSON intact (BOT-1972)"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
                    (lib/filter (lib/between (meta/field-metadata :checkins :date)
                                             (lib/absolute-datetime "2026-07-01" :day)
                                             (lib/absolute-datetime "2026-07-31" :day))))]
      (mt/with-dynamic-fn-redefs [construct/execute-representations-query
                                  (fn [_ & _]
                                    {:structured-output {:query-id       "q-1"
                                                         :query          query
                                                         :result-columns []}})]
        (let [result (binding [shared/*profile-id* :nlq]
                       (test-util/call-tool agent-tools/construct-notebook-query-tool
                                            {:query       {:lib/type "mbql/query" :stages []}
                                             :title       "Check-ins in July"
                                             :description "Check-ins during July 2026."}))
              sent   (-> result (get-in [:data-parts 0 :data :query :query]) json/encode (json/decode true))]
          (is (= "mbql/query" (:lib/type sent)))
          (is (= (lib/filters query)
                 (-> sent lib/normalize :stages first :filters))))))))

(deftest construct-notebook-query-tool-show-chart-test
  (let [construct! (fn [tool-names show-chart-arg]
                     (let [chart-created? (atom false)]
                       (mt/with-dynamic-fn-redefs [construct/execute-representations-query
                                                   (fn [_ & _]
                                                     {:structured-output {:query-id       "q-1"
                                                                          :query          {:database 1}
                                                                          :result-columns []}})
                                                   create-chart-tools/create-chart
                                                   (fn [_]
                                                     (reset! chart-created? true)
                                                     {:chart-id "c-1", :chart-type :table})]
                         (let [result (binding [shared/*profile-id*  :nlq
                                                shared/*memory-atom* (atom {:tool-names tool-names})]
                                        (test-util/call-tool
                                         agent-tools/construct-notebook-query-tool
                                         (merge {:query       {:lib/type "mbql/query", :stages []}
                                                 :title       "Seat check"
                                                 :description "Total order count."}
                                                show-chart-arg)))]
                           {:chart?   @chart-created?
                            :shown?   (boolean (seq (:data-parts result)))
                            :query-id (get-in result [:structured-output :query-id])
                            :run-it?  (boolean (re-find #"call `run_query` with `query_id` `q-1`"
                                                        (:output result)))}))))]
    (testing "with run_query offered, the query is built and the user is shown nothing"
      (is (= {:chart? false, :shown? false, :query-id "q-1", :run-it? true}
             (construct! #{"construct_notebook_query" "run_query"} {:show_chart false}))))
    (testing "with run_query offered and the argument left out, the chart is shown"
      (is (= {:chart? true, :shown? true, :query-id "q-1", :run-it? false}
             (construct! #{"construct_notebook_query" "run_query"} {}))))
    (testing "without run_query the chart is shown whatever the argument says"
      (is (= {:chart? true, :shown? true, :query-id "q-1", :run-it? false}
             (construct! #{"construct_notebook_query"} {:show_chart false}))))))

(defn- source-field-query-without-validation! [construct!]
  (let [resolved (atom nil)]
    (mt/with-dynamic-fn-redefs [construct/assert-source-fields-reach-their-tables! (fn [query] (reset! resolved query))]
      (try (construct!) (catch clojure.lang.ExceptionInfo _)))
    (is (map? @resolved))
    @resolved))

(defn- source-field-qp-control! [construct!]
  (qp/process-query (source-field-query-without-validation! construct!)))

(defn- assert-source-field-qp-failure! [construct!]
  (let [query (source-field-query-without-validation! construct!)
        result (try (qp/process-query query) (catch Exception e e))]
    (is (or (instance? Exception result) (= :failed (:status result)))
        (if (instance? Exception result) (ex-message result)
            (str "QP accepted the rejected query: " (select-keys result [:status :row_count]))))))

(deftest construct-notebook-query-tool-wrong-source-field-test
  (let [db          (t2/select-one-fn :name :model/Database (mt/id))
        fk          (fn [table column] [db "PUBLIC" table column])
        venue-id    (fk "CHECKINS" "VENUE_ID")
        venues-join {:alias      "Venues"
                     :strategy   "left-join"
                     :stages     [{:lib/type "mbql.stage/mbql" :source-table [db "PUBLIC" "VENUES"]}]
                     :conditions [["=" {}
                                   ["field" {} venue-id]
                                   ["field" {:join-alias "Venues"} (fk "VENUES" "ID")]]]}
        args        (fn [stage]
                      {:query       {:lib/type "mbql/query"
                                     :stages   [(merge {:lib/type     "mbql.stage/mbql"
                                                        :source-table [db "PUBLIC" "CHECKINS"]
                                                        :aggregation  [["count" {}]]}
                                                       stage)]}
                       :title       "Check-ins"
                       :description "Check-ins by category."})
        refusal     (fn [opts field]
                      (assert-source-field-qp-failure!
                       #(construct/execute-representations-query (:query (args {:breakout [["field" opts field]]}))))
                      (test-util/tool-failure agent-tools/construct-notebook-query-tool
                                              (args {:breakout [["field" opts field]]})
                                              #{"read_resource"}))
        refused     (fn [& sentences]
                      {:class :recoverable
                       :code  :metabase.metabot.tools.recoverable.pipeline/wrong-source-field
                       :text  (str (apply str sentences) "\n"
                                   "Call `read_resource` with `metabase://table/<numeric id>/fields` for the source "
                                   "table to list the available foreign-key columns.")})]
    (mt/with-current-user (mt/user->id :rasta)
      (testing "a field reached through a foreign key to another table is refused, naming the path that reaches it"
        (doseq [opts [{:source-field venue-id} {:source-field venue-id :join-alias nil}]]
          (testing (pr-str opts)
            (is (= (refused "Field " (pr-str (fk "CATEGORIES" "NAME")) " is on table \"CATEGORIES\", but its "
                            "`source-field` " (pr-str venue-id) " is a foreign key to table \"VENUES\", so the "
                            "field cannot be reached through it. \"VENUES\" has a foreign key to \"CATEGORIES\": "
                            "join \"VENUES\" explicitly on " (pr-str venue-id) " and leave out `source-field`, so "
                            "the field is reached through that join.")
                   (refusal opts (fk "CATEGORIES" "NAME")))))))
      (testing "a source-field that is not a foreign key is refused"
        (is (= (refused "Field " (pr-str (fk "VENUES" "NAME")) " is on table \"VENUES\", but its `source-field` "
                        (pr-str (fk "CHECKINS" "DATE")) " is not a foreign key to that table, so the field cannot "
                        "be reached through it. Use `source-field` " (pr-str venue-id) " to reach \"VENUES\" directly.")
               (refusal {:source-field (fk "CHECKINS" "DATE")} (fk "VENUES" "NAME")))))
      (testing (str "a one-hop reference builds and runs, as do the path the refusal names and a reference through "
                    "an explicit join, whose `source-field` the query processor ignores")
        (doseq [stage [{:breakout [["field" {:source-field venue-id} (fk "VENUES" "NAME")]]}
                       {:joins [venues-join] :breakout [["field" {} (fk "CATEGORIES" "NAME")]]}
                       {:joins    [venues-join]
                        :breakout [["field" {:join-alias "Venues" :source-field (fk "CHECKINS" "DATE")}
                                    (fk "VENUES" "NAME")]]}]]
          (testing (pr-str stage)
            (is (seq (mt/rows (qp/process-query
                               (get-in (test-util/call-tool agent-tools/construct-notebook-query-tool (args stage))
                                       [:structured-output :query])))))))))
    (testing "the table the foreign key points at is not named when the user cannot query it"
      (mt/with-no-data-perms-for-all-users!
        (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
        (doseq [table [:checkins :categories]]
          (perms/set-table-permission! (perms-group/all-users) (mt/id table) :perms/create-queries :query-builder))
        (mt/with-current-user (mt/user->id :rasta)
          (is (= (refused "Field " (pr-str (fk "CATEGORIES" "NAME")) " is on table \"CATEGORIES\", but its "
                          "`source-field` " (pr-str venue-id) " is not a foreign key to that table, so the field "
                          "cannot be reached through it. Use a `source-field` that is a foreign key to "
                          "\"CATEGORIES\", or join \"CATEGORIES\" explicitly and reference the field with its "
                          "`join-alias`.")
                 (refusal {:source-field venue-id} (fk "CATEGORIES" "NAME")))))))))

(defn- checkins-venues-join [db]
  {:alias      "Venues"
   :strategy   "left-join"
   :stages     [{:lib/type "mbql.stage/mbql" :source-table [db "PUBLIC" "VENUES"]}]
   :conditions [["=" {}
                 ["field" {} [db "PUBLIC" "CHECKINS" "VENUE_ID"]]
                 ["field" {:join-alias "Venues"} [db "PUBLIC" "VENUES" "ID"]]]]})

(defn- construct-checkins-query [db stages]
  (construct/execute-representations-query
   {:lib/type "mbql/query"
    :stages   (-> (mapv #(merge {:lib/type "mbql.stage/mbql"} %) stages)
                  (assoc-in [0 :source-table] [db "PUBLIC" "CHECKINS"]))}))

(deftest construct-notebook-query-supported-source-fields-test
  (let [db          (t2/select-one-fn :name :model/Database (mt/id))
        fk          (fn [table column] [db "PUBLIC" table column])
        venue-id    (fk "CHECKINS" "VENUE_ID")
        category-id (fk "VENUES" "CATEGORY_ID")
        category    (fk "CATEGORIES" "NAME")
        breakout    (fn [opts field] {:aggregation [["count" {}]] :breakout [["field" opts field]]})
        venues-join (checkins-venues-join db)]
    (mt/with-current-user (mt/user->id :rasta)
      (testing "available keys work in later stages and through an explicit join"
        (doseq [stages [[(assoc (breakout {:source-field category-id :source-field-join-alias "Other"} category)
                                :joins [venues-join])]
                        [(assoc (breakout {:source-field category-id :source-field-name "CATEGORY_ID"
                                           :source-field-join-alias "Other"} category) :joins [venues-join])]
                        [{:fields [["field" {} venue-id]]}
                         (breakout {:source-field venue-id} (fk "VENUES" "NAME"))]
                        [{:fields [["field" {} (fk "CHECKINS" "ID")]]}
                         (breakout {:source-field venue-id} (fk "VENUES" "NAME"))]
                        [(assoc (breakout {:source-field venue-id} (fk "VENUES" "NAME"))
                                :joins [venues-join])]
                        [(assoc (breakout {:source-field category-id :source-field-join-alias "Venues"} category)
                                :joins [venues-join])]
                        [(assoc (breakout {:source-field category-id} category) :joins [venues-join])]
                        [(breakout {:source-field venue-id} (fk "VENUES" "NAME"))
                         {:fields [["field" {:source-field venue-id} (fk "VENUES" "NAME")]]}]]]
          (testing (pr-str stages)
            (let [rows (mt/rows (qp/process-query (get-in (construct-checkins-query db stages) [:structured-output :query])))]
              (is (seq rows))
              (when (= "Other" (get-in stages [0 :breakout 0 1 :source-field-join-alias]))
                (let [corrected (assoc-in stages [0 :breakout 0 1 :source-field-join-alias] "Venues")]
                  (is (= (set rows) (set (mt/rows (qp/process-query
                                                   (get-in (construct-checkins-query db corrected) [:structured-output :query])))))))))))))))

(deftest construct-notebook-query-unavailable-source-field-test
  (let [db (t2/select-one-fn :name :model/Database (mt/id))]
    (mt/with-current-user (mt/user->id :rasta)
      (is (map? (get-in (construct-checkins-query
                         db [{:aggregation [["count" {}]]
                              :breakout [["field" {:source-field [db "PUBLIC" "VENUES" "CATEGORY_ID"]}
                                          [db "PUBLIC" "CATEGORIES" "NAME"]]]}])
                        [:structured-output :query]))))))

(deftest construct-notebook-query-wrong-source-field-context-test
  (let [db        (t2/select-one-fn :name :model/Database (mt/id))
        correct   ["field" {:source-field [db "PUBLIC" "VENUES" "CATEGORY_ID"]
                            :source-field-join-alias "Venues"}
                   [db "PUBLIC" "CATEGORIES" "NAME"]]
        wrong-key [db "PUBLIC" "CHECKINS" "VENUE_ID"]
        wrong     ["field" {:source-field wrong-key} [db "PUBLIC" "CATEGORIES" "NAME"]]
        build!    #(construct-checkins-query db [{:joins [(checkins-venues-join db)]
                                                  :aggregation [["count" {}]] :breakout %}])]
    (mt/with-current-user (mt/user->id :rasta)
      (let [control (mt/rows (source-field-qp-control! #(build! [correct])))]
        (is (seq control))
        (is (= (set control) (set (mt/rows (qp/process-query (get-in (build! [correct]) [:structured-output :query])))))))
      (doseq [breakouts [[correct wrong] [wrong correct]]]
        (assert-source-field-qp-failure! #(build! breakouts))
        (let [error (try (build! breakouts) (catch clojure.lang.ExceptionInfo e e))]
          (is (= :wrong-source-field (:error (ex-data error))))
          (is (str/includes? (or (ex-message error) "") (str "`source-field` " (pr-str wrong-key))))
          (is (not (str/includes? (or (ex-message error) "")
                                  (str "`source-field` " (pr-str (get-in correct [1 :source-field])))))))))))

(deftest construct-notebook-query-direct-source-field-hint-test
  (let [db       (t2/select-one-fn :name :model/Database (mt/id))
        fk       (fn [table column] [db "PUBLIC" table column])
        user-id  (fk "CHECKINS" "USER_ID")
        query    (fn [source-field]
                   (construct-checkins-query
                    db [{:aggregation [["count" {}]]
                         :breakout    [["field" {:source-field source-field} (fk "USERS" "NAME")]]}]))]
    (mt/with-current-user (mt/user->id :rasta)
      (assert-source-field-qp-failure! #(query (fk "CHECKINS" "VENUE_ID")))
      (let [e (try
                (query (fk "CHECKINS" "VENUE_ID"))
                (catch clojure.lang.ExceptionInfo e e))]
        (is (= :wrong-source-field (:error (ex-data e))))
        (is (str/includes? (or (ex-message e) "") (str "Use `source-field` " (pr-str user-id)))))
      (testing "the direct key suggested by the hint builds and runs"
        (is (seq (mt/rows (qp/process-query (get-in (query user-id) [:structured-output :query])))))))))

(deftest construct-notebook-query-source-field-join-alias-hint-test
  (let [db            (t2/select-one-fn :name :model/Database (mt/id))
        fk            (fn [table column] [db "PUBLIC" table column])
        checkins-join {:alias      "Checkins"
                       :strategy   "left-join"
                       :stages     [{:lib/type "mbql.stage/mbql" :source-table [db "PUBLIC" "CHECKINS"]}]
                       :conditions [["=" {}
                                     ["field" {} (fk "USERS" "ID")]
                                     ["field" {:join-alias "Checkins"} (fk "CHECKINS" "USER_ID")]]]}
        query         (fn [joins opts]
                        (construct/execute-representations-query
                         {:lib/type "mbql/query"
                          :stages   [{:lib/type     "mbql.stage/mbql"
                                      :source-table [db "PUBLIC" "USERS"]
                                      :joins        joins
                                      :aggregation  [["count" {}]]
                                      :breakout     [["field" opts (fk "CATEGORIES" "NAME")]]}]}))]
    (mt/with-current-user (mt/user->id :rasta)
      (assert-source-field-qp-failure!
       #(query [checkins-join] {:source-field (fk "CHECKINS" "VENUE_ID") :source-field-join-alias "Checkins"}))
      (let [e (try
                (query [checkins-join] {:source-field            (fk "CHECKINS" "VENUE_ID")
                                        :source-field-join-alias "Checkins"})
                (catch clojure.lang.ExceptionInfo e e))]
        (is (= :wrong-source-field (:error (ex-data e))))
        (is (str/includes? (or (ex-message e) "") "with `join-alias` \"Checkins\"")))
      (testing "the suggested join runs with an explicit or inferred alias for its key"
        (let [rows (mapv (fn [join-alias]
                           (let [venues-join (cond-> (checkins-venues-join db)
                                               join-alias (assoc-in [:conditions 0 2 1 :join-alias] join-alias))
                                 result      (query [checkins-join venues-join]
                                                    {:source-field            (fk "VENUES" "CATEGORY_ID")
                                                     :source-field-join-alias "Venues"})]
                             (mt/rows (qp/process-query (get-in result [:structured-output :query])))))
                         [nil "Checkins"])]
          (is (seq (first rows)))
          (is (= (set (first rows)) (set (second rows)))))))))

(deftest construct-notebook-query-dependent-implicit-joins-test
  (let [db (t2/select-one-fn :name :model/Database (mt/id))
        fk (fn [table field] [db "PUBLIC" table field])
        build! #(construct-checkins-query
                 db [{:aggregation [["count" {}]]
                      :breakout [["field" {:source-field (fk "CHECKINS" "VENUE_ID")} (fk "VENUES" "NAME")]
                                 ["field" {:source-field (fk "VENUES" "CATEGORY_ID")
                                           :source-field-join-alias "VENUES__via__VENUE_ID"}
                                  (fk "CATEGORIES" "NAME")]]}])]
    (mt/with-current-user (mt/user->id :rasta)
      (let [control (mt/rows (source-field-qp-control! build!))]
        (is (seq control))
        (is (= (set control) (set (mt/rows (qp/process-query (get-in (build!) [:structured-output :query]))))))))))

(deftest construct-notebook-query-native-source-card-implicit-join-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [mp (mt/metadata-provider)
          native (lib/native-query mp "SELECT VENUE_ID FROM CHECKINS")
          result (qp/process-query native)
          columns (get-in result [:data :cols])
          db (t2/select-one-fn :name :model/Database (mt/id))]
      (is (seq columns))
      (is (every? (comp nil? :id) columns))
      (mt/with-temp [:model/Card {eid :entity_id} {:name "Native venue keys" :dataset_query native :result_metadata columns}]
        (let [build! #(construct/execute-representations-query
                       {:lib/type "mbql/query"
                        :stages [{:lib/type "mbql.stage/mbql" :source-card eid
                                  :aggregation [["count" {}]]
                                  :breakout [["field" {:source-field [db "PUBLIC" "CHECKINS" "VENUE_ID"]}
                                              [db "PUBLIC" "VENUES" "NAME"]]]}]})
              control (mt/rows (source-field-qp-control! build!))]
          (is (seq control))
          (is (= (set control) (set (mt/rows (qp/process-query (get-in (build!) [:structured-output :query])))))))))))

(deftest construct-notebook-query-joined-key-propagation-test
  (let [db     (t2/select-one-fn :name :model/Database (mt/id))
        stages [{:fields [["field" {} [db "PUBLIC" "CHECKINS" "ID"]]]
                 :joins  [(assoc (checkins-venues-join db) :fields "none")]}
                {:aggregation [["count" {}]]
                 :breakout [["field" {:source-field [db "PUBLIC" "VENUES" "CATEGORY_ID"]
                                      :source-field-name "Venues__CATEGORY_ID"}
                             [db "PUBLIC" "CATEGORIES" "NAME"]]]}]
        run!   (fn []
                 (mt/rows (qp/process-query
                           (get-in (construct-checkins-query db stages) [:structured-output :query]))))]
    (mt/with-current-user (mt/user->id :rasta)
      (is (seq (run!))))))

(deftest construct-notebook-query-source-card-key-propagation-test
  (let [mp       (mt/metadata-provider)
        db       (t2/select-one-fn :name :model/Database (mt/id))
        raw      (lib/with-fields (lib/query mp (lib.metadata/table mp (mt/id :checkins)))
                   [(lib.metadata/field mp (mt/id :checkins :id))])
        run!     (fn [card-eid]
                   (get-in (construct/execute-representations-query
                            {:lib/type "mbql/query"
                             :stages   [{:lib/type    "mbql.stage/mbql"
                                         :source-card card-eid
                                         :aggregation [["count" {}]]
                                         :breakout    [["field" {:source-field [db "PUBLIC" "CHECKINS" "VENUE_ID"]}
                                                        [db "PUBLIC" "VENUES" "NAME"]]]}]})
                           [:structured-output :query]))]
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temp [:model/Card {card-eid :entity_id} {:name "Check-ins source" :dataset_query raw}]
        (is (seq (mt/rows (qp/process-query (run! card-eid)))))))))

(deftest construct-notebook-query-source-card-field-permissions-test
  (let [mp (mt/metadata-provider)
        db (t2/select-one-fn :name :model/Database (mt/id))
        query (lib/with-fields (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                [(lib.metadata/field mp (mt/id :venues :name))])]
    (mt/with-temp [:model/Card {card-eid :entity_id} {:name "Venue names" :dataset_query query}]
      (mt/with-no-data-perms-for-all-users!
        (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
        (perms/set-table-permission! (perms-group/all-users) (mt/id :checkins) :perms/create-queries :query-builder)
        (mt/with-current-user (mt/user->id :rasta)
          (let [build! #(construct/execute-representations-query
                         {:lib/type "mbql/query"
                          :stages [{:lib/type "mbql.stage/mbql" :source-card card-eid
                                    :aggregation [["count" {}]]
                                    :breakout [["field" {:source-field [db "PUBLIC" "CHECKINS" "DATE"]
                                                         :base-type "type/Text"} "NAME"]]}]})
                control (mt/rows (source-field-qp-control! build!))]
            (is (seq control))
            (is (= (set control) (set (mt/rows (qp/process-query (get-in (build!) [:structured-output :query]))))))))))))

(deftest construct-notebook-query-source-card-hint-permissions-test
  (let [mp       (mt/metadata-provider)
        db       (t2/select-one-fn :name :model/Database (mt/id))
        category [db "PUBLIC" "VENUES" "CATEGORY_ID"]
        target   [db "PUBLIC" "VENUES" "NAME"]
        query    (lib/with-fields (lib/query mp (lib.metadata/table mp (mt/id :checkins)))
                   [(lib.metadata/field mp (mt/id :checkins :venue_id))])]
    (mt/with-temp [:model/Card {card-eid :entity_id} {:name "Venue keys" :dataset_query query}]
      (mt/with-no-data-perms-for-all-users!
        (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
        (perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/create-queries :query-builder)
        (mt/with-current-user (mt/user->id :rasta)
          (assert-source-field-qp-failure!
           #(construct/execute-representations-query
             {:lib/type "mbql/query"
              :stages [{:lib/type "mbql.stage/mbql" :source-card card-eid
                        :aggregation [["count" {}]]
                        :breakout [["field" {:source-field category} target]]}]}))
          (let [e (try
                    (construct/execute-representations-query
                     {:lib/type "mbql/query"
                      :stages [{:lib/type "mbql.stage/mbql" :source-card card-eid
                                :aggregation [["count" {}]]
                                :breakout [["field" {:source-field category} target]]}]})
                    (catch clojure.lang.ExceptionInfo e e))]
            (is (= :wrong-source-field (:error (ex-data e))))
            (is (= (str "Field " (pr-str target) " is on table \"VENUES\", but its `source-field` "
                        (pr-str category) " is not a foreign key to that table, so the field cannot be reached through it. "
                        "Use a `source-field` that is a foreign key to \"VENUES\", or join \"VENUES\" explicitly "
                        "and reference the field with its `join-alias`.")
                   (ex-message e)))))))))

(defn- construct-tool-failure-for-thrown
  "Run `construct_notebook_query` with `execute-representations-query` throwing `e`, and return the
  failure the model would see."
  [e]
  (mt/with-dynamic-fn-redefs [construct/execute-representations-query (fn [_ & _] (throw e))]
    (binding [shared/*profile-id* :nlq]
      (test-util/tool-failure agent-tools/construct-notebook-query-tool
                              {:query       {:lib/type "mbql/query" :stages []}
                               :title       "Seat check"
                               :description "Total order count."}
                              #{"read_resource" "search"}))))

(deftest construct-notebook-query-tool-permission-error-test
  (testing (str "a 403 from inside the pipeline becomes the shared not-found error. Before, "
                "`api/read-check`'s own sentence went to the model as the tool's output, which "
                "named no entity and offered no next step — and told the model that something it "
                "could not see exists.")
    (let [{:keys [class code text]}
          (construct-tool-failure-for-thrown
           (ex-info "You don't have permissions to do that." {:status-code 403}))]
      (is (= :recoverable class))
      (is (= :metabase.metabot.tools.recoverable.common/not-found code))
      (is (str/includes? text "was not found"))
      (is (not (str/includes? text "permission")))))
  (testing (str "a declared pipeline code keeps the pipeline's sentence and gains its "
                "declaration's recovery step")
    (let [{:keys [class code text]}
          (construct-tool-failure-for-thrown
           (ex-info "No table found matching portable FK [\"Sample\" nil \"ORDRS\"]."
                    {:agent-error? true :status-code 400 :error :unknown-table}))]
      (is (= :recoverable class))
      (is (= :metabase.metabot.tools.recoverable.pipeline/unknown-table code))
      (is (str/includes? text "No table found matching portable FK"))
      (is (str/includes? text "metabase://database/<numeric id>/tables"))))
  (testing "An exception without a declared `:error` code ends the turn, even if `:agent-error?` is true."
    (doseq [[what e] {"stamped by the pipeline, no :error code"
                      (ex-info "No matching clause: :metabase.lib.schema/bogus" {:agent-error? true})

                      "an ordinary bug"
                      (ex-info "something went sideways" {})}]
      (testing what
        (is (= {:class :unrecoverable :code :internal}
               (construct-tool-failure-for-thrown e)))))))

(deftest construct-notebook-query-tool-malformed-clauses-test
  (testing "the model can retry after a malformed stage or clause"
    (let [orders   {:lib/type     "mbql.stage/mbql"
                    :source-table [(t2/select-one-fn :name :model/Database (mt/id)) "PUBLIC" "ORDERS"]}
          post-agg (assoc orders :aggregation [["count" {}]] :filters [[">" {} ["aggregation" {} 0] 1]])]
      (mt/with-current-user (mt/user->id :rasta)
        (doseq [[label stages] {"a number as `aggregation`"
                                [(assoc orders :aggregation 42)]
                                "an empty aggregation clause used in `order-by`"
                                [(assoc orders :aggregation [[]] :order-by [["desc" {} []]])]
                                "a number as `joins`"
                                [(assoc orders :joins 42)]
                                "a post-aggregation filter with a number as `order-by`"
                                [(assoc post-agg :order-by 42)]
                                "a post-aggregation filter with a number as `fields`"
                                [(assoc post-agg :fields 42)]
                                "a number as a later stage"            [orders 42]
                                "an aggregation list as a later stage" [orders [["count" {}]]]}]
          (testing label
            (is (=? {:class :recoverable
                     :code  :metabase.metabot.tools.recoverable.pipeline/invalid-representations-query
                     :text  #"^Representations query has an invalid structure\."}
                    (test-util/tool-failure agent-tools/construct-notebook-query-tool
                                            {:query       {:lib/type "mbql/query" :stages stages}
                                             :title       "Orders"
                                             :description "Orders by count."})))))))))

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
  (doseq [tool [agent-tools/create-sql-query-tool agent-tools/create-sql-query-code-edit-tool
                agent-tools/edit-sql-query-tool agent-tools/replace-sql-query-tool]]
    (testing (str (:name (tools.core/declaration tool)) " schema does not expose state keys")
      (let [params (:args (tools.core/declaration tool))]
        (is (not-any? #(contains? #{:queries_state :charts_state :memory_atom} (first %)) (drop 2 params)))))))

(deftest notification-tools-store-requested-schedules-test
  (mt/with-dynamic-fn-redefs [channel.settings/slack-configured?                  (constantly true)
                              channel.settings/slack-cached-channels-and-usernames
                              (constantly {:channels [{:display-name "#data-team" :name "data-team" :id "C123"}]})]
    (mt/with-temp [:model/Card          {card-id :id}       {}
                   :model/Dashboard     {slack-dash-id :id} {}
                   :model/DashboardCard _                   {:dashboard_id slack-dash-id :card_id card-id}
                   :model/Dashboard     {inapp-dash-id :id} {}
                   :model/DashboardCard _                   {:dashboard_id inapp-dash-id :card_id card-id}]
      (let [alert-schedules        #(->> (models.notification/notifications-for-card card-id)
                                         (mapcat :subscriptions)
                                         (mapv :cron_schedule))
            subscription-schedules (fn [dash-id]
                                     (->> (t2/hydrate (t2/select :model/Pulse :dashboard_id dash-id) :channels)
                                          (mapcat :channels)
                                          (mapv (juxt :schedule_type :schedule_hour :schedule_day :schedule_frame))))]
        (binding [shared/*memory-atom* (atom {:context {:slack_channel_id "C123"}})]
          (mt/with-current-user (mt/user->id :crowberto)
            (doseq [[schedule expected-cron expected-subscription]
                    [[{:frequency "hourly"}
                      "0 0 * * * ? *" [:hourly nil nil nil]]
                     [{:frequency "daily" :hour 9}
                      "0 0 9 * * ? *" [:daily 9 nil nil]]
                     [{:frequency "weekly" :day_of_week "monday" :hour 9}
                      "0 0 9 ? * 2 *" [:weekly 9 "mon" nil]]
                     [{:frequency "monthly" :day_of_month "first-monday" :hour 9}
                      "0 0 9 ? * 2#1 *" [:monthly 9 "mon" :first]]]]
              (testing (:frequency schedule)
                (mt/with-model-cleanup [:model/Notification :model/Pulse]
                  (doseq [[tool args stored-schedules expected]
                          [[#'agent-tools/create-alert-tool
                            {:card_id card-id :send_condition "has_result"}
                            alert-schedules expected-cron]
                           [#'agent-tools/slackbot-create-dashboard-subscription-tool
                            {:dashboard_id slack-dash-id}
                            #(subscription-schedules slack-dash-id) expected-subscription]
                           [#'agent-tools/create-dashboard-subscription-tool
                            {:dashboard_id inapp-dash-id :slack_channel "data-team"}
                            #(subscription-schedules inapp-dash-id) expected-subscription]]]
                    (testing (str tool)
                      (is (= {:output "success"} (tool (assoc args :schedule schedule))))
                      (is (= [expected] (stored-schedules))))))))))))))
