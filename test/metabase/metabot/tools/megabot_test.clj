(ns metabase.metabot.tools.megabot-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.tools.megabot :as megabot]
   [metabase.metabot.tools.shared :as shared]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- resolves-to-question-url?
  "Whether `uri` (a `metabase://query/…` or `metabase://chart/…` link) resolves against `memory`'s
  state to an ad-hoc `/question#` URL."
  [memory uri]
  (str/starts-with? (links/resolve-links (str "[x](" uri ")")
                                         (get-in @memory [:state :queries])
                                         (get-in @memory [:state :charts])
                                         (atom {}))
                    "[x](/question#"))

(def ^:private three-rows-sql
  "select 1 as n union all select 2 union all select 3")

(defn- canceled-error-code
  "An SQLException vendor code `mdb/query-canceled-exception?` recognizes on the current app db. Postgres
  matches on the SQLState instead, which the test exception sets to `57014` (QUERY_CANCELED)."
  []
  (case (mdb/db-type)
    :h2    57014 ; org.h2.api.ErrorCode/STATEMENT_WAS_CANCELED
    :mysql 3024
    0))

(deftest query-app-db-refuses-writes-test
  (testing "query_app_db refuses any statement that is not a read"
    (doseq [sql ["delete from setting"
                 "DROP TABLE setting"
                 "update core_user set is_superuser = true"
                 "insert into setting (key, value) values ('x', 'y')"]]
      (let [{:keys [output structured-output]} (megabot/query-app-db-tool {:sql sql})]
        (is (str/includes? output "read-only")
            (str "should refuse: " sql))
        (is (nil? structured-output))))))

(deftest query-app-db-reads-test
  (testing "query_app_db runs a SELECT against the app db and returns rows"
    (let [{:keys [output structured-output]} (megabot/query-app-db-tool {:sql "select 1 as n"})]
      (is (some? output))
      (is (= 1 (:row-count structured-output)))))
  (testing "row_limit caps returned rows"
    (let [{:keys [output structured-output]} (megabot/query-app-db-tool
                                              {:sql "select id from metabase_database" :row_limit 1})]
      (is (some? structured-output) (str "expected rows, got output: " output))
      (is (<= (:row-count structured-output) 1))))
  (testing "row_limit below the row count flags the result as truncated"
    (let [{:keys [output structured-output]} (megabot/query-app-db-tool {:sql three-rows-sql :row_limit 2})]
      (is (= 2 (:row-count structured-output)))
      (is (true? (:truncated? structured-output)))
      (is (str/includes? output "limit reached"))))
  (testing "row_limit equal to the row count is a complete result"
    (let [{:keys [output structured-output]} (megabot/query-app-db-tool {:sql three-rows-sql :row_limit 3})]
      (is (= 3 (:row-count structured-output)))
      (is (false? (:truncated? structured-output)))
      (is (not (str/includes? output "limit reached"))))))

(deftest run-read-only-app-db-sql-max-rows-test
  (testing "max-rows caps the rows fetched from the app db"
    (is (= 2 (count (metabot.db/run-read-only-app-db-sql three-rows-sql 2 30))))))

(deftest query-app-db-timeout-test
  (testing "a statement timeout returns a timed-out error with a recovery hint"
    (mt/with-dynamic-fn-redefs [metabot.db/run-read-only-app-db-sql
                                (fn [& _]
                                  (throw (java.sql.SQLException. "canceled" "57014" (int (canceled-error-code)))))]
      (let [{:keys [output structured-output]} (megabot/query-app-db-tool {:sql "select 1"})]
        (is (str/includes? output "timed out"))
        (is (str/includes? output "To recover:"))
        (is (nil? structured-output))))))

