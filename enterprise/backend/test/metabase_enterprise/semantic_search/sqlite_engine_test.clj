(ns metabase-enterprise.semantic-search.sqlite-engine-test
  "The SQLite store wired in as the semantic search engine (PLAN_002)."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.core :as semantic.core]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.sqlite :as sqlite]
   [metabase-enterprise.semantic-search.sqlite-config :as sqlite-config]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase-enterprise.semantic-search.vibes.jev :as jev]
   [metabase-enterprise.semantic-search.vibes.sqlite :as vibes.sqlite]
   [metabase.search.config :as search.config]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- sqlite-test-extension-available? []
  (try
    (sqlite/extension-path)
    true
    (catch Exception _
      false)))

(deftest gating-test
  (mt/with-premium-features #{:semantic-search}
    (mt/with-dynamic-fn-redefs [semantic.embedding/embedding-supported? (constantly true)]
      (testing "SQLite mode: semantic is supported without pgvector, and every pgvector gate is off"
        (mt/with-dynamic-fn-redefs [sqlite-config/db-path (constantly "/tmp/unused-sqlite-store.db")]
          (is (search.engine/supported-engine? :search.engine/semantic))
          (is (= :search.engine/semantic (first (search.engine/supported-engines))))
          (is (false? (semantic.util/semantic-search-configured?)))
          (is (false? (semantic.util/semantic-search-available?)))))
      (testing "without the store, support still depends on pgvector as before"
        (mt/with-dynamic-fn-redefs [sqlite-config/db-path (constantly nil)]
          (is (= (semantic.util/semantic-search-available?)
                 (search.engine/supported-engine? :search.engine/semantic))))))))

;;; ------------------------------------------------- Write hooks --------------------------------------------------

(def ^:private test-model
  {:provider "test" :model-name "test-model" :vector-dimensions 4 :embedding-space-id "test-space-4"})

(defn- doc [model id text & {:as extra}]
  (merge {:model model :id id :name (str model " " id) :embeddable_text text :archived false
          :legacy_input (merge {:id id :model model :name (str model " " id)} (:legacy_input extra))}
         (dissoc extra :legacy_input)))

(defn- temp-db-path []
  (str (java.nio.file.Files/createTempDirectory "vec1-engine" (make-array java.nio.file.attribute.FileAttribute 0))
       "/store.db"))

(defn- do-with-sqlite-engine!
  "Run `f` with the semantic engine in SQLite mode on a fresh temp store: stubbed embeddings (every text -> the same
  vector), synchronous background indexing, no personal-collection lookups."
  [f]
  (let [path       (temp-db-path)
        index-all! sqlite/index-all!]
    (try
      (mt/with-premium-features #{:semantic-search}
        (mt/with-dynamic-fn-redefs [sqlite-config/db-path                           (constantly path)
                                    semantic.embedding/get-configured-model         (constantly test-model)
                                    semantic.embedding/embedding-supported?         (constantly true)
                                    semantic.index/batch-resolve-personal-owner-ids (constantly {})
                                    semantic.embedding/process-embeddings-streaming (fn [_model texts process-fn & _]
                                                                                      (process-fn (zipmap texts (repeat [1 0 0 0]))))
                                    sqlite/index-all-async!                         (fn [documents & {:as opts}]
                                                                                      (index-all! documents opts))]
          (f)))
      (finally
        (sqlite/delete-store! path)))))

(defn- stored-keys []
  (set (map (juxt :model :model_id) (:rows (sqlite/search-text "anything" :k 100 :record-tokens? false)))))

