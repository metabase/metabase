(ns metabase.mcp.permission-parity-test
  "The permission-parity matrix: the release-gating proof that a tool can never do what the caller
   couldn't do in the app.

   Construction already prevents the holes — every tool call is a synthetic in-process request under
   the caller's real user, so the endpoint checks, the model-level `can-read?`/`can-write?` checks,
   and the QP's permission middleware all fire exactly as they do for a browser request. This matrix
   is the backstop that proves it and catches regressions: for one user in one permission scenario,
   it calls the tool and the public REST endpoint the tool stands in for, and asserts the two give
   the same answer.

   A row asserts up to three things, and the weakest row that still proves something is the one that
   asserts all three that apply to it:

   - the **verdict** — allowed or denied, on both surfaces, and the one the row expects;
   - the **payload** — the rows, columns, items, or recipients the tool hands back are the ones REST
     hands the same user. A restriction that *filters* rather than refuses (a sandbox, a stripped
     subscription, a trash listing) is invisible to a verdict, so verdict-equality is exactly the
     wrong assertion for it: a tool that ran a sandboxed user's query with the sandbox filter
     dropped would answer `:allowed`, just as REST does, and pass;
   - the **read events** — a tool read leaves the view-log, view-count, and recent-items trail the
     app's own read leaves, because `search`'s recent mode reads that trail back.

   The rows below cover the reference tools; every tool task adds its own rows with
   [[check-parity!]]. The sandboxed-user, impersonated-user, blocked-database, and download-permission
   scenarios need EE code and live in `metabase-enterprise.mcp.permission-parity-test`, which reuses
   this harness.

   Scopes are deliberately left unrestricted here. Scope grants and admin toolset policy narrow
   *below* the permission floor; this matrix asserts the floor itself, so it must not be able to pass
   because a scope check happened to deny the call first."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.mcp.tools :as mcp.tools]
   [metabase.notification.test-util :as notification.tu]
   [metabase.permissions.core :as perms]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users :notifications))

;;; --------------------------------------------------- Harness ----------------------------------------------------

(defn tool-body
  "The tool result's payload. The text block carries it on every tool: a v2 result puts the body there
   exactly once and reserves `structuredContent` for next-step fields, so reading the structured channel
   first would see counts where the rows are."
  [result]
  (or (when-let [text (some-> result :content first :text)]
        (try (json/decode+kw text) (catch Exception _ text)))
      (:structuredContent result)))

