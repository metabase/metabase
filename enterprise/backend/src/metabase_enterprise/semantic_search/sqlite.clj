(ns metabase-enterprise.semantic-search.sqlite
  "Hackathon: a semantic search index stored in a local SQLite file, searched with the vec1 extension.

  Enabled by setting `MB_SEMANTIC_SEARCH_SQLITE_PATH`. All access goes through one JDBC connection, serialized by
  [[with-conn]]. See `native/vec1/PLAN_001_store.md`.

  vec1 is native code in this process: a bad statement against a vec1 table crashes the JVM rather than throwing
  (see `native/vec1/LIMITATION_001_update_crash.md`). Keep every statement that touches a vec1 table in this
  namespace."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [environ.core :refer [env]]
   [honey.sql :as sql]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.sqlite-config :as sqlite-config]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.nio ByteBuffer ByteOrder)
   (java.sql Connection DriverManager)
   (org.sqlite SQLiteConfig SQLiteConfig$JournalMode)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Configuration -------------------------------------------------

(defn db-path
  "The configured SQLite file path, or nil. See [[sqlite-config/db-path]]."
  []
  (sqlite-config/db-path))

(defn enabled?
  "Is the SQLite semantic search store configured? See [[sqlite-config/enabled?]]."
  []
  (sqlite-config/enabled?))

(defn platform
  "The `<os>-<arch>` directory name for this JVM's vec1 binary, e.g. `darwin-aarch64` or `linux-x86_64`."
  []
  (let [os   (u/lower-case-en (or (System/getProperty "os.name") ""))
        arch (u/lower-case-en (or (System/getProperty "os.arch") ""))]
    (str (cond
           (str/includes? os "mac")     "darwin"
           (str/includes? os "linux")   "linux"
           (str/includes? os "windows") "windows"
           :else                        os)
         "-"
         (case arch
           ("aarch64" "arm64") "aarch64"
           ("amd64" "x86_64")  "x86_64"
           arch))))

(defn- library-extension [platform]
  (cond
    (str/starts-with? platform "darwin")  "dylib"
    (str/starts-with? platform "windows") "dll"
    :else                                 "so"))

(defn extension-path
  "Absolute filesystem path of the vec1 binary to load: `MB_VEC1_EXTENSION_PATH` when set, else the
  `vec1/<platform>/vec1.<ext>` classpath resource. Throws when there is no loadable file."
  []
  (let [override (not-empty (str/trim (or (env :mb-vec1-extension-path) "")))
        platform (platform)
        resource (str "vec1/" platform "/vec1." (library-extension platform))
        file     (if override
                   (io/file override)
                   (when-let [^java.net.URL url (io/resource resource)]
                     ;; load_extension dlopens a filesystem path. A resource inside the uberjar would need extracting
                     ;; to a temp file first -- out of scope for the hackathon.
                     (when (= "file" (.getProtocol url))
                       (io/file (.toURI url)))))]
    (when-not (and file (.isFile ^java.io.File file))
      (throw (ex-info (str "No vec1 extension for this platform. Build it (see native/vec1/README.md) or set "
                           "MB_VEC1_EXTENSION_PATH.")
                      {:platform platform :resource resource :override override})))
    (.getAbsolutePath ^java.io.File file)))

;;; ---------------------------------------------------- Schema ----------------------------------------------------

(def schema-version
  "Version of the store's DDL. Bump it on any schema change: a store written by another version is deleted and
  recreated on open (the store is a cache; re-indexing refills it)."
  1)

(def vec-meta-columns
  "`search_doc` columns duplicated onto the vec1 table. vec1 applies filters on these inside the KNN scan, so they
  don't shrink the top k; filters on any other column do."
  ["model" "archived" "verified" "database_id" "creator_id" "collection_id"])

