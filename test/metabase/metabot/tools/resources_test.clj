(ns metabase.metabot.tools.resources-test
  "Tests for read_resource tool."
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.metabot.test-util :as test-util]
   [metabase.metabot.tools :as metabot.tools]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.resources :as read-resource]
   [metabase.metabot.tools.shared :as tools.shared]
   [metabase.metabot.tools.shared.content-store :as shared.content-store]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.models.interface :as mi]
   [metabase.models.serialization.resolve.mp :as resolve.mp]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.transforms.core :as transforms.core]
   [toucan2.core :as t2]))

(def ^:private uri-arg
  "The tool's item schema, read off the tool so the assertions below compare against what it
  actually publishes."
  @#'read-resource/uri-arg)

(defn- read-uris
  "Read some URIs the way a consumer does: `tools/call` picks the batched path because the tool
  implements `BatchedTool`.

  Returns `{:output … :resources …}`, so the assertions below stay about what a reader gets rather
  than about how the tool is invoked. `:tool-names` holds a profile that has `search`, so the
  recovery steps that name it survive.

  `:all-items-failed :compose` is the Agent API's stance, and the right one for the tests below:
  they are about what each URI produced, and most read a single URI, which would otherwise be
  `all-items-failed` the moment it misses. The agent loop's opposite default has its own test."
  [{:keys [uris]}]
  (tools/call read-resource/read-resource-tool {:uris (vec uris)}
              {:tool-names       #{"read_resource" "search"}
               :all-items-failed :compose}))

(deftest ^:parallel scalar-uris-arg-test
  (testing "a scalar `uris` is rejected with guidance on how to repair the call"
    (is (= (str "Invalid tool arguments: `uris` must be an array of 1 to 5 URI strings; "
                "received a string.")
           (test-util/tool-boundary-error "read_resource" #'metabot.tools/read-resource-tool
                                          {:uris "metabase://table/1"})))))

(deftest parse-uri-test
  (testing "parses single-segment URIs (top-level lists)"
    (is (= {:segments ["databases"] :query-params nil}
           (#'read-resource/parse-uri "metabase://databases")))
    (is (= {:segments ["collections"] :query-params nil}
           (#'read-resource/parse-uri "metabase://collections"))))
  (testing "parses entity URIs into [type id] segments"
    (is (= {:segments ["table" "123"] :query-params nil}
           (#'read-resource/parse-uri "metabase://table/123")))
    (is (= {:segments ["model" "456"] :query-params nil}
           (#'read-resource/parse-uri "metabase://model/456")))
    (is (= {:segments ["question" "456"] :query-params nil}
           (#'read-resource/parse-uri "metabase://question/456"))))
  (testing "parses entity sub-resources"
    (is (= {:segments ["table" "123" "fields"] :query-params nil}
           (#'read-resource/parse-uri "metabase://table/123/fields")))
    (is (= {:segments ["table" "123" "fields" "456"] :query-params nil}
           (#'read-resource/parse-uri "metabase://table/123/fields/456")))
    (is (= {:segments ["metric" "789" "dimensions"] :query-params nil}
           (#'read-resource/parse-uri "metabase://metric/789/dimensions"))))
  (testing "parses field IDs that contain slashes (e.g. c75/17)"
    (is (= {:segments ["table" "123" "fields" "c75" "17"] :query-params nil}
           (#'read-resource/parse-uri "metabase://table/123/fields/c75/17"))))
  (testing "parses deep paths"
    (is (= {:segments ["database" "1" "schemas" "PUBLIC" "tables"] :query-params nil}
           (#'read-resource/parse-uri "metabase://database/1/schemas/PUBLIC/tables"))))
  (testing "parses query strings into :query-params"
    (is (= {:tree "true"}
           (:query-params (#'read-resource/parse-uri "metabase://collections?tree=true"))))
    (is (= {:tree "true" :foo "bar"}
           (:query-params (#'read-resource/parse-uri "metabase://collections?tree=true&foo=bar")))))
  (testing "parses user URIs"
    (is (= {:segments ["user" "recent-items"] :query-params nil}
           (#'read-resource/parse-uri "metabase://user/recent-items"))))
  (testing "rejects invalid scheme"
    (is (thrown? Exception
                 (#'read-resource/parse-uri "https://example.com"))))
  (testing "rejects empty path"
    (is (thrown? Exception
                 (#'read-resource/parse-uri "metabase://"))))
  (testing "URL-decodes path segments — schema names containing '/' round-trip"
    ;; An encoded URI like /schemas/weird%2Fname/tables splits into 5 segments,
    ;; with the schema segment decoded back to its literal form (containing '/').
    (let [parsed (#'read-resource/parse-uri "metabase://database/1/schemas/weird%2Fname/tables")]
      (is (= ["database" "1" "schemas" "weird/name" "tables"] (:segments parsed))))
    (testing "round-trips through metabase-uri"
      (let [uri    (llm-shape/metabase-uri :database 1 "schemas" "weird/name" "tables")
            parsed (#'read-resource/parse-uri uri)]
        (is (= "metabase://database/1/schemas/weird%2Fname/tables" uri))
        (is (= ["database" "1" "schemas" "weird/name" "tables"] (:segments parsed)))))))

(deftest ^:parallel the-item-limit-is-a-schema-fact-test
  (testing "the 5-URI cap is in the batched `:args`, so the runtime rejects a sixth before the tool runs"
    (is (= (str "Invalid tool arguments: `uris` must be an array of 1 to 5 URI strings; "
                "received an array.")
           (test-util/tool-boundary-error "read_resource" #'metabot.tools/read-resource-tool
                                          {:uris (vec (repeat 10 "metabase://table/123"))})))))

(deftest ^:parallel single-and-batched-declarations-test
  (let [single  (tools/declaration read-resource/read-resource-tool)
        batched (tools/batched-declaration read-resource/read-resource-tool single)]
    (testing "the single form takes one URI and is a complete tool on its own"
      (is (= [:map {:closed true} [:uri uri-arg]] (:args single)))
      (is (= "read_resource" (:name single)))
      (is (some? (:scope single))))
    (testing "the batched form publishes a sequence of plain strings, not of maps —
             the wire shape the model has always been offered"
      (is (= [:map {:closed true}
              [:uris [:sequential {:min 1 :max 5
                                   :error/message "must be an array of 1 to 5 URI strings"}
                      uri-arg]]]
             (:args batched))))
    (testing "both forms share the item schema, so they cannot drift"
      (is (= uri-arg (get-in single [:args 2 1])))
      (is (= uri-arg (get-in batched [:args 2 1 2]))))
    (testing "only the description and the args differ"
      (is (= (dissoc single :description :args) (dissoc batched :description :args)))
      (is (str/starts-with? (:description batched) (:description single)))
      (is (str/includes? (:description batched) "Up to 5 URIs")))))

(deftest ^:parallel an-undeclared-failure-is-not-a-partial-result-test
  (testing "a bug inside one read fails the whole call rather than being reported as that item's
           text — five results and one Java message is a worse thing to hand a model than nothing"
    (mt/with-dynamic-fn-redefs [read-resource/dispatch (fn [_] (throw (ex-info "boom" {})))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom"
                            (read-uris {:uris ["metabase://databases"]}))))))

;; ===== The guidance an agent gets must match what the dispatch actually serves =====

(def ^:private dispatch-leading-segments
  "The leading path segments `dispatch` routes, read out of its own source.

  Read rather than listed: a list would drift the moment a URI shape is added, which is the drift
  this test exists to catch. The match table's patterns start with either a string literal
  (`[\"table\" id …]`) or a guard over a set of them (`[(t :guard #{\"model\" \"question\"}) …]`)."
  (delay
    (let [source  (slurp (io/resource "metabase/metabot/tools/resources.clj"))
          table   (subs source (str/index-of source "(match/match-one segments"))
          table   (subs table 0 (str/index-of table "(unsupported-uri!"))
          literal (re-seq #"(?m)^\s+\[\"([a-z-]+)\"" table)
          guarded (re-seq #"\(t :guard #\{([^}]+)\}\)" table)]
      (into (set (map second literal))
            (comp (mapcat (fn [[_ names]] (re-seq #"\"([a-z-]+)\"" names)))
                  (map second))
            guarded))))

(deftest ^:parallel uri-templates-cover-dispatch-test
  (testing "every resource type the dispatch serves has URI templates to offer an agent that
           guessed wrong. Without this, a new URI shape ships with an `unsupported-uri` error that
           does not mention it, and the agent has no way to discover it."
    (is (seq @dispatch-leading-segments) "the source scan found nothing — has the match table moved?")
    (is (contains? @dispatch-leading-segments "table") "the source scan is not reading the table")
    (is (= #{} (set/difference @dispatch-leading-segments
                               (set (keys @#'read-resource/uri-templates))))))
  (testing "and no templates are offered for a shape nothing serves"
    (is (= #{} (set/difference (set (keys @#'read-resource/uri-templates))
                               @dispatch-leading-segments)))))

(deftest ^:parallel unsupported-uri-lists-the-shapes-for-its-kind-test
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "a known kind with an unknown aspect gets that kind's shapes, not the whole catalog"
      (let [{:keys [output]} (read-uris {:uris ["metabase://table/1/nonsense"]})]
        (is (str/includes? output "URIs under `table` are:"))
        (is (str/includes? output "metabase://table/{id}/fields/{field_id}"))))
    (testing "an unknown kind has no shapes to list, so it gets the kinds instead"
      (let [{:keys [output]} (read-uris {:uris ["metabase://nonsense/1"]})]
        (is (not (str/includes? output "URIs under")))
        (is (str/includes? output "The resource types served here are:"))))))

(deftest ^:parallel a-read-that-delivered-nothing-is-a-failed-call-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [ctx {:tool-names #{"read_resource" "search"}}]
      (testing "the agent loop's default: no URI could be read, so the call failed. The text is the
               same per-URI text a partially successful call shows; what changes is that the agent
               loop, the provider adapters and telemetry are told it failed instead of counting it
               a success."
        (let [{:keys [class code text]}
              (test-util/tool-failure read-resource/read-resource-tool
                                      {:uris ["metabase://bogus/1" "metabase://table/99999999"]}
                                      #{"read_resource" "search"})]
          (is (= :recoverable class))
          (is (= :metabase.metabot.tools.core/all-items-failed code))
          (testing "every URI is still named, so the agent can retry the ones worth retrying"
            (is (str/includes? text "metabase://bogus/1"))
            (is (str/includes? text "metabase://table/99999999")))))
      (testing "one URI surviving is a successful call with the failure in position"
        (is (nil? (:error (tools/call read-resource/read-resource-tool
                                      {:uris ["metabase://databases" "metabase://bogus/1"]}
                                      ctx)))))
      (testing "and a single URI that missed is a failed call too — there is nothing else in it"
        (is (= :metabase.metabot.tools.core/all-items-failed
               (:code (test-util/tool-failure read-resource/read-resource-tool
                                              {:uris ["metabase://table/99999999"]}
                                              #{"read_resource" "search"}))))))))

(deftest ^:parallel a-recovery-step-naming-a-missing-tool-is-dropped-test
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "the `search` step survives in a profile that has search"
      (is (str/includes? (:text (test-util/tool-failure read-resource/read-resource-tool
                                                        {:uris ["metabase://nonsense/1"]}
                                                        #{"read_resource" "search"}))
                         "`search` result")))
    (testing "and disappears in one that does not, rather than sending the agent at a tool it
             cannot call"
      (is (not (str/includes? (:text (test-util/tool-failure read-resource/read-resource-tool
                                                             {:uris ["metabase://nonsense/1"]}
                                                             #{"read_resource"}))
                              "`search`"))))))

;; ===== Dispatch routing — every URI pattern routes to the expected handler =====

(def ^:private dispatch-cases
  "Each row: [uri expected-handler-tag expected-handler-args]. Adding a new URI pattern
   to the dispatch should mean adding one row here. Args are positional and string-typed
   the way the dispatch passes them to the handler."
  [;; ----- Top-level navigation -----
   ["metabase://databases"                                 :databases-list             [nil]]
   ["metabase://databases?page=2"                          :databases-list             [{:page "2"}]]
   ["metabase://collections"                               :collections-list           [nil]]
   ["metabase://collections?tree=true"                     :collections-list           [{:tree "true"}]]
   ["metabase://collections?tree=true&foo=bar"             :collections-list           [{:tree "true" :foo "bar"}]]
   ["metabase://collections?page=2"                        :collections-list           [{:page "2"}]]
   ["metabase://user/recent-items"                         :user-recents               [nil]]
   ["metabase://user/recent-items?page=2"                  :user-recents               [{:page "2"}]]
   ;; ----- Database drill-down -----
   ["metabase://database/1"                                :database                   ["1"]]
   ["metabase://database/1/tables"                         :database-tables            ["1" nil]]
   ["metabase://database/1/tables?page=2"                  :database-tables            ["1" {:page "2"}]]
   ["metabase://database/1/models"                         :database-models            ["1" nil]]
   ["metabase://database/1/schemas"                        :database-schemas           ["1" nil]]
   ["metabase://database/1/schemas/PUBLIC/tables"          :database-schema-tables     ["1" "PUBLIC" nil]]
   ["metabase://database/1/schemas/lower_case/tables"      :database-schema-tables     ["1" "lower_case" nil]]
   ;; ----- Collection drill-down -----
   ["metabase://collection/2"                              :collection                 ["2"]]
   ["metabase://collection/2/items"                        :collection-items           ["2" nil]]
   ["metabase://collection/2/items?page=3"                 :collection-items           ["2" {:page "3"}]]
   ["metabase://collection/2/subcollections"               :collection-subcollections  ["2" nil]]
   ;; ----- Table -----
   ["metabase://table/3"                                   :table                      ["3"]]
   ["metabase://table/3/fields"                            :table-fields               ["3"]]
   ["metabase://table/3/fields/42"                         :table-field                ["3" "42"]]
   ["metabase://table/3/fields/c75/17"                     :table-field                ["3" "c75/17"]]
   ["metabase://table/3/derived"                           :table-derived              ["3" nil]]
   ;; ----- Model (a card type) -----
   ["metabase://model/4"                                   :card                       ["model" "4"]]
   ["metabase://model/4/fields"                            :card-fields                ["model" "4"]]
   ["metabase://model/4/fields/99"                         :card-field                 ["model" "4" "99"]]
   ["metabase://model/4/fields/c75/17"                     :card-field                 ["model" "4" "c75/17"]]
   ["metabase://model/4/sources"                           :card-sources               ["4" nil]]
   ["metabase://model/4/sources?page=2"                    :card-sources               ["4" {:page "2"}]]
   ;; ----- Question (a card type) -----
   ["metabase://question/5"                                :card                       ["question" "5"]]
   ["metabase://question/5/fields"                         :card-fields                ["question" "5"]]
   ["metabase://question/5/fields/99"                      :card-field                 ["question" "5" "99"]]
   ["metabase://question/5/sources"                        :card-sources               ["5" nil]]
   ;; ----- Metric -----
   ["metabase://metric/6"                                  :metric                     ["6"]]
   ["metabase://metric/6/dimensions"                       :metric-dimensions          ["6"]]
   ["metabase://metric/6/dimensions/dim-1"                 :metric-dimension           ["6" "dim-1"]]
   ;; ----- Measure / Segment -----
   ["metabase://measure/9"                                 :measure                    ["9"]]
   ["metabase://segment/10"                                :segment                    ["10"]]
   ;; ----- Transform -----
   ["metabase://transform/7"                               :transform                  ["7"]]
   ["metabase://transform/7/sources"                       :transform-sources          ["7" nil]]
   ["metabase://transform/7/sources?page=2"                :transform-sources          ["7" {:page "2"}]]
   ["metabase://transform/7/target"                        :transform-target           ["7" nil]]
   ;; ----- Dashboard -----
   ["metabase://dashboard/8"                               :dashboard                  ["8"]]
   ["metabase://dashboard/8/items"                         :dashboard-items            ["8" nil]]
   ["metabase://dashboard/8/items?page=2"                  :dashboard-items            ["8" {:page "2"}]]
   ;; ----- Conversation state -----
   ["metabase://chart/7f018c82-4381-4264"                  :conversation-chart         ["7f018c82-4381-4264"]]
   ["metabase://query/NXRVLzEMoMpfNJpqPshQR"               :conversation-query         ["NXRVLzEMoMpfNJpqPshQR"]]])

(deftest dispatch-routing-test
  (testing "every supported URI pattern routes to the expected handler with the expected args"
    (let [calls (atom nil)
          spy   (fn [tag] (fn [& args] (reset! calls [tag (vec args)]) :spied))]
      (mt/with-dynamic-fn-redefs [read-resource/fetch-databases-list             (spy :databases-list)
                                  read-resource/fetch-collections-list           (spy :collections-list)
                                  read-resource/fetch-user-recents               (spy :user-recents)
                                  read-resource/fetch-database                   (spy :database)
                                  read-resource/fetch-database-tables            (spy :database-tables)
                                  read-resource/fetch-database-models            (spy :database-models)
                                  read-resource/fetch-database-schemas           (spy :database-schemas)
                                  read-resource/fetch-database-schema-tables     (spy :database-schema-tables)
                                  read-resource/fetch-collection                 (spy :collection)
                                  read-resource/fetch-collection-items           (spy :collection-items)
                                  read-resource/fetch-collection-subcollections  (spy :collection-subcollections)
                                  read-resource/fetch-table                      (spy :table)
                                  read-resource/fetch-table-fields               (spy :table-fields)
                                  read-resource/fetch-table-field                (spy :table-field)
                                  read-resource/fetch-table-derived              (spy :table-derived)
                                  read-resource/fetch-card                       (spy :card)
                                  read-resource/fetch-card-fields                (spy :card-fields)
                                  read-resource/fetch-card-field                 (spy :card-field)
                                  read-resource/fetch-card-sources               (spy :card-sources)
                                  read-resource/fetch-metric                     (spy :metric)
                                  read-resource/fetch-metric-dimensions          (spy :metric-dimensions)
                                  read-resource/fetch-metric-dimension           (spy :metric-dimension)
                                  read-resource/fetch-measure                    (spy :measure)
                                  read-resource/fetch-segment                    (spy :segment)
                                  read-resource/fetch-transform                  (spy :transform)
                                  read-resource/fetch-transform-sources          (spy :transform-sources)
                                  read-resource/fetch-transform-target           (spy :transform-target)
                                  read-resource/fetch-dashboard                  (spy :dashboard)
                                  read-resource/fetch-dashboard-items            (spy :dashboard-items)
                                  read-resource/fetch-conversation-chart         (spy :conversation-chart)
                                  read-resource/fetch-conversation-query         (spy :conversation-query)]
        (doseq [[uri expected-handler expected-args] dispatch-cases]
          (testing uri
            (reset! calls nil)
            (#'read-resource/dispatch uri)
            (is (= [expected-handler expected-args] @calls))))))))

(deftest dispatch-rejects-unknown-uri-test
  (testing "unknown top-level resource type throws"
    (is (thrown-with-msg? Exception #"No resource is served at"
                          (#'read-resource/dispatch "metabase://nonsense/1"))))
  (testing "known type with unknown sub-resource throws"
    (is (thrown-with-msg? Exception #"No resource is served at"
                          (#'read-resource/dispatch "metabase://table/1/nonsense"))))
  (testing "deep path that doesn't match any pattern throws"
    (is (thrown-with-msg? Exception #"No resource is served at"
                          (#'read-resource/dispatch "metabase://database/1/schemas/PUBLIC/cards"))))
  (testing "extra-deep collection path throws"
    (is (thrown-with-msg? Exception #"No resource is served at"
                          (#'read-resource/dispatch "metabase://collection/1/items/extra"))))
  (testing "user URI with unknown sub throws"
    (is (thrown-with-msg? Exception #"No resource is served at"
                          (#'read-resource/dispatch "metabase://user/bookmarks"))))
  (testing "non-metabase scheme throws via parse-uri"
    (is (thrown? Exception
                 (#'read-resource/dispatch "https://example.com")))))

(deftest dispatch-rejects-non-numeric-id-test
  (testing "a non-numeric id segment throws a directive error stating the numeric-id contract"
    (is (thrown-with-msg? Exception #"URIs use the numeric entity id"
                          (#'read-resource/dispatch "metabase://model/VZbHZIeqQ2HhZv5r0pO6a")))
    (is (thrown-with-msg? Exception #"URIs use the numeric entity id"
                          (#'read-resource/dispatch "metabase://model/VZbHZIeqQ2HhZv5r0pO6a/fields")))
    (is (thrown-with-msg? Exception #"URIs use the numeric entity id"
                          (#'read-resource/dispatch "metabase://question/VZbHZIeqQ2HhZv5r0pO6a")))
    (is (thrown-with-msg? Exception #"URIs use the numeric entity id"
                          (#'read-resource/dispatch "metabase://table/orders")))
    (is (thrown-with-msg? Exception #"URIs use the numeric entity id"
                          (#'read-resource/dispatch "metabase://collection/root"))))
  (testing "the error carries agent-error metadata"
    (let [e (try
              (#'read-resource/dispatch "metabase://model/VZbHZIeqQ2HhZv5r0pO6a")
              (catch Exception e e))]
      (is (= 400 (:status-code (ex-data e))))
      (is (true? (:agent-error? (ex-data e))))))
  (testing "the directive error text reaches read_resource output"
    (let [{:keys [output]} (read-uris {:uris ["metabase://model/VZbHZIeqQ2HhZv5r0pO6a/fields"]})]
      (is (str/includes? output "URIs use the numeric entity id"))))
  (testing "non-id segments are unaffected — schema names and field ids may be non-numeric"
    (is (= ["database" "1" "schemas" "PUBLIC" "tables"]
           (:segments (#'read-resource/parse-uri "metabase://database/1/schemas/PUBLIC/tables"))))
    (is (nil? (#'read-resource/check-numeric-id-segment!
               "metabase://table/3/fields/c75/17" ["table" "3" "fields" "c75" "17"])))))

(comment
  (mt/with-current-user (mt/user->id :crowberto)
    (read-uris
     {:uris [(str "metabase://table/" 1)]})))

(deftest read-table-resource-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {table-id :id} {:db_id db-id :name "Test Table"}]
        (testing "fetches basic table info"
          (is (=? {:resources [{:content {:structured-output map?}}]}
                  (read-uris
                   {:uris [(str "metabase://table/" table-id)]}))))
        (testing "fetches table with fields"
          (is (=? {:resources [{:content {:structured-output map?}}]}
                  (read-uris
                   {:uris [(str "metabase://table/" table-id "/fields")]}))))
        (testing "handles multiple URIs"
          (is (=? {:resources [{:content {:structured-output map?}}
                               {:content {:structured-output map?}}]}
                  (read-uris
                   {:uris [(str "metabase://table/" table-id)
                           (str "metabase://table/" table-id "/fields")]}))))
        (testing "returns errors for invalid URIs"
          (is (=? {:resources [{:error string?}]}
                  (read-uris
                   {:uris ["metabase://table/99999"]}))))))))

(deftest read-dashboard-resource-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard {dashboard-id :id dashboard-name :name}
                   {:name "Sales Overview"}]
      (testing "fetches dashboard info"
        (let [result (read-uris {:uris [(str "metabase://dashboard/" dashboard-id)]})]
          (is (=? {:resources [{:content {:structured-output map?}}]}
                  result))
          (is (str/includes? (:output result) dashboard-name))))
      (testing "rejects sub-resources"
        (is (=? {:resources [{:error string?}]}
                (read-uris {:uris [(str "metabase://dashboard/" dashboard-id "/cards")]}))))
      (testing "returns error for unknown dashboard"
        (is (=? {:resources [{:error string?}]}
                (read-uris {:uris ["metabase://dashboard/99999"]})))))))

(deftest read-document-resource-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card {card-id :id} {:name "Embedded chart"}
                   :model/Document {document-id :id}
                   {:name     "Q3 report"
                    :document {:type "doc"
                               :content [{:type "heading"
                                          :content [{:type "text" :text "Revenue"}]}
                                         {:type "resizeNode"
                                          :content [{:type "cardEmbed" :attrs {:id card-id}}]}
                                         {:type "paragraph"
                                          :content [{:type "text" :text "Detailed analysis"}]}]}}]
      (testing "fetches an indexed outline of the document's top-level blocks"
        (let [{:keys [output] :as result} (read-uris
                                           {:uris [(str "metabase://document/" document-id)]})]
          (is (=? {:resources [{:content {:structured-output map?}}]}
                  result))
          (is (str/includes? output "Q3 report"))
          (is (str/includes? output "[0] heading: Revenue"))
          (is (str/includes? output (str "[1] resizeNode (embeds card " card-id ")")))
          (is (str/includes? output "[2] paragraph: Detailed analysis"))))
      (testing "returns error for unknown document"
        (is (=? {:resources [{:error string?}]}
                (read-uris {:uris ["metabase://document/99999"]})))))))

(deftest read-conversation-chart-resource-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [query {:database (mt/id)
                 :type     "query"
                 :query    {:source-table (mt/id :orders)
                            :aggregation  [["count"]]}}]
      (binding [tools.shared/*memory-atom*
                (atom {:state {:queries {"q-1" query}
                               :charts  {"chart-1" {:chart_id "chart-1"
                                                    :query_id "q-1"
                                                    :queries  [query]
                                                    :visualization_settings {:chart_type "line"}}
                                         "chart-2" {:chart_id "chart-2"
                                                    :queries  [nil]
                                                    :visualization_settings {:chart_type "bar"}}}}})]
        (testing "resolves a conversation chart to its chart type and exported query"
          (let [result (read-uris {:uris ["metabase://chart/chart-1"]})]
            (is (=? {:resources [{:content {:structured-output map?}}]}
                    result))
            (is (str/includes? (:output result) "conversation-chart"))
            (is (str/includes? (:output result) "Chart type: line"))
            (is (str/includes? (:output result) "ORDERS"))))
        (testing "a chart with no query says so instead of claiming a permission denial"
          (let [result (read-uris {:uris ["metabase://chart/chart-2"]})]
            (is (str/includes? (:output result) "Chart type: bar"))
            (is (str/includes? (:output result) "No query is attached to this chart."))
            (is (not (str/includes? (:output result) "cannot read")))))
        (testing "falls back to the queries state when the id is a query id"
          (let [result (read-uris {:uris ["metabase://chart/q-1"]})]
            (is (str/includes? (:output result) "conversation-query"))))
        (testing "resolves a conversation query"
          (let [result (read-uris {:uris ["metabase://query/q-1"]})]
            (is (str/includes? (:output result) "conversation-query"))
            (is (str/includes? (:output result) "ORDERS"))))
        (testing "an id in neither charts nor queries state is named, and so are the ids that
                 do exist — the agent minted them itself, so echoing them back is its own text"
          (is (=? {:resources [{:error #"(?s)No chart or query with id \"nope\" exists in this conversation\. The ids that do: .*"}]}
                  (read-uris {:uris ["metabase://chart/nope"]})))
          (is (str/includes? (:output (read-uris {:uris ["metabase://chart/nope"]})) "chart-1")))))))

(defn- refusing-store
  "A ContentStore that records `tag` and refuses, the way the real stores do for a row the
  current user cannot read. Swapped in for both so a test can tell which one a caller picked."
  [tag recorded]
  (let [refuse (fn [] (swap! recorded conj tag) (throw (ex-info "Forbidden" {:status-code 403})))]
    (reify resolve.mp/ContentStore
      (card-by-entity-id    [_ _] (refuse))
      (measure-by-entity-id [_ _] (refuse))
      (segment-by-entity-id [_ _] (refuse))
      (card-by-id           [_ _] (refuse))
      (measure-by-id        [_ _] (refuse))
      (segment-by-id        [_ _] (refuse)))))

(deftest read-conversation-chart-provenance-picks-audit-test
  (let [mp         (mt/metadata-provider)
        definition (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                       (lib/filter (lib/> (lib.metadata/field mp (mt/id :venues :price)) 1)))]
    (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :venues)
                                                    :definition definition}]
      (let [query (fn [] {:database (mt/id)
                          :type     "query"
                          :query    {:source-table (mt/id :venues)
                                     :filter       [:segment segment-id]}})
            chart (fn [chart-id query-id] {:chart_id chart-id
                                           :query_id query-id
                                           :queries  [(query)]
                                           :visualization_settings {:chart_type "line"}})
            ;; The gate never looks at segments, so the query clears it and the segment ref is
            ;; resolved by whichever store the caller handed the export - the choice under test.
            ;; A source-card query would be refused by the gate first, whichever store was passed.
            store-used (fn [uri]
                         (let [used (atom [])]
                           (with-redefs [shared.content-store/audited-store (refusing-store :audited used)
                                         shared.content-store/default-store (refusing-store :default used)]
                             (let [result (read-uris {:uris [uri]})]
                               (is (str/includes? (:output result)
                                                  "references content the user cannot read"))
                               (distinct @used)))))]
        (binding [tools.shared/*memory-atom*
                  (atom {:state {:client-ids #{"seeded-chart" "seeded-q"}
                                 :queries    {"seeded-q" (query)}
                                 :charts     {"seeded-chart"  (chart "seeded-chart" "seeded-chart")
                                              "tool-chart"    (chart "tool-chart" "tool-q")
                                              "created-chart" (chart "created-chart" "seeded-q")}}})]
          (mt/with-test-user :rasta
            (testing "a client-seeded chart or query audits the refusal"
              (doseq [uri ["metabase://chart/seeded-chart" "metabase://query/seeded-q"]]
                (is (= [:audited] (store-used uri)) uri)))
            (testing "so does a chart create_chart minted for a client-supplied query, whose own id was never seeded"
              (is (= [:audited] (store-used "metabase://chart/created-chart"))))
            (testing "a tool-written chart refuses without an audit trail"
              (is (= [:default] (store-used "metabase://chart/tool-chart"))))))))))

(deftest read-conversation-query-deleted-database-still-renders-test
  (testing "a state query whose database no longer exists renders its fallback instead of claiming a permission problem"
    (binding [tools.shared/*memory-atom*
              (atom {:state {:queries {"q-gone" {:database 999999999
                                                 :type     "query"
                                                 :query    {:source-table 1}}}}})]
      (mt/with-test-user :rasta
        (let [result (read-uris {:uris ["metabase://query/q-gone"]})]
          (is (not (str/includes? (:output result) "cannot read")))
          (is (str/includes? (:output result) "source-table")))))))

(defn- conversation-query-state
  [query]
  (atom {:state {:queries {"q-1" query}
                 :charts  {"chart-1" {:chart_id "chart-1"
                                      :query_id "q-1"
                                      :visualization_settings {:chart_type "line"}}}}}))

(deftest read-conversation-query-resource-permission-test
  (testing "a stored query the user may not run has its body withheld"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-current-user (mt/user->id :rasta)
        (binding [tools.shared/*memory-atom*
                  (conversation-query-state {:database (mt/id)
                                             :type     "query"
                                             :query    {:source-table (mt/id :orders)}})]
          (doseq [uri ["metabase://query/q-1" "metabase://chart/chart-1"]]
            (let [result (read-uris {:uris [uri]})]
              (is (str/includes? (:output result) "references content the user cannot read") uri)
              (is (not (str/includes? (:output result) "ORDERS")) uri))))))))

(deftest read-conversation-unpermissionable-native-query-resource-test
  (testing "native SQL whose permissions cannot be calculated has its body withheld, whether a tool
           stored the query or the client sent it"
    (let [query (test-util/unpermissionable-native-query (mt/id))]
      (mt/with-current-user (mt/user->id :rasta)
        (is (:unchecked? (shared.content-store/query-for-export query false)))
        (doseq [client-ids [#{} #{"q-1"}]]
          (binding [tools.shared/*memory-atom* (doto (conversation-query-state query)
                                                 (swap! assoc-in [:state :client-ids] client-ids))]
            (doseq [uri ["metabase://query/q-1" "metabase://chart/chart-1"]]
              (let [result (read-uris {:uris [uri]})]
                (is (str/includes? (:output result) "references content the user cannot read") uri)
                (is (not (str/includes? (:output result) "SELECT")) uri)))))))))

(deftest read-conversation-source-card-query-resource-test
  (testing "a query sourced from a readable card exports through the card's collection access alone,
           with no database permission of any kind"
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query {:database (mt/id)
                                                              :type     :query
                                                              :query    {:source-table (mt/id :orders)}}}]
      (mt/with-no-data-perms-for-all-users!
        (mt/with-current-user (mt/user->id :rasta)
          (doseq [database-id [(mt/id) lib.schema.id/saved-questions-virtual-database-id]]
            (binding [tools.shared/*memory-atom*
                      (conversation-query-state {:database database-id
                                                 :type     :query
                                                 :query    {:source-table (str "card__" card-id)}})]
              (doseq [uri ["metabase://query/q-1" "metabase://chart/chart-1"]]
                (let [result (read-uris {:uris [uri]})]
                  (is (=? {:resources [{:content map?}]} result))
                  (is (str/includes? (:output result) "source-card")))))))))))

(deftest read-conversation-source-card-query-unreadable-card-test
  (testing "a query sourced from a card in a collection the user cannot read has its body withheld"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-id :id} {:collection_id coll-id
                                                :dataset_query {:database (mt/id)
                                                                :type     :query
                                                                :query    {:source-table (mt/id :orders)}}}]
        (mt/with-current-user (mt/user->id :rasta)
          (binding [tools.shared/*memory-atom*
                    (conversation-query-state {:database (mt/id)
                                               :type     :query
                                               :query    {:source-table (str "card__" card-id)}})]
            (doseq [uri ["metabase://query/q-1" "metabase://chart/chart-1"]]
              (let [result (read-uris {:uris [uri]})]
                (is (str/includes? (:output result) "references content the user cannot read") uri)
                (is (not (str/includes? (:output result) "ORDERS")) uri)))))))))

(deftest read-transform-resource-test
  (mt/with-premium-features #{:transforms-basic :hosting}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Transform {transform-id :id transform-name :name}
                     {:name   "Gadget Products"
                      :source {:type  "query"
                               :query (lib/native-query (mt/metadata-provider)
                                                        "SELECT * FROM products WHERE category = 'Gadget'")}}]
        (testing "fetches transform info"
          (let [result (read-uris {:uris [(str "metabase://transform/" transform-id)]})]
            (is (=? {:resources [{:content {:structured-output map?}}]}
                    result))
            (is (str/includes? (:output result) transform-name))))
        (testing "rejects sub-resources"
          (is (=? {:resources [{:error string?}]}
                  (read-uris {:uris [(str "metabase://transform/" transform-id "/fields")]}))))
        (testing "returns error for unknown transform"
          (is (=? {:resources [{:error string?}]}
                  (read-uris {:uris ["metabase://transform/99999"]}))))))))

;; EE-only: the analyst reading here only can with `advanced-permissions`, which no OSS build can have
(mt/when-ee-evailable
 (deftest read-transform-resource-source-permission-test
   (testing "transforms/get-transform refuses a transform whose stored query the user cannot run, even
            with query access to another table in its database, so the resource never reaches the source"
     (mt/with-premium-features #{:transforms-basic :hosting :advanced-permissions}
       (mt/with-temp [:model/Transform {transform-id :id}
                      {:name   "Orders Rollup"
                       :source {:type  "query"
                                :query (lib/query (mt/metadata-provider)
                                                  (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}}]
         (mt/with-data-analyst-role! (mt/user->id :rasta)
           (mt/with-no-data-perms-for-all-users!
             (perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/view-data :unrestricted)
             (perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/create-queries :query-builder)
             (mt/with-current-user (mt/user->id :rasta)
               ;; A 403 and a 404 give the same sentence on purpose; see
               ;; `recoverable.common/not-found!`. Before, this was the bare
               ;; "You don't have permissions to do that." with no id and no next step.
               (is (=? {:resources [{:error #"(?s)^Transform \d+ was not found\..*"}]}
                       (read-uris {:uris [(str "metabase://transform/" transform-id)]}))))
             (testing "and the query renders once the source table is granted"
               (perms/set-table-permission! (perms-group/all-users) (mt/id :orders) :perms/view-data :unrestricted)
               (perms/set-table-permission! (perms-group/all-users) (mt/id :orders) :perms/create-queries :query-builder)
               (mt/with-current-user (mt/user->id :rasta)
                 (let [result (read-uris {:uris [(str "metabase://transform/" transform-id)]})]
                   (is (some? (get-in result [:resources 0 :content :structured-output :source :query])))))))))))))

(defn- read-title
  "The chain-of-thought title `read-resource` derives from what it read."
  [& uris]
  (-> (read-uris {:uris (vec uris)})
      :data-parts first :data :title))

(deftest read-resource-title-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Sales Overview"}
                   :model/Table     {table-id :id} {:name "orders" :display_name "Orders" :active true}]
      (testing "a single entity becomes a markdown link"
        (is (= (str "[Sales Overview](metabase://dashboard/" dash-id ")")
               (read-title (str "metabase://dashboard/" dash-id)))))
      (testing "square brackets in a name are stripped — they'd break the client's link parsing"
        (mt/with-temp [:model/Dashboard {bracket-id :id} {:name "Sales [2024]"}]
          (is (= (str "[Sales 2024](metabase://dashboard/" bracket-id ")")
                 (read-title (str "metabase://dashboard/" bracket-id))))))
      (testing "a table uses its friendly display_name"
        (is (= (str "[Orders](metabase://table/" table-id ")")
               (read-title (str "metabase://table/" table-id)))))
      (testing "a sub-resource appends its aspect, so fields reads differently than the entity"
        (is (= (str "[Orders](metabase://table/" table-id ") fields")
               (read-title (str "metabase://table/" table-id "/fields")))))
      (testing "a list read that carries no entity name falls back to the aspect noun"
        (is (= "cards"
               (read-title (str "metabase://dashboard/" dash-id "/items")))))
      (testing "multiple URIs join as a comma-delimited list; failed reads are skipped"
        (is (= (str "[Sales Overview](metabase://dashboard/" dash-id "), "
                    "[Orders](metabase://table/" table-id "), databases")
               (read-title (str "metabase://dashboard/" dash-id)
                           (str "metabase://table/" table-id)
                           "metabase://dashboard/99999"
                           "metabase://databases"))))
      (testing "no URIs -> no title data part"
        (is (nil? (read-title))))
      (testing "a named but non-linkable entity surfaces as plain text, not a link"
        (mt/with-temp [:model/Card {metric-id :id} {:name          "Revenue"
                                                    :type          :metric
                                                    :database_id   (mt/id)
                                                    :table_id      (mt/id :orders)
                                                    :dataset_query {:database (mt/id)
                                                                    :type     :query
                                                                    :query    {:source-table (mt/id :orders)
                                                                               :aggregation  [[:count]]}}}]
          (is (= "Revenue"
                 (read-title (str "metabase://metric/" metric-id))))))
      (testing "a document becomes a markdown link"
        (mt/with-temp [:model/Document {doc-id :id} {:name "Campaign plan"}]
          (is (= (str "[Campaign plan](metabase://document/" doc-id ")")
                 (read-title (str "metabase://document/" doc-id))))))
      (testing "a navigation list names what's being browsed"
        (is (= "databases" (read-title "metabase://databases")))
        (is (= "recent items" (read-title "metabase://user/recent-items"))))
      (testing "a missing entity -> no title"
        (is (nil? (read-title "metabase://dashboard/99999"))))
      (testing "an unreadable entity never leaks its name"
        (with-redefs [mi/can-read? (constantly false)]
          (is (nil? (read-title (str "metabase://dashboard/" dash-id)))))))))

;; ===== Permission coverage — every branch =====
;;
;; Two patterns:
;;   1. Single-entity reads (and their sub-resources) call `api/read-check` first, which
;;      throws when `mi/can-read?` returns false. The handler should error out.
;;   2. List handlers run `(filter mi/can-read?)` over their results. Items the user
;;      can't read should silently disappear from the output.
;;
;; Strategy: stub `mi/can-read?` and assert the corresponding response shape.

(defn- error?
  "Whether a read-resource response carries an error for its first URI."
  [result]
  (some? (-> result :resources first :error)))

(deftest read-check-throws-on-missing-perm-test
  (testing "every single-entity URI errors when user lacks read perms on the entity"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database   {db-id :id}     {}
                     :model/Table      {table-id :id}  {:db_id db-id :active true :schema "PUBLIC"}
                     :model/Card       {model-id :id}  {:type :model :database_id db-id}
                     :model/Card       {q-id :id}      {:type :question :database_id db-id}
                     :model/Card       {metric-id :id} {:type :metric :database_id db-id}
                     :model/Collection {coll-id :id}   {}
                     :model/Dashboard  {dash-id :id}   {}]
        (let [uris [;; Database family — api/read-check on the DB
                    (str "metabase://database/" db-id)
                    (str "metabase://database/" db-id "/tables")
                    (str "metabase://database/" db-id "/models")
                    (str "metabase://database/" db-id "/schemas")
                    (str "metabase://database/" db-id "/schemas/PUBLIC/tables")
                    ;; Collection family — api/read-check on the Collection
                    (str "metabase://collection/" coll-id)
                    (str "metabase://collection/" coll-id "/items")
                    (str "metabase://collection/" coll-id "/subcollections")
                    ;; Table family — api/read-check via metabot.tools.util/get-table
                    (str "metabase://table/" table-id)
                    (str "metabase://table/" table-id "/fields")
                    (str "metabase://table/" table-id "/fields/42")
                    (str "metabase://table/" table-id "/derived")
                    ;; Card (model) — api/read-check via get-card
                    (str "metabase://model/" model-id)
                    (str "metabase://model/" model-id "/fields")
                    (str "metabase://model/" model-id "/fields/42")
                    (str "metabase://model/" model-id "/sources")
                    ;; Card (question)
                    (str "metabase://question/" q-id)
                    (str "metabase://question/" q-id "/fields")
                    (str "metabase://question/" q-id "/fields/42")
                    (str "metabase://question/" q-id "/sources")
                    ;; Metric — api/read-check via get-card
                    (str "metabase://metric/" metric-id)
                    (str "metabase://metric/" metric-id "/dimensions")
                    (str "metabase://metric/" metric-id "/dimensions/42")
                    ;; Dashboard — api/read-check via get-dashboard-details
                    (str "metabase://dashboard/" dash-id)
                    (str "metabase://dashboard/" dash-id "/items")]]
          (with-redefs [mi/can-read? (constantly false)]
            (doseq [uri uris]
              (testing uri
                (is (error? (read-uris {:uris [uri]}))
                    (str uri " should return an :error response when user lacks read perms"))))))))))

(deftest read-check-throws-on-missing-perm-transform-test
  (testing "transform URIs error when the transform itself is unreadable"
    (mt/with-premium-features #{:transforms}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Transform {transform-id :id}
                       {:name   "Permission test transform"
                        :source {:type  "query"
                                 :query (lib/native-query (mt/metadata-provider) "SELECT 1")}}]
          (with-redefs [mi/can-read? (constantly false)]
            (doseq [uri [(str "metabase://transform/" transform-id)
                         (str "metabase://transform/" transform-id "/sources")
                         (str "metabase://transform/" transform-id "/target")]]
              (testing uri
                (is (error? (read-uris {:uris [uri]}))
                    (str uri " should return an :error response when user can't read transform"))))))))))

(deftest list-filters-databases-by-can-read-test
  (testing "metabase://databases hides DBs the user can't read"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database _              {:name "VISIBLE-DB"}
                     :model/Database {hidden-id :id} {:name "HIDDEN-DB"}]
        (let [orig mi/can-read?]
          (with-redefs [mi/can-read? (fn
                                       ([instance]
                                        (if (= hidden-id (:id instance)) false (orig instance)))
                                       ([model id]
                                        (if (= hidden-id id) false (orig model id))))]
            (let [{:keys [output]} (read-uris {:uris ["metabase://databases"]})]
              (is (str/includes? output "VISIBLE-DB"))
              (is (not (str/includes? output "HIDDEN-DB"))
                  "unreadable database must not appear in the list"))))))))

(deftest list-filters-destination-databases-test
  (testing "metabase://databases hides destination DBs"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {router-id :id} {:name "ROUTER-DB"}
                     :model/Database _               {:name "DESTINATION-DB" :router_database_id router-id}]
        (with-redefs [mi/can-read? (constantly true)]
          (let [{:keys [output]} (read-uris {:uris ["metabase://databases"]})]
            (is (str/includes? output "ROUTER-DB"))
            (is (not (str/includes? output "DESTINATION-DB"))
                "destination database must not appear in the list")))))))

(deftest list-filters-collections-by-can-read-test
  (testing "metabase://collections hides collections the user can't read"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection _              {:name "VISIBLE-COLL" :location "/"}
                     :model/Collection {hidden-id :id} {:name "HIDDEN-COLL"  :location "/"}]
        (let [orig mi/can-read?]
          (with-redefs [mi/can-read? (fn
                                       ([instance]
                                        (if (= hidden-id (:id instance)) false (orig instance)))
                                       ([model id]
                                        (if (= hidden-id id) false (orig model id))))]
            (let [{:keys [output]} (read-uris {:uris ["metabase://collections"]})]
              (is (str/includes? output "VISIBLE-COLL"))
              (is (not (str/includes? output "HIDDEN-COLL"))
                  "unreadable collection must not appear in the list"))))))))

(deftest list-filters-collection-items-by-can-read-test
  (testing "metabase://collection/{id}/items hides individual items the user can't read"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection {coll-id :id}    {:name "Mixed Coll" :location "/"}
                     :model/Card       _                 {:name "VISIBLE-CARD" :collection_id coll-id}
                     :model/Card       {hidden-card :id} {:name "HIDDEN-CARD"  :collection_id coll-id}
                     :model/Dashboard  _                 {:name "VISIBLE-DASH" :collection_id coll-id}
                     :model/Dashboard  {hidden-dash :id} {:name "HIDDEN-DASH"  :collection_id coll-id}]
        (let [orig         mi/can-read?
              hidden-cards #{hidden-card}
              hidden-dashes #{hidden-dash}]
          (with-redefs [mi/can-read?
                        (fn
                          ([instance]
                           (cond
                             (and (= :model/Card      (t2/model instance)) (hidden-cards (:id instance))) false
                             (and (= :model/Dashboard (t2/model instance)) (hidden-dashes (:id instance))) false
                             :else (orig instance)))
                          ([model id] (orig model id)))]
            (let [{:keys [output]} (read-uris
                                    {:uris [(str "metabase://collection/" coll-id "/items")]})]
              (is (str/includes? output "VISIBLE-CARD"))
              (is (str/includes? output "VISIBLE-DASH"))
              (is (not (str/includes? output "HIDDEN-CARD"))
                  "unreadable card must not appear in collection items")
              (is (not (str/includes? output "HIDDEN-DASH"))
                  "unreadable dashboard must not appear in collection items"))))))))

(deftest list-filters-database-tables-by-can-read-test
  (testing "metabase://database/{id}/tables hides tables the user can't read"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id}     {}
                     :model/Table    _               {:db_id db-id :name "VISIBLE-TBL" :active true}
                     :model/Table    {hidden-tbl :id} {:db_id db-id :name "HIDDEN-TBL"  :active true}]
        (let [orig mi/can-read?]
          (with-redefs [mi/can-read? (fn
                                       ([instance]
                                        (if (and (= :model/Table (t2/model instance))
                                                 (= hidden-tbl (:id instance)))
                                          false
                                          (orig instance)))
                                       ([model id] (orig model id)))]
            (let [{:keys [output]} (read-uris
                                    {:uris [(str "metabase://database/" db-id "/tables")]})]
              (is (str/includes? output "VISIBLE-TBL"))
              (is (not (str/includes? output "HIDDEN-TBL"))
                  "unreadable table must not appear in the database tables list"))))))))

(deftest list-filters-dashboard-items-by-can-read-test
  (testing "metabase://dashboard/{id}/items hides cards the user can't read"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard     {dash-id :id}      {}
                     :model/Card          {visible-card :id} {:name "VISIBLE-DASHCARD"}
                     :model/Card          {hidden-card :id}  {:name "HIDDEN-DASHCARD"}
                     :model/DashboardCard _                  {:dashboard_id dash-id :card_id visible-card}
                     :model/DashboardCard _                  {:dashboard_id dash-id :card_id hidden-card}]
        (let [orig mi/can-read?]
          (with-redefs [mi/can-read? (fn
                                       ([instance]
                                        (if (and (= :model/Card (t2/model instance))
                                                 (= hidden-card (:id instance)))
                                          false
                                          (orig instance)))
                                       ([model id] (orig model id)))]
            (let [{:keys [output]} (read-uris
                                    {:uris [(str "metabase://dashboard/" dash-id "/items")]})]
              (is (str/includes? output "VISIBLE-DASHCARD"))
              (is (not (str/includes? output "HIDDEN-DASHCARD"))
                  "unreadable card must not appear in dashboard items"))))))))

(deftest read-transform-target-authorization-test
  (testing "fetch-transform-target gates the target table by mi/can-read?"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {target-id :id :as target-table}
                     {:db_id db-id :name "TARGET-TABLE" :schema "PUBLIC" :active true}]
        (let [stub-transform {:id                 999
                              :name               "Stub Transform"
                              :source_database_id db-id
                              :target_db_id       db-id
                              :table              target-table}]
          (testing "when user CAN read the target, it appears in the output"
            (with-redefs [transforms.core/get-transform (constantly stub-transform)]
              (let [{:keys [output]} (read-uris
                                      {:uris ["metabase://transform/999/target"]})]
                (is (str/includes? output "TARGET-TABLE")
                    "target table name should appear when user has read perms")
                (is (str/includes? output (str "uri=\"metabase://table/" target-id "\""))
                    "target table URI should appear when user has read perms"))))
          (testing "when user CANNOT read the target, it's filtered out"
            (with-redefs [transforms.core/get-transform (constantly stub-transform)
                          mi/can-read? (constantly false)]
              (let [{:keys [output]} (read-uris
                                      {:uris ["metabase://transform/999/target"]})]
                (is (not (str/includes? output "TARGET-TABLE"))
                    "target table name must NOT appear when user lacks read perms")
                (is (not (str/includes? output (str "uri=\"metabase://table/" target-id "\"")))
                    "target table URI must NOT appear when user lacks read perms")
                ;; The target *database* URI is still surfaced — that's intentional, the
                ;; URI carries no extra metadata and any read_resource call on it will
                ;; enforce its own auth.
                (is (str/includes? output (str "uri=\"metabase://database/" db-id "\""))
                    "target database URI is informational and remains visible")))))))))

(deftest read-databases-list-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {:name "Test DB"}]
      (testing "metabase://databases returns the database with its drill-in URI"
        (let [{:keys [output]} (read-uris {:uris ["metabase://databases"]})]
          (is (str/includes? output "Test DB"))
          (is (str/includes? output (str "uri=\"metabase://database/" db-id "\""))))))))

(deftest read-database-tables-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {t-id :id} {:db_id db-id :name "ORDERS" :active true}]
      (testing "metabase://database/{id}/tables lists tables with drill-in URIs"
        (let [{:keys [output]} (read-uris {:uris [(str "metabase://database/" db-id "/tables")]})]
          (is (str/includes? output "ORDERS"))
          (is (str/includes? output (str "uri=\"metabase://table/" t-id "\""))))))))

(deftest read-collections-and-collection-items-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Marketing" :location "/"}
                   :model/Card {card-id :id} {:name "Sales report" :collection_id coll-id}
                   :model/Document {doc-id :id} {:name "Campaign plan" :collection_id coll-id}]
      (testing "metabase://collections lists root collections (excluding trash)"
        (let [{:keys [output]} (read-uris {:uris ["metabase://collections"]})]
          (is (str/includes? output "Marketing"))))
      (testing "metabase://collection/{id}/items lists members with drill-in URIs"
        (let [{:keys [output]} (read-uris {:uris [(str "metabase://collection/" coll-id "/items")]})]
          (is (str/includes? output "Sales report"))
          (is (str/includes? output (str "uri=\"metabase://question/" card-id "\"")))
          (is (str/includes? output "Campaign plan"))
          (is (str/includes? output (str "uri=\"metabase://document/" doc-id "\"")))
          (is (str/includes? output "can_write=\"true\"")))))))

(deftest read-table-derived-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/Card {card-id :id}
                   {:name        "Derived"
                    :type        :model
                    :database_id db-id
                    :table_id    table-id}]
      (testing "metabase://table/{id}/derived returns cards built on the table"
        (let [{:keys [output]} (read-uris {:uris [(str "metabase://table/" table-id "/derived")]})]
          (is (str/includes? output "Derived"))
          (is (str/includes? output (str "uri=\"metabase://model/" card-id "\""))))))))

(deftest read-table-derived-narrows-transforms-by-source-db-test
  (testing "transform candidates are SQL-filtered by source_database_id (no full Transform table scan)"
    (mt/with-premium-features #{:transforms}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Database {db1 :id} {:name "DB1"}
                       :model/Database {db2 :id} {:name "DB2"}
                       :model/Table    {tbl1-id :id} {:db_id db1}
                       :model/Transform {tx-other-db :id}
                       {:name               "Other-DB Transform"
                        :source_database_id db2
                        :source             {:type "query"
                                             :query (lib/native-query (mt/metadata-provider) "SELECT 1")}}]
          (testing "/derived for a table in db1 must exclude transforms whose source is in db2"
            (let [{:keys [output]} (read-uris
                                    {:uris [(str "metabase://table/" tbl1-id "/derived")]})]
              (is (not (str/includes? output "Other-DB Transform"))
                  "transforms not sourced from this table's database must not appear")
              (is (not (str/includes? output (str "uri=\"metabase://transform/" tx-other-db "\"")))))))))))

(deftest read-card-sources-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/Card {card-id :id} {:type :model :database_id db-id :table_id table-id}]
      (testing "metabase://model/{id}/sources returns the FK-resolved sources"
        (let [{:keys [output]} (read-uris {:uris [(str "metabase://model/" card-id "/sources")]})]
          (is (str/includes? output (str "uri=\"metabase://database/" db-id "\""))
              "should include the database URI")
          (is (str/includes? output (str "uri=\"metabase://table/" table-id "\""))
              "should include the source-table URI"))))))

(deftest read-card-sources-source-card-type-test
  (testing "source-card resolution preserves the card type — metric must not collapse to question"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id}     {}
                     :model/Table    {table-id :id}  {:db_id db-id}
                     :model/Card     {metric-id :id} {:type        :metric
                                                      :database_id db-id
                                                      :table_id    table-id}
                     :model/Card     {model-id :id}  {:type        :model
                                                      :database_id db-id
                                                      :table_id    table-id}
                     :model/Card     {q-id :id}      {:type           :question
                                                      :database_id    db-id
                                                      :table_id       table-id
                                                      :source_card_id metric-id}
                     :model/Card     {q-from-model-id :id} {:type           :question
                                                            :database_id    db-id
                                                            :table_id       table-id
                                                            :source_card_id model-id}]
        (testing "source_card_id pointing at a :metric emits a metric URI"
          (let [{:keys [output]} (read-uris
                                  {:uris [(str "metabase://question/" q-id "/sources")]})]
            (is (str/includes? output (str "uri=\"metabase://metric/" metric-id "\""))
                "should resolve source-card of type :metric to a metric URI, not question")
            (is (not (str/includes? output (str "uri=\"metabase://question/" metric-id "\"")))
                "must NOT collapse the metric source-card to a question URI")))
        (testing "source_card_id pointing at a :model still emits a model URI (regression)"
          (let [{:keys [output]} (read-uris
                                  {:uris [(str "metabase://question/" q-from-model-id "/sources")]})]
            (is (str/includes? output (str "uri=\"metabase://model/" model-id "\"")))))))))

(defn- measure-definition
  "An MBQL5 measure definition: the sum of `field-id` over `table-id`."
  [table-id field-id]
  (let [mp (mt/metadata-provider)]
    (lib/aggregate (lib/query mp (lib.metadata/table mp table-id))
                   (lib/sum (lib.metadata/field mp field-id)))))

(defn- segment-definition
  "An MBQL5 segment definition: a filter of `field-id` > `value` on `table-id`."
  [table-id field-id value]
  (let [mp (mt/metadata-provider)]
    (lib/filter (lib/query mp (lib.metadata/table mp table-id))
                (lib/> (lib.metadata/field mp field-id) value))))

(deftest read-measure-resource-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (let [orders (mt/id :orders)
            total  (mt/id :orders :total)]
        (mt/with-temp [:model/Measure {measure-id :id}
                       {:name       "Order Revenue"
                        :description "sum of order totals"
                        :table_id   orders
                        :creator_id (mt/user->id :crowberto)
                        :definition (measure-definition orders total)}]
          (testing "metabase://measure/{id} returns the measure with parent-table context + portable entity id"
            (let [result     (read-uris {:uris [(str "metabase://measure/" measure-id)]})
                  structured (get-in result [:resources 0 :content :structured-output])
                  output     (:output result)]
              (is (=? {:type                   :measure
                       :name                   "Order Revenue"
                       :database_id            (mt/id)
                       :base_table_id          orders
                       :portable-entity-id     string?
                       :base_table_portable_fk vector?}
                      structured))
              (testing "rendered XML carries the measure name and a portable entity id"
                (is (str/includes? output "Order Revenue"))
                (is (str/includes? output "portable_entity_id=")))))
          (testing "an unknown measure is the declared not-found error. `get-measure-details`
                   reports a miss by returning `{:output … :status-code 404}` rather than throwing,
                   which used to render as an empty `<resource>` once the formatter stopped
                   recognising the shape."
            (is (=? {:resources [{:error #"(?s)^Measure 99999 was not found\..*"}]}
                    (read-uris {:uris ["metabase://measure/99999"]}))))
          (testing "errors when the user can't read the parent table"
            (with-redefs [mi/can-read? (constantly false)]
              (is (error? (read-uris {:uris [(str "metabase://measure/" measure-id)]}))))))))))

(deftest read-segment-resource-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (let [orders (mt/id :orders)
            total  (mt/id :orders :total)]
        (mt/with-temp [:model/Segment {segment-id :id}
                       {:name       "Big Orders"
                        :description "totals over 100"
                        :table_id   orders
                        :definition (segment-definition orders total 100)}]
          (testing "metabase://segment/{id} returns the segment with parent-table context + portable entity id"
            (let [result     (read-uris {:uris [(str "metabase://segment/" segment-id)]})
                  structured (get-in result [:resources 0 :content :structured-output])
                  output     (:output result)]
              (is (=? {:type                   :segment
                       :name                   "Big Orders"
                       :database_id            (mt/id)
                       :base_table_id          orders
                       :portable-entity-id     string?
                       :base_table_portable_fk vector?}
                      structured))
              (testing "rendered XML carries the segment name and a portable entity id"
                (is (str/includes? output "Big Orders"))
                (is (str/includes? output "portable_entity_id=")))))
          (testing "an unknown segment is the declared not-found error (see the measure case)"
            (is (=? {:resources [{:error #"(?s)^Segment 99999 was not found\..*"}]}
                    (read-uris {:uris ["metabase://segment/99999"]}))))
          (testing "errors when the user can't read the parent table"
            (with-redefs [mi/can-read? (constantly false)]
              (is (error? (read-uris {:uris [(str "metabase://segment/" segment-id)]}))))))))))

(deftest read-dashboard-items-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard {dash-id :id} {}
                   :model/Card {card-id :id} {:name "Dash card"}
                   :model/DashboardCard {dc-id :id} {:dashboard_id dash-id :card_id card-id}]
      (testing "metabase://dashboard/{id}/items returns each dashcard with its dashcard_id"
        (let [{:keys [output]} (read-uris {:uris [(str "metabase://dashboard/" dash-id "/items")]})]
          (is (str/includes? output "Dash card"))
          (is (str/includes? output (str "uri=\"metabase://question/" card-id "\"")))
          (is (str/includes? output (str "dashcard_id=\"" dc-id "\""))))))))

(deftest read-dashboard-items-groups-by-tab-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard {dash-id :id} {}
                   :model/DashboardTab {tab1-id :id} {:dashboard_id dash-id :name "Tab One" :position 0}
                   :model/DashboardTab {tab2-id :id} {:dashboard_id dash-id :name "Tab Two" :position 1}
                   :model/DashboardTab _ {:dashboard_id dash-id :name "Empty Tab" :position 2}
                   ;; the second tab's card sits at row 0, above the first tab's card at row 1 —
                   ;; a flat row/col sort would list it first
                   :model/DashboardCard _ {:dashboard_id dash-id :dashboard_tab_id tab2-id
                                           :card_id nil :row 0 :col 0 :size_x 24 :size_y 1
                                           :visualization_settings {:virtual_card {:display "heading"}
                                                                    :text "Second Tab Heading"}}
                   :model/DashboardCard _ {:dashboard_id dash-id :dashboard_tab_id tab1-id
                                           :card_id nil :row 1 :col 0 :size_x 24 :size_y 1
                                           :visualization_settings {:virtual_card {:display "heading"}
                                                                    :text "First Tab Heading"}}
                   ;; predates the tabs: nil tab id, but the frontend renders it on the first tab
                   :model/DashboardCard _ {:dashboard_id dash-id :dashboard_tab_id nil
                                           :card_id nil :row 0 :col 0 :size_x 24 :size_y 1
                                           :visualization_settings {:virtual_card {:display "heading"}
                                                                    :text "Legacy Heading"}}]
      (let [{:keys [output]} (read-uris {:uris [(str "metabase://dashboard/" dash-id "/items")]})
            idx              #(str/index-of output %)]
        (testing "a <tabs> block lists every tab in display order, empty ones included"
          (is (< (idx "Tab One") (idx "Tab Two") (idx "Empty Tab"))))
        (testing "dashcards come grouped by tab, not interleaved by raw row/col"
          (is (< (idx "Legacy Heading") (idx "First Tab Heading") (idx "Second Tab Heading"))))
        (testing "items carry the tab_id that add mutations accept; nil-tab dashcards get the first tab's"
          ;; tab1: its <tab> element + the legacy (nil-tab) heading + the first-tab heading
          (is (= 3 (count (re-seq (re-pattern (str "tab_id=\"" tab1-id "\"")) output))))
          (is (= 2 (count (re-seq (re-pattern (str "tab_id=\"" tab2-id "\"")) output)))))))))

(deftest read-dashboard-items-includes-virtual-dashcards-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard {dash-id :id} {}
                   :model/DashboardCard {dc-id :id} {:dashboard_id dash-id
                                                     :card_id nil
                                                     :row 0 :col 0 :size_x 24 :size_y 1
                                                     :visualization_settings
                                                     {:virtual_card {:display "heading"}
                                                      :text         "Revenue Section"}}]
      (testing "virtual (heading/text) dashcards are listed with the dashcard_id that remove/move mutations take"
        (let [{:keys [output]} (read-uris {:uris [(str "metabase://dashboard/" dash-id "/items")]})]
          (is (str/includes? output "virtual_heading"))
          (is (str/includes? output "Revenue Section"))
          (is (str/includes? output (str "dashcard_id=\"" dc-id "\"")))))))
  (testing "a cardless dashcard without virtual_card settings still gets a generic item"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard {dash-id :id} {}
                     :model/DashboardCard {dc-id :id} {:dashboard_id dash-id
                                                       :card_id nil
                                                       :row 0 :col 0 :size_x 4 :size_y 1
                                                       :visualization_settings {}}]
        (let [{:keys [output]} (read-uris {:uris [(str "metabase://dashboard/" dash-id "/items")]})]
          (is (str/includes? output "virtual_dashcard"))
          (is (str/includes? output (str "dashcard_id=\"" dc-id "\"")))))))
  (testing "an action-button dashcard is listed as an action item with its dashcard_id"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-actions [{:keys [action-id]} {:type :query :visualization_settings {}}]
        ;; the frontend stores action buttons with BOTH an action_id and a virtual_card whose
        ;; display is "action" — the type must come out as "action", not "virtual_action"
        (mt/with-temp [:model/Dashboard {dash-id :id} {}
                       :model/DashboardCard {dc-id :id} {:dashboard_id dash-id
                                                         :card_id nil
                                                         :action_id action-id
                                                         :row 0 :col 0 :size_x 4 :size_y 1
                                                         :visualization_settings
                                                         {:virtual_card {:display "action"}}}]
          (let [{:keys [output]} (read-uris {:uris [(str "metabase://dashboard/" dash-id "/items")]})]
            (is (str/includes? output "type=\"action\""))
            (is (str/includes? output (str "dashcard_id=\"" dc-id "\""))))))))
  (testing "an action dashcard that also references its backing model card still reads as an action"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-actions [{model-id :id} {:type :model
                                        :dataset_query (let [mp (mt/metadata-provider)]
                                                         (lib/query mp (lib.metadata/table mp (mt/id :venues))))}
                        {:keys [action-id]} {:type :query :visualization_settings {}}]
        (mt/with-temp [:model/Dashboard {dash-id :id} {}
                       :model/DashboardCard {dc-id :id} {:dashboard_id dash-id
                                                         :card_id model-id
                                                         :action_id action-id
                                                         :row 0 :col 0 :size_x 4 :size_y 1
                                                         :visualization_settings
                                                         {:button.label "Create Row"}}]
          (let [{:keys [output]} (read-uris {:uris [(str "metabase://dashboard/" dash-id "/items")]})]
            (is (str/includes? output "type=\"action\""))
            (is (str/includes? output "name=\"Create Row\""))
            (is (str/includes? output (str "dashcard_id=\"" dc-id "\"")))
            (testing "the backing model stays drillable via the item's uri"
              (is (str/includes? output (str "uri=\"metabase://model/" model-id "\"")))))))))
  (testing "a link card renders its target URL as the item body"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard {dash-id :id} {}
                     :model/DashboardCard _ {:dashboard_id dash-id
                                             :card_id nil
                                             :row 0 :col 0 :size_x 4 :size_y 1
                                             :visualization_settings
                                             {:virtual_card {:display "link"}
                                              :link         {:url "https://status.example.com"}}}]
        (let [{:keys [output]} (read-uris {:uris [(str "metabase://dashboard/" dash-id "/items")]})]
          (is (str/includes? output "virtual_link"))
          (is (str/includes? output "https://status.example.com"))))))
  (testing "an entity link card does NOT leak the stored target snapshot (it bypasses read-checks)"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard {dash-id :id} {}
                     :model/DashboardCard _ {:dashboard_id dash-id
                                             :card_id nil
                                             :row 0 :col 0 :size_x 4 :size_y 1
                                             :visualization_settings
                                             {:virtual_card {:display "link"}
                                              :link         {:entity {:model "card" :id 12345
                                                                      :name "Secret Question"}}}}]
        (let [{:keys [output]} (read-uris {:uris [(str "metabase://dashboard/" dash-id "/items")]})]
          (is (str/includes? output "virtual_link"))
          (is (not (str/includes? output "Secret Question"))))))))

(deftest read-user-recents-test
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "metabase://user/recent-items returns a list shape (possibly empty)"
      (let [{:keys [output]} (read-uris {:uris ["metabase://user/recent-items"]})]
        (is (str/includes? output "<list type=\"recent-items\""))))))

(deftest read-list-shape-test
  (testing "list responses carry total/page/pages/showing/truncated attrs in the rendered XML"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [{:keys [output]} (read-uris {:uris ["metabase://databases"]})]
        (is (str/includes? output "<list type=\"databases\""))
        (is (str/includes? output "total="))
        (is (str/includes? output "page="))
        (is (str/includes? output "pages="))
        (is (str/includes? output "showing="))
        (is (str/includes? output "truncated="))))))

(deftest ^:parallel every-item-is-attributed-to-its-uri-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [{:keys [output resources]} (read-uris {:uris ["metabase://databases"
                                                        "metabase://table/99999999"
                                                        "metabase://nonsense/1"]})]
      (testing "a failed URI lands inside its own <resource> element, not loose in the envelope.
               Up to 5 reads share one result, so a failure the model cannot pin to a URI is a
               failure it cannot retry."
        (is (str/includes? output "<resource uri=\"metabase://table/99999999\">\n**Error:** "))
        (is (str/includes? output "<resource uri=\"metabase://nonsense/1\">\n**Error:** ")))
      (testing "a 404 names the entity the URI asked for, and says what to do next"
        (is (str/includes? output "Table 99999999 was not found"))
        (is (str/includes? output "Call `search`")))
      (testing "the successes are unaffected by the failures beside them"
        (is (str/includes? output "<list type=\"databases\"")))
      (testing "`:resources` carries every URI in order, which is the Agent API's published shape"
        (is (= ["metabase://databases" "metabase://table/99999999" "metabase://nonsense/1"]
               (mapv :uri resources)))
        (is (= [false true true] (mapv #(contains? % :error) resources)))))))

(deftest ^:parallel a-uri-attribute-is-escaped-test
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "the URI is the agent's own text and reaches the model inside an attribute, so a quote
             in it must not be able to close that attribute early"
      (let [{:keys [output]} (read-uris {:uris ["metabase://table/\"><script>"]})]
        (is (str/includes? output "<resource uri=\"metabase://table/\\\"><script>\">"))))))

;; ===== Behavioral tests for patterns where the dispatch contract isn't enough =====

(deftest read-database-detail-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {:name "Detail DB" :engine :h2}]
      (testing "metabase://database/{id} returns single-entity output with engine + uri"
        (let [{:keys [output]} (read-uris
                                {:uris [(str "metabase://database/" db-id)]})]
          (is (str/includes? output "Detail DB"))
          (is (str/includes? output (str "uri=\"metabase://database/" db-id "\"")))
          (is (str/includes? output "engine=\"h2\"")))))))

(deftest read-database-detail-rejects-destination-databases-test
  (testing "metabase://database/{destination-id} returns an error"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {router-id :id} {}
                     :model/Database {destination-id :id} {:router_database_id router-id}]
        (with-redefs [mi/can-read? (constantly true)]
          (is (error? (read-uris
                       {:uris [(str "metabase://database/" destination-id)]}))
              "destination database must not be readable by direct URI"))))))

(deftest read-destination-backed-entities-return-errors-test
  (testing "destination-backed entity resources cannot expose destination database metadata"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {router-id :id}      {}
                     :model/Database {destination-id :id} {:router_database_id router-id}]
        ;; A table can't exist on a destination in production (destinations aren't synced), so a normal
        ;; `with-temp :model/Table` trips the destination-permission guard. Insert it directly to work
        ;; around that guard and confirm the metabot guard rejects it anyway. (Cascades away with the db.)
        (let [table-id (t2/insert-returning-pk! (t2/table-name :model/Table)
                                                {:db_id      destination-id
                                                 :name       "destination-table"
                                                 :active     true
                                                 :created_at :%now
                                                 :updated_at :%now})]
          (mt/with-temp [:model/Card    {model-id :id}    {:type :model :database_id destination-id}
                         :model/Card    {question-id :id} {:type :question :database_id destination-id}
                         :model/Card    {metric-id :id}   {:type :metric :database_id destination-id}
                         :model/Measure {measure-id :id}  {:table_id table-id}
                         :model/Segment {segment-id :id}  {:table_id table-id}]
            (with-redefs [mi/can-read? (constantly true)]
              (doseq [uri [(str "metabase://table/" table-id)
                           (str "metabase://table/" table-id "/fields")
                           (str "metabase://table/" table-id "/fields/42")
                           (str "metabase://table/" table-id "/derived")
                           (str "metabase://model/" model-id)
                           (str "metabase://model/" model-id "/fields")
                           (str "metabase://model/" model-id "/fields/42")
                           (str "metabase://model/" model-id "/sources")
                           (str "metabase://question/" question-id)
                           (str "metabase://question/" question-id "/fields")
                           (str "metabase://question/" question-id "/fields/42")
                           (str "metabase://question/" question-id "/sources")
                           (str "metabase://metric/" metric-id)
                           (str "metabase://metric/" metric-id "/dimensions")
                           (str "metabase://metric/" metric-id "/dimensions/42")
                           (str "metabase://measure/" measure-id)
                           (str "metabase://segment/" segment-id)]]
                (testing uri
                  ;; Match the 404 text exactly: a plain `error?` check can't tell the
                  ;; destination-database guard from unrelated failures like "Field 42 not found".
                  ;; The guard raises a bare 404, which the URI's own kind and id now name — before,
                  ;; every one of these said only "Not found." with nothing to act on.
                  (is (re-find #"^\w+ \d+ was not found\. It may not exist, or you may not have access to it\."
                               (-> (read-uris {:uris [uri]}) :resources first :error))
                      "destination-backed entity resource must 404 via the destination-database guard"))))))))))

(deftest read-database-models-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id}    {}
                   :model/Card     {model-id :id} {:type :model :database_id db-id :name "M-One"}
                   :model/Card     _              {:type :question :database_id db-id :name "Q-Skip"}]
      (testing "metabase://database/{id}/models lists models only (not questions)"
        (let [{:keys [output]} (read-uris
                                {:uris [(str "metabase://database/" db-id "/models")]})]
          (is (str/includes? output "M-One"))
          (is (str/includes? output (str "uri=\"metabase://model/" model-id "\"")))
          (is (not (str/includes? output "Q-Skip"))))))))

(deftest read-database-schemas-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table _ {:db_id db-id :schema "PUBLIC"  :name "t1" :active true}
                   :model/Table _ {:db_id db-id :schema "PRIVATE" :name "t2" :active true}]
      (testing "metabase://database/{id}/schemas emits a drill-in URI per schema"
        (let [{:keys [output]} (read-uris
                                {:uris [(str "metabase://database/" db-id "/schemas")]})]
          (is (str/includes? output "PUBLIC"))
          (is (str/includes? output "PRIVATE"))
          (is (str/includes? output (str "uri=\"metabase://database/" db-id "/schemas/PUBLIC/tables\"")))
          (is (str/includes? output (str "uri=\"metabase://database/" db-id "/schemas/PRIVATE/tables\""))))))))

(deftest read-database-schema-tables-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {pub-id :id} {:db_id db-id :schema "PUBLIC"  :name "PUB-TABLE"  :active true}
                   :model/Table _            {:db_id db-id :schema "PRIVATE" :name "PRIV-TABLE" :active true}]
      (testing "metabase://database/{id}/schemas/{name}/tables filters by schema"
        (let [{:keys [output]} (read-uris
                                {:uris [(str "metabase://database/" db-id "/schemas/PUBLIC/tables")]})]
          (is (str/includes? output "PUB-TABLE"))
          (is (str/includes? output (str "uri=\"metabase://table/" pub-id "\"")))
          (is (not (str/includes? output "PRIV-TABLE"))))))))

(deftest read-database-schema-tables-with-slash-in-schema-name-test
  (testing "schema names containing '/' (which Postgres/Snowflake/etc. allow) survive URI round-trip"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {weird-id :id} {:db_id db-id :schema "weird/name" :name "WEIRD-TABLE" :active true}
                     :model/Table _              {:db_id db-id :schema "other"      :name "OTHER-TABLE" :active true}]
        (let [emitted-uri (llm-shape/metabase-uri :database db-id "schemas" "weird/name" "tables")]
          (testing "the URI builder emits an encoded segment"
            (is (str/includes? emitted-uri "weird%2Fname")))
          (testing "the encoded URI dispatches and filters to the right schema"
            (let [{:keys [output]} (read-uris {:uris [emitted-uri]})]
              (is (str/includes? output "WEIRD-TABLE"))
              (is (str/includes? output (str "uri=\"metabase://table/" weird-id "\"")))
              (is (not (str/includes? output "OTHER-TABLE"))))))))))

(deftest read-collection-detail-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Detail Coll" :location "/"}]
      (testing "metabase://collection/{id} returns single-entity output with name + uri"
        (let [{:keys [output]} (read-uris
                                {:uris [(str "metabase://collection/" coll-id)]})]
          (is (str/includes? output "Detail Coll"))
          (is (str/includes? output (str "uri=\"metabase://collection/" coll-id "\""))))))))

(deftest read-collection-subcollections-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/"}
                   :model/Collection {child-id :id}  {:name "Child"  :location (str "/" parent-id "/")}]
      (testing "metabase://collection/{id}/subcollections lists direct children only"
        (let [{:keys [output]} (read-uris
                                {:uris [(str "metabase://collection/" parent-id "/subcollections")]})]
          (is (str/includes? output "Child"))
          (is (str/includes? output (str "uri=\"metabase://collection/" child-id "\"")))
          (is (not (str/includes? output "Parent"))))))))

(deftest read-collections-tree-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection {parent-id :id} {:name "P" :location "/"}
                   :model/Collection _              {:name "C" :location (str "/" parent-id "/")}]
      (testing "metabase://collections?tree=true returns all collections with full path strings"
        (let [{:keys [output]} (read-uris
                                {:uris ["metabase://collections?tree=true"]})]
          (is (str/includes? output "<list type=\"collections-tree\""))
          (is (str/includes? output "P"))
          ;; child path is rendered as "P/C" (parent name + child name)
          (is (str/includes? output "P/C")
              "child collection should carry path=\"P/C\" computed from ancestor names"))))))

(deftest read-table-field-with-slash-test
  (testing "field IDs containing slashes (e.g. composite ids c75/17) are preserved through dispatch"
    (let [calls (atom nil)]
      (mt/with-dynamic-fn-redefs [read-resource/fetch-table-field
                                  (fn [& args] (reset! calls args) {:structured-output {:result-type :metabot-entity :type :stub}})]
        (#'read-resource/dispatch "metabase://table/3/fields/c75/17")
        (is (= ["3" "c75/17"] @calls))))))

(deftest read-table-field-partial-values-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [read-field (fn [table field]
                       (:output (read-uris
                                 {:uris [(str "metabase://table/" (mt/id table) "/fields/" (mt/id table field))]})))]
      (testing "a field with more values than the sample says how many it has"
        (let [output (read-field :people :state)]
          (is (str/includes? output "This list shows 30 of the field's 49 values."))
          (is (str/includes? output "when the user asks for a specific value, filter on that value"))))
      (testing "a field whose values all fit in the sample doesn't"
        (let [output (read-field :products :category)]
          (is (str/includes? output "| Widget |"))
          (is (not (str/includes? output "This list shows"))))))))

(deftest read-card-question-vs-model-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Card {q-id :id} {:type :question :database_id db-id :name "Q-card"}
                   :model/Card {m-id :id} {:type :model    :database_id db-id :name "M-card"}]
      (testing "metabase://question/{id}/sources discriminates from model"
        (let [{:keys [output]} (read-uris
                                {:uris [(str "metabase://question/" q-id "/sources")]})]
          (is (str/includes? output (str "uri=\"metabase://database/" db-id "\"")))))
      (testing "metabase://model/{id}/sources for a model card"
        (let [{:keys [output]} (read-uris
                                {:uris [(str "metabase://model/" m-id "/sources")]})]
          (is (str/includes? output (str "uri=\"metabase://database/" db-id "\""))))))))

(deftest read-question-resource-test
  (let [mp (mt/metadata-provider)
        query (as-> (lib/query mp (lib.metadata/table mp (mt/id :products))) $
                (lib/aggregate $ (lib/count))
                (lib/breakout $ (m/find-first (comp #{"Category"} :display-name)
                                              (lib/breakoutable-columns $))))
        metadata (-> query
                     qp/process-query
                     :data :results_metadata :columns)]
    (mt/with-temp
      [:model/Card {question-id :id} {:name "My fav card"
                                      :dataset_query query
                                      :result_metadata metadata}]
      (mt/with-test-user :crowberto
        (let [read-result (read-uris
                           {:uris [(str "metabase://question/" question-id "/fields")]})
              output (:output read-result)
              structured (get-in read-result [:resources 0 :content :structured-output])]
          (testing "Output references expected fields"
            (is (re-find #"<name>\S*My fav card" output)))
          (testing "Structured output contains expected fields"
            (is (=? {:fields [{:display_name "Category"}
                              {:display_name "Count"}]}
                    structured))))))))

;; ===== Pagination =====

(deftest paginate-list-test
  (testing "page 1 returns first 25 items"
    (let [items (mapv (fn [i] {:id i}) (range 1 51))
          result (#'read-resource/paginate-list items nil)]
      (is (= 1 (:page result)))
      (is (= 2 (:pages result)))
      (is (= 50 (:total result)))
      (is (= 25 (count (:items result))))
      (is (= 1 (-> result :items first :id)))
      (is (= 25 (-> result :items last :id)))))
  (testing "page 2 returns second 25 items"
    (let [items (mapv (fn [i] {:id i}) (range 1 51))
          result (#'read-resource/paginate-list items "2")]
      (is (= 2 (:page result)))
      (is (= 26 (-> result :items first :id)))
      (is (= 50 (-> result :items last :id)))))
  (testing "out-of-range page throws instead of clamping"
    (let [items (mapv (fn [i] {:id i}) (range 1 11))]
      (is (thrown-with-msg? Exception #"There is no page 999\. This list has 1 page\."
                            (#'read-resource/paginate-list items "999")))
      (is (thrown-with-msg? Exception #"There is no page 0\. This list has 1 page\."
                            (#'read-resource/paginate-list items "0")))
      (is (thrown-with-msg? Exception #"There is no page -3\. This list has 1 page\."
                            (#'read-resource/paginate-list items "-3")))))
  (testing "list shorter than one page"
    (let [items (mapv (fn [i] {:id i}) (range 1 6))
          result (#'read-resource/paginate-list items nil)]
      (is (= 1 (:page result)))
      (is (= 1 (:pages result)))
      (is (= 5 (:total result)))))
  (testing "empty list"
    (let [result (#'read-resource/paginate-list [] nil)]
      (is (= 1 (:page result)))
      (is (= 1 (:pages result)))
      (is (= 0 (:total result))))))

(deftest pagination-database-tables-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}]
      (doseq [i (range 1 31)]
        (t2/insert! :model/Table {:name   (format "TABLE-%03d" i)
                                  :db_id  db-id
                                  :active true}))
      (testing "page 1 returns first 25 tables, with page/pages metadata"
        (let [result (read-uris
                      {:uris [(str "metabase://database/" db-id "/tables")]})
              so     (get-in result [:resources 0 :content :structured-output])]
          (is (= 1 (:page so)))
          (is (= 2 (:pages so)))
          (is (= 30 (:total so)))
          (is (= 25 (count (:items so))))))
      (testing "page 2 returns remaining 5 tables"
        (let [result (read-uris
                      {:uris [(str "metabase://database/" db-id "/tables?page=2")]})
              so     (get-in result [:resources 0 :content :structured-output])]
          (is (= 2 (:page so)))
          (is (= 5 (count (:items so))))))
      (testing "out-of-range page surfaces as a resource error, not an uncaught exception"
        (let [result (read-uris
                      {:uris [(str "metabase://database/" db-id "/tables?page=999")]})]
          (is (=? {:resources [{:error string?}]} result)))))))

(deftest pagination-xml-output-test
  (testing "truncated list XML includes page/pages attrs and a truncation note with next-page URI hint"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}]
        (doseq [i (range 1 31)]
          (t2/insert! :model/Table {:name   (format "TBL-%03d" i)
                                    :db_id  db-id
                                    :active true}))
        (let [{:keys [output]} (read-uris
                                {:uris [(str "metabase://database/" db-id "/tables")]})]
          (is (str/includes? output "page=\"1\""))
          (is (str/includes? output "pages=\"2\""))
          (is (str/includes? output "truncated=\"true\""))
          (is (str/includes? output "?page=2") "truncation note should hint at next page URI"))))))

(deftest pagination-next-page-uri-replaces-existing-page-param-test
  (testing "a next-page-uri built from an already-paged request replaces, not duplicates, the page param"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}]
        (doseq [i (range 1 31)]
          (t2/insert! :model/Table {:name   (format "TBL-%03d" i)
                                    :db_id  db-id
                                    :active true}))
        (let [{:keys [output]} (read-uris
                                {:uris [(str "metabase://database/" db-id "/tables?page=1")]})]
          (is (str/includes? output (str "metabase://database/" db-id "/tables?page=2")))
          (is (not (str/includes? output "page=1&page=2"))))))))

;; ===== Collection tree ordering =====

(deftest collections-tree-ordering-test
  (testing "tree mode sorts by path name, not by raw location string (which would mis-order multi-digit IDs)"
    (mt/with-current-user (mt/user->id :crowberto)
      ;; Create roots whose IDs will cause lexicographic location-sort to diverge from
      ;; alphabetical path-sort: a root with a high numeric ID gets a child whose
      ;; location (/10/) would sort before the child of a lower-ID root (/2/).
      ;; After the fix, children are sorted by their human-readable path.
      (mt/with-temp
        [:model/Collection {z-root :id} {:name "Z-Root" :location "/"}
         :model/Collection {a-root :id} {:name "A-Root" :location "/"}
         :model/Collection _ {:name "Z-Child" :location (str "/" z-root "/")}
         :model/Collection _ {:name "A-Child" :location (str "/" a-root "/")}]
        (let [result   (read-uris {:uris ["metabase://collections?tree=true"]})
              so       (get-in result [:resources 0 :content :structured-output])
              paths    (mapv :path (:items so))]
          (testing "A-Root and its child appear before Z-Root and its child"
            (let [first-a (first (keep-indexed (fn [i p] (when (str/starts-with? p "A-Root") i)) paths))
                  first-z (first (keep-indexed (fn [i p] (when (str/starts-with? p "Z-Root") i)) paths))]
              (is (some? first-a))
              (is (some? first-z))
              (is (< first-a first-z) "A-Root subtree must come before Z-Root subtree")))
          (testing "A-Root/A-Child appears immediately after A-Root"
            (let [a-root-idx  (first (keep-indexed (fn [i p] (when (= "A-Root" p) i)) paths))
                  a-child-idx (first (keep-indexed (fn [i p] (when (= "A-Root/A-Child" p) i)) paths))]
              (is (some? a-root-idx))
              (is (some? a-child-idx))
              (is (= (inc a-root-idx) a-child-idx) "child should immediately follow its parent"))))))))

(deftest list-collection-items-excludes-exploration-summary-documents-test
  (testing "metabase://collection/{id}/items hides exploration Summary documents"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection  {coll-id :id} {:name "Mixed Coll" :location "/"}
                     :model/Document    _             {:name "VISIBLE-DOC" :collection_id coll-id}
                     :model/Exploration {expl-id :id} {:name "An exploration"}
                     :model/Document    _             {:name           "SUMMARY-DOC"
                                                       :collection_id  coll-id
                                                       :exploration_id expl-id}]
        (let [{:keys [output]} (read-uris
                                {:uris [(str "metabase://collection/" coll-id "/items")]})]
          (is (str/includes? output "VISIBLE-DOC"))
          (is (not (str/includes? output "SUMMARY-DOC"))
              "a Summary document is reachable only through its exploration, so it must not be listed"))))))
