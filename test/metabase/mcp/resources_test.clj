(ns metabase.mcp.resources-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]
   [metabase.mcp.resources :as mcp.resources]))

(set! *warn-on-reflection* true)

(def ^:private private-uri "test://mcp/resources-test/private")
(def ^:private public-uri  "test://mcp/resources-test/public")

;; The registry is process-wide state; the fixture snapshots and restores it around each test.
;; Safe because none of the tests below are marked ^:parallel.
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :each
  (fn [thunk]
    (let [registry @#'mcp.resources/registry
          snapshot @registry]
      (try
        (mcp.resources/register-resource!
         {:uri         public-uri
          :name        "Public Doc"
          :description "Anyone authenticated can read this."
          :mimeType    "text/plain"
          :render-fn   (constantly "public body")})
        (mcp.resources/register-resource!
         {:uri         private-uri
          :name        "Private Doc"
          :description "Requires the agent:search scope."
          :scope       "agent:search"
          :mimeType    "text/plain"
          :render-fn   (constantly "private body")})
        (thunk)
        (finally
          (reset! registry snapshot))))))

(deftest list-resources-public-and-scoped-test
  (testing "scopeless resources are listed for any caller, including empty scopes"
    (let [uris (set (map :uri (:resources (mcp.resources/list-resources #{}))))]
      (is (contains? uris public-uri))
      (is (not (contains? uris private-uri)))))
  (testing "scoped resources are listed only when the token-scopes match"
    (let [uris (set (map :uri (:resources (mcp.resources/list-resources #{"agent:search"}))))]
      (is (contains? uris public-uri))
      (is (contains? uris private-uri))))
  (testing "::scope/unrestricted token-scopes always match"
    (let [uris (set (map :uri (:resources (mcp.resources/list-resources #{::scope/unrestricted}))))]
      (is (contains? uris public-uri))
      (is (contains? uris private-uri)))))

(deftest check-resource-access-test
  (testing "scopeless resources are accessible to any caller"
    (is (= :ok (mcp.resources/check-resource-access public-uri #{}))))
  (testing "scoped resources require the matching scope"
    (is (= :scope-denied (mcp.resources/check-resource-access private-uri #{"agent:other"})))
    (is (= :ok           (mcp.resources/check-resource-access private-uri #{"agent:search"})))
    (is (= :ok           (mcp.resources/check-resource-access private-uri #{"agent:*"}))))
  (testing "unknown URIs return :not-found"
    (is (= :not-found (mcp.resources/check-resource-access "test://nope" #{::scope/unrestricted})))))

(deftest read-resource-test
  (testing "read-resource returns the rendered text under the contents key"
    (is (=? {:contents [{:uri      public-uri
                         :mimeType "text/plain"
                         :text     "public body"}]}
            (mcp.resources/read-resource public-uri {}))))
  (testing "read-resource returns nil for unknown URIs"
    (is (nil? (mcp.resources/read-resource "test://nope" {}))))
  (testing "read-resource does not enforce scope — callers must gate via check-resource-access"
    (is (some? (mcp.resources/read-resource private-uri {}))
        "scope-protected resource is rendered when called directly; gating is the caller's job")))

(deftest builtin-construct-query-resource-test
  (testing "the construct-query reference is registered as a public markdown resource"
    (is (=? {:uri      "metabase://docs/construct-query.md"
             :mimeType "text/markdown"
             :name     "Construct Query Reference"}
            (some #(when (= "metabase://docs/construct-query.md" (:uri %)) %)
                  (:resources (mcp.resources/list-resources #{})))))))
