(ns metabase.mcp.v2.common-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.projections :as projections]
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
