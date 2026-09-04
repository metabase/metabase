(ns metabase.mcp.v2.common-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.urls :as channel.urls]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.projections :as projections]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest ^:parallel teaching-error-test
  (testing "teaching errors surface their message as MCP error content"
    (let [content (try
                    (common/throw-teaching-error "Use `fields` OR `response_format`, not both.")
                    (catch clojure.lang.ExceptionInfo e
                      (common/->mcp-error-content e)))]
      (is (:isError content))
      (is (= "Use `fields` OR `response_format`, not both."
             (-> content :content first :text))))))

(deftest ^:parallel error-redaction-test
  (let [text #(-> % :content first :text)]
    (testing "GHY-4137: only deliberately caller-facing errors surface their message — client
              (4xx) status codes or an explicit ::error-code"
      (doseq [[label e expected] [["teaching 400"  (ex-info "Use fields OR response_format." {:status-code 400})       "Use fields OR response_format."]
                                  ["not-found 404" (ex-info "card 7 not found." {:status-code 404})                    "card 7 not found."]
                                  ["scope 403"     (ex-info "Insufficient scope." {:status-code 403
                                                                                   ::common/error-code common/error-code-invalid-request}) "Insufficient scope."]]]
        (testing label
          (is (= expected (text (common/->mcp-error-content e)))))))
    (testing "GHY-4137: 402 (missing premium feature) and 409 (conflict) are deliberate
              caller-facing errors too — a premium-feature check names the missing feature, a
              conflict names the clashing state, and neither may be redacted to a generic error"
      (doseq [[label e expected]
              [["premium-feature 402" (ex-info "Transforms is a paid feature not available on this instance."
                                               {:status-code 402}) "Transforms is a paid feature not available on this instance."]
               ["conflict 409"        (ex-info "A snippet named \"totals\" already exists in this collection."
                                               {:status-code 409}) "A snippet named \"totals\" already exists in this collection."]]]
        (testing label
          (is (= expected (text (common/->mcp-error-content e)))))))
    (testing "internal failures are redacted to a generic message — their real text may embed SQL,
              schema, or connection detail and must never reach the client"
      (doseq [[label e] [["projection 500 invariant" (ex-info "No projection registered for type: widget" {:status-code 500})]
                         ["ex-info with no status-code (library wrap)" (ex-info "Error executing query: SELECT * FROM secret_accounts" {:query {}})]
                         ["JDBC SQLException" (java.sql.SQLException. "ERROR: relation \"secret_accounts\" does not exist")]
                         ["NPE naming an internal class" (NullPointerException. "metabase.driver.internal.Foo is null")]]]
        (testing label
          (let [content (common/->mcp-error-content e)]
            (is (:isError content))
            (is (= "Internal error" (text content)))
            (is (= common/error-code-internal (::common/error-code content))
                "internal errors carry the internal JSON-RPC code")))))
    (testing "an explicit internal ::error-code never surfaces its message even on an ex-info"
      (is (= "Internal error"
             (text (common/->mcp-error-content
                    (ex-info "leaky internal detail" {::common/error-code common/error-code-internal}))))))))

(deftest ^:parallel success-content-test
  (testing "read responses default to text-only"
    (is (= {:content [{:type "text" :text "hi"}]} (common/success-content "hi"))))
  (testing "structuredContent is emitted only when explicitly passed"
    (is (= {:ok true} (:structuredContent (common/success-content "hi" {:ok true}))))))

(deftest ^:parallel projections-test
  (let [row {:id 5 :name "Fin" :description "d" :location "/" :archived false
             :personal_owner_id nil :entity_id "eid" :slug "fin" :created_at "t"}]
    (testing "concise is a subset of the REST response with the same property names"
      (is (= {:id 5 :name "Fin" :description "d" :location "/" :archived false}
             (projections/project :collection :concise row))))
    (testing "the catalog is generated from the detailed projection shape"
      (is (contains? (set (projections/catalog :collection)) "name"))
      (is (contains? (set (projections/catalog :question)) "parameters.name")))))

(deftest ^:parallel projection-bad-argument-test
  (testing "an unregistered type throws an ex-info naming the type"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"No projection registered for type: nope"
                          (projections/project :nope :concise {:id 1}))))
  (testing "a format outside :concise/:detailed throws the same shape of ex-info rather than a nil-call NPE"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Unknown projection format: :summary"
                          (projections/project :collection :summary {:id 1})))
    (is (= {:status-code 500 :type :collection :fmt :summary}
           (try
             (projections/project :collection :summary {:id 1})
             (catch clojure.lang.ExceptionInfo e (ex-data e)))))))

