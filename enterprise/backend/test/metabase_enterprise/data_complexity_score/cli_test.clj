(ns metabase-enterprise.data-complexity-score.cli-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.cli :as cli]
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase-enterprise.data-complexity-score.complexity-embedders :as embedders]
   [metabase-enterprise.data-complexity-score.metabot-scope :as metabot-scope]
   [metabase-enterprise.data-complexity-score.models.data-complexity-score :as data-complexity-score]
   [metabase-enterprise.data-complexity-score.representation :as representation]
   [metabase-enterprise.data-complexity-score.synonym-source :as synonym-source]
   [metabase-enterprise.data-complexity-score.task.complexity-score :as task.complexity-score]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private representation-fixture-dir
  "enterprise/backend/test_resources/data_complexity_score/representation_fixture")

(defn- empty-tmp-dir ^java.io.File [^String prefix]
  (doto (java.io.File/createTempFile prefix "")
    (.delete) (.mkdirs) .deleteOnExit))

;;; ------------------------------------- on-disk fixture tests -------------------------------------

(deftest ^:parallel representation-fixture-scores-deterministically-test
  (testing "loading representation_fixture/ produces the totals + sub-scores it was designed for"
    ;; Fixture summary:
    ;;   Library     — 4 published tables (orders, subscriptions, clients, customers) + 2 metric
    ;;                 cards (Revenue x2).
    ;;   Universe-only — 2 unpublished tables (events, event_log) + 1 schema-less Table (widgets,
    ;;                 active but not published) + 1 model card (Revenue) in the Outside collection.
    ;;   Audit DB    — 1 Table (query_log) + 1 metric Card (Audit Metric) live under an
    ;;                 `is_audit: true` Database. Both are valid on their own, so they would
    ;;                 inflate Universe by 2 if the audit-DB filter regressed.
    ;;   Embeddings  — orthogonal except clients≈customers (library synonym) and
    ;;                 events≈event_log (extra universe-only synonym). The customers key is in
    ;;                 raw display-name form ("  Customers ") to exercise the on-disk →
    ;;                 file-embedder → scorer normalization path end-to-end.
    ;;   Measures    — "revenue" on orders + subscriptions (library repeat) plus a third on
    ;;                 events (extra universe repeat).
    (let [result (#'cli/run-cli {:representation-dir representation-fixture-dir})]
      (testing "library score matches the hand-derived total"
        ;;  size  = 60 (entity) + 3 (field) = 63
        ;;  amb   = 100 (collisions) + 50 (synonyms) + 2 (repeated-measures) = 152
        ;;  total = 215
        (is (= {:score      215
                :components {:size      {:score      63
                                         :components {:entity-count {:measurement 6.0 :score 60}
                                                      :field-count  {:measurement 3.0 :score 3}}}
                             :ambiguity {:score      152
                                         :components {:name-collisions   {:measurement 1.0 :score 100}
                                                      :synonym-pairs     {:measurement 1.0 :score 50}
                                                      :repeated-measures {:measurement 1.0 :score 2}}}}}
               (:library result))))
      (testing "universe score matches the hand-derived total"
        ;;  size  = 100 (entity) + 5 (field) = 105
        ;;  amb   = 200 (collisions) + 100 (synonyms) + 4 (repeated-measures) = 304
        ;;  total = 409
        (is (= {:score      409
                :components {:size      {:score      105
                                         :components {:entity-count {:measurement 10.0 :score 100}
                                                      :field-count  {:measurement 5.0  :score 5}}}
                             :ambiguity {:score      304
                                         :components {:name-collisions   {:measurement 2.0  :score 200}
                                                      :synonym-pairs     {:measurement 2.0  :score 100}
                                                      :repeated-measures {:measurement 2.0  :score 4}}}}}
               (:universe result))))
      (testing "meta has formula-version + format-version + threshold + weights but no :embedding-model (offline mode)"
        ;; Literal 1/1 here is intentional — flags accidental version bumps that would invalidate the
        ;; emitted fingerprint without an explicit code-change reviewer call.
        (is (= {:formula-version   1
                :format-version    1
                :synonym-threshold 0.8
                :weights           complexity/weights
                :metabot-source    :universe-fallback}
               (:meta result)))))))

(deftest ^:parallel representation-fixture-scores-deterministically-test-2
  (testing "the schema-less widgets table (under databases/<db>/tables/, no schema dir) loads into :universe"
    (let [{:keys [universe]} (representation/load-dir representation-fixture-dir)]
      (is (some #(= "widgets" (:name %)) universe)
          "schema-less Table directory should be picked up by the loader"))))

(deftest ^:parallel representation-fixture-scores-deterministically-test-3
  (testing "audit-DB content (is_audit: true) is excluded from :universe — both Tables and Cards"
    ;; Mirrors the live appdb scorer's `[:not= audit/audit-db-id]` filter. The fixture has
    ;; `databases/audit_database/...` (`is_audit: true`) with a `query_log` Table and a
    ;; `collections/outside/cards/audit_metric.yaml` Card whose database_id points at it. Both
    ;; would be valid Universe entries on their own; the filter is what keeps them out.
    (let [{:keys [universe]} (representation/load-dir representation-fixture-dir)
          names              (set (map :name universe))]
      (is (not (contains? names "query_log"))
          "Table in is_audit DB must not appear in :universe")
      (is (not (contains? names "Audit Metric"))
          "Card whose database_id is the audit DB must not appear in :universe"))))

(deftest ^:parallel representation-fixture-scores-deterministically-test-4
  (testing "FieldValues side-car YAMLs (`*___fieldvalues.yaml`) under fields/ do not inflate :field-count"
    ;; The fixture's `events/fields/event_id___fieldvalues.yaml` is a real-shape serdes side-car
    ;; sitting next to a Field YAML. `load-yamls-of-model` must skip it; otherwise the events Table
    ;; would jump from 2 fields to 3 and the universe :field-count would land at 6 instead of 5.
    (let [{:keys [universe]} (representation/load-dir representation-fixture-dir)
          events             (u/seek #(= "events" (:name %)) universe)]
      (is (= 2 (:field-count events))
          "events Table should have exactly 2 fields — the side-car must not be counted"))))

(deftest ^:sequential run-cli-writes-readable-json-test
  ;; Not ^:parallel: calls `cli/write-result!`, which kondo flags as a destructive function in
  ;; parallel tests. The temp file we hand it is unique-per-call so the write is safe in
  ;; principle, but the lint flag is the right default — drop it instead of whitelisting.
  ;; Call internals instead of -main, which terminates the JVM via System/exit.
  (let [result (#'cli/run-cli {:representation-dir representation-fixture-dir})]
    (testing "without --output, stdout gets single-line JSON"
      (let [stdout (with-out-str (#'cli/write-result! result nil))]
        (is (= 215 (-> stdout (json/decode true) :library :score)))
        (is (not (re-find #"\n.+" stdout)) "stdout JSON should be single-line")))
    (testing "with --output, the file gets pretty JSON and stdout stays silent"
      (let [tmp    (doto (java.io.File/createTempFile "complexity-cli-output-" ".json") .deleteOnExit)
            stdout (with-out-str (#'cli/write-result! result (.getAbsolutePath tmp)))]
        (is (= "" stdout))
        (is (= 215 (-> (slurp tmp) (json/decode true) :library :score)))))))

;;; ------------------------------------- pure embedder/scoring tests -------------------------------------

(deftest ^:parallel file-embedder-test
  (testing "file-embedder converts seqs to ^floats, preserves already-typed arrays, omits absent names"
    (let [input    {"a" [1.0 0.0] "b" (float-array [0.0 1.0])}
          embedder (embedders/file-embedder input)
          result   (embedder [{:name "Any"}])]
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

(deftest ^:parallel synonym-threshold-test
  (testing "synonym detection requires cosine ≥ 0.80 — a regression to the old 0.30 cutoff would"
    (testing "flag mid-similarity pairs that the current formula correctly rejects."
      (let [score-pairs (fn [embeddings]
                          (get-in (complexity/score-from-entities
                                   [{:id 10 :name "Alpha" :kind :table :field-count 0 :measure-names []}
                                    {:id 11 :name "Beta"  :kind :table :field-count 0 :measure-names []}]
                                   []
                                   (embedders/file-embedder embeddings)
                                   {})
                                  [:library :components :ambiguity :components :synonym-pairs :measurement]))]
        (testing "cosine ≈ 0.50 — above the old 0.30 cutoff, below 0.80: NOT a synonym"
          (is (= 0.0 (score-pairs {"alpha" [1.0 0.0]
                                   "beta"  [0.5 0.866]}))))
        (testing "cosine ≈ 0.79 — just below the threshold: NOT a synonym"
          (is (= 0.0 (score-pairs {"alpha" [1.0 0.0]
                                   "beta"  [0.79 0.613]}))))
        (testing "cosine ≈ 0.81 — just above the threshold: IS a synonym"
          (is (= 1.0 (score-pairs {"alpha" [1.0 0.0]
                                   "beta"  [0.81 0.586]}))))))))

;;; ----------------------------------- loader unit tests (no YAML emit) -----------------------------------

(deftest ^:parallel library-collection-ids-test
  (testing "library-collection-ids includes the root + every descendant reachable via parent_id chain"
    (let [collections [{:entity_id "root"   :type "library"}
                       {:entity_id "child"  :parent_id "root"}
                       {:entity_id "grand"  :parent_id "child"}
                       {:entity_id "out"}                       ; root-level non-library collection
                       {:entity_id "orphan" :parent_id "no-such-collection"}]]
      (is (= #{"root" "child" "grand"}
             (#'representation/library-collection-ids collections)))))
  (testing "no library collection → empty set (so library scoring short-circuits to zero)"
    (is (= #{} (#'representation/library-collection-ids
                [{:entity_id "any" :type nil}
                 {:entity_id "kid" :parent_id "any"}])))))

(deftest ^:parallel ->table-entity-default-flag-handling-test
  (testing "->table-entity treats missing/nil :active and :archived as the documented defaults"
    ;; Field.active defaults to true → only explicit `false` drops the field.
    ;; Measure.archived defaults to false → only explicit `true` drops the measure.
    (let [entity (#'representation/->table-entity
                  {:table    {:db_id "db" :schema "s" :name "t"}
                   :fields   [{}                ; missing  → counted (active default true)
                              {:active true}    ; true     → counted
                              {:active false}   ; false    → dropped
                              {:active nil}]    ; nil      → counted (treat as default)
                   :measures [{:name "m-missing"}                ; missing  → kept
                              {:name "m-true"   :archived true}  ; true     → dropped
                              {:name "m-false"  :archived false} ; false    → kept
                              {:name "m-nil"    :archived nil}]})] ; nil    → kept (treat as default)
      (is (=? {:field-count   3
               :measure-names ["m-missing" "m-false" "m-nil"]}
              entity)))))

(deftest ^:parallel list-table-dirs-schema-less-branch-test
  (testing "list-table-dirs picks up tables under <db>/tables/ (schema-less, e.g. MongoDB exports)"
    (let [tmp-dir   (empty-tmp-dir "schema-less-")
          table-dir (io/file tmp-dir "tables/widgets")]
      (.mkdirs table-dir)
      (let [dirs (#'representation/list-table-dirs tmp-dir)]
        (is (= [(.getCanonicalPath table-dir)] (mapv #(.getCanonicalPath ^java.io.File %) dirs))))))
  (testing "list-table-dirs returns [] for an empty database dir (no schemas/, no tables/)"
    (is (= [] (vec (#'representation/list-table-dirs (empty-tmp-dir "empty-db-")))))))

(deftest ^:parallel resolve-embeddings-file-test
  (let [tmp-dir (empty-tmp-dir "emb-resolve-")
        present (io/file tmp-dir "embeddings/variant.json")]
    (io/make-parents present)
    (spit present "{}")
    (testing "relative path resolves under the representation dir, not cwd"
      (let [resolved (#'representation/resolve-embeddings-file (.getAbsolutePath tmp-dir)
                                                               "embeddings/variant.json")]
        (is (= (.getCanonicalPath present) (.getCanonicalPath ^java.io.File resolved)))))
    (testing "absolute path is honored as-is, regardless of dir"
      (let [resolved (#'representation/resolve-embeddings-file "/tmp" (.getAbsolutePath present))]
        (is (= (.getCanonicalPath present) (.getCanonicalPath ^java.io.File resolved)))))
    (testing "missing file throws ex-info carrying both the request and the resolved path"
      (let [ex (try (#'representation/resolve-embeddings-file (.getAbsolutePath tmp-dir)
                                                              "embeddings/does-not-exist.json")
                    nil
                    (catch clojure.lang.ExceptionInfo e e))]
        (is (some? ex) "expected an exception, got a silent success")
        (is (re-find #"does-not-exist\.json" (ex-message ex)))
        (is (= "embeddings/does-not-exist.json" (:embeddings-path (ex-data ex))))
        (is (re-find #"embeddings/does-not-exist\.json" (:resolved-path (ex-data ex))))))))

(deftest ^:parallel run-cli-propagates-missing-embeddings-test
  (testing "run-cli surfaces the missing-embeddings ex-info instead of silently scoring without embeddings"
    ;; `run-cli` is the pure core — it must not call `System/exit` when --embeddings can't be
    ;; resolved. The CLI-layer fail!/exit handling lives in `-main` (covered separately).
    (let [ex (try (#'cli/run-cli {:representation-dir representation-fixture-dir
                                  :embeddings         "embeddings/does-not-exist.json"})
                  nil
                  (catch clojure.lang.ExceptionInfo e e))]
      (is (some? ex) "run-cli should throw, not exit the JVM")
      (is (re-find #"does-not-exist\.json" (ex-message ex)))
      (is (re-find #"embeddings/does-not-exist\.json" (:resolved-path (ex-data ex)))))))

(deftest ^:parallel representation-empty-dir-test
  (testing "an empty export dir loads cleanly: missing collections/ + databases/ → empty entity vectors"
    (let [{:keys [library universe]} (representation/load-dir
                                      (.getAbsolutePath (empty-tmp-dir "empty-rep-")))]
      (is (= [] library))
      (is (= [] universe)))))

;;; ----------------------------------- CLI validation + -main integration -----------------------------------

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

(deftest ^:sequential main-translates-validation-errors-to-fail-test
  (testing "-main converts ex-info {:cli-validation true} from run-cli into fail! + exit 1"
    (let [fail-calls (atom [])]
      (mt/with-dynamic-fn-redefs [cli/fail! (fn [& msgs]
                                              (swap! fail-calls conj (vec msgs))
                                              (throw (ex-info "mocked-exit" {::mock :exit})))]
        (try (#'cli/-main "--representation-dir" "/nonexistent/path/xyz-not-a-dir")
             (catch clojure.lang.ExceptionInfo _ nil)))
      (is (= 1 (count @fail-calls)) "fail! should be invoked exactly once")
      (is (re-find #"does not exist" (ffirst @fail-calls))))))

(deftest ^:sequential main-converts-missing-embeddings-to-fail-test
  (testing "-main translates a missing --embeddings override into a one-line fail! + exit 1"
    (let [fail-calls (atom [])]
      (mt/with-dynamic-fn-redefs [cli/fail! (fn [& msgs]
                                              (swap! fail-calls conj (vec msgs))
                                              (throw (ex-info "mocked-exit" {::mock :exit})))]
        (let [thrown (try (#'cli/-main "--representation-dir" representation-fixture-dir
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

;;; ----------------------------------- source + write-to-appdb dispatch -----------------------------------

(deftest ^:parallel run-cli-rejects-appdb-source-combined-with-representation-dir-test
  (testing "--source appdb + --representation-dir is a user error — these flags name mutually exclusive inputs"
    (let [ex (try (#'cli/run-cli {:source "appdb"
                                  :representation-dir representation-fixture-dir})
                  nil
                  (catch clojure.lang.ExceptionInfo e e))]
      (is (some? ex))
      (is (true? (:cli-validation (ex-data ex))))
      (is (re-find #"--source appdb does not accept" (ex-message ex)))))
  (testing "--source appdb + --embeddings is also rejected"
    (let [ex (try (#'cli/run-cli {:source "appdb"
                                  :embeddings "embeddings.json"})
                  nil
                  (catch clojure.lang.ExceptionInfo e e))]
      (is (some? ex))
      (is (true? (:cli-validation (ex-data ex))))
      (is (re-find #"--source appdb does not accept" (ex-message ex))))))

(deftest ^:sequential run-cli-representation-mode-default-does-not-write-test
  (testing "representation mode with no --write-to-appdb flag never calls record-score! or bootstrap"
    (let [persisted?     (atom false)
          bootstrapped?  (atom false)]
      (mt/with-dynamic-fn-redefs [data-complexity-score/record-score! (fn [& _] (reset! persisted? true))
                                  mdb/setup-db-without-migrations!    (fn [] (reset! bootstrapped? true))]
        (#'cli/run-cli {:representation-dir representation-fixture-dir})
        (is (false? @persisted?)   "representation+no-write must not persist anything")
        (is (false? @bootstrapped?) "representation+no-write must not boot the appdb at all")))))

(deftest ^:sequential run-cli-representation-mode-with-write-stamps-representation-source-test
  (testing "representation + --write-to-appdb true persists a row stamped 'representation:<digest>' and does not advance the cron fingerprint"
    (let [calls          (atom [])
          advance-calls  (atom 0)]
      (mt/with-dynamic-fn-redefs [mdb/setup-db-without-migrations!                (fn [])
                                  task.complexity-score/current-fingerprint       (constantly "test-fp")
                                  task.complexity-score/maybe-advance-last-fingerprint! (fn [& _]
                                                                                          (swap! advance-calls inc))
                                  data-complexity-score/record-score!             (fn [fp source _result]
                                                                                    (swap! calls conj [fp source]))]
        (#'cli/run-cli {:representation-dir representation-fixture-dir
                        :write-to-appdb     true})
        (is (= 1 (count @calls)) "exactly one row written")
        (let [[fp source] (first @calls)]
          (is (= "test-fp" fp))
          (is (re-find #"^representation:[0-9a-f]{64}$" source)
              "source must be 'representation:<sha-256 hex>'"))
        (is (zero? @advance-calls)
            "representation-derived rows must never advance the cron's last-fingerprint setting")))))

(deftest ^:sequential run-cli-appdb-mode-defaults-to-writing-test
  (testing "appdb mode with no --write-to-appdb flag defaults to writing (true) but doesn't advance the cron fingerprint"
    ;; CLI runs disable Snowplow, so they can't legitimately advance
    ;; `data-complexity-scoring-last-fingerprint` — that setting is the cron's
    ;; been-published-already gate and only a confirmed publish should move it. The CLI just
    ;; persists the score row so operators can see the run.
    (let [calls         (atom [])
          advance-calls (atom 0)]
      (mt/with-dynamic-fn-redefs [mdb/setup-db-without-migrations!                (fn [])
                                  complexity/complexity-scores                    (fn [& _] {:meta {}})
                                  synonym-source/complexity-scores-opts           (constantly {})
                                  metabot-scope/internal-metabot-scope            (constantly {})
                                  task.complexity-score/current-fingerprint       (constantly "appdb-fp")
                                  task.complexity-score/maybe-advance-last-fingerprint! (fn [& _]
                                                                                          (swap! advance-calls inc))
                                  data-complexity-score/record-score!             (fn [fp source _result]
                                                                                    (swap! calls conj [fp source]))]
        (#'cli/run-cli {:source "appdb"})
        (is (= [["appdb-fp" "appdb"]] @calls)
            "appdb-mode default must write one row stamped source=\"appdb\"")
        (is (zero? @advance-calls)
            "CLI must not advance the cron's last-fingerprint setting")))))

(deftest ^:sequential run-cli-appdb-mode-respects-explicit-no-write-test
  (testing "appdb + --write-to-appdb false scores but never persists"
    (let [persisted? (atom false)]
      (mt/with-dynamic-fn-redefs [mdb/setup-db-without-migrations!                (fn [])
                                  complexity/complexity-scores                    (fn [& _] {:meta {}})
                                  synonym-source/complexity-scores-opts           (constantly {})
                                  metabot-scope/internal-metabot-scope            (constantly {})
                                  data-complexity-score/record-score!             (fn [& _] (reset! persisted? true))]
        (#'cli/run-cli {:source "appdb" :write-to-appdb false})
        (is (false? @persisted?))))))

(deftest ^:parallel dir-digest-is-stable-and-content-sensitive-test
  (testing "dir-digest produces the same value for the same content"
    (let [d1 (#'representation/dir-digest representation-fixture-dir)
          d2 (#'representation/dir-digest representation-fixture-dir)]
      (is (= d1 d2) "two calls against the same dir must produce the same digest")
      (is (re-matches #"[0-9a-f]{64}" d1) "digest must be a 64-char lowercase hex string (SHA-256)")))
  (testing "dir-digest changes when file content changes — guards against a constant-digest regression"
    ;; A regression that made `dir-digest` return a fixed value (e.g. `(hex (sha-256 (pr-str [])))`)
    ;; would pass the stability assertion above. Mutating a single byte in a single file must change
    ;; the digest.
    (let [tmp-dir (empty-tmp-dir "dir-digest-")
          target  (io/file tmp-dir "marker.txt")]
      (spit target "original")
      (let [before (#'representation/dir-digest (.getAbsolutePath tmp-dir))]
        (spit target "originalX")
        (let [after (#'representation/dir-digest (.getAbsolutePath tmp-dir))]
          (is (not= before after)
              "appending a byte to a file must change the digest"))))))