(def ^:private search-doc-ddl
  ;; Same column names as the pgvector index table (`semantic.index/index-table-schema`), minus the embedding and the
  ;; tsvectors, so the pgvector query code can later run against it. `id` is the vec1 rowid.
  "CREATE TABLE search_doc (
     id                   INTEGER PRIMARY KEY,
     model                TEXT NOT NULL,
     model_id             TEXT NOT NULL,
     collection_id        INTEGER,
     personal_owner_id    INTEGER,
     creator_id           INTEGER,
     database_id          INTEGER,
     last_editor_id       INTEGER,
     name                 TEXT NOT NULL,
     content              TEXT NOT NULL,
     display_type         TEXT,
     archived             BOOLEAN DEFAULT FALSE,
     official_collection  BOOLEAN,
     pinned               BOOLEAN,
     verified             BOOLEAN,
     collection_type      TEXT,
     root_collection_type TEXT,
     data_layer           TEXT,
     data_authority       TEXT,
     curated              BOOLEAN,
     dashboardcard_count  INTEGER,
     view_count           INTEGER,
     created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     model_created_at     TEXT,
     model_updated_at     TEXT,
     last_viewed_at       TEXT,
     legacy_input         TEXT,
     metadata             TEXT,
     UNIQUE (model, model_id))")

(defn- resolve-model
  "`embedding-model` with its `:embedding-space-id`, resolving it through the provider only when missing."
  [embedding-model]
  (if (:embedding-space-id embedding-model)
    embedding-model
    (semantic.embedding/resolve-model embedding-model)))

(defn- expected-meta
  "The `meta` table contents for a store holding embeddings of the (resolved) `embedding-model`. A store is reusable
  only when every entry matches -- the same identity pgvector uses to find a compatible index."
  [{:keys [provider model-name vector-dimensions embedding-space-id]}]
  {"schema_version"     (str schema-version)
   "provider"           (str provider)
   "model_name"         (str model-name)
   "vector_dimensions"  (str vector-dimensions)
   "embedding_space_id" (str embedding-space-id)})

(defn- table-names [conn]
  (into #{} (map :name) (jdbc/execute! conn ["SELECT name FROM sqlite_master WHERE type = 'table'"]
                                       {:builder-fn jdbc.rs/as-unqualified-maps})))

(defn- read-meta
  "The `meta` table as a map, or nil when the file has no `meta` table."
  [conn]
  (when (contains? (table-names conn) "meta")
    (into {} (map (juxt :k :v)) (jdbc/execute! conn ["SELECT k, v FROM meta"] {:builder-fn jdbc.rs/as-unqualified-maps}))))

(defn- create-schema! [conn meta]
  (jdbc/with-transaction [tx conn]
    (jdbc/execute! tx ["CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)"])
    (jdbc/execute! tx [search-doc-ddl])
    (jdbc/execute! tx [(str "CREATE VIRTUAL TABLE search_vec USING vec1(vector, " (str/join ", " vec-meta-columns) ")")])
    ;; Flat nearest-neighbour index with cosine distance: exhaustive, needs no training.
    (jdbc/execute! tx ["INSERT INTO search_vec(cmd, arg) VALUES ('rebuild', '{index:\"flat\", distance:\"cos\"}')"])
    (doseq [[k v] (sort meta)]
      (jdbc/execute! tx ["INSERT INTO meta (k, v) VALUES (?, ?)" k v]))))

;;; -------------------------------------------------- Connection --------------------------------------------------

(defonce ^:private lock (Object.))

(defonce ^:private state
  ;; {:conn Connection, :path String, :embedding-model resolved-model, :schema status} while open, nil otherwise.
  ;; Written only while holding `lock`.
  (atom nil))

(defn- open-connection ^Connection [path]
  (let [config (doto (SQLiteConfig.)
                 (.enableLoadExtension true)
                 (.setJournalMode SQLiteConfig$JournalMode/WAL)
                 (.setBusyTimeout 5000))
        conn   (DriverManager/getConnection (str "jdbc:sqlite:" path) (.toProperties config))]
    (try
      (jdbc/execute-one! conn ["SELECT load_extension(?)" (extension-path)])
      conn
      (catch Throwable t
        (.close conn)
        (throw t)))))

(defn- delete-files! [path]
  (doseq [suffix ["" "-wal" "-shm" "-journal"]]
    (io/delete-file (str path suffix) true)))

