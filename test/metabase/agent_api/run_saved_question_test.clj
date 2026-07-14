(ns metabase.agent-api.run-saved-question-test
  "The v2 `run_saved_question` tool: a saved card run as the caller, with values for the filters it declares,
   and an export that hands back a link rather than bytes."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.agent-api.exports :as exports]
   [metabase.mcp.tools :as mcp.tools]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayOutputStream)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- run-question!
  ([body] (run-question! :crowberto 200 body))
  ([user status body]
   (mt/user-http-request user :post status "agent/v2/run-saved-question" body)))

(defn- refusal
  "The message a refused call teaches with — a teaching error's body is the message itself."
  [response]
  (if (string? response) response (str (:message response))))

;;; ──────────────────────────────────────────────────────────────────
;;; The plain run
;;; ──────────────────────────────────────────────────────────────────

(deftest runs-a-saved-question-test
  (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues {:order-by [[:asc $id]]})}]
    (let [response (run-question! {:id (:id card)})]
      (testing "the rows come back in the dataset REST shape"
        (is (= 100 (:row_count response)))
        (is (= 100 (count (:rows response))))
        (is (contains? (set (map :name (:cols response))) "NAME")))
      (testing "and there is no handle: the card is the name of the query, and `id` is how a next page is asked for"
        (is (not (contains? response :query_handle)))))))

(deftest an-entity-id-names-the-card-too-test
  (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues)}]
    (is (pos? (:row_count (run-question! {:id (t2/select-one-fn :entity_id :model/Card (:id card))}))))))