(deftest frontend-url-test
  (testing "a configured site URL is prefixed onto the relative path"
    (mt/with-dynamic-fn-redefs [channel.urls/site-url (constantly "http://metabase.example.com")]
      (is (= "http://metabase.example.com/collection/42"
             (common/frontend-url (channel.urls/collection-path 42))))))
  (testing "an unset site URL yields a relative path, never the literal \"null\" host that
            interpolating site-url directly would produce — site-url is nil both when it has
            never been configured and when the stored value fails validation"
    (doseq [unset [nil ""]]
      (mt/with-dynamic-fn-redefs [channel.urls/site-url (constantly unset)]
        (is (= "/collection/42" (common/frontend-url (channel.urls/collection-path 42))))
        (is (= "/question/42" (common/frontend-url (channel.urls/card-path 42))))))))

(deftest response-format-test
  (testing "response_format parses to :concise (default) or :detailed"
    (is (= :concise (common/response-format {})))
    (is (= :concise (common/response-format {:response_format "concise"})))
    (is (= :detailed (common/response-format {:response_format "detailed"}))))
  (testing "an unrecognized response_format is a teaching error naming the valid values"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"concise.*detailed"
                          (common/response-format {:response_format "verbose"})))))

;; A projection whose catalog deliberately includes a field (`collection`) that is a string prefix
;; of a sibling (`collection_path`) — the exact shape that a prefix match without a `.` boundary
;; check would confuse. `parameters` is nested so subtree selection and order-absorption can be
;; exercised.
(def ^:private test-catalog
  ["name" "collection" "collection_path" "parameters.name" "parameters.type"])

(defn- register-fields-test-type! []
  (projections/register-projection!
   :fields-test
   {:concise  identity
    :detailed identity
    :catalog  test-catalog}))

(deftest select-fields-test
  (register-fields-test-type!)
  (let [row {:name       "Q1"
             :collection "Root"
             :collection_path "Root/Sub"
             :parameters [{:name "cat" :type "category" :extra "drop-me"}]
             :secret     "never-selected"}]
    (testing "an exact scalar path selects just that field"
      (is (= {:name "Q1"} (common/select-fields :fields-test row ["name"]))))
    (testing "a field that is a string prefix of a sibling does NOT drag the sibling in"
      ;; the prefix-boundary bug: `collection` must not match `collection_path`
      (is (= {:collection "Root"} (common/select-fields :fields-test row ["collection"]))))
    (testing "the longer sibling is selectable on its own"
      (is (= {:collection_path "Root/Sub"} (common/select-fields :fields-test row ["collection_path"]))))
    (testing "a bare nested prefix selects the whole subtree"
      (is (= {:parameters [{:name "cat" :type "category" :extra "drop-me"}]}
             (common/select-fields :fields-test row ["parameters"]))))
    (testing "a leaf under a nested path selects only that leaf, per array item"
      (is (= {:parameters [{:name "cat"}]}
             (common/select-fields :fields-test row ["parameters.name"]))))
    (testing "subtree absorption is order-independent: a bare prefix wins regardless of order"
      (is (= {:parameters [{:name "cat" :type "category" :extra "drop-me"}]}
             (common/select-fields :fields-test row ["parameters" "parameters.name"])))
      (is (= {:parameters [{:name "cat" :type "category" :extra "drop-me"}]}
             (common/select-fields :fields-test row ["parameters.name" "parameters"]))))
    (testing "several paths in one call merge into one selection tree"
      ;; the ordinary `fields: ["name","parameters.type"]` shape: distinct top-level keys must
      ;; both survive the merge, not just two paths down one branch
      (is (= {:name "Q1" :parameters [{:type "category"}]}
             (common/select-fields :fields-test row ["name" "parameters.type"]))))
    (testing "an unknown path is a teaching error naming the nearest valid paths, ranked by edit
              distance — the suggestion is only useful if the closest catalog entry leads"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Unknown field path \"nmae\".*Nearest valid paths: name, collection"
                            (common/select-fields :fields-test row ["nmae"]))))
    (testing "empty fields is a teaching error"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"at least one path"
                            (common/select-fields :fields-test row []))))
    (testing "fields is mutually exclusive with response_format / include"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"OR"
                            (common/select-fields :fields-test row ["name"] {:response-format :detailed})))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"OR"
                            (common/select-fields :fields-test row ["name"] {:include ["x"]}))))
    (testing "fields on a type with no catalog is a teaching error"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not supported for type"
                            (common/select-fields :no-such-type row ["name"]))))))