(deftest app-db-write-is-rolled-back-test
  ;; H2 only: the write below uses H2/ANSI double-quoted reserved-word columns; the rollback mechanism
  ;; itself is dialect-independent (Metabase savepoints), so covering the default dev/test app db is enough.
  (when (= :h2 (mdb/db-type))
    (testing "a write reaching run-read-only-app-db-sql (past the tool's keyword guard) does not persist"
      (let [count-sql "select count(*) as c from setting"
            n-before  (:c (first (metabot.db/run-read-only-app-db-sql count-sql 1 30)))]
        (metabot.db/run-read-only-app-db-sql
         "insert into setting (\"KEY\", \"VALUE\") values ('megabot-rollback-probe', 'x')" 1 30)
        (is (= n-before (:c (first (metabot.db/run-read-only-app-db-sql count-sql 1 30))))
            "the insert must have been rolled back, leaving the row count unchanged")))))

(deftest run-warehouse-sql-error-path-test
  (testing "an unrunnable query returns an error string in :output rather than throwing"
    (let [{:keys [output structured-output]} (megabot/run-warehouse-sql-tool {:database_id 0 :sql "select 1"})]
      (is (string? output))
      (is (or (str/includes? output "Query failed") (str/includes? output "Query error")))
      (testing "and the error carries a recovery hint so the model can fix the next call"
        (is (str/includes? output "To recover:"))
        (is (str/includes? output "query_app_db")))
      (testing "and registers nothing: no structured output means no query id"
        (is (nil? structured-output))))))

