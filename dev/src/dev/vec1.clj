(ns dev.vec1
  "REPL playground for the vec1 SQLite vector extension.

  Build the extension first -- see native/vec1/README.md."
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [next.jdbc :as jdbc])
  (:import
   (java.nio ByteBuffer ByteOrder)
   (java.sql Connection DriverManager)
   (org.sqlite SQLiteConfig)))

(set! *warn-on-reflection* true)

(def db-file
  "The dedicated SQLite file holding the vector index."
  "/tmp/vec1-101.db")

(defn ext-path
  "Absolute path to the vec1 binary for this machine. `load_extension` is a dlopen on a filesystem
  path, so this must be a real file -- in an uberjar the resource has to be extracted first."
  []
  (.getAbsolutePath (io/file "resources/vec1/darwin-aarch64/vec1.dylib")))

(defn open-conn
  "Open a connection to [[db-file]] with vec1 loaded.

  Both halves are per-connection: load-extension is a connection property, and the loaded extension
  lives only on the connection that loaded it."
  ^Connection []
  (let [config (doto (SQLiteConfig.) (.enableLoadExtension true))
        conn   (DriverManager/getConnection (str "jdbc:sqlite:" db-file) (.toProperties config))]
    (with-open [stmt (.createStatement conn)]
      (.execute stmt (format "select load_extension('%s')" (ext-path))))
    conn))

(defn ->blob
  "vec1's native vector format: 32-bit floats in machine byte order."
  ^bytes [embedding]
  (let [buffer (.order (ByteBuffer/allocate (* 4 (count embedding))) (ByteOrder/nativeOrder))]
    (doseq [x embedding]
      (.putFloat buffer (float x)))
    (.array buffer)))

(defn embed
  "One embedding for `text`, using whatever provider this instance is configured with."
  [text]
  (semantic.embedding/get-embedding (semantic.embedding/get-configured-model) text
                                    {:record-tokens? false :type :query}))

(comment
  ;; Evaluate the numbered forms below one at a time, top to bottom. Steps 3 and 4 are wrapped in
  ;; `do` so each is a single evaluation.

  ;; 1. open the connection -- this also loads the vec1 extension onto it
  (def conn (open-conn))

  ;; 2. check the extension is really there -- "version 0.7 (NEON, multi-threaded)"
  (jdbc/execute-one! conn ["select vec1_info() as info"])

  ;; 3. create the index tables -- prints every table in the file when it finishes
  (do
    ;; the vector index. Dimension is fixed by the first insert; delete db-file if you switch models.
    (jdbc/execute! conn ["create virtual table if not exists search_vec using vec1(vector)"])
    ;; exhaustive search with cosine distance -- no training needed, unlike ANN mode
    (jdbc/execute! conn ["insert into search_vec(cmd, arg) values ('rebuild', '{index:\"flat\", distance:\"cos\"}')"])
    ;; vec1 rows carry only rowid + vector, so map rowid back to Metabase entities here
    (jdbc/execute! conn ["create table if not exists search_doc (
                            rowid     integer primary key,
                            model     text not null,
                            entity_id integer not null,
                            name      text)"])
    (jdbc/execute! conn ["create unique index if not exists search_doc_model_entity
                            on search_doc(model, entity_id)"])
    (jdbc/execute! conn ["select name, type from sqlite_master"]))

  ;; 4. embed three sentences and write them into the index -- prints the row count and dimensions
  (do
    (def model (semantic.embedding/get-configured-model))
    (def corpus ["How many orders were placed last month?"
                 "Revenue by product category"
                 "Employee vacation policy"])
    (def vectors (semantic.embedding/get-embeddings-batch model corpus
                                                          {:record-tokens? false :type :index}))
    (doseq [[i text embedding] (map vector (range 1 (inc (count corpus))) corpus vectors)]
      (jdbc/execute! conn ["insert into search_vec(rowid, vector) values (?, ?)" i (->blob embedding)])
      (jdbc/execute! conn ["insert into search_doc(rowid, model, entity_id, name) values (?, ?, ?, ?)"
                           i "card" i text]))
    (jdbc/execute-one! conn ["select count(*) as n, ? as dimensions from search_doc" (count (first vectors))]))

  ;; 5. embed a question that means the same as the first sentence but shares no words with it
  (def query-vector (embed "count of purchases in the previous month"))

  ;; 6. search -- the orders sentence should come back first, with the smallest distance
  (jdbc/execute! conn ["select v.rowid, v.distance, d.name
                        from search_vec(?, '{k: 3}') v
                        join search_doc d on d.rowid = v.rowid"
                       (->blob query-vector)])

  ;; 7. close the connection -- the extension is unloaded with it, so step 1 again to continue
  (.close conn))