(deftest ^:parallel truncation-line-test
  (testing "a narrowing param is named alongside the next offset — a list the caller can filter
            should steer to the filter first, since paging a broad list is the expensive path"
    (is (= "Returned 2 of 5 — narrow with `query`, or continue with `offset: 2`."
           (common/truncation-line {:param :query :offset 0 :limit 2 :total 5 :returned 2}))))
  (testing "a floored total reads as a lower bound — a search total capped at the ranking limit is
            not an exact count, and reporting it as one would have the caller stop paging early"
    (is (= "Returned 2 of at least 9 — continue with `offset: 2`."
           (common/truncation-line {:offset 0 :limit 2 :total 9 :total-floor? true :returned 2}))))
  (testing "an untruncated page, or one whose total is unknown, has no line"
    (is (nil? (common/truncation-line {:offset 0 :limit 10 :total 5 :returned 5})))
    (is (nil? (common/truncation-line {:offset 0 :limit 10 :total nil :returned 5})))))

(deftest list-content-empty-page-test
  (testing "GHY-4137/P6: a page that returns nothing must say why. `truncation-line` only fires when
            (offset + limit) < total, so an offset at or past the end produced a bare
            {\"data\":[],\"returned\":0,\"total\":37} with no steering at all — which reads as
            \"nothing matches\" when the truth is \"you paged past the end\"."
    (testing "an offset past the end names the offset and the total"
      (let [text (-> (common/list-content [] 37 {:offset 100 :limit 20}) :content first :text)]
        (is (re-find #"No results at offset 100" text))
        (is (re-find #"37 available" text))
        (is (re-find #"`offset`" text) "it steers back rather than leaving the caller stuck")))
    (testing "a floored total stays a floor in the empty-page line"
      (let [text (-> (common/list-content [] 37 {:offset 100 :limit 20 :total-floor? true})
                     :content first :text)]
        (is (re-find #"at least 37 available" text))))
    (testing "an empty FIRST page — every match dropped after counting — says so instead of steering
              to an offset that would not help"
      (let [text (-> (common/list-content [] 3 {:offset 0 :limit 20}) :content first :text)]
        (is (re-find #"Returned 0 of 3" text))
        (is (not (re-find #"No results at offset" text)))))
    (testing "a genuinely empty result set gets no line — total 0 already says it"
      (let [text (-> (common/list-content [] 0 {:offset 0 :limit 20}) :content first :text)]
        (is (not (re-find #"No results" text)))
        (is (not (re-find #"Returned" text)))))
    (testing "an unknown total gets no line — there is nothing to report against"
      (let [text (-> (common/list-content [] nil {:offset 100 :limit 20}) :content first :text)]
        (is (not (re-find #"No results" text)))))
    (testing "a non-empty page is unaffected by the new branch"
      (let [text (-> (common/list-content [{:id 1} {:id 2}] 5 {:offset 0 :limit 2}) :content first :text)]
        (is (re-find #"Returned 2 of 5" text))
        (is (not (re-find #"No results" text)))))))

(def ^:private browse-empty-hint
  "The `:empty-hint` `list_databases` passes — quoted verbatim so this test moves in lockstep with
   the real call site."
  "No databases are visible to you. Browsing data needs query-builder or table-metadata permission on at least one database.")

(deftest list-content-empty-hint-test
  (testing "`:empty-hint` supplies the domain reason a result set is genuinely empty — the envelope
            says zero, the hint says why. Dropping the option is silent: `list-content` ignores
            unknown keys, so the sentence would just vanish from `list_databases`."
    (testing "guards the restack of the `:empty-hint` call site in tools/browse.clj `list_databases`:
              if a merge resolves `list-content` back to a version without `:empty-hint`, this fails"
      (let [text (-> (common/list-content [] 0 {:offset 0 :limit 20 :empty-hint browse-empty-hint})
                     :content first :text)]
        (is (re-find #"\"total\":0" text))
        (is (str/includes? text browse-empty-hint))))
    (testing "guards the restack of the `:empty-hint` call site in tools/browse.clj: the hint must
              stay gated on a zero total, never collapse into a bare `or`. At a positive total the
              caller paged past the end, and printing a static \"nothing is visible to you\" would
              state something false about data they do have"
      (let [text (-> (common/list-content [] 37 {:offset 100 :limit 20 :empty-hint browse-empty-hint})
                     :content first :text)]
        (is (re-find #"No results at offset 100" text))
        (is (not (str/includes? text browse-empty-hint)))))
    (testing "an empty first page with a positive total keeps the dropped-rows line too — that total
              is also not a genuinely empty result set"
      (let [text (-> (common/list-content [] 3 {:offset 0 :limit 20 :empty-hint browse-empty-hint})
                     :content first :text)]
        (is (re-find #"Returned 0 of 3" text))
        (is (not (str/includes? text browse-empty-hint)))))
    (testing "an unknown total is not a known-zero one, so the hint stays out"
      (let [text (-> (common/list-content [] nil {:offset 0 :limit 20 :empty-hint browse-empty-hint})
                     :content first :text)]
        (is (not (str/includes? text browse-empty-hint)))))
    (testing "a non-empty page ignores the hint entirely — a truncated page still gets its
              truncation line"
      (let [text (-> (common/list-content [{:id 1} {:id 2}] 5 {:offset 0 :limit 2 :empty-hint browse-empty-hint})
                     :content first :text)]
        (is (re-find #"Returned 2 of 5" text))
        (is (re-find #"offset: 2" text))
        (is (not (str/includes? text browse-empty-hint)))))))

(deftest list-content-test
  (testing "a full page (returned == total) appends no steering line"
    (let [content (common/list-content [{:id 1} {:id 2}] 2 {:offset 0 :limit 10})
          text    (-> content :content first :text)]
      (is (not (re-find #"Returned" text)))
      (is (re-find #"\"returned\":2" text))))
  (testing "a truncated page appends the steering line with the next offset"
    (let [content (common/list-content [{:id 1} {:id 2}] 5 {:offset 0 :limit 2})
          text    (-> content :content first :text)]
      (is (re-find #"Returned 2 of 5" text))
      (is (re-find #"offset: 2" text))))
  (testing "GHY-4137: a page shorter than limit/total/offset predict (a post-fetch drop — e.g. a
            stale index hit) reports the steering line's count from the real page, matching the
            envelope's :returned rather than contradicting it"
    (let [content (common/list-content [{:id 1} {:id 2} {:id 3}] 40 {:offset 0 :limit 10})
          text    (-> content :content first :text)]
      (is (re-find #"\"returned\":3" text) "the envelope reports the real page size")
      (is (re-find #"Returned 3 of 40" text)
          "the steering line's count matches the envelope, not the arithmetic min(limit, total-offset) = 10")
      (is (not (re-find #"Returned 10" text))
          "the arithmetic prediction must not appear anywhere in the text"))))