(deftest a-card-the-caller-cannot-read-is-refused-test
  (mt/with-temp [:model/Collection coll {}
                 :model/Card       card {:collection_id (:id coll)
                                         :dataset_query (mt/mbql-query venues)}]
    (mt/with-non-admin-groups-no-collection-perms coll
      (is (= "You don't have permissions to do that."
             (refusal (run-question! :rasta 403 {:id (:id card)})))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Parameters — the gap v1 could not close
;;; ──────────────────────────────────────────────────────────────────

(defn- native-card
  "A native card with a `{{state}}` variable, which is the only kind of parameterized card v1 could even
   describe — and it 400'd on this one too."
  []
  {:dataset_query (mt/native-query
                   {:query         "SELECT count(*) AS C FROM PEOPLE WHERE STATE = {{state}}"
                    :template-tags {"state" {:id           "state-tag"
                                             :name         "state"
                                             :display-name "State"
                                             :type         :text}}})})

(defn- mbql-card-with-a-filter
  "An MBQL card that declares a category filter over a field. v1's `execute_question` refused this outright, and
   the card-query REST path still refuses a value for it: an MBQL card has no template tag to match by name."
  []
  {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})
   :parameters    [{:id     "cat-param"
                    :name   "Category"
                    :slug   "category"
                    :type   :number/=
                    :target [:dimension (mt/$ids venues $category_id)]}]})

(deftest a-native-cards-variable-takes-a-value-test
  (mt/with-temp [:model/Card card (native-card)]
    (testing "by id"
      (is (pos? (ffirst (:rows (run-question! {:id         (:id card)
                                               :parameters [{:id "state-tag" :value "CA"}]}))))))
    (testing "and by the slug a person sees"
      (is (= (:rows (run-question! {:id (:id card) :parameters [{:id "state-tag" :value "CA"}]}))
             (:rows (run-question! {:id (:id card) :parameters [{:slug "state" :value "CA"}]})))))
    (testing "and a different value is a different answer, so the value really reached the warehouse"
      (is (not= (:rows (run-question! {:id (:id card) :parameters [{:slug "state" :value "CA"}]}))
                (:rows (run-question! {:id (:id card) :parameters [{:slug "state" :value "TX"}]})))))))

(deftest an-mbql-cards-declared-filter-takes-a-value-test
  (testing "this is what v1 could not do: the card declares the parameter, so a value for it is accepted and
            filters the result"
    (mt/with-temp [:model/Card card (mbql-card-with-a-filter)]
      (let [unfiltered (ffirst (:rows (run-question! {:id (:id card)})))
            filtered   (ffirst (:rows (run-question! {:id         (:id card)
                                                      :parameters [{:slug  "category"
                                                                    :value 2}]})))]
        (is (pos? unfiltered))
        (is (pos? filtered))
        (is (< filtered unfiltered))))))

(deftest an-undeclared-parameter-is-refused-test
  (testing "the control still holds: a value may only set a filter the card declares, and the refusal names the
            ones it does"
    (mt/with-temp [:model/Card card (mbql-card-with-a-filter)]
      (let [message (refusal (run-question! :crowberto 400 {:id         (:id card)
                                                            :parameters [{:id "not-a-parameter" :value 1}]}))]
        (is (re-find #"no parameter with id `not-a-parameter`" message))
        (is (re-find #"`category`" message)))
      (testing "and so is an undeclared slug"
        (is (re-find #"no parameter with slug `nope`"
                     (refusal (run-question! :crowberto 400 {:id         (:id card)
                                                             :parameters [{:slug "nope" :value 1}]}))))))))

(deftest a-parameter-cannot-repoint-itself-at-another-column-test
  (testing "the column a value filters is read off the card's declaration, never off the call — so a request
            cannot aim a declared parameter at a column the card never declared"
    (mt/with-temp [:model/Card card (mbql-card-with-a-filter)]
      ;; `target` is not part of the wire schema; a strict client that sends one anyway must not be able to
      ;; steer the filter with it.
      (let [price-target ["dimension" ["field" (mt/id :venues :price) nil]]
            declared     (ffirst (:rows (run-question! {:id         (:id card)
                                                        :parameters [{:id "cat-param" :value 2}]})))
            smuggled     (ffirst (:rows (run-question! {:id         (:id card)
                                                        :parameters [{:id     "cat-param"
                                                                      :value  2
                                                                      :target price-target}]})))]
        (is (= declared smuggled))))))

(deftest a-parameter-with-neither-id-nor-slug-teaches-test
  (mt/with-temp [:model/Card card (mbql-card-with-a-filter)]
    (is (re-find #"needs an `id` or a `slug`"
                 (refusal (run-question! :crowberto 400 {:id (:id card) :parameters [{:value 1}]}))))
    (is (re-find #"not both"
                 (refusal (run-question! :crowberto 400 {:id         (:id card)
                                                         :parameters [{:id "cat-param" :slug "category" :value 1}]}))))))

(deftest a-parameterless-card-says-it-declares-none-test
  (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues)}]
    (is (re-find #"It declares no parameters at all"
                 (refusal (run-question! :crowberto 400 {:id (:id card) :parameters [{:slug "x" :value 1}]}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; row_limit and offset
;;; ──────────────────────────────────────────────────────────────────

(deftest row-limit-defaults-to-100-test
  (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues)}]
    (is (= 100 (:row_count (run-question! {:id (:id card)}))))))

(deftest offset-pages-through-an-mbql-card-test
  (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues {:order-by [[:asc $id]]})}]
    (let [page-1 (run-question! {:id (:id card) :row_limit 2})
          page-2 (run-question! {:id (:id card) :row_limit 2 :offset 2})]
      (testing "the first page steers to the next one"
        (is (true? (:truncated page-1)))
        (is (re-find #"offset: 2" (:truncation_message page-1))))
      (testing "and the next page is the next rows"
        (is (= [1 2] (mapv first (:rows page-1))))
        (is (= [3 4] (mapv first (:rows page-2))))))))

(deftest offset-pages-through-a-native-card-test
  (testing "a native card has no `:page` clause to re-window it, so it pages by re-reading — the strategy is a
            property of the query the card was saved with, not of the tool"
    (mt/with-temp [:model/Card card {:dataset_query (mt/native-query
                                                     {:query "SELECT ID FROM VENUES ORDER BY ID"})}]
      (is (= [[1] [2]] (:rows (run-question! {:id (:id card) :row_limit 2}))))
      (is (= [[3] [4]] (:rows (run-question! {:id (:id card) :row_limit 2 :offset 2})))))))

(deftest a-cards-own-limit-bounds-the-pages-test
  (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues {:order-by [[:asc $id]]
                                                                         :limit    3})}]
    (let [response (run-question! {:id (:id card)})]
      (is (= 3 (:row_count response)))
      (is (not (contains? response :truncated))))))

(deftest a-row-limit-is-capped-by-the-wire-schema-test
  (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues)}]
    (is (=? {:errors {:row_limit "nullable integer between 1 and 2000 inclusive"}}
            (run-question! :crowberto 400 {:id (:id card) :row_limit 2001})))))

;;; ──────────────────────────────────────────────────────────────────
;;; export
;;; ──────────────────────────────────────────────────────────────────

(defn- download
  "Fetch a `download_url` as `user`, returning the raw response."
  [user url status]
  (mt/user-http-request user :get status (str/replace url #"^.*/api/" "")))

(deftest export-returns-a-link-and-a-row-count-test
  (mt/with-temp [:model/Card card {:name          "Venues Export"
                                   :dataset_query (mt/mbql-query venues {:order-by [[:asc $id]]})}]
    (let [response (run-question! {:id (:id card) :export "csv"})]
      (testing "the response names the file and how many rows are in it, and carries none of them"
        (is (= 100 (:row_count response)))
        (is (not (contains? response :rows)))
        (is (re-find #"venues_export" (:filename response)))
        (is (str/ends-with? (:filename response) ".csv"))
        (is (some? (:expires_at response))))
      (testing "and the link downloads exactly those rows"
        (let [csv   (download :crowberto (:download_url response) 200)
              lines (str/split-lines (str csv))]
          ;; one header row, then the rows the tool counted
          (is (= 101 (count lines)))
          (is (str/includes? (first lines) "ID")))))))

(deftest export-bypasses-row-limit-test
  (testing "an export carries the whole result, where an inline read stops at the default 100 rows"
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query checkins)}]
      (is (= 100 (:row_count (run-question! {:id (:id card)}))))
      (is (< 100 (:row_count (run-question! {:id (:id card) :export "csv"})))))))

(deftest export-refuses-the-paging-arguments-test
  (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues)}]
    (is (re-find #"`row_limit` and `offset`"
                 (refusal (run-question! :crowberto 400 {:id (:id card) :export "csv" :row_limit 10}))))))