(deftest run-warehouse-sql-returns-rows-test
  (testing "a valid native query against a warehouse returns rows the LLM can read"
    (mt/test-drivers #{:h2}
      (let [memory (atom {:state {}})
            raw    {:database (mt/id) :type :native :native {:query "SELECT 1 AS n"}}
            {:keys [output structured-output]}
            (binding [shared/*memory-atom* memory]
              (megabot/run-warehouse-sql-tool {:database_id (mt/id) :sql "SELECT 1 AS n"}))
            query-id (:query-id structured-output)]
        (is (str/includes? output "1"))
        (is (= 1 (:row-count structured-output)))
        (testing "registers the raw legacy query under a fresh query id"
          (is (not (str/blank? query-id)))
          (is (= raw (:query structured-output)))
          (is (= (mt/id) (:database structured-output)))
          (is (str/includes? output (str "Query ID: " query-id)))
          (is (str/includes? output (str "metabase://query/" query-id))))
        (testing "the query is in memory immediately (live state and the persisted turn delta)"
          (is (= raw (get-in @memory [:state :queries query-id])))
          (is (= raw (get-in @memory [:turn-state :queries query-id])))
          (is (resolves-to-question-url? memory (str "metabase://query/" query-id))))))))

;; run_warehouse_query (structured queries) is covered in `metabase.metabot.tools.megabot-query-test`.

(defn- data-row-count
  "Number of markdown table data rows in a warehouse tool `output` (lines between the `---` separator
  and the first blank line)."
  [output]
  (->> (str/split-lines output)
       (drop-while #(not (str/starts-with? % "---")))
       rest
       (take-while (complement str/blank?))
       count))

(deftest run-warehouse-sql-completeness-test
  (mt/test-drivers #{:h2}
    (testing "under the limit: the footer says the result is complete"
      (let [{:keys [output structured-output]}
            (megabot/run-warehouse-sql-tool {:database_id (mt/id) :sql "SELECT 1 AS n"})]
        (is (str/includes? output "complete result"))
        (is (false? (:truncated? structured-output)))
        (is (false? (:more-rows? structured-output)))))
    (testing "exactly at the limit: no limit-reached marker (n+1 probe, not count == limit)"
      (let [{:keys [output structured-output]}
            (megabot/run-warehouse-sql-tool {:database_id (mt/id) :sql "SELECT 1 AS n" :row_limit 1})]
        (is (not (str/includes? output "limit reached")))
        (is (str/includes? output "complete result"))
        (is (false? (:truncated? structured-output)))))
    (testing "over the limit: limit-reached marker, exactly row_limit rows, original query registered"
      (let [memory (atom {:state {}})
            raw    {:database (mt/id) :type :native :native {:query "SELECT * FROM ORDERS"}}
            {:keys [output structured-output]}
            (binding [shared/*memory-atom* memory]
              (megabot/run-warehouse-sql-tool {:database_id (mt/id) :sql "SELECT * FROM ORDERS" :row_limit 5}))
            query-id (:query-id structured-output)]
        (is (str/includes? output (#'megabot/limit-reached-note 5)))
        (is (= 5 (data-row-count output)))
        (is (= 5 (:row-count structured-output)))
        (is (= 5 (:rows-shown structured-output)))
        (is (true? (:more-rows? structured-output)))
        (is (true? (:truncated? structured-output)))
        (is (= raw (:query structured-output)))
        (is (= raw (get-in @memory [:state :queries query-id])))
        (is (not (contains? (get-in @memory [:state :queries query-id]) :constraints)))))))

(deftest format-rows-size-cap-test
  (testing "rows are cut whole, never mid-row, and the footer says how many were shown"
    (let [cell                (apply str (repeat 1000 "x"))
          rows                (repeat 50 [cell])
          {:keys [text rows-shown]} (#'megabot/format-rows ["s"] rows {:more? false :max-chars 5000})]
      (is (<= (count text) 5000))
      (is (< rows-shown 50))
      (is (pos? rows-shown))
      (is (str/includes? text (str "showing first " rows-shown " of 50")))
      (is (not (str/includes? text "complete result")))
      (testing "every data row is a full cell"
        (let [data-lines (->> (str/split-lines text) (drop 2) (take-while (complement str/blank?)))]
          (is (= rows-shown (count data-lines)))
          (is (every? #(= cell %) data-lines)))))))

(deftest run-warehouse-sql-wide-rows-test
  (mt/test-drivers #{:h2}
    (testing "big cells hit the output size cap, but the footer and Query ID survive"
      (let [{:keys [output structured-output]}
            (megabot/run-warehouse-sql-tool {:database_id (mt/id)
                                             :sql         "SELECT REPEAT('x', 2000) AS s FROM ORDERS"
                                             :row_limit   200})]
        (is (str/includes? output "output size cap"))
        (is (str/includes? output "limit reached"))
        (is (str/includes? output "Query ID:"))
        (is (true? (:truncated? structured-output)))
        (is (< (:rows-shown structured-output) (:row-count structured-output)))))))

(deftest run-tools-without-memory-test
  (testing "the run tools still work when no memory atom is bound (e.g. called outside the agent loop)"
    (mt/test-drivers #{:h2}
      (let [{:keys [structured-output]}
            (megabot/run-warehouse-sql-tool {:database_id (mt/id) :sql "SELECT 1 AS n"})]
        (is (not (str/blank? (:query-id structured-output))))))))

;;; show_result — no database needed: it only reads a query from memory and emits parts, and
;;; `->legacy-mbql` passes a non-MBQL-5 stub through unchanged (same setup as charts_test).

(def ^:private stub-query
  {:database 1 :type "query" :query {:source-table 1}})

(defn- show-result
  [args]
  (let [memory (atom {:state {:queries {"q-1" stub-query}}})
        result (binding [shared/*memory-atom* memory]
                 (megabot/show-result-tool (merge {:query_id "q-1" :title "Orders"} args)))]
    {:memory memory :result result}))

(deftest show-result-renders-table-by-default-test
  (let [{:keys [memory result]} (show-result {:description "All orders."})
        {:keys [output structured-output data-parts]} result
        chart-id (:chart-id structured-output)
        entity   (:data (first data-parts))]
    (testing "emits exactly one generated_entity card the frontend runs and renders"
      (is (= 1 (count data-parts)))
      (is (= "generated_entity" (:data-type (first data-parts))))
      (is (= "card" (:type entity)))
      (is (= chart-id (:id entity)))
      (is (= "table" (:display entity)))
      (is (= "Orders" (:title entity)))
      (is (= "All orders." (:description entity)))
      (is (= "q-1" (get-in entity [:query :id])))
      (is (= stub-query (get-in entity [:query :query]))))
    (testing "structured output carries what extract-charts needs, including the query"
      (is (string? chart-id))
      (is (= :chart (:result-type structured-output)))
      (is (= "q-1" (:query-id structured-output)))
      (is (= stub-query (:query structured-output)))
      (is (= :table (:chart-type structured-output))))
    (testing "tells the model how to link the rendered result"
      (is (str/includes? output (str "metabase://chart/" chart-id))))
    (testing "the chart is in memory immediately, in the state shape chart links resolve against"
      (let [chart (get-in @memory [:state :charts chart-id])]
        (is (= chart-id (:chart_id chart)))
        (is (= "q-1" (:query_id chart)))
        (is (= [stub-query] (:queries chart)))
        (is (= :table (get-in chart [:visualization_settings :chart_type]))))
      (is (resolves-to-question-url? memory (str "metabase://chart/" chart-id))))))

(deftest show-result-explicit-display-test
  (testing "an explicit display type flows through to the card and the chart state"
    (let [{:keys [memory result]} (show-result {:display "bar"})
          {:keys [structured-output data-parts]} result]
      (is (= "bar" (get-in data-parts [0 :data :display])))
      (is (= :bar (:chart-type structured-output)))
      (is (= :bar (get-in @memory [:state :charts (:chart-id structured-output)
                                   :visualization_settings :chart_type])))
      (testing "and no description key is emitted when none was given"
        (is (not (contains? (get-in data-parts [0 :data]) :description)))))))

(deftest show-result-unknown-query-test
  (testing "an unknown query id returns an error naming the available ids, with nothing to render"
    (let [{:keys [result]} (show-result {:query_id "nope"})
          {:keys [output structured-output data-parts]} result]
      (is (str/includes? output "nope"))
      (is (str/includes? output "q-1"))
      (is (nil? structured-output))
      (is (nil? data-parts)))))

(deftest show-result-remembers-title-test
  (testing "the rendered chart keeps its title and description, so save_result can default to them"
    (let [{:keys [memory result]} (show-result {:description "All orders."})
          chart-id (get-in result [:structured-output :chart-id])]
      (is (= {:title "Orders" :description "All orders."}
             (get-in @memory [:state :charts chart-id :chart_config]))))))

;;; save_result

(defn- render-then-save!
  "Run `SELECT 1 AS n`, render it with show_result (title \"One\", description \"One row.\"), then save it with
  save_result and `args`, passing the chart id show_result returned."
  [args]
  (binding [shared/*memory-atom* (atom {:state {}})]
    (let [query-id (-> (megabot/run-warehouse-sql-tool {:database_id (mt/id) :sql "SELECT 1 AS n"})
                       :structured-output :query-id)
          chart-id (-> (megabot/show-result-tool {:query_id query-id :title "One" :description "One row."})
                       :structured-output :chart-id)]
      (megabot/save-result-tool (assoc args :chart_id chart-id)))))

(defn- saved-card [result]
  (t2/select-one :model/Card :id (get-in result [:structured-output :card-id])))

(defn- step-title [result]
  (get-in result [:data-parts 0 :data :title]))

(defn- question-link [card]
  (str "[" (:name card) "](metabase://question/" (:id card) ")"))

(deftest save-result-defaults-test
  (testing "a rendered result saves by its chart id alone: the name, description, and place all default"
    (mt/test-drivers #{:h2}
      (mt/with-model-cleanup [:model/Card]
        (mt/with-current-user (mt/user->id :crowberto)
          (let [result   (render-then-save! {})
                card     (saved-card result)
                personal (collection/user->personal-collection (mt/user->id :crowberto))]
            (testing "the saved card runs the SQL that was rendered, with the rendered display"
              (is (str/includes? (pr-str (:dataset_query card)) "SELECT 1 AS n"))
              (is (= :table (:display card))))
            (testing "the name and description are the ones show_result was given"
              (is (= "One" (:name card)))
              (is (= "One row." (:description card))))
            (testing "with no destination, it lands in the user's personal collection"
              (is (= (:id personal) (:collection_id card))))
            (testing "the model gets the same change line as a call_api write"
              (is (= (str "Created question " (:id card) " \"One\". Link it as " (question-link card) ".")
                     (:output result))))
            (testing "the step says what was saved and where, each link pointing to what it names"
              (is (= "entity_saved" (get-in result [:data-parts 0 :data-type])))
              (is (= (str "Saved " (question-link card)
                          " to [" (:name personal) "](metabase://collection/" (:id personal) ")")
                     (step-title result))))))))))

(deftest save-result-explicit-name-test
  (testing "an explicit name and description replace the rendered ones"
    (mt/test-drivers #{:h2}
      (mt/with-model-cleanup [:model/Card]
        (mt/with-current-user (mt/user->id :crowberto)
          (let [result (render-then-save! {:name        "Renamed"
                                           :description "Other."
                                           :destination {:target_type "collection" :collection_id nil}})
                card   (saved-card result)]
            (is (= "Renamed" (:name card)))
            (is (= "Other." (:description card)))
            (testing "the root collection has no numeric id to link, so the step names it as plain text"
              (is (nil? (:collection_id card)))
              (is (= (str "Saved " (question-link card) " to "
                          (:name (collection/root-collection-with-ui-details nil)))
                     (step-title result))))))))))

(deftest save-result-to-dashboard-test
  (mt/test-drivers #{:h2}
    (mt/with-model-cleanup [:model/Card]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Collection coll {}
                       :model/Dashboard  dash {:name "Ops" :collection_id (:id coll)}]
          (let [result    (render-then-save! {:destination {:target_type "dashboard" :dashboard_id (:id dash)}})
                card      (saved-card result)
                dash-link (str "[Ops](metabase://dashboard/" (:id dash) ")")]
            (testing "places a dashboard question on the dashboard"
              (is (= (:id dash) (:dashboard_id card)))
              (is (t2/exists? :model/DashboardCard :dashboard_id (:id dash) :card_id (:id card))))
            (testing "the model gets a change line for the question and one for the dashboard"
              (is (= (str "Created question " (:id card) " \"One\". Link it as " (question-link card) ".\n"
                          "Updated dashboard " (:id dash) " \"Ops\". Link it as " dash-link ".")
                     (:output result))))
            (testing "the step links the question and the dashboard it went to"
              (is (= (str "Saved " (question-link card) " to " dash-link)
                     (step-title result))))))))))

(deftest save-result-unknown-chart-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [before (t2/count :model/Card)
          result (binding [shared/*memory-atom* (atom {:state {:queries {"q-1" stub-query}}})]
                   (megabot/save-result-tool {:chart_id "q-1"}))]
      (testing "the error points at show_result, a megabot tool, and at no other profile's tools"
        (is (str/includes? (:output result) "show_result"))
        (is (not (str/includes? (:output result) "construct_notebook_query"))))
      (testing "the step says the save failed rather than looking like a success"
        (is (= "tool_title" (get-in result [:data-parts 0 :data-type])))
        (is (= "Couldn't save the result" (step-title result))))
      (testing "nothing is created"
        (is (= before (t2/count :model/Card)))))))

(deftest save-result-untitled-chart-test
  (testing "a chart with no title (not rendered by show_result) needs an explicit name"
    (let [chart  {:chart_id "c-1" :queries [stub-query] :visualization_settings {:chart_type :table}}
          result (binding [shared/*memory-atom* (atom {:state {:charts {"c-1" chart}}})]
                   (megabot/save-result-tool {:chart_id "c-1"}))]
      (is (= "Pass a `name`: this result has no title." (:output result))))))

(deftest describe-app-db-lists-tables-test
  (mt/initialize-if-needed! :db)
  (testing "with no tables, describe_app_db lists every table and view, with curated purposes"
    (let [{:keys [output structured-output]} (megabot/describe-app-db-tool {})]
      (is (< 100 (:table-count structured-output)))
      (is (str/includes? output "- report_card — Saved questions"))
      (is (str/includes? output "- v_content (view)"))
      (is (not (str/includes? output "qrtz_")))
      (is (str/includes? output "- query_table — UNMAINTAINED: ")))))

(deftest describe-app-db-describes-tables-test
  (mt/initialize-if-needed! :db)
  (testing "with tables, describe_app_db returns columns, types, FKs, and curated notes"
    (let [{:keys [output structured-output]} (megabot/describe-app-db-tool {:tables ["METABASE_TABLE" "report_card"]})]
      (is (= ["metabase_table" "report_card"] (:tables structured-output)))
      (is (str/includes? output "## metabase_table — One row per synced warehouse table"))
      (is (re-find #"- db_id \S+ NOT NULL → metabase_database\.id" output))
      (is (str/includes? output "## report_card"))
      (is (str/includes? output "question | model | metric"))))
  (testing "an unknown table name gets suggestions instead of an error"
    (let [{:keys [output structured-output]} (megabot/describe-app-db-tool {:tables ["report_cards"]})]
      (is (= [] (:tables structured-output)))
      (is (str/includes? output "No app-db table or view has this name"))
      (is (str/includes? output "report_card")))))

(defn- show-page-link
  [args]
  (binding [shared/*memory-atom* (atom {:state {:queries {"q-1" stub-query}}})]
    (megabot/show-page-link-tool args)))

(defn- page-link
  "The data of the single `page_link` part a result shows the user."
  [{:keys [data-parts]}]
  (is (= 1 (count data-parts)))
  (let [{:keys [data-type data]} (first data-parts)]
    (is (= "page_link" data-type))
    data))

(deftest show-page-link-saved-item-test
  (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Sales"}]
    (testing "a saved item's card carries its url, its own name, and its kind"
      (let [url    (str "/dashboard/" dash-id)
            result (show-page-link {:target (str "metabase://dashboard/" dash-id) :title "the sales dash"})]
        (is (= {:url url :title "Sales" :model "dashboard"} (page-link result)))
        (is (= {:result-type :page-link :url url} (:structured-output result)))
        (testing "and the model hears that it showed a link, not that it moved the user"
          (is (str/includes? (:output result) "Showed the user a link to \"Sales\""))
          (is (str/includes? (:output result) "still in this chat")))))
    (testing "a link to an id with no saved item keeps the given title"
      (is (= {:url "/collection/999999" :title "Ops" :model "collection"}
             (page-link (show-page-link {:target "metabase://collection/999999" :title "Ops"})))))))

(deftest show-page-link-query-and-table-test
  (testing "a query from this conversation opens as an ad-hoc question"
    (let [{:keys [url title model]} (page-link (show-page-link {:target "metabase://query/q-1"
                                                                :title  "Orders by month"}))]
      (is (str/starts-with? url "/question#"))
      (is (= "Orders by month" title))
      (is (= "question" model))))
  (testing "a table opens its rows"
    (is (= "table" (:model (page-link (show-page-link {:target (str "metabase://table/" (mt/id :orders))
                                                       :title  "Orders"})))))))

(deftest show-page-link-app-path-test
  (testing "an in-app path passes through as-is, with no kind of item"
    (is (= {:url "/admin/settings/email" :title "Email settings"}
           (page-link (show-page-link {:target " /admin/settings/email " :title " Email settings "}))))))

(deftest show-page-link-needs-a-title-test
  (testing "a page that isn't a saved item is never labeled with its raw path"
    (let [{:keys [output data-parts]} (show-page-link {:target "/admin/people" :title " "})]
      (is (nil? data-parts))
      (is (str/includes? output "Pass a `title`"))
      (is (str/includes? output "To recover:")))))

(deftest show-page-link-unresolvable-test
  (doseq [target ["metabase://query/nope" "metabase://bogus/1" "https://example.com" "//example.com" "admin"]]
    (testing target
      (let [{:keys [output data-parts]} (show-page-link {:target target :title "Somewhere"})]
        (is (nil? data-parts))
        (is (str/includes? output "Can't link to"))
        (is (str/includes? output "To recover:"))))))
