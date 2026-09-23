(ns metabase-enterprise.semantic-search.lucene.index
  "This node's Apache Lucene index: the vector store behind the `:lucene` semantic search backend.

  The app-DB table `semantic_search_embedding` is the source of truth. This index is a disposable local
  materialization of it — one directory per embedding space, under the plugins dir — that any node can rebuild
  from the table.

  The document schema below is the contract with [[metabase-enterprise.semantic-search.lucene.query]]:

  | field                                                     | type                            | value |
  |-----------------------------------------------------------|---------------------------------|-------|
  | `id`                                                      | StringField (stored) + SortedDocValuesField | `\"<model>_<model_id>\"` |
  | `model`, `model_id`                                       | StringField (stored)            | raw string |
  | `display_type`                                            | StringField                     | raw string |
  | `archived`, `verified`, `curated`                         | StringField                     | `\"true\"`/`\"false\"` |
  | `collection_id`, `creator_id`, `last_editor_id`, `database_id` | StringField                | decimal string, absent when nil |
  | `personal_owner_id`                                       | StringField                     | decimal string, or `\"__null__\"` |
  | `model_created_at`, `model_updated_at`                    | LongPoint                       | epoch millis, absent when nil |
  | `embedding`                                               | KnnFloatVectorField (COSINE)    | absent for degenerate vectors |
  | `legacy_input`                                            | StoredField                     | the JSON string ingestion produced |"
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.models.embedding :as semantic.models.embedding]
   [metabase.plugins.core :as plugins]
   [metabase.util.date-2 :as u.date]
   [metabase.util.files :as u.files]
   [metabase.util.log :as log])
  (:import
   (java.nio.file FileVisitOption Files Path)
   (java.time.temporal Temporal)
   (org.apache.lucene.document Document Field$Store KnnFloatVectorField LongPoint SortedDocValuesField StoredField
                               StringField)
   (org.apache.lucene.index CorruptIndexException DocValues IndexNotFoundException IndexWriter IndexWriterConfig
                            IndexWriterConfig$OpenMode LeafReader LeafReaderContext SortedDocValues Term
                            VectorSimilarityFunction)
   (org.apache.lucene.search DocIdSetIterator IndexSearcher SearcherFactory SearcherManager)
   (org.apache.lucene.store Directory FSDirectory LockObtainFailedException)
   (org.apache.lucene.util BytesRef)))

(set! *warn-on-reflection* true)

(def ^:const max-dimensions
  "Widest vector Lucene's default codec will index. `Lucene99HnswVectorsFormat#getMaxDimensions` returns 1024;
  going wider needs a custom `Codec`.
  https://lucene.apache.org/core/10_5_1/core/org/apache/lucene/codecs/KnnVectorsFormat.html"
  1024)

(def ^:const null-owner
  "Sentinel indexed in `personal_owner_id` for documents outside any personal collection.

  Lucene's `FieldExistsQuery` does not cover `StringField`, so \"has no personal owner\" needs a real term."
  "__null__")

(def ^:dynamic *index-root*
  "Directory holding one subdirectory per embedding space. Defaults to `<plugins dir>/semantic-search`."
  nil)

(defonce ^:private state
  ;; {:space-id :dims :path :directory :writer :manager}, or nil when no index is open on this node.
  (atom nil))

(defonce ^:private lock (Object.))

(defn document-id
  "Lucene document id for `model`/`model-id`, the term used to update and delete a single search document."
  ^String [model model-id]
  (str model "_" model-id))

(defn- index-root ^Path []
  (if *index-root*
    (u.files/get-path (str *index-root*))
    (u.files/append-to-path (plugins/plugins-dir) "semantic-search")))

