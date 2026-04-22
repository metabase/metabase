(ns metabase-enterprise.semantic-layer.complexity-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-layer.complexity :as complexity]
   [metabase-enterprise.semantic-layer.complexity-embedders :as embedders]
   ;; Load init for side-effect: exercises the transitive require of the task ns so
   ;; `scoring-task-registered-test` verifies init.clj's actual wiring path.
   [metabase-enterprise.semantic-layer.init]
   [metabase-enterprise.semantic-layer.task.complexity-score :as task.complexity-score]
   [metabase-enterprise.semantic-search.core :as semantic-search]
   [metabase-enterprise.semantic-search.embedders :as ss.embedders]
   [metabase.analytics.core :as analytics]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.collections.core :as collections]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private test-entity-ids (atom 0))

(defn- entity
  "Build a fake entity map for scoring tests. Uses a monotonically-increasing counter for `:id`
  so every test entity is distinct (and so test failures print stable, readable ids)."
  [& {:keys [name kind field-count measure-names]
      :or   {kind :table field-count 0 measure-names []}}]
  {:id            (swap! test-entity-ids inc)
   :name          name
   :kind          kind
   :field-count   field-count
   :measure-names measure-names})

(defn- mock-embedder
  "Build an embedder backed by a `{name -> vector-literal}` lookup table for tests."
  [name->vec-literal]
  (embedders/fn-embedder
   (fn [names]
     (mapv #(when-let [v (get name->vec-literal %)] (float-array v)) names))))

(deftest ^:parallel score-catalog-pure-test
  (testing "empty catalog scores zero"
    (is (=? {:total 0
             :components {:entity-count      {:measurement 0.0 :score 0}
                          :name-collisions   {:measurement 0.0 :score 0}
                          :synonym-pairs     {:measurement 0.0 :score 0}
                          :field-count       {:measurement 0.0 :score 0}
                          :repeated-measures {:measurement 0.0 :score 0}}}
            (#'complexity/score-catalog [] nil))))

  (testing "entity count contributes +10 per entity"
    (let [es [(entity :name "orders")
              (entity :name "customers")
              (entity :name "products")]]
      (is (=? {:total 30
               :components {:entity-count {:measurement 3.0 :score 30}}}
              (#'complexity/score-catalog es nil)))))

  (testing "name collisions stack linearly: 3 identical names = +200"
    (let [es [(entity :name "orders")
              (entity :name "orders")
              (entity :name "orders")]]
      (is (=? {:components {:entity-count    {:measurement 3.0 :score 30}
                            :name-collisions {:measurement 2.0 :score 200}}}
              (#'complexity/score-catalog es nil)))))

  (testing "collision detection is case-insensitive and trims whitespace"
    (let [es [(entity :name "Orders")
              (entity :name " orders ")
              (entity :name "ORDERS")]]
      (is (=? {:components {:name-collisions {:measurement 2.0 :score 200}}}
              (#'complexity/score-catalog es nil)))))

  (testing "field count contributes +1 per field, summed across entities"
    (let [es [(entity :name "a" :field-count 10)
              (entity :name "b" :field-count 25)]]
      (is (=? {:components {:field-count {:measurement 35.0 :score 35}}}
              (#'complexity/score-catalog es nil)))))

  (testing "repeated measures contribute +2 per repeat (measure name appearing on >1 entity)"
    (let [es [(entity :name "invoices"      :measure-names ["revenue" "discount"])
              (entity :name "subscriptions" :measure-names ["revenue"])
              (entity :name "products"      :measure-names ["price"])]]
      (is (=? {:components {:repeated-measures {:measurement 1.0 :score 2}}}
              (#'complexity/score-catalog es nil)))))

  (testing "nil embedder disables synonym scoring"
    (let [es [(entity :name "customers") (entity :name "clients")]]
      (is (=? {:components {:synonym-pairs {:measurement 0.0 :score 0}}}
              (#'complexity/score-catalog es nil))))))

(deftest ^:parallel synonym-scoring-test
  (testing "cosine similarity above threshold flags a synonym pair"
    (let [es       [(entity :name "customers") (entity :name "clients")]
          embedder (mock-embedder {"customers" [1.0 0.0 0.0]
                                   "clients"   [0.9 0.1 0.0]})]
      (is (=? {:components {:synonym-pairs {:measurement 1.0 :score 50}}}
              (#'complexity/score-catalog es embedder)))))

  (testing "orthogonal embeddings produce no synonym pairs"
    (let [es       [(entity :name "customers") (entity :name "widgets")]
          embedder (mock-embedder {"customers" [1.0 0.0]
                                   "widgets"   [0.0 1.0]})]
      (is (=? {:components {:synonym-pairs {:measurement 0.0 :score 0}}}
              (#'complexity/score-catalog es embedder)))))

  (testing "exact-name duplicates don't double-count as synonym pairs"
    (let [es       [(entity :name "orders") (entity :name "orders") (entity :name "tickets")]
          embedder (mock-embedder {"orders"  [1.0 0.0]
                                   "tickets" [0.0 1.0]})]
      (is (=? {:components {:name-collisions {:measurement 1.0 :score 100}
                            :synonym-pairs   {:measurement 0.0 :score 0}}}
              (#'complexity/score-catalog es embedder)))))

  (testing "entities without a vector from the embedder are simply skipped"
    (let [es       [(entity :name "customers") (entity :name "clients") (entity :name "ghost")]
          ;; "ghost" is missing → not considered. The remaining two are synonyms.
          embedder (mock-embedder {"customers" [1.0 0.0]
                                   "clients"   [0.99 0.01]})]
      (is (=? {:components {:synonym-pairs {:measurement 1.0 :score 50}}}
              (#'complexity/score-catalog es embedder)))))

  (testing "embedder failure degrades gracefully (score 0, not exception)"
    (let [es       [(entity :name "customers") (entity :name "clients")]
          embedder (fn [_] (throw (ex-info "boom" {})))]
      (is (=? {:components {:synonym-pairs {:measurement 0.0 :score 0 :error "boom"}}}
              (#'complexity/score-catalog es embedder))))))

(deftest ^:sequential complexity-scores-metabot-scope-opt-test
  (testing ":verified-only? true routes the :metabot catalog through metabot-entities"
    (let [captured-scope (atom nil)]
      (mt/with-dynamic-fn-redefs [complexity/library-entities  (constantly [])
                                  complexity/universe-entities (constantly [(entity :name "orders")
                                                                            (entity :name "widgets")])
                                  complexity/metabot-entities  (fn [scope]
                                                                 (reset! captured-scope scope)
                                                                 [(entity :name "orders")])]
        (let [{:keys [universe metabot]} (complexity/complexity-scores
                                          :embedder nil
                                          :metabot-scope {:verified-only? true :collection-id nil})]
          (is (= {:verified-only? true :collection-id nil} @captured-scope)
              "metabot-entities was invoked with the caller's scope")
          (is (= 1.0 (get-in metabot  [:components :entity-count :measurement])))
          (is (= 2.0 (get-in universe [:components :entity-count :measurement])))))))
  (testing ":collection-id alone also routes through metabot-entities (no verified flag required)"
    (let [captured-scope (atom nil)]
      (mt/with-dynamic-fn-redefs [complexity/library-entities  (constantly [])
                                  complexity/universe-entities (constantly [(entity :name "orders")
                                                                            (entity :name "widgets")])
                                  complexity/metabot-entities  (fn [scope]
                                                                 (reset! captured-scope scope)
                                                                 [(entity :name "orders")])]
        (let [{:keys [metabot]} (complexity/complexity-scores
                                 :embedder nil
                                 :metabot-scope {:verified-only? false :collection-id 42})]
          (is (= {:verified-only? false :collection-id 42} @captured-scope))
          (is (= 1.0 (get-in metabot [:components :entity-count :measurement])))))))
  (testing "empty scope (or no :metabot-scope opt) reuses the :universe score without recomputing"
    (doseq [scope [nil {} {:verified-only? false :collection-id nil}]]
      (let [metabot-called? (atom false)]
        (mt/with-dynamic-fn-redefs [complexity/library-entities  (constantly [])
                                    complexity/universe-entities (constantly [(entity :name "orders")])
                                    complexity/metabot-entities  (fn [_scope]
                                                                   (reset! metabot-called? true)
                                                                   [])]
          (let [{:keys [universe metabot]} (complexity/complexity-scores
                                            :embedder nil
                                            :metabot-scope scope)]
            (is (not @metabot-called?)
                (format "metabot-entities was not invoked for scope=%s" (pr-str scope)))
            (is (identical? universe metabot))))))))

(deftest ^:sequential metabot-collection-scope-ids-test
  (testing "nil collection-id returns nil (no Metabot collection scope configured)"
    (is (nil? (#'complexity/metabot-collection-scope-ids nil))))
  (testing "valid collection-id returns the id plus its descendants"
    (mt/with-temp [:model/Collection {parent :id} {:name "Scope parent" :location "/"}
                   :model/Collection {child  :id} {:name "Scope child"  :location (format "/%d/" parent)}]
      (is (= #{parent child}
             (#'complexity/metabot-collection-scope-ids parent)))))
  (testing "invalid/deleted collection-id still returns a singleton set with the raw id"
    ;; The live `metabot-metrics-and-models-query` filters on the raw `collection_id` even when
    ;; the collection row is missing (stale Metabot scope value). If we dropped the filter here,
    ;; the :metabot catalog would overcount and drift back toward :universe.
    (let [ghost-id Integer/MAX_VALUE]
      (is (nil? (t2/select-one :model/Collection :id ghost-id))
          "pre-check: the phantom id isn't actually a real collection")
      (is (= #{ghost-id}
             (#'complexity/metabot-collection-scope-ids ghost-id))))))

(deftest ^:parallel fn-embedder-test
  (testing "normalizes names, dedupes, zips vectors by position, and omits entries with no vector"
    (let [known-vectors {"foo" (float-array [1.0 0.0])
                         "bar" (float-array [0.0 1.0])
                         "baz" (float-array [0.5 0.5])}
          embedder      (embedders/fn-embedder (partial mapv known-vectors))
          result        (embedder [{:name "Foo"}
                                   {:name " BAR"}
                                   {:name " Foo  \t \n"}
                                   {:name "missing"}])]
      (is (=? {"foo" (known-vectors "foo")
               "bar" (known-vectors "bar")}
              result)))))

(deftest ^:sequential library-empty-when-no-library-collection-test
  (testing "on an instance with no Library collection, the library score is zero and universe still reports"
    (collections.tu/without-library
     (mt/with-temp [:model/Database {db-id :id} {:name "No-library Test DB"}
                    :model/Table    _           {:db_id db-id :name "contributes_to_universe" :active true}]
       (let [{:keys [library universe]} (complexity/complexity-scores {:embedder nil})]
         (testing "library is empty (no collection tree)"
           (is (= {:total 0
                   :components {:entity-count      {:measurement 0.0 :score 0}
                                :name-collisions   {:measurement 0.0 :score 0}
                                :synonym-pairs     {:measurement 0.0 :score 0}
                                :field-count       {:measurement 0.0 :score 0}
                                :repeated-measures {:measurement 0.0 :score 0}}}
                  library)))
         (testing "universe still enumerates appdb content (our temp table + whatever else is there)"
           (is (pos? (:total universe)))))))))

;; We're only reading the method table via `methods`, not calling the impure `!` fn — safe in parallel.
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(deftest ^:parallel scoring-task-registered-test
  (testing "loading the semantic-layer init namespace registers the scoring task's `task/init!` method"
    (is (contains? (methods task/init!)
                   :metabase-enterprise.semantic-layer.task.complexity-score/DataComplexityScoring))))

(deftest ^:parallel search-index-embedder-degrades-gracefully-test
  (testing "returns {} when semantic-search index isn't available (no throw)"
    (is (= {} (semantic-search/search-index-embedder
               [(entity :name "orders" :kind :table)])))))

(defn- stub-fetch-batch
  "Build a `fetch-batch` stub backed by a map of expected pair-sets -> rows. Each
  invocation looks up rows by the incoming `(model, model_id)` pairs, so the stub
  validates the real batching contract (which pair-sets are requested) without
  coupling to call order. Unknown or duplicate pair-sets throw. Returns
  `{:unseen <atom>, :stub <fn>}`; after the call under test, assert
  `(empty? @unseen)` to catch missing invocations."
  [expected]
  (let [unseen (atom (set (keys expected)))]
    {:unseen unseen
     :stub   (fn [_ _ pairs]
               (let [k (mapv vec pairs)]
                 (if (contains? @unseen k)
                   (do (swap! unseen disj k)
                       (get expected k))
                   (throw (ex-info (format "fetch-batch called with unexpected or duplicate pairs: %s (remaining expected: %s)"
                                           (pr-str k) (pr-str @unseen))
                                   {:pairs k :remaining @unseen})))))}))

(deftest ^:sequential search-index-embedder-global-dedup-test
  (testing "global dedup picks lowest numeric model_id regardless of batch boundaries"
    ;; Stub at fetch-batch (not fetch-by-model+id) so the real partition-all + mapcat batching
    ;; path executes. With batch-size 1, each entity pair lands in its own SQL batch, so the
    ;; two duplicates come back from separate partitions and must be merged by the caller.
    ;; The stub keys the expected batches by `(model, model_id)` pair-seq, so a regression in
    ;; `entity-type->search-model` (or any extra/missing fetch call) fails the test.
    (let [winner-vec (float-array [1.0 0.0 0.0])
          loser-vec  (float-array [0.0 1.0 0.0])
          {:keys [unseen stub]}
          (stub-fetch-batch
           {;; table with model_id "10" (loser — higher id)
            [["table" "10"]] [{:name "Orders" :model_id "10" :model "table" :embedding loser-vec}]
            ;; table with model_id "2" (winner — lower id)
            [["table" "2"]]  [{:name "orders" :model_id "2"  :model "table" :embedding winner-vec}]})]
      (with-redefs [ss.embedders/try-active-index-state
                    (constantly {:pgvector :mock :table-name "t" :model nil})
                    ss.embedders/fetch-batch-size 1
                    ss.embedders/fetch-batch stub]
        (let [result (semantic-search/search-index-embedder
                      [{:id 10 :name "Orders" :kind :table}
                       {:id 2  :name "orders" :kind :table}])]
          (is (= 1 (count result)) "duplicate normalized names collapse to one entry")
          (is (= (seq winner-vec) (seq (get result "orders")))
              "the row with the lowest numeric model_id wins")
          (is (empty? @unseen)
              "every expected fetch-batch pair-set must be requested")))))

  (testing "cross-model duplicates: lowest model_id wins, model is secondary tie-break"
    ;; :kind :question maps to "card" and :kind :table maps to "table" via entity-type->search-model,
    ;; so the real (model, model_id) query contract is exercised. Both have id 5, so model_ids tie
    ;; and the lexicographically smaller model ("card" < "table") must win. The stub is keyed by
    ;; pairs so a regression in entity-type->search-model (e.g. :question no longer mapping to
    ;; "card") throws from the stub instead of passing silently.
    (let [card-vec  (float-array [1.0 0.0])
          table-vec (float-array [0.0 1.0])
          {:keys [unseen stub]}
          (stub-fetch-batch
           {;; card (from :question entity)
            [["card" "5"]]  [{:name "Revenue" :model_id "5" :model "card"  :embedding card-vec}]
            ;; table (from :table entity)
            [["table" "5"]] [{:name "revenue" :model_id "5" :model "table" :embedding table-vec}]})]
      (with-redefs [ss.embedders/try-active-index-state
                    (constantly {:pgvector :mock :table-name "t" :model nil})
                    ss.embedders/fetch-batch-size 1
                    ss.embedders/fetch-batch stub]
        (let [result (semantic-search/search-index-embedder
                      [{:id 5 :name "Revenue" :kind :question}
                       {:id 5 :name "revenue" :kind :table}])]
          (is (= 1 (count result)))
          (is (= (seq card-vec) (seq (get result "revenue")))
              "when model_ids tie, the lexicographically smaller model wins (card < table)")
          (is (empty? @unseen)
              "every expected fetch-batch pair-set must be requested"))))))

(deftest ^:sequential search-index-embedder-cross-batch-dedup-test
  (testing "duplicates split across separate fetch batches are resolved globally"
    ;; Mock at the fetch-batch level (not fetch-by-model+id) so the real partition-all + mapcat
    ;; path in fetch-by-model+id executes. With batch-size 1, each entity pair lands in its own
    ;; SQL batch. The stub is keyed by the expected `(model, model_id)` pair-seq, so it validates
    ;; the batching contract — `entity-type->search-model` mapping (`:question` → "card",
    ;; `:table` → "table") is exercised, not assumed, and extra/missing batches fail the test.
    (let [winner-vec (float-array [1.0 0.0 0.0])
          loser-vec  (float-array [0.0 1.0 0.0])
          other-vec  (float-array [0.0 0.0 1.0])
          {:keys [unseen stub]}
          (stub-fetch-batch
           {;; table with model_id "7"
            [["table" "7"]] [{:name "Orders" :model_id "7" :model "table" :embedding loser-vec}]
            ;; card with model_id "3" — should win globally
            [["card" "3"]]  [{:name "orders" :model_id "3" :model "card" :embedding winner-vec}]
            ;; different entity, no collision
            [["table" "1"]] [{:name "Products" :model_id "1" :model "table" :embedding other-vec}]})]
      (with-redefs [ss.embedders/try-active-index-state
                    (constantly {:pgvector :mock :table-name "t" :model nil})
                    ss.embedders/fetch-batch-size 1
                    ss.embedders/fetch-batch stub]
        (let [result (semantic-search/search-index-embedder
                      [{:id 7 :name "Orders"   :kind :table}
                       {:id 3 :name "orders"   :kind :question}
                       {:id 1 :name "Products" :kind :table}])]
          (is (= 2 (count result)) "two distinct normalized names survive dedup")
          (is (= (seq winner-vec) (seq (get result "orders")))
              "lowest model_id wins across batch boundaries")
          (is (some? (get result "products"))
              "non-colliding entity is retained")
          (is (empty? @unseen)
              "every expected fetch-batch pair-set must be requested")))))

  (testing "cross-batch, cross-model duplicates: model_id primary, model secondary"
    ;; Same normalized name from three different batches and three different model types.
    ;; model_id "5" appears twice (card + dataset); model_id "12" is in a third batch.
    ;; Expected winner: model_id "5", model "card" (lowest id, then lexicographic: "card" < "dataset").
    ;; Entity kinds cover :table → "table", :model → "dataset", :question → "card".
    (let [winner-vec          (float-array [1.0 0.0])
          same-id-other-model (float-array [0.0 1.0])
          higher-id-vec       (float-array [0.5 0.5])
          {:keys [unseen stub]}
          (stub-fetch-batch
           {;; high model_id, model "table"
            [["table" "12"]]  [{:name "Revenue" :model_id "12" :model "table" :embedding higher-id-vec}]
            ;; low model_id, model "dataset"
            [["dataset" "5"]] [{:name "revenue" :model_id "5" :model "dataset" :embedding same-id-other-model}]
            ;; low model_id, model "card" — card < dataset so this wins
            [["card" "5"]]    [{:name "REVENUE" :model_id "5" :model "card" :embedding winner-vec}]})]
      (with-redefs [ss.embedders/try-active-index-state
                    (constantly {:pgvector :mock :table-name "t" :model nil})
                    ss.embedders/fetch-batch-size 1
                    ss.embedders/fetch-batch stub]
        (let [result (semantic-search/search-index-embedder
                      [{:id 12 :name "Revenue" :kind :table}
                       {:id 5  :name "revenue" :kind :model}
                       {:id 5  :name "REVENUE" :kind :question}])]
          (is (= 1 (count result)) "all three collapse to one normalized name")
          (is (= (seq winner-vec) (seq (get result "revenue")))
              "model_id 5 + model card wins (lowest id, then lexicographic: card < dataset)")
          (is (empty? @unseen)
              "every expected fetch-batch pair-set must be requested"))))))

(deftest ^:parallel prefer-new-row-test
  (let [prefer? #'ss.embedders/prefer-new-row?]
    (are [expected new-row prior-row]
         (= expected (prefer? new-row prior-row))
      ;; lower numeric model_id wins
      true  {:mid 2  :model_id "2"  :model "card"}   {:mid 10 :model_id "10" :model "card"}
      false {:mid 10 :model_id "10" :model "card"}   {:mid 2  :model_id "2"  :model "card"}
      ;; equal model_ids tie-break on model name
      true  {:mid 5  :model_id "5"  :model "card"}   {:mid 5  :model_id "5"  :model "table"}
      false {:mid 5  :model_id "5"  :model "table"}  {:mid 5  :model_id "5"  :model "card"}
      ;; same parsed number but different raw strings → tie-break on raw model_id before model
      true  {:mid 2  :model_id "02" :model "card"}   {:mid 2  :model_id "2"  :model "card"}
      false {:mid 2  :model_id "2"  :model "card"}   {:mid 2  :model_id "02" :model "card"}
      ;; numeric always beats non-numeric
      true  {:mid 99 :model_id "99" :model "card"}   {:mid nil :model_id "abc" :model "card"}
      false {:mid nil :model_id "abc" :model "card"}  {:mid 1  :model_id "1"   :model "card"}
      ;; both non-numeric: lexicographic on model_id string
      true  {:mid nil :model_id "abc" :model "card"}  {:mid nil :model_id "xyz" :model "card"}
      false {:mid nil :model_id "xyz" :model "card"}  {:mid nil :model_id "abc" :model "card"})))

(deftest ^:sequential meta-embedding-model-absent-when-unavailable-test
  (with-redefs [complexity/library-entities  (constantly [])
                complexity/universe-entities (constantly [])]
    (testing ":embedding-model key is absent from :meta when the search index is unreachable"
      (with-redefs [ss.embedders/try-active-index-state (constantly nil)]
        ;; Pass the real search-index-embedder so the identity check in complexity-scores succeeds,
        ;; but the embedder returns {} because try-active-index-state is nil.
        (let [{:keys [meta]} (complexity/complexity-scores :embedder semantic-search/search-index-embedder)]
          (is (not (contains? meta :embedding-model))))))
    (testing ":embedding-model key is present in :meta when the active model is non-nil"
      (with-redefs [ss.embedders/try-active-index-state
                    (constantly {:pgvector   :mock
                                 :table-name "mock_table"
                                 :model      {:provider "openai" :model-name "text-embedding-3-small"}})
                    ss.embedders/fetch-by-model+id (constantly [])]
        (let [{:keys [meta]} (complexity/complexity-scores :embedder semantic-search/search-index-embedder)]
          (is (= {:provider "openai" :model-name "text-embedding-3-small"}
                 (:embedding-model meta))))))))

(deftest ^:sequential active-embedding-model-reads-from-active-index-test
  (testing "active-embedding-model returns the model from the active index, not the configured setting"
    (let [active-model {:provider "openai" :model-name "text-embedding-ada-002"}]
      ;; try-active-index-state is private, so we use with-redefs + var for sequential tests.
      (with-redefs [ss.embedders/try-active-index-state
                    (constantly {:pgvector   :mock
                                 :table-name "mock_table"
                                 :model      active-model})]
        (is (= {:provider "openai" :model-name "text-embedding-ada-002"}
               (semantic-search/active-embedding-model))))))
  (testing "active-embedding-model returns nil when the index state has no model"
    (with-redefs [ss.embedders/try-active-index-state
                  (constantly {:pgvector   :mock
                               :table-name "mock_table"
                               :model      nil})]
      (is (nil? (semantic-search/active-embedding-model)))))
  (testing "active-embedding-model returns nil when the index is unreachable"
    (with-redefs [ss.embedders/try-active-index-state (constantly nil)]
      (is (nil? (semantic-search/active-embedding-model))))))

(defn- complexity-events!
  "Drain the fake Snowplow collector and return only complexity events."
  []
  (->> (snowplow-test/pop-event-data-and-user-id!)
       (map :data)
       (filter #(= "data_complexity_scoring" (get % "event")))))

(def ^:private leaf-key->group
  "Mirrors `complexity/component->group` for test assertions. Kept in snake-case string form
  (matching how keys land in the Snowplow payload)."
  {"entity_count"      "size"
   "field_count"       "size"
   "name_collisions"   "ambiguity"
   "synonym_pairs"     "ambiguity"
   "repeated_measures" "ambiguity"})

(defn- snake [k] (-> k name (str/replace "-" "_")))

(defn- expected-keys-for-catalog
  "For a catalog result, return `#{[key score], ...}` matching what emit-snowplow! should emit:
   grand `total`, one `<group>.total` per group, and one `<group>.<leaf>` per sub-component."
  [{:keys [total components]}]
  (let [leaves      (into {} (map (fn [[k sub]] [(snake k) (:score sub)]) components))
        group-total (reduce-kv (fn [acc leaf score]
                                 (update acc (leaf-key->group leaf) (fnil + 0) score))
                               {} leaves)]
    (set (concat [["total" total]]
                 (for [[g s] group-total] [(str g ".total") s])
                 (for [[leaf s] leaves]   [(str (leaf-key->group leaf) "." leaf) s])))))

(deftest ^:sequential emit-snowplow-publishes-total-and-each-subscore-test
  (testing "one event per (catalog × key) — grand total, group rollups, and leaves — with correct scores"
    (snowplow-test/with-fake-snowplow-collector
      (mt/with-dynamic-fn-redefs [complexity/library-entities  (constantly [(entity :name "orders")
                                                                            (entity :name "customers")])
                                  complexity/universe-entities (constantly [(entity :name "orders")
                                                                            (entity :name "customers")
                                                                            (entity :name "widgets")])]
        ;; Drain any startup/setting events so we only assert on emissions from the call below.
        (snowplow-test/pop-event-data-and-user-id!)
        (let [{:keys [library universe metabot]} (complexity/complexity-scores :embedder nil)
              events   (complexity-events!)
              expected (into #{}
                             (for [[catalog result] {"library"  library
                                                     "universe" universe
                                                     "metabot"  metabot}
                                   [k score]        (expected-keys-for-catalog result)]
                               [catalog k score]))
              actual   (into #{}
                             (map (fn [e] [(get e "catalog") (get e "key") (get e "score")]) events))]
          (is (= (count expected) (count events))
              "every (catalog, key) is emitted exactly once — no duplicates")
          (is (= expected actual)
              "every (catalog, key) pair carries the matching score from the result")
          (testing "every event carries the event name, formula version, and parameters map"
            (is (every? (fn [e]
                          (and (= "data_complexity_scoring" (get e "event"))
                               (integer? (get e "formula_version"))
                               (map?     (get e "parameters"))
                               (number?  (get-in e ["parameters" "synonym_threshold"]))))
                        events))))))))

(deftest ^:sequential emit-snowplow-includes-measurement-for-sub-components-test
  (testing "each leaf event carries the raw pre-score measurement; totals and group-totals do not"
    (snowplow-test/with-fake-snowplow-collector
      ;; Library: 3 entities, one collision pair, 5 fields total.
      (mt/with-dynamic-fn-redefs [complexity/library-entities  (constantly [(entity :name "orders"  :field-count 2)
                                                                            (entity :name "orders"  :field-count 0)
                                                                            (entity :name "widgets" :field-count 3)])
                                  complexity/universe-entities (constantly [])]
        (snowplow-test/pop-event-data-and-user-id!)
        (complexity/complexity-scores :embedder nil)
        (let [by-key (->> (complexity-events!)
                          (filter #(= "library" (get % "catalog")))
                          (into {} (map (juxt #(get % "key") identity))))]
          (testing "aggregate totals (grand and per-group) have no measurement key"
            (is (not (contains? (get by-key "total")           "measurement")))
            (is (not (contains? (get by-key "size.total")      "measurement")))
            (is (not (contains? (get by-key "ambiguity.total") "measurement"))))
          (testing "size leaves carry raw counts"
            (is (= 3.0 (get-in by-key ["size.entity_count" "measurement"])))
            (is (= 5.0 (get-in by-key ["size.field_count"  "measurement"]))))
          (testing "ambiguity leaves carry their respective measurements"
            (is (= 1.0 (get-in by-key ["ambiguity.name_collisions"   "measurement"])))
            (is (= 0.0 (get-in by-key ["ambiguity.synonym_pairs"     "measurement"])))
            (is (= 0.0 (get-in by-key ["ambiguity.repeated_measures" "measurement"])))))))))

(deftest ^:sequential emit-snowplow-propagates-error-on-embedder-failure-test
  (testing "ambiguity.synonym_pairs event carries the embedder error string; other keys do not"
    (snowplow-test/with-fake-snowplow-collector
      (mt/with-dynamic-fn-redefs [complexity/library-entities  (constantly [(entity :name "customers")
                                                                            (entity :name "clients")])
                                  complexity/universe-entities (constantly [])]
        (snowplow-test/pop-event-data-and-user-id!)
        (complexity/complexity-scores :embedder (fn [_] (throw (ex-info "embedder boom" {}))))
        (let [by-key (->> (complexity-events!)
                          (filter #(= "library" (get % "catalog")))
                          (into {} (map (juxt #(get % "key") identity))))]
          (is (= "embedder boom" (get-in by-key ["ambiguity.synonym_pairs" "error"]))
              ":error from the synonym-pair scorer reaches the Snowplow payload")
          (is (not-any? #(contains? % "error")
                        (vals (dissoc by-key "ambiguity.synonym_pairs")))
              ":error is only present on the synonym_pairs leaf"))))))

(deftest ^:sequential emit-snowplow-includes-embedding-model-meta-test
  (testing "every event's parameters carry embedding_model_provider/name when the search-index embedder is active"
    (snowplow-test/with-fake-snowplow-collector
      (with-redefs [ss.embedders/try-active-index-state
                    (constantly {:pgvector   :mock
                                 :table-name "mock_table"
                                 :model      {:provider "openai" :model-name "text-embedding-3-small"}})
                    ss.embedders/fetch-by-model+id (constantly [])]
        (mt/with-dynamic-fn-redefs [complexity/library-entities  (constantly [(entity :name "orders")])
                                    complexity/universe-entities (constantly [(entity :name "orders")])]
          (snowplow-test/pop-event-data-and-user-id!)
          (complexity/complexity-scores :embedder semantic-search/search-index-embedder)
          (let [events (complexity-events!)]
            (is (seq events) "sanity: events were emitted")
            (is (every? #(= "openai" (get-in % ["parameters" "embedding_model_provider"])) events))
            (is (every? #(= "text-embedding-3-small" (get-in % ["parameters" "embedding_model_name"])) events))))))))

(deftest ^:sequential emit-snowplow-failure-is-swallowed-test
  (testing "emission failure is caught; complexity-scores still returns the score and logs a warning"
    (mt/with-dynamic-fn-redefs [complexity/library-entities  (constantly [(entity :name "orders")])
                                complexity/universe-entities (constantly [(entity :name "orders")])
                                analytics/track-event!       (fn [& _] (throw (RuntimeException. "snowplow down")))]
      (mt/with-log-messages-for-level [messages [metabase-enterprise.semantic-layer.complexity :warn]]
        (let [result (complexity/complexity-scores :embedder nil)]
          (is (=? {:library  {:total 10 :components {:entity-count {:measurement 1.0 :score 10}}}
                   :universe {:total 10 :components {:entity-count {:measurement 1.0 :score 10}}}}
                  result))
          (is (some #(re-find #"Failed to publish complexity score" (:message %))
                    (messages))
              "a warning about the publish failure was logged"))))))

(deftest ^:sequential local-info-log-is-emitted-even-when-snowplow-fails-test
  (testing "the 'Semantic complexity score' info log fires independently of Snowplow emission"
    ;; Guards two regressions together: local logging being removed, and local logging being
    ;; gated on successful telemetry (so a broken collector would silence the operator-visible log).
    (mt/with-dynamic-fn-redefs [complexity/library-entities  (constantly [(entity :name "orders")])
                                complexity/universe-entities (constantly [(entity :name "orders")])
                                analytics/track-event!       (fn [& _] (throw (RuntimeException. "snowplow down")))]
      (mt/with-log-messages-for-level [messages [metabase-enterprise.semantic-layer.complexity :info]]
        (complexity/complexity-scores :embedder nil)
        (is (some #(and (= :info (:level %))
                        (re-find #"Semantic complexity score" (:message %)))
                  (messages))
            "the score was logged locally at :info even though Snowplow emission threw")))))

(deftest ^:sequential scheduled-task-logs-score-test
  (testing "the scheduled task body runs complexity-scores so operators see a score line in the logs"
    (mt/with-dynamic-fn-redefs [complexity/library-entities  (constantly [(entity :name "orders")])
                                complexity/universe-entities (constantly [(entity :name "orders")])]
      (mt/with-log-messages-for-level [messages [metabase-enterprise.semantic-layer.complexity :info]]
        (#'task.complexity-score/run-scoring!)
        (is (some #(and (= :info (:level %))
                        (re-find #"Semantic complexity score" (:message %)))
                  (messages))
            "the scheduled task produced the expected info log")))))

(deftest ^:sequential complexity-score-library-hermetic-test
  (testing "library score is computed over exactly the Library collection tree — known inputs produce known scores"
    ;; The library tree gets a fixed set of tables, fields, measures, and metric cards. One extra
    ;; collection + table + card sit outside the library so the universe is a strict superset.
    (mt/with-temp
      [:model/Collection {lib-id :id}     {:type     collections/library-collection-type
                                           :name     "Library"
                                           :location "/"}
       :model/Collection {data-id :id}    {:type     collections/library-data-collection-type
                                           :name     "Data"
                                           :location (format "/%d/" lib-id)}
       :model/Collection {metrics-id :id} {:type     collections/library-metrics-collection-type
                                           :name     "Metrics"
                                           :location (format "/%d/" lib-id)}
       :model/Collection {other-id :id}   {:name "Outside" :location "/"}
       :model/Database {db-id :id}        {:name "Hermetic Library DB"}
       ;; Library tables. clients + customers are a synonym pair for the mock embedder below.
       :model/Table    {t1 :id}           {:db_id db-id :name "orders"
                                           :active true :is_published true :collection_id data-id}
       :model/Table    {t2 :id}           {:db_id db-id :name "subscriptions"
                                           :active true :is_published true :collection_id data-id}
       :model/Table    _                  {:db_id db-id :name "clients"
                                           :active true :is_published true :collection_id data-id}
       :model/Table    _                  {:db_id db-id :name "customers"
                                           :active true :is_published true :collection_id data-id}
       ;; Non-library tables: active (→ in universe) but not published into the library tree.
       ;; audit_events + audit_log are another synonym pair via the mock embedder.
       :model/Table    {t-audit :id}      {:db_id db-id :name "audit_events"
                                           :active true :is_published false :collection_id other-id}
       :model/Table    _                  {:db_id db-id :name "audit_log"
                                           :active true :is_published false :collection_id other-id}
       ;; Library fields: 2 on orders, 1 on subscriptions.
       :model/Field _                     {:table_id t1 :name "id"    :active true :base_type :type/Integer}
       :model/Field _                     {:table_id t1 :name "total" :active true :base_type :type/Float}
       :model/Field _                     {:table_id t2 :name "id"    :active true :base_type :type/Integer}
       ;; Non-library fields on audit_events → bumps universe field-count above library.
       :model/Field _                     {:table_id t-audit :name "audit_id"
                                           :active true :base_type :type/Integer}
       :model/Field _                     {:table_id t-audit :name "audit_ts"
                                           :active true :base_type :type/DateTime}
       ;; Library measures: "revenue" on two library tables → one repeated-measure pair in library.
       :model/Measure _                   {:table_id t1 :name "revenue"
                                           :creator_id (mt/user->id :rasta)
                                           :definition {} :archived false}
       :model/Measure _                   {:table_id t2 :name "revenue"
                                           :creator_id (mt/user->id :rasta)
                                           :definition {} :archived false}
       ;; Non-library measure with the same name → bumps universe repeated-measures above library.
       :model/Measure _                   {:table_id t-audit :name "revenue"
                                           :creator_id (mt/user->id :rasta)
                                           :definition {} :archived false}
       ;; Two library metric cards named "Revenue" → one name-collision pair in library.
       :model/Card _                      {:database_id db-id :type :metric :name "Revenue"
                                           :archived false :collection_id metrics-id}
       :model/Card _                      {:database_id db-id :type :metric :name "Revenue"
                                           :archived false :collection_id metrics-id}
       ;; Non-library card also named "Revenue" → 3 "Revenue" entities in universe → 2 collision pairs.
       :model/Card _                      {:database_id db-id :type :model :name "Revenue"
                                           :archived false :collection_id other-id}]
      ;; Each name gets its own orthogonal dimension so only the intended pairs cluster.
      (let [embedder (mock-embedder {"orders"        [1.0  0.0  0.0  0.0 0.0 0.0 0.0]
                                     "subscriptions" [0.0  1.0  0.0  0.0 0.0 0.0 0.0]
                                     "clients"       [0.0  0.0  1.0  0.0 0.0 0.0 0.0]
                                     "customers"     [0.0  0.0  0.99 0.1 0.0 0.0 0.0]   ; ≈ clients (library)
                                     "revenue"       [0.0  0.0  0.0  0.0 1.0 0.0 0.0]   ; "Revenue" cards normalize here
                                     "audit_events"  [0.0  0.0  0.0  0.0 0.0 1.0 0.0]
                                     "audit_log"     [0.0  0.0  0.0  0.0 0.0 0.99 0.1]}) ; ≈ audit_events (universe-only)
            {:keys [library universe]} (complexity/complexity-scores {:embedder embedder})]
        (testing "library reflects exactly what we put in the Library collection tree"
          ;; Library: 4 tables + 2 metric cards = 6 entities.
          ;;  entity-count       6 × 10 = 60
          ;;  name-collisions    "revenue" (2 metric cards) = 1 pair × 100 = 100
          ;;  synonym-pairs      clients ↔ customers = 1 × 50 = 50
          ;;  field-count        orders(2) + subscriptions(1) + others(0) = 3 × 1 = 3
          ;;  repeated-measures  "revenue" on orders + subscriptions = 1 × 2 = 2
          ;;  total              60 + 100 + 50 + 3 + 2 = 215
          (is (= {:total      215
                  :components {:entity-count      {:measurement 6.0 :score 60}
                               :name-collisions   {:measurement 1.0 :score 100}
                               :synonym-pairs     {:measurement 1.0 :score 50}
                               :field-count       {:measurement 3.0 :score 3}
                               :repeated-measures {:measurement 1.0 :score 2}}}
                 library)))
        (testing "universe is a strict superset of library on every component: every measurement and score is higher"
          ;; Note: :synonym-pairs is monotonic on this fixture but not in general — score-synonym-pairs
          ;; dedupes by normalized name and picks one embedding per name, so a universe-only entity
          ;; sharing a normalized name with a library entity could in theory flip which vector wins and
          ;; decrease the pair count/score. Our fixture doesn't hit that case; if this assertion ever
          ;; flakes, that's the reason.
          (doseq [component [:entity-count :name-collisions :synonym-pairs :field-count :repeated-measures]
                  k         [:measurement :score]
                  :let      [lib-v (get-in library  [:components component k])
                             uni-v (get-in universe [:components component k])]]
            (is (> uni-v lib-v)
                (format "universe %s %s (%s) should be strictly > library %s %s (%s)"
                        component k uni-v component k lib-v))))
        (testing "universe total is strictly higher than library total"
          (is (> (:total universe) (:total library))))))))