(defn- query-failed?
  "Whether `body` is a query result the query processor refused to run. The QP reports a permission
   failure on the streaming path as a failed result body rather than an HTTP error, and it does so
   identically for the tool and for REST — so both classifiers have to recognize it."
  [body]
  (and (map? body)
       (contains? #{"failed" :failed} (:status body))))

(defn tool-denied?
  "Default classifier for a tool result. A tool refuses in-band, as an error result or a failed query."
  [result]
  (boolean (or (:isError result)
               (query-failed? (tool-body result)))))

(defn any-item-denied?
  "Classifier for a batch read (`read_resource`, `get_content`): the call itself succeeds and reports the
   refusal per requested item, so a denial is an item that came back with an error. The two tools name
   their item list differently — v1's `resources`, v2's envelope `data` — and either is read here."
  [result]
  (let [body (tool-body result)]
    (boolean (some :error (concat (:resources body) (:data body))))))

(defn- rest-denied?
  [{:keys [status body]}]
  (boolean (or (<= 400 status 499)
               (query-failed? body))))

(defn- outcome [denied?] (if denied? :denied :allowed))

;;; ------------------------------------------------ Payload comparison --------------------------------------------

(defn result-rows
  "The `rows` of a query result as a set, every value stringified. The two surfaces encode a value the
   same way in principle and not always in practice — an id is a JSON number here and a string there
   under `js-int-to-string?` — and the claim a sandbox row makes is about *which rows came back*, not
   about their JSON spelling."
  [rows]
  (into #{} (map (fn [row] (mapv str row))) rows))

(defn- nothing?
  [v]
  (or (nil? v) (and (coll? v) (empty? v))))

(defn- check-payload!
  "Assert the tool handed back what REST handed the same user.

   `from-tool` and `from-rest` read the comparable value out of each surface's body: the rows a query
   returned, the columns a table read exposed, the recipients a subscription named. Two guards keep the
   comparison from passing on nothing:

   - REST has to have returned a payload at all, or every tool compares equal to it;
   - `narrower-than`, when the row gives it, is the answer the scenario is supposed to be *narrowing* —
     the unrestricted user's. A payload that still equals it means the restriction restricted nothing,
     and the row would pass against a surface that ignored it entirely."
  [{:keys [from-tool from-rest narrower-than]} tool-body rest-body]
  (let [tool-value (from-tool tool-body)
        rest-value (from-rest rest-body)]
    (is (not (nothing? rest-value))
        (str "REST returned no payload, so this comparison would hold against any tool at all.\n"
             "  REST body: " (pr-str rest-body)))
    (is (= rest-value tool-value)
        (str "The tool must hand back exactly what REST hands the same user.\n"
             "  tool: " (pr-str tool-value) "\n"
             "  REST: " (pr-str rest-value)))
    (when (some? narrower-than)
      (is (not= narrower-than rest-value)
          (str "This scenario narrows the answer, and here it narrowed nothing — so the comparison would "
               "also hold against a tool that ignored the restriction.\n"
               "  unrestricted answer: " (pr-str narrower-than) "\n"
               "  restricted answer:   " (pr-str rest-value)))
      (when (and (set? narrower-than) (set? rest-value))
        (is (set/subset? rest-value narrower-than)
            (str "The restricted answer must be contained in the unrestricted one.\n"
                 "  unrestricted answer: " (pr-str narrower-than) "\n"
                 "  restricted answer:   " (pr-str rest-value)))))))

;;; ------------------------------------------------ Read events ---------------------------------------------------

(defn- captured-events!
  "The `[topic event]` pairs `thunk` publishes.

   Spies with an aux method rather than redefining `publish-event!` — it is a methodical multimethod,
   and swapping its var out from under the namespaces that `defmethod` on it breaks them. The
   qualifier has to be `:around`: `publish-event!` combines its methods with an *operator* combination
   (every subscriber runs, return values ignored), and an operator combination supports primary and
   `:around` methods only — it drops a `:before` aux on the floor, silently, and a spy that never fires
   makes every event comparison pass."
  [thunk]
  (let [published (atom [])
        spy-key   (gensym "captured-events!")]
    (try
      (methodical/add-aux-method-with-unique-key!
       #'events/publish-event! :around :default
       (fn [next-method topic event]
         (swap! published conj [topic event])
         (next-method topic event))
       spy-key)
      (thunk)
      (finally
        (methodical/remove-aux-method-with-unique-key!
         #'events/publish-event! :around :default spy-key)))
    @published))

(defn read-events!
  "An `:observe` function capturing the `topic` read events a surface publishes, as `[topic user-id
   entity-id]` signatures.

   A read tool leaves the trail a browser read leaves — view_log rows, view counts, recent items — and
   `search`'s `recent` mode reads that trail back, so a tool that reads an entity without publishing the
   event its REST read publishes is a tool whose reads are invisible to the next call. The signature is
   what has to match: the payloads carry either the id or the whole instance, and the instance REST
   loads is hydrated where the tool's is not."
  [topic]
  (fn [thunk]
    (vec (for [[t {:keys [object object-id user-id]}] (captured-events! thunk)
               :when (= t topic)]
           [t user-id (or object-id (:id object))]))))

(defn- run-observed
  "Call `thunk` under `observe`, returning `[result observation]`. Without an `observe` the row watches
   only what the call returned, and the observation is `nil`."
  [observe thunk]
  (if observe
    (let [result      (volatile! nil)
          observation (observe #(vreset! result (thunk)))]
      [@result observation])
    [(thunk) nil]))

;;; ------------------------------------------------ The assertion -------------------------------------------------

(defn check-parity!
  "Assert the MCP tool and the public REST endpoint it stands in for give `user` the same answer, and
   that the answer is `expect` (`:allowed` or `:denied`).

   `tool` is `[tool-name arguments]`. `rest` is the argument vector for
   `mt/user-http-request-full-response` after the user, e.g. `[:post \"dataset\" query]`.
   `tool-denied?` classifies the tool result and defaults to [[tool-denied?]]; batch reads pass
   [[any-item-denied?]], which reads the per-item refusal out of an otherwise-successful call.

   Two optional claims go beyond the verdict, and a scenario that restricts *what comes back* rather
   than *whether the call succeeds* needs them — a verdict cannot see a filter:

   - `payload` is `{:from-tool f :from-rest f :narrower-than v}` — see [[check-payload!]]. The two
     functions read the comparable value out of the tool body and the REST body; `narrower-than` is the
     unrestricted user's answer, and the row fails if the restricted answer still equals it.
   - `observe` is a function of a thunk returning what it observed while the thunk ran — see
     [[read-events!]]. Both surfaces run under it and both must have observed the same thing."
  [{:keys [scenario user tool expect payload observe] rest-request :rest :as parity-case}]
  (let [[tool-name arguments]      tool
        denied?                    (get parity-case :tool-denied? tool-denied?)
        [tool-result tool-observed] (run-observed observe
                                                  #(mt/with-test-user user
                                                     (mcp.tools/call-tool nil tool-name arguments)))
        [rest-response rest-observed] (run-observed observe
                                                    #(apply mt/user-http-request-full-response user rest-request))
        tool-outcome               (outcome (denied? tool-result))
        rest-outcome               (outcome (rest-denied? rest-response))]
    (testing (str tool-name " × " (name scenario))
      (is (= expect tool-outcome rest-outcome)
          (str "Tool and REST must agree, and both must " (name expect) ".\n"
               "  tool: " (pr-str (or (some-> tool-result :content first :text) tool-result)) "\n"
               "  REST: " (:status rest-response) " " (pr-str (:body rest-response))))
      (when payload
        (check-payload! payload (tool-body tool-result) (:body rest-response)))
      (when observe
        (is (not (nothing? rest-observed))
            "REST observed nothing, so this comparison would hold against a tool that observed nothing either.")
        (is (= rest-observed tool-observed)
            (str "The tool must leave the trail REST leaves for the same user.\n"
                 "  tool: " (pr-str tool-observed) "\n"
                 "  REST: " (pr-str rest-observed)))))))

;;; ------------------------------------------------ Harness self-tests --------------------------------------------
;;
;; A matrix that cannot fail proves nothing, so these rows assert the matrix catches each failure it
;; exists to catch: a tool that hands back what REST refuses the same user, a tool that hands back rows
;; REST filtered away, a comparison that compares nothing, and a tool whose read leaves no trail.

(defn- report-types
  "Run `thunk` with test reporting captured, returning the report types it emitted instead of failing
   this test with them."
  [thunk]
  (let [types (atom [])]
    (binding [clojure.test/report (fn [m] (swap! types conj (:type m)))]
      (thunk))
    @types))

(defn- failed?
  [thunk]
  (contains? (set (report-types thunk)) :fail))

(defmacro ^:private with-tool-result
  "Run `body` with every tool call answering with `body-map` as its text block — the stub that lets a
   self-test hand the matrix a leaking tool."
  [body-map & body]
  `(let [text# (json/encode ~body-map)]
     (mt/with-dynamic-fn-redefs [mcp.tools/call-tool (fn [& _#] {:content [{:type "text" :text text#}]})]
       ~@body)))

(deftest matrix-catches-a-missing-check-test
  (testing "a tool that returns content REST denies the same user fails the matrix"
    (mt/with-temp [:model/Collection coll {}
                   :model/Card       card {:collection_id (:id coll)}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (is (= [:fail]
               (report-types
                #(with-tool-result {:resources [{:uri (str "metabase://question/" (:id card)) :content {}}]}
                   (check-parity!
                    {:scenario     :no-collection-access
                     :user         :rasta
                     :expect       :denied
                     :tool         ["read_resource" {:uris [(str "metabase://question/" (:id card))]}]
                     :tool-denied? any-item-denied?
                     :rest         [:get (str "card/" (:id card))]})))))))))

(defn- portable-venues-query
  "The VENUES table in the external dialect `execute_query` takes: names, never ids."
  []
  {:lib/type "mbql/query"
   :stages   [{:lib/type     "mbql.stage/mbql"
               :source-table [(t2/select-one-fn :name :model/Database (mt/id)) "PUBLIC" "VENUES"]
               :limit        1}]})

(def ^:private venues-rows-payload
  "The payload claim of a VENUES read: the same rows, on both surfaces."
  {:from-tool #(result-rows (:rows %))
   :from-rest #(result-rows (get-in % [:data :rows]))})

(deftest matrix-catches-an-unfiltered-payload-test
  (testing "the honest tool returns the rows REST returns"
    (is (not (failed?
              #(check-parity!
                {:scenario :full-permissions
                 :user     :rasta
                 :expect   :allowed
                 :tool     ["execute_query" {:query (portable-venues-query)}]
                 :rest     [:post "dataset" (mt/mbql-query venues {:limit 1})]
                 :payload  venues-rows-payload})))))
  (testing "and a tool that hands back a row REST did not return for the same user fails the matrix — this is
            the failure a sandbox row exists to catch, and a verdict comparison cannot see it"
    (is (failed?
         #(with-tool-result {:rows [["1" "Row REST Filtered Away"]] :cols []}
            (check-parity!
             {:scenario :full-permissions
              :user     :rasta
              :expect   :allowed
              :tool     ["execute_query" {:query (portable-venues-query)}]
              :rest     [:post "dataset" (mt/mbql-query venues {:limit 1})]
              :payload  venues-rows-payload}))))))

(deftest matrix-catches-a-vacuous-payload-test
  (testing "a payload row whose REST side returns nothing to compare fails rather than passing on nothing"
    (is (failed?
         #(check-parity!
           {:scenario :full-permissions
            :user     :rasta
            :expect   :allowed
            :tool     ["execute_query" {:query (portable-venues-query)}]
            :rest     [:post "dataset" (mt/mbql-query venues {:limit 1})]
            :payload  {:from-tool (constantly [])
                       :from-rest (constantly [])}}))))
  (testing "and one whose restriction restricted nothing fails too — narrower-than names the answer it must not be"
    (is (failed?
         #(check-parity!
           {:scenario :full-permissions
            :user     :rasta
            :expect   :allowed
            :tool     ["execute_query" {:query (portable-venues-query)}]
            :rest     [:post "dataset" (mt/mbql-query venues {:limit 1})]
            :payload  (assoc venues-rows-payload
                             :narrower-than (result-rows
                                             (get-in (mt/user-http-request :rasta :post 202 "dataset"
                                                                           (mt/mbql-query venues {:limit 1}))
                                                     [:data :rows])))})))))

(deftest matrix-catches-a-missing-read-event-test
  (testing "a tool that reads a dashboard without publishing the read event REST publishes fails the matrix —
            the trail `search`'s recent mode reads back would be missing the tool's reads"
    (mt/with-temp [:model/Dashboard dash {}]
      (is (failed?
           #(with-tool-result {:data [{:type "dashboard" :id (:id dash) :name (:name dash)}]}
              (check-parity!
               {:scenario     :full-permissions
                :user         :rasta
                :expect       :allowed
                :tool         ["get_content" {:items [{:type "dashboard" :id (:id dash)}]}]
                :tool-denied? any-item-denied?
                :rest         [:get (str "dashboard/" (:id dash))]
                :observe      (read-events! :event/dashboard-read)})))))))

;;; ---------------------------------------------------- Rows ------------------------------------------------------

(deftest read-resource-no-collection-access-parity-test
  (testing "a card the user cannot read is refused by both surfaces"
    (mt/with-temp [:model/Collection coll {}
                   :model/Card       card {:collection_id (:id coll)}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (check-parity!
         {:scenario     :no-collection-access
          :user         :rasta
          :expect       :denied
          :tool         ["read_resource" {:uris [(str "metabase://question/" (:id card))]}]
          :tool-denied? any-item-denied?
          :rest         [:get (str "card/" (:id card))]})))))

(deftest create-collection-read-only-collection-parity-test
  (testing "a collection the user can read but not curate is refused as a write target by both surfaces"
    (mt/with-temp [:model/Collection coll {}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (perms/grant-collection-read-permissions! (perms/all-users-group) coll)
        (check-parity!
         {:scenario :read-only-collection
          :user     :rasta
          :expect   :denied
          :tool     ["create_collection" {:name "Parity" :parent_collection_id (:id coll)}]
          :rest     [:post "collection" {:name "Parity" :parent_id (:id coll)}]})))))

(deftest execute-question-archived-target-parity-test
  (testing "archiving is not a permission: a readable archived question still runs, on both surfaces"
    (mt/with-temp [:model/Card card {:archived      true
                                     :dataset_query (mt/mbql-query venues {:limit 1})}]
      (check-parity!
       {:scenario :archived-target
        :user     :rasta
        :expect   :allowed
        :tool     ["execute_question" {:id (:id card)}]
        :rest     [:post (str "card/" (:id card) "/query")]}))))

;;; ----------------------------------------------- browse_data ----------------------------------------------------

(deftest browse-data-baseline-parity-test
  (testing "the positive control: with full permissions both surfaces list the database's schemas"
    (check-parity!
     {:scenario :full-permissions
      :user     :rasta
      :expect   :allowed
      :tool     ["browse_data" {:action "list_schemas" :database_id (mt/id)}]
      :rest     [:get (str "database/" (mt/id) "/schemas")]})))

(deftest browse-data-blocked-database-parity-test
  (perms.test-util/with-no-data-perms-for-all-users!
    (check-parity!
     {:scenario :blocked-database
      :user     :rasta
      :expect   :denied
      :tool     ["browse_data" {:action "list_schemas" :database_id (mt/id)}]
      :rest     [:get (str "database/" (mt/id) "/schemas")]})))

(defn get-fields-denied?
  "Classifier for a single-table `get_fields`: the batch metadata read reports a refusal by returning
   the table in `omitted` rather than erroring the call, so a denial is an empty `data`."
  [result]
  (empty? (:data (tool-body result))))

(deftest browse-data-get-fields-blocked-database-parity-test
  (perms.test-util/with-no-data-perms-for-all-users!
    (check-parity!
     {:scenario     :blocked-database
      :user         :rasta
      :expect       :denied
      :tool         ["browse_data" {:action "get_fields" :table_ids [(mt/id :venues)]}]
      :tool-denied? get-fields-denied?
      :rest         [:get (str "table/" (mt/id :venues) "/query_metadata")]})))

(deftest browse-data-get-fields-marks-the-table-viewed-parity-test
  (testing "reading a table's fields marks it viewed, as opening the table in the app does — `search`'s
            recent mode reads those events back"
    (check-parity!
     {:scenario :full-permissions
      :user     :rasta
      :expect   :allowed
      :tool     ["browse_data" {:action "get_fields" :table_ids [(mt/id :venues)]}]
      :rest     [:get (str "table/" (mt/id :venues) "/data")]
      :observe  (read-events! :event/table-read)})))

;;; ------------------------------------- browse_collection · get_parameter_values ---------------------------------

(deftest browse-collection-baseline-parity-test
  (testing "the positive control: with full permissions both surfaces list the collection's items, and both
            mark it viewed"
    (mt/with-temp [:model/Collection coll {}]
      (check-parity!
       {:scenario :full-permissions
        :user     :rasta
        :expect   :allowed
        :tool     ["browse_collection" {:id (:id coll)}]
        :rest     [:get (str "collection/" (:id coll) "/items")]
        :observe  (read-events! :event/collection-read)}))))

(deftest browse-collection-tree-marks-it-viewed-parity-test
  (testing "browsing a collection as a tree marks it viewed too — the mode changes what comes back, not
            what the read records"
    (mt/with-temp [:model/Collection coll {}]
      (check-parity!
       {:scenario :full-permissions
        :user     :rasta
        :expect   :allowed
        :tool     ["browse_collection" {:id (:id coll) :mode "tree"}]
        :rest     [:get (str "collection/" (:id coll) "/items")]
        :observe  (read-events! :event/collection-read)}))))

(deftest browse-collection-no-collection-access-parity-test
  (mt/with-temp [:model/Collection coll {}]
    (mt/with-non-admin-groups-no-collection-perms coll
      (check-parity!
       {:scenario :no-collection-access
        :user     :rasta
        :expect   :denied
        :tool     ["browse_collection" {:id (:id coll)}]
        :rest     [:get (str "collection/" (:id coll) "/items")]}))))

(deftest browse-collection-archived-target-parity-test
  (testing "archiving is not a permission: a readable archived collection is still browsable, on both surfaces"
    (mt/with-temp [:model/Collection coll {:archived true}]
      (check-parity!
       {:scenario :archived-target
        :user     :rasta
        :expect   :allowed
        :tool     ["browse_collection" {:id (:id coll)}]
        :rest     [:get (str "collection/" (:id coll) "/items")]}))))

(deftest browse-collection-personal-collection-parity-test
  (testing "another user's personal collection is nobody else's to browse, on either surface"
    (let [lucky (:id (collection/user->personal-collection (mt/user->id :lucky)))]
      (check-parity!
       {:scenario :another-users-personal-collection
        :user     :rasta
        :expect   :denied
        :tool     ["browse_collection" {:id lucky}]
        :rest     [:get (str "collection/" lucky "/items")]}))))

(deftest browse-collection-trash-parity-test
  (testing "the trash listing is permission-filtered: archived content the caller could not read
            unarchived is in neither surface's listing"
    (mt/with-temp [:model/Collection hidden  {}
                   :model/Collection visible {}
                   :model/Card       _       {:name              "ParityTrash Hidden"
                                              :collection_id     (:id hidden)
                                              :archived          true
                                              :archived_directly true}
                   :model/Card       _       {:name              "ParityTrash Visible"
                                              :collection_id     (:id visible)
                                              :archived          true
                                              :archived_directly true}]
      (mt/with-non-admin-groups-no-collection-perms hidden
        (let [parity-cards (fn [names] (set (filter #{"ParityTrash Hidden" "ParityTrash Visible"} names)))]
          (check-parity!
           {:scenario :trash
            :user     :rasta
            :expect   :allowed
            :tool     ["browse_collection" {:id "trash" :limit 200}]
            :rest     [:get (str "collection/" (collection/trash-collection-id) "/items") :limit 200]
            :payload  {:from-tool     #(parity-cards (map :name (:data %)))
                       :from-rest     #(parity-cards (map :name (:data %)))
                       :narrower-than #{"ParityTrash Hidden" "ParityTrash Visible"}}}))))))

(deftest get-parameter-values-no-collection-access-parity-test
  (testing "a dashboard the caller cannot read gives up no filter values, on either surface"
    (mt/with-temp [:model/Collection coll {}
                   :model/Card       card {:dataset_query (mt/mbql-query venues)}
                   :model/Dashboard  dash {:collection_id (:id coll)
                                           :parameters    [{:name "Category" :slug "category"
                                                            :id   "cat" :type "string/="}]}
                   :model/DashboardCard _ {:dashboard_id       (:id dash)
                                           :card_id            (:id card)
                                           :parameter_mappings [{:parameter_id "cat"
                                                                 :card_id      (:id card)
                                                                 :target       [:dimension (mt/$ids venues $category_id->categories.name)]}]}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (check-parity!
         {:scenario :no-collection-access
          :user     :rasta
          :expect   :denied
          :tool     ["get_parameter_values" {:target "dashboard" :id (:id dash) :parameter_id "cat"}]
          :rest     [:get (str "dashboard/" (:id dash) "/params/cat/values")]})))))

;;; ------------------------------------------------- get_content --------------------------------------------------
;;
;; One row per type: `get_content` reads thirteen of them through one call, and a type whose read forgot
;; its permission check would be invisible in a matrix that only ever asked for a question.

(deftest get-content-baseline-parity-test
  (testing "the positive control: with full permissions both surfaces return the card"
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues)}]
      (check-parity!
       {:scenario     :full-permissions
        :user         :rasta
        :expect       :allowed
        :tool         ["get_content" {:items [{:type "question" :id (:id card)}]}]
        :tool-denied? any-item-denied?
        :rest         [:get (str "card/" (:id card))]}))))

(deftest get-content-no-collection-access-parity-test
  (testing "a card the caller cannot read is refused by both surfaces"
    (mt/with-temp [:model/Collection coll {}
                   :model/Card       card {:collection_id (:id coll)}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (check-parity!
         {:scenario     :no-collection-access
          :user         :rasta
          :expect       :denied
          :tool         ["get_content" {:items [{:type "question" :id (:id card)}]}]
          :tool-denied? any-item-denied?
          :rest         [:get (str "card/" (:id card))]})))))

(deftest get-content-model-and-metric-no-collection-access-parity-test
  (testing "a card's other two flavors read through the same check"
    (mt/with-temp [:model/Collection coll {}
                   :model/Card       model  {:collection_id (:id coll)
                                             :type          :model
                                             :dataset_query (mt/mbql-query venues)}
                   :model/Card       metric {:collection_id (:id coll)
                                             :type          :metric
                                             :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (doseq [[type card] [["model" model] ["metric" metric]]]
          (check-parity!
           {:scenario     (keyword (str "no-collection-access-" type))
            :user         :rasta
            :expect       :denied
            :tool         ["get_content" {:items [{:type type :id (:id card)}]}]
            :tool-denied? any-item-denied?
            :rest         [:get (str "card/" (:id card))]}))))))

(deftest get-content-dashboard-no-collection-access-parity-test
  (testing "and a dashboard the caller cannot read, likewise — every type reads through the app's own check"
    (mt/with-temp [:model/Collection coll {}
                   :model/Dashboard  dash {:collection_id (:id coll)}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (check-parity!
         {:scenario     :no-collection-access
          :user         :rasta
          :expect       :denied
          :tool         ["get_content" {:items [{:type "dashboard" :id (:id dash)}]}]
          :tool-denied? any-item-denied?
          :rest         [:get (str "dashboard/" (:id dash))]})))))

(deftest get-content-dashboard-marks-it-viewed-parity-test
  (testing "reading a dashboard marks it viewed, as GET /api/dashboard/:id does"
    (mt/with-temp [:model/Dashboard dash {}]
      (check-parity!
       {:scenario     :full-permissions
        :user         :rasta
        :expect       :allowed
        :tool         ["get_content" {:items [{:type "dashboard" :id (:id dash)}]}]
        :tool-denied? any-item-denied?
        :rest         [:get (str "dashboard/" (:id dash))]
        :observe      (read-events! :event/dashboard-read)}))))

(deftest get-content-archived-target-parity-test
  (testing "archiving is not a permission: a readable archived card still reads, on both surfaces"
    (mt/with-temp [:model/Card card {:archived true :dataset_query (mt/mbql-query venues)}]
      (check-parity!
       {:scenario     :archived-target
        :user         :rasta
        :expect       :allowed
        :tool         ["get_content" {:items [{:type "question" :id (:id card)}]}]
        :tool-denied? any-item-denied?
        :rest         [:get (str "card/" (:id card))]}))))

(deftest get-content-trashed-card-in-unreadable-collection-parity-test
  (testing "the trash is not an escape hatch: an archived card the caller could not read unarchived is
            still refused, on both surfaces"
    (mt/with-temp [:model/Collection coll {}
                   :model/Card       card {:collection_id (:id coll) :archived true}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (check-parity!
         {:scenario     :trashed-card-in-unreadable-collection
          :user         :rasta
          :expect       :denied
          :tool         ["get_content" {:items [{:type "question" :id (:id card)}]}]
          :tool-denied? any-item-denied?
          :rest         [:get (str "card/" (:id card))]})))))

(deftest get-content-collection-personal-parity-test
  (testing "another user's personal collection does not read, on either surface"
    (let [lucky (:id (collection/user->personal-collection (mt/user->id :lucky)))]
      (check-parity!
       {:scenario     :another-users-personal-collection
        :user         :rasta
        :expect       :denied
        :tool         ["get_content" {:items [{:type "collection" :id lucky}]}]
        :tool-denied? any-item-denied?
        :rest         [:get (str "collection/" lucky)]}))))

(deftest get-content-document-no-collection-access-parity-test
  (testing "a document the caller cannot read is refused by both surfaces"
    (mt/with-temp [:model/Collection coll {}
                   :model/Document   doc  {:name "Parity Doc" :collection_id (:id coll)}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (check-parity!
         {:scenario     :no-collection-access
          :user         :rasta
          :expect       :denied
          :tool         ["get_content" {:items [{:type "document" :id (:id doc)}]}]
          :tool-denied? any-item-denied?
          :rest         [:get (str "document/" (:id doc))]})))))

(deftest get-content-document-marks-it-viewed-parity-test
  (testing "and a readable one reads, marking it viewed as GET /api/document/:id does"
    (mt/with-temp [:model/Document doc {:name "Parity Doc"}]
      (check-parity!
       {:scenario     :full-permissions
        :user         :rasta
        :expect       :allowed
        :tool         ["get_content" {:items [{:type "document" :id (:id doc)}]}]
        :tool-denied? any-item-denied?
        :rest         [:get (str "document/" (:id doc))]
        :observe      (read-events! :event/document-read)}))))

(deftest get-content-timeline-no-collection-access-parity-test
  (testing "a timeline in a collection the caller cannot read is refused by both surfaces"
    (mt/with-temp [:model/Collection coll {}
                   :model/Timeline   tl   {:name "Parity Releases" :collection_id (:id coll)}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (check-parity!
         {:scenario     :no-collection-access
          :user         :rasta
          :expect       :denied
          :tool         ["get_content" {:items [{:type "timeline" :id (:id tl)}]}]
          :tool-denied? any-item-denied?
          :rest         [:get (str "timeline/" (:id tl))]})))))

(deftest get-content-snippet-no-native-permission-parity-test
  (testing "a snippet is native-query content: a caller with no native permission on any database is
            refused it by both surfaces"
    (mt/with-temp [:model/NativeQuerySnippet snippet {:name "Parity Snippet" :content "WHERE 1 = 1"}]
      (perms.test-util/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
        (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
        (check-parity!
         {:scenario     :no-native-query-permission
          :user         :rasta
          :expect       :denied
          :tool         ["get_content" {:items [{:type "snippet" :id (:id snippet)}]}]
          :tool-denied? any-item-denied?
          :rest         [:get (str "native-query-snippet/" (:id snippet))]})))))

(deftest get-content-snippet-with-native-permission-parity-test
  (testing "and with native permission both surfaces hand back the same snippet, body and all"
    (mt/with-temp [:model/NativeQuerySnippet snippet {:name "Parity Snippet" :content "WHERE 1 = 1"}]
      (check-parity!
       {:scenario     :native-query-permission
        :user         :rasta
        :expect       :allowed
        :tool         ["get_content" {:items            [{:type "snippet" :id (:id snippet)}]
                                      :response_format  "detailed"}]
        :tool-denied? any-item-denied?
        :rest         [:get (str "native-query-snippet/" (:id snippet))]
        :payload      {:from-tool #(select-keys (first (:data %)) [:name :content])
                       :from-rest #(select-keys % [:name :content])}}))))

(deftest get-content-segment-and-measure-blocked-database-parity-test
  (testing "a segment and a measure are definitions over a table: a caller with no access to the database
            behind them is refused both, on both surfaces"
    (mt/with-temp [:model/Segment segment {:name "Parity Segment" :table_id (mt/id :venues)}
                   :model/Measure measure {:name "Parity Measure" :table_id (mt/id :venues)}]
      (perms.test-util/with-no-data-perms-for-all-users!
        (doseq [[type entity url] [["segment" segment (str "segment/" (:id segment))]
                                   ["measure" measure (str "measure/" (:id measure))]]]
          (check-parity!
           {:scenario     (keyword (str "blocked-database-" type))
            :user         :rasta
            :expect       :denied
            :tool         ["get_content" {:items [{:type type :id (:id entity)}]}]
            :tool-denied? any-item-denied?
            :rest         [:get url]}))))))

(deftest get-content-transform-parity-test
  (testing "a transform writes to the warehouse, and only an admin reads one — on both surfaces"
    (mt/with-premium-features #{:transforms-basic :hosting}
      (mt/with-temp [:model/Transform transform {:name   "Parity Transform"
                                                 :source {:type  "query"
                                                          :query (mt/mbql-query venues)}
                                                 :target {:type "table" :schema "PUBLIC" :name "parity_out"}}]
        (check-parity!
         {:scenario     :non-admin
          :user         :rasta
          :expect       :denied
          :tool         ["get_content" {:items [{:type "transform" :id (:id transform)}]}]
          :tool-denied? any-item-denied?
          :rest         [:get (str "transform/" (:id transform))]})
        (check-parity!
         {:scenario     :admin
          :user         :crowberto
          :expect       :allowed
          :tool         ["get_content" {:items           [{:type "transform" :id (:id transform)}]
                                        :response_format "detailed"}]
          :tool-denied? any-item-denied?
          :rest         [:get (str "transform/" (:id transform))]
          :payload      {:from-tool #(select-keys (first (:data %)) [:name :target])
                         :from-rest #(select-keys % [:name :target])}})))))

;;; ---------------------------------------- get_content · alerts and subscriptions --------------------------------
;;
;; An alert and a subscription are readable by their creator and by their recipients, whatever the
;; collection says — and a recipient who cannot read the collection gets the record with its sensitive
;; metadata (the cards it sends, the other people it sends to) stripped. Only a payload row can see that
;; stripping: both surfaces answer "allowed", and the whole question is what came back.

(defn- pulse-with-recipient
  "A dashboard subscription in `collection-id` created by `creator`, sending one card to `recipient`."
  [collection-id creator recipient thunk]
  (mt/with-temp [:model/Card                  card    {:dataset_query (mt/mbql-query venues)}
                 :model/Pulse                 pulse   {:name          "Parity Subscription"
                                                       :collection_id collection-id
                                                       :creator_id    (mt/user->id creator)}
                 :model/PulseCard             _       {:pulse_id (:id pulse) :card_id (:id card)}
                 :model/PulseChannel          channel {:pulse_id     (:id pulse)
                                                       :channel_type :email
                                                       :details      {:emails ["parity@metabase.com"]}
                                                       :enabled      true}
                 :model/PulseChannelRecipient _       {:pulse_channel_id (:id channel)
                                                       :user_id          (mt/user->id recipient)}]
    (thunk pulse)))

(deftest get-content-subscription-no-collection-access-parity-test
  (testing "a subscription the caller neither created nor receives, in a collection they cannot read, is
            refused by both surfaces"
    (mt/with-temp [:model/Collection coll {}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (pulse-with-recipient
         (:id coll) :crowberto :lucky
         (fn [pulse]
           (check-parity!
            {:scenario     :no-collection-access
             :user         :rasta
             :expect       :denied
             :tool         ["get_content" {:items [{:type "subscription" :id (:id pulse)}]}]
             :tool-denied? any-item-denied?
             :rest         [:get (str "pulse/" (:id pulse))]})))))))

(deftest get-content-subscription-recipient-parity-test
  (testing "a recipient who cannot read the collection reads the subscription with the same sensitive
            metadata stripped from it that REST strips — the cards it sends and the other recipients"
    (mt/with-temp [:model/Collection coll {}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (pulse-with-recipient
         (:id coll) :crowberto :rasta
         (fn [pulse]
           (let [stripped (fn [record]
                            {:cards      (contains? record :cards)
                             :recipients (mapv #(contains? % :recipients) (:channels record))})]
             (check-parity!
              {:scenario     :recipient-without-collection-access
               :user         :rasta
               :expect       :allowed
               :tool         ["get_content" {:items           [{:type "subscription" :id (:id pulse)}]
                                             :response_format "detailed"}]
               :tool-denied? any-item-denied?
               :rest         [:get (str "pulse/" (:id pulse))]
               :payload      {:from-tool     #(stripped (first (:data %)))
                              :from-rest     stripped
                              :narrower-than {:cards true :recipients [true]}}}))))))))

(deftest get-content-alert-parity-test
  (testing "an alert reads for its creator and its recipients, and for nobody else — on both surfaces"
    (notification.tu/with-card-notification
      [alert {:handlers [{:channel_type :channel/email
                          :recipients   [{:type    :notification-recipient/user
                                          :user_id (mt/user->id :lucky)}]}]}]
      (check-parity!
       {:scenario     :neither-creator-nor-recipient
        :user         :rasta
        :expect       :denied
        :tool         ["get_content" {:items [{:type "alert" :id (:id alert)}]}]
        :tool-denied? any-item-denied?
        :rest         [:get (str "alert/" (:id alert))]})
      (check-parity!
       {:scenario     :recipient
        :user         :lucky
        :expect       :allowed
        :tool         ["get_content" {:items [{:type "alert" :id (:id alert)}]}]
        :tool-denied? any-item-denied?
        :rest         [:get (str "alert/" (:id alert))]
        :payload      {:from-tool #(select-keys (first (:data %)) [:id :name])
                       :from-rest #(select-keys % [:id :name])}}))))

;;; ------------------------------------------------- search -------------------------------------------------------
;;
;; `search` never refuses a call, so there is no denial to hold against REST's — it answers with what
;; the caller can read. Its parity claim is therefore about the *result set*: the hits the tool returns
;; are the hits the app's own search returns for that user, and content they cannot read is in neither.

(defn- search-tool-names
  [user term]
  (mt/with-test-user user
    (->> (mcp.tools/call-tool nil "search" {:term_queries [term] :type ["question"]})
         tool-body
         :data
         (map :name)
         set)))

(defn- rest-search-names
  [user term]
  (->> (mt/user-http-request user :get 200 "search" :q term :models "card")
       :data
       (map :name)
       set))

(deftest search-returns-what-the-app-returns-parity-test
  (binding [search.ingestion/*force-sync* true]
    (search.tu/with-new-search-if-available-otherwise-legacy
      (mt/with-temp [:model/Collection coll {}
                     :model/Card       _    {:name "ParityHidden Question" :collection_id (:id coll)}]
        (mt/with-non-admin-groups-no-collection-perms coll
          (testing "a question in a collection the caller cannot read is in neither surface's results"
            (is (= #{} (search-tool-names :rasta "ParityHidden")))
            (is (= (rest-search-names :rasta "ParityHidden")
                   (search-tool-names :rasta "ParityHidden"))))
          (testing "and an admin, who can read it, gets it from both"
            (is (= #{"ParityHidden Question"} (search-tool-names :crowberto "ParityHidden")))
            (is (= (rest-search-names :crowberto "ParityHidden")
                   (search-tool-names :crowberto "ParityHidden")))))))))

;;; ------------------------------------------------ execute_query -------------------------------------------------

(deftest execute-query-baseline-parity-test
  (testing "the positive control: with full permissions both surfaces run the query, and return the same rows"
    (check-parity!
     {:scenario :full-permissions
      :user     :rasta
      :expect   :allowed
      :tool     ["execute_query" {:query (portable-venues-query)}]
      :rest     [:post "dataset" (mt/mbql-query venues {:limit 1})]
      :payload  venues-rows-payload})))

(deftest execute-query-blocked-database-parity-test
  (perms.test-util/with-no-data-perms-for-all-users!
    (check-parity!
     {:scenario :blocked-database
      :user     :rasta
      :expect   :denied
      :tool     ["execute_query" {:query (portable-venues-query)}]
      :rest     [:post "dataset" (mt/mbql-query venues {:limit 1})]})))

;;; ------------------------------------------ execute_query · validate_only ---------------------------------------
;;
;; `validate_only` is a dry run: it resolves the query and answers whether it is valid, without ever
;; reaching the query processor. That makes it the one tool surface whose answer is *metadata about the
;; warehouse* rather than data from it, so what it may confirm is bounded by what the app would tell the
;; same user about the same tables and columns.

(defn- venues-joining-checkins-query
  "VENUES joined to CHECKINS, in the external dialect. The join is what carries the second table: the
   resolution pipeline permission-checks the first stage's source table, and every other table a query
   reaches rides in behind that check."
  []
  (let [db (t2/select-one-fn :name :model/Database (mt/id))]
    {:lib/type "mbql/query"
     :stages   [{:lib/type     "mbql.stage/mbql"
                 :source-table [db "PUBLIC" "VENUES"]
                 :joins        [{:alias      "Checkins"
                                 :strategy   "left-join"
                                 :stages     [{:lib/type     "mbql.stage/mbql"
                                               :source-table [db "PUBLIC" "CHECKINS"]}]
                                 :conditions [["=" {}
                                               ["field" {} [db "PUBLIC" "VENUES" "ID"]]
                                               ["field" {:join-alias "Checkins"}
                                                [db "PUBLIC" "CHECKINS" "VENUE_ID"]]]]}]
                 :limit        1}]}))

(deftest execute-query-validate-only-blocked-database-parity-test
  (testing "a dry run against a database the caller cannot read is refused, as the app refuses to describe
            that database's tables at all"
    (perms.test-util/with-no-data-perms-for-all-users!
      (check-parity!
       {:scenario :blocked-database
        :user     :rasta
        :expect   :denied
        :tool     ["execute_query" {:query (portable-venues-query) :validate_only true}]
        :rest     [:get (str "table/" (mt/id :venues) "/query_metadata")]}))))

(deftest execute-query-validate-only-unqueryable-joined-table-parity-test
  (testing "a dry run over a join to a table the caller may not query is refused: the app will not
            describe that table to them, and `validated: true` on a query that names its columns
            confirms both that it exists and that those columns do"
    (perms.test-util/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
      (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/create-queries :no)
      (check-parity!
       {:scenario :joined-table-not-queryable
        :user     :rasta
        :expect   :denied
        :tool     ["execute_query" {:query (venues-joining-checkins-query) :validate_only true}]
        :rest     [:get (str "table/" (mt/id :checkins) "/query_metadata")]})
      (testing "and running it is refused by both surfaces"
        (check-parity!
         {:scenario :joined-table-not-queryable
          :user     :rasta
          :expect   :denied
          :tool     ["execute_query" {:query (venues-joining-checkins-query)}]
          :rest     [:post "dataset"
                     (mt/mbql-query venues
                       {:joins [{:source-table (mt/id :checkins)
                                 :alias        "Checkins"
                                 :condition    [:= [:field (mt/id :venues :id) nil]
                                                [:field (mt/id :checkins :venue_id) {:join-alias "Checkins"}]]}]
                        :limit 1})]})))))

;;; --------------------------------------------- run_saved_question -----------------------------------------------
;;
;; The REST endpoint a `run_saved_question` call stands in for is `POST /api/card/:id/query`, which is what the
;; app posts when someone opens a saved question — and `POST /api/card/:id/query/csv` when they download it.

(def ^:private saved-question-rows-payload
  "The payload claim of a saved-question run: the same rows on both surfaces. The tool answers in its own
   envelope, with `rows` at the top level; REST hands back the dataset response, whose rows sit under `data`."
  {:from-tool #(result-rows (:rows %))
   :from-rest #(result-rows (get-in % [:data :rows]))})

(deftest run-saved-question-baseline-parity-test
  (testing "the positive control: with full permissions both surfaces run the card, and return the same rows"
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues {:limit 1})}]
      (check-parity!
       {:scenario :full-permissions
        :user     :rasta
        :expect   :allowed
        :tool     ["run_saved_question" {:id (:id card)}]
        :rest     [:post (str "card/" (:id card) "/query")]
        :payload  saved-question-rows-payload}))))

(deftest run-saved-question-no-collection-access-parity-test
  (testing "a card in a collection the caller cannot read does not run, on either surface"
    (mt/with-temp [:model/Collection coll {}
                   :model/Card       card {:collection_id (:id coll)
                                           :dataset_query (mt/mbql-query venues)}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (check-parity!
         {:scenario :no-collection-access
          :user     :rasta
          :expect   :denied
          :tool     ["run_saved_question" {:id (:id card)}]
          :rest     [:post (str "card/" (:id card) "/query")]})))))

(deftest run-saved-question-blocked-database-parity-test
  (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues)}]
    (perms.test-util/with-no-data-perms-for-all-users!
      (check-parity!
       {:scenario :blocked-database
        :user     :rasta
        :expect   :denied
        :tool     ["run_saved_question" {:id (:id card)}]
        :rest     [:post (str "card/" (:id card) "/query")]}))))

(deftest run-saved-question-records-the-view-parity-test
  (testing "running a card marks it viewed, as running it in the app does — `search`'s recent mode reads those
            events back, and a card's read event comes from the query processor when the card is *run*"
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues {:limit 1})}]
      (check-parity!
       {:scenario :full-permissions
        :user     :rasta
        :expect   :allowed
        :tool     ["run_saved_question" {:id (:id card)}]
        :rest     [:post (str "card/" (:id card) "/query")]
        :observe  (read-events! :event/card-read)}))))

;;; ------------------------------------------------- execute_sql --------------------------------------------------
;;
;; The SQL the rows come from, on both surfaces, is the same string: the REST endpoint an `execute_sql` call
;; stands in for is `POST /api/dataset` with a native query, which is what the app's own SQL editor posts.

(def ^:private venues-sql
  "SELECT ID, NAME FROM VENUES ORDER BY ID LIMIT 1")

(defn- native-venues-query
  []
  {:database (mt/id)
   :type     :native
   :native   {:query venues-sql}})

(deftest execute-sql-baseline-parity-test
  (testing "the positive control: with native-query permission both surfaces run the SQL, and return the same rows"
    (check-parity!
     {:scenario :full-permissions
      :user     :rasta
      :expect   :allowed
      :tool     ["execute_sql" {:database_id (mt/id) :sql venues-sql}]
      :rest     [:post "dataset" (native-venues-query)]
      :payload  venues-rows-payload})))

(deftest execute-sql-without-native-permission-parity-test
  (testing "a caller who may build queries but not write them refuses on both surfaces — the query-builder
            permission is not the native one, and SQL is exactly the gap between them"
    (perms.test-util/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
      (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
      (check-parity!
       {:scenario :no-native-query-permission
        :user     :rasta
        :expect   :denied
        :tool     ["execute_sql" {:database_id (mt/id) :sql venues-sql}]
        :rest     [:post "dataset" (native-venues-query)]}))))

(deftest execute-sql-blocked-database-parity-test
  (perms.test-util/with-no-data-perms-for-all-users!
    (check-parity!
     {:scenario :blocked-database
      :user     :rasta
      :expect   :denied
      :tool     ["execute_sql" {:database_id (mt/id) :sql venues-sql}]
      :rest     [:post "dataset" (native-venues-query)]})))

(deftest execute-sql-validate-only-without-native-permission-parity-test
  (testing "a dry run is refused by the permission the run needs: `validate_only` never reaches the query
            processor, so the check it skips is the only one standing in front of it"
    (perms.test-util/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
      (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
      (check-parity!
       {:scenario :no-native-query-permission
        :user     :rasta
        :expect   :denied
        :tool     ["execute_sql" {:database_id (mt/id) :sql venues-sql :validate_only true}]
        :rest     [:post "dataset" (native-venues-query)]}))))
