(ns metabase.agent-api.lint-test
  "The app-DB ban on tool code is a guardrail, and a guardrail nobody has driven into is a guardrail nobody
   knows the shape of. These tests lint a synthetic namespace and assert the linter actually refuses what the
   ban says it refuses — and, just as importantly, that it still allows what it must."
  (:require
   [clj-kondo.core :as kondo]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all])
  (:import
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(defn- findings!
  "The clj-kondo findings for a source file whose namespace is `ns-sym`, linted under the repo's own config."
  [ns-sym requires body]
  (let [dir  (str (Files/createTempDirectory "agent-api-lint" (into-array FileAttribute [])))
        file (io/file dir (str (str/replace (name ns-sym) #"[.-]" "_") ".clj"))]
    (spit file (str "(ns " ns-sym "\n  (:require\n   " (str/join "\n   " requires) "))\n\n" body "\n"))
    (try
      (:findings (kondo/run! {:lint       [(str file)]
                              :config-dir ".clj-kondo"
                              :parallel   false}))
      (finally
        (io/delete-file file true)
        (io/delete-file dir true)))))

(defn- app-db-findings!
  [ns-sym requires body]
  (filter #(#{:discouraged-namespace :discouraged-var} (:type %))
          (findings! ns-sym requires body)))

(deftest a-v2-tool-namespace-may-not-reach-the-app-db-test
  (testing "the v2 tools are the namespaces the ban exists for: a Toucan call in one is caught"
    (let [caught (app-db-findings! 'metabase.agent-api.api
                                  ["[toucan2.core :as t2]"]
                                  "(defn- cards [] (t2/select :model/Card))")]
      (is (= 1 (count caught)))
      (is (re-find #"Tool code must not reach the app DB" (:message (first caught))))))
  (testing "and so is a reach for the app DB behind Toucan — the ban is on the namespace, not on a list of
            its vars, so a var nobody thought to enumerate is banned too"
    (let [caught (app-db-findings! 'metabase.agent-api.api
                                  ["[metabase.app-db.core :as app-db]"]
                                  "(defn- upsert! [] (app-db/update-or-insert! :model/Card {:id 1} identity))")]
      (is (= 1 (count caught)))
      (is (re-find #"Tool code must not reach the app DB" (:message (first caught)))))))

(deftest every-v2-tool-namespace-is-covered-test
  (testing "each v2 tool namespace is inside the ban, not just the one the endpoints happen to live in"
    (doseq [ns-sym '[metabase.agent-api.api
                     metabase.agent-api.tools
                     metabase.agent-api.search
                     metabase.agent-api.browse-data
                     metabase.agent-api.browse-collection
                     metabase.agent-api.get-content
                     metabase.agent-api.execute-query
                     metabase.agent-api.parameter-values
                     metabase.mcp.tools
                     metabase-enterprise.mcp.init]]
      (testing ns-sym
        (is (= 1 (count (app-db-findings! ns-sym
                                         ["[toucan2.core :as t2]"]
                                         "(defn- cards [] (t2/select :model/Card))"))))))))

(deftest the-server-s-own-storage-is-not-tool-code-test
  (testing "a namespace whose rows are the server's own has no user permission to inherit, so it is outside
            the ban rather than exempted from it"
    (doseq [ns-sym '[metabase.agent-api.handles
                     metabase.agent-api.auth
                     metabase.agent-api.models.mcp-query-handle
                     metabase.mcp.session
                     metabase.mcp.models.mcp-session-log
                     metabase-enterprise.mcp.usage]]
      (testing ns-sym
        (is (empty? (app-db-findings! ns-sym
                                     ["[toucan2.core :as t2]"]
                                     "(defn- rows [] (t2/select :model/Card))")))))))

(deftest the-v1-tools-carry-the-only-exemption-test
  (testing "the v1 tools assemble dashcards and patch cards through Toucan, and the exemption reaches them
            and nothing else"
    (doseq [ns-sym '[metabase.agent-api.v1-api metabase.agent-api.v1-dashcards]]
      (testing ns-sym
        (is (empty? (app-db-findings! ns-sym
                                     ["[toucan2.core :as t2]"]
                                     "(defn- cards [] (t2/select :model/Card))")))))
    (testing "and even there the app DB itself stays out of reach"
      (is (= 1 (count (app-db-findings! 'metabase.agent-api.v1-api
                                       ["[metabase.app-db.core :as app-db]"]
                                       "(defn- q [] (app-db/query {:select [1]}))")))))))
