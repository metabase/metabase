(ns metabase-enterprise.search.entity-retrieval.logging-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.search.entity-retrieval.core :as ee]
   [metabase-enterprise.search.entity-retrieval.index-table :as index-table]
   [metabase-enterprise.search.entity-retrieval.reconcile :as reconcile]
   [metabase-enterprise.search.semantic.db.datasource :as datasource]
   [metabase-enterprise.search.semantic.embedding :as embedding]
   [metabase-enterprise.search.semantic.test-util :as semantic.tu]
   [metabase.api-scope.core :as api-scope]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools :as tools]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]))

(set! *warn-on-reflection* true)

(deftest database-failure-retains-operator-diagnostics-test
  (let [failure (java.sql.SQLException. "Connection lost" "08006")
        entries (binding [scope/*current-user-scope* api-scope/unrestricted]
                  (tools/->entries [#'tools/retrieve-library-entities-tool] (atom {}) nil :nlq))]
    (mt/with-premium-features #{:library-retrieval}
      (mt/with-dynamic-fn-redefs
        [ee/available? (constantly true)
         datasource/ensure-initialized-data-source! (constantly ::ds)
         embedding/get-configured-model (constantly semantic.tu/mock-embedding-model)
         reconcile/with-index-read-lock (fn [_ f] (f ::connection))
         index-table/index-status (constantly :compatible)
         embedding/get-embedding (constantly [0.0 0.0 0.0 0.0])
         jdbc/execute! (fn [& _] (throw failure))]
        (mt/with-log-messages-for-level [messages ["metabase" :debug]]
          (let [outcome ((:fn (get entries "retrieve_library_entities")) {:user_search_prompt "revenue"})
                recorded (messages)]
            (is (= {:output (str "Library search is unavailable.\n"
                                 "Don't retry this call. Tell the user library search is unavailable.")
                    :error {:class :recoverable
                            :code :metabase.metabot.tools.entity-retrieval/library-search-unavailable}}
                   outcome))
            (is (some (fn [{:keys [e level]}]
                        (and (#{:error :warn} level)
                             (some #(identical? failure %) (take-while some? (iterate ex-cause e)))))
                      recorded)
                "The database exception must remain in operator logs while the model gets fixed text.")))))))
