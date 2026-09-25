(ns metabase.metabot.tools.api-call-test
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.api-call :as api-call]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)
   (java.util.concurrent CountDownLatch)))

(set! *warn-on-reflection* true)

(defn- call [args]
  (api-call/call-api-tool args))

(defn- extract-id
  "Pull the first `\"id\":<n>` out of a call_api :output string."
  [output]
  (some-> (re-find #"\"id\":(\d+)" output) second Long/parseLong))

;; call_api dispatches through the real production handler, which returns 503 until initialization is
;; complete. These tests exercise the tool directly (not via the test HTTP client, which would do this
;; itself), so nothing else completes init — initialize the :web-server component, which marks it complete.
(use-fixtures :once (fixtures/initialize :web-server))

;;; ---------------------------------------------- call_api ----------------------------------------------

(deftest call-api-runs-as-current-user-test
  (testing "call_api dispatches as the bound user (not as a superuser)"
    (mt/with-test-user :rasta
      (let [{:keys [output structured-output]} (call {:method "GET" :path "/api/user/current"})]
        (is (str/starts-with? output "HTTP 200"))
        (is (str/includes? output (str "\"id\":" (mt/user->id :rasta)))
            "the /api/user/current response is rasta, proving the request ran as rasta")
        (is (= "/api/user/current" (:path structured-output)))
        (is (= 200 (:status structured-output)))))))

(deftest call-api-write-then-read-test
  (testing "a POST write succeeds and is visible via a follow-up GET"
    (mt/with-model-cleanup [:model/Collection]
      (mt/with-test-user :crowberto
        (let [{:keys [output]} (call {:method "POST"
                                      :path   "/api/collection"
                                      :body   {:name "Megabot API QA"}})]
          (is (str/starts-with? output "HTTP 20"))
          (let [id (extract-id output)]
            (is (int? id))
            (let [{:keys [output]} (call {:method "GET" :path (str "/api/collection/" id)})]
              (is (str/starts-with? output "HTTP 200"))
              (is (str/includes? output "Megabot API QA")))))))))

(deftest call-api-enforces-permissions-test
  (testing "a call the user isn't allowed to make returns the API's own 4xx, not a bypass"
    (mt/with-test-user :rasta
      (let [{:keys [output structured-output]} (call {:method "GET" :path "/api/setting"})]
        (is (re-find #"HTTP 40[13]" output)
            "rasta is not an admin, so listing settings must be forbidden")
        (is (contains? #{401 403} (:status structured-output)))))))

(deftest call-api-normalizes-path-test
  (testing "the /api prefix is added and hosts/leading-slash variations all resolve"
    (mt/with-test-user :rasta
      (doseq [p ["/api/user/current" "/user/current" "user/current"]]
        (let [{:keys [output]} (call {:method "GET" :path p})]
          (is (str/starts-with? output "HTTP 200") (str "path variant: " p)))))))

(deftest call-api-query-params-test
  (testing "query_params are passed through to the handler (request succeeds with a filter param)"
    (mt/with-test-user :crowberto
      (let [{:keys [output]} (call {:method       "GET"
                                    :path         "/api/collection"
                                    :query_params {:archived true}})]
        (is (str/starts-with? output "HTTP 200"))))))

(deftest call-api-streaming-response-test
  (testing "a streaming query-execution response is realized into :output"
    (mt/with-test-user :crowberto
      (let [{:keys [output]} (call {:method "POST"
                                    :path   "/api/dataset"
                                    :body   {:database (mt/id)
                                             :type     "native"
                                             :native   {:query "SELECT 1 AS n"}}})]
        (is (str/starts-with? output "HTTP 20"))
        (is (str/includes? output "\"rows\"")
            "the realized streaming body should contain the query result rows")))))

(deftest call-api-read-only-setting-test
  (testing "megabot-api-read-only? refuses non-GET but still allows GET"
    (mt/with-temporary-setting-values [megabot-api-read-only? true]
      (mt/with-test-user :crowberto
        (let [{:keys [output]} (call {:method "POST" :path "/api/collection" :body {:name "nope"}})]
          (is (str/includes? output "read-only")))
        (let [{:keys [output]} (call {:method "GET" :path "/api/user/current"})]
          (is (str/starts-with? output "HTTP 200")))))))

(deftest call-api-error-path-test
  (testing "an unknown path returns an HTTP status string, never throws"
    (mt/with-test-user :rasta
      (let [{:keys [output]} (call {:method "GET" :path "/api/definitely-not-a-real-endpoint"})]
        (is (string? output))
        (is (re-find #"HTTP \d\d\d" output))))))

;;; ------------------------------------- timeouts / body caps -------------------------------------

(def ^:private max-body-bytes @#'api-call/max-body-bytes)

(defn- do-with-stub-handler!
  "Run `thunk` with call_api's production handler replaced by the async 3-arity `stub`."
  [stub thunk]
  (with-redefs [api-call/api-handler (delay stub)]
    (thunk)))

(defn- responding-with
  "A stub handler that immediately responds with `response`."
  [response]
  (fn [_request respond _raise]
    (respond response)))

(deftest call-api-timeout-test
  (testing "a hanging endpoint times out and its (blocked) worker thread is interrupted"
    (let [latch       (CountDownLatch. 1)
          interrupted (promise)
          stub        (fn [_request _respond _raise]
                        (try
                          (.await latch)
                          (catch InterruptedException _
                            (deliver interrupted true))))]
      (try
        (do-with-stub-handler!
         stub
         (fn []
           (let [start                              (System/nanoTime)
                 {:keys [output structured-output]} (call {:method "GET" :path "/api/slow" :timeout_seconds 1})
                 elapsed-ms                         (/ (- (System/nanoTime) start) 1e6)]
             (is (str/includes? output "timed out after 1s"))
             (is (< elapsed-ms 5000))
             (is (=? {:status nil :timed-out true :path "/api/slow"} structured-output))
             (is (true? (deref interrupted 2000 false))
                 "the blocked endpoint thread should be interrupted"))))
        (finally
          (.countDown latch))))))

(deftest call-api-streaming-timeout-test
  (testing "the timeout also covers realizing a streaming body, and cancels it via canceled-chan"
    (let [received (promise)
          sr       (streaming-response/streaming-response {:content-type "application/json"} [_os canceled-chan]
                     (try
                       (loop []
                         (if-let [v (a/poll! canceled-chan)]
                           (deliver received v)
                           (do (Thread/sleep 20) (recur))))
                       (catch InterruptedException _
                         (deliver received (a/poll! canceled-chan)))))]
      (do-with-stub-handler!
       (responding-with {:status 202 :headers {"Content-Type" "application/json"} :body sr})
       (fn []
         (let [{:keys [output]} (call {:method "GET" :path "/api/slow-stream" :timeout_seconds 1})]
           (is (str/includes? output "timed out after 1s"))
           (is (= ::api-call/timeout (deref received 2000 ::never)))))))))

(defn- chunked-streaming-response!
  "A StreamingResponse that sets status 202, then writes 1KB chunks (up to 10MB) until canceled, counting
  bytes written in `written`. With `error-after-cancel?`, reports the cancellation via `write-error!` like
  the QP does."
  [written error-after-cancel?]
  (let [chunk (.getBytes ^String (apply str (repeat 1024 "x")) "UTF-8")]
    (streaming-response/streaming-response {:content-type "text/plain"} [os canceled-chan]
      (streaming-response/set-status! 202)
      (loop []
        (cond
          (a/poll! canceled-chan)
          (when error-after-cancel?
            (streaming-response/write-error! os (ex-info "Query canceled" {}) :api))

          (< @written (* 10 1024 1024))
          (do (.write os chunk)
              (swap! written + (alength chunk))
              (recur)))))))

(deftest call-api-streaming-cap-test
  (doseq [error-after-cancel? [false true]]
    (testing (str "a huge streaming body is capped and the producer canceled; error-after-cancel? = " error-after-cancel?)
      (let [written (atom 0)]
        (do-with-stub-handler!
         (responding-with {:status  200
                           :headers {"Content-Type" "text/plain"}
                           :body    (chunked-streaming-response! written error-after-cancel?)})
         (fn []
           (let [{:keys [output structured-output]} (call {:method "GET" :path "/api/export"})]
             (is (str/includes? output "[body truncated]"))
             (is (<= max-body-bytes @written (+ max-body-bytes 2048))
                 "the producer stops right after the cap, far below 10MB")
             (is (str/starts-with? output "HTTP 202")
                 "the producer's own status survives; the post-cancel 500 is ignored")
             (is (= 202 (:status structured-output))))))))))

(deftest call-api-input-stream-cap-test
  (testing "an InputStream body larger than the cap is read only up to the cap and reported truncated"
    (do-with-stub-handler!
     (responding-with {:status  200
                       :headers {"Content-Type" "text/plain"}
                       :body    (ByteArrayInputStream. (.getBytes ^String (apply str (repeat (* 1024 1024) "a")) "UTF-8"))})
     (fn []
       (let [{:keys [output]} (call {:method "GET" :path "/api/big"})]
         (is (str/includes? output "[body truncated]"))
         (is (<= (count output) (+ te/default-max-output-chars 200))))))))

;;; ------------------------------------------ change summaries ------------------------------------------

(defn- title
  "The `tool_title` a call_api result labels its chat step with, or nil."
  [{:keys [data-parts]}]
  (some #(when (= "tool_title" (:data-type %)) (get-in % [:data :title])) data-parts))

(defn- summary-line
  "The line call_api puts between the HTTP status and the body."
  [output]
  (second (str/split-lines output)))

(deftest ^:parallel read-call-test
  (testing "GETs and the POSTs that only run, export, or dry-run something are reads"
    (are [m uri] (#'api-call/read-call? m uri)
      :get  "/api/dashboard/1"
      :post "/api/dataset"
      :post "/api/card/1/query"
      :post "/api/card/1/query/csv"
      :post "/api/dashboard/1/pdf"
      :post "/api/dashboard/1/dashcard/2/execute/values"
      :post "/api/database/validate"))
  (testing "other POSTs, and every PUT/PATCH/DELETE, are writes"
    (are [m uri] (not (#'api-call/read-call? m uri))
      :post   "/api/card"
      :post   "/api/card/1/copy"
      :post   "/api/dashboard/1/dashcard/2/execute"
      :put    "/api/card/1"
      :delete "/api/dashboard/1")))

(deftest ^:parallel entity-change-test
  (testing "a copy is a creation: the new entity's id, name, and type come from the response"
    (is (= {:verb :created :link-type "model" :id 2 :name "Copy of Orders"}
           (#'api-call/entity-change :post {:entity "card" :path-id 1 :sub "/copy" :before {:name "Orders" :type :model}}
                                     {} {:id 2 :name "Copy of Orders" :type "model"}))))
  (testing "a write below a direct sub-resource (running a dashcard action) isn't a change to the entity"
    (is (nil? (#'api-call/entity-change :post {:entity "dashboard" :path-id 1 :sub "/dashcard/2/execute"
                                               :before {:name "Sales"}}
                                        {} {})))))

(deftest call-api-created-entity-summary-test
  (testing "creating a card hands the model its link ahead of the body and labels the step with it"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-test-user :crowberto
        (doseq [card-type ["question" "model"]]
          (testing card-type
            (let [card-name (str "Megabot " card-type)
                  result    (call {:method "POST"
                                   :path   "/api/card"
                                   :body   {:name                   card-name
                                            :type                   card-type
                                            :display                "table"
                                            :visualization_settings {}
                                            :dataset_query          (mt/native-query {:query "SELECT 1 AS one"})}})
                  id        (get-in result [:structured-output :entity :id])
                  link      (str "[" card-name "](metabase://" card-type "/" id ")")]
              (is (pos-int? id))
              (is (= {:verb :created :link-type card-type :id id :name card-name}
                     (get-in result [:structured-output :entity])))
              (is (= (str "Created " card-type " " id " \"" card-name "\". Link it as " link ".")
                     (summary-line (:output result))))
              (is (= (str "Created " link) (title result))))))))))

(deftest call-api-changed-entity-summary-test
  (mt/with-test-user :crowberto
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Megabot sales"}]
      (let [path (str "/api/dashboard/" dash-id)
            link (str "[Megabot sales](metabase://dashboard/" dash-id ")")]
        (testing "an update is labeled with the entity's link"
          (let [result (call {:method "PUT" :path path :body {:description "Weekly"}})]
            (is (= (str "Updated dashboard " dash-id " \"Megabot sales\". Link it as " link ".")
                   (summary-line (:output result))))
            (is (= (str "Updated " link) (title result)))))
        (testing "a write to a sub-resource updates its parent, named from the app db"
          (is (= (str "Updated " link) (title (call {:method "PUT" :path (str path "/cards") :body {:cards []}})))))
        (testing "archiving moves it to the trash, and unarchiving restores it"
          (is (= (str "Moved " link " to trash") (title (call {:method "PUT" :path path :body {:archived true}}))))
          (is (= (str "Restored " link) (title (call {:method "PUT" :path path :body {:archived false}})))))
        (testing "a failed write says so and names what it touched"
          (let [result (call {:method "PUT" :path path :body {:name ""}})]
            (is (re-find #"^HTTP 4\d\d" (:output result)))
            (is (nil? (get-in result [:structured-output :entity])))
            (is (= (str "Couldn't change " link) (title result)))))
        (testing "a failed write below a direct sub-resource doesn't claim the dashboard itself couldn't change"
          (is (= "A change failed" (title (call {:method "POST" :path (str path "/dashcard/999999/execute") :body {}})))))
        (testing "a delete names the entity as it was before the call, with no link to a page that is gone"
          (let [result (call {:method "DELETE" :path path})]
            (is (= (str "Deleted dashboard " dash-id " \"Megabot sales\".") (summary-line (:output result))))
            (is (= "Deleted Megabot sales" (title result)))))))))

(deftest call-api-other-write-summary-test
  (mt/with-temporary-setting-values [site-name "Metabase Test"]
    (let [rename {:method "PUT" :path "/api/setting/site-name" :body {:value "Megabot Inc"}}]
      (testing "a write that isn't to a card, dashboard, collection, or document is labeled with the model's summary"
        (mt/with-test-user :crowberto
          (let [result (call (assoc rename :summary "Renamed the instance"))]
            (is (str/starts-with? (:output result) "HTTP 20"))
            (is (nil? (get-in result [:structured-output :entity])))
            (is (= "Renamed the instance" (title result))))
          (testing "or a generic label without one"
            (is (= "Made a change" (title (call rename)))))))
      (testing "a failed write says so"
        (mt/with-test-user :rasta
          (is (= "Failed: Renamed the instance" (title (call (assoc rename :summary "Renamed the instance")))))
          (is (= "A change failed" (title (call rename)))))))))

(deftest call-api-output-lead-test
  (testing "what a write did comes before the first blank line, the lead that history compaction keeps"
    (mt/with-model-cleanup [:model/Collection :model/PermissionsGroup]
      (mt/with-test-user :crowberto
        (testing "a created collection: the status and the change line with its link"
          (let [{:keys [output]} (call {:method "POST" :path "/api/collection" :body {:name "Megabot lead"}})
                [lead body]      (str/split output #"\n\n" 2)
                [status change]  (str/split-lines lead)]
            (is (re-matches #"HTTP 20\d" status))
            (is (re-matches
                 #"Created collection \d+ \"Megabot lead\"\. Link it as \[Megabot lead\]\(metabase://collection/\d+\)\."
                 change))
            (is (= 2 (count (str/split-lines lead))))
            (is (str/starts-with? body "{"))))
        (testing "a created group, which has no link, carries its new id instead"
          (let [{:keys [output]} (call {:method "POST"
                                        :path   "/api/permissions/group"
                                        :body   {:name "Megabot lead group"}})
                [lead body]      (str/split output #"\n\n" 2)
                group-id         (:id (t2/select-one :model/PermissionsGroup :name "Megabot lead group"))]
            (is (pos-int? group-id))
            (is (re-matches #"HTTP 20\d\nResponse id: \d+\." lead))
            (is (str/includes? lead (str "Response id: " group-id ".")))
            (is (str/starts-with? body "{"))))))))

(deftest call-api-read-summary-test
  (testing "reads — GETs and query POSTs — get no summary line and no step title"
    (mt/with-test-user :crowberto
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/native-query {:query "SELECT 1 AS one"})}]
        (doseq [[method path] [["GET" (str "/api/card/" card-id)]
                               ["POST" (str "/api/card/" card-id "/query")]]]
          (testing (str method " " path)
            (let [result (call {:method method :path path :summary "ignored"})]
              (is (re-find #"^HTTP 20\d\n\n\{" (:output result))
                  "the status alone, then the body after a blank line")
              (is (nil? (:data-parts result)))
              (is (nil? (get-in result [:structured-output :entity]))))))))))

;;; ---------------------------------- list_api_endpoints / describe ----------------------------------

(deftest list-api-endpoints-test
  (testing "no args returns a paged index"
    (let [{:keys [output]} (api-call/list-api-endpoints-tool {})]
      (is (str/includes? output "Matched"))
      (is (str/includes? output "/api/"))))
  (testing "search narrows the results"
    (let [{:keys [output]} (api-call/list-api-endpoints-tool {:search "collection"})]
      (is (str/includes? (u/lower-case-en output) "collection"))))
  (testing "method filter narrows to one verb"
    (let [{:keys [output]} (api-call/list-api-endpoints-tool {:method "POST" :search "collection"})]
      (is (str/includes? output "POST"))
      (is (not (str/includes? output "\nGET ")))))
  (testing "paging is honored"
    (let [{:keys [output]} (api-call/list-api-endpoints-tool {:page 2 :page_size 5})]
      (is (str/includes? output "Page 2/")))))

(defn- describe [args]
  (:output (api-call/describe-api-endpoint-tool args)))

(deftest ^:parallel describe-api-endpoint-test
  (testing "returns a compact signature for a known endpoint"
    (let [output (describe {:path "/api/collection" :method "POST"})]
      (is (str/starts-with? output "POST /api/collection\n"))
      (is (str/includes? output "\nBody: object\n  name*: string\n"))))
  (testing "without a method, every verb on the path is described"
    (let [output (describe {:path "/api/collection/{id}"})]
      (doseq [verb ["GET" "PUT" "DELETE"]]
        (is (str/includes? output (str verb " /api/collection/{id}\n"))))
      (is (str/includes? output "Path params:\n  id*: integer"))))
  (testing "a templated id path resolves via both {id} and :id forms"
    (doseq [p ["/api/collection/{id}" "/api/collection/:id"]]
      (is (not (str/includes? (describe {:path p}) "No endpoint found")) (str "path variant: " p))))
  (testing "an unknown path returns a friendly message"
    (is (str/includes? (describe {:path "/api/definitely-not-real"}) "No endpoint found")))
  (testing "neither path nor schema asks for one"
    (is (str/includes? (describe {}) "Pass the endpoint's `path`"))))

(def ^:private big-endpoints
  "Endpoints whose raw OpenAPI description, with the schemas it references inlined, ran to 75-90K characters."
  [["POST" "/api/card"]
   ["PUT" "/api/card/{id}"]
   ["POST" "/api/dataset"]
   ["POST" "/api/notification"]])

(deftest ^:parallel describe-api-endpoint-size-test
  (doseq [[method path] big-endpoints]
    (testing (str method " " path " fits the description budget")
      (is (<= (count (describe {:path path :method method})) 5000)))))

(deftest ^:parallel describe-api-endpoint-fields-test
  (testing "required body fields and enum values are listed"
    (let [output (describe {:path "/api/card" :method "POST"})]
      (doseq [field ["dataset_query*" "display*: string" "name*: string" "visualization_settings*: object"]]
        (is (str/includes? output (str "\n  " field)) field))
      (is (str/includes? output "\n  type: \"question\" | \"metric\" | \"model\" | null\n"))
      (is (str/includes? output "\n  collection_id: integer | string | null\n"))
      (testing "and a referenced object one level down"
        (is (str/includes? output "\n  size: object | null\n    size_x*: integer\n    size_y*: integer\n")))))
  (testing "path and query params are listed"
    (let [output (describe {:path "/api/card/{id}" :method "PUT"})]
      (is (str/includes? output "Path params:\n  id*: integer\n"))
      (is (str/includes? output "Query params:\n  delete_old_dashcards: boolean | null\n"))))
  (testing "a union of object shapes lists the shared fields once, then each shape's own"
    (let [body (first (str/split (describe {:path "/api/notification" :method "POST"}) #"\nResponse"))]
      (is (str/includes? body "\nBody: object (2 shapes)\n"))
      (is (= 1 (count (re-seq #"\n  payload_type\*: \"" body))))
      (is (= 2 (count (re-seq #"\n  shape \d also has:\n" body))))
      (is (= 2 (count (re-seq #"\n    payload\*?: " body))))))
  (testing "a response shows only its top-level fields"
    (let [output (describe {:path "/api/dataset" :method "POST"})]
      (is (str/includes? output "\nResponse: object\n  row_count*: integer\n  status*: \"completed\" | \"failed\"\n"))
      (is (re-find #"\n  data: <[^>]+>\n" output)))))

(deftest ^:parallel describe-api-endpoint-query-test
  (doseq [[method path body-line] [["POST" "/api/card" "\n  dataset_query*: a query (see the note below)\n"]
                                   ["PUT" "/api/card/{id}" "\n  dataset_query: a query (see the note below)\n"]
                                   ["POST" "/api/dataset" "\nBody: a query (see the note below)\n"]]]
    (testing (str "a query isn't expanded in " method " " path ", and the note says how to get one")
      (let [output (describe {:path path :method method})]
        (is (str/includes? output body-line))
        (is (str/includes? output "`dataset_query` from `GET /api/card/:id`"))
        (is (str/includes? output "save_result"))
        (is (not (str/includes? output "run_warehouse_query")))
        (is (not (str/includes? output "stages"))))))
  (testing "a query schema asked for by name isn't expanded either"
    (let [output (describe {:schema "metabase.lib.schema.query"})]
      (is (str/includes? output "is a query"))
      (is (str/includes? output "save_result")))))

(deftest ^:parallel describe-api-endpoint-schema-test
  (testing "`schema` expands a named component schema in the same compact form"
    (let [schema-name "metabase.notification.models.CreateNotificationRecipientParams"
          output      (describe {:schema schema-name})]
      (is (str/starts-with? output (str "Schema " schema-name "\n")))
      (is (str/includes? output "\nType: object (4 shapes)\n"))
      (is (str/includes? output "\n  type*: \"notification-recipient/raw-value\" | \"notification-recipient/user\""))
      (testing "a schema can be named by its last segment, or as shown in angle brackets"
        (is (= output (describe {:schema "CreateNotificationRecipientParams"})))
        (is (= output (describe {:schema (str "<" schema-name ">")}))))))
  (testing "`schema` takes precedence over `path`"
    (is (str/starts-with? (describe {:path "/api/card" :schema "metabase.lib.schema.parameter.type"})
                          "Schema metabase.lib.schema.parameter.type\n")))
  (testing "every schema an endpoint lists by name can be expanded"
    (doseq [[method path] big-endpoints
            schema-name   (distinct (map second (re-seq #"<([^>\s]+)>" (describe {:path path :method method}))))
            :when         (not= schema-name "name")]
      (testing (str method " " path " → " schema-name)
        (let [output (describe {:schema schema-name})]
          (is (str/starts-with? output (str "Schema " schema-name "\n")))
          (is (<= (count output) 10000))))))
  (testing "an unknown schema says so"
    (is (str/starts-with? (describe {:schema "NotificationRecipient-typo"})
                          "No schema named NotificationRecipient-typo.")))
  (testing "a name that matches no schema exactly lists the schemas whose names contain it"
    (let [output (describe {:schema "notificationrecipient"})]
      (is (str/includes? output "Schemas with similar names:"))
      (is (str/includes? output "metabase.notification.models.NotificationRecipient"))))
  (testing "a last segment several schemas share lists those schemas"
    (let [output (describe {:schema "orphaned-query"})]
      (is (str/starts-with? output "Schema metabase.transforms.schema.orphaned-query")))
    (let [output (describe {:schema "query"})]
      (is (str/starts-with? output "Several schemas are named query. Pass one's full name:\n"))
      (is (not (str/includes? output "query-definition"))))))

(deftest ^:parallel describe-api-endpoint-everything-test
  (testing "every endpoint and every component schema describes without error"
    (let [spec @@#'api-call/full-spec]
      (doseq [[path ops] (:paths spec)
              [m _]      ops
              :let       [method (u/upper-case-en (name m))]]
        (let [output (describe {:path path :method method})]
          (is (str/starts-with? output (str method " " path "\n")) (str method " " path))))
      (doseq [schema-name (keys (get-in spec [:components :schemas]))
              :let        [schema-name (name schema-name)]]
        (let [output (describe {:schema schema-name})]
          (is (or (str/starts-with? output (str "Schema " schema-name "\n"))
                  (str/includes? output "is a query"))
              schema-name))))))