(deftest export-formats-test
  (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues {:limit 3})}]
    (doseq [[format content-type] [["csv"  #"text/csv"]
                                   ["json" #"application/json"]
                                   ["xlsx" #"spreadsheetml\.sheet"]]]
      (testing format
        (let [{:keys [download_url]} (run-question! {:id (:id card) :export format})
              stored                 (t2/select-one :model/McpExport
                                                    :id (last (str/split download_url #"/")))]
          (is (re-find content-type (:content_type stored)))
          (is (pos? (alength ^bytes (:content stored)))))))
    (testing "and a format nobody can open is refused by the wire schema"
      (is (=? {:errors {:export "nullable enum of csv, xlsx, json"}}
              (run-question! :crowberto 400 {:id (:id card) :export "parquet"}))))))

(deftest an-export-link-belongs-to-the-user-who-made-it-test
  (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues {:limit 1})}]
    (let [{:keys [download_url]} (run-question! {:id (:id card) :export "csv"})]
      (testing "another user cannot fetch it — the store is keyed by (user, uuid)"
        (is (= "Not found."
               (refusal (download :rasta download_url 404)))))
      (testing "and neither can a guessed id"
        (is (= "Not found."
               (refusal (mt/user-http-request :crowberto :get 404
                                              (str "agent/v2/export/" (random-uuid))))))))))

(deftest an-expired-export-link-stops-resolving-test
  (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues {:limit 1})}]
    (let [{:keys [download_url]} (run-question! {:id (:id card) :export "csv"})
          export-id              (last (str/split download_url #"/"))]
      (is (some? (download :crowberto download_url 200)))
      (testing "past its expiry the link stops resolving, whether or not the sweep has run yet"
        (t2/update! :model/McpExport export-id
                    {:expires_at (t/minus (t/offset-date-time) (t/hours 1))})
        (is (= "Not found." (refusal (download :crowberto download_url 404))))
        (testing "and the sweep deletes it"
          (is (pos? (exports/delete-expired-exports!)))
          (is (not (t2/exists? :model/McpExport :id export-id))))))))

(deftest an-export-carries-the-parameters-it-was-run-with-test
  (mt/with-temp [:model/Card card (native-card)]
    (let [ca (run-question! {:id (:id card) :export "csv" :parameters [{:slug "state" :value "CA"}]})
          tx (run-question! {:id (:id card) :export "csv" :parameters [{:slug "state" :value "TX"}]})]
      (is (not= (download :crowberto (:download_url ca) 200)
                (download :crowberto (:download_url tx) 200))))))

(deftest an-export-too-large-to-store-is-refused-rather-than-half-written-test
  (with-redefs [exports/max-bytes 64]
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues)}]
      (is (re-find #"larger than" (refusal (run-question! :crowberto 400 {:id (:id card) :export "csv"}))))
      (testing "and nothing was stored"
        (is (not (t2/exists? :model/McpExport :card_id (:id card))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; The tool, through MCP
;;; ──────────────────────────────────────────────────────────────────

(deftest the-tool-is-in-the-catalog-test
  (is (contains? (into #{} (map :name) (mcp.tools/list-tools nil)) "run_saved_question")))

(deftest the-rows-travel-once-test
  (testing "the page rides in the text block, and `structuredContent` carries only what a next call consumes"
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues {:limit 1})}]
      (let [result (mt/with-test-user :crowberto
                     (mcp.tools/call-tool nil "run_saved_question" {:id (:id card)}))
            body   (json/decode+kw (-> result :content first :text))]
        (is (= 1 (:row_count body)))
        (is (seq (:rows body)))
        (is (not (contains? (:structuredContent result) :rows)))
        (is (= 1 (:row_count (:structuredContent result))))))))

(deftest the-export-link-rides-the-structured-channel-test
  (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues {:limit 1})}]
    (let [result (mt/with-test-user :crowberto
                   (mcp.tools/call-tool nil "run_saved_question" {:id (:id card) :export "csv"}))]
      (is (re-find #"/api/agent/v2/export/"
                   (get-in result [:structuredContent :download_url]))))))

(deftest bounded-output-stream-refuses-past-its-limit-test
  (with-redefs [exports/max-bytes 4]
    (let [os (exports/bounded-output-stream (ByteArrayOutputStream.))]
      (.write os (byte-array 4))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"larger than"
                            (.write os (byte-array 1)))))))