(defn- open-store
  "Open `path` with a schema for `embedding-model`: reuse a matching store, create one in a new file, and delete and
  recreate a store written for another model or schema version (or a file that isn't a store)."
  [path embedding-model]
  (let [expected (expected-meta embedding-model)
        conn     (open-connection path)]
    (try
      (let [stored (read-meta conn)]
        (cond
          (= expected stored)
          {:conn conn :schema :existing}

          (and (nil? stored) (empty? (table-names conn)))
          (do (create-schema! conn expected)
              {:conn conn :schema :created})

          :else
          (do (log/warnf "SQLite semantic search store at %s does not match %s (found %s); recreating it"
                         path (pr-str expected) (pr-str stored))
              (.close conn)
              (delete-files! path)
              (let [conn (open-connection path)]
                (try
                  (create-schema! conn expected)
                  {:conn conn :schema :recreated}
                  (catch Throwable t
                    (.close conn)
                    (throw t)))))))
      (catch Throwable t
        (when-not (.isClosed conn)
          (.close conn))
        (throw t)))))

(defn open!
  "Open the store at `path` (default [[db-path]]) for `:embedding-model` (default: the configured model), creating
  or recreating its schema as needed (see [[store-info]] for which). Closes a store open at another path or for
  another model; no-op when already open at `path` for the same model. Returns `path`."
  ([]
   (open! (or (db-path)
              (throw (ex-info "MB_SEMANTIC_SEARCH_SQLITE_PATH is not set" {})))))
  ([path]
   (open! path {}))
  ([path {:keys [embedding-model]}]
   (let [embedding-model (resolve-model (or embedding-model (semantic.embedding/get-configured-model)))]
     (locking lock
       (when-not (and (= path (:path @state))
                      (= (expected-meta embedding-model) (expected-meta (:embedding-model @state))))
         (when-let [{:keys [^Connection conn]} @state]
           (.close conn))
         (reset! state nil)
         (io/make-parents (io/file path))
         (let [{:keys [conn schema]} (open-store path embedding-model)]
           (reset! state {:conn conn :path path :embedding-model embedding-model :schema schema})
           (log/infof "Opened SQLite semantic search store at %s (%s)" path (name schema))))
       path))))

(defn close!
  "Close the store if it is open."
  []
  (locking lock
    (when-let [{:keys [^Connection conn path]} @state]
      (.close conn)
      (reset! state nil)
      (log/infof "Closed SQLite semantic search store at %s" path))
    nil))

(defn delete-store!
  "Close the store and delete its files (`path` defaults to the open store's path, else [[db-path]])."
  ([]
   (delete-store! (or (:path @state) (db-path))))
  ([path]
   (locking lock
     (when (= path (:path @state))
       (close!))
     (delete-files! path)
     nil)))

(defn do-with-conn
  "Call `(f conn)` with the store's connection while holding the store lock, opening the store if needed.
  Prefer [[with-conn]]."
  [f]
  (locking lock
    (when-not @state
      (open!))
    (f (:conn @state))))

(defmacro with-conn
  "Evaluate `body` with `conn-binding` bound to the store's `java.sql.Connection`. Access is serialized: SQLite has a
  single writer and one JDBC connection is not safe to share between threads."
  [[conn-binding] & body]
  `(do-with-conn (fn [~(vary-meta conn-binding assoc :tag `Connection)] ~@body)))

(defn vec1-info
  "The loaded vec1 version string, e.g. `version 0.7 (NEON, multi-threaded)`."
  []
  (with-conn [conn]
    (:info (jdbc/execute-one! conn ["SELECT vec1_info() AS info"] {:builder-fn jdbc.rs/as-unqualified-maps}))))

;; with-conn opens the store if needed, so these report the store the next call would use.

(defn embedding-model
  "The resolved embedding model the open store holds vectors for."
  []
  (with-conn [_conn]
    (:embedding-model @state)))

(defn store-info
  "`{:path :schema :embedding-model :meta}` for the store; `:schema` is how the last open found it: `:created`,
  `:existing` or `:recreated`."
  []
  (with-conn [conn]
    (-> @state
        (select-keys [:path :schema :embedding-model])
        (assoc :meta (read-meta conn)))))

;;; ---------------------------------------------------- Blobs -----------------------------------------------------