(deftest write-hooks-test
  (when (sqlite-test-extension-available?)
    (do-with-sqlite-engine!
     (fn []
       (mt/with-dynamic-fn-redefs [semantic.embedding/get-embedding (constantly [1 0 0 0])]
         (testing "init! creates the store and indexes the documents"
           (is (nil? (semantic.core/init! [(doc "card" 1 "a") (doc "card" 2 "b") (doc "dashboard" 1 "c")] {})))
           (is (=? {:schema :created :docs 3 :vectors 3} (sqlite/stats))))
         (testing "update-index! upserts and returns {model count}"
           (is (= {"card" 2 "metric" 1}
                  (semantic.core/update-index! [(doc "card" 2 "b2") (doc "card" 3 "d") (doc "metric" 1 "e")])))
           (is (= "b2" (:content (sqlite/get-doc "card" 2)))))
         (testing "delete-from-index! deletes and returns {model count}"
           (is (= {"card" 1} (semantic.core/delete-from-index! "card" [3 404])))
           (is (nil? (sqlite/get-doc "card" 3))))
         (testing "diagnose reports presence"
           (is (= :candidate (:type (semantic.core/diagnose {} "card" 1))))
           (is (= :missing-from-index (:type (semantic.core/diagnose {} "card" 3)))))
         (testing "init! again prunes documents that are no longer searchable"
           (semantic.core/init! [(doc "card" 1 "a") (doc "dashboard" 1 "c")] {})
           (is (= #{["card" "1"] ["dashboard" "1"]} (stored-keys))))
         (testing "repair-index! re-indexes and prunes"
           (is (=? {:index-id 0 :orphans 1} (semantic.core/repair-index! [(doc "card" 1 "a")])))
           (is (= #{["card" "1"]} (stored-keys))))
         (testing "init! with :force-reset? starts from an empty store"
           (sqlite/upsert-documents! [(doc "card" 9 "z")])
           (semantic.core/init! [(doc "dashboard" 5 "q")] {:force-reset? true})
           (is (=? {:schema :created} (sqlite/stats)))
           (is (= #{["dashboard" "5"]} (stored-keys)))))))))

;;; ---------------------------------------------------- Query -----------------------------------------------------

(def ^:private text->vector
  ;; the query "q" embeds to [1 0 0 0]; cosine distance from it in the comments
  {"near"    [1 0 0 0]      ; 0
   "close"   [0.8 0.6 0 0]  ; 0.2
   "further" [0.5 0.87 0 0] ; ~0.5
   "far"     [0 1 0 0]})    ; 1 -- beyond the 0.8 cutoff

(defn- do-with-query-docs!
  "SQLite engine with the docs of [[text->vector]] indexed (card 1..4 in that order, plus dashboard 1 = \"near\"),
  every query embedding to [1 0 0 0]. The docs don't exist in the app DB, so the permission filter is stubbed out;
  [[search-api-test]] covers permissions with real cards."
  [f]
  (do-with-sqlite-engine!
   (fn []
     (mt/with-dynamic-fn-redefs [semantic.embedding/process-embeddings-streaming (fn [_model texts process-fn & _]
                                                                                   (process-fn (select-keys text->vector texts)))
                                 semantic.embedding/get-embedding             (constantly [1 0 0 0])
                                 semantic.index/filter-read-permitted          identity]
       (sqlite/upsert-documents! [(doc "card" 1 "near" :legacy_input {:display_type "table"})
                                  (doc "card" 2 "close" :legacy_input {:display_type "bar"})
                                  (doc "card" 3 "further" :archived true)
                                  (doc "card" 4 "far")
                                  (doc "dashboard" 1 "near")])
       (mt/with-current-user (mt/user->id :crowberto)
         (f))))))

(defn- ctx [& {:as extra}]
  (search/search-context (merge {:search-string      "q"
                                 :current-user-id    (mt/user->id :crowberto)
                                 :is-superuser?      true
                                 :is-impersonated-user? false
                                 :is-sandboxed-user?    false
                                 :current-user-perms #{"/"}
                                 :context            :default
                                 :models             search.config/all-models}
                                extra)))

(defn- result-keys [search-ctx]
  (mapv (juxt :model :id) (:results (sqlite/query search-ctx))))

(deftest query-test
  (when (sqlite-test-extension-available?)
    (do-with-query-docs!
     (fn []
       (testing "a blank search string returns nothing (the engine then falls back)"
         ;; search-context rejects a blank string, but the engine can still be handed one
         (is (= {:results [] :raw-count 0} (sqlite/query {:search-string " "}))))
       (testing "nearest first, within the distance cutoff, archived excluded by default"
         (let [[a b c] (result-keys (ctx))]
           ;; card 1 and dashboard 1 tie at distance 0
           (is (= #{["card" 1] ["dashboard" 1]} #{a b}))
           (is (= ["card" 2] c)))
         (is (not (contains? (set (result-keys (ctx))) ["card" 4]))))
       (testing "scored like pgvector's vector-only hits"
         (let [top (first (:results (sqlite/query (ctx))))]
           (is (=? [{:name :rrf :weight 500} {:name :semantic-distance :score 1.0 :weight 10}]
                   (take 2 (:all-scores top))))
           (is (< 10 (:score top)))))
       (testing "the cutoff is configurable"
         (mt/with-dynamic-fn-redefs [sqlite-config/max-distance (constantly 0.1)]
           (is (= #{["card" 1] ["dashboard" 1]} (set (result-keys (ctx))))))
         (mt/with-dynamic-fn-redefs [sqlite-config/max-distance (constantly 1.5)]
           (is (contains? (set (result-keys (ctx))) ["card" 4]))))
       (testing "filters"
         (is (= [["dashboard" 1]] (result-keys (ctx :models #{"dashboard"}))))
         (is (= [["card" 3]] (result-keys (ctx :archived true))))
         (is (= [["card" 2]] (result-keys (ctx :ids #{2} :models #{"card"}))))
         (is (= [["card" 2]] (result-keys (ctx :display-type #{"bar"})))))
       (testing ":raw-count counts results before the permission filter"
         (is (= 3 (:raw-count (sqlite/query (ctx))))))))))

;;; ----------------------------------------------------- Vibes ----------------------------------------------------

(defn- do-with-vibes-stub!
  "Run `f` with vibes enabled and Jev replaced by `stub`, a `(fn [prompt roster opts])` returning `{id noul}` or nil.
  `calls` collects `[prompt roster question]` per call. The score cache is cleared first."
  [stub calls f]
  (vibes.sqlite/reset-cache!)
  (mt/with-temporary-setting-values [vibes-enabled true vibes-api-key "test-key" vibes-rerank-k 10]
    (mt/with-dynamic-fn-redefs [jev/score-candidates! (fn [prompt roster opts]
                                                        (swap! calls conj [prompt roster (:question opts)])
                                                        (stub prompt roster opts))]
      (f))))

(defn- vibe-score [result]
  (some #(when (= :vibes (:name %)) (:score %)) (:all-scores result)))

(deftest query-vibes-rerank-test
  (when (sqlite-test-extension-available?)
    (do-with-query-docs!
     (fn []
       (let [calls (atom [])]
         (do-with-vibes-stub!
          (fn [_ roster _] (update-vals roster #(if (re-find #"close" (get % "content")) 0.9 0.1)))
          calls
          (fn []
            (let [{:keys [results]} (sqlite/query (ctx :vibes true))]
              (testing "the reranker's favourite comes first, the rest by score"
                (is (= ["card" 2] ((juxt :model :id) (first results))))
                (is (= #{["card" 1] ["dashboard" 1]} (set (map (juxt :model :id) (rest results))))))
              (testing "the :vibes score is reported"
                (is (= 0.9 (vibe-score (first results))))
                (is (=? [{:name :rrf} {:name :semantic-distance} {:name :vibes :score 0.9 :weight 100 :contribution 90.0}]
                        (take 3 (:all-scores (first results))))))
              (testing "one Jev call, against the search string, over the candidates within k"
                (is (= 1 (count @calls)))
                (is (= "q" (ffirst @calls)))
                (is (= #{"card" "dashboard"} (set (map #(get % "type") (vals (second (first @calls)))))))
                (is (every? #(contains? % "content") (vals (second (first @calls))))))
              (testing "the search question is asked, not the query-rows one"
                (is (= :search (nth (first @calls) 2)))))
            (testing "a :vibes-prompt overrides the search string as the judged prompt"
              (sqlite/query (ctx :vibes true :vibes-prompt "income by kind of merchandise"))
              (is (= "income by kind of merchandise" (first (last @calls))))))))))))

(deftest query-vibes-reranker-down-test
  (when (sqlite-test-extension-available?)
    (do-with-query-docs!
     (fn []
       (let [calls (atom [])]
         (do-with-vibes-stub!
          (fn [& _] nil)
          calls
          (fn []
            (let [{:keys [results]} (sqlite/query (ctx :vibes true))]
              (testing "vector order survives, vibes score 0"
                (is (= (map (juxt :model :id) (:results (sqlite/query (ctx))))
                       (map (juxt :model :id) results)))
                (is (every? #(= 0.0 (vibe-score %)) results)))
              (testing "one attempt, not one per row"
                (is (= 1 (count @calls)))))
            (testing "the failure isn't cached: the next search asks Jev again"
              (sqlite/query (ctx :vibes true))
              (is (= 2 (count @calls)))))))))))

(deftest query-vibes-disabled-test
  (when (sqlite-test-extension-available?)
    (do-with-query-docs!
     (fn []
       (let [calls (atom 0)]
         (mt/with-temporary-setting-values [vibes-enabled false vibes-api-key "test-key"]
           (mt/with-dynamic-fn-redefs [jev/score-candidates! (fn [& _] (swap! calls inc) {})]
             (testing "the :vibes ask is ignored: plain vector order, no vibes score, no call"
               (let [{:keys [results]} (sqlite/query (ctx :vibes true))]
                 (is (= (map (juxt :model :id) (:results (sqlite/query (ctx))))
                        (map (juxt :model :id) results)))
                 (is (every? nil? (map vibe-score results)))
                 (is (zero? @calls))))))
         (testing "enabled but not asked for: no call either"
           (mt/with-temporary-setting-values [vibes-enabled true vibes-api-key "test-key"]
             (mt/with-dynamic-fn-redefs [jev/score-candidates! (fn [& _] (swap! calls inc) {})]
               (is (every? nil? (map vibe-score (:results (sqlite/query (ctx))))))
               (is (zero? @calls))))))))))

(deftest search-api-vibes-param-test
  (when (sqlite-test-extension-available?)
    (do-with-query-docs!
     (fn []
       (let [calls (atom [])]
         (do-with-vibes-stub!
          (fn [_ roster _] (update-vals roster (constantly 0.5)))
          calls
          (fn []
            (testing "GET /api/search?vibes=true reaches the store"
              (mt/user-http-request :crowberto :get 200 "search" :q "q" :search_engine "semantic" :vibes true)
              (is (= 1 (count @calls))))
            (testing "without it, nothing is reranked"
              (mt/user-http-request :crowberto :get 200 "search" :q "q" :search_engine "semantic")
              (is (= 1 (count @calls)))))))))))

(deftest search-api-test
  (when (sqlite-test-extension-available?)
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {hidden-coll :id} {:name "Hidden"}
                     :model/Card       {zebra :id}       {:name "Zebra population census"}
                     :model/Card       {hidden :id}      {:name "Zebra secret census" :collection_id hidden-coll}
                     :model/Card       {_other :id}      {:name "Quarterly revenue"}]
        (do-with-sqlite-engine!
         (fn []
           ;; real documents from ingestion; only texts mentioning zebras are near the query
           (mt/with-dynamic-fn-redefs [semantic.embedding/process-embeddings-streaming
                                       (fn [_model texts process-fn & _]
                                         (process-fn (into {} (map (fn [t] [t (if (re-find #"(?i)zebra" t) [1 0 0 0] [0 0 0 1])]))
                                                           texts)))
                                       semantic.embedding/get-embedding (constantly [0.95 0.05 0 0])]
             (semantic.core/init! (search.ingestion/searchable-documents) {})
             (testing "/api/search goes to the SQLite store"
               (let [response (mt/user-http-request :crowberto :get 200 "search" :q "striped horses" :search_engine "semantic")]
                 (is (= "search.engine/semantic" (:engine response)))
                 (is (= #{zebra hidden}
                        (into #{} (comp (filter (comp #{"card"} :model)) (map :id)) (:data response))))))
             (testing "results the user can't read are dropped"
               (let [response (mt/user-http-request :rasta :get 200 "search" :q "striped horses" :search_engine "semantic")]
                 (is (not (contains? (into #{} (map :id) (:data response)) hidden))))))))))))
