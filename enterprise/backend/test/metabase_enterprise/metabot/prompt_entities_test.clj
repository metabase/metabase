(ns metabase-enterprise.metabot.prompt-entities-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot.prompt-entities :as prompt-entities]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.metabot.models.search-prompt-entity]
   [metabase.metabot.tools.search-prompt-entities :as tools.spe]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]))

(set! *warn-on-reflection* true)

(defn- approx [target] #(< (abs (- (double %) (double target))) 1e-9))

(deftest score-blends-similarity-canonical-and-verified-boosts-test
  (let [score (var-get #'prompt-entities/score)]
    (testing "similarity = 1 - cosine distance; canonical and verified each add a flat boost"
      (is (=? {:cosine_distance 0.2 :similarity (approx 0.8)
               :canonical true  :canonical_boost 0.15 :verified false :verified_boost 0.0 :total (approx 0.95)}
              (score {:distance 0.2 :canonical true :verified false})))
      (is (=? {:canonical false :canonical_boost 0.0 :verified true :verified_boost 0.1 :total (approx 0.9)}
              (score {:distance 0.2 :canonical false :verified true})))
      (is (=? {:canonical true :verified true :total (approx 1.05)}
              (score {:distance 0.2 :canonical true :verified true})))
      (is (=? {:canonical false :canonical_boost 0.0 :verified false :verified_boost 0.0 :total (approx 0.8)}
              (score {:distance 0.2 :canonical false :verified false}))))
    (testing "boosts strictly increase the total"
      (is (> (:total (score {:distance 0.2 :canonical true :verified true}))
             (:total (score {:distance 0.2 :canonical true :verified false}))
             (:total (score {:distance 0.2 :canonical false :verified false})))))))

(deftest canonical-entities?-test
  (let [canonical? (var-get #'prompt-entities/canonical-entities?)]
    (is (true?  (canonical? {:type "canonical" :entity {:model "table" :id 42}})))
    (is (false? (canonical? {:type "sources" :entities [{:model "table" :id 1}]})))))

(deftest dispatch-without-pgvector-test
  (testing "with the feature enabled but pgvector unconfigured, the EE impls degrade gracefully"
    ;; Pin db-url to nil so the result is deterministic regardless of any ambient MB_PGVECTOR_DB_URL:
    ;; pgvector-available? is false, so the feature-gated EE impls run their early-return branch —
    ;; search returns [], and the mirror writes no-op (return nil) rather than throwing.
    (mt/with-premium-features #{:semantic-search}
      (with-redefs [semantic.db.datasource/db-url nil]
        (is (= [] (prompt-entities/search-prompt-entities "anything" 10)))
        (is (nil? (prompt-entities/upsert-prompt-entity! 1 "p" {:type "canonical"} false)))
        (is (nil? (prompt-entities/delete-prompt-entity! 1)))))))

(defn- create-prompt!
  "POST a prompt through the CRUD API; returns the created row's id."
  [prompt entities verified]
  (:id (mt/user-http-request :crowberto :post 200 "metabot/search-prompt/"
                             {:prompt prompt :entities entities :verified verified})))

(deftest ^:sequential crud-api-to-tool-end-to-end-test
  (testing "CRUD API write -> mirror hook -> pgvector -> search_prompt_entities tool, end to end"
    ;; Self-gated on MB_PGVECTOR_DB_URL — CI without semantic-search infra skips this; locally with the
    ;; dev pgvector running it exercises the whole pipeline. Uses the mock embedding model (4-dim,
    ;; deterministic, no network) against an isolated temp table so it neither touches the real
    ;; embedding service nor the shared dev index.
    (when semantic.db.datasource/db-url
      (let [tbl       (str "search_prompt_entities_index_test_" (System/nanoTime))
            ds        (semantic.db.datasource/ensure-initialized-data-source!)
            canonical {:type "canonical" :entity {:model "table" :id 1}}
            sources-a {:type "sources" :entities [{:model "table" :id 2}]}
            sources-b {:type "sources" :entities [{:model "table" :id 3}]}
            ;; All prompts + the query embed to the same vector, so cosine distance ties and the
            ;; canonical (0.15) > verified (0.10) > plain (0.0) boosts alone decide the ranking.
            vec1      [1.0 0.0 0.0 0.0]
            p-canon   "revenue by region (canonical)"
            p-verif   "revenue by region (verified)"
            p-plain   "revenue by region (plain)"
            q         "monthly revenue per region"]
        (mt/with-premium-features #{:semantic-search}
          (with-redefs [semantic.embedding/get-configured-model (constantly semantic.tu/mock-embedding-model)]
            (binding [prompt-entities/*table-name* tbl]
              (semantic.tu/with-mock-embeddings {p-canon vec1 p-verif vec1 p-plain vec1 q vec1}
                (try
                  (let [id-canon (create-prompt! p-canon canonical false)
                        id-verif (create-prompt! p-verif sources-a true)
                        _id-pln  (create-prompt! p-plain sources-b false)
                        results  (get-in (tools.spe/search-prompt-entities-tool {:user_search_prompt q})
                                         [:structured-output :data])]
                    (testing "all three rows mirrored and returned, ranked by boost"
                      (is (= [p-canon p-verif p-plain] (mapv :saved_search_prompt results))))
                    (testing "entities round-trip and score factors are populated"
                      (is (=? [{:entities canonical  :score {:canonical true  :verified false :canonical_boost 0.15}}
                               {:entities sources-a  :score {:canonical false :verified true  :verified_boost 0.1}}
                               {:entities sources-b  :score {:canonical false :verified false}}]
                              results)))
                    (testing "deleting via the CRUD API removes the row from search results"
                      (mt/user-http-request :crowberto :delete 204 (str "metabot/search-prompt/" id-canon))
                      (is (= [p-verif p-plain]
                             (mapv :saved_search_prompt
                                   (get-in (tools.spe/search-prompt-entities-tool {:user_search_prompt q})
                                           [:structured-output :data])))))
                    ;; clean up the appdb rows we created (also exercises the before-delete mirror hook)
                    (mt/user-http-request :crowberto :delete 204 (str "metabot/search-prompt/" id-verif)))
                  (finally
                    (jdbc/execute! ds [(str "DROP TABLE IF EXISTS " tbl)])))))))))))
