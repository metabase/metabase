(ns metabase-enterprise.semantic-search.sqlite-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [environ.core :as env]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.sqlite :as sqlite]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(defn- extension-available? []
  (try
    (sqlite/extension-path)
    true
    (catch Exception _
      false)))

(defn- temp-db-path []
  (str (Files/createTempDirectory "vec1-store" (make-array FileAttribute 0)) "/store.db"))

(def ^:private test-model
  ;; Carries an :embedding-space-id, so the store never asks a provider to resolve it.
  {:provider "test" :model-name "test-model" :vector-dimensions 4 :embedding-space-id "test-space-4"})

(defn- do-with-store! [f]
  (let [path (temp-db-path)]
    (try
      (sqlite/open! path {:embedding-model test-model})
      (f path)
      (finally
        (sqlite/delete-store! path)))))

(defmacro ^:private with-store!
  "Run `body` with a fresh store open at a temp path bound to `path-binding`. Skipped (with a warning) on platforms
  without a vec1 binary."
  [[path-binding] & body]
  `(if (extension-available?)
     (do-with-store! (fn [~path-binding] ~@body))
     (log/warn "Skipping: no vec1 extension for" (sqlite/platform))))

(deftest ^:parallel platform-test
  (is (re-matches #"(darwin|linux|windows)-(aarch64|x86_64)" (sqlite/platform))))

(deftest ^:parallel blob-roundtrip-test
  (let [v [0.0 1.0 -2.5 3.25]]
    (is (= 16 (alength ^bytes (sqlite/->blob v))))
    (is (= v (mapv double (sqlite/<-blob (sqlite/->blob v)))))))

(deftest missing-extension-test
  (with-redefs [env/env {:mb-vec1-extension-path "/nonexistent/vec1.dylib"}]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"No vec1 extension"
                          (sqlite/extension-path)))))

(deftest open-close-test
  (with-store! [path]
    (testing "vec1 is loaded on the store connection"
      (is (re-find #"^version 0\.7" (sqlite/vec1-info))))
    (testing "the file exists"
      (is (.exists (io/file path))))
    (testing "open! at the same path is a no-op"
      (let [conn-before (sqlite/with-conn [conn] conn)]
        (is (= path (sqlite/open! path {:embedding-model test-model})))
        (is (identical? conn-before (sqlite/with-conn [conn] conn)))))
    (testing "close! then with-conn reopens (at the configured path)"
      (sqlite/close!)
      (mt/with-dynamic-fn-redefs [sqlite/db-path                           (constantly path)
                                  semantic.embedding/get-configured-model (constantly test-model)]
        (is (re-find #"^version" (sqlite/vec1-info)))))))

(deftest open-other-path-test
  (with-store! [_path]
    (let [other (temp-db-path)]
      (try
        (sqlite/with-conn [conn]
          (jdbc/execute! conn ["CREATE TABLE marker (x INTEGER)"]))
        (sqlite/open! other {:embedding-model test-model})
        (testing "the store now points at the other, empty file"
          (is (= [] (sqlite/with-conn [conn]
                      (jdbc/execute! conn ["SELECT name FROM sqlite_master WHERE name = 'marker'"])))))
        (finally
          (sqlite/delete-store! other))))))

(deftest delete-store-test
  (when (extension-available?)
    (let [path (temp-db-path)]
      (sqlite/open! path {:embedding-model test-model})
      (sqlite/with-conn [conn]
        (jdbc/execute! conn ["CREATE TABLE t (x INTEGER)"]))
      (sqlite/delete-store! path)
      (is (not (.exists (io/file path))))
      (is (not (.exists (io/file (str path "-wal"))))))))

(deftest serialized-access-test
  (with-store! [_path]
    (sqlite/with-conn [conn]
      (jdbc/execute! conn ["CREATE TABLE t (x INTEGER)"]))
    (let [n       200
          futures (mapv (fn [i]
                          (future
                            (sqlite/with-conn [conn]
                              (jdbc/execute! conn ["INSERT INTO t (x) VALUES (?)" i]))))
                        (range n))]
      (run! deref futures)
      (is (= n (sqlite/with-conn [conn]
                 (:n (jdbc/execute-one! conn ["SELECT count(*) AS n FROM t"]
                                        {:builder-fn jdbc.rs/as-unqualified-maps}))))))))

(deftest vec1-table-test
  (testing "a vec1 table works over the store connection (smoke test; Phase A covered the details)"
    (with-store! [_path]
      (sqlite/with-conn [conn]
        (jdbc/execute! conn ["CREATE VIRTUAL TABLE v USING vec1(vector)"])
        (jdbc/execute! conn ["INSERT INTO v(cmd, arg) VALUES ('rebuild', '{index:\"flat\", distance:\"cos\"}')"])
        (jdbc/execute! conn ["INSERT INTO v(rowid, vector) VALUES (1, ?)" (sqlite/->blob [1 0 0 0])])
        (jdbc/execute! conn ["INSERT INTO v(rowid, vector) VALUES (2, ?)" (sqlite/->blob [0 1 0 0])])
        (is (= [1 2]
               (mapv :rowid (jdbc/execute! conn ["SELECT rowid FROM v(?, '{k: 2}') ORDER BY distance"
                                                 (sqlite/->blob [1 0.1 0 0])]
                                           {:builder-fn jdbc.rs/as-unqualified-maps}))))))))

;;; ---------------------------------------------------- Schema ----------------------------------------------------

(defn- q [sql-params]
  (sqlite/with-conn [conn]
    (jdbc/execute! conn sql-params {:builder-fn jdbc.rs/as-unqualified-maps})))

(defn- reopen! [path model]
  (sqlite/close!)
  (sqlite/open! path {:embedding-model model})
  (:schema (sqlite/store-info)))

(deftest schema-created-then-existing-test
  (with-store! [path]
    (testing "a new file gets the schema and the model identity"
      (is (= :created (:schema (sqlite/store-info))))
      (is (= {"schema_version"     (str sqlite/schema-version)
              "provider"           "test"
              "model_name"         "test-model"
              "vector_dimensions"  "4"
              "embedding_space_id" "test-space-4"}
             (:meta (sqlite/store-info))))
      (is (= #{"meta" "search_doc" "search_vec"}
             (into #{} (comp (map :name) (filter #{"meta" "search_doc" "search_vec"}))
                   (q ["SELECT name FROM sqlite_master"])))))
    (testing "reopening for the same model keeps the data"
      (q ["INSERT INTO search_doc (model, model_id, name, content) VALUES ('card', '1', 'Orders', 'orders')"])
      (is (= :existing (reopen! path test-model)))
      (is (= [{:n 1}] (q ["SELECT count(*) AS n FROM search_doc"]))))))

(deftest schema-recreated-on-model-change-test
  (with-store! [path]
    (q ["INSERT INTO search_doc (model, model_id, name, content) VALUES ('card', '1', 'Orders', 'orders')"])
    (doseq [[what model] {"dimensions"         (assoc test-model :vector-dimensions 8)
                          "embedding space"    (assoc test-model :embedding-space-id "other-space")
                          "model name"         (assoc test-model :model-name "other-model")
                          "provider"           (assoc test-model :provider "other-provider")}]
      (testing (str "a different " what " recreates the store empty")
        (is (= :recreated (reopen! path model)))
        (is (= [{:n 0}] (q ["SELECT count(*) AS n FROM search_doc"])))
        (is (= (:embedding-space-id model) (get-in (sqlite/store-info) [:meta "embedding_space_id"])))
        ;; back to the original model for the next case
        (reopen! path test-model)
        (q ["INSERT INTO search_doc (model, model_id, name, content) VALUES ('card', '1', 'Orders', 'orders')"])))
    (testing "open! for another model on the open store switches without an explicit close"
      (sqlite/open! path {:embedding-model (assoc test-model :vector-dimensions 8)})
      (is (= :recreated (:schema (sqlite/store-info)))))))

(deftest schema-recreated-on-version-change-test
  (with-store! [path]
    (let [bumped (inc sqlite/schema-version)]
      (with-redefs [sqlite/schema-version bumped]
        (is (= :recreated (reopen! path test-model)))
        (is (= (str bumped) (get-in (sqlite/store-info) [:meta "schema_version"])))))))

(deftest schema-recreated-for-foreign-file-test
  (when (extension-available?)
    (let [path (temp-db-path)]
      (try
        (with-open [conn (java.sql.DriverManager/getConnection (str "jdbc:sqlite:" path))]
          (jdbc/execute! conn ["CREATE TABLE marker (x INTEGER)"]))
        (sqlite/open! path {:embedding-model test-model})
        (is (= :recreated (:schema (sqlite/store-info))))
        (is (= [] (q ["SELECT name FROM sqlite_master WHERE name = 'marker'"])))
        (finally
          (sqlite/delete-store! path))))))

(deftest search-vec-meta-columns-test
  (testing "filters on the vec1 meta columns run inside the KNN (the far match is still found with k = 1)"
    (with-store! [_path]
      (sqlite/with-conn [conn]
        (doseq [[id v model archived] [[1 [1 0 0 0] "card" 0]
                                       [2 [0.9 0.1 0 0] "card" 0]
                                       [3 [0 1 0 0] "dashboard" 0]
                                       [4 [0.1 0.9 0 0] "dashboard" 1]]]
          (jdbc/execute! conn [(str "INSERT INTO search_vec(rowid, vector, " (str/join ", " sqlite/vec-meta-columns) ")"
                                    " VALUES (?, ?, ?, ?, 0, 1, 1, NULL)")
                               id (sqlite/->blob v) model archived])))
      (is (= [{:rowid 3}]
             (q ["SELECT rowid FROM search_vec(?, '{k: 1}') WHERE model = 'dashboard' AND archived = 0"
                 (sqlite/->blob [1 0 0 0])]))))))

;;; -------------------------------------------------- Write path --------------------------------------------------

(def ^:private text->vector
  {"alpha" [1 0 0 0]
   "beta"  [0 1 0 0]
   "gamma" [0 0 1 0]
   "delta" [0 0 0 1]})

(defn- doc [model id text & {:as extra}]
  (merge {:model model :id id :name (str model " " id) :embeddable_text text :archived false
          :legacy_input {:id id :model model}}
         extra))

(defn- do-with-stub-embeddings
  "Call `(f sent)` with embedding stubbed: `text->vector` (or `[0.5 0.5 0.5 0.5]`), no vector for texts containing
  `skip`, a thrown exception for texts containing `boom`. `sent` is an atom of the texts sent to the provider.
  Personal collection owners resolve to none, so no app DB is needed."
  [f]
  (let [sent (atom [])]
    (mt/with-dynamic-fn-redefs [semantic.index/batch-resolve-personal-owner-ids (constantly {})
                                semantic.embedding/process-embeddings-streaming
                                (fn [_model texts process-fn & _]
                                  (swap! sent into texts)
                                  (when (some #(str/includes? % "boom") texts)
                                    (throw (ex-info "provider down" {})))
                                  (process-fn (into {}
                                                    (comp (remove #(str/includes? % "skip"))
                                                          (map (fn [t] [t (text->vector t [0.5 0.5 0.5 0.5])])))
                                                    texts)))]
      (f sent))))

(defn- doc-names []
  (into {} (map (juxt (juxt :model :model_id) :name))
        (q ["SELECT model, model_id, name FROM search_doc"])))

(defn- nearest
  "rowid -> [model model_id] of the `k` nearest docs to `v`, optionally only `archived` ones."
  [v k & [archived]]
  (let [id->key (into {} (map (juxt :id (juxt :model :model_id))) (q ["SELECT id, model, model_id FROM search_doc"]))]
    (mapv (comp id->key :rowid)
          (q (cond-> [(str "SELECT rowid FROM search_vec(?, '{k: " k "}')" (when (some? archived) " WHERE archived = ?")
                           " ORDER BY distance")
                      (sqlite/->blob v)]
               (some? archived) (conj archived))))))

(deftest doc->row-test
  (let [ts  (java.time.OffsetDateTime/parse "2026-09-23T13:44:03Z")
        row (sqlite/doc->row {7 42} (doc "card" 3 "alpha" :collection_id 7 :verified 1 :pinned false :created_at ts
                                         :legacy_input "{\"id\":3}"))]
    (is (=? {:model "card" :model_id "3" :collection_id 7 :personal_owner_id 42 :name "card 3" :content "alpha"
             :archived 0 :verified 1 :pinned 0 :official_collection nil :model_created_at "2026-09-23T13:44:03Z"
             :legacy_input "{\"id\":3}"}
            row))
    (testing "a map legacy_input is JSON-encoded"
      (is (= {:id 3 :model "card"} (json/decode+kw (:legacy_input (sqlite/doc->row {} (doc "card" 3 "alpha")))))))))

(deftest upsert-documents-test
  (with-store! [_path]
    (do-with-stub-embeddings
     (fn [sent]
       (testing "new documents are embedded and written to both tables"
         (is (= {:upserted 3 :embedded 3 :reused 0 :skipped 0 :failed 0}
                (sqlite/upsert-documents! [(doc "card" 1 "alpha") (doc "card" 2 "beta") (doc "dashboard" 1 "gamma")])))
         (is (= {["card" "1"] "card 1" ["card" "2"] "card 2" ["dashboard" "1"] "dashboard 1"} (doc-names)))
         (is (= [["card" "2"]] (nearest [0 1 0 0] 1))))
       (testing "unchanged content reuses the stored vector"
         (reset! sent [])
         (is (= {:upserted 3 :embedded 0 :reused 3 :skipped 0 :failed 0}
                (sqlite/upsert-documents! [(doc "card" 1 "alpha") (doc "card" 2 "beta") (doc "dashboard" 1 "gamma")])))
         (is (= [] @sent)))
       (testing "changed content is re-embedded and replaces the row and vector in place"
         (is (=? {:upserted 1 :embedded 1 :reused 0}
                 (sqlite/upsert-documents! [(doc "card" 1 "delta" :name "renamed")])))
         (is (= "renamed" (get (doc-names) ["card" "1"])))
         (is (= 3 (count (doc-names))))
         (is (= [["card" "1"]] (nearest [0 0 0 1] 1))))
       (testing "a change to a filter column alone reuses the vector and updates the vec1 meta column"
         (is (=? {:reused 1 :embedded 0} (sqlite/upsert-documents! [(doc "card" 2 "beta" :archived true)])))
         (is (= [["card" "2"]] (nearest [0 1 0 0] 1 1)))
         (is (not (contains? (set (nearest [0 1 0 0] 3 0)) ["card" "2"]))))
       (testing "identical texts in one batch are embedded once"
         (reset! sent [])
         (sqlite/upsert-documents! [(doc "table" 1 "same text") (doc "table" 2 "same text")])
         (is (= ["same text"] @sent)))
       (testing "a key given twice in one batch: the last one wins"
         (sqlite/upsert-documents! [(doc "card" 9 "alpha" :name "first") (doc "card" 9 "beta" :name "second")])
         (is (= "second" (get (doc-names) ["card" "9"]))))
       (testing "small batches"
         (binding [sqlite/*batch-size* 2]
           (is (=? {:upserted 5}
                   (sqlite/upsert-documents! (for [i (range 5)] (doc "metric" i (str "metric text " i))))))))))))

(deftest upsert-documents-failures-test
  (with-store! [_path]
    (do-with-stub-embeddings
     (fn [_sent]
       (testing "a failed embedding call skips the whole batch"
         (is (= {:upserted 0 :embedded 0 :reused 0 :skipped 0 :failed 2}
                (sqlite/upsert-documents! [(doc "card" 1 "alpha") (doc "card" 2 "boom")])))
         (is (= {} (doc-names))))
       (testing "a text the provider returns no vector for is skipped, the rest are written"
         (is (=? {:upserted 1 :skipped 1} (sqlite/upsert-documents! [(doc "card" 1 "alpha") (doc "card" 2 "skip me")])))
         (is (= #{["card" "1"]} (set (keys (doc-names))))))))
    (testing "a vector of the wrong size is skipped"
      (mt/with-dynamic-fn-redefs [semantic.embedding/process-embeddings-streaming
                                  (fn [_model texts process-fn & _]
                                    (process-fn (zipmap texts (repeat [1 0 0]))))]
        (is (=? {:upserted 0 :skipped 1} (sqlite/upsert-documents! [(doc "card" 3 "three dims")])))))))

(deftest delete-documents-test
  (with-store! [_path]
    (do-with-stub-embeddings
     (fn [_sent]
       (sqlite/upsert-documents! [(doc "card" 1 "alpha") (doc "card" 2 "beta") (doc "dashboard" 1 "gamma")])
       (testing "removes from both tables; unknown ids are ignored"
         (is (= 1 (sqlite/delete-documents! "card" [1 404])))
         (is (= #{["card" "2"] ["dashboard" "1"]} (set (keys (doc-names)))))
         (is (= [{:n 2}] (q ["SELECT count(*) AS n FROM search_vec_base"])))
         (is (not (contains? (set (nearest [1 0 0 0] 5)) ["card" "1"]))))
       (testing "ids may be strings; only the given model is touched"
         (is (= 1 (sqlite/delete-documents! "dashboard" ["1"])))
         (is (= #{["card" "2"]} (set (keys (doc-names))))))
       (testing "no ids"
         (is (= 0 (sqlite/delete-documents! "card" []))))))))

(deftest index-all-test
  (with-store! [_path]
    (do-with-stub-embeddings
     (fn [_sent]
       (binding [sqlite/*batch-size* 2]
         (is (=? {:upserted 5 :embedded 5 :elapsed-ms int?}
                 (sqlite/index-all! (for [i (range 5)] (doc "card" i (str "text " i)))))))
       (testing "async: one run at a time"
         (let [started (promise)
               release (promise)
               docs    (reify clojure.lang.IReduceInit
                         (reduce [_ rf init]
                           (deliver started true)
                           @release
                           (rf init (doc "card" 100 "late"))))
               run     (sqlite/index-all-async! docs)]
           @started
           (is (nil? (sqlite/index-all-async! [])))
           (deliver release true)
           (is (=? {:upserted 1} @run))
           (is (future? (sqlite/index-all-async! [])))))))))

;;; -------------------------------------------------- Query path --------------------------------------------------

(defn- seed-query-docs!
  "Five docs: the query vector [1 0 0 0] is nearest to card 1, then card 2, ...; attributes vary per doc so each
  filter selects the farthest ones."
  []
  (with-redefs [text->vector (merge text->vector {"c1" [1 0 0 0] "c2" [0.9 0.1 0 0] "c3" [0.8 0.2 0 0]
                                                  "d1" [0.1 0.9 0 0] "d2" [0 1 0 0]})]
    (do-with-stub-embeddings
     (fn [_sent]
       (sqlite/upsert-documents!
        [(doc "card" 1 "c1" :database_id 1 :creator_id 1 :collection_id 10)
         (doc "card" 2 "c2" :database_id 1 :creator_id 2 :collection_id 10 :verified true)
         (doc "card" 3 "c3" :database_id 2 :creator_id 1 :collection_id 11 :archived true)
         (doc "dashboard" 1 "d1" :creator_id 3 :collection_id 12)
         (doc "dashboard" 2 "d2" :creator_id 3 :collection_id 12 :archived true)])))))

(defn- knn-keys [& opts]
  (mapv (juxt :model :model_id) (apply sqlite/knn [1 0 0 0] opts)))

(deftest knn-test
  (with-store! [_path]
    (seed-query-docs!)
    (testing "nearest first, with decoded legacy_input and cosine distance"
      (let [[top :as rows] (sqlite/knn [1 0 0 0] :k 5)]
        (is (= [["card" "1"] ["card" "2"] ["card" "3"] ["dashboard" "1"] ["dashboard" "2"]]
               (mapv (juxt :model :model_id) rows)))
        (is (=? {:model "card" :model_id "1" :name "card 1" :collection_id 10 :legacy_input {:id 1 :model "card"}}
                top))
        (is (< (Math/abs (double (:distance top))) 1e-6))
        (is (apply <= (map :distance rows)))))
    (testing ":k"
      (is (= [["card" "1"] ["card" "2"]] (knn-keys :k 2))))
    (testing "filters apply inside the KNN: with k = 1 the nearest *matching* doc still comes back"
      (are [opts expected] (= expected (apply knn-keys :k 1 (mapcat identity opts)))
        {:models ["dashboard"]}              [["dashboard" "1"]]
        {:models ["dashboard" "metric"]}     [["dashboard" "1"]]
        {:archived? true}                    [["card" "3"]]
        {:archived? false :models ["card"]}  [["card" "1"]]
        {:verified? true}                    [["card" "2"]]
        {:database-ids [2]}                  [["card" "3"]]
        {:creator-ids [3]}                   [["dashboard" "1"]]
        {:collection-ids [11 12]}            [["card" "3"]]
        {:creator-ids [3] :archived? true}   [["dashboard" "2"]]))
    (testing "an empty collection filter matches nothing"
      (is (= [] (knn-keys :models [])))
      (is (= [] (knn-keys :creator-ids [] :models ["card"]))))
    (testing ":max-distance"
      (is (= [["card" "1"] ["card" "2"] ["card" "3"]] (knn-keys :k 5 :max-distance 0.1))))))

(deftest search-text-test
  (with-store! [_path]
    (seed-query-docs!)
    (let [embedded (atom [])]
      (mt/with-dynamic-fn-redefs [semantic.embedding/get-embedding (fn [_model text & _]
                                                                     (swap! embedded conj text)
                                                                     [0 1 0 0])]
        (testing "embeds the text with the store's model and runs the KNN with the same options"
          (is (=? {:rows         [{:model "dashboard" :model_id "2"} {:model "dashboard" :model_id "1"}]
                   :embedding-ms number?
                   :knn-ms       number?}
                  (sqlite/search-text "revenue" :k 2)))
          (is (=? {:rows [{:model "dashboard" :model_id "1"}]}
                  (sqlite/search-text "revenue" {:k 1 :archived? false})))
          (is (= ["revenue" "revenue"] @embedded)))
        (testing "a filter that matches nothing skips the embedding"
          (reset! embedded [])
          (is (= [] (:rows (sqlite/search-text "revenue" :models []))))
          (is (= [] @embedded)))))))

(deftest get-doc-test
  (with-store! [_path]
    (seed-query-docs!)
    (is (=? {:model "card" :model_id "2" :name "card 2" :content "c2" :verified 1 :archived 0
             :legacy_input {:id 2 :model "card"} :metadata {:model "card" :id 2} :has-vector? true}
            (sqlite/get-doc "card" 2)))
    (is (=? {:model_id "2"} (sqlite/get-doc "card" "2")))
    (is (nil? (sqlite/get-doc "card" 404)))))

(deftest stats-test
  (with-store! [path]
    (seed-query-docs!)
    (is (=? {:path       path
             :schema     :created
             :docs       5
             :vectors    5
             :by-model   {"card" 3 "dashboard" 2}
             :vec1       #"version 0\.7.*"
             :meta       {"vector_dimensions" "4"}
             :file-bytes pos-int?}
            (sqlite/stats)))
    (sqlite/delete-documents! "card" [1])
    (is (=? {:docs 4 :vectors 4 :by-model {"card" 2 "dashboard" 2}} (sqlite/stats)))))
