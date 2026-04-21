(ns metabase-enterprise.data-complexity-score.cli-test
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.cli :as cli]
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase-enterprise.data-complexity-score.complexity-embedders :as embedders]
   [metabase-enterprise.data-complexity-score.representation :as representation]
   [metabase.audit-app.core :as audit]
   [metabase.util.json :as json]))

(def ^:private fixture-1-dir
  "enterprise/backend/test_resources/data_complexity_score/complexity_fixture_1")

(deftest ^:parallel fixture-1-scores-deterministically-test
  (testing "loading fixture_1 and scoring produces the totals + sub-scores we designed it for"
    ;; Fixture contents summary:
    ;;   Library     — 4 tables (orders, subscriptions, clients, customers) + 2 metric cards
    ;;                 (Revenue x2).
    ;;   Non-library — audit_events + audit_log tables, a third Revenue card in the Outside collection.
    ;;   Embeddings  — orthogonal except clients≈customers (library synonym) and
    ;;                 audit_events≈audit_log (extra universe-only synonym).
    ;;   Measures    — "revenue" on orders + subscriptions (library repeat) plus a third on
    ;;                 audit_events (extra universe repeat).
    (let [result (#'cli/run-cli {:representation-dir fixture-1-dir})]
      (testing "library score matches the hand-derived total"
        (is (= {:total      215
                :components {:entity-count      {:count 6 :score 60}
                             :name-collisions   {:pairs 1 :score 100}
                             :synonym-pairs     {:pairs 1 :score 50}
                             :field-count       {:count 3 :score 3}
                             :repeated-measures {:count 1 :score 2}}}
               (:library result))))
      (testing "universe score matches the hand-derived total"
        (is (= {:total      399
                :components {:entity-count      {:count 9 :score 90}
                             :name-collisions   {:pairs 2 :score 200}
                             :synonym-pairs     {:pairs 2 :score 100}
                             :field-count       {:count 5 :score 5}
                             :repeated-measures {:count 2 :score 4}}}
               (:universe result))))
      (testing "meta has formula-version + threshold but no :embedding-model (offline mode)"
        (is (= {:formula-version   2
                :synonym-threshold 0.9}
               (:meta result)))))))

(deftest ^:parallel run-cli-writes-readable-edn-to-output-file-test
  (testing "--output path gets a readable EDN dump of the same result"
    (let [tmp (doto (java.io.File/createTempFile "complexity-cli-output-" ".edn") .deleteOnExit)]
      ;; Call internals instead of -main, which terminates the JVM via System/exit.
      (#'cli/write-result! (#'cli/run-cli {:representation-dir fixture-1-dir})
                           (.getAbsolutePath tmp))
      (is (= 215 (-> (slurp tmp) edn/read-string :library :total))))))

(deftest ^:parallel file-embedder-test
  (testing "file-embedder converts seqs to ^floats, preserves already-typed arrays, omits absent names"
    (let [input     {"a" [1.0 0.0] "b" (float-array [0.0 1.0])}
          embedder  (embedders/file-embedder input)
          result    (embedder [{:name "Any"}])]
      (testing "same keys as input (the embedder ignores entities — scoring does the filtering)"
        (is (= #{"a" "b"} (set (keys result)))))
      (testing "both values round-trip to the expected vectors"
        (is (= [1.0 0.0] (vec (get result "a"))))
        (is (= [0.0 1.0] (vec (get result "b")))))))
  (testing "raw display-name keys (mixed case, surrounding whitespace) are normalized so scoring matches"
    (let [embedder (embedders/file-embedder {"Revenue" [1.0 0.0] " Orders " [0.0 1.0]})
          result   (embedder [{:name "Revenue"} {:name "orders"}])]
      (is (= #{"revenue" "orders"} (set (keys result))))
      (is (= [1.0 0.0] (vec (get result "revenue"))))
      (is (= [0.0 1.0] (vec (get result "orders")))))))

(deftest ^:parallel raw-embedding-keys-normalize-through-offline-scorer-test
  (testing "End-to-end: embeddings.json with mixed-case/whitespace-padded keys still produces the"
    (testing "expected synonym match after load-dir + run-cli."
      ;; Two tables whose normalized names are "alpha"/"beta" but whose embedding keys are spelled
      ;; "ALPHA" and " Beta " in the JSON. If the loader→embedder→scorer path doesn't normalize
      ;; keys, scoring would look up "alpha"/"beta", miss both, and emit zero synonym pairs.
      (let [tmp-dir  (doto (java.io.File/createTempFile "raw-keys-rep-" "")
                       (.delete) (.mkdirs) .deleteOnExit)
            write    (fn [section data]
                       (spit (java.io.File. ^java.io.File tmp-dir (str section ".json"))
                             (json/encode data)))]
        (write "collections" [{:id 1 :type "library" :location "/"}])
        (write "tables"
               [{:id 10 :db_id 1 :name "Alpha" :active true :is_published true :collection_id 1}
                {:id 11 :db_id 1 :name "Beta"  :active true :is_published true :collection_id 1}])
        ;; Cosine(Alpha, Beta) ≈ 0.995, well above the 0.90 threshold.
        (write "embeddings" {"ALPHA"  [1.0 0.0 0.0]
                             " Beta " [0.99 0.1 0.0]})
        (let [result (#'cli/run-cli {:representation-dir (.getAbsolutePath tmp-dir)})]
          (testing ":library synonym-pairs reflects the normalized match"
            (is (= {:pairs 1 :score 50}
                   (get-in result [:library :components :synonym-pairs]))))
          (testing ":universe mirrors it (same two tables)"
            (is (= {:pairs 1 :score 50}
                   (get-in result [:universe :components :synonym-pairs])))))))))

(deftest ^:parallel synonym-threshold-test
  (testing "synonym detection requires cosine ≥ 0.90 — a regression to the old 0.30 cutoff would"
    (testing "flag mid-similarity pairs that the current formula correctly rejects."
      (let [score-pairs (fn [embeddings]
                          (get-in (complexity/score-from-entities
                                   [{:id 10 :name "Alpha" :kind :table :field-count 0 :measure-names []}
                                    {:id 11 :name "Beta"  :kind :table :field-count 0 :measure-names []}]
                                   []
                                   (embedders/file-embedder embeddings)
                                   {})
                                  [:library :components :synonym-pairs :pairs]))]
        (testing "cosine ≈ 0.50 — above the old 0.30 cutoff, below 0.90: NOT a synonym"
          (is (= 0 (score-pairs {"alpha" [1.0 0.0]
                                 "beta"  [0.5 0.866]}))))
        (testing "cosine ≈ 0.89 — just below the new threshold: NOT a synonym"
          (is (= 0 (score-pairs {"alpha" [1.0 0.0]
                                 "beta"  [0.89 0.456]}))))
        (testing "cosine ≈ 0.91 — just above the new threshold: IS a synonym"
          (is (= 1 (score-pairs {"alpha" [1.0 0.0]
                                 "beta"  [0.91 0.415]}))))))))

(deftest ^:parallel embeddings-path-override-test
  (testing "explicit :embeddings-path resolves relative to the representation dir, not cwd,"
    (testing "and a missing file fails fast instead of silently scoring with no embeddings"
      (let [tmp-dir (doto (java.io.File/createTempFile "emb-override-rep-" "")
                      (.delete) (.mkdirs) .deleteOnExit)
            write   (fn [rel-path data]
                      (let [f (java.io.File. ^java.io.File tmp-dir ^String rel-path)]
                        (io/make-parents f)
                        (spit f (json/encode data))))]
        ;; Minimal fixture: two tables with high-cosine embeddings so a synonym pair is detected
        ;; when the override resolves, and would be zero if it silently fell back to {}.
        (write "collections.json"                  [{:id 1 :type "library" :location "/"}])
        (write "tables.json"
               [{:id 10 :db_id 1 :name "Alpha" :active true :is_published true :collection_id 1}
                {:id 11 :db_id 1 :name "Beta"  :active true :is_published true :collection_id 1}])
        ;; embeddings.json at the dir root is deliberately orthogonal — if the loader falls back
        ;; to it (or to `{}`), the synonym-pair count would be 0, not 1.
        (write "embeddings.json"                   {"alpha" [1.0 0.0 0.0] "beta" [0.0 1.0 0.0]})
        (write "embeddings/variant.json"           {"alpha" [1.0 0.0 0.0] "beta" [0.99 0.1 0.0]})
        (let [dir-path (.getAbsolutePath tmp-dir)]
          (testing "relative override picks the subdirectory file (1 synonym pair, not 0)"
            (let [{:keys [embedder]} (representation/load-dir dir-path :embeddings-path "embeddings/variant.json")
                  result             (complexity/score-from-entities
                                      [{:id 10 :name "Alpha" :kind :table :field-count 0 :measure-names []}
                                       {:id 11 :name "Beta"  :kind :table :field-count 0 :measure-names []}]
                                      []
                                      embedder
                                      {})]
              (is (= 1 (get-in result [:library :components :synonym-pairs :pairs])))))
          (testing "absolute override is used as-is"
            (let [abs-path (.getAbsolutePath (java.io.File. ^java.io.File tmp-dir "embeddings/variant.json"))
                  {:keys [embedder]} (representation/load-dir dir-path :embeddings-path abs-path)
                  result             (complexity/score-from-entities
                                      [{:id 10 :name "Alpha" :kind :table :field-count 0 :measure-names []}
                                       {:id 11 :name "Beta"  :kind :table :field-count 0 :measure-names []}]
                                      []
                                      embedder
                                      {})]
              (is (= 1 (get-in result [:library :components :synonym-pairs :pairs])))))
          (testing "missing override file throws ex-info with the resolved path"
            (let [ex (try (representation/load-dir dir-path :embeddings-path "embeddings/does-not-exist.json")
                          nil
                          (catch clojure.lang.ExceptionInfo e e))]
              (is (some? ex) "expected an exception, got a silent fallback")
              (is (re-find #"does-not-exist\.json" (ex-message ex)))
              (is (= "embeddings/does-not-exist.json" (:embeddings-path (ex-data ex))))
              (is (re-find #"embeddings/does-not-exist\.json" (:resolved-path (ex-data ex))))))
          (testing "run-cli propagates the ex-info instead of swallowing it with a silent fallback"
            ;; `run-cli` is documented as the pure core — it must not call `System/exit` on a
            ;; missing --embeddings file. The CLI-layer handling lives in `-main`.
            (let [ex (try (#'cli/run-cli {:representation-dir  dir-path
                                          :embeddings          "embeddings/does-not-exist.json"})
                          nil
                          (catch clojure.lang.ExceptionInfo e e))]
              (is (some? ex) "run-cli should throw, not exit the JVM")
              (is (re-find #"does-not-exist\.json" (ex-message ex)))
              (is (re-find #"embeddings/does-not-exist\.json" (:resolved-path (ex-data ex)))))))))))

(deftest ^:parallel run-cli-validation-errors-throw-not-exit-test
  (testing "run-cli throws ex-info (never calls System/exit) for all validation failures"
    (testing "missing --representation-dir throws {:cli-validation true}"
      (let [ex (try (#'cli/run-cli {}) nil
                    (catch clojure.lang.ExceptionInfo e e))]
        (is (some? ex))
        (is (true? (:cli-validation (ex-data ex))))
        (is (re-find #"Missing --representation-dir" (ex-message ex)))))
    (testing "non-existent --representation-dir throws {:cli-validation true}"
      (let [ex (try (#'cli/run-cli {:representation-dir "/nonexistent/path/abc123-not-a-dir"})
                    nil
                    (catch clojure.lang.ExceptionInfo e e))]
        (is (some? ex))
        (is (true? (:cli-validation (ex-data ex))))
        (is (re-find #"does not exist" (ex-message ex)))))
    (testing "--representation-dir pointing at a file (not a directory) throws {:cli-validation true}"
      (let [tmp-file (doto (java.io.File/createTempFile "not-a-dir-" ".tmp") .deleteOnExit)
            ex       (try (#'cli/run-cli {:representation-dir (.getAbsolutePath tmp-file)}) nil
                          (catch clojure.lang.ExceptionInfo e e))]
        (is (some? ex))
        (is (true? (:cli-validation (ex-data ex))))
        (is (re-find #"must be a directory" (ex-message ex)))))))

(deftest main-translates-validation-errors-to-fail-test
  ;; Not ^:parallel: uses `with-redefs` on the CLI's private `fail!` to assert without exiting.
  (testing "-main converts ex-info {:cli-validation true} from run-cli into fail! + exit 1"
    (let [fail-calls (atom [])]
      (with-redefs [cli/fail! (fn [& msgs]
                                (swap! fail-calls conj (vec msgs))
                                (throw (ex-info "mocked-exit" {::mock :exit})))]
        (try (#'cli/-main "--representation-dir" "/nonexistent/path/xyz-not-a-dir")
             (catch clojure.lang.ExceptionInfo _ nil)))
      (is (= 1 (count @fail-calls)) "fail! should be invoked exactly once")
      (is (re-find #"does not exist" (ffirst @fail-calls))))))

(deftest main-converts-missing-embeddings-to-fail-test
  ;; Not ^:parallel: uses `with-redefs` on the CLI's private `fail!` to assert on the user-facing
  ;; failure path without terminating the JVM.
  (testing "-main translates a missing --embeddings override into a one-line fail! + exit 1"
    (let [tmp-dir    (doto (java.io.File/createTempFile "main-missing-emb-" "")
                       (.delete) (.mkdirs) .deleteOnExit)
          write      (fn [rel-path data]
                       (let [f (java.io.File. ^java.io.File tmp-dir ^String rel-path)]
                         (io/make-parents f)
                         (spit f (json/encode data))))
          _          (write "collections.json" [{:id 1 :type "library" :location "/"}])
          _          (write "tables.json"      [])
          dir-path   (.getAbsolutePath tmp-dir)
          fail-calls (atom [])]
      (with-redefs [cli/fail! (fn [& msgs]
                                (swap! fail-calls conj (vec msgs))
                                (throw (ex-info "mocked-exit" {::mock :exit})))]
        (let [thrown (try (#'cli/-main "--representation-dir" dir-path
                                       "--embeddings" "embeddings/does-not-exist.json")
                          nil
                          (catch clojure.lang.ExceptionInfo e e))]
          (is (= {::mock :exit} (ex-data thrown))
              "expected -main to hit the mocked fail! path, not exit cleanly or throw something else")))
      (is (= 1 (count @fail-calls)) "fail! should be invoked exactly once")
      (let [[msg & extra] (first @fail-calls)]
        (is (empty? extra) "fail! should be called with a single message")
        (is (re-find #"does-not-exist\.json" msg)
            "the user-facing message must mention the missing file")))))

(deftest ^:parallel representation-missing-section-test
  (testing "missing JSON files default to empty — loader doesn't throw, scoring reads an empty library"
    (let [tmp-dir (doto (java.io.File/createTempFile "empty-rep-" "")
                    (.delete) (.mkdirs) .deleteOnExit)
          {:keys [library universe]} (representation/load-dir (.getAbsolutePath tmp-dir))]
      (is (= [] library))
      (is (= [] universe)))))

(deftest ^:parallel nested-library-descendants-test
  (testing "Library membership is location-based, so tables/cards in a grandchild collection still count"
    (let [tmp-dir (doto (java.io.File/createTempFile "nested-rep-" "")
                    (.delete) (.mkdirs) .deleteOnExit)
          write   (fn [section data]
                    (spit (java.io.File. ^java.io.File tmp-dir (str section ".json"))
                          (json/encode data)))]
      ;; Library root at id 1; child at /1/; grandchild at /1/2/; sibling outside the library at /.
      (write "collections"
             [{:id 1 :type "library" :location "/"}
              {:id 2 :type nil       :location "/1/"}
              {:id 3 :type nil       :location "/1/2/"}
              {:id 9 :type nil       :location "/"}])
      (write "tables"
             [{:id 10 :db_id 1 :name "in_grandchild" :active true :is_published true :collection_id 3}
              {:id 11 :db_id 1 :name "in_outside"    :active true :is_published true :collection_id 9}])
      (write "cards"
             [{:id 1000 :database_id 1 :type "metric" :name "GrandchildMetric" :archived false :collection_id 3}
              {:id 1001 :database_id 1 :type "metric" :name "OutsideMetric"    :archived false :collection_id 9}])
      (let [{:keys [library universe]} (representation/load-dir (.getAbsolutePath tmp-dir))]
        (testing ":library includes only the grandchild-collection content"
          (is (= #{"in_grandchild" "GrandchildMetric"} (set (map :name library)))))
        (testing ":universe includes everything (collection scope doesn't apply)"
          (is (= #{"in_grandchild" "in_outside" "GrandchildMetric" "OutsideMetric"}
                 (set (map :name universe)))))))))

(deftest ^:parallel audit-db-filter-test
  (testing "audit-db content is filtered from both :universe and :library — the live scorer derives"
    (testing ":library from an already-audit-filtered :universe superset, so audit content in a"
      (testing "library collection is dropped even though the collection scope alone would keep it."
        (let [tmp-dir   (doto (java.io.File/createTempFile "audit-rep-" "")
                          (.delete) (.mkdirs) .deleteOnExit)
              audit-id  audit/audit-db-id
              write     (fn [section data]
                          (spit (java.io.File. ^java.io.File tmp-dir (str section ".json"))
                                (json/encode data)))]
          (write "collections"
                 [{:id 1 :type "library" :location "/"}])
          (write "tables"
                 [{:id 10 :db_id 1        :name "orders"       :active true :is_published true  :collection_id 1}
                  {:id 20 :db_id audit-id :name "audit_events" :active true :is_published true  :collection_id 1}])
          (write "cards"
                 [{:id 1000 :database_id 1        :type "metric" :name "Revenue"    :archived false :collection_id 1}
                  {:id 1001 :database_id audit-id :type "metric" :name "AuditCount" :archived false :collection_id 1}])
          (let [{:keys [library universe]} (representation/load-dir (.getAbsolutePath tmp-dir))]
            (testing ":universe excludes both audit table and audit card"
              (is (= #{"orders" "Revenue"} (set (map :name universe)))))
            (testing ":library excludes them too (library ⊆ universe, matching live enumerate-catalogs)"
              (is (= #{"orders" "Revenue"} (set (map :name library)))))))))))

(deftest ^:parallel nil-db-id-filtered-from-universe-test
  (testing "Rows with a nil :db_id / :database_id are dropped from :universe and :library — the"
    (testing "live scorer uses Toucan `:not= audit/audit-db-id`, which compiles to SQL `<>` and"
      (testing "excludes NULL-db rows via three-valued logic. `(not= nil audit-id)` would keep them,"
        (testing "so the offline loader must use a nil-safe predicate to preserve the guarantee."
          (let [tmp-dir (doto (java.io.File/createTempFile "nil-db-rep-" "")
                          (.delete) (.mkdirs) .deleteOnExit)
                write   (fn [section data]
                          (spit (java.io.File. ^java.io.File tmp-dir (str section ".json"))
                                (json/encode data)))]
            (write "collections"
                   [{:id 1 :type "library" :location "/"}])
            (write "tables"
                   [{:id 10 :db_id 1   :name "orders"   :active true :is_published true :collection_id 1}
                    {:id 11 :db_id nil :name "orphaned" :active true :is_published true :collection_id 1}])
            (write "cards"
                   [{:id 1000 :database_id 1   :type "metric" :name "Revenue" :archived false :collection_id 1}
                    {:id 1001 :database_id nil :type "metric" :name "Orphan"  :archived false :collection_id 1}])
            (let [{:keys [library universe]} (representation/load-dir (.getAbsolutePath tmp-dir))]
              (is (= #{"orders" "Revenue"} (set (map :name universe))))
              (is (= #{"orders" "Revenue"} (set (map :name library)))))))))))
