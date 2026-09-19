(ns metabase-enterprise.semantic-search.sqlite-in-process-embedder-test
  "End-to-end round trip for the SQLite store driven by real embeddings from the in-process embedder plugin.

  The rest of the SQLite suite runs on [[metabase-enterprise.semantic-search.test-util/mock-embeddings]]: four
  hand-written dimensions, so it never exercises a real model's vector width, and never proves the store works with
  the one embedding provider that needs no network. This namespace closes that gap — a 384-dimension model whose
  vectors are produced by ONNX inference inside this JVM.

  Opt-in and self-gated, like the pgvector round trip in
  [[metabase-enterprise.semantic-search.appdb-pgvector-mode-test]]: real inference needs the plugin jar on
  MB_PLUGINS_DIR, which no ordinary test run has, so it only runs with
  MB_IN_PROCESS_EMBEDDER_SEMANTIC_SEARCH_TEST=true. Opting in then REQUIRES SQLite mode, so a misconfigured CI job
  fails loudly instead of quietly asserting nothing."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.semantic-search.core :as semantic.core]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.db.sqlite :as semantic.db.sqlite]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.embeddings.provider :as embeddings.provider]
   [metabase.embeddings.startup :as embeddings.startup]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private in-process-embedding-model
  "What semantic search asks the plugin for. The dimensions are the model's own, not a configurable projection —
  a mismatch fails readiness rather than silently truncating."
  {:provider          "in-process"
   :model-name        "Snowflake/snowflake-arctic-embed-xs"
   :vector-dimensions 384})

(defn- opted-in?
  "True when MB_IN_PROCESS_EMBEDDER_SEMANTIC_SEARCH_TEST=true. Real inference needs the separately built plugin jar
  on MB_PLUGINS_DIR, so the default is to skip."
  []
  (Boolean/parseBoolean (System/getenv "MB_IN_PROCESS_EMBEDDER_SEMANTIC_SEARCH_TEST")))

(defn- embedding-blob-widths
  "Byte widths of the stored embeddings. A float32 BLOB of a 384-dimension vector is 1536 bytes; anything else means
  the vector was truncated, widened, or stored in some other encoding on its way through the store."
  [pgvector table-name]
  (->> (jdbc/execute! pgvector
                      [(str "SELECT length(embedding) AS width FROM \"" (name table-name) "\"")]
                      {:builder-fn jdbc.rs/as-unqualified-lower-maps})
       (map :width)
       set))

(deftest ^:synchronized sqlite-in-process-embedder-round-trip-test
  (cond
    (not (opted-in?))
    (testing "real in-process inference requires its dedicated CI opt-in — skipping"
      (is true))

    (not (semantic.tu/sqlite-mode?))
    (testing "opted in, but this JVM is not configured for the SQLite store"
      (is false (str "MB_IN_PROCESS_EMBEDDER_SEMANTIC_SEARCH_TEST on the SQLite leg requires"
                     " MB_SEMANTIC_SEARCH_SQLITE_PATH and no MB_PGVECTOR_DB_URL")))

    :else
    (mt/with-premium-features #{:semantic-search}
      (embeddings.startup/ensure-in-process-provider!)
      (is (embeddings.provider/registered? "in-process")
          "the plugin jar must be on MB_PLUGINS_DIR for this job")
      (is (semantic.embedding/embedding-supported? in-process-embedding-model))
      (mt/with-dynamic-fn-redefs [semantic.embedding/get-configured-model (constantly in-process-embedding-model)]
        (semantic.tu/with-temp-datasource! "in_process_embedder"
          (testing "the store really is SQLite, not a pgvector database"
            (is (= :sqlite (semantic.db.datasource/pgvector-mode)))
            (is (false? (semantic.db.datasource/postgres-store?)))
            (is (semantic.core/supported?)
                "the semantic search engine accepts a SQLite store served by the in-process provider"))
          ;; The permission filter resolves a Card result to its row (`mi/can-read?` on a Card consults its
          ;; `document_id`, so Cards are off the collection-id-only fast path) and drops one it cannot find. Back the
          ;; indexed card with a real row, or the only thing this test measures is the missing fixture.
          (mt/with-temp [:model/Card {card-id :id} {:name "Dog Training Guide"}]
            (let [pgvector       (semantic.env/get-pgvector-datasource!)
                  index-metadata (semantic.env/get-index-metadata)
                  documents      (mapv (fn [doc]
                                         (cond-> (assoc doc :archived false)
                                           (= "card" (:model doc))
                                           (-> (assoc :id card-id)
                                               (assoc-in [:legacy_input :id] card-id))))
                                       (semantic.tu/mock-documents))
                  index          (semantic.pgvector-api/init-semantic-search!
                                  pgvector index-metadata (semantic.env/get-configured-embedding-model))]
              (semantic.pgvector-api/index-documents! pgvector index-metadata documents)
              (testing "the model's own vectors are what reached the store"
                (is (= #{1536} (embedding-blob-widths pgvector (:table-name index)))
                    "384 float32s per row")
                (is (= 384 (count (semantic.db.sqlite/blob->vector
                                   (:embedding
                                    (jdbc/execute-one! pgvector
                                                       [(str "SELECT embedding FROM \""
                                                             (name (:table-name index))
                                                             "\" LIMIT 1")]
                                                       {:builder-fn jdbc.rs/as-unqualified-lower-maps})))))))
              (testing "the vector arm alone finds the document by meaning, not by shared words"
                ;; "puppy" shares no term with "Dog Training Guide", so the keyword arm cannot answer this;
                ;; weighting semantic distance alone proves the answer came from vec_distance_cosine.
                (is (= {:model "card" :id card-id}
                       (-> (semantic.tu/with-weights {:semantic-distance 1}
                             (mt/with-test-user :crowberto
                               (semantic.pgvector-api/query pgvector index-metadata
                                                            {:search-string          "puppy"
                                                             :vector-search-strategy :brute-force})))
                           :results
                           first
                           (select-keys [:model :id])))))
              (testing "both arms fused, over rows a real model embedded"
                ;; `with-only-semantic-weights` scores by RRF alone, which is where the FTS5 keyword arm and the
                ;; vector arm are merged, so a literal term exercises the fusion rather than the app-db rankers.
                (is (= {:model "card" :id card-id}
                       (-> (semantic.tu/with-only-semantic-weights
                             (mt/with-test-user :crowberto
                               (semantic.pgvector-api/query pgvector index-metadata
                                                            {:search-string "Dog Training"})))
                           :results
                           first
                           (select-keys [:model :id])))))
              (testing "the default weights — every app-db ranker active — still run over the SQLite store"
                ;; Presence, not position: at default weights the ordering is decided by the app-db rankers
                ;; (`:model`, `:dashboard`, `:view-count`, …) reading `mock-documents`' synthetic metadata, and the
                ;; fixture's dashboard outranks its card on those alone. Asserting first place here would pin the
                ;; fixture's relevance tuning, not the store's behaviour.
                (is (contains? (->> (mt/with-test-user :crowberto
                                      (semantic.pgvector-api/query pgvector index-metadata
                                                                   {:search-string "puppy" :archived? false}))
                                    :results
                                    (into #{} (map #(select-keys % [:model :id]))))
                               {:model "card" :id card-id}))))))))))