(defn- space-dir ^Path [space-id]
  (u.files/append-to-path (index-root) (str/replace (str space-id) #"[^A-Za-z0-9._-]" "_")))

(defn- delete-recursive! [^Path path]
  (when (u.files/exists? path)
    (with-open [stream (Files/walk path (into-array FileVisitOption []))]
      (doseq [^Path p (rseq (vec (iterator-seq (.iterator stream))))]
        (try (Files/delete p)
             (catch Exception e
               (log/warnf "Failed to delete %s: %s" p (ex-message e))))))))

(defn- open-directory! [space-id dims]
  (let [path (space-dir space-id)]
    (u.files/create-dir-if-not-exists! path)
    (let [directory (FSDirectory/open path)
          config    (doto (IndexWriterConfig.)
                      (.setOpenMode IndexWriterConfig$OpenMode/CREATE_OR_APPEND))
          writer    (IndexWriter. directory config)]
      {:space-id  space-id
       :dims      dims
       :path      path
       :directory directory
       :writer    writer
       :manager   (SearcherManager. writer (SearcherFactory.))})))

(defn- open-index!
  "Open the index directory for `space-id`, wiping and recreating it once if the existing one cannot be opened."
  [space-id dims]
  (when (> dims max-dimensions)
    (throw (ex-info (str "Embedding model is too wide for the Lucene semantic search index: "
                         dims " dimensions, maximum " max-dimensions)
                    {:dims dims :max-dimensions max-dimensions})))
  (try
    (open-directory! space-id dims)
    (catch Exception e
      ;; A half-written or lock-stranded directory is recoverable: the app-DB table can refill it.
      (if (some (partial instance? (class e))
                [CorruptIndexException IndexNotFoundException LockObtainFailedException])
        (do
          (log/warnf "Recreating unreadable semantic search Lucene index at %s: %s" (space-dir space-id) (ex-message e))
          (delete-recursive! (space-dir space-id))
          (open-directory! space-id dims))
        (throw e)))))

(defn- close-state! [{:keys [^SearcherManager manager ^IndexWriter writer ^Directory directory path]}]
  (doseq [[what ^java.io.Closeable closeable] [["searcher manager" manager] ["writer" writer] ["directory" directory]]
          :when closeable]
    (try (.close closeable)
         (catch Exception e
           (log/warnf "Failed to close semantic search Lucene %s at %s: %s" what path (ex-message e))))))

(defn close!
  "Close this node's Lucene index. A no-op when none is open."
  []
  (locking lock
    (when-let [s @state]
      (close-state! s)
      (reset! state nil)
      (log/infof "Closed semantic search Lucene index at %s" (:path s))))
  nil)

(defn configured-space
  "Return `{:space-id … :dims …}` for the embedding model this instance is configured to use.

  Throws when the configured embedding provider is not installed."
  []
  (let [resolved (semantic.embedding/resolve-model (semantic.embedding/get-configured-model))]
    {:space-id (:embedding-space-id resolved)
     :dims     (:vector-dimensions resolved)}))

(defn ensure-open!
  "Open this node's Lucene index for `space-id`, returning its state map.

  Reopens when the embedding space (or [[*index-root*]]) changed since the last call, so a model switch lands in
  a fresh directory. Throws when `dims` exceeds [[max-dimensions]] or the directory cannot be created."
  ([]
   (let [{:keys [space-id dims]} (configured-space)]
     (ensure-open! space-id dims)))
  ([space-id dims]
   (let [path    (space-dir space-id)
         current @state]
     (if (= path (:path current))
       current
       (locking lock
         (let [current @state]
           (if (= path (:path current))
             current
             (do
               (when current (close-state! current))
               (let [opened (open-index! space-id dims)]
                 (reset! state opened)
                 (log/infof "Opened semantic search Lucene index at %s" path)
                 opened)))))))))

(defn- current-state []
  (or @state
      (throw (ex-info "Semantic search Lucene index is not open" {}))))

(defn do-with-searcher
  "Call `f` with an `IndexSearcher` over this node's index, releasing it afterwards. See [[with-searcher]]."
  [f]
  (let [^SearcherManager manager (:manager (current-state))
        searcher                 (.acquire manager)]
    (try
      (f searcher)
      (finally
        (.release manager searcher)))))

(defmacro with-searcher
  "Evaluate `body` with `binding` bound to an `IndexSearcher` over this node's index.

  The searcher is released on the way out, so do not let it — or anything reading through it — escape `body`."
  {:style/indent 1}
  [[binding] & body]
  `(do-with-searcher (fn [~binding] ~@body)))

;;;; Writing

(defn- epoch-millis
  "Epoch millis for a timestamp that has been through JSON, or nil when absent or unparsable.

  Timestamps without an offset are read as UTC, which is how the app DB stores them."
  [v]
  (try
    (some-> (cond
              (string? v)                  (u.date/parse v "UTC")
              (instance? Temporal v)       v
              (instance? java.util.Date v) (t/instant v))
            t/instant
            inst-ms)
    (catch Exception e
      (log/debugf "Ignoring unparsable search timestamp %s: %s" (pr-str v) (ex-message e))
      nil)))

(defn- add-term! [^Document doc ^String field value stored?]
  (when (some? value)
    (.add doc (StringField. field (str value) (if stored? Field$Store/YES Field$Store/NO)))))

(defn- add-long-point! [^Document doc ^String field v]
  (when-let [millis (epoch-millis v)]
    (.add doc (LongPoint. field (long-array [millis])))))

(defn- add-vector!
  "Add the kNN field unless `bytes` decodes to a vector Lucene cannot score under cosine similarity."
  [^Document doc ^bytes embedding dims]
  (let [^floats v (semantic.models.embedding/bytes->floats embedding)]
    (cond
      (not= (alength v) (int dims))
      (log/warnf "Skipping embedding of width %d in an index of width %d" (alength v) dims)

      ;; COSINE throws on the zero vector; index the document without it so the id still tracks the table row.
      (every? zero? v)
      (log/warn "Skipping all-zero embedding, document will not be reachable by vector search")

      :else
      (.add doc (KnnFloatVectorField. "embedding" v VectorSimilarityFunction/COSINE)))))

(defn- row->document
  "Build the Lucene document for one `semantic_search_embedding` row. See the schema table in this namespace."
  ^Document [{:keys [model model_id embedding document]} dims]
  (let [doc (Document.)
        id  (document-id model model_id)]
    (add-term! doc "id" id true)
    (.add doc (SortedDocValuesField. "id" (BytesRef. id)))
    (add-term! doc "model" model true)
    (add-term! doc "model_id" model_id true)
    (add-term! doc "display_type" (:display_type document) false)
    (add-term! doc "archived" (boolean (:archived document)) false)
    (add-term! doc "verified" (:verified document) false)
    (add-term! doc "curated" (:curated document) false)
    (add-term! doc "collection_id" (:collection_id document) false)
    (add-term! doc "creator_id" (:creator_id document) false)
    (add-term! doc "last_editor_id" (:last_editor_id document) false)
    (add-term! doc "database_id" (:database_id document) false)
    (add-term! doc "personal_owner_id" (or (:personal_owner_id document) null-owner) false)
    (add-long-point! doc "model_created_at" (:created_at document))
    (add-long-point! doc "model_updated_at" (:updated_at document))
    (when embedding
      (add-vector! doc embedding dims))
    (.add doc (StoredField. "legacy_input" ^String (str (:legacy_input document))))
    doc))

(defn- refresh! [{:keys [^IndexWriter writer ^SearcherManager manager]}]
  (.commit writer)
  (.maybeRefresh manager))

(defn upsert-rows!
  "Index `rows` read from `semantic_search_embedding`, replacing any document with the same [[document-id]].

  Commits and refreshes the searcher before returning the number of documents written."
  [rows]
  (let [{:keys [^IndexWriter writer dims] :as s} (current-state)
        written (reduce (fn [n {:keys [model model_id] :as row}]
                          (.updateDocument writer
                                           (Term. "id" (document-id model model_id))
                                           (row->document row dims))
                          (inc n))
                        0
                        rows)]
    (when (pos? written)
      (refresh! s))
    written))

(defn delete-ids!
  "Remove the documents with the given [[document-id]]s, returning the number of ids submitted."
  [ids]
  (let [{:keys [^IndexWriter writer] :as s} (current-state)
        terms (mapv #(Term. "id" ^String %) ids)]
    (when (seq terms)
      (let [^"[Lorg.apache.lucene.index.Term;" arr (into-array Term terms)]
        (.deleteDocuments writer arr))
      (refresh! s))
    (count terms)))

(defn delete-all!
  "Remove every document from this node's index."
  []
  (let [{:keys [^IndexWriter writer] :as s} (current-state)]
    (.deleteAll writer)
    (refresh! s)
    nil))

;;;; Reading

(defn- leaf-ids [^LeafReaderContext ctx]
  (let [^LeafReader reader   (.reader ctx)
        live                 (.getLiveDocs reader)
        ^SortedDocValues dvs (DocValues/getSorted reader "id")]
    (loop [acc (transient [])]
      (let [doc (.nextDoc dvs)]
        (if (= doc DocIdSetIterator/NO_MORE_DOCS)
          (persistent! acc)
          (recur (if (or (nil? live) (.get live doc))
                   (conj! acc (.utf8ToString (.lookupOrd dvs (.ordValue dvs))))
                   acc)))))))

(defn live-ids
  "Set of [[document-id]]s currently visible in this node's index."
  []
  (with-searcher [^IndexSearcher searcher]
    (into #{} (mapcat leaf-ids) (.leaves (.getIndexReader searcher)))))

(defn live-count
  "Number of documents currently visible in this node's index."
  []
  (with-searcher [^IndexSearcher searcher]
    (.numDocs (.getIndexReader searcher))))

(defn open?
  "Whether this node has a Lucene index open."
  []
  (some? @state))
