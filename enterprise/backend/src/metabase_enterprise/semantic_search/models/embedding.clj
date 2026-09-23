(ns metabase-enterprise.semantic-search.models.embedding
  "`:model/SemanticSearchEmbedding` and the codec for the embedding vectors it stores in the app DB.

  One row per search document per embedding space. The Lucene semantic-search backend treats this table as the
  source of truth and each node's Lucene index as a disposable materialization of it."
  (:require
   [buddy.core.codecs :as buddy-codecs]
   [buddy.core.hash :as buddy-hash]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.nio ByteBuffer ByteOrder)
   (java.nio.charset StandardCharsets)
   (java.sql Blob)))

(set! *warn-on-reflection* true)

(def ^:const bytes-per-float
  "Width of one encoded vector component. Vectors are float32, so a `dims`-dimensional vector is `4 * dims` bytes."
  4)

(defn floats->bytes
  "Encode `floats` (anything `float-array` accepts) as little-endian float32 bytes."
  ^bytes [floats]
  (let [^floats fs (float-array floats)
        buf        (.order (ByteBuffer/allocate (* bytes-per-float (alength fs))) ByteOrder/LITTLE_ENDIAN)]
    (.put (.asFloatBuffer buf) fs)
    (.array buf)))

(defn bytes->floats
  "Decode bytes written by [[floats->bytes]] back into a `float[]`.

  Throws when `bs` is not a whole number of float32 components."
  ^floats [^bytes bs]
  (when-not (zero? (mod (alength bs) bytes-per-float))
    (throw (ex-info "Embedding blob is not a whole number of float32 components"
                    {:byte-count (alength bs)})))
  (let [fb  (.asFloatBuffer (.order (ByteBuffer/wrap bs) ByteOrder/LITTLE_ENDIAN))
        out (float-array (.remaining fb))]
    (.get fb out)
    out))

(defn content-hash
  "Return the hex SHA-256 of `text`, the key under which its embedding is cached and reused."
  ^String [^String text]
  (-> (.getBytes (or text "") StandardCharsets/UTF_8)
      buddy-hash/sha256
      buddy-codecs/bytes->hex))

;;;; Model

(derive :model/SemanticSearchEmbedding :metabase/model)

(methodical/defmethod t2/table-name :model/SemanticSearchEmbedding [_model] :semantic_search_embedding)

(defn- blob->bytes ^bytes [v]
  ;; H2 hands back a java.sql.Blob where Postgres and MySQL hand back a byte array.
  (if (instance? Blob v)
    (let [^Blob b v] (.getBytes b 1 (int (.length b))))
    v))

(t2/deftransforms :model/SemanticSearchEmbedding
  {:embedding {:in identity :out blob->bytes}
   :document  mi/transform-json})
