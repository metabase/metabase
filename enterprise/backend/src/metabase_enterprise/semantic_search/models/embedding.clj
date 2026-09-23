(ns metabase-enterprise.semantic-search.models.embedding
  "Codec for the embedding vectors stored in the app DB by the Lucene semantic-search backend."
  (:require
   [buddy.core.codecs :as buddy-codecs]
   [buddy.core.hash :as buddy-hash])
  (:import
   (java.nio ByteBuffer ByteOrder)
   (java.nio.charset StandardCharsets)))

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
