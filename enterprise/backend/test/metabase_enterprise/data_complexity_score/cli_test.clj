(ns metabase-enterprise.data-complexity-score.cli-test
  (:require
   [clojure.edn :as edn]
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.cli :as cli]
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
        (is (= {:formula-version   1
                :synonym-threshold 0.3}
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
        ;; Cosine(Alpha, Beta) ≈ 0.898, well above the 0.3 threshold.
        (write "embeddings" {"ALPHA"  [1.0 0.0 0.0]
                             " Beta " [0.9 0.44 0.0]})
        (let [result (#'cli/run-cli {:representation-dir (.getAbsolutePath tmp-dir)})]
          (testing ":library synonym-pairs reflects the normalized match"
            (is (= {:pairs 1 :score 50}
                   (get-in result [:library :components :synonym-pairs]))))
          (testing ":universe mirrors it (same two tables)"
            (is (= {:pairs 1 :score 50}
                   (get-in result [:universe :components :synonym-pairs])))))))))

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
  (testing "audit-db content is filtered from :universe without needing a databases.json,"
    (testing "and is *not* filtered from :library — matching live `library-entities`."
      (let [tmp-dir   (doto (java.io.File/createTempFile "audit-rep-" "")
                        (.delete) (.mkdirs) .deleteOnExit)
            audit-id  audit/audit-db-id
            write     (fn [section data]
                        (spit (java.io.File. ^java.io.File tmp-dir (str section ".json"))
                              (json/encode data)))]
        ;; Library root collection at id 1; audit content also placed inside it so the library
        ;; filter would let it through if not for the (correct) live behavior of *not* checking db.
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
          (testing ":library mirrors live behavior — audit content in a library collection is kept"
            (is (= #{"orders" "audit_events" "Revenue" "AuditCount"} (set (map :name library))))))))))