(defn ->blob
  "Encode `embedding` (a seq of numbers) as vec1's native vector format: float32s in machine byte order."
  ^bytes [embedding]
  (let [buffer (.order (ByteBuffer/allocate (* 4 (count embedding))) (ByteOrder/nativeOrder))]
    (doseq [x embedding]
      (.putFloat buffer (float x)))
    (.array buffer)))

(defn <-blob
  "Decode a vec1 vector blob into a vector of floats."
  [^bytes blob]
  (let [buffer (.order (ByteBuffer/wrap blob) (ByteOrder/nativeOrder))]
    (into [] (repeatedly (quot (alength blob) 4) #(.getFloat buffer)))))

;;; -------------------------------------------------- Write path --------------------------------------------------

(def ^:dynamic *batch-size*
  "Documents per write batch: one embedding call and one transaction each."
  100)

(defn- ->int-bool [b]
  (when (some? b)
    (if (semantic.index/to-boolean b) 1 0)))

(defn- ->iso [t]
  (some-> t semantic.index/to-instant str))

(defn doc->row
  "The `search_doc` row for a search document (as produced by `metabase.search.ingestion`). `owner-ids` maps
  collection id -> personal owner id."
  [owner-ids {:keys [model id collection_id legacy_input] :as doc}]
  {:model                model
   :model_id             (str id)
   :collection_id        collection_id
   :personal_owner_id    (get owner-ids collection_id)
   :creator_id           (:creator_id doc)
   :database_id          (:database_id doc)
   :last_editor_id       (:last_editor_id doc)
   :name                 (or (:name doc) "")
   :content              (or (:embeddable_text doc) "")
   :display_type         (:display_type doc)
   :archived             (->int-bool (:archived doc))
   :official_collection  (->int-bool (:official_collection doc))
   :pinned               (->int-bool (:pinned doc))
   :verified             (->int-bool (:verified doc))
   :collection_type      (:collection_type doc)
   :root_collection_type (:root_collection_type doc)
   :data_layer           (:data_layer doc)
   :data_authority       (:data_authority doc)
   :curated              (->int-bool (:curated doc))
   :dashboardcard_count  (:dashboardcard_count doc)
   :view_count           (:view_count doc)
   :model_created_at     (->iso (:created_at doc))
   :model_updated_at     (->iso (:updated_at doc))
   :last_viewed_at       (->iso (:last_viewed_at doc))
   ;; ingestion already JSON-encodes legacy_input; tests pass maps
   :legacy_input         (if (string? legacy_input) legacy_input (json/encode legacy_input))
   :metadata             (json/encode (dissoc doc :embedding))})

(def ^:private doc-columns
  (vec (keys (doc->row {} {}))))

(defn- upsert-doc-rows-sql [rows]
  (sql/format {:insert-into   :search_doc
               :columns       doc-columns
               :values        (mapv (apply juxt doc-columns) rows)
               :on-conflict   [:model :model_id]
               :do-update-set (vec (remove #{:model :model_id} doc-columns))}
              {:quoted true}))

(defn- select-by-keys
  "`{[model model_id] {:id :content}}` for the `search_doc` rows of `row-keys` (`[model model_id]` pairs)."
  [conn row-keys]
  (into {}
        (mapcat (fn [[model model-ids]]
                  (for [{:keys [id model_id content]}
                        (jdbc/execute! conn (sql/format {:select [:id :model_id :content]
                                                         :from   [:search_doc]
                                                         :where  [:and [:= :model model] [:in :model_id model-ids]]})
                                       {:builder-fn jdbc.rs/as-unqualified-maps})]
                    [[model model_id] {:id id :content content}])))
        (update-vals (group-by first row-keys) #(mapv second %))))

(defn- existing-vector
  "The stored vector blob for `rowid`, or nil. Selects only `vector`: reading `distance` outside a KNN crashes."
  ^bytes [conn rowid]
  (:vector (jdbc/execute-one! conn ["SELECT vector FROM search_vec WHERE rowid = ?" rowid]
                              {:builder-fn jdbc.rs/as-unqualified-maps})))

(defn- cached-vectors
  "`{[model model_id] blob}` for rows whose stored content equals the new content: those need no new embedding."
  [conn rows]
  (let [existing (select-by-keys conn (map (juxt :model :model_id) rows))]
    (into {}
          (keep (fn [{:keys [content] :as row}]
                  (let [k (juxt :model :model_id)
                        {:keys [id] stored :content} (existing (k row))]
                    (when (= stored content)
                      (when-let [blob (existing-vector conn id)]
                        [(k row) blob])))))
          rows)))

(defn- embed
  "`{text embedding}` for `texts` using `embedding-model`. Texts the provider skips (e.g. over its token budget) are
  absent."
  [embedding-model texts]
  (let [acc (volatile! {})]
    (semantic.embedding/process-embeddings-streaming embedding-model texts
                                                     (fn [text->embedding]
                                                       (vswap! acc into text->embedding)
                                                       {})
                                                     {:type :index :record-tokens? true})
    @acc))

(defn- write-rows!
  "Upsert `rows` into `search_doc` and replace their vectors (`row-key->blob`) in `search_vec`, in one transaction."
  [conn rows row-key->blob]
  (jdbc/with-transaction [tx conn]
    (jdbc/execute! tx (upsert-doc-rows-sql rows))
    (let [ids (select-by-keys tx (map (juxt :model :model_id) rows))]
      (doseq [{:keys [model model_id] :as row} rows
              :let [id (get-in ids [[model model_id] :id])]]
        ;; delete + insert, never UPDATE: an UPDATE on a vec1 table crashes the JVM
        (jdbc/execute! tx ["DELETE FROM search_vec WHERE rowid = ?" id])
        (jdbc/execute! tx (into [(str "INSERT INTO search_vec (rowid, vector, " (str/join ", " vec-meta-columns) ")"
                                      " VALUES (?, ?" (str/join (repeat (count vec-meta-columns) ", ?")) ")")
                                 id (row-key->blob [model model_id])]
                                (map #(get row (keyword %)) vec-meta-columns)))))))

(defn- upsert-batch!
  [embedding-model docs]
  (let [dims      (:vector-dimensions embedding-model)
        owner-ids (semantic.index/batch-resolve-personal-owner-ids (map :collection_id docs))
        row-key   (juxt :model :model_id)
        ;; last one wins for a key given twice: one INSERT ... ON CONFLICT can't touch the same row twice
        rows      (vec (vals (into {} (map (juxt row-key identity)) (map (partial doc->row owner-ids) docs))))
        cached    (with-conn [conn] (cached-vectors conn rows))
        to-embed  (into [] (comp (remove (comp cached row-key)) (map :content) (distinct)) rows)
        ;; the slow part: outside the lock
        embedded  (try
                    (update-vals (embed embedding-model to-embed) ->blob)
                    (catch Exception e
                      (log/warnf e "Embedding %d texts failed; skipping a batch of %d documents"
                                 (count to-embed) (count docs))
                      ::failed))]
    (if (= ::failed embedded)
      {:failed (count docs)}
      (let [blob-for       (fn [row] (or (cached (row-key row)) (embedded (:content row))))
            {ok true missing false} (group-by #(some? (blob-for %)) rows)
            {ok true wrong false}   (group-by #(= (* 4 dims) (alength ^bytes (blob-for %))) ok)]
        (doseq [row (concat missing wrong)]
          (log/warnf "No usable embedding for %s %s; not indexed" (:model row) (:model_id row)))
        (when (seq ok)
          (with-conn [conn]
            (write-rows! conn ok (into {} (map (juxt row-key blob-for)) ok))))
        {:upserted (count ok)
         :embedded (count to-embed)
         :reused   (count (filter (comp cached row-key) ok))
         :skipped  (+ (count missing) (count wrong))}))))

(defn upsert-documents!
  "Index search `documents` (a reducible of `metabase.search.ingestion` documents) into the open store: embed their
  `:embeddable_text` with the store's model and insert or replace them. Documents whose content is unchanged reuse
  their stored vector. A batch whose embedding call fails is skipped. Returns counts: `:upserted`, `:embedded`
  (distinct texts sent to the provider), `:reused`, `:skipped`, `:failed`."
  [documents]
  (let [embedding-model (embedding-model)]
    (transduce (partition-all *batch-size*)
               (completing (fn [acc batch]
                             (merge-with + acc (upsert-batch! embedding-model batch))))
               {:upserted 0 :embedded 0 :reused 0 :skipped 0 :failed 0}
               documents)))

(defn delete-documents!
  "Remove the documents of `model` with `ids` from the store. Returns the number removed."
  [model ids]
  (if (empty? ids)
    0
    (with-conn [conn]
      (jdbc/with-transaction [tx conn]
        (let [rowids (mapv :id (vals (select-by-keys tx (map (fn [id] [model (str id)]) ids))))]
          (doseq [rowid rowids]
            (jdbc/execute! tx ["DELETE FROM search_vec WHERE rowid = ?" rowid]))
          (when (seq rowids)
            (jdbc/execute! tx (sql/format {:delete-from :search_doc :where [:in :id rowids]})))
          (count rowids))))))

(defn index-all!
  "Index every document of `documents` (e.g. `(metabase.search.ingestion/searchable-documents)`), logging progress.
  Documents already in the store but absent from `documents` are left alone. Returns the [[upsert-documents!]]
  counts plus `:elapsed-ms`."
  [documents]
  (let [timer  (u/start-timer)
        result (transduce (partition-all *batch-size*)
                          (completing (fn [acc batch]
                                        (let [acc (merge-with + acc (upsert-documents! batch))]
                                          (log/infof "SQLite semantic index: %s" (pr-str acc))
                                          acc)))
                          {:upserted 0 :embedded 0 :reused 0 :skipped 0 :failed 0}
                          documents)]
    (assoc result :elapsed-ms (long (u/since-ms timer)))))

(defonce ^:private indexing? (atom false))

(defn index-all-async!
  "[[index-all!]] on a background thread. Returns its future, or nil when a run is already in progress."
  [documents]
  (when (compare-and-set! indexing? false true)
    (future
      (try
        (index-all! documents)
        (catch Throwable t
          (log/error t "SQLite semantic indexing failed")
          (throw t))
        (finally
          (reset! indexing? false))))))

;;; -------------------------------------------------- Query path --------------------------------------------------

(def ^:private list-filters
  ;; knn option -> vec1 meta column, for options taking a collection of values
  {:models         "model"
   :database-ids   "database_id"
   :creator-ids    "creator_id"
   :collection-ids "collection_id"})

(def ^:private bool-filters
  {:archived? "archived"
   :verified? "verified"})

(defn- knn-where
  "`[sql & params]` for the WHERE clause of a KNN over `search_vec v`, or nil when nothing is filtered.
  Every condition is on a vec1 meta column with `IN` or `=`: vec1 applies those inside the scan (a pre-filter).
  It doesn't for `!=` or for columns of joined tables, which would shrink the top k instead."
  [opts]
  (let [clauses (concat
                 (for [[k column] list-filters
                       :let [values (get opts k)]
                       :when (some? values)]
                   (into [(format "v.%s IN (%s)" column (str/join ", " (repeat (count values) "?")))] values))
                 (for [[k column] bool-filters
                       :let [v (get opts k)]
                       :when (some? v)]
                   [(format "v.%s = ?" column) (if v 1 0)]))]
    (when (seq clauses)
      (into [(str/join " AND " (map first clauses))] (mapcat rest) clauses))))

(defn- empty-filter?
  "Does `opts` filter on an empty collection, i.e. match nothing?"
  [opts]
  (some #(and (some? (get opts %)) (empty? (get opts %))) (keys list-filters)))

(defn- decode-doc [row]
  (cond-> row
    (string? (:legacy_input row)) (update :legacy_input json/decode+kw)
    (string? (:metadata row))     (update :metadata json/decode+kw)))

(defn knn
  "The `:k` (default 50) documents nearest to `query-vector` (a seq of numbers), nearest first, as maps of `:id`
  (the store row id) `:model` `:model_id` `:name` `:collection_id` `:legacy_input` (decoded) `:distance` (cosine
  distance: 0 identical, 1 orthogonal, 2 opposite).

  Options filter inside the KNN, so up to `:k` matching documents come back:
  - `:models`, `:database-ids`, `:creator-ids`, `:collection-ids` -- collections of values; empty matches nothing
  - `:archived?`, `:verified?` -- booleans
  - `:max-distance` -- drop results farther than this"
  [query-vector & {:keys [k max-distance] :or {k 50} :as opts}]
  (if (empty-filter? opts)
    []
    (let [[where & where-params] (knn-where opts)
          rows (with-conn [conn]
                 (jdbc/execute! conn
                                (into [(str "SELECT d.id, d.model, d.model_id, d.name, d.collection_id, d.legacy_input,"
                                            " v.distance"
                                            ;; k is interpolated because LIMIT isn't visible to vec1 through the join
                                            " FROM search_vec(?, '{k: " (long k) "}') v"
                                            " JOIN search_doc d ON d.id = v.rowid"
                                            (when where (str " WHERE " where))
                                            " ORDER BY v.distance")
                                       (->blob query-vector)]
                                      where-params)
                                {:builder-fn jdbc.rs/as-unqualified-lower-maps}))]
      (into []
            (comp (filter #(or (nil? max-distance) (<= (:distance %) max-distance)))
                  (map decode-doc))
            rows))))

(defn- search-text* [text record-tokens? opts]
  (let [embedding-model (embedding-model)
        timer           (u/start-timer)
        query-vector    (semantic.embedding/get-embedding embedding-model
                                                          (semantic.embedding/prefix-search-query embedding-model text)
                                                          {:type :query :record-tokens? record-tokens?})
        embedding-ms    (u/since-ms timer)
        knn-timer       (u/start-timer)
        rows            (knn query-vector opts)]
    {:rows         rows
     :embedding-ms embedding-ms
     :knn-ms       (u/since-ms knn-timer)}))

(defn search-text
  "Embed `text` as a search query with the store's model and return its [[knn]] (same options, plus
  `:record-tokens?`, default true) as `{:rows :embedding-ms :knn-ms}`."
  [text & {:keys [record-tokens?] :or {record-tokens? true} :as opts}]
  ;; nothing can match: skip the embedding round-trip
  (if (empty-filter? opts)
    {:rows [] :embedding-ms 0 :knn-ms 0}
    (search-text* text record-tokens? opts)))

(defn get-doc
  "The full `search_doc` row of `model`/`id` (JSON columns decoded) plus `:has-vector?`, or nil."
  [model id]
  (with-conn [conn]
    (when-let [row (jdbc/execute-one! conn ["SELECT * FROM search_doc WHERE model = ? AND model_id = ?" model (str id)]
                                      {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
      (assoc (decode-doc row)
             ;; only rowid: selecting distance outside a KNN crashes
             :has-vector? (some? (jdbc/execute-one! conn ["SELECT rowid FROM search_vec WHERE rowid = ?" (:id row)]))))))

(defn stats
  "Store health: `:docs` and `:vectors` (equal in a consistent store), `:by-model` doc counts, `:file-bytes` (db +
  WAL), plus [[store-info]] and the vec1 version."
  []
  (with-conn [conn]
    (let [count-of (fn [sql] (:n (jdbc/execute-one! conn [sql] {:builder-fn jdbc.rs/as-unqualified-lower-maps})))
          path     (:path @state)]
      (merge (select-keys @state [:path :schema :embedding-model])
             {:meta       (read-meta conn)
              :vec1       (:info (jdbc/execute-one! conn ["SELECT vec1_info() AS info"]
                                                    {:builder-fn jdbc.rs/as-unqualified-lower-maps}))
              :docs       (count-of "SELECT count(*) AS n FROM search_doc")
              ;; the vec1 base shadow table holds one row per vector
              :vectors    (count-of "SELECT count(*) AS n FROM search_vec_base")
              :by-model   (into (sorted-map)
                                (map (juxt :model :n))
                                (jdbc/execute! conn ["SELECT model, count(*) AS n FROM search_doc GROUP BY model"]
                                               {:builder-fn jdbc.rs/as-unqualified-lower-maps}))
              :file-bytes (reduce + (for [suffix ["" "-wal"]
                                          :let [f (io/file (str path suffix))]
                                          :when (.exists f)]
                                      (.length f)))}))))
