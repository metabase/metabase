(ns metabase.driver.quack.codec
  "Binary framing for the DuckDB Quack wire protocol — Clojure port of the
  validated encoder/decoder in ``capture/quack_codec.py``. See PROTOCOL.md.

  A Quack message is two concatenated binary objects — a header and a body —
  each a sequence of fields terminated by ``0xFFFF``:

      [ object: header ][ object: body ]

  Field id   = 2 bytes, little-endian uint16 (raw, NOT varint)
  Terminator = 2 bytes 0xFFFF
  Integers   = LEB128 (signed ints use two's-complement LEB128)
  Strings    = LEB128(byte-length) + UTF-8 bytes
  Data blobs = LEB128(byte-length) + raw bytes
  Lists      = LEB128(count) + elements
  Enums      = underlying integer as LEB128
  Booleans   = 1 byte (0/1)
  hugeint_t  = LEB128(int64 upper) + LEB128(uint64 lower)

  Two subtleties (confirmed live — see PROTOCOL.md §6):

  * ``WritePropertyWithDefault`` OMITS fields equal to default — decode by
    peeking field ids, never assume order/presence.
  * MessageHeader field 3 (``client_query_id``) is STRICT and MUST be present
    even when absent — encode absence as INVALID_INDEX (2^64-1)."
  (:refer-clojure :exclude [cat])
  (:require
   [metabase.util.performance :refer [mapv]])
  (:import [java.io ByteArrayOutputStream]
           [java.nio ByteBuffer ByteOrder]))

(set! *warn-on-reflection* true)

(def ^:const invalid-index
  "Sentinel value for an absent optional index."
  0xFFFFFFFFFFFFFFFF)
(def ^:const field-terminator
  "Object terminator field identifier."
  0xFFFF)

;; uint64 mask as BigInteger (can't be a long literal — 2^64-1 overflows).
;; Used by [[hugeint]] to re-interpret the signed `lower` long as uint64 before
;; unsigned-LEB128 encoding, so values with the high bit set (e.g. UUIDs, the
;; result-uuid of a multi-batch result) round-trip instead of sending
;; [[encode-uleb128]] into an infinite loop on a negative BigInteger.
(def ^:private uint64-mask (BigInteger. "18446744073709551615"))

;; Message types (enum class MessageType : uint8_t)
(def ^:const type-connection-request
  "Connection request message type."
  1)
(def ^:const type-connection-response
  "Connection response message type."
  2)
(def ^:const type-prepare-request
  "Prepare request message type."
  3)
(def ^:const type-prepare-response
  "Prepare response message type."
  4)
(def ^:const type-fetch-request
  "Fetch request message type."
  7)
(def ^:const type-fetch-response
  "Fetch response message type."
  8)
(def ^:const type-success-response
  "Success response message type."
  10)
(def ^:const type-disconnect-message
  "Disconnect message type."
  11)
(def ^:const type-error-response
  "Error response message type."
  100)

;; ---------------------------------------------------------------------------
;; LEB128 — variable-length integer encoding used throughout the format.
;; See PROTOCOL.md §2. uleb128 = unsigned (used for counts, lengths, field ids);
;; sleb128 = two's-complement signed (used for hugeint's upper int64).
;; ---------------------------------------------------------------------------
(defn- encode-uleb128
  "Encode a non-negative integer (possibly > Long/MAX_VALUE, e.g. INVALID_INDEX)
  as unsigned LEB128. Uses BigInteger so 2^64-1 round-trips correctly."
  ^bytes [v]
  (let [bi (biginteger v)
        out (ByteArrayOutputStream. 10)]
    (loop [bi bi]
      (let [byte (-> (.and bi (BigInteger/valueOf 0x7F)) (.intValue))
            bi'  (.shiftRight bi 7)]
        (when-not (= BigInteger/ZERO bi') (.write out (bit-or byte 0x80)))
        (if (= BigInteger/ZERO bi') (.write out byte) (recur bi'))))
    (.toByteArray out)))

(defn- encode-sleb128
  "Encode a signed long as two's-complement LEB128."
  ^bytes [^long value]
  (let [out (ByteArrayOutputStream. 10)]
    (loop [v value]
      (let [byte (bit-and v 0x7F)
            v'   (bit-shift-right v 7)]            ; arithmetic shift for negatives
        (if (or (and (zero? v') (zero? (bit-and byte 0x40)))
                (and (== v' -1) (not (zero? (bit-and byte 0x40)))))
          (.write out byte)
          (do (.write out (bit-or byte 0x80)) (recur v')))))
    (.toByteArray out)))

;; ---------------------------------------------------------------------------
;; Encoder primitives. A Quack object is a sequence of `field` encodings
;; terminated by 0xFFFF (see `object`). Every value below returns raw bytes;
;; compose them with `field`/`object`/`message`.
;; ---------------------------------------------------------------------------
(defn- cat
  "Concatenate two byte arrays."
  ^bytes [^bytes a ^bytes b]
  (let [out (byte-array (+ (alength a) (alength b)))]
    (System/arraycopy a 0 out 0 (alength a))
    (System/arraycopy b 0 out (alength a) (alength b)) out))

(defn- u16
  "Encode a field id / unsigned 16-bit int as 2 little-endian bytes (NOT varint)."
  ^bytes [^long v] (-> (ByteBuffer/allocate 2) (.order ByteOrder/LITTLE_ENDIAN) (.putShort (unchecked-short v)) (.array)))

(defn varuint
  "Encode an integer (Number or BigInteger) as unsigned LEB128."
  ^bytes [v] (encode-uleb128 v))

(defn varint
  "Encode a signed long as signed LEB128."
  ^bytes [^long v] (encode-sleb128 v))

(defn- raw-bytes
  "Coerce a value to its raw encoded bytes: bytes pass through, strings → UTF-8,
  numbers → unsigned LEB128."
  ^bytes [x]
  (cond (bytes? x) x
        (string? x) (.getBytes ^String x "UTF-8")
        (instance? Number x) (varuint (long x))
        :else (throw (ex-info "unsupported raw value" {:value x}))))

(defn field
  "Encode one field: `<field-id u16-LE> <encoded value>`. The building block of
  every object; see PROTOCOL.md §2."
  ^bytes [fid value-bytes] (cat (u16 fid) (raw-bytes value-bytes)))

(defn bool "Encode a boolean as a single 0/1 byte." ^bytes [v] (byte-array [(if (boolean v) 1 0)]))

(defn string
  "Encode a string: `<uleb128 byte-length> <UTF-8 bytes>`."
  ^bytes [^String s]
  (let [^bytes b (.getBytes s "UTF-8")]
    (cat (varuint (alength b)) b)))

(defn blob
  "Encode a WriteDataPtr blob: `<uleb128 byte-count> <raw bytes>`.
  (Self-describing length — never assume count*elemsize when decoding.)"
  ^bytes [^bytes b]
  (cat (varuint (alength b)) b))

(defn hugeint
  "Encode a hugeint_t `{int64 upper, uint64 lower}` — each as its own LEB128.
  Value = (upper << 64) | lower. See PROTOCOL.md §6. The `lower` arg is a
  signed long whose bit pattern is interpreted as uint64 (masked), so values
  > 2^63-1 (UUIDs, multi-batch result-uuids) round-trip correctly."
  ^bytes [^long upper ^long lower]
  (cat (encode-sleb128 upper)
       (encode-uleb128 (.and (BigInteger/valueOf lower) uint64-mask))))

(defn optional-idx
  "optional_idx → uint64 varint; nil/absence = INVALID_INDEX (always written)."
  (^bytes [] (varuint invalid-index))
  (^bytes [v] (varuint (or v invalid-index))))

(defn terminator "The 0xFFFF object terminator, 2 bytes." ^bytes [] (u16 field-terminator))

(defn object
  "Concatenate field encodings, then the 0xFFFF object terminator."
  ^bytes [& field-bytes]
  (let [parts (conj (vec field-bytes) (terminator))
        total (reduce + 0 (mapv alength parts))
        out   (byte-array total)]
    (loop [i 0 xs (seq parts)]
      (if-not xs out
              (let [^bytes b (first xs)]
                (System/arraycopy b 0 out i (alength b))
                (recur (+ i (alength b)) (next xs)))))))

(defn header
  "Build a MessageHeader object. Field 3 is ALWAYS written (strict read)."
  (^bytes [message-type] (header message-type nil nil))
  (^bytes [message-type connection-id] (header message-type connection-id nil))
  (^bytes [message-type connection-id client-query-id]
   (let [base [(field 1 (varuint message-type))]]
     (cond-> (vec base)
       (some? connection-id) (conj (field 2 (string connection-id)))
       :always               (conj (field 3 (optional-idx client-query-id)))
       :always               (->> (apply object))))))

(defn message
  "A full message = header object + body object, concatenated."
  ^bytes [^bytes header-bytes ^bytes body-bytes]
  (cat header-bytes body-bytes))

;; ---------------------------------------------------------------------------
;; Decoder — a little-endian ByteBuffer (mutable position built in)
;; ---------------------------------------------------------------------------
(defn reader
  "Wrap a response byte array in a little-endian ByteBuffer for sequential reads."
  ^ByteBuffer [^bytes buf]
  (-> (ByteBuffer/wrap buf) (.order ByteOrder/LITTLE_ENDIAN)))

(defn- read-n
  "Read exactly `n` bytes from the buffer."
  ^bytes [^ByteBuffer b ^long n]
  (when (> n (.remaining b))
    (throw (ex-info "EOF reading bytes" {:wanted n :available (.remaining b)})))
  (let [out (byte-array n)] (.get b out 0 n) out))

(defn read-u8
  "Read an unsigned 8-bit integer."
  ^long [^ByteBuffer b]
  (when-not (.hasRemaining b) (throw (ex-info "EOF" {})))
  (bit-and (.get b) 0xFF))

(defn read-u16
  "Read an unsigned 16-bit integer."
  ^long [^ByteBuffer b]
  (when (< (.remaining b) 2) (throw (ex-info "EOF" {})))
  (bit-and (.getShort b) 0xFFFF))

(defn read-u32
  "Read an unsigned 32-bit integer."
  ^long [^ByteBuffer b]
  (when (< (.remaining b) 4) (throw (ex-info "EOF" {})))
  (unchecked-long (.getInt b)))

(defn read-u64
  "Read an unsigned 64-bit integer."
  ^long [^ByteBuffer b]
  (when (< (.remaining b) 8) (throw (ex-info "EOF" {})))
  (.getLong b))

(defn read-f32
  "Read a 32-bit floating-point value."
  ^double [^ByteBuffer b]
  (double (.getFloat b)))

(defn read-f64
  "Read a 64-bit floating-point value."
  ^double [^ByteBuffer b]
  (.getDouble b))

(defn read-uleb128
  "Decode an unsigned LEB128 integer into a signed long. NOTE: values > 2^63-1
  (notably INVALID_INDEX = 2^64-1) wrap to negative — this matches how C++ idx_t
  and our codec treat them. See PROTOCOL.md §6."
  ^long [^ByteBuffer b]
  (loop [result 0 shift 0]
    (let [byte   (read-u8 b)
          result (bit-or result (bit-shift-left (bit-and byte 0x7F) shift))
          shift  (+ shift 7)]
      (if (zero? (bit-and byte 0x80))
        result
        (recur result shift)))))

(defn read-sleb128
  "Decode a signed (two's-complement) LEB128 integer, sign-extending the result."
  ^long [^ByteBuffer b]
  (loop [result 0 shift 0]
    (let [byte (read-u8 b)
          result (bit-or result (bit-shift-left (bit-and byte 0x7F) shift))
          shift  (+ shift 7)]
      (if (zero? (bit-and byte 0x80))
        (if (not (zero? (bit-and byte 0x40)))
          (bit-or result (bit-shift-left -1 shift))   ; sign-extend
          result)
        (recur result shift)))))

(defn read-utf8
  "Decode a Quack string: `<uleb128 length> <UTF-8 bytes>`."
  ^String [^ByteBuffer b]
  (let [n (read-uleb128 b)]
    (if (zero? n) "" (String. ^bytes (read-n b n) "UTF-8"))))

(defn read-blob
  "Decode a WriteDataPtr blob (self-describing length)."
  ^bytes [^ByteBuffer b]
  (let [n (read-uleb128 b)]
    (if (zero? n) (byte-array 0) (read-n b n))))

(defn read-field-id
  "Read the next unsigned 16-bit field identifier."
  ^long [^ByteBuffer b]
  (read-u16 b))

(defn read-hugeint
  "Returns [upper lower] (upper signed, lower unsigned)."
  [^ByteBuffer b] [(read-sleb128 b) (read-uleb128 b)])

(defn read-list
  "Read count then call (elem-reader b) count times."
  [elem-reader ^ByteBuffer b]
  (let [n (read-uleb128 b)]
    (loop [i 0 acc (transient [])]
      (if (>= i n) (persistent! acc)
          (recur (inc i) (conj! acc (elem-reader b)))))))

(defn read-object
  "Read fields until terminator, threading `acc` through
  (field-handler fid acc b). Returns the final accumulator."
  ([field-handler b] (read-object field-handler b nil))
  ([field-handler ^ByteBuffer b init-acc]
   (loop [acc init-acc]
     (let [fid (read-field-id b)]
       (if (== fid field-terminator) acc
           (recur (field-handler fid acc b)))))))

(defn consume-object
  "Read & discard one object up to its terminator, with NO schema awareness.
  Only handles objects that are empty (the next field id IS the terminator):
  the lone call site (an optional nested object in ExtraTypeInfo, field 103)
  only ever receives an empty object. Throws if the object turns out to have
  any typed fields — at that point the caller must decode it explicitly."
  [^ByteBuffer b]
  (let [fid (read-field-id b)]
    (when (not= fid field-terminator)
      (throw (ex-info "consume-object can't skip typed fields; decode explicitly" {:fid fid})))))
