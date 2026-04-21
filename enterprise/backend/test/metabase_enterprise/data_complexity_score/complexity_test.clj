(ns metabase-enterprise.data-complexity-score.complexity-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase-enterprise.data-complexity-score.complexity-embedders :as embedders]
   ;; Load init for side-effect: exercises the transitive require of the task ns so
   ;; `scoring-task-registered-test` verifies init.clj's actual wiring path.
   [metabase-enterprise.data-complexity-score.init]
   [metabase-enterprise.data-complexity-score.metabot-scope :as metabot-scope]
   [metabase-enterprise.data-complexity-score.settings :as data-complexity-score.settings]
   [metabase-enterprise.data-complexity-score.task.complexity-score :as task.complexity-score]
   [metabase-enterprise.semantic-search.core :as semantic-search]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedders :as ss.embedders]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.analytics.core :as analytics]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.audit-app.core :as audit]
   [metabase.collections.core :as collections]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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

(deftest ^:parallel score-from-entities-metabot-fallback-test
  (testing "score-from-entities marks :metabot as a universe fallback when no metabot-entities are passed"
    (let [library  []
          universe [(entity :name "orders") (entity :name "widgets")]]
      (testing "nil metabot-entities → :metabot reuses the :universe score and :meta flags the fallback"
        (let [result (complexity/score-from-entities library universe nil {})]
          (is (= :universe-fallback (get-in result [:meta :metabot-source]))
              "benchmark consumers need this marker to tell an approximated :metabot apart from a real one")
          (is (= (:universe result) (:metabot result))
              "fallback path must copy :universe verbatim — no second scoring pass")))
      (testing "non-nil metabot-entities → :metabot is scored separately and the marker is absent"
        (let [result (complexity/score-from-entities library universe nil
                                                     {:metabot-entities [(entity :name "orders")]})]
          (is (nil? (get-in result [:meta :metabot-source]))
              "real metabot score must not be stamped with the fallback marker")
          (is (not= (:universe result) (:metabot result))
              "pre-check: the metabot vector is smaller than universe so the scores should differ"))))))

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

  (testing "embedder failure cascades nil through the catalog (no zero-fallback)"
    (let [es       [(entity :name "customers") (entity :name "clients")]
          embedder (fn [_] (throw (ex-info "boom" {})))]
      (is (=? {:total nil
               :components {:synonym-pairs {:measurement nil :score nil :error "boom"}
                            ;; Sibling sub-scores still compute their real values — only the rollup
                            ;; cascades nil — so consumers can still see the unaffected dimensions.
                            :entity-count {:measurement 2.0 :score 20}}}
              (#'complexity/score-catalog es embedder)))))

  (testing "throwable with a nil/blank message still records :error as a nonblank string"
    ;; Regression: we must keep :error present so an embedder failure is distinguishable from a
    ;; genuine zero-synonym result. Fall back to the exception class name.
    (let [es         [(entity :name "customers") (entity :name "clients")]
          synonym-of #(get-in (#'complexity/score-catalog es %) [:components :synonym-pairs])]
      (doseq [[label embedder expected] [["nil message"   (fn [_] (throw (NullPointerException.)))
                                          "java.lang.NullPointerException"]
                                         ["blank message" (fn [_] (throw (RuntimeException. "   ")))
                                          "java.lang.RuntimeException"]]]
        (testing label
          (let [sub (synonym-of embedder)]
            (is (nil? (:score sub)))
            (is (= expected (:error sub))
                (format ":error must be a nonblank string when the throwable's message is %s" label))))))))

(deftest ^:sequential complexity-scores-metabot-scope-opt-test
  (testing ":verified-only? true flows the caller's metabot-scope through to enumerate-catalogs"
    (let [captured-scope (atom nil)]
      (mt/with-dynamic-fn-redefs [complexity/enumerate-catalogs
                                  (fn [scope]
                                    (reset! captured-scope scope)
                                    {:library  []
                                     :universe [(entity :name "orders") (entity :name "widgets")]
                                     :metabot  [(entity :name "orders")]})]
        (let [{:keys [universe metabot]} (complexity/complexity-scores
                                          :embedder nil
                                          :metabot-scope {:verified-only? true :collection-id nil})]
          (is (= {:verified-only? true :collection-id nil} @captured-scope)
              "enumerate-catalogs was invoked with the caller's scope")
          (is (= 1.0 (get-in metabot  [:components :entity-count :measurement])))
          (is (= 2.0 (get-in universe [:components :entity-count :measurement])))))))
  (testing ":collection-id alone also flows through to enumerate-catalogs (no verified flag required)"
    (let [captured-scope (atom nil)]
      (mt/with-dynamic-fn-redefs [complexity/enumerate-catalogs
                                  (fn [scope]
                                    (reset! captured-scope scope)
                                    {:library  []
                                     :universe [(entity :name "orders") (entity :name "widgets")]
                                     :metabot  [(entity :name "orders")]})]
        (let [{:keys [metabot]} (complexity/complexity-scores
                                 :embedder nil
                                 :metabot-scope {:verified-only? false :collection-id 42})]
          (is (= {:verified-only? false :collection-id 42} @captured-scope))
          (is (= 1.0 (get-in metabot [:components :entity-count :measurement])))))))
  (testing "empty scope (or no :metabot-scope opt) still runs enumerate-catalogs with that scope so metabot's table-visibility filter still narrows the catalog"
    ;; Regression: we used to reuse the :universe score verbatim when scope was empty. That hid the
    ;; fact that Metabot's table visibility (`:visibility_type nil`, non-routed DB) already narrows
    ;; the catalog even before Card scoping kicks in.
    (doseq [scope [nil {} {:verified-only? false :collection-id nil}]]
      (let [captured-scope (atom ::not-called)]
        (mt/with-dynamic-fn-redefs [complexity/enumerate-catalogs
                                    (fn [s]
                                      (reset! captured-scope s)
                                      {:library  []
                                       :universe [(entity :name "orders") (entity :name "widgets")]
                                       :metabot  [(entity :name "orders")]})]
          (let [{:keys [universe metabot]} (complexity/complexity-scores
                                            :embedder nil
                                            :metabot-scope scope)]
            (is (= scope @captured-scope)
                (format "enumerate-catalogs was invoked with the caller's (possibly empty) scope=%s"
                        (pr-str scope)))
            (is (= 1.0 (get-in metabot  [:components :entity-count :measurement])))
            (is (= 2.0 (get-in universe [:components :entity-count :measurement])))))))))

(deftest ^:sequential metabot-catalog-excludes-hidden-tables-test
  (testing ":metabot tables filter out hidden (`visibility_type` non-nil) and routed-DB tables so the
           catalog matches what Metabot/search can actually surface"
    ;; Regression: `:metabot` used to count every active non-audit table, which overcounted on
    ;; instances with hidden tables or routed-database tables — Metabot never surfaces those.
    (mt/with-temp
      [:model/Database {router-db :id} {:name "Router DB"}
       :model/Database {routed-db :id} {:name "Routed DB" :router_database_id router-db}
       :model/Database {plain-db :id}  {:name "Plain DB"}
       :model/Table    {visible :id}   {:db_id plain-db  :name "visible_table"
                                        :active true :visibility_type nil}
       :model/Table    {hidden :id}    {:db_id plain-db  :name "hidden_table"
                                        :active true :visibility_type "hidden"}
       :model/Table    {technical :id} {:db_id plain-db  :name "technical_table"
                                        :active true :visibility_type "technical"}
       :model/Table    {routed :id}    {:db_id routed-db :name "routed_table"
                                        :active true :visibility_type nil}]
      (let [metabot-entities (:metabot (#'complexity/enumerate-catalogs nil))
            ids              (into #{} (comp (filter #(= :table (:kind %))) (map :id)) metabot-entities)]
        (testing "visible non-routed table is included"
          (is (contains? ids visible)))
        (testing "hidden and technical tables are excluded"
          (is (not (contains? ids hidden))
              "tables with visibility_type=hidden are filtered out")
          (is (not (contains? ids technical))
              "tables with visibility_type=technical are filtered out"))
        (testing "tables on a routed database are excluded"
          (is (not (contains? ids routed))
              "tables whose db has router_database_id are filtered out"))))))

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
       (let [{:keys [library universe]} (complexity/complexity-scores :embedder nil)]
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

(deftest ^:sequential library-excludes-audit-content-test
  (testing "published audit-db content in the Library tree is excluded so :library stays a subset of :universe"
    ;; Regression: library-entities previously didn't filter on audit/audit-db-id while universe/metabot did.
    ;; An audit card/table placed in the Library could push :library past :universe and break the new
    ;; subset invariant (the hermetic tests below assume library ⊆ universe on every component).
    (mt/with-temp [:model/Collection {lib-id :id}   {:type     collections/library-collection-type
                                                     :name     "Library"
                                                     :location "/"}
                   :model/Collection {data-id :id}  {:type     collections/library-data-collection-type
                                                     :name     "Data"
                                                     :location (format "/%d/" lib-id)}
                   :model/Collection {mets-id :id}  {:type     collections/library-metrics-collection-type
                                                     :name     "Metrics"
                                                     :location (format "/%d/" lib-id)}
                   :model/Database   {audit-db :id} {:name "Fake Audit DB"}
                   :model/Database   {real-db :id}  {:name "Non-audit DB"}
                   ;; Audit-db tables published into the Library tree — MUST be excluded.
                   :model/Table      _              {:db_id        audit-db :name "audit_events"
                                                     :active       true     :is_published true
                                                     :collection_id data-id}
                   ;; Audit-db metric card in the Library — MUST be excluded.
                   :model/Card       _              {:database_id  audit-db :type :metric :name "Audit Revenue"
                                                     :archived     false    :collection_id mets-id}
                   ;; Non-audit table in the Library — must still count.
                   :model/Table      _              {:db_id        real-db  :name "orders"
                                                     :active       true     :is_published true
                                                     :collection_id data-id}
                   ;; Non-audit metric card in the Library — must still count.
                   :model/Card       _              {:database_id  real-db  :type :metric :name "Real Revenue"
                                                     :archived     false    :collection_id mets-id}]
      (with-redefs [audit/audit-db-id audit-db]
        (let [{:keys [library]} (complexity/complexity-scores :embedder nil)]
          (is (= 2.0 (get-in library [:components :entity-count :measurement]))
              "only the two non-audit entities count (audit table + audit metric card excluded)"))))))

;; We're only reading the method table via `methods`, not calling the impure `!` fn — safe in parallel.
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(deftest ^:parallel scoring-task-registered-test
  (testing "loading the data-complexity-score init namespace registers the scoring task's `task/init!` method"
    (is (contains? (methods task/init!)
                   :metabase-enterprise.data-complexity-score.task.complexity-score/DataComplexityScoring))))

(deftest ^:parallel search-index-embedder-degrades-gracefully-test
  (testing "returns {} when semantic-search index isn't available (no throw)"
    (is (= {} (semantic-search/search-index-embedder
               [(entity :name "orders" :kind :table)])))))

(deftest ^:sequential complexity-scores-with-real-search-index-embedder-test
  (testing "complexity-scores drives the real search-index-embedder + pgvector end-to-end"
    ;; Self-gated on MB_PGVECTOR_DB_URL — CI without semantic-search infra skips this;
    ;; locally with pgvector running it exercises the pgvector read path that all other
    ;; embedder tests in this ns stub out (via mt/with-dynamic-fn-redefs on try-active-index-state /
    ;; fetch-batch). Uses `:mock-indexed` so the *embedding model* is a lookup-table — but
    ;; the resulting vectors are real rows in the index table that search-index-embedder
    ;; queries via SQL.
    (when semantic.db.datasource/db-url
      (let [captured (atom nil)]
        (mt/with-premium-features #{:semantic-search}
          (mt/as-admin
            (semantic.tu/with-test-db! {:mode :mock-indexed}
              (reset! captured (complexity/complexity-scores
                                :embedder semantic-search/search-index-embedder)))))
        (is (=? {:meta     {:embedding-model {:provider "mock" :model-name "model"}}
                 :universe {:components {:synonym-pairs {:measurement number?
                                                         :score       nat-int?}}}}
                @captured)
            "embedder returned vectors from pgvector and the synonym axis produced a real measurement")))))

(deftest ^:sequential search-index-embedder-propagates-read-failures-test
  (testing "pgvector read failures propagate so the caller can flag a degraded synonym axis"
    ;; Regression guard: before this, the embedder swallowed read exceptions and returned {}, which
    ;; looked indistinguishable from \"no synonym matches.\" A transient search-index failure
    ;; silently underreported complexity with no `:error` on the Snowplow payload.
    (mt/with-dynamic-fn-redefs [ss.embedders/try-active-index-state
                                (constantly {:pgvector :mock :table-name "t" :model nil})
                                ss.embedders/fetch-batch
                                (fn [& _] (throw (ex-info "pgvector read failed" {})))]
      (testing "the embedder itself throws rather than swallowing the failure"
        (is (thrown-with-msg? Throwable #"pgvector read failed"
                              (semantic-search/search-index-embedder
                               [{:id 1 :name "orders" :kind :table}]))))
      (testing "score-synonym-pairs converts the propagated failure into :error on the sub-score"
        (let [es [(entity :name "customers") (entity :name "clients")]]
          (is (=? {:components {:synonym-pairs {:measurement nil
                                                :score       nil
                                                :error       string?}}}
                  (#'complexity/score-catalog es semantic-search/search-index-embedder))))))))

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
    ;; Stub at fetch-batch so the real batching path executes. With batch-size 1, each entity
    ;; pair lands in its own SQL batch, so the two duplicates come back from separate partitions
    ;; and must be merged by the fold. The stub keys expected batches by `(model, model_id)`
    ;; pair-seq, so a regression in `entity-type->search-model` or any missing batch fails here.
    (let [winner-vec (float-array [1.0 0.0 0.0])
          loser-vec  (float-array [0.0 1.0 0.0])
          {:keys [unseen stub]}
          (stub-fetch-batch
           {;; table with model_id "10" (loser — higher id)
            [["table" "10"]] [{:name "Orders" :model_id "10" :model "table" :embedding loser-vec}]
            ;; table with model_id "2" (winner — lower id)
            [["table" "2"]]  [{:name "orders" :model_id "2"  :model "table" :embedding winner-vec}]})]
      (with-redefs [ss.embedders/fetch-batch-size 1]
        (mt/with-dynamic-fn-redefs [ss.embedders/try-active-index-state
                                    (constantly {:pgvector :mock :table-name "t" :model nil})
                                    ss.embedders/fetch-batch stub]
          (let [result (semantic-search/search-index-embedder
                        [{:id 10 :name "Orders" :kind :table}
                         {:id 2  :name "orders" :kind :table}])]
            (is (= 1 (count result)) "duplicate normalized names collapse to one entry")
            (is (= (seq winner-vec) (seq (get result "orders")))
                "the row with the lowest numeric model_id wins")
            (is (empty? @unseen)
                "every expected fetch-batch pair-set must be requested"))))))

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
      (with-redefs [ss.embedders/fetch-batch-size 1]
        (mt/with-dynamic-fn-redefs [ss.embedders/try-active-index-state
                                    (constantly {:pgvector :mock :table-name "t" :model nil})
                                    ss.embedders/fetch-batch stub]
          (let [result (semantic-search/search-index-embedder
                        [{:id 5 :name "Revenue" :kind :question}
                         {:id 5 :name "revenue" :kind :table}])]
            (is (= 1 (count result)))
            (is (= (seq card-vec) (seq (get result "revenue")))
                "when model_ids tie, the lexicographically smaller model wins (card < table)")
            (is (empty? @unseen)
                "every expected fetch-batch pair-set must be requested")))))))

(deftest ^:sequential search-index-embedder-cross-batch-dedup-test
  (testing "duplicates split across separate fetch batches are resolved globally"
    ;; Mock at fetch-batch so the real partition-all fold executes. With batch-size 1, each entity
    ;; pair lands in its own SQL batch. The stub is keyed by the expected `(model, model_id)`
    ;; pair-seq, so it validates the batching contract — `entity-type->search-model` mapping
    ;; (`:question` → "card", `:table` → "table") is exercised, not assumed.
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
      (with-redefs [ss.embedders/fetch-batch-size 1]
        (mt/with-dynamic-fn-redefs [ss.embedders/try-active-index-state
                                    (constantly {:pgvector :mock :table-name "t" :model nil})
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
                "every expected fetch-batch pair-set must be requested"))))))

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
      (with-redefs [ss.embedders/fetch-batch-size 1]
        (mt/with-dynamic-fn-redefs [ss.embedders/try-active-index-state
                                    (constantly {:pgvector :mock :table-name "t" :model nil})
                                    ss.embedders/fetch-batch stub]
          (let [result (semantic-search/search-index-embedder
                        [{:id 12 :name "Revenue" :kind :table}
                         {:id 5  :name "revenue" :kind :model}
                         {:id 5  :name "REVENUE" :kind :question}])]
            (is (= 1 (count result)) "all three collapse to one normalized name")
            (is (= (seq winner-vec) (seq (get result "revenue")))
                "model_id 5 + model card wins (lowest id, then lexicographic: card < dataset)")
            (is (empty? @unseen)
                "every expected fetch-batch pair-set must be requested")))))))

(deftest ^:parallel prefer-new-row-test
  (let [prefer? #'ss.embedders/prefer-new-row?]
    (are [expected? new-row prior-row]
         (expected? (prefer? new-row prior-row))
      ;; lower numeric model_id wins
      true?  {:mid 2  :model_id "2"  :model "card"}   {:mid 10 :model_id "10" :model "card"}
      false? {:mid 10 :model_id "10" :model "card"}   {:mid 2  :model_id "2"  :model "card"}
      ;; equal model_ids tie-break on model name
      true?  {:mid 5  :model_id "5"  :model "card"}   {:mid 5  :model_id "5"  :model "table"}
      false? {:mid 5  :model_id "5"  :model "table"}  {:mid 5  :model_id "5"  :model "card"}
      ;; same parsed number but different raw strings → tie-break on raw model_id before model
      true?  {:mid 2  :model_id "02" :model "card"}   {:mid 2  :model_id "2"  :model "card"}
      false? {:mid 2  :model_id "2"  :model "card"}   {:mid 2  :model_id "02" :model "card"}
      ;; numeric always beats non-numeric
      true?  {:mid 99 :model_id "99" :model "card"}   {:mid nil :model_id "abc" :model "card"}
      false? {:mid nil :model_id "abc" :model "card"}  {:mid 1  :model_id "1"   :model "card"}
      ;; both non-numeric: lexicographic on model_id string
      true?  {:mid nil :model_id "abc" :model "card"}  {:mid nil :model_id "xyz" :model "card"}
      false? {:mid nil :model_id "xyz" :model "card"}  {:mid nil :model_id "abc" :model "card"})))

(deftest ^:sequential meta-embedding-model-absent-when-unavailable-test
  (mt/with-dynamic-fn-redefs [complexity/enumerate-catalogs
                              (constantly {:library [] :universe [] :metabot []})]
    (testing ":embedding-model key is absent from :meta when the search index is unreachable"
      (mt/with-dynamic-fn-redefs [ss.embedders/try-active-index-state (constantly nil)]
        ;; Pass the real search-index-embedder so the identity check in complexity-scores succeeds,
        ;; but the embedder returns {} because try-active-index-state is nil.
        (let [{:keys [meta]} (complexity/complexity-scores :embedder semantic-search/search-index-embedder)]
          (is (not (contains? meta :embedding-model))))))
    (testing ":embedding-model key is present in :meta when the active model is non-nil"
      (mt/with-dynamic-fn-redefs [ss.embedders/try-active-index-state
                                  (constantly {:pgvector   :mock
                                               :table-name "mock_table"
                                               :model      {:provider   "openai"
                                                            :model-name "text-embedding-3-small"}})
                                  ss.embedders/fetch-batch (constantly [])]
        (let [{:keys [meta]} (complexity/complexity-scores :embedder semantic-search/search-index-embedder)]
          (is (= {:provider "openai" :model-name "text-embedding-3-small"}
                 (:embedding-model meta))))))))

(deftest ^:sequential active-embedding-model-reads-from-active-index-test
  (testing "active-embedding-model returns the model from the active index, not the configured setting"
    (let [active-model {:provider "openai" :model-name "text-embedding-ada-002"}]
      (mt/with-dynamic-fn-redefs [ss.embedders/try-active-index-state
                                  (constantly {:pgvector   :mock
                                               :table-name "mock_table"
                                               :model      active-model})]
        (is (= {:provider "openai" :model-name "text-embedding-ada-002"}
               (semantic-search/active-embedding-model))))))
  (testing "active-embedding-model returns nil when the index state has no model"
    (mt/with-dynamic-fn-redefs [ss.embedders/try-active-index-state
                                (constantly {:pgvector   :mock
                                             :table-name "mock_table"
                                             :model      nil})]
      (is (nil? (semantic-search/active-embedding-model)))))
  (testing "active-embedding-model returns nil when the index is unreachable"
    (mt/with-dynamic-fn-redefs [ss.embedders/try-active-index-state (constantly nil)]
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
      (mt/with-dynamic-fn-redefs [complexity/enumerate-catalogs
                                  (constantly {:library  [(entity :name "orders")
                                                          (entity :name "customers")]
                                               :universe [(entity :name "orders")
                                                          (entity :name "customers")
                                                          (entity :name "widgets")]
                                               :metabot  []})]
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
      (mt/with-dynamic-fn-redefs [complexity/enumerate-catalogs
                                  (constantly {:library  [(entity :name "orders"  :field-count 2)
                                                          (entity :name "orders"  :field-count 0)
                                                          (entity :name "widgets" :field-count 3)]
                                               :universe []
                                               :metabot  []})]
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

(deftest ^:sequential emit-snowplow-cascades-nil-on-embedder-failure-test
  (testing "embedder failure cascades nil through aggregates without skipping any events"
    (snowplow-test/with-fake-snowplow-collector
      (mt/with-dynamic-fn-redefs [complexity/enumerate-catalogs
                                  (constantly {:library  [(entity :name "customers")
                                                          (entity :name "clients")]
                                               :universe []
                                               :metabot  []})]
        (snowplow-test/pop-event-data-and-user-id!)
        (complexity/complexity-scores :embedder (fn [_] (throw (ex-info "embedder boom" {}))))
        (let [by-key (->> (complexity-events!)
                          (filter #(= "library" (get % "catalog")))
                          (into {} (map (juxt #(get % "key") identity))))]
          (testing ":error from the synonym-pair scorer reaches the Snowplow leaf event"
            (is (= "embedder boom" (get-in by-key ["ambiguity.synonym_pairs" "error"]))))
          (testing ":error is only present on the originating leaf — aggregates use null score instead"
            (is (not-any? #(contains? % "error")
                          (vals (dissoc by-key "ambiguity.synonym_pairs")))))
          (testing "the failed leaf publishes null :score (no zero-fallback)"
            (is (nil? (get-in by-key ["ambiguity.synonym_pairs" "score"]))))
          (testing "aggregates that include the failed leaf cascade null :score"
            (is (nil? (get-in by-key ["ambiguity.total" "score"])))
            (is (nil? (get-in by-key ["total"           "score"]))))
          (testing "unaffected aggregates keep their numeric :score (cascade is leaf-scoped, not catalog-wide)"
            ;; size group has no synonym dependency, so its rollup must still be a real number even
            ;; when ambiguity falls through. Catches a regression where the cascade goes too far.
            (is (number? (get-in by-key ["size.total" "score"])))))))))

(deftest ^:sequential emit-snowplow-truncates-error-to-schema-max-test
  (testing "a pathologically long exception message is truncated so it doesn't fail schema validation"
    (snowplow-test/with-fake-snowplow-collector
      (mt/with-dynamic-fn-redefs [complexity/enumerate-catalogs
                                  (constantly {:library  [(entity :name "customers")
                                                          (entity :name "clients")]
                                               :universe []
                                               :metabot  []})]
        (snowplow-test/pop-event-data-and-user-id!)
        (let [huge (apply str (repeat 5000 "x"))]
          (complexity/complexity-scores :embedder (fn [_] (throw (ex-info huge {}))))
          (let [err (->> (complexity-events!)
                         (filter #(= "ambiguity.synonym_pairs" (get % "key")))
                         first
                         (#(get % "error")))]
            (is (= 1024 (count err))
                "error is clipped to the schema's maxLength of 1024")))))))

(deftest ^:sequential emit-snowplow-includes-embedding-model-meta-test
  (testing "every event's parameters carry embedding_model_provider/name when the search-index embedder is active"
    (snowplow-test/with-fake-snowplow-collector
      (mt/with-dynamic-fn-redefs [ss.embedders/try-active-index-state
                                  (constantly {:pgvector   :mock
                                               :table-name "mock_table"
                                               :model      {:provider   "openai"
                                                            :model-name "text-embedding-3-small"}})
                                  ss.embedders/fetch-batch (constantly [])
                                  complexity/enumerate-catalogs
                                  (constantly {:library  [(entity :name "orders")]
                                               :universe [(entity :name "orders")]
                                               :metabot  []})]
        (snowplow-test/pop-event-data-and-user-id!)
        (complexity/complexity-scores :embedder semantic-search/search-index-embedder)
        (let [events (complexity-events!)]
          (is (seq events) "sanity: events were emitted")
          (is (every? #(= "openai" (get-in % ["parameters" "embedding_model_provider"])) events))
          (is (every? #(= "text-embedding-3-small" (get-in % ["parameters" "embedding_model_name"])) events)))))))

(deftest ^:sequential emit-snowplow-failure-is-swallowed-test
  (testing "emission failure is caught; complexity-scores still returns the score and logs a warning"
    (mt/with-dynamic-fn-redefs [complexity/enumerate-catalogs
                                (constantly {:library  [(entity :name "orders")]
                                             :universe [(entity :name "orders")]
                                             :metabot  []})
                                analytics/track-event!       (fn [& _] (throw (RuntimeException. "snowplow down")))]
      (mt/with-log-messages-for-level [messages [metabase-enterprise.data-complexity-score.complexity :warn]]
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
    (mt/with-dynamic-fn-redefs [complexity/enumerate-catalogs
                                (constantly {:library  [(entity :name "orders")]
                                             :universe [(entity :name "orders")]
                                             :metabot  []})
                                analytics/track-event!       (fn [& _] (throw (RuntimeException. "snowplow down")))]
      (mt/with-log-messages-for-level [messages [metabase-enterprise.data-complexity-score.complexity :info]]
        (complexity/complexity-scores :embedder nil)
        (is (some #(and (= :info (:level %))
                        (re-find #"Semantic complexity score" (:message %)))
                  (messages))
            "the score was logged locally at :info even though Snowplow emission threw")))))

(deftest ^:sequential scheduled-task-logs-score-test
  (testing "the scheduled task body runs complexity-scores so operators see a score line in the logs"
    (mt/with-dynamic-fn-redefs [complexity/enumerate-catalogs
                                (constantly {:library  [(entity :name "orders")]
                                             :universe [(entity :name "orders")]
                                             :metabot  []})]
      (mt/with-temporary-setting-values [data-complexity-scoring-enabled true]
        (mt/with-log-messages-for-level [messages [metabase-enterprise.data-complexity-score.complexity :info]]
          (#'task.complexity-score/run-scoring! "test-fp")
          (is (some #(and (= :info (:level %))
                          (re-find #"Semantic complexity score" (:message %)))
                    (messages))
              "the scheduled task produced the expected info log"))))))

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
            {:keys [library universe]} (complexity/complexity-scores :embedder embedder)]
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

(defn- stub-result
  "Build a `complexity/complexity-scores` stand-in whose metadata records whether publishing worked."
  [published?]
  (with-meta
   {:library {:total 0 :components {}} :universe {:total 0 :components {}}
    :metabot {:total 0 :components {}} :meta {}}
   {:metabase-enterprise.data-complexity-score.complexity/snowplow-published? published?}))

(deftest ^:sequential run-scoring-persists-fingerprint-only-on-successful-publish-test
  (testing "fingerprint advances only when Snowplow accepted the event — failed publish must leave
           the stale fingerprint in place so the next boot / cron retries"
    (mt/with-dynamic-fn-redefs [metabot-scope/internal-metabot-scope (constantly {})]
      (testing "successful publish → fingerprint advances to the claim's fingerprint"
        (mt/with-temporary-setting-values [data-complexity-scoring-enabled        true
                                           data-complexity-scoring-last-fingerprint "stale"]
          (mt/with-dynamic-fn-redefs [complexity/complexity-scores (fn [& _] (stub-result true))]
            (#'task.complexity-score/run-scoring! "fresh-fp")
            (is (= "fresh-fp" (data-complexity-score.settings/data-complexity-scoring-last-fingerprint))
                "fingerprint stamped from the claim fingerprint, not re-sampled at commit time"))))
      (testing "failed publish → fingerprint stays at the stale value for the next retry"
        (mt/with-temporary-setting-values [data-complexity-scoring-enabled        true
                                           data-complexity-scoring-last-fingerprint "stale"]
          (mt/with-dynamic-fn-redefs [complexity/complexity-scores (fn [& _] (stub-result false))]
            (#'task.complexity-score/run-scoring! "fresh-fp")
            (is (= "stale" (data-complexity-score.settings/data-complexity-scoring-last-fingerprint))
                "fingerprint preserved — next boot / cron will retry the emission")))))))

(deftest ^:sequential maybe-emit-boot-score-only-advances-fingerprint-on-successful-publish-test
  (testing "boot-time emission never advances the last-successful fingerprint on failure — the
           success fingerprint is separate from the in-progress scoring claim, so a scoring/publish
           failure (or a crash mid-run) leaves the fingerprint stale and the next boot retries"
    (mt/with-dynamic-fn-redefs [metabot-scope/internal-metabot-scope (constantly {})]
      (testing "publish failure → fingerprint stays at the stale value (and claim is cleared)"
        (mt/with-temporary-setting-values [data-complexity-scoring-enabled        true
                                           data-complexity-scoring-last-fingerprint "stale"
                                           data-complexity-scoring-claim          ""]
          (mt/with-dynamic-fn-redefs [complexity/complexity-scores (fn [& _] (stub-result false))]
            (task.complexity-score/maybe-emit-boot-score!)
            (is (= "stale" (data-complexity-score.settings/data-complexity-scoring-last-fingerprint))
                "fingerprint unchanged — next boot/cron will retry the emission")
            (is (= "" (data-complexity-score.settings/data-complexity-scoring-claim))
                "scoring claim released so other paths can proceed without waiting for TTL"))))
      (testing "publish success → fingerprint advances to the new value (and claim is cleared)"
        (mt/with-temporary-setting-values [data-complexity-scoring-enabled        true
                                           data-complexity-scoring-last-fingerprint "stale"
                                           data-complexity-scoring-claim          ""]
          (mt/with-dynamic-fn-redefs [complexity/complexity-scores (fn [& _] (stub-result true))]
            (task.complexity-score/maybe-emit-boot-score!)
            (is (not= "stale" (data-complexity-score.settings/data-complexity-scoring-last-fingerprint))
                "fingerprint advanced to reflect the confirmed publish")
            (is (= "" (data-complexity-score.settings/data-complexity-scoring-claim))
                "scoring claim released after successful run")))))))

(deftest ^:sequential maybe-emit-boot-score-skips-when-another-path-holds-active-claim-test
  (testing "a fresh scoring claim (from a sibling node OR a concurrent cron tick) blocks duplicate
           emission on this node, even when the last-successful fingerprint is stale — prevents
           the boot and cron paths from both computing and publishing for the same fingerprint"
    (mt/with-dynamic-fn-redefs [metabot-scope/internal-metabot-scope (constantly {})]
      (let [current-fp (#'task.complexity-score/current-fingerprint)
            ;; Serialize a sibling/cron claim for the same fingerprint, timestamped just now so
            ;; it's well inside the TTL.
            active-claim (pr-str {:fingerprint current-fp :claimed-at (#'task.complexity-score/now-ms)})
            scoring-ran? (atom false)]
        (mt/with-temporary-setting-values [data-complexity-scoring-enabled        true
                                           data-complexity-scoring-last-fingerprint "stale"
                                           data-complexity-scoring-claim          active-claim]
          (mt/with-dynamic-fn-redefs [complexity/complexity-scores
                                      (fn [& _] (reset! scoring-ran? true) (stub-result true))]
            (task.complexity-score/maybe-emit-boot-score!)
            (is (false? @scoring-ran?)
                "scoring skipped because another path already claimed the current fingerprint")
            (is (= "stale" (data-complexity-score.settings/data-complexity-scoring-last-fingerprint))
                "fingerprint untouched when the claim is skipped")
            (is (= active-claim (data-complexity-score.settings/data-complexity-scoring-claim))
                "other path's claim is preserved (we never took it, so we don't clear it)")))))))

(deftest ^:sequential maybe-emit-boot-score-reclaims-when-prior-claim-has-expired-test
  (testing "an expired (TTL-exceeded) scoring claim must not permanently suppress scoring — a
           crashed or orphaned claim from a prior run should be replaced and scoring proceed"
    (mt/with-dynamic-fn-redefs [metabot-scope/internal-metabot-scope (constantly {})]
      (let [current-fp (#'task.complexity-score/current-fingerprint)
            ;; 1 hour ago — older than the 30-minute TTL, so this claim is treated as orphaned.
            expired-claim (pr-str {:fingerprint current-fp
                                   :claimed-at (- (#'task.complexity-score/now-ms)
                                                  (* 60 60 1000))})
            scoring-ran? (atom false)]
        (mt/with-temporary-setting-values [data-complexity-scoring-enabled        true
                                           data-complexity-scoring-last-fingerprint "stale"
                                           data-complexity-scoring-claim          expired-claim]
          (mt/with-dynamic-fn-redefs [complexity/complexity-scores
                                      (fn [& _] (reset! scoring-ran? true) (stub-result true))]
            (task.complexity-score/maybe-emit-boot-score!)
            (is (true? @scoring-ran?)
                "scoring ran because the prior claim had aged past the TTL")
            (is (not= "stale" (data-complexity-score.settings/data-complexity-scoring-last-fingerprint))
                "fingerprint advanced on successful publish after re-claim")))))))

(deftest ^:sequential maybe-emit-boot-score-does-not-clear-sibling-claim-after-ttl-takeover-test
  (testing "if our run outlives the TTL and another path legitimately re-claims, the original
           claimant's release-scoring-claim! must NOT wipe the replacement claim — doing so would
           reopen the duplicate-publish race (a third node/path would see no claim and run again)"
    (mt/with-dynamic-fn-redefs [metabot-scope/internal-metabot-scope (constantly {})]
      ;; Stub scoring so that while this node is mid-run the persisted claim is replaced with a
      ;; sibling's fresh claim (different :owner). This simulates: our run hung past the 30-min
      ;; TTL → sibling saw an expired claim → sibling wrote its own → our run finally returns.
      (let [sibling-claim (pr-str {:fingerprint (#'task.complexity-score/current-fingerprint)
                                   :claimed-at  (System/currentTimeMillis)
                                   :owner       "sibling-node-owner-token"})]
        (mt/with-temporary-setting-values [data-complexity-scoring-enabled          true
                                           data-complexity-scoring-last-fingerprint "stale"
                                           data-complexity-scoring-claim            ""]
          (mt/with-dynamic-fn-redefs [complexity/complexity-scores
                                      (fn [& _]
                                        (data-complexity-score.settings/data-complexity-scoring-claim! sibling-claim)
                                        (stub-result true))]
            (task.complexity-score/maybe-emit-boot-score!)
            (is (= sibling-claim (data-complexity-score.settings/data-complexity-scoring-claim))
                "replacement claim preserved — our release was a compare-and-clear and the owners didn't match")))))))

(deftest ^:sequential cron-skips-when-boot-run-holds-active-claim-test
  (testing "the cron job's scoring call skips when the boot-time run is already mid-flight for the
           current fingerprint — the shared claim protocol serializes the two paths so they can't
           both compute and publish in parallel"
    (mt/with-dynamic-fn-redefs [metabot-scope/internal-metabot-scope (constantly {})]
      (let [current-fp (#'task.complexity-score/current-fingerprint)
            boot-claim (pr-str {:fingerprint current-fp
                                :claimed-at  (#'task.complexity-score/now-ms)
                                :owner       "boot-path-owner-token"})
            scoring-ran? (atom false)]
        (mt/with-temporary-setting-values [data-complexity-scoring-enabled          true
                                           data-complexity-scoring-last-fingerprint "stale"
                                           data-complexity-scoring-claim            boot-claim]
          (mt/with-dynamic-fn-redefs [complexity/complexity-scores
                                      (fn [& _] (reset! scoring-ran? true) (stub-result true))]
            ;; Exercise the cron's code path via the shared helper — this is exactly what the
            ;; Quartz job body calls. Re-sampling current-fingerprint does not matter because the
            ;; live value matches the one the boot path claimed.
            (#'task.complexity-score/with-scoring-claim! {} #'task.complexity-score/run-scoring!)
            (is (false? @scoring-ran?)
                "cron tick skipped because the boot run holds the scoring claim")
            (is (= boot-claim (data-complexity-score.settings/data-complexity-scoring-claim))
                "boot's claim preserved — cron never took it, so it doesn't clear it")))))))

(deftest ^:sequential complexity-scores-tags-publish-success-on-result-test
  (testing "complexity-scores stamps publish success/failure via metadata for schedule/boot callers"
    (mt/with-dynamic-fn-redefs [complexity/enumerate-catalogs
                                (constantly {:library [] :universe [] :metabot []})]
      (testing "successful publish → ::snowplow-published? true"
        (snowplow-test/with-fake-snowplow-collector
          (let [result (complexity/complexity-scores :embedder nil)]
            (is (true? (:metabase-enterprise.data-complexity-score.complexity/snowplow-published?
                        (meta result)))))))
      (testing "publish throw → ::snowplow-published? false (and the result is still returned)"
        (mt/with-dynamic-fn-redefs [analytics/track-event! (fn [& _] (throw (RuntimeException. "snowplow down")))]
          (let [result (complexity/complexity-scores :embedder nil)]
            (is (false? (:metabase-enterprise.data-complexity-score.complexity/snowplow-published?
                         (meta result)))))))
      (testing "snowplow disabled → ::snowplow-published? false so the fingerprint stays unadvanced"
        ;; `track-event!` no-ops when anon-tracking is off; without a real-delivery signal it would
        ;; look indistinguishable from a successful publish and the fingerprint would advance,
        ;; silently suppressing the boot-time retry once tracking is turned back on.
        (mt/with-temporary-setting-values [anon-tracking-enabled false]
          (let [result (complexity/complexity-scores :embedder nil)]
            (is (false? (:metabase-enterprise.data-complexity-score.complexity/snowplow-published?
                         (meta result))))))))))
;;; ---------------------- provider-embedder + synonym-axis settings ----------------------

(deftest ^:parallel provider-embedder-nil-when-config-incomplete-test
  (testing "provider-embedder returns nil when :provider or :model-name is missing/blank"
    (is (nil? (embedders/provider-embedder {})))
    (is (nil? (embedders/provider-embedder {:provider "ollama"})))
    (is (nil? (embedders/provider-embedder {:model-name "all-minilm"})))
    (is (nil? (embedders/provider-embedder {:provider "" :model-name "x"})))
    (is (nil? (embedders/provider-embedder {:provider "ollama" :model-name ""})))))

(deftest ^:sequential provider-embedder-routes-to-get-embeddings-batch-test
  (testing "provider-embedder forwards to get-embeddings-batch with the given embedding-model map"
    (let [captured  (atom nil)
          model     {:provider "ollama" :model-name "all-minilm" :vector-dimensions 384}
          stub-fn   (fn [embedding-model names]
                      (reset! captured {:embedding-model embedding-model :names names})
                      (mapv (fn [_] (float-array [1.0 2.0 3.0])) names))]
      (with-redefs [semantic-search/get-embeddings-batch stub-fn]
        (let [embedder (embedders/provider-embedder model)
              result   (embedder [{:name "Orders"} {:name "Customers"}])]
          (is (= model (:embedding-model @captured)))
          (is (= ["orders" "customers"] (:names @captured)))
          (is (= 2 (count result)))
          (is (every? #(= 3 (alength ^floats (val %))) result)))))))

(deftest ^:sequential provider-embedder-returns-empty-map-on-error-test
  (testing "provider-embedder catches thrown errors from get-embeddings-batch and yields {}"
    (with-redefs [semantic-search/get-embeddings-batch (fn [& _] (throw (ex-info "boom" {})))]
      (let [embedder (embedders/provider-embedder
                      {:provider "ollama" :model-name "all-minilm" :vector-dimensions 384})]
        (is (= {} (embedder [{:name "Orders"}])))))))

(deftest ^:parallel default-threshold-for-minilm-test
  (testing "default threshold is 0.80 for ollama + MiniLM model names (case-insensitive)"
    (is (= 0.80 (#'complexity/default-threshold-for "ollama" "all-minilm")))
    (is (= 0.80 (#'complexity/default-threshold-for "ollama" "all-MiniLM-L6-v2")))
    (is (= 0.80 (#'complexity/default-threshold-for "ollama" "sentence-transformers/all-MiniLM-L6-v2"))))
  (testing "falls back to the Arctic-calibrated 0.90 default otherwise"
    (is (= 0.90 (#'complexity/default-threshold-for "ollama" "mxbai-embed-large")))
    (is (= 0.90 (#'complexity/default-threshold-for "ai-service" "all-minilm")))
    (is (= 0.90 (#'complexity/default-threshold-for nil nil)))))

(deftest ^:sequential complexity-scores-routes-synonym-axis-via-settings-test
  (testing "setting ee-complexity-synonym-provider + model-name routes the axis through provider-embedder"
    (let [captured   (atom nil)
          stub-batch (fn [embedding-model names]
                       (reset! captured {:embedding-model embedding-model :names names})
                       ;; Return unit vectors keyed so that "customers" and "clients" form a synonym pair.
                       (mapv (fn [n]
                               (cond
                                 (= n "customers") (float-array [1.0 0.0])
                                 (= n "clients")   (float-array [0.99 0.14])
                                 :else             (float-array [0.0 1.0])))
                             names))]
      (mt/with-temporary-setting-values [ee-complexity-synonym-provider         "ollama"
                                         ee-complexity-synonym-model-name       "all-minilm"
                                         ee-complexity-synonym-model-dimensions 2]
        (with-redefs [semantic-search/get-embeddings-batch stub-batch]
          (mt/with-dynamic-fn-redefs [complexity/library-entities  (constantly [(entity :name "customers")
                                                                                (entity :name "clients")])
                                      complexity/universe-entities (constantly [(entity :name "customers")
                                                                                (entity :name "clients")])]
            (let [{:keys [library meta]} (complexity/complexity-scores)]
              (testing "provider-embedder reached get-embeddings-batch with the configured model"
                (is (= {:provider "ollama" :model-name "all-minilm" :vector-dimensions 2}
                       (:embedding-model @captured)))
                (is (= #{"customers" "clients"} (set (:names @captured)))))
              (testing ":meta reflects the configured provider/model and the MiniLM-calibrated threshold"
                (is (=? {:embedding-model {:provider "ollama" :model-name "all-minilm"}
                         :synonym-threshold 0.80}
                        meta)))
              (testing "the synonym pair was detected (cosine ≈ 0.99 > 0.80 threshold)"
                (is (= 1.0 (get-in library [:components :synonym-pairs :measurement])))))))))))

(deftest ^:sequential complexity-scores-honours-threshold-override-test
  (testing "ee-complexity-synonym-threshold overrides the provider-default threshold"
    (let [stub-batch (fn [_ names]
                       (mapv (fn [n]
                               (cond
                                 (= n "customers") (float-array [1.0 0.0])
                                 (= n "clients")   (float-array [0.99 0.14])
                                 :else             (float-array [0.0 1.0])))
                             names))]
      (mt/with-temporary-setting-values [ee-complexity-synonym-provider         "ollama"
                                         ee-complexity-synonym-model-name       "all-minilm"
                                         ee-complexity-synonym-model-dimensions 2
                                         ;; Force an override above the ~0.99 similarity — the pair should disappear.
                                         ee-complexity-synonym-threshold        0.999]
        (with-redefs [semantic-search/get-embeddings-batch stub-batch]
          (mt/with-dynamic-fn-redefs [complexity/library-entities  (constantly [(entity :name "customers")
                                                                                (entity :name "clients")])
                                      complexity/universe-entities (constantly [])]
            (let [{:keys [library meta]} (complexity/complexity-scores)]
              (is (= 0.999 (:synonym-threshold meta)))
              (is (= 0.0 (get-in library [:components :synonym-pairs :measurement]))))))))))

(deftest ^:sequential complexity-scores-default-path-unchanged-test
  (testing "with no synonym-axis settings set, the default path still uses search-index-embedder and 0.90"
    (mt/with-dynamic-fn-redefs [complexity/library-entities  (constantly [(entity :name "orders")])
                                complexity/universe-entities (constantly [(entity :name "orders")])]
      (with-redefs [ss.embedders/try-active-index-state (constantly nil)]
        (let [{:keys [meta]} (complexity/complexity-scores)]
          (testing ":synonym-threshold is the Arctic-calibrated default"
            (is (= 0.90 (:synonym-threshold meta))))
          (testing ":embedding-model is omitted when the index is unreachable"
            (is (not (contains? meta :embedding-model)))))))))

(deftest ^:sequential complexity-scores-explicit-embedder-uses-default-threshold-test
  (testing "passing an explicit :embedder bypasses the settings and uses the default threshold"
    (mt/with-temporary-setting-values [ee-complexity-synonym-provider   "ollama"
                                       ee-complexity-synonym-model-name "all-minilm"
                                       ee-complexity-synonym-model-dimensions 2
                                       ;; Also set a threshold override that the explicit-embedder path
                                       ;; must ignore — pinned embedders are for reproducible benchmarks
                                       ;; and shouldn't drift with unrelated instance settings.
                                       ee-complexity-synonym-threshold  0.55]
      (mt/with-dynamic-fn-redefs [complexity/library-entities  (constantly [(entity :name "orders")])
                                  complexity/universe-entities (constantly [(entity :name "orders")])]
        (let [{:keys [meta]} (complexity/complexity-scores :embedder nil)]
          (testing "explicit :embedder nil ignores ee-complexity-synonym-threshold and uses the default"
            (is (= 0.90 (:synonym-threshold meta)))))))))

(deftest ^:sequential complexity-scores-explicit-embedder-accepts-threshold-opt-test
  (testing "explicit :embedder paired with :threshold uses the supplied cutoff"
    (let [es       [(entity :name "customers") (entity :name "clients")]
          embedder (mock-embedder {"customers" [1.0 0.0]
                                   "clients"   [0.9 0.1]})]
      (mt/with-dynamic-fn-redefs [complexity/library-entities  (constantly es)
                                  complexity/universe-entities (constantly [])]
        (testing "a high :threshold rejects the pair"
          (let [{:keys [library meta]} (complexity/complexity-scores
                                        :embedder  embedder
                                        :threshold 0.99)]
            (is (= 0.99 (:synonym-threshold meta)))
            (is (= 0 (get-in library [:components :synonym-pairs :pairs])))))
        (testing "a low :threshold accepts the pair"
          (let [{:keys [library meta]} (complexity/complexity-scores
                                        :embedder  embedder
                                        :threshold 0.5)]
            (is (= 0.5 (:synonym-threshold meta)))
            (is (= 1 (get-in library [:components :synonym-pairs :pairs])))))))))

;;; ---------------------- synonym-config validation ----------------------

(deftest ^:parallel validate-synonym-config-test
  (let [validate #'complexity/validate-synonym-config]
    (testing "fully blank config returns nil (opt-out — no warning expected)"
      (is (nil? (validate {:provider nil        :model-name nil        :vector-dimensions nil})))
      (is (nil? (validate {:provider ""         :model-name "  "       :vector-dimensions nil}))))
    (testing "trims whitespace on provider and model-name when valid"
      (is (= {:provider "ollama" :model-name "all-minilm" :vector-dimensions 384}
             (validate {:provider "  ollama  " :model-name " all-minilm " :vector-dimensions 384}))))
    (testing "rejects unknown providers (typo-safe)"
      (is (nil? (validate {:provider "olama"   :model-name "all-minilm" :vector-dimensions 384})))
      (is (nil? (validate {:provider "OpenAI"  :model-name "text-embedding-3-small" :vector-dimensions 256}))))
    (testing "rejects half-configured settings (one of provider/model-name blank)"
      (is (nil? (validate {:provider "ollama"  :model-name nil         :vector-dimensions 384})))
      (is (nil? (validate {:provider ""        :model-name "all-minilm" :vector-dimensions 384}))))
    (testing "openai text-embedding-3* models require vector-dimensions"
      (is (nil? (validate {:provider "openai" :model-name "text-embedding-3-small" :vector-dimensions nil})))
      (is (nil? (validate {:provider "openai" :model-name "text-embedding-3-large" :vector-dimensions 0})))
      (is (=? {:provider "openai" :model-name "text-embedding-3-small" :vector-dimensions 512}
              (validate {:provider "openai" :model-name "text-embedding-3-small" :vector-dimensions 512}))))
    (testing "providers/models that don't forward :dimensions don't need vector-dimensions"
      (is (=? {:provider "ollama" :model-name "all-minilm"}
              (validate {:provider "ollama" :model-name "all-minilm" :vector-dimensions nil})))
      (is (=? {:provider "openai" :model-name "text-embedding-ada-002"}
              (validate {:provider "openai" :model-name "text-embedding-ada-002" :vector-dimensions nil}))))))

(deftest ^:sequential complexity-scores-invalid-provider-falls-back-test
  (testing "unknown provider disables the custom embedder and leaves :embedding-model unset"
    (let [batch-called? (atom false)]
      (mt/with-temporary-setting-values [ee-complexity-synonym-provider   "olama"   ; typo
                                         ee-complexity-synonym-model-name "all-minilm"
                                         ee-complexity-synonym-model-dimensions 384]
        (with-redefs [semantic-search/get-embeddings-batch (fn [& _] (reset! batch-called? true) [])
                      ss.embedders/try-active-index-state  (constantly nil)]
          (mt/with-dynamic-fn-redefs [complexity/library-entities  (constantly [(entity :name "orders")])
                                      complexity/universe-entities (constantly [(entity :name "orders")])]
            (let [{:keys [meta]} (complexity/complexity-scores)]
              (is (false? @batch-called?)
                  "provider-embedder should not be reached with an unsupported provider")
              (is (not (contains? meta :embedding-model))
                  ":meta must not advertise a model the synonym axis never reached")
              (is (= 0.90 (:synonym-threshold meta))
                  "falls back to the Arctic-calibrated default threshold"))))))))

(deftest ^:sequential complexity-scores-openai-text-embedding-3-requires-dims-test
  (testing "openai text-embedding-3-* without dimensions falls back to search-index embedder"
    (let [batch-called? (atom false)]
      (mt/with-temporary-setting-values [ee-complexity-synonym-provider   "openai"
                                         ee-complexity-synonym-model-name "text-embedding-3-small"
                                         ee-complexity-synonym-model-dimensions nil]
        (with-redefs [semantic-search/get-embeddings-batch (fn [& _] (reset! batch-called? true) [])
                      ss.embedders/try-active-index-state  (constantly nil)]
          (mt/with-dynamic-fn-redefs [complexity/library-entities  (constantly [(entity :name "orders")])
                                      complexity/universe-entities (constantly [(entity :name "orders")])]
            (let [{:keys [meta]} (complexity/complexity-scores)]
              (is (false? @batch-called?)
                  "get-embeddings-batch would send dimensions: null and fail; must not be reached")
              (is (not (contains? meta :embedding-model))
                  ":embedding-model must be absent when the config failed validation"))))))))
