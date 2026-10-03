(ns dev.vec1-store
  "REPL walkthrough for the SQLite vec1 store as of PLAN_001 phase D (`native/vec1/PLAN_001_store.md`):
  connection, schema and embedding-model check (steps 1-9), indexing (steps 10-14), querying (steps 15-18).
  Evaluate the numbered forms in the `comment` one at a time.

  Needs the vec1 binary for this machine (`resources/vec1/<platform>/`, see `native/vec1/README.md`) and, for
  steps 7 and 10-18, a configured embedding provider.

  `dev.vec1` is the original proof of concept (raw vec1 over a bare connection); kept as is for reference.

  vec1 bugs crash the JVM rather than throwing (`native/vec1/LIMITATION_001_update_crash.md`). Never
  `UPDATE search_vec`, and never select `distance` outside a KNN call (`search_vec(?, '{k: N}')`)."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.sqlite :as sqlite]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.util :as u]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.sql DriverManager)))

(set! *warn-on-reflection* true)

(def db-file
  "A scratch store, separate from `MB_SEMANTIC_SEARCH_SQLITE_PATH`."
  "/tmp/vec1-store-walkthrough.db")

(def fake-model
  "A model with a fixed identity; opening the store for it never calls a provider."
  {:provider "walkthrough" :model-name "fake" :vector-dimensions 4 :embedding-space-id "walkthrough-4"})

(defn q
  "Run `sql-params` on the store connection, returning unqualified maps."
  [sql-params]
  (sqlite/with-conn [conn]
    (jdbc/execute! conn sql-params {:builder-fn jdbc.rs/as-unqualified-maps})))

(defn tables
  "The store's tables, without the vec1 shadow tables."
  []
  (into [] (comp (map :name) (remove #(str/starts-with? % "search_vec_")))
        (q ["SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"])))

(defn summary
  "What the last `open!` found, plus the row counts."
  []
  (let [{:keys [schema meta]} (sqlite/store-info)]
    {:schema     schema
     :meta       meta
     :tables     (tables)
     :search_doc (:n (first (q ["SELECT count(*) AS n FROM search_doc"])))
     :search_vec (:n (first (q ["SELECT count(*) AS n FROM search_vec_base"])))}))

(defn insert-doc!
  "Insert one `search_doc` row plus its vector. Phase D will do this from real search documents; this is just
  enough to see data survive (or not) a reopen."
  [id model model-id doc-name embedding]
  (sqlite/with-conn [conn]
    (jdbc/with-transaction [tx conn]
      (jdbc/execute! tx ["INSERT INTO search_doc (id, model, model_id, name, content) VALUES (?, ?, ?, ?, ?)"
                         id model (str model-id) doc-name doc-name])
      (jdbc/execute! tx [(str "INSERT INTO search_vec (rowid, vector, " (str/join ", " sqlite/vec-meta-columns) ")"
                              " VALUES (?, ?, ?, 0, 0, NULL, NULL, NULL)")
                         id (sqlite/->blob embedding) model]))))

(defn knn
  "The `k` nearest docs to `embedding` via [[sqlite/knn]], optionally only of `model` (filtered inside the KNN)."
  [embedding k & [model]]
  (mapv #(select-keys % [:id :distance :model :name])
        (sqlite/knn embedding (cond-> {:k k} model (assoc :models [model])))))

(defn search-text
  "`[distance model name]` of the `k` nearest docs to `text` via [[sqlite/search-text]], optionally only of `model`."
  [text k & [model]]
  (mapv (juxt :distance :model :name)
        (:rows (sqlite/search-text text (cond-> {:k k :record-tokens? false} model (assoc :models [model]))))))

(defn doc-row
  "The main columns of the `search_doc` row for `model`/`id` via [[sqlite/get-doc]], or nil."
  [model id]
  (some-> (sqlite/get-doc model id) (select-keys [:id :model :model_id :name :archived :has-vector?])))

(def ^:private stopwords
  #{"a" "an" "and" "are" "by" "do" "does" "for" "how" "in" "is" "it" "of" "on" "or" "per" "the" "to" "what" "which"
    "who" "with"})

(defn- words [text]
  (into #{} (comp (map u/lower-case-en) (remove stopwords)) (re-seq #"[\p{L}\p{N}]+" (or text ""))))

(defn paraphrase-check
  "For each `[model id query]`, search `query` and report where that doc ranks among the top `k` (nil = not found),
  its distance, the top hit, and the words the query shares with the doc's embedded text (`:shared` should be empty
  for a purely semantic match)."
  [cases & {:keys [k] :or {k 10}}]
  (vec (for [[model id query] cases
             :let [target (sqlite/get-doc model id)
                   rows   (:rows (sqlite/search-text query {:k k :record-tokens? false}))
                   rank   (first (keep-indexed (fn [i r] (when (= [model (str id)] [(:model r) (:model_id r)]) (inc i)))
                                               rows))]]
         {:query    query
          :target   (:name target)
          :rank     rank
          :distance (some-> rank dec rows :distance)
          :top-hit  (when (not= 1 rank) (:name (first rows)))
          :shared   (sort (set/intersection (words query) (words (:content target))))})))

(comment
  ;; 1. where the extension comes from, and a clean slate
  [(sqlite/platform) (sqlite/extension-path)]
  (sqlite/delete-store! db-file)

  ;; 2. open a new file for the fake model -> :schema :created, meta = the fake model, tables meta/search_doc/search_vec
  (do (sqlite/open! db-file {:embedding-model fake-model})
      (summary))

  ;; 3. vec1 is loaded on the store connection -> "version 0.7 (NEON, multi-threaded)"
  (sqlite/vec1-info)

  ;; 4. add two docs, close, reopen for the same model -> :schema :existing, 2 docs and 2 vectors kept
  (do (insert-doc! 1 "card" 1 "Orders last month" [1 0 0 0])
      (insert-doc! 2 "dashboard" 7 "Revenue overview" [0 1 0 0])
      (sqlite/close!)
      (sqlite/open! db-file {:embedding-model fake-model})
      (summary))

  ;; 5. filter inside the KNN: nearest to e0 is the card; with model = dashboard, k = 1 still finds the dashboard
  {:any       (knn [1 0 0 0] 1)
   :dashboard (knn [1 0 0 0] 1 "dashboard")}

  ;; 6. reopen for a different model (8 dims) -> :schema :recreated, meta shows 8 dims, 0 docs
  (do (sqlite/open! db-file {:embedding-model (assoc fake-model :vector-dimensions 8 :embedding-space-id "walkthrough-8")})
      (summary))

  ;; 7. the configured model (real provider). meta = provider, model name, dims, embedding space -> :recreated
  ;;    (the fake model was open). Then embed three sentences and ask a paraphrase of the first: it ranks first.
  (do (sqlite/open! db-file)
      (let [model  (sqlite/embedding-model)
            corpus ["How many orders were placed last month?" "Revenue by product category" "Employee vacation policy"]
            vecs   (semantic.embedding/get-embeddings-batch model corpus {:type :index :record-tokens? false})]
        (doseq [[i text v] (map vector (range 1 4) corpus vecs)]
          (insert-doc! i "card" i text v))
        {:summary (summary)
         :hits    (knn (semantic.embedding/get-embedding
                        model
                        (semantic.embedding/prefix-search-query model "count of purchases in the previous month")
                        {:type :query :record-tokens? false})
                       3)}))

  ;; 8. reopen with no arguments after a close -> :existing (same configured model), the 3 docs are still there
  (do (sqlite/close!)
      (sqlite/open! db-file)
      (summary))

  ;; 9. a file that isn't a store (a table, no meta) -> :recreated, the foreign table is gone
  (do (sqlite/delete-store! db-file)
      (with-open [conn (DriverManager/getConnection (str "jdbc:sqlite:" db-file))]
        (jdbc/execute! conn ["CREATE TABLE marker (x INTEGER)"]))
      (sqlite/open! db-file {:embedding-model fake-model})
      (summary))

  ;; --- Phase D: indexing, with the configured model ---

  ;; 10. index every searchable document of this instance into a fresh store
  ;;     -> :upserted = :embedded = number of docs, :skipped/:failed 0; search_doc = search_vec
  (do (sqlite/delete-store! db-file)
      (sqlite/open! db-file)
      {:run     (sqlite/index-all! (search.ingestion/searchable-documents))
       :summary (select-keys (summary) [:schema :search_doc :search_vec])
       :models  (q ["SELECT model, count(*) AS n FROM search_doc GROUP BY model ORDER BY model"])})

  ;; 11. run it again -> :embedded 0, :reused = every doc (unchanged content keeps its vector), much faster
  (sqlite/index-all! (search.ingestion/searchable-documents))

  ;; 12. search by meaning -> order/sales cards first; with "dashboard", only dashboards (filtered inside the KNN)
  {:any        (search-text "which marketing channels bring in orders" 5)
   :dashboards (search-text "which marketing channels bring in orders" 3 "dashboard")}

  ;; 13. update one doc: rename -> :embedded 1, row shows the new name; archive only -> :reused 1, archived 1
  (do (def a-card (first (filter #(= "card" (:model %)) (into [] (search.ingestion/searchable-documents)))))
      {:rename  (sqlite/upsert-documents! [(-> a-card
                                               (assoc :name "Customer churn by cohort")
                                               (update :embeddable_text str "\nCustomer churn by cohort"))])
       :row     (doc-row "card" (:id a-card))
       :churn   (search-text "customer churn" 1)
       :archive (sqlite/upsert-documents! [(-> a-card
                                               (assoc :name "Customer churn by cohort" :archived true)
                                               (update :embeddable_text str "\nCustomer churn by cohort"))])
       :row'    (doc-row "card" (:id a-card))})

  ;; 14. delete it -> 1 removed, search_doc and search_vec both one fewer, gone from search
  {:deleted (sqlite/delete-documents! "card" [(:id a-card)])
   :row     (doc-row "card" (:id a-card))
   :summary (select-keys (summary) [:search_doc :search_vec])
   :churn   (search-text "customer churn" 1)}

  ;; --- Phase E: querying ---

  ;; 15. store health -> :docs = :vectors (one fewer than step 10 after the delete), :by-model, :file-bytes, :meta
  (dissoc (sqlite/stats) :embedding-model)

  ;; 16. one doc in full -> every search_doc column, legacy_input and metadata decoded, :has-vector? true
  (let [{:keys [model_id]} (first (q ["SELECT model_id FROM search_doc WHERE model = 'card' ORDER BY id LIMIT 1"]))]
    (sqlite/get-doc "card" model_id))

  ;; 17. search options and timings -> :embedding-ms is most of the time, :knn-ms a few ms;
  ;;     :models / :archived? filter inside the KNN; :max-distance trims; an empty :models skips the embedding
  (letfn [(run [opts]
            (-> (sqlite/search-text "orders over time" (merge {:k 5 :record-tokens? false} opts))
                (update :rows #(mapv (juxt :distance :model :name) %))))]
    {:plain         (run {})
     :tables-only   (run {:models ["table"]})
     :archived-only (run {:archived? true})
     :close-only    (run {:k 50 :max-distance 0.7})
     :no-models     (run {:models []})})

  ;; 18. end to end: real docs, queries sharing no words with them (:shared empty) -> each target ranks near the top.
  ;;     Measured 2026-09-23 (ai-service arctic-embed): 5/8 rank 1, 7/8 top 2, 8/8 top 10. Swap in docs of your
  ;;     own instance: (q ["SELECT model, model_id, name, content FROM search_doc"]) lists them.
  (paraphrase-check
   [["card" 2 "income across american regions"]
    ["card" 3 "how happy are shoppers with each kind of merchandise"]
    ["card" 21 "top items people purchase frequently"]
    ["card" 30 "count of distinct shoppers for every calendar period"]
    ["card" 6 "where do buyers drop off before paying"]
    ["card" 34 "price reductions granted every three months"]
    ["table" 4 "written opinions and star scores from shoppers"]
    ["dashboard" 8 "stale reports nobody opens anymore"]])

  ;; 19. clean up -> the file is gone
  (do (sqlite/delete-store! db-file)
      (.exists (java.io.File. db-file))))
